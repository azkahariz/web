import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia untuk verifier lokal.");
if (!/localhost|127\.0\.0\.1/.test(databaseUrl)) throw new Error("verify:product-delete hanya boleh memakai Supabase lokal.");

const sql = postgres(databaseUrl, { ssl: false, max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_PRODUCT_DELETE_${randomUUID()}`;

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function createAuthUser(tx, prefix) {
  const id = randomUUID();
  await tx`
    insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${id}, 'authenticated', 'authenticated', ${`${prefix}-${id}@verify.invalid`}, '',
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
  `;
  return id;
}

async function asAdmin(tx, adminId, query) {
  await tx`set local role authenticated`;
  await tx`select set_config('request.jwt.claim.sub', ${adminId}, true)`;
  try {
    return await query();
  } finally {
    await tx`reset role`;
  }
}

async function preflight(tx, adminId, productId) {
  return asAdmin(tx, adminId, async () => {
    const [row] = await tx`select public.admin_product_delete_preflight(${productId}) as data`;
    return row.data;
  });
}

async function deleteProduct(tx, adminId, productId, token) {
  return asAdmin(tx, adminId, async () => {
    const [row] = await tx`select public.admin_delete_product(${productId}, ${token}) as data`;
    return row.data;
  });
}

function blockerCodes(plan) {
  return new Set((plan.blockers ?? []).map((blocker) => blocker.code));
}

try {
  await sql.begin(async (tx) => {
    const suffix = randomUUID().slice(0, 8);
    const adminId = await createAuthUser(tx, "delete-admin");
    const stationUserId = await createAuthUser(tx, "delete-station");
    await tx`insert into public.super_admins (auth_user_id, username) values (${adminId}, ${`delete-admin-${suffix}`})`;
    const [station] = await tx`insert into public.stations (name) values (${`Delete Station ${suffix}`}) returning id`;
    await tx`insert into public.station_accounts (auth_user_id, station_id, username) values (${stationUserId}, ${station.id}, ${`delete-station-${suffix}`})`;
    const [siteType] = await tx`insert into public.site_types (name) values (${`Delete Type ${suffix}`}) returning id`;
    const [siteSubtype] = await tx`insert into public.site_subtypes (site_type_id, name) values (${siteType.id}, ${`Delete Subtype ${suffix}`}) returning id`;

    let productCounter = 0;
    async function createProduct(label, active = false) {
      productCounter += 1;
      const [row] = await tx`
        insert into public.products (brand, model, active, source_origin, spreadsheet_synced)
        values (${`Delete ${label} ${suffix}`}, ${`Model ${productCounter}`}, ${active}, 'ADMIN', false)
        returning id, brand, model, active
      `;
      return row;
    }

    async function createSubmission(items, { archived = false } = {}) {
      const [site] = await tx`
        insert into public.sites (station_id, site_type_id, name)
        values (${station.id}, ${siteType.id}, ${`Delete Site ${randomUUID()}`}) returning id
      `;
      const payload = {
        siteId: site.id,
        siteSubtypeId: siteSubtype.id,
        metadata: { retained: true },
        inventory: { Sensor: items, Pendukung: [] },
      };
      const [row] = await tx`
        insert into public.submissions (station_id, site_id, site_subtype_id, payload, version, archived_at)
        values (${station.id}, ${site.id}, ${siteSubtype.id}, ${tx.json(payload)}, 3, ${archived ? new Date() : null})
        returning id, payload, version
      `;
      return row;
    }

    const unauthorized = await createProduct("Unauthorized");
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${stationUserId}, true)`;
    await tx.unsafe(`do $$ begin perform public.admin_product_delete_preflight(${literal(unauthorized.id)}::uuid); raise exception 'station_preflight_was_not_blocked'; exception when insufficient_privilege then null; end $$;`);
    await tx.unsafe(`do $$ begin perform public.admin_delete_product(${literal(unauthorized.id)}::uuid, 'invalid'); raise exception 'station_delete_was_not_blocked'; exception when insufficient_privilege then null; end $$;`);
    await tx`reset role`;

    const orphan = await createProduct("Orphan Product");
    const orphanPlan = await preflight(tx, adminId, orphan.id);
    assert.equal(orphanPlan.status, "ready");
    assert.equal(orphanPlan.eligible, true);
    assert.equal(orphanPlan.dependencies.currentCanonicalReferenceCount, 0);
    assert.equal((await deleteProduct(tx, adminId, orphan.id, orphanPlan.preflightToken)).status, "deleted");
    assert.equal((await tx`select count(*)::integer as count from public.products where id = ${orphan.id}`)[0].count, 0);
    assert.equal((await tx`select count(*)::integer as count from public.products where active and id = ${orphan.id}`)[0].count, 0, "Deleted Product tidak boleh tersedia di picker aktif.");
    const [orphanAudit] = await tx`select metadata from public.admin_audit_log where action = 'PRODUCT_DELETE' and target_id = ${orphan.id}`;
    assert.equal(orphanAudit.metadata.product.brand, orphan.brand);
    assert.equal(orphanAudit.metadata.product.model, orphan.model);
    assert.equal(orphanAudit.metadata.previousActive, false);
    assert.equal(orphanAudit.metadata.dependencies.aliasCount, 0);
    assert.equal((await deleteProduct(tx, adminId, orphan.id, orphanPlan.preflightToken)).status, "already_deleted");

    const activeOrphan = await createProduct("Active Orphan", true);
    const activePlan = await preflight(tx, adminId, activeOrphan.id);
    assert.equal(activePlan.status, "blocked");
    assert(blockerCodes(activePlan).has("deactivate_first"));
    await asAdmin(tx, adminId, () => tx`select public.admin_set_product_active(${activeOrphan.id}, false)`);
    const inactivePlan = await preflight(tx, adminId, activeOrphan.id);
    assert.equal(inactivePlan.status, "ready");
    assert.equal((await deleteProduct(tx, adminId, activeOrphan.id, inactivePlan.preflightToken)).status, "deleted");

    const ordinary = await createProduct("Ordinary Toggle", true);
    assert.equal((await asAdmin(tx, adminId, () => tx`select public.admin_set_product_active(${ordinary.id}, false) as changed`))[0].changed, true);
    assert.equal((await asAdmin(tx, adminId, () => tx`select public.admin_set_product_active(${ordinary.id}, true) as changed`))[0].changed, true);

    const direct = await createProduct("Direct Reference");
    await createSubmission([{ id: "direct-one", productId: direct.id, brand: direct.brand, model: direct.model, quantity: 2 }]);
    const directPlan = await preflight(tx, adminId, direct.id);
    assert(blockerCodes(directPlan).has("current_references"));
    assert.equal(directPlan.dependencies.currentDirectReferenceCount, 1);
    assert.equal(directPlan.dependencies.currentCanonicalReferenceCount, 1);

    const multiple = await createProduct("Multiple References");
    await createSubmission([
      { id: "multiple-one", productId: multiple.id, brand: multiple.brand, model: multiple.model },
      { id: "multiple-two", productId: multiple.id, brand: multiple.brand, model: multiple.model },
    ]);
    assert.equal((await preflight(tx, adminId, multiple.id)).dependencies.currentDirectReferenceCount, 2);

    const archived = await createProduct("Archived Reference");
    await createSubmission([{ id: "archived-one", productId: archived.id, brand: archived.brand, model: archived.model }], { archived: true });
    const archivedPlan = await preflight(tx, adminId, archived.id);
    assert(blockerCodes(archivedPlan).has("archived_references"));
    assert.equal(archivedPlan.dependencies.archivedDirectReferenceCount, 1);

    const qc = await createProduct("QC History");
    await tx`
      insert into public.product_proposals (
        station_id, created_by_auth_user, proposed_brand, proposed_model,
        normalized_brand, normalized_model, status, resolved_product_id
      ) values (${station.id}, ${adminId}, 'QC Brand', 'QC Model', 'qcbrand', 'qcmodel', 'APPROVED', ${qc.id})
    `;
    const qcPlan = await preflight(tx, adminId, qc.id);
    assert(blockerCodes(qcPlan).has("qc_history"));
    assert.equal(qcPlan.dependencies.resolvedQcProposalCount, 1);

    const canonical = await createProduct("Canonical Proposal Usage");
    const [canonicalProposal] = await tx`
      insert into public.product_proposals (
        station_id, created_by_auth_user, proposed_brand, proposed_model,
        normalized_brand, normalized_model, status, resolved_product_id
      ) values (${station.id}, ${adminId}, 'Canonical Brand', 'Canonical Model', 'canonicalbrand', 'canonicalmodel', 'MERGED', ${canonical.id})
      returning id
    `;
    await createSubmission([{ id: "proposal-reference", productProposalId: canonicalProposal.id, brand: "Canonical Brand", model: "Canonical Model" }]);
    const canonicalPlan = await preflight(tx, adminId, canonical.id);
    assert.equal(canonicalPlan.dependencies.currentDirectReferenceCount, 0);
    assert.equal(canonicalPlan.dependencies.currentCanonicalReferenceCount, 1);
    assert(blockerCodes(canonicalPlan).has("current_references"));
    assert(blockerCodes(canonicalPlan).has("qc_history"));

    const alias = await createProduct("Alias Dependency");
    await tx`
      insert into public.product_aliases (product_id, brand_alias, model_alias, normalized_brand, normalized_model)
      values (${alias.id}, 'Legacy Alias', ${`Legacy ${suffix}`}, 'legacyalias', ${`legacy${suffix}`})
    `;
    const aliasPlan = await preflight(tx, adminId, alias.id);
    assert(blockerCodes(aliasPlan).has("aliases"));
    assert.equal(aliasPlan.dependencies.aliasCount, 1);

    const cr6Target = await createProduct("Campbell Scientific CR6");
    const cr6Source = await createProduct("Campbell Scientific Datalogger CR6");
    await tx`update public.products set merged_into_product_id = ${cr6Target.id} where id = ${cr6Source.id}`;
    const sourcePlan = await preflight(tx, adminId, cr6Source.id);
    const targetPlan = await preflight(tx, adminId, cr6Target.id);
    assert(blockerCodes(sourcePlan).has("merged_source"), "Datalogger CR6 historical source tidak boleh dihapus.");
    assert(blockerCodes(targetPlan).has("merge_target"), "CR6 canonical target tidak boleh dihapus selama incoming merge ada.");
    assert.equal(targetPlan.dependencies.mergeInboundCount, 1);

    const referenceRace = await createProduct("Reference Race");
    const referenceRacePlan = await preflight(tx, adminId, referenceRace.id);
    await createSubmission([{ id: "reference-after-preflight", productId: referenceRace.id, brand: referenceRace.brand, model: referenceRace.model }]);
    const referenceRaceResult = await deleteProduct(tx, adminId, referenceRace.id, referenceRacePlan.preflightToken);
    assert.equal(referenceRaceResult.status, "state_changed");
    assert.equal((await tx`select count(*)::integer as count from public.products where id = ${referenceRace.id}`)[0].count, 1);

    const aliasRace = await createProduct("Alias Race");
    const aliasRacePlan = await preflight(tx, adminId, aliasRace.id);
    await tx`
      insert into public.product_aliases (product_id, brand_alias, model_alias, normalized_brand, normalized_model)
      values (${aliasRace.id}, 'Race Alias', ${`Race ${suffix}`}, 'racealias', ${`race${suffix}`})
    `;
    assert.equal((await deleteProduct(tx, adminId, aliasRace.id, aliasRacePlan.preflightToken)).status, "state_changed");

    const qcRace = await createProduct("QC Race");
    const qcRacePlan = await preflight(tx, adminId, qcRace.id);
    await tx`
      insert into public.product_proposals (
        station_id, created_by_auth_user, proposed_brand, proposed_model,
        normalized_brand, normalized_model, status, resolved_product_id
      ) values (${station.id}, ${adminId}, 'QC Race', ${suffix}, 'qcrace', ${suffix}, 'APPROVED', ${qcRace.id})
    `;
    assert.equal((await deleteProduct(tx, adminId, qcRace.id, qcRacePlan.preflightToken)).status, "state_changed");

    const activeRace = await createProduct("Active Race");
    const activeRacePlan = await preflight(tx, adminId, activeRace.id);
    await tx`update public.products set active = true where id = ${activeRace.id}`;
    assert.equal((await deleteProduct(tx, adminId, activeRace.id, activeRacePlan.preflightToken)).status, "state_changed");

    const lateFailure = await createProduct("Late Failure");
    const lateFailurePlan = await preflight(tx, adminId, lateFailure.id);
    const triggerFunction = `verify_product_delete_failure_${suffix}`;
    const triggerName = `verify_product_delete_trigger_${suffix}`;
    await tx.unsafe(`create function public.${triggerFunction}() returns trigger language plpgsql as $$ begin if old.id = ${literal(lateFailure.id)}::uuid then raise exception 'forced late delete failure'; end if; return old; end $$`);
    await tx.unsafe(`create trigger ${triggerName} before delete on public.products for each row execute function public.${triggerFunction}()`);
    await asAdmin(tx, adminId, () => tx.unsafe(`do $$ begin perform public.admin_delete_product(${literal(lateFailure.id)}::uuid, ${literal(lateFailurePlan.preflightToken)}); exception when raise_exception then null; end $$;`));
    assert.equal((await tx`select count(*)::integer as count from public.products where id = ${lateFailure.id}`)[0].count, 1, "Late failure harus mempertahankan Product.");
    assert.equal((await tx`select count(*)::integer as count from public.admin_audit_log where action = 'PRODUCT_DELETE' and target_id = ${lateFailure.id}`)[0].count, 0, "Audit harus rollback bersama delete yang gagal.");

    const [deleteAuditCount] = await tx`select count(*)::integer as count from public.admin_audit_log where action = 'PRODUCT_DELETE'`;
    assert.equal(deleteAuditCount.count, 2, "Hanya dua delete sukses yang boleh menulis audit.");
    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}

console.log("Verifikasi delete Product lulus; orphan, active gate, JSON/QC/alias/archive/merge blockers, races, audit, picker/search removal, dan rollback teruji.");
