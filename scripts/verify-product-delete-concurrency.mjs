import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia untuk verifier lokal.");
if (!/localhost|127\.0\.0\.1/.test(databaseUrl)) {
  throw new Error("verify:product-delete concurrency hanya boleh memakai Supabase lokal.");
}

const adminSql = postgres(databaseUrl, { ssl: false, max: 1, connect_timeout: 15 });
const writerSql = postgres(databaseUrl, { ssl: false, max: 1, connect_timeout: 15 });
const observerSql = postgres(databaseUrl, { ssl: false, max: 1, connect_timeout: 15 });
const suffix = randomUUID().slice(0, 8);
const adminId = randomUUID();
const stationUserId = randomUUID();
let fixture;
let adminTransactionOpen = false;
let writerTransactionOpen = false;
let largePayloadTimingMs = 0;
let largePayloadItemCount = 0;
let largePayloadDistinctProducts = 0;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function asAdmin(client, callback) {
  return client.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${adminId}, true)`;
    return callback(tx);
  });
}

async function asStation(client, callback) {
  return client.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${stationUserId}, true)`;
    return callback(tx);
  });
}

async function preflight(productId) {
  return asAdmin(adminSql, async (tx) => {
    const [row] = await tx`select public.admin_product_delete_preflight(${productId}) as data`;
    return row.data;
  });
}

async function deleteProduct(productId, token) {
  return asAdmin(adminSql, async (tx) => {
    const [row] = await tx`select public.admin_delete_product(${productId}, ${token}) as data`;
    return row.data;
  });
}

async function createProduct(model) {
  const [row] = await observerSql`
    insert into public.products (brand, model, active, source_origin, spreadsheet_synced)
    values (${`Delete Concurrency ${suffix}`}, ${model}, false, 'ADMIN', false)
    returning id
  `;
  return row.id;
}

async function expectProductRowConflict(label, productId, contender) {
  await adminSql.unsafe("begin");
  adminTransactionOpen = true;
  try {
    await adminSql`select id from public.products where id = ${productId} for update`;
    await writerSql.unsafe("begin");
    writerTransactionOpen = true;
    try {
      await writerSql.unsafe("set local lock_timeout = '500ms'");
      await assert.rejects(contender, (error) => error?.code === "55P03", label);
    } finally {
      await writerSql.unsafe("rollback");
      writerTransactionOpen = false;
    }
  } finally {
    await adminSql.unsafe("rollback");
    adminTransactionOpen = false;
  }
}

