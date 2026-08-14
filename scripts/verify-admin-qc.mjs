import postgres from "postgres";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia.");
const isLocal = /localhost|127\.0\.0\.1/.test(databaseUrl);
const sql = postgres(databaseUrl, { ssl: isLocal ? false : "require", max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_ADMIN_QC_${randomUUID()}`;

function assert(value, message) {
  if (!value) throw new Error(message);
}

try {
  await sql.begin(async (tx) => {
    let [admin] = await tx`select auth_user_id from public.super_admins where active order by created_at limit 1`;
    if (!admin) {
      const authUserId = randomUUID();
      await tx`
        insert into auth.users (
          id, aud, role, email, encrypted_password, confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) values (
          ${authUserId}, 'authenticated', 'authenticated', ${`admin-${authUserId}@verify.invalid`}, '', now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
        )
      `;
      await tx`insert into public.super_admins (auth_user_id, username) values (${authUserId}, ${`verify-admin-${authUserId}`})`;
      admin = { auth_user_id: authUserId };
    }

    let [scope] = await tx`
      select account.auth_user_id, account.station_id, site.id as site_id, subtype.id as subtype_id
      from public.station_accounts as account
      join public.sites as site on site.station_id = account.station_id and site.active
      join public.site_subtypes as subtype on subtype.site_type_id = site.site_type_id and subtype.active
      where account.active
      order by account.created_at, site.name, subtype.name
      limit 1
    `;
    if (!scope) {
      const [station] = await tx`insert into public.stations (name) values (${`VERIFY QC ${randomUUID()}`}) returning id`;
      await tx`insert into public.stations (name) values (${`VERIFY QC ADMIN ${randomUUID()}`})`;
      const [siteType] = await tx`insert into public.site_types (name) values (${`VERIFY QC TYPE ${randomUUID()}`}) returning id`;
      const [site] = await tx`insert into public.sites (station_id, site_type_id, name) values (${station.id}, ${siteType.id}, ${`VERIFY QC SITE ${randomUUID()}`}) returning id`;
      const [otherSite] = await tx`insert into public.sites (station_id, site_type_id, name) values (${station.id}, ${siteType.id}, ${`VERIFY QC SITE OTHER ${randomUUID()}`}) returning id`;
      const [subtype] = await tx`insert into public.site_subtypes (site_type_id, name) values (${siteType.id}, ${`VERIFY QC SUBTYPE ${randomUUID()}`}) returning id`;
      const [otherSubtype] = await tx`insert into public.site_subtypes (site_type_id, name) values (${siteType.id}, ${`VERIFY QC SUBTYPE OTHER ${randomUUID()}`}) returning id`;
      const authUserId = randomUUID();
      await tx`
        insert into auth.users (
          id, aud, role, email, encrypted_password, confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) values (
          ${authUserId}, 'authenticated', 'authenticated', ${`station-${authUserId}@verify.invalid`}, '', now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
        )
      `;
      await tx`insert into public.station_accounts (auth_user_id, station_id, username) values (${authUserId}, ${station.id}, ${`verify-station-${authUserId}`})`;
      scope = {
        auth_user_id: authUserId,
        station_id: station.id,
        site_id: site.id,
        subtype_id: subtype.id,
        other_site_id: otherSite.id,
        other_subtype_id: otherSubtype.id,
      };
    }
    let [canonical] = await tx`
      select id from public.products
      where lower(brand) = 'campbell scientific' and lower(model) = 'cr1000x' and active
      limit 1
    `;
    if (!canonical) {
      [canonical] = await tx`
        insert into public.products (brand, model, active, source_origin, spreadsheet_synced)
        values ('Campbell Scientific', 'CR1000X', true, 'SPREADSHEET', true)
        returning id
      `;
    }
    const stationSession = randomUUID();
    const adminSession = randomUUID();

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${scope.auth_user_id}, true)`;
    const stationAdminFlag = await tx`select public.is_super_admin() as allowed`;
    assert(stationAdminFlag[0]?.allowed === false, "Station user tidak boleh dianggap Super Admin.");
    const stationOpen = await tx`select * from public.open_submission(${scope.site_id}, ${scope.subtype_id}, ${stationSession}, 'Verifier Station')`;
    assert(stationOpen[0]?.can_edit === true, "Station user gagal memperoleh lock awal.");

    await tx.unsafe(`
      do $$
      begin
        perform public.admin_force_release_submission('${stationOpen[0].submission_id}'::uuid);
        raise exception 'station_admin_rpc_was_not_blocked';
      exception when insufficient_privilege then null;
      end
      $$;
    `);

    const rawProposals = [
      ["Campbel", "CR 1000 X", "merge-single"],
      ["Campbell", "CR-1000X", "bulk-1"],
      ["CAMPBELL SCIENTIFIC", "CR 1000 X", "bulk-2"],
      ["Campbel Scientific", "CR1000-X", "bulk-3"],
      ["Verifier Brand Baru", `Model-${randomUUID().slice(0, 8)}`, "approve"],
      ["Produk Salah", "Tidak Valid", "reject"],
    ];
    const proposalIds = {};
    for (const [brand, model, key] of rawProposals) {
      const rows = await tx`select * from public.create_product_proposal(${scope.site_id}, ${scope.subtype_id}, ${brand}, ${model}, 'Verifier Station', ${key})`;
      proposalIds[key] = rows[0].proposal_id;
    }
    const pending = await tx`select count(*)::integer as count from public.product_proposals where id = any(${Object.values(proposalIds)}::uuid[]) and status = 'PENDING'`;
    assert(pending[0]?.count === 6, "Seluruh raw proposal harus tersimpan sebagai Pending.");

    await tx`reset role`;
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${admin.auth_user_id}, true)`;
    const adminFlag = await tx`select public.is_super_admin() as allowed`;
    assert(adminFlag[0]?.allowed === true, "Super Admin tidak dikenali database.");
    const allStations = await tx`select id from public.stations where active limit 2`;
    assert(allStations.length === 2, "Super Admin harus dapat melihat lintas stasiun.");

    const released = await tx`select public.admin_force_release_submission(${stationOpen[0].submission_id}) as released`;
    assert(released[0]?.released === true, "Admin force release gagal.");
    const takeover = await tx`select * from public.admin_force_takeover_submission(${stationOpen[0].submission_id}, ${adminSession}, 'Verifier Admin')`;
    assert(takeover[0]?.acquired === true, "Admin force takeover gagal.");
    const adminSaved = await tx`
      select * from public.admin_save_submission(
        ${stationOpen[0].submission_id}, ${adminSession}, ${takeover[0].version},
        ${tx.json({
          schemaVersion: 1,
          inventory: {
            adminVerifier: true,
            Produk: Object.values(proposalIds).map((proposalId, index) => ({ id: `qc-${index}`, productProposalId: proposalId })),
          },
        })}, 'Verifier Admin'
      )
    `;
    assert(adminSaved[0]?.status === "saved", "Admin edit submission gagal disimpan.");
    const adminState = await tx`select * from public.admin_get_submission_state(${stationOpen[0].submission_id})`;
    assert(adminState[0]?.payload?.inventory?.adminVerifier === true, "Payload edit admin tidak terbaca kembali.");
    const staleAdminSave = await tx`
      select * from public.admin_save_submission(
        ${stationOpen[0].submission_id}, ${adminSession}, ${takeover[0].version},
        ${tx.json({ schemaVersion: 1, inventory: { stale: true } })}, 'Verifier Admin'
      )
    `;
    assert(staleAdminSave[0]?.status === "version_conflict", "Admin tetap harus tunduk pada version checking.");

    const merged = await tx`select public.admin_merge_product_proposals(array[${proposalIds["merge-single"]}]::uuid[], ${canonical.id}, 'same product') as count`;
    assert(merged[0]?.count === 1, "Single merge gagal.");
    const bulkIds = [proposalIds["bulk-1"], proposalIds["bulk-2"], proposalIds["bulk-3"]];
    const bulk = await tx`select public.admin_merge_product_proposals(${bulkIds}::uuid[], ${canonical.id}, 'bulk variants') as count`;
    assert(bulk[0]?.count === 3, "Bulk merge tiga variasi gagal.");
    const approved = await tx`select public.admin_approve_product_proposal(${proposalIds.approve}, 'Verifier Canonical Brand', ${rawProposals[4][1]}, 'new product') as product_id`;
    const approvedProductId = approved[0]?.product_id;
    assert(approvedProductId, "Approve produk baru gagal.");
    const rejected = await tx`select public.admin_reject_product_proposal(${proposalIds.reject}, 'Data produk tidak valid') as rejected`;
    assert(rejected[0]?.rejected === true, "Reject proposal gagal.");

    const proposalStates = await tx`select status, count(*)::integer as count from public.product_proposals where id = any(${Object.values(proposalIds)}::uuid[]) group by status`;
    const stateMap = new Map(proposalStates.map((row) => [row.status, row.count]));
    assert(stateMap.get("MERGED") === 4 && stateMap.get("APPROVED") === 1 && stateMap.get("REJECTED") === 1, "Status QC tidak sesuai.");
    const aliases = await tx`select count(*)::integer as count from public.product_aliases where source_proposal_id = any(${Object.values(proposalIds)}::uuid[])`;
    assert(aliases[0]?.count === 5, "Merge dan approve harus menyimpan alias raw.");
    const qcProduct = await tx`select source_origin, spreadsheet_synced, active from public.products where id = ${approvedProductId}`;
    assert(qcProduct[0]?.source_origin === "QC" && qcProduct[0]?.spreadsheet_synced === false && qcProduct[0]?.active === true, "Produk QC baru harus live dan menunggu rekonsiliasi Spreadsheet.");
    const auditActions = await tx`select action from public.admin_audit_log where target_id = ${stationOpen[0].submission_id} or target_id = any(${Object.values(proposalIds)}::uuid[]) or target_id = ${canonical.id}`;
    const actions = new Set(auditActions.map((row) => row.action));
    for (const action of ["FORCE_RELEASE_LOCK", "FORCE_TAKEOVER_LOCK", "QC_MERGE", "QC_BULK_MERGE", "QC_APPROVE", "QC_REJECT"]) {
      assert(actions.has(action), `Audit ${action} tidak ditemukan.`);
    }

    await tx`reset role`;
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${scope.auth_user_id}, true)`;
    const liveProduct = await tx`select id from public.products where id = ${approvedProductId}`;
    assert(liveProduct.length === 1, "Produk approved harus langsung terlihat oleh station user.");
    const rejectedRaw = await tx`select proposed_brand, proposed_model, review_note from public.product_proposals where id = ${proposalIds.reject}`;
    assert(rejectedRaw[0]?.proposed_brand === "Produk Salah" && rejectedRaw[0]?.review_note, "Reject tidak boleh menghapus raw input.");

    await tx`reset role`;
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${admin.auth_user_id}, true)`;
    await tx`select public.admin_force_release_submission(${stationOpen[0].submission_id})`;

    await tx`reset role`;
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${scope.auth_user_id}, true)`;
    const cleanupSession = randomUUID();
    const cleanupOpen = await tx`select * from public.open_submission(${scope.site_id}, ${scope.subtype_id}, ${cleanupSession}, 'Verifier Cleanup')`;
    assert(cleanupOpen[0]?.can_edit === true, "Station user gagal memperoleh lock untuk verifikasi cleanup.");

    const createPending = async (brand, model, note) => {
      const rows = await tx`select * from public.create_product_proposal(${scope.site_id}, ${scope.subtype_id}, ${brand}, ${model}, 'Verifier Cleanup', ${note})`;
      return rows[0]?.proposal_id;
    };
    const singleProposalId = await createPending('Cleanup Single', `Model-${randomUUID().slice(0, 8)}`, 'cleanup-single');
    const sharedProposalId = await createPending('Cleanup Shared', `Model-${randomUUID().slice(0, 8)}`, 'cleanup-shared');
    assert(singleProposalId && sharedProposalId, "Proposal cleanup harus dibuat sebagai Pending.");

    const firstCleanupSave = await tx`
      select * from public.save_submission(
        ${scope.site_id}, ${scope.subtype_id}, ${cleanupSession}, ${cleanupOpen[0].version},
        ${tx.json({ inventory: {
          Sensor: [{ id: 'single', productProposalId: singleProposalId }, { id: 'shared-a', productProposalId: sharedProposalId }],
          Radio: [{ id: 'shared-b', productProposalId: sharedProposalId }],
        } })}, 'Verifier Cleanup'
      )
    `;
    assert(firstCleanupSave[0]?.status === 'saved', "Save awal cleanup gagal.");

    let otherScope = scope.other_site_id
      ? { site_id: scope.other_site_id, subtype_id: scope.other_subtype_id }
      : null;
    if (!otherScope) {
      [otherScope] = await tx`
        select site.id as site_id, subtype.id as subtype_id
        from public.sites as site
        join public.site_subtypes as subtype on subtype.site_type_id = site.site_type_id and subtype.active
        where site.station_id = ${scope.station_id}
          and site.active
          and (site.id <> ${scope.site_id} or subtype.id <> ${scope.subtype_id})
        order by site.name, subtype.name
        limit 1
      `;
    }
    assert(otherScope, "Scope submission kedua untuk verifikasi cleanup tidak tersedia.");
    const otherOpen = await tx`select * from public.open_submission(${otherScope.site_id}, ${otherScope.subtype_id}, ${randomUUID()}, 'Verifier Other')`;
    assert(otherOpen[0]?.submission_id, "Submission kedua tidak dapat dibuka.");
    const otherProposalRows = await tx`select * from public.create_product_proposal(${otherScope.site_id}, ${otherScope.subtype_id}, 'Cleanup Other', ${`Model-${randomUUID().slice(0, 8)}`}, 'Verifier Other', 'cleanup-other')`;
    const otherProposalId = otherProposalRows[0]?.proposal_id;
    assert(otherProposalId, "Proposal submission lain harus dibuat.");

    const secondCleanupSave = await tx`
      select * from public.save_submission(
        ${scope.site_id}, ${scope.subtype_id}, ${cleanupSession}, ${firstCleanupSave[0].version},
        ${tx.json({ inventory: { Sensor: [{ id: 'shared-a', productProposalId: sharedProposalId }] } })}, 'Verifier Cleanup'
      )
    `;
    assert(secondCleanupSave[0]?.status === 'saved', "Save setelah menghapus satu referensi gagal.");
    const [afterOneDeleted] = await tx`
      select
        exists(select 1 from public.product_proposals where id = ${singleProposalId}) as single_exists,
        exists(select 1 from public.product_proposals where id = ${sharedProposalId} and status = 'PENDING') as shared_exists,
        exists(select 1 from public.product_proposals where id = ${otherProposalId} and status = 'PENDING') as other_exists
    `;
    assert(!afterOneDeleted.single_exists && afterOneDeleted.shared_exists && afterOneDeleted.other_exists, "Cleanup harus menghapus hanya proposal Pending yang referensinya habis pada submission sendiri.");

    const thirdCleanupSave = await tx`
      select * from public.save_submission(
        ${scope.site_id}, ${scope.subtype_id}, ${cleanupSession}, ${secondCleanupSave[0].version},
        ${tx.json({ inventory: { Sensor: [{ id: 'pending-local', productProposalId: 'PENDING_LOCAL' }] } })}, 'Verifier Cleanup'
      )
    `;
    assert(thirdCleanupSave[0]?.status === 'saved', "Save setelah menghapus referensi terakhir gagal.");
    const [afterLastDeleted] = await tx`
      select
        exists(select 1 from public.product_proposals where id = ${sharedProposalId}) as shared_exists,
        exists(select 1 from public.product_proposals where id = ${proposalIds.approve} and status = 'APPROVED') as approved_exists,
        exists(select 1 from public.product_proposals where id = ${proposalIds['merge-single']} and status = 'MERGED') as merged_exists,
        exists(select 1 from public.products where id = ${approvedProductId}) as approved_product_exists,
        exists(select 1 from public.product_aliases where source_proposal_id = ${proposalIds.approve}) as approved_alias_exists,
        exists(select 1 from public.product_aliases where source_proposal_id = ${proposalIds['merge-single']}) as merged_alias_exists
    `;
    assert(!afterLastDeleted.shared_exists, "Proposal Pending harus hilang setelah referensi terakhir dihapus.");
    assert(afterLastDeleted.approved_exists && afterLastDeleted.merged_exists, "Proposal APPROVED dan MERGED harus tetap menjadi history.");
    assert(afterLastDeleted.approved_product_exists && afterLastDeleted.approved_alias_exists && afterLastDeleted.merged_alias_exists, "Produk canonical dan alias tidak boleh dihapus oleh cleanup.");

    const retryCleanupSave = await tx`
      select * from public.save_submission(
        ${scope.site_id}, ${scope.subtype_id}, ${cleanupSession}, ${thirdCleanupSave[0].version},
        ${tx.json({ inventory: { Sensor: [{ id: 'pending-local', productProposalId: 'PENDING_LOCAL' }] } })}, 'Verifier Cleanup'
      )
    `;
    assert(retryCleanupSave[0]?.status === 'saved', "Retry autosave cleanup harus tetap idempotent.");
    await tx.unsafe(`
      do $$
      begin
        perform public.reconcile_pending_product_proposals(
          '${scope.station_id}'::uuid,
          '${cleanupOpen[0].submission_id}'::uuid,
          '{}'::jsonb
        );
        raise exception 'station_cleanup_helper_was_not_blocked';
      exception when insufficient_privilege then null;
      end
      $$;
    `);

    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}

console.log("Verifikasi Super Admin dan Product QC lulus; seluruh fixture database telah di-rollback.");
