import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia untuk verifier lokal.");
if (!/localhost|127\.0\.0\.1/.test(databaseUrl)) throw new Error("verify:product-merge hanya boleh memakai Supabase lokal.");

const sql = postgres(databaseUrl, { ssl: false, max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_PRODUCT_MERGE_${randomUUID()}`;

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function findItem(payload, itemId) {
  return Object.values(payload.inventory ?? {}).flat().find((item) => item.id === itemId);
}

function withoutProductIdentity(item) {
  const value = structuredClone(item);
  delete value.productId;
  delete value.brand;
  delete value.model;
  return value;
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

async function asStationUser(tx, stationUserId, query) {
  await tx`set local role authenticated`;
  await tx`select set_config('request.jwt.claim.sub', ${stationUserId}, true)`;
  try {
    return await query();
  } finally {
    await tx`reset role`;
  }
}

async function preflight(tx, adminId, sourceId, targetId) {
  return asAdmin(tx, adminId, async () => {
    const [row] = await tx`select public.admin_product_merge_preflight(${sourceId}, ${targetId}) as data`;
    return row.data;
  });
}

async function merge(tx, adminId, sourceId, targetId, token) {
  return asAdmin(tx, adminId, async () => {
    const [row] = await tx`select public.admin_merge_product(${sourceId}, ${targetId}, ${token}) as data`;
    return row.data;
  });
}

try {
  await sql.begin(async (tx) => {
    const suffix = randomUUID().slice(0, 8);
    const adminId = await createAuthUser(tx, "merge-admin");
    const stationUserId = await createAuthUser(tx, "merge-station");
    await tx`insert into public.super_admins (auth_user_id, username) values (${adminId}, ${`merge-admin-${suffix}`})`;
    const [station] = await tx`insert into public.stations (name) values (${`Merge Station ${suffix}`}) returning id`;
    await tx`insert into public.station_accounts (auth_user_id, station_id, username) values (${stationUserId}, ${station.id}, ${`merge-station-${suffix}`})`;
    const [siteType] = await tx`insert into public.site_types (name) values (${`Merge Type ${suffix}`}) returning id`;
    const [siteSubtype] = await tx`insert into public.site_subtypes (site_type_id, name) values (${siteType.id}, ${`Merge Subtype ${suffix}`}) returning id`;

    let productCounter = 0;
    async function createProduct(label, active = true) {
      productCounter += 1;
      const [row] = await tx`
        insert into public.products (brand, model, active, source_origin, spreadsheet_synced)
        values (${`Merge ${label} ${suffix}`}, ${`Model ${productCounter}`}, ${active}, 'ADMIN', false)
        returning id, brand, model, active
      `;
      return row;
    }

    async function createSubmission(items, options = {}) {
      const [site] = await tx`
        insert into public.sites (station_id, site_type_id, name)
        values (${station.id}, ${siteType.id}, ${`Merge Site ${randomUUID()}`}) returning id
      `;
      const payload = {
        siteId: site.id,
        siteSubtypeId: siteSubtype.id,
        metadata: { retained: true, operator: "Verifier" },
        inventory: { Sensor: items, Pendukung: options.supportingItems ?? [], Kosong: [] },
      };
      const [row] = await tx`
        insert into public.submissions (station_id, site_id, site_subtype_id, payload, version, archived_at)
        values (${station.id}, ${site.id}, ${siteSubtype.id}, ${tx.json(payload)}, ${options.version ?? 0}, ${options.archived ? new Date() : null})
        returning id, site_id, payload, version
      `;
      if (options.lockAgeMinutes !== undefined) {
        await tx`
          update public.submissions
          set locked_by_session_id = ${randomUUID()}, lock_operator_name = 'Verifier Lock',
              lock_last_activity_at = now() - (${options.lockAgeMinutes} * interval '1 minute')
          where id = ${row.id}
        `;
      }
      return row;
    }

    const unauthorizedSource = await createProduct("Unauthorized Source");
    const unauthorizedTarget = await createProduct("Unauthorized Target");
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${stationUserId}, true)`;
    await tx.unsafe(`do $$ begin perform public.admin_product_merge_preflight(${literal(unauthorizedSource.id)}::uuid, ${literal(unauthorizedTarget.id)}::uuid); raise exception 'station_merge_was_not_blocked'; exception when insufficient_privilege then null; end $$;`);
    await tx`reset role`;

    const [target] = await tx`
      insert into public.products (brand, model, active, source_origin, spreadsheet_synced)
      values ('R. M. Young', 'Marine Wind Monitor 05106', true, 'ADMIN', false)
      returning id, brand, model, active
    `;
    const approvalContext = await createSubmission([]);
    const approvalProposalRows = await asStationUser(tx, stationUserId, () => tx`
      select * from public.create_product_proposal(
        ${approvalContext.site_id}, ${siteSubtype.id},
        'R. M. Young', 'Sensor Arah dan Kecepatan Angin 5106',
        'Verifier Station', 'approve-then-merge'
      )
    `);
    const approvalProposalId = approvalProposalRows[0]?.proposal_id;
    assert.ok(approvalProposalId, "Station User harus dapat membuat proposal Pending.");
    const approvalResult = await asAdmin(tx, adminId, () => tx`
      select public.admin_approve_product_proposal(
        ${approvalProposalId}, 'R. M. Young', 'Sensor Arah dan Kecepatan Angin 5106', 'Disetujui untuk merge verifier'
      ) as product_id
    `);
    const sourceProductId = approvalResult[0]?.product_id;
    assert.ok(sourceProductId, "Approve Baru harus membuat canonical Product.");
    const [source] = await tx`
      select id, brand, model, active from public.products where id = ${sourceProductId}
    `;
    const [proposal] = await tx`
      select id, status, resolved_product_id, proposed_brand, proposed_model, reviewed_by, reviewed_at, review_note
      from public.product_proposals where id = ${approvalProposalId}
    `;
    assert.equal(proposal.status, "APPROVED");
    assert.equal(proposal.resolved_product_id, source.id);
    const proposalBefore = structuredClone(proposal);
    const other = await createProduct("Other");
    const richItem = {
      id: "rich-source",
      itemKind: "product",
      productId: source.id,
      brand: source.brand,
      model: source.model,
      quantity: 5,
      condition: "BAIK",
      installYear: "2024",
      notes: "Tetap utuh",
      functionCategories: ["Sensor Arah Angin", "Sensor Kecepatan Angin", "Sensor Suhu Udara", "Sensor Kelembaban Udara"],
      functionCategoryIds: [randomUUID(), randomUUID(), randomUUID(), randomUUID()],
      units: Array.from({ length: 5 }, (_, index) => ({ serialNumber: `MERGE-${index + 1}`, condition: index ? "BAIK" : "RUSAK", installYear: 2020 + index, notes: `Unit ${index + 1}` })),
      legacyMetadata: { nested: { retained: true } },
    };
    const sibling = { id: "sibling", productId: other.id, brand: other.brand, model: other.model, quantity: 1 };
    const first = await createSubmission([
      richItem,
      sibling,
      { ...richItem, id: "rich-second", quantity: 2 },
      { id: "category-mismatch", productId: source.id, brand: source.brand, model: source.model, quantity: 1, functionCategories: ["Kategori Tidak Serupa"] },
      { id: "empty-category-metadata", productId: source.id, brand: source.brand, model: source.model, quantity: 1, functionCategories: [] },
    ], { version: 8, supportingItems: [{ id: "supporting", notes: "Tetap" }] });
    const second = await createSubmission([{ id: "second-submission", productId: source.id, brand: source.brand, model: source.model, quantity: 1 }], { version: 3 });
    await createSubmission([
      { id: "target-existing-a", productId: target.id, brand: target.brand, model: target.model, quantity: 1 },
      { id: "target-existing-b", productId: target.id, brand: target.brand, model: target.model, quantity: 1 },
      { id: "target-existing-c", productId: target.id, brand: target.brand, model: target.model, quantity: 1 },
    ]);
    const archived = await createSubmission([{ id: "archived", productId: source.id, brand: source.brand, model: source.model, quantity: 9 }], { archived: true, version: 6 });
    const archivedBefore = structuredClone(archived.payload);
    await tx`
      insert into public.product_aliases (product_id, brand_alias, model_alias, normalized_brand, normalized_model, source_proposal_id)
      values (${source.id}, 'Old Source Brand', 'Old Source Model', 'old source brand', 'old source model', ${proposal.id})
    `;
    await tx`
      insert into public.product_aliases (product_id, brand_alias, model_alias, normalized_brand, normalized_model)
      values (${target.id}, 'Old Source Brand', 'Old Source Model', 'old source brand', 'old source model')
    `;

    const plan = await preflight(tx, adminId, source.id, target.id);
    assert.equal(plan.status, "ready");
    assert.equal(plan.resolvedQcProposalCount, 1, "Preflight harus menjelaskan hasil QC yang akan diarahkan.");
    assert.deepEqual(
      { references: plan.referenceCount, units: plan.unitCount, submissions: plan.submissionCount },
      { references: 5, units: 13, submissions: 2 },
    );
    const result = await merge(tx, adminId, source.id, target.id, plan.preflightToken);
    assert.equal(result.status, "merged");
    const currentRows = await tx`select id, payload, version from public.submissions where id in (${first.id}, ${second.id})`;
    const currentById = new Map(currentRows.map((row) => [row.id, row]));
    assert.equal(currentById.get(first.id).version, 9, "Beberapa item pada satu submission menaikkan version tepat sekali.");
    assert.equal(currentById.get(second.id).version, 4);
    const movedRich = findItem(currentById.get(first.id).payload, richItem.id);
    assert.deepEqual({ productId: movedRich.productId, brand: movedRich.brand, model: movedRich.model }, { productId: target.id, brand: target.brand, model: target.model });
    assert.deepEqual(withoutProductIdentity(movedRich), withoutProductIdentity(richItem));
    assert.deepEqual(findItem(currentById.get(first.id).payload, sibling.id), sibling);
    assert.deepEqual(currentById.get(first.id).payload.inventory.Pendukung, [{ id: "supporting", notes: "Tetap" }]);
    assert.deepEqual(findItem(currentById.get(first.id).payload, "category-mismatch").functionCategories, ["Kategori Tidak Serupa"]);
    assert.deepEqual(findItem(currentById.get(first.id).payload, "empty-category-metadata").functionCategories, []);
    const [archivedAfter] = await tx`select payload, version from public.submissions where id = ${archived.id}`;
    assert.deepEqual(archivedAfter.payload, archivedBefore, "Submission arsip tidak boleh diubah.");
    assert.equal(archivedAfter.version, 6);
    const [sourceAfter] = await tx`select active, merged_into_product_id from public.products where id = ${source.id}`;
    assert.deepEqual(sourceAfter, { active: false, merged_into_product_id: target.id });
    const [proposalAfter] = await tx`select id, status, resolved_product_id, proposed_brand, proposed_model, reviewed_by, reviewed_at, review_note from public.product_proposals where id = ${proposal.id}`;
    assert.deepEqual(
      { ...proposalAfter, resolved_product_id: undefined },
      { ...proposalBefore, resolved_product_id: undefined },
      "Approve Baru harus mempertahankan UUID, status, reviewer, waktu, catatan, dan isi proposal setelah merge.",
    );
    assert.equal(proposalAfter.resolved_product_id, target.id, "Hasil QC harus diarahkan ke target canonical.");
    const [canonical] = await tx`select public.resolve_canonical_product_id(${source.id}) as id`;
    assert.equal(canonical.id, target.id);
    const resolvedRows = await asAdmin(tx, adminId, () => tx`select * from public.resolve_canonical_products(${[source.id, target.id]}::uuid[])`);
    assert.equal(resolvedRows.length, 2);
    assert.ok(resolvedRows.every((row) => row.canonical_product_id === target.id));
    const [sourceDependencies] = await asAdmin(tx, adminId, () => tx`select public.admin_product_dependencies(${source.id}) as data`);
    const [targetDependencies] = await asAdmin(tx, adminId, () => tx`select public.admin_product_dependencies(${target.id}) as data`);
    assert.equal(sourceDependencies.data.preflight.currentDirectReferenceCount, 0);
    assert.equal(sourceDependencies.data.preflight.currentSiteCount, 0);
    assert.equal(sourceDependencies.data.preflight.resolvedQcProposalCount, 0, "Source merged tidak lagi menjadi canonical Product hasil QC.");
    assert.equal(sourceDependencies.data.product.mergedIntoProduct.id, target.id);
    assert.equal(targetDependencies.data.preflight.currentDirectReferenceCount, 8);
    assert.equal(targetDependencies.data.preflight.currentSiteCount, 3);
    assert.equal(targetDependencies.data.preflight.currentSubmissionCount, 3);
    assert.equal(targetDependencies.data.preflight.resolvedQcProposalCount, 1, "Target canonical menghitung QC history yang diteruskan dari Source.");
    const aliases = await tx`select brand_alias, model_alias, product_id from public.product_aliases where product_id = ${target.id}`;
    assert.equal(aliases.filter((alias) => alias.brand_alias === "Old Source Brand").length, 1, "Alias duplikat source/target harus dideduplikasi.");
    assert.ok(aliases.some((alias) => alias.brand_alias === source.brand && alias.model_alias === source.model), "Nama canonical source harus menjadi alias target.");
    const [directCounts] = await tx`
      select
        (select count(*)::integer from public.product_direct_reference_rows(${source.id}) where archived_at is null) as source_count,
        (select count(*)::integer from public.product_direct_reference_rows(${target.id}) where archived_at is null) as target_count
    `;
    assert.deepEqual(directCounts, { source_count: 0, target_count: 8 });
    const audits = await tx`select metadata from public.admin_audit_log where action = 'PRODUCT_MERGE' and target_id = ${source.id}`;
    assert.equal(audits.length, 1);
    assert.equal(audits[0].metadata.referenceCount, 5);
    assert.equal(audits[0].metadata.qcActions.repointed, 1);

    const qcOnlySource = await createProduct("QC Only Source");
    const qcOnlyTarget = await createProduct("QC Only Target");
    const qcOnlyProposalRows = await tx`
      insert into public.product_proposals (station_id, created_by_auth_user, proposed_brand, proposed_model, normalized_brand, normalized_model, status, resolved_product_id, reviewed_by, reviewed_at, review_note)
      values
        (${station.id}, ${stationUserId}, 'QC Only', 'One', 'qc only', 'one', 'APPROVED', ${qcOnlySource.id}, ${adminId}, now(), 'Tetap ada'),
        (${station.id}, ${stationUserId}, 'QC Only', 'Two', 'qc only', 'two', 'MERGED', ${qcOnlySource.id}, ${adminId}, now(), 'Tetap ada')
      returning id, status, proposed_brand, proposed_model, reviewed_by, reviewed_at, review_note
    `;
    const qcOnlyPlan = await preflight(tx, adminId, qcOnlySource.id, qcOnlyTarget.id);
    assert.equal(qcOnlyPlan.status, "ready", "Produk hasil Approve Baru tanpa item langsung tetap harus mergeable.");
    assert.equal(qcOnlyPlan.referenceCount, 0);
    assert.equal(qcOnlyPlan.resolvedQcProposalCount, 2);
    const qcOnlyResult = await merge(tx, adminId, qcOnlySource.id, qcOnlyTarget.id, qcOnlyPlan.preflightToken);
    assert.equal(qcOnlyResult.status, "merged");
    assert.equal(qcOnlyResult.qcActions.repointed, 2);
    const qcOnlyAfter = await tx`select id, status, resolved_product_id, proposed_brand, proposed_model, reviewed_by, reviewed_at, review_note from public.product_proposals where id = any(${qcOnlyProposalRows.map((row) => row.id)}) order by id`;
    for (const row of qcOnlyAfter) {
      const before = qcOnlyProposalRows.find((proposalRow) => proposalRow.id === row.id);
      assert.deepEqual({ ...row, resolved_product_id: undefined }, { ...before, resolved_product_id: undefined }, "Isi dan riwayat QC tidak boleh berubah.");
      assert.equal(row.resolved_product_id, qcOnlyTarget.id);
    }

    const qcStaleSource = await createProduct("QC Stale Source");
    const qcStaleTarget = await createProduct("QC Stale Target");
    await tx`
      insert into public.product_proposals (station_id, created_by_auth_user, proposed_brand, proposed_model, normalized_brand, normalized_model, status, resolved_product_id)
      values (${station.id}, ${stationUserId}, 'QC Stale', 'One', 'qc stale', 'one', 'APPROVED', ${qcStaleSource.id})`;
    const qcStalePlan = await preflight(tx, adminId, qcStaleSource.id, qcStaleTarget.id);
    await tx`
      insert into public.product_proposals (station_id, created_by_auth_user, proposed_brand, proposed_model, normalized_brand, normalized_model, status, resolved_product_id)
      values (${station.id}, ${stationUserId}, 'QC Stale', 'Two', 'qc stale', 'two', 'MERGED', ${qcStaleSource.id})`;
    assert.equal((await merge(tx, adminId, qcStaleSource.id, qcStaleTarget.id, qcStalePlan.preflightToken)).status, "state_changed");
    const [qcStaleSourceAfter] = await tx`select active, merged_into_product_id from public.products where id = ${qcStaleSource.id}`;
    assert.deepEqual(qcStaleSourceAfter, { active: true, merged_into_product_id: null }, "Token stale tidak boleh menyebabkan merge parsial.");
    const [qcStaleAfter] = await tx`select count(*)::integer as count from public.product_proposals where resolved_product_id = ${qcStaleSource.id}`;
    assert.equal(qcStaleAfter.count, 2, "Token stale tidak boleh memindahkan sebagian hasil QC.");

    const zeroSource = await createProduct("Zero Source", false);
    const zeroTarget = await createProduct("Zero Target");
    const zeroPlan = await preflight(tx, adminId, zeroSource.id, zeroTarget.id);
    assert.equal(zeroPlan.status, "ready");
    assert.equal(zeroPlan.referenceCount, 0);
    assert.equal((await merge(tx, adminId, zeroSource.id, zeroTarget.id, zeroPlan.preflightToken)).status, "merged");

    const lockedSource = await createProduct("Locked Source");
    const lockedTarget = await createProduct("Locked Target");
    await createSubmission([{ id: "locked", productId: lockedSource.id, brand: lockedSource.brand, model: lockedSource.model }], { lockAgeMinutes: 1 });
    assert.equal((await preflight(tx, adminId, lockedSource.id, lockedTarget.id)).status, "active_lock");
    const [lockedAfter] = await tx`select merged_into_product_id from public.products where id = ${lockedSource.id}`;
    assert.equal(lockedAfter.merged_into_product_id, null);

    const expiredSource = await createProduct("Expired Source");
    const expiredTarget = await createProduct("Expired Target");
    await createSubmission([{ id: "expired", productId: expiredSource.id, brand: expiredSource.brand, model: expiredSource.model }], { lockAgeMinutes: 6 });
    const expiredPlan = await preflight(tx, adminId, expiredSource.id, expiredTarget.id);
    assert.equal(expiredPlan.status, "ready");
    assert.equal((await merge(tx, adminId, expiredSource.id, expiredTarget.id, expiredPlan.preflightToken)).status, "merged");

    const staleSource = await createProduct("Stale Source");
    const staleTarget = await createProduct("Stale Target");
    const staleSubmission = await createSubmission([{ id: "stale", productId: staleSource.id, brand: staleSource.brand, model: staleSource.model }], { version: 2 });
    const stalePlan = await preflight(tx, adminId, staleSource.id, staleTarget.id);
    await tx`update public.submissions set version = version + 1, payload = jsonb_set(payload, '{metadata,concurrent}', 'true'::jsonb, true) where id = ${staleSubmission.id}`;
    assert.equal((await merge(tx, adminId, staleSource.id, staleTarget.id, stalePlan.preflightToken)).status, "state_changed");
    const [staleAfter] = await tx`select payload, version from public.submissions where id = ${staleSubmission.id}`;
    assert.equal(staleAfter.version, 3);
    assert.equal(findItem(staleAfter.payload, "stale").productId, staleSource.id);

    const newReferenceSource = await createProduct("New Reference Source");
    const newReferenceTarget = await createProduct("New Reference Target");
    const newReferenceSubmission = await createSubmission([{ id: "existing-before-preflight", productId: newReferenceSource.id, brand: newReferenceSource.brand, model: newReferenceSource.model }], { version: 4 });
    const newReferencePlan = await preflight(tx, adminId, newReferenceSource.id, newReferenceTarget.id);
    const newReferencePayload = structuredClone(newReferenceSubmission.payload);
    newReferencePayload.inventory.Sensor.push({ id: "added-after-preflight", productId: newReferenceSource.id, brand: newReferenceSource.brand, model: newReferenceSource.model });
    await tx`update public.submissions set payload = ${tx.json(newReferencePayload)}, version = version + 1 where id = ${newReferenceSubmission.id}`;
    assert.equal((await merge(tx, adminId, newReferenceSource.id, newReferenceTarget.id, newReferencePlan.preflightToken)).status, "state_changed");
    const [newReferenceAfter] = await tx`select payload, version from public.submissions where id = ${newReferenceSubmission.id}`;
    assert.equal(newReferenceAfter.version, 5);
    assert.equal(findItem(newReferenceAfter.payload, "existing-before-preflight").productId, newReferenceSource.id);
    assert.equal(findItem(newReferenceAfter.payload, "added-after-preflight").productId, newReferenceSource.id);

    const aliasStaleSource = await createProduct("Alias Stale Source");
    const aliasStaleTarget = await createProduct("Alias Stale Target");
    const [mutableAlias] = await tx`
      insert into public.product_aliases (product_id, brand_alias, model_alias, normalized_brand, normalized_model)
      values (${aliasStaleSource.id}, 'Alias Before', 'Model', 'alias before', 'model') returning id
    `;
    const aliasStalePlan = await preflight(tx, adminId, aliasStaleSource.id, aliasStaleTarget.id);
    await tx`
      update public.product_aliases
      set brand_alias = 'Alias After', normalized_brand = 'alias after'
      where id = ${mutableAlias.id}
    `;
    assert.equal((await merge(tx, adminId, aliasStaleSource.id, aliasStaleTarget.id, aliasStalePlan.preflightToken)).status, "state_changed", "Perubahan isi alias dengan jumlah tetap harus membuat token stale.");

    const inactiveTarget = await createProduct("Inactive Target", false);
    const validationSource = await createProduct("Validation Source");
    assert.equal((await preflight(tx, adminId, validationSource.id, validationSource.id)).status, "same_product");
    assert.equal((await preflight(tx, adminId, validationSource.id, inactiveTarget.id)).status, "target_inactive");

    const chainSource = await createProduct("Chain Source");
    const chainMiddle = await createProduct("Chain Middle");
    const chainFinal = await createProduct("Chain Final");
    const middlePlan = await preflight(tx, adminId, chainMiddle.id, chainFinal.id);
    assert.equal((await merge(tx, adminId, chainMiddle.id, chainFinal.id, middlePlan.preflightToken)).status, "merged");
    const chainPlan = await preflight(tx, adminId, chainSource.id, chainMiddle.id);
    assert.equal(chainPlan.status, "ready");
    assert.equal(chainPlan.target.id, chainFinal.id, "Target yang sudah merged harus di-resolve ke canonical akhir.");
    assert.equal(chainPlan.targetResolved, true);
    assert.equal((await merge(tx, adminId, chainSource.id, chainMiddle.id, chainPlan.preflightToken)).status, "merged");
    assert.equal((await preflight(tx, adminId, chainFinal.id, chainSource.id)).status, "merge_cycle");

    const twoNodeA = await createProduct("Two Node A");
    const twoNodeB = await createProduct("Two Node B");
    await tx`update public.products set active = false, merged_into_product_id = ${twoNodeB.id} where id = ${twoNodeA.id}`;
    assert.equal((await preflight(tx, adminId, twoNodeB.id, twoNodeA.id)).status, "merge_cycle");
    const multiHopA = await createProduct("Multi Hop A");
    const multiHopB = await createProduct("Multi Hop B");
    const multiHopC = await createProduct("Multi Hop C");
    await tx`update public.products set active = false, merged_into_product_id = ${multiHopB.id} where id = ${multiHopA.id}`;
    await tx`update public.products set active = false, merged_into_product_id = ${multiHopC.id} where id = ${multiHopB.id}`;
    assert.equal((await preflight(tx, adminId, multiHopC.id, multiHopA.id)).status, "merge_cycle");

    const collisionSource = await createProduct("Collision Source");
    const collisionTarget = await createProduct("Collision Target");
    const collisionThird = await createProduct("Collision Third");
    await tx`
      insert into public.product_aliases (product_id, brand_alias, model_alias, normalized_brand, normalized_model)
      values (${collisionSource.id}, 'Collision Alias', 'One', 'collision alias', 'one'),
             (${collisionThird.id}, 'Collision Alias', 'One', 'collision alias', 'one')
    `;
    assert.equal((await preflight(tx, adminId, collisionSource.id, collisionTarget.id)).status, "alias_collision");

    const rollbackSource = await createProduct("Rollback Source");
    const rollbackTarget = await createProduct("Rollback Target");
    const rollbackSubmission = await createSubmission([
      { id: "rollback-reference", productId: rollbackSource.id, brand: rollbackSource.brand, model: rollbackSource.model, quantity: 1 },
    ], { version: 7 });
    const [rollbackProposal] = await tx`
      insert into public.product_proposals (station_id, submission_id, created_by_auth_user, proposed_brand, proposed_model, normalized_brand, normalized_model, status, resolved_product_id)
      values (${station.id}, ${rollbackSubmission.id}, ${stationUserId}, 'Rollback', 'QC', 'rollback', 'qc', 'APPROVED', ${rollbackSource.id})
      returning id
    `;
    await tx`
      insert into public.product_aliases (product_id, brand_alias, model_alias, normalized_brand, normalized_model)
      values (${rollbackSource.id}, 'Rollback Alias', 'QC', 'rollback alias', 'qc')
    `;
    const rollbackPlan = await preflight(tx, adminId, rollbackSource.id, rollbackTarget.id);
    assert.equal(rollbackPlan.status, "ready");
    const rollbackPayload = structuredClone(rollbackSubmission.payload);
    await tx.unsafe(`
      create function public.verify_product_merge_rollback_audit_failure()
      returns trigger
      language plpgsql
      as $$ begin raise exception 'verify product merge forced audit failure'; end $$;
      create trigger verify_product_merge_rollback_audit_failure
      before insert on public.admin_audit_log
      for each row execute function public.verify_product_merge_rollback_audit_failure();
    `);
    await asAdmin(tx, adminId, () => tx.unsafe(`
      do $$
      begin
        perform public.admin_merge_product(${literal(rollbackSource.id)}::uuid, ${literal(rollbackTarget.id)}::uuid, ${literal(rollbackPlan.preflightToken)});
        raise exception 'merge unexpectedly succeeded despite forced audit failure';
      exception when others then
        if sqlerrm <> 'verify product merge forced audit failure' then raise; end if;
      end $$;
    `));
    await tx`drop trigger verify_product_merge_rollback_audit_failure on public.admin_audit_log`;
    await tx`drop function public.verify_product_merge_rollback_audit_failure()`;
    const [rollbackSourceAfter] = await tx`select active, merged_into_product_id from public.products where id = ${rollbackSource.id}`;
    assert.deepEqual(rollbackSourceAfter, { active: true, merged_into_product_id: null });
    const [rollbackProposalAfter] = await tx`select resolved_product_id from public.product_proposals where id = ${rollbackProposal.id}`;
    assert.equal(rollbackProposalAfter.resolved_product_id, rollbackSource.id);
    const [rollbackSubmissionAfter] = await tx`select payload, version from public.submissions where id = ${rollbackSubmission.id}`;
    assert.deepEqual(rollbackSubmissionAfter.payload, rollbackPayload);
    assert.equal(rollbackSubmissionAfter.version, 7);
    const [rollbackAliasCount] = await tx`select count(*)::integer as count from public.product_aliases where product_id = ${rollbackSource.id}`;
    assert.equal(rollbackAliasCount.count, 1);
    const [rollbackAuditCount] = await tx`select count(*)::integer as count from public.admin_audit_log where target_id = ${rollbackSource.id} and action = 'PRODUCT_MERGE'`;
    assert.equal(rollbackAuditCount.count, 0, "Kegagalan dalam transaksi tidak boleh menulis audit parsial.");

    const [auditTotal] = await tx`select count(*)::integer as count from public.admin_audit_log where action = 'PRODUCT_MERGE'`;
    assert.equal(auditTotal.count, 6, "Hanya merge sukses yang boleh menulis satu audit per operasi.");
    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}

console.log("Verifikasi merge Product lulus; all-reference move, payload/version, archive/QC history, alias, lock, stale token, chain/cycle, audit, dan rollback fixture teruji.");