try {
  fixture = await observerSql.begin(async (tx) => {
    await tx`
      insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values
        (${adminId}, 'authenticated', 'authenticated', ${`delete-concurrency-admin-${suffix}@verify.invalid`}, '',
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (${stationUserId}, 'authenticated', 'authenticated', ${`delete-concurrency-station-${suffix}@verify.invalid`}, '',
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    `;
    await tx`insert into public.super_admins (auth_user_id, username) values (${adminId}, ${`delete-concurrency-${suffix}`})`;
    const [station] = await tx`insert into public.stations (name) values (${`Delete Concurrency Station ${suffix}`}) returning id`;
    await tx`
      insert into public.station_accounts (auth_user_id, station_id, username)
      values (${stationUserId}, ${station.id}, ${`delete-concurrency-station-${suffix}`})
    `;
    const [siteType] = await tx`insert into public.site_types (name) values (${`Delete Concurrency Type ${suffix}`}) returning id`;
    const [subtype] = await tx`
      insert into public.site_subtypes (site_type_id, name)
      values (${siteType.id}, ${`Delete Concurrency Subtype ${suffix}`}) returning id
    `;
    const [siteA] = await tx`
      insert into public.sites (station_id, site_type_id, name)
      values (${station.id}, ${siteType.id}, ${`Delete Concurrency Site A ${suffix}`}) returning id
    `;
    const [siteB] = await tx`
      insert into public.sites (station_id, site_type_id, name)
      values (${station.id}, ${siteType.id}, ${`Delete Concurrency Site B ${suffix}`}) returning id
    `;
    const emptyPayload = { inventory: { Sensor: [] } };
    const [submissionA] = await tx`
      insert into public.submissions (station_id, site_id, site_subtype_id, payload, version)
      values (${station.id}, ${siteA.id}, ${subtype.id}, ${tx.json(emptyPayload)}, 1) returning id
    `;
    const [submissionB] = await tx`
      insert into public.submissions (station_id, site_id, site_subtype_id, payload, version)
      values (${station.id}, ${siteB.id}, ${subtype.id}, ${tx.json(emptyPayload)}, 1) returning id
    `;
    return {
      stationId: station.id,
      siteTypeId: siteType.id,
      subtypeId: subtype.id,
      siteIds: [siteA.id, siteB.id],
      submissionA: submissionA.id,
      submissionB: submissionB.id,
    };
  });

  const targetProductId = await createProduct("Target");
  const unrelatedProductId = await createProduct("Unrelated");
  const sourceProductId = await createProduct("Merge Source");
  fixture.productIds = [targetProductId, unrelatedProductId, sourceProductId];

  // The extraction helper is deliberately tolerant: only valid direct UUIDs
  // participate, while proposal-only, null, empty, missing, and legacy strings
  // remain the responsibility of their existing workflow/layer.
  const stressProductIds = [targetProductId, unrelatedProductId, sourceProductId];
  for (let index = 4; index <= 12; index += 1) {
    const productId = await createProduct(`Stress ${index}`);
    stressProductIds.push(productId);
    fixture.productIds.push(productId);
  }
  const stressItems = Array.from({ length: 360 }, (_, index) => ({
    id: `stress-${index}`,
    productId: stressProductIds[(stressProductIds.length - 1) - (index % stressProductIds.length)],
    units: [],
  }));
  const tolerantItems = [
    { id: "proposal-only", productProposalId: randomUUID() },
    { id: "null-product", productId: null },
    { id: "empty-product", productId: "" },
    { id: "missing-product" },
    { id: "legacy-product", productId: "legacy-orphan-product-id" },
  ];
  const largePayload = {
    schemaVersion: 1,
    inventory: {
      Sensor: [...stressItems, ...tolerantItems],
      Pendukung: [],
      LegacyObject: { ignored: true },
    },
    customLegacyField: { retained: true },
  };
  const extracted = await observerSql`
    select product_id
    from public.submission_direct_product_ids(${observerSql.json(largePayload)})
    order by product_id
  `;
  assert.deepEqual(
    extracted.map((row) => row.product_id),
    [...stressProductIds].sort(),
    "Helper harus dedupe UUID valid dan mengurutkan lock set secara deterministik.",
  );
  const largePayloadStartedAt = performance.now();
  await observerSql`
    update public.submissions set payload = ${observerSql.json(largePayload)}, version = version + 1
    where id = ${fixture.submissionB}
  `;
  largePayloadTimingMs = performance.now() - largePayloadStartedAt;
  largePayloadItemCount = stressItems.length + tolerantItems.length;
  largePayloadDistinctProducts = extracted.length;

  const [pendingProposal] = await observerSql`
    insert into public.product_proposals (
      station_id, submission_id, created_by_auth_user, proposed_brand, proposed_model,
      normalized_brand, normalized_model, status
    ) values (${fixture.stationId}, ${fixture.submissionB}, ${stationUserId},
      'Delete concurrency', 'Proposal only', ${`deleteconcurrency${suffix}`}, 'proposalonly', 'PENDING')
    returning id
  `;
  const proposalOnlyPayload = {
    inventory: {
      Sensor: [
        { id: "proposal-only", productProposalId: pendingProposal.id, units: [] },
        { id: "null-product", productId: null },
        { id: "empty-product", productId: "" },
        { id: "missing-product" },
        { id: "legacy-product", productId: "legacy-orphan-product-id" },
      ],
      EmptyCategory: [],
      LegacyObject: { ignored: true },
    },
  };
  await observerSql`
    update public.submissions set payload = ${observerSql.json(proposalOnlyPayload)}, version = version + 1
    where id = ${fixture.submissionB}
  `;
  await observerSql`
    update public.submissions set payload = ${observerSql.json({ inventory: null })}, version = version + 1
    where id = ${fixture.submissionB}
  `;
  await observerSql`
    update public.submissions set payload = ${observerSql.json({ inventory: {} })}, version = version + 1
    where id = ${fixture.submissionB}
  `;

  // Existing references remain valid based on row existence, not picker state.
  // Inactive and merged Products must survive unrelated metadata edits.
  const inactiveProductId = await createProduct("Inactive Existing Reference");
  const mergedTargetId = await createProduct("Merged Target");
  const mergedSourceId = await createProduct("Merged Historical Source");
  fixture.productIds.push(inactiveProductId, mergedTargetId, mergedSourceId);
  await observerSql`
    update public.products set merged_into_product_id = ${mergedTargetId}
    where id = ${mergedSourceId}
  `;
  const inactivePayload = {
    inventory: { Sensor: [{ id: "inactive-existing", productId: inactiveProductId, notes: "before" }] },
  };
  await observerSql`
    update public.submissions set payload = ${observerSql.json(inactivePayload)}, version = version + 1
    where id = ${fixture.submissionA}
  `;
  inactivePayload.inventory.Sensor[0].notes = "after";
  const stationSessionId = randomUUID();
  await asStation(observerSql, async (tx) => {
    const [opened] = await tx`
      select * from public.open_submission(
        ${fixture.siteIds[0]}, ${fixture.subtypeId}, ${stationSessionId}, 'Trigger audit station'
      )
    `;
    assert.equal(opened.can_edit, true);
    const [saved] = await tx`
      select * from public.save_submission(
        ${fixture.siteIds[0]}, ${fixture.subtypeId}, ${stationSessionId}, ${opened.version},
        ${tx.json(inactivePayload)}, 'Trigger audit station'
      )
    `;
    assert.equal(saved.status, "saved", "Station autosave harus menerima existing inactive Product.");
    assert.equal((await tx`
      select public.release_submission_lock(${fixture.siteIds[0]}, ${fixture.subtypeId}, ${stationSessionId}) as released
    `)[0].released, true);
  });
  const [inactiveSaved] = await observerSql`
    select payload #>> '{inventory,Sensor,0,notes}' as notes
    from public.submissions where id = ${fixture.submissionA}
  `;
  assert.equal(inactiveSaved.notes, "after");

  const mergedPayload = {
    inventory: { Sensor: [{ id: "merged-existing", productId: mergedSourceId, condition: "Baik" }] },
  };
  await observerSql`
    update public.submissions set payload = ${observerSql.json(mergedPayload)}, version = version + 1
    where id = ${fixture.submissionA}
  `;
  mergedPayload.inventory.Sensor[0].condition = "Rusak ringan";
  await observerSql`
    update public.submissions set payload = ${observerSql.json(mergedPayload)}, version = version + 1
    where id = ${fixture.submissionA}
  `;
  const [mergedSaved] = await observerSql`
    select payload #>> '{inventory,Sensor,0,condition}' as condition
    from public.submissions where id = ${fixture.submissionA}
  `;
  assert.equal(mergedSaved.condition, "Rusak ringan");

  // A non-payload heartbeat cannot fire an UPDATE OF payload trigger.
  await observerSql`
    update public.submissions set lock_operator_name = 'Trigger audit'
    where id = ${fixture.submissionA}
  `;
  await observerSql`
    update public.submissions set payload = ${observerSql.json({ inventory: { Sensor: [] } })}, version = version + 1
    where id in (${fixture.submissionA}, ${fixture.submissionB})
  `;

  // The Product-table lock retained for Phase 3 ordering must not block an
  // unrelated Submission payload update guarded by another Product row.
  await adminSql.unsafe("begin");
  adminTransactionOpen = true;
  try {
    await adminSql.unsafe("lock table public.products in share row exclusive mode");
    await adminSql`select id from public.products where id = ${targetProductId} for update`;
    await writerSql.unsafe("begin");
    writerTransactionOpen = true;
    try {
      await writerSql.unsafe("set local lock_timeout = '700ms'");
      const payload = { inventory: { Sensor: [{ id: "unrelated", productId: unrelatedProductId }] } };
      const result = await writerSql`
        update public.submissions set payload = ${writerSql.json(payload)}, version = version + 1
        where id = ${fixture.submissionB}
      `;
      assert.equal(result.count, 1, "Unrelated autosave harus tetap berjalan.");
    } finally {
      await writerSql.unsafe("rollback");
      writerTransactionOpen = false;
    }
  } finally {
    await adminSql.unsafe("rollback");
    adminTransactionOpen = false;
  }

  // Writer first: KEY SHARE protects the Product until the Submission commit;
  // Delete then revalidates and returns state_changed.
  const writerFirstPlan = await preflight(targetProductId);
  assert.equal(writerFirstPlan.status, "ready");
  await writerSql.unsafe("begin");
  writerTransactionOpen = true;
  const referencedPayload = { inventory: { Sensor: [{ id: "writer-first", productId: targetProductId }] } };
  await writerSql`
    update public.submissions set payload = ${writerSql.json(referencedPayload)}, version = version + 1
    where id = ${fixture.submissionA}
  `;
  let writerFirstSettled = false;
  const deleteAfterWriter = deleteProduct(targetProductId, writerFirstPlan.preflightToken)
    .finally(() => { writerFirstSettled = true; });
  await sleep(250);
  assert.equal(writerFirstSettled, false, "Delete harus menunggu writer relevant yang belum commit.");
  await writerSql.unsafe("commit");
  writerTransactionOpen = false;
  const writerFirstResult = await deleteAfterWriter;
  assert.equal(writerFirstResult.status, "state_changed");
  await observerSql`
    update public.submissions set payload = ${observerSql.json({ inventory: { Sensor: [] } })}, version = version + 1
    where id = ${fixture.submissionA}
  `;

  // Delete first: a late writer waits for the Product row, then fails instead
  // of persisting a dangling JSON UUID after the Product disappears.
  const deleteFirstProductId = await createProduct("Delete First");
  fixture.productIds.push(deleteFirstProductId);
  await adminSql.unsafe("begin");
  adminTransactionOpen = true;
  await adminSql.unsafe("lock table public.products in share row exclusive mode");
  await adminSql`select id from public.products where id = ${deleteFirstProductId} for update`;
  let lateWriterSettled = false;
  const latePayload = { inventory: { Sensor: [{ id: "delete-first", productId: deleteFirstProductId }] } };
  const lateWriter = writerSql`
    update public.submissions set payload = ${writerSql.json(latePayload)}, version = version + 1
    where id = ${fixture.submissionA}
  `.finally(() => { lateWriterSettled = true; });
  await sleep(250);
  assert.equal(lateWriterSettled, false, "Writer relevant harus menunggu Delete yang sedang memegang Product row.");
  await adminSql`delete from public.products where id = ${deleteFirstProductId}`;
  await adminSql.unsafe("commit");
  adminTransactionOpen = false;
  await assert.rejects(lateWriter, (error) => error?.code === "23503");
  const [dangling] = await observerSql`
    select count(*)::integer as count
    from public.submissions as submission
    cross join lateral jsonb_each(submission.payload -> 'inventory') as category
    cross join lateral jsonb_array_elements(category.value) as item
    where item ->> 'productId' = ${deleteFirstProductId}
  `;
  assert.equal(dangling.count, 0);

  // A persisted reference means Delete is already ineligible. An autosave that
  // retains that inactive Product while changing metadata must not wait on or
  // fail against the Product row lock because no new UUID is introduced.
  const existingReferenceProductId = await createProduct("Existing Reference Autosave");
  fixture.productIds.push(existingReferenceProductId);
  const existingReferencePayload = {
    inventory: { Sensor: [{ id: "existing-reference", productId: existingReferenceProductId, serialNumber: "OLD" }] },
  };
  await observerSql`
    update public.submissions set payload = ${observerSql.json(existingReferencePayload)}, version = version + 1
    where id = ${fixture.submissionA}
  `;
  const existingReferencePlan = await preflight(existingReferenceProductId);
  assert.equal(existingReferencePlan.status, "blocked");
  await adminSql.unsafe("begin");
  adminTransactionOpen = true;
  try {
    await adminSql.unsafe("lock table public.products in share row exclusive mode");
    await adminSql`select id from public.products where id = ${existingReferenceProductId} for update`;
    existingReferencePayload.inventory.Sensor[0].serialNumber = "NEW";
    await writerSql.unsafe("begin");
    writerTransactionOpen = true;
    try {
      await writerSql.unsafe("set local lock_timeout = '700ms'");
      const result = await writerSql`
        update public.submissions set payload = ${writerSql.json(existingReferencePayload)}, version = version + 1
        where id = ${fixture.submissionA}
      `;
      assert.equal(result.count, 1, "Autosave existing reference harus tetap berjalan.");
      await writerSql.unsafe("commit");
      writerTransactionOpen = false;
    } finally {
      if (writerTransactionOpen) {
        await writerSql.unsafe("rollback");
        writerTransactionOpen = false;
      }
    }
    const [blockedPlan] = await adminSql`select public.product_delete_validation(${existingReferenceProductId}) as data`;
    assert.equal(blockedPlan.data.status, "blocked");
  } finally {
    await adminSql.unsafe("rollback");
    adminTransactionOpen = false;
  }

  await expectProductRowConflict(
    "Alias FK harus serialize dengan Product row Delete.",
    targetProductId,
    writerSql`
      insert into public.product_aliases (product_id, brand_alias, model_alias, normalized_brand, normalized_model)
      values (${targetProductId}, 'Delete concurrency', 'Alias', ${`deleteconcurrency${suffix}`}, 'alias')
    `,
  );
  await expectProductRowConflict(
    "QC resolved_product_id FK harus serialize dengan Product row Delete.",
    targetProductId,
    writerSql`
      insert into public.product_proposals (
        station_id, created_by_auth_user, proposed_brand, proposed_model,
        normalized_brand, normalized_model, status, resolved_product_id
      ) values (${fixture.stationId}, ${stationUserId}, 'Delete concurrency', 'QC',
        ${`deleteconcurrency${suffix}`}, 'qc', 'APPROVED', ${targetProductId})
    `,
  );
  await expectProductRowConflict(
    "Incoming merged_into FK harus serialize dengan Product row Delete.",
    targetProductId,
    writerSql`
      update public.products set merged_into_product_id = ${targetProductId}
      where id = ${sourceProductId}
    `,
  );
} finally {
  if (adminTransactionOpen) {
    try { await adminSql.unsafe("rollback"); } catch {}
    adminTransactionOpen = false;
  }
  if (writerTransactionOpen) {
    try { await writerSql.unsafe("rollback"); } catch {}
    writerTransactionOpen = false;
  }
  if (fixture) {
    await observerSql.begin(async (tx) => {
      await tx`delete from public.product_proposals where station_id = ${fixture.stationId}`;
      await tx`delete from public.product_aliases where product_id = any(${fixture.productIds ?? []})`;
      await tx`update public.products set merged_into_product_id = null where id = any(${fixture.productIds ?? []})`;
      await tx`delete from public.submissions where id in (${fixture.submissionA}, ${fixture.submissionB})`;
      await tx`delete from public.sites where id = any(${fixture.siteIds})`;
      await tx`delete from public.site_subtypes where id = ${fixture.subtypeId}`;
      await tx`delete from public.site_types where id = ${fixture.siteTypeId}`;
      await tx`delete from public.station_accounts where station_id = ${fixture.stationId}`;
      await tx`delete from public.stations where id = ${fixture.stationId}`;
      await tx`delete from public.super_admins where auth_user_id = ${adminId}`;
      await tx`delete from public.products where id = any(${fixture.productIds ?? []})`;
      await tx`delete from auth.users where id in (${adminId}, ${stationUserId})`;
    });
  }
  await adminSql.end({ timeout: 5 });
  await writerSql.end({ timeout: 5 });
  await observerSql.end({ timeout: 5 });
}

console.log(
  `Verifikasi concurrency delete Product lulus; autosave unrelated/existing-reference berjalan, writer relevant terserialisasi, `
  + `payload ${largePayloadItemCount} item/${largePayloadDistinctProducts} Product distinct diproses lokal dalam ${largePayloadTimingMs.toFixed(1)} ms, dan FK alias/QC/merge tetap aman.`,
);
