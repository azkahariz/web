import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { buildInventoryCsv, buildInventoryJson } from "../app/lib/inventory-export.ts";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia untuk verifier lokal.");
if (!/localhost|127\.0\.0\.1/.test(databaseUrl)) throw new Error("verify:product-reference-removal hanya boleh memakai Supabase lokal.");

const sql = postgres(databaseUrl, { ssl: false, max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_PRODUCT_REFERENCE_REMOVAL_${randomUUID()}`;

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function findItem(payload, itemId) {
  return Object.values(payload.inventory ?? {}).flat().find((item) => item.id === itemId);
}

function withoutLinks(item) {
  const value = structuredClone(item);
  delete value.productId;
  delete value.productProposalId;
  return value;
}

function directReference(submission, storageCategory, itemOrdinal, itemId, version = submission.version) {
  return { referenceType: "DIRECT", submissionId: submission.id, expectedSubmissionVersion: version, storageCategory, itemOrdinal, itemId };
}

function qcReference(submission, storageCategory, itemOrdinal, itemId, proposal, version = submission.version) {
  return {
    referenceType: "QC_RESULT",
    submissionId: submission.id,
    expectedSubmissionVersion: version,
    storageCategory,
    itemOrdinal,
    itemId,
    proposalId: proposal.id,
    expectedProposalUpdatedAt: proposal.updated_at.toISOString(),
  };
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

async function callPreflight(tx, adminId, sourceId, references) {
  return asAdmin(tx, adminId, async () => {
    const [row] = await tx`select public.admin_product_reference_removal_preflight(${sourceId}, ${tx.json(references)}) as data`;
    return row.data;
  });
}

async function callRemove(tx, adminId, sourceId, references) {
  return asAdmin(tx, adminId, async () => {
    const [row] = await tx`select public.admin_remove_product_references(${sourceId}, ${tx.json(references)}) as data`;
    return row.data;
  });
}

async function callEnrichment(tx, adminId, productId) {
  return asAdmin(tx, adminId, async () => {
    const [row] = await tx`select * from public.admin_product_page_enrichment(array[${productId}]::uuid[])`;
    return row;
  });
}

async function callReferences(tx, adminId, productId, page = 1, pageSize = 50) {
  return asAdmin(tx, adminId, async () => {
    const [row] = await tx`select public.admin_product_reference_occurrences(${productId}, ${page}, ${pageSize}, null) as data`;
    return row.data;
  });
}

async function callFilterIds(tx, adminId, categories, stationCategoryId = null, siteTypeId = null) {
  return asAdmin(tx, adminId, async () => {
    const [row] = await tx`select public.admin_product_reference_filter_ids(${categories}::text[], ${stationCategoryId}::uuid, ${siteTypeId}::uuid) as data`;
    return row.data;
  });
}

async function callDependencies(tx, adminId, productId) {
  return asAdmin(tx, adminId, async () => {
    const [row] = await tx`select public.admin_product_dependencies(${productId}) as data`;
    return row.data;
  });
}

try {
  await sql.begin(async (tx) => {
    const suffix = randomUUID().slice(0, 8);
    const adminId = await createAuthUser(tx, "remove-admin");
    const stationUserId = await createAuthUser(tx, "remove-station");
    await tx`insert into public.super_admins (auth_user_id, username) values (${adminId}, ${`remove-admin-${suffix}`})`;

    let [stationCategory] = await tx`select id from public.station_categories where active order by id limit 1`;
    if (!stationCategory) {
      [stationCategory] = await tx`insert into public.station_categories (code, name, active) values (${`REMOVE-${suffix}`}, ${`Remove ${suffix}`}, true) returning id`;
    }
    const [station] = await tx`insert into public.stations (name, station_category_id) values (${`Remove Station ${suffix}`}, ${stationCategory.id}) returning id`;
    await tx`insert into public.station_accounts (auth_user_id, station_id, username) values (${stationUserId}, ${station.id}, ${`remove-station-${suffix}`})`;
    const [siteType] = await tx`insert into public.site_types (name) values (${`Remove Type ${suffix}`}) returning id`;
    const [siteSubtype] = await tx`insert into public.site_subtypes (site_type_id, name) values (${siteType.id}, ${`Remove Subtype ${suffix}`}) returning id`;
    const [source] = await tx`insert into public.products (brand, model, active, source_origin, spreadsheet_synced) values ('Remove Source', ${`Model ${suffix}`}, true, 'ADMIN', false) returning id, brand, model, active`;
    const [other] = await tx`insert into public.products (brand, model, active, source_origin, spreadsheet_synced) values ('Remove Other', ${`Model ${suffix}`}, true, 'ADMIN', false) returning id, brand, model, active`;

    async function createSubmission(inventory, options = {}) {
      const [site] = await tx`insert into public.sites (station_id, site_type_id, name) values (${station.id}, ${siteType.id}, ${`Remove Site ${randomUUID()}`}) returning id`;
      const payload = { siteId: site.id, siteSubtypeId: siteSubtype.id, metadata: { retained: true }, inventory };
      const [submission] = await tx`
        insert into public.submissions (station_id, site_id, site_subtype_id, payload, version, archived_at)
        values (${station.id}, ${site.id}, ${siteSubtype.id}, ${tx.json(payload)}, ${options.version ?? 0}, ${options.archived ? new Date() : null})
        returning id, station_id, site_id, version, payload
      `;
      if (options.lockAgeMinutes !== undefined) {
        await tx`update public.submissions set locked_by_session_id = ${randomUUID()}, lock_operator_name = 'Verifier Lock', lock_last_activity_at = now() - (${options.lockAgeMinutes} * interval '1 minute') where id = ${submission.id}`;
      }
      return submission;
    }

    async function createProposal(submission, label, status = "APPROVED") {
      const [proposal] = await tx`
        insert into public.product_proposals (station_id, submission_id, created_by_auth_user, proposed_brand, proposed_model, normalized_brand, normalized_model, status, resolved_product_id, reviewed_by, reviewed_at, review_note)
        values (${station.id}, ${submission.id}, ${stationUserId}, ${`Historical ${label}`}, ${`Model ${label}`}, ${`historical ${label}`}, ${`model ${label}`}, ${status}, ${source.id}, ${adminId}, now(), ${`QC note ${label}`})
        returning id, submission_id, status, resolved_product_id, reviewed_by, reviewed_at, review_note, updated_at
      `;
      return proposal;
    }

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${stationUserId}, true)`;
    await tx.unsafe(`do $$ begin perform public.admin_product_reference_removal_preflight(${literal(source.id)}::uuid, '[]'::jsonb); raise exception 'station_remove_preflight_was_not_blocked'; exception when insufficient_privilege then null; end $$;`);
    await tx.unsafe(`do $$ begin perform public.admin_remove_product_references(${literal(source.id)}::uuid, '[]'::jsonb); raise exception 'station_remove_was_not_blocked'; exception when insufficient_privilege then null; end $$;`);
    await tx`reset role`;

    const directRemove = { id: "direct-remove", productId: source.id, brand: source.brand, model: source.model, quantity: 2, functionCategories: ["Remove Last Category"], notes: "retain" };
    const directKeep = { id: "direct-keep", productId: source.id, brand: source.brand, model: source.model, units: [{ serialNumber: "A" }], functionCategories: ["Shared Category"] };
    const sibling = { id: "sibling", productId: other.id, brand: other.brand, model: other.model, notes: "untouched" };
    const directSubmission = await createSubmission({ Sensor: [directRemove, directKeep, sibling], Empty: [] }, { version: 4 });
    assert.equal((await callPreflight(tx, adminId, source.id, [directReference(directSubmission, "Sensor", 1, directRemove.id)])).status, "ready");
    assert.equal((await callEnrichment(tx, adminId, source.id)).reference_count, 2);
    const directResult = await callRemove(tx, adminId, source.id, [directReference(directSubmission, "Sensor", 1, directRemove.id)]);
    assert.equal(directResult.status, "removed");
    const [directAfter] = await tx`select payload, version from public.submissions where id = ${directSubmission.id}`;
    assert.equal(directAfter.version, 5);
    assert.equal(findItem(directAfter.payload, directRemove.id).productId, undefined);
    assert.deepEqual(withoutLinks(findItem(directAfter.payload, directRemove.id)), withoutLinks(directRemove));
    assert.deepEqual(findItem(directAfter.payload, directKeep.id), directKeep);
    assert.deepEqual(findItem(directAfter.payload, sibling.id), sibling);
    assert.deepEqual(directAfter.payload.inventory.Empty, []);
    const exportContext = {
      stationName: "Verifier Station",
      siteName: "Verifier Site",
      siteTypeName: "Verifier Type",
      subtypeName: "Verifier Subtype",
      profile: "Verifier Profile",
      categories: ["Remove Last Category"],
      payload: directAfter.payload,
    };
    const exportedProduct = buildInventoryJson(exportContext).items[0].products.find((item) => item.id === directRemove.id);
    assert.equal(exportedProduct.productId, undefined, "Current export tidak boleh membawa canonical link yang sudah dilepas.");
    assert.deepEqual({ brand: exportedProduct.brand, model: exportedProduct.model }, { brand: source.brand, model: source.model }, "Current export tetap mempertahankan snapshot historis item.");
    assert.match(buildInventoryCsv(exportContext), new RegExp(`${source.brand}.*${source.model}`));
    const directProjection = await callEnrichment(tx, adminId, source.id);
    assert.equal(directProjection.reference_count, 1);
    assert.equal((await callReferences(tx, adminId, source.id)).totalCount, directProjection.reference_count);
    assert.ok(!directProjection.categories.includes("Remove Last Category"));
    assert.ok(directProjection.categories.includes("Shared Category"));
    assert.ok(!(await callFilterIds(tx, adminId, ["Remove Last Category"])).includes(source.id));
    assert.ok((await callFilterIds(tx, adminId, ["Shared Category"], stationCategory.id, siteType.id)).includes(source.id));

    const qcSubmission = await createSubmission({ QC: [] }, { version: 7 });
    const proposal = await createProposal(qcSubmission, "single");
    const qcItem = { id: "qc-remove", productProposalId: proposal.id, brand: "Historical single", model: "Model single", functionCategories: ["QC Category"], notes: "history snapshot" };
    await tx`update public.submissions set payload = jsonb_set(payload, '{inventory,QC}', ${tx.json([qcItem])}) where id = ${qcSubmission.id}`;
    const qcSelection = qcReference(qcSubmission, "QC", 1, qcItem.id, proposal);
    const qcRowsBefore = await callReferences(tx, adminId, source.id, 1, 50);
    const qcProjectionBefore = await callEnrichment(tx, adminId, source.id);
    assert.equal(qcRowsBefore.totalCount, qcProjectionBefore.reference_count);
    assert.ok(qcRowsBefore.rows.some((row) => row.referenceType === "QC_RESULT" && row.itemId === qcItem.id && row.storageCategory === "QC" && row.itemOrdinal === 1));
    const qcBefore = await tx`select * from public.product_proposals where id = ${proposal.id}`;
    assert.equal((await callRemove(tx, adminId, source.id, [qcSelection])).status, "removed");
    const [qcSubmissionAfter] = await tx`select payload, version from public.submissions where id = ${qcSubmission.id}`;
    assert.equal(qcSubmissionAfter.version, 8);
    assert.equal(findItem(qcSubmissionAfter.payload, qcItem.id).productProposalId, undefined);
    assert.deepEqual(withoutLinks(findItem(qcSubmissionAfter.payload, qcItem.id)), withoutLinks(qcItem));
    const qcAfter = await tx`select * from public.product_proposals where id = ${proposal.id}`;
    for (const field of ["id", "submission_id", "status", "resolved_product_id", "reviewed_by", "reviewed_at", "review_note", "proposed_brand", "proposed_model"]) assert.deepEqual(qcAfter[0][field], qcBefore[0][field], `Proposal field ${field} harus tetap.`);
    const qcRowsAfter = await callReferences(tx, adminId, source.id, 1, 50);
    const qcProjectionAfter = await callEnrichment(tx, adminId, source.id);
    assert.equal(qcRowsAfter.totalCount, qcProjectionAfter.reference_count);
    assert.ok(!qcRowsAfter.rows.some((row) => row.referenceId === qcRowsBefore.rows.find((row) => row.itemId === qcItem.id)?.referenceId));
    assert.ok(!qcProjectionAfter.categories.includes("QC Category"));
    const dependencyAfterQcRemoval = await callDependencies(tx, adminId, source.id);
    assert.equal(dependencyAfterQcRemoval.preflight.resolvedQcProposalCount, 1, "QC history tetap menjadi dependency historis.");
    assert.ok(dependencyAfterQcRemoval.qcProposals.some((row) => row.proposalId === proposal.id));

    const [filterProduct] = await tx`insert into public.products (brand, model, active, source_origin, spreadsheet_synced) values ('Filter Remove', ${`Model ${suffix}`}, true, 'ADMIN', false) returning id`;
    const filterSubmission = await createSubmission({ "Only Category": [{ id: "filter-only", productId: filterProduct.id, functionCategories: ["Only Category"] }] }, { version: 1 });
    assert.ok((await callFilterIds(tx, adminId, ["Only Category"], stationCategory.id, siteType.id)).includes(filterProduct.id));
    assert.equal((await callRemove(tx, adminId, filterProduct.id, [directReference(filterSubmission, "Only Category", 1, "filter-only")])).status, "removed");
    assert.ok(!(await callFilterIds(tx, adminId, ["Only Category"])).includes(filterProduct.id), "Kategori terakhir harus hilang dari filter.");
    assert.ok(!(await callFilterIds(tx, adminId, [], stationCategory.id, null)).includes(filterProduct.id), "Station group terakhir harus hilang dari filter.");
    assert.ok(!(await callFilterIds(tx, adminId, [], null, siteType.id)).includes(filterProduct.id), "Site Type terakhir harus hilang dari filter.");

    const mixedSubmission = await createSubmission({ Mixed: [{ id: "mixed-direct", productId: source.id, brand: source.brand, model: source.model }] }, { version: 2 });
    const mixedProposal = await createProposal(mixedSubmission, "mixed", "MERGED");
    const mixedPayload = structuredClone(mixedSubmission.payload);
    mixedPayload.inventory.Mixed.push({ id: "mixed-qc", productProposalId: mixedProposal.id, brand: "Historical mixed", model: "Model mixed" });
    await tx`update public.submissions set payload = ${tx.json(mixedPayload)} where id = ${mixedSubmission.id}`;
    const mixedResult = await callRemove(tx, adminId, source.id, [
      directReference(mixedSubmission, "Mixed", 1, "mixed-direct"),
      qcReference(mixedSubmission, "Mixed", 2, "mixed-qc", mixedProposal),
    ]);
    assert.equal(mixedResult.status, "removed");
    const [mixedAfter] = await tx`select payload, version from public.submissions where id = ${mixedSubmission.id}`;
    assert.equal(mixedAfter.version, 3, "Mixed batch pada satu Submission hanya menaikkan version sekali.");
    assert.equal(findItem(mixedAfter.payload, "mixed-direct").productId, undefined);
    assert.equal(findItem(mixedAfter.payload, "mixed-qc").productProposalId, undefined);

    const staleA = await createSubmission({ Sensor: [{ id: "stale-a", productId: source.id }] }, { version: 3 });
    const staleB = await createSubmission({ Sensor: [{ id: "stale-b", productId: source.id }] }, { version: 5 });
    const staleResult = await callRemove(tx, adminId, source.id, [directReference(staleA, "Sensor", 1, "stale-a"), directReference(staleB, "Sensor", 1, "stale-b", 4)]);
    assert.equal(staleResult.status, "version_conflict");
    const staleRows = await tx`select payload, version from public.submissions where id in (${staleA.id}, ${staleB.id})`;
    assert.ok(staleRows.every((row) => Object.values(row.payload.inventory).flat()[0].productId === source.id));

    const changed = await createSubmission({ Sensor: [{ id: "changed", productId: source.id }, { id: "neighbor", productId: source.id }] }, { version: 1 });
    const changedSelection = directReference(changed, "Sensor", 1, "changed");
    await tx`update public.submissions set payload = jsonb_set(payload, '{inventory,Sensor,0,productId}', to_jsonb(${other.id}::text), false) where id = ${changed.id}`;
    assert.equal((await callRemove(tx, adminId, source.id, [changedSelection])).status, "source_mismatch");
    const [changedAfter] = await tx`select payload from public.submissions where id = ${changed.id}`;
    assert.equal(findItem(changedAfter.payload, "neighbor").productId, source.id);

    const locked = await createSubmission({ Sensor: [{ id: "locked", productId: source.id }] }, { version: 1, lockAgeMinutes: 1 });
    assert.equal((await callRemove(tx, adminId, source.id, [directReference(locked, "Sensor", 1, "locked")])).status, "active_lock");
    const expired = await createSubmission({ Sensor: [{ id: "expired", productId: source.id }] }, { version: 1, lockAgeMinutes: 6 });
    assert.equal((await callRemove(tx, adminId, source.id, [directReference(expired, "Sensor", 1, "expired")])).status, "removed");

    const repeat = await createSubmission({ Sensor: [{ id: "repeat", productId: source.id }] }, { version: 9 });
    const repeatSelection = [directReference(repeat, "Sensor", 1, "repeat")];
    assert.equal((await callRemove(tx, adminId, source.id, repeatSelection)).status, "removed");
    assert.equal((await callRemove(tx, adminId, source.id, repeatSelection)).status, "version_conflict");
    const [repeatAudit] = await tx`select count(*)::integer as count from public.admin_audit_log where action = 'PRODUCT_REFERENCE_REMOVE' and target_type = 'submission' and target_id = ${repeat.id}`;
    assert.equal(repeatAudit.count, 1, "Double submit tidak boleh membuat audit success kedua.");

    const resurrection = await createSubmission({ Sensor: [{ id: "resurrection", productId: source.id, notes: "stale" }] }, { version: 6 });
    const stalePayload = structuredClone(resurrection.payload);
    assert.equal((await callRemove(tx, adminId, source.id, [directReference(resurrection, "Sensor", 1, "resurrection")])).status, "removed");
    const staleSessionId = randomUUID();
    await tx`update public.submissions set locked_by_session_id = ${staleSessionId}, lock_last_activity_at = now() where id = ${resurrection.id}`;
    const [staleSave] = await asAdmin(tx, adminId, () => tx`select * from public.admin_save_submission(${resurrection.id}, ${staleSessionId}, 6, ${tx.json(stalePayload)}, 'Verifier')`);
    assert.equal(staleSave.status, "version_conflict", "Stale save harus ditolak setelah removal menaikkan version.");
    const [resurrectionAfter] = await tx`select payload from public.submissions where id = ${resurrection.id}`;
    assert.equal(findItem(resurrectionAfter.payload, "resurrection").productId, undefined);

    const scaleItems = Array.from({ length: 1005 }, (_, index) => ({ id: `scale-${index + 1}`, productId: source.id, functionCategories: [index === 1004 ? "Beyond 1000" : "Scale"] }));
    const scaleSubmission = await createSubmission({ Scale: scaleItems }, { version: 1 });
    const scalePageOne = await callReferences(tx, adminId, source.id, 1, 200);
    assert.ok(scalePageOne.totalCount >= 1005);
    const allReferenceIds = [];
    const allReferenceRows = [];
    for (let page = 1; page <= Math.ceil(scalePageOne.totalCount / 200); page += 1) {
      const result = page === 1 ? scalePageOne : await callReferences(tx, adminId, source.id, page, 200);
      allReferenceIds.push(...result.rows.map((row) => row.referenceId));
      allReferenceRows.push(...result.rows);
    }
    assert.equal(new Set(allReferenceIds).size, scalePageOne.totalCount, "Pagination tidak boleh menduplikasi occurrence.");
    assert.ok(allReferenceRows.some((row) => row.itemId === "scale-1005"), "Referensi setelah batas 1000 harus dapat dipaginasi.");

    const timings = {};
    for (const size of [1, 10, 100]) {
      const selection = Array.from({ length: size }, (_, index) => directReference(scaleSubmission, "Scale", index + 1, `scale-${index + 1}`));
      const started = performance.now();
      const result = await callPreflight(tx, adminId, source.id, selection);
      timings[size] = Math.round((performance.now() - started) * 10) / 10;
      assert.equal(result.status, "ready");
    }

    const [sourceAfter] = await tx`select brand, model, active from public.products where id = ${source.id}`;
    assert.deepEqual(sourceAfter, { brand: source.brand, model: source.model, active: true });
    const renamedBrand = `Remove Source Current ${suffix}`;
    const renamedModel = `Model Current ${suffix}`;
    await tx`update public.products set brand = ${renamedBrand}, model = ${renamedModel} where id = ${source.id}`;
    const [canonicalAfterRename] = await asAdmin(tx, adminId, () => tx`select * from public.resolve_canonical_products(array[${source.id}]::uuid[])`);
    assert.deepEqual({ brand: canonicalAfterRename.brand, model: canonicalAfterRename.model }, { brand: renamedBrand, model: renamedModel });
    assert.equal(findItem((await tx`select payload from public.submissions where id = ${directSubmission.id}`)[0].payload, directKeep.id).brand, source.brand, "Historical payload snapshot tidak boleh direwrite saat canonical Product diedit.");
    const dependencyAfterRename = await callDependencies(tx, adminId, source.id);
    assert.deepEqual({ brand: dependencyAfterRename.product.brand, model: dependencyAfterRename.product.model }, { brand: renamedBrand, model: renamedModel });
    const [auditCounts] = await tx`select count(*) filter (where target_type = 'submission')::integer as submission_events, count(*) filter (where target_type = 'product')::integer as product_events from public.admin_audit_log where action = 'PRODUCT_REFERENCE_REMOVE'`;
    assert.ok(auditCounts.submission_events >= 5 && auditCounts.product_events >= 5);

    console.log(`Preflight lokal: 1=${timings[1]} ms, 10=${timings[10]} ms, 100=${timings[100]} ms.`);
    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}

console.log("Verifikasi penghapusan referensi Produk lulus; DIRECT, QC_RESULT, mixed atomicity, stale guard, lock, audit, projection, export, >1000 pagination, dan rollback fixture teruji.");
