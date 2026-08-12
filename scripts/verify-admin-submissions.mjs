import postgres from "postgres";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia.");
const isLocal = /localhost|127\.0\.0\.1/.test(databaseUrl);
const sql = postgres(databaseUrl, { ssl: isLocal ? false : "require", max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_ADMIN_SUBMISSIONS_${randomUUID()}`;

function assert(value, message) {
  if (!value) throw new Error(message);
}

function inventory(count) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [
    `Kategori ${index + 1}`,
    [{ id: randomUUID(), brand: "Verifier", model: `Model ${index + 1}`, quantity: 1 }],
  ]));
}

try {
  await sql.begin(async (tx) => {
    const adminAuthId = randomUUID();
    const stationAuthId = randomUUID();
    await tx`insert into auth.users (id, email) values (${adminAuthId}, ${`admin-${adminAuthId}@verify.local`}), (${stationAuthId}, ${`station-${stationAuthId}@verify.local`})`;
    const [station] = await tx`insert into public.stations (name) values (${`VERIFY SUBMISSION ${randomUUID()}`}) returning id`;
    const [siteType] = await tx`insert into public.site_types (name) values (${`VERIFY TYPE ${randomUUID()}`}) returning id`;
    const [profile17] = await tx`insert into public.item_profiles (name) values (${`VERIFY PROFILE 17 ${randomUUID()}`}) returning id`;
    const [profile8] = await tx`insert into public.item_profiles (name) values (${`VERIFY PROFILE 8 ${randomUUID()}`}) returning id`;
    const items = await tx`insert into public.items ${tx(Array.from({ length: 17 }, (_, index) => ({ name: `Kategori ${index + 1}` })))} returning id, name`;
    await tx`insert into public.profile_items ${tx(items.map((item) => ({ item_profile_id: profile17.id, item_id: item.id })))}`;
    await tx`insert into public.profile_items ${tx(items.slice(0, 8).map((item) => ({ item_profile_id: profile8.id, item_id: item.id })))}`;
    const [subtype17] = await tx`insert into public.site_subtypes (site_type_id, item_profile_id, name) values (${siteType.id}, ${profile17.id}, 'VERIFY SUBTYPE 17') returning id`;
    const [subtype8] = await tx`insert into public.site_subtypes (site_type_id, item_profile_id, name) values (${siteType.id}, ${profile8.id}, 'VERIFY SUBTYPE 8') returning id`;
    const sites = await tx`insert into public.sites ${tx(Array.from({ length: 1006 }, (_, index) => ({
      station_id: station.id,
      site_type_id: siteType.id,
      name: `VERIFY SITE ${String(index + 1).padStart(4, "0")}`,
    })))} returning id, name`;
    const payloadEmptyMetadata = { schemaVersion: 1, inventory: {}, siteMetadata: { addressDetail: "Lengkap", latitude: "-6.2" } };
    await tx`insert into public.submissions ${tx(sites.map((site, index) => ({
      station_id: station.id,
      site_id: site.id,
      site_subtype_id: index === 1005 ? subtype8.id : subtype17.id,
      payload: index === 0
        ? { schemaVersion: 1, inventory: inventory(12), siteMetadata: {} }
        : index === 1
          ? { schemaVersion: 1, inventory: inventory(17), siteMetadata: {} }
          : index === 2
            ? payloadEmptyMetadata
            : index === 1005
              ? { schemaVersion: 1, inventory: inventory(4), siteMetadata: {} }
              : { schemaVersion: 1, inventory: {}, siteMetadata: {} },
      version: index === 0 ? 3 : 1,
      operator_name: index === 0 ? "Azka Verifier" : "Verifier",
      last_saved_at: new Date(Date.now() - index * 1000),
    })))} `;
    await tx`insert into public.super_admins (auth_user_id, username) values (${adminAuthId}, 'verify.admin')`;
    await tx`insert into public.station_accounts (auth_user_id, station_id, username) values (${stationAuthId}, ${station.id}, 'verify.station')`;

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${stationAuthId}, true)`;
    await tx.unsafe(`
      do $$
      begin
        perform public.admin_list_submissions();
        raise exception 'station_admin_list_was_not_blocked';
      exception when insufficient_privilege then null;
      end
      $$;
    `);

    await tx`reset role`;
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${adminAuthId}, true)`;

    const [page1] = await tx`select public.admin_list_submissions(1, 50, null, null, null, null, 'ALL', 'ACTIVE') as result`;
    const [page21] = await tx`select public.admin_list_submissions(21, 50, null, null, null, null, 'ALL', 'ACTIVE') as result`;
    assert(page1.result.rows.length === 50 && page1.result.totalCount === 1006, "Page 1 harus 50 row dari 1.006 submission.");
    assert(page21.result.rows.length === 6, "Page 21 harus memuat enam row tanpa truncation 1.000.");
    assert(page1.result.rows.every((row) => !("payload" in row)), "List ringan tidak boleh mengandung payload.");

    const [partialSearch] = await tx`select public.admin_list_submissions(1, 50, 'Azka Verifier', null, null, null, 'ALL', 'ACTIVE') as result`;
    const partial = partialSearch.result.rows[0];
    assert(partialSearch.result.totalCount === 1, "Search operator harus server-side dan menemukan satu row.");
    assert(partial.filled_count === 12 && partial.total_count === 17 && partial.progress_percent === 71 && partial.progress_status === 'Terisi Sebagian', "Progress 12/17 harus 71 persen dan Terisi Sebagian.");
    const [stationSearch] = await tx`select public.admin_list_submissions(1, 50, 'VERIFY SUBMISSION', null, null, null, 'ALL', 'ACTIVE') as result`;
    const [siteSearch] = await tx`select public.admin_list_submissions(1, 50, 'VERIFY SITE 1006', null, null, null, 'ALL', 'ACTIVE') as result`;
    const [subtypeSearch] = await tx`select public.admin_list_submissions(1, 50, 'VERIFY SUBTYPE 8', null, null, null, 'ALL', 'ACTIVE') as result`;
    const [masterFilters] = await tx`select public.admin_list_submissions(1, 50, null, ${station.id}, ${siteType.id}, null, 'ALL', 'ACTIVE') as result`;
    assert(stationSearch.result.totalCount === 1006, "Search Stasiun harus mencakup seluruh submission fixture.");
    assert(siteSearch.result.totalCount === 1, "Search Site harus menemukan satu submission.");
    assert(subtypeSearch.result.totalCount === 1, "Search Subtipe harus menemukan satu submission.");
    assert(masterFilters.result.totalCount === 1006, "Filter Stasiun dan Tipe Site harus diproses server-side.");

    const [completeList] = await tx`select public.admin_list_submissions(1, 50, null, null, null, 'Lengkap', 'ALL', 'ACTIVE') as result`;
    const [emptyList] = await tx`select public.admin_list_submissions(1, 50, null, null, null, 'Kosong', 'ALL', 'ACTIVE') as result`;
    assert(completeList.result.totalCount === 1, "Fixture harus mempunyai satu submission Lengkap.");
    assert(emptyList.result.totalCount === 1003, "Metadata lengkap tidak boleh mengubah 1.003 submission kosong.");

    const [profile8List] = await tx`select public.admin_list_submissions(1, 50, 'VERIFY SITE 1006', null, null, null, 'ALL', 'ACTIVE') as result`;
    const profile8Row = profile8List.result.rows[0];
    assert(profile8Row.filled_count === 4 && profile8Row.total_count === 8, "Subtype profile 8 harus memakai denominator 8.");

    const [detail] = await tx`select public.admin_get_submission_detail(${partial.id}) as result`;
    assert(detail.result.payload.inventory && detail.result.expected_items.length === 17, "Detail lazy harus mengandung satu payload dan 17 expected item.");
    const originalPayload = JSON.stringify(detail.result.payload);
    const originalVersion = detail.result.version;

    const archived = await tx`select public.admin_archive_submission(${partial.id}, 'Fixture test') as archived`;
    assert(archived[0].archived === true, "Archive harus berhasil.");
    const [activeAfterArchive] = await tx`select public.admin_list_submissions(1, 50, null, null, null, null, 'ALL', 'ACTIVE') as result`;
    const [archivedList] = await tx`select public.admin_list_submissions(1, 50, null, null, null, null, 'ALL', 'ARCHIVED') as result`;
    assert(activeAfterArchive.result.totalCount === 1005 && archivedList.result.totalCount === 1, "Archive harus menurunkan count aktif dan muncul di arsip.");
    const [archivedState] = await tx`select id, payload, version from public.submissions where id = ${partial.id}`;
    assert(archivedState.id === partial.id && archivedState.version === originalVersion && JSON.stringify(archivedState.payload) === originalPayload, "Archive harus menjaga UUID, version, dan payload.");

    const restored = await tx`select public.admin_restore_submission(${partial.id}) as restored`;
    assert(restored[0].restored === true, "Restore harus berhasil.");
    const [activeAfterRestore] = await tx`select public.admin_list_submissions(1, 50, null, null, null, null, 'ALL', 'ACTIVE') as result`;
    const [restoredState] = await tx`select id, payload, version, archived_at from public.submissions where id = ${partial.id}`;
    assert(activeAfterRestore.result.totalCount === 1006, "Restore harus menaikkan kembali count aktif.");
    assert(restoredState.id === partial.id && restoredState.version === originalVersion && restoredState.archived_at === null && JSON.stringify(restoredState.payload) === originalPayload, "Restore harus menjaga UUID, version, dan payload.");
    const audit = await tx`select action, metadata from public.admin_audit_log where target_id = ${partial.id} order by created_at`;
    assert(audit.some((row) => row.action === 'SUBMISSION_ARCHIVE') && audit.some((row) => row.action === 'SUBMISSION_RESTORE'), "Audit archive dan restore wajib tersedia.");
    assert(audit.every((row) => !("payload" in row.metadata)), "Audit tidak boleh menyimpan payload.");

    const activeSession = randomUUID();
    await tx`reset role`;
    await tx`update public.submissions set locked_by_session_id = ${activeSession}, lock_last_activity_at = now() where id = ${partial.id}`;
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${adminAuthId}, true)`;
    await tx.unsafe(`
      do $$
      begin
        perform public.admin_archive_submission('${partial.id}'::uuid, 'Must fail');
        raise exception 'active_lock_archive_was_not_blocked';
      exception when sqlstate '55000' then null;
      end
      $$;
    `);
    const [stillActive] = await tx`select archived_at from public.submissions where id = ${partial.id}`;
    assert(stillActive.archived_at === null, "Archive harus ditolak selama editor lock masih aktif.");

    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}

console.log("Verifikasi monitoring submission lulus; 1.006 fixture database telah di-rollback.");
