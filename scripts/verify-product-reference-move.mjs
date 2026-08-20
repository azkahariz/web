import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia untuk verifier lokal.");
if (!/localhost|127\.0\.0\.1/.test(databaseUrl)) throw new Error("verify:product-reference-move hanya boleh memakai Supabase lokal.");

const sql = postgres(databaseUrl, { ssl: false, max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_PRODUCT_REFERENCE_MOVE_${randomUUID()}`;

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function reference(submission, itemId, expectedVersion = submission.version) {
  return { submissionId: submission.id, expectedSubmissionVersion: expectedVersion, itemId };
}

function findItem(payload, itemId) {
  return Object.values(payload.inventory ?? {}).flat().find((item) => item.id === itemId);
}

function withoutCanonicalProduct(item) {
  const rest = { ...item };
  delete rest.productId;
  delete rest.brand;
  delete rest.model;
  return rest;
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

async function callPreflight(tx, adminId, sourceId, targetId, references) {
  await tx`set local role authenticated`;
  await tx`select set_config('request.jwt.claim.sub', ${adminId}, true)`;
  const [row] = await tx`select public.admin_product_reference_move_preflight(${sourceId}, ${targetId}, ${tx.json(references)}) as data`;
  await tx`reset role`;
  return row.data;
}

async function callMove(tx, adminId, sourceId, targetId, references) {
  await tx`set local role authenticated`;
  await tx`select set_config('request.jwt.claim.sub', ${adminId}, true)`;
  const [row] = await tx`select public.admin_move_product_references(${sourceId}, ${targetId}, ${tx.json(references)}) as data`;
  await tx`reset role`;
  return row.data;
}

async function callDependencies(tx, adminId, productId) {
  await tx`set local role authenticated`;
  await tx`select set_config('request.jwt.claim.sub', ${adminId}, true)`;
  const [row] = await tx`select public.admin_product_dependencies(${productId}) as data`;
  await tx`reset role`;
  return row.data;
}

try {
  await sql.begin(async (tx) => {
    const suffix = randomUUID().slice(0, 8);
    const adminId = await createAuthUser(tx, "move-admin");
    const stationUserId = await createAuthUser(tx, "move-station-user");
    await tx`insert into public.super_admins (auth_user_id, username) values (${adminId}, ${`move-admin-${suffix}`})`;

    const [station] = await tx`insert into public.stations (name) values (${`Move Station ${suffix}`}) returning id`;
    await tx`insert into public.station_accounts (auth_user_id, station_id, username) values (${stationUserId}, ${station.id}, ${`move-station-${suffix}`})`;
    const [siteType] = await tx`insert into public.site_types (name) values (${`Move Type ${suffix}`}) returning id`;
    const [siteSubtype] = await tx`insert into public.site_subtypes (site_type_id, name) values (${siteType.id}, ${`Move Subtype ${suffix}`}) returning id`;

    const products = {};
    for (const [key, brand, model, active = true] of [
      ["source", "Move Source", `Model ${suffix}`],
      ["target", "Move Target", `Model ${suffix}`],
      ["other", "Move Other", `Model ${suffix}`],
      ["inactive", "Move Inactive", `Model ${suffix}`, false],
      ["q330", "Kinemetrics", `Q330 ${suffix}`],
      ["q330plus", "Kinemetrics", `Q330+ ${suffix}`],
    ]) {
      [products[key]] = await tx`
        insert into public.products (brand, model, active, source_origin, spreadsheet_synced)
        values (${brand}, ${model}, ${active}, 'ADMIN', false)
        returning id, brand, model, active
      `;
    }

    async function createSubmission(items, options = {}) {
      const [site] = await tx`
        insert into public.sites (station_id, site_type_id, name)
        values (${station.id}, ${siteType.id}, ${`Move Site ${randomUUID()}`})
        returning id
      `;
      const payload = {
        siteId: site.id,
        siteSubtypeId: siteSubtype.id,
        metadata: { operator: "Verifier", retained: true },
        inventory: { Sensor: items, Pendukung: options.supportingItems ?? [], Kosong: [] },
      };
      const [submission] = await tx`
        insert into public.submissions (station_id, site_id, site_subtype_id, payload, version, archived_at)
        values (${station.id}, ${site.id}, ${siteSubtype.id}, ${tx.json(payload)}, ${options.version ?? 0}, ${options.archived ? new Date() : null})
        returning id, site_id, version, payload
      `;
      if (options.lockAgeMinutes !== undefined) {
        await tx`
          update public.submissions
          set locked_by_session_id = ${randomUUID()}, lock_operator_name = 'Verifier Lock',
              lock_last_activity_at = now() - (${options.lockAgeMinutes} * interval '1 minute')
          where id = ${submission.id}
        `;
      }
      return submission;
    }

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${stationUserId}, true)`;
    await tx.unsafe(`do $$ begin perform public.admin_product_reference_move_preflight(${literal(products.source.id)}::uuid, ${literal(products.target.id)}::uuid, '[]'::jsonb); raise exception 'station_move_preflight_was_not_blocked'; exception when insufficient_privilege then null; end $$;`);
    await tx.unsafe(`do $$ begin perform public.admin_move_product_references(${literal(products.source.id)}::uuid, ${literal(products.target.id)}::uuid, '[]'::jsonb); raise exception 'station_move_was_not_blocked'; exception when insufficient_privilege then null; end $$;`);
    await tx`reset role`;

    const richItem = {
      id: "single-rich",
      itemKind: "product",
      productId: products.source.id,
      brand: products.source.brand,
      model: products.source.model,
      quantity: 5,
      condition: "BAIK",
      installYear: "2024",
      notes: "Tetap utuh",
      functionCategories: ["Sensor Suhu", "Sensor Kelembaban"],
      functionCategoryIds: [randomUUID(), randomUUID()],
      units: Array.from({ length: 5 }, (_, index) => ({ serialNumber: `SERIAL-${index + 1}`, condition: index ? "BAIK" : "RUSAK", installYear: 2020 + index, notes: `Unit ${index + 1}` })),
      legacyMetadata: { source: "fixture", nested: { retained: true } },
    };
    const untouchedSibling = { id: "single-sibling", itemKind: "product", productId: products.other.id, brand: products.other.brand, model: products.other.model, quantity: 1, notes: "Tidak dipilih" };
    const single = await createSubmission([richItem, untouchedSibling], { version: 8, supportingItems: [{ id: "supporting", notes: "Urutan kategori tetap" }] });
    const [historyProposal] = await tx`
      insert into public.product_proposals (station_id, submission_id, created_by_auth_user, proposed_brand, proposed_model, normalized_brand, normalized_model, status, resolved_product_id)
      values (${station.id}, ${single.id}, ${stationUserId}, 'Legacy Source', 'Resolved', 'legacy source', 'resolved', 'APPROVED', ${products.source.id})
      returning id, resolved_product_id
    `;
    const [historyAlias] = await tx`
      insert into public.product_aliases (product_id, brand_alias, model_alias, normalized_brand, normalized_model, source_proposal_id)
      values (${products.source.id}, 'Legacy Source', 'Resolved', 'legacy source', 'resolved', ${historyProposal.id})
      returning id, product_id
    `;
    const singlePreflight = await callPreflight(tx, adminId, products.source.id, products.target.id, [reference(single, richItem.id)]);
    assert.equal(singlePreflight.status, "ready");
    assert.deepEqual(
      { references: singlePreflight.referenceCount, units: singlePreflight.unitCount, sites: singlePreflight.siteCount, submissions: singlePreflight.submissionCount },
      { references: 1, units: 5, sites: 1, submissions: 1 },
    );
    const singleResult = await callMove(tx, adminId, products.source.id, products.target.id, [reference(single, richItem.id)]);
    assert.equal(singleResult.status, "moved");
    const [singleAfter] = await tx`select payload, version from public.submissions where id = ${single.id}`;
    assert.equal(singleAfter.version, 9, "Satu submission harus naik tepat satu version.");
    const movedRich = findItem(singleAfter.payload, richItem.id);
    assert.deepEqual({ productId: movedRich.productId, brand: movedRich.brand, model: movedRich.model }, { productId: products.target.id, brand: products.target.brand, model: products.target.model });
    assert.deepEqual(withoutCanonicalProduct(movedRich), withoutCanonicalProduct(richItem), "Metadata item dan unit tidak boleh berubah.");
    assert.deepEqual(findItem(singleAfter.payload, untouchedSibling.id), untouchedSibling, "Item yang tidak dipilih tidak boleh berubah.");
    assert.deepEqual(singleAfter.payload.inventory.Pendukung, [{ id: "supporting", notes: "Urutan kategori tetap" }]);
    assert.deepEqual(singleAfter.payload.inventory.Kosong, [], "Kategori inventory kosong tidak boleh hilang.");
    const [historyAfter] = await tx`select resolved_product_id from public.product_proposals where id = ${historyProposal.id}`;
    const [aliasAfter] = await tx`select product_id from public.product_aliases where id = ${historyAlias.id}`;
    assert.equal(historyAfter.resolved_product_id, products.source.id, "QC history tidak boleh dipindahkan.");
    assert.equal(aliasAfter.product_id, products.source.id, "Alias tidak boleh dipindahkan.");
    const [singleAudit] = await tx`select count(*)::integer as count, min((metadata ->> 'oldSubmissionVersion')::integer) as old_version, min((metadata ->> 'newSubmissionVersion')::integer) as new_version from public.admin_audit_log where action = 'PRODUCT_REFERENCE_MOVE' and target_id = ${single.id}`;
    assert.deepEqual(singleAudit, { count: 1, old_version: 8, new_version: 9 });

    const sameSubmission = await createSubmission([
      { id: "same-a", productId: products.source.id, brand: products.source.brand, model: products.source.model, quantity: 2 },
      { id: "same-b", productId: products.source.id, brand: products.source.brand, model: products.source.model, quantity: 3 },
      { id: "same-c", productId: products.source.id, brand: products.source.brand, model: products.source.model, quantity: 1 },
    ], { version: 4 });
    const sameResult = await callMove(tx, adminId, products.source.id, products.target.id, [reference(sameSubmission, "same-a"), reference(sameSubmission, "same-b"), reference(sameSubmission, "same-c")]);
    assert.equal(sameResult.status, "moved");
    const [sameAfter] = await tx`select payload, version from public.submissions where id = ${sameSubmission.id}`;
    assert.equal(sameAfter.version, 5, "Beberapa item pada submission yang sama hanya boleh menaikkan version sekali.");
    assert.equal(findItem(sameAfter.payload, "same-a").productId, products.target.id);
    assert.equal(findItem(sameAfter.payload, "same-b").productId, products.target.id);
    assert.equal(findItem(sameAfter.payload, "same-c").productId, products.target.id);

    const multiA = await createSubmission([{ id: "multi-a", productId: products.source.id, brand: products.source.brand, model: products.source.model }], { version: 1 });
    const multiB = await createSubmission([{ id: "multi-b", productId: products.source.id, brand: products.source.brand, model: products.source.model }], { version: 2 });
    const multiResult = await callMove(tx, adminId, products.source.id, products.target.id, [reference(multiA, "multi-a"), reference(multiB, "multi-b")]);
    assert.equal(multiResult.status, "moved");
    assert.equal(multiResult.submissionVersions.length, 2);
    const multiRows = await tx`select id, payload, version from public.submissions where id in (${multiA.id}, ${multiB.id})`;
    const multiById = new Map(multiRows.map((row) => [row.id, row]));
    assert.equal(multiById.get(multiA.id).version, 2);
    assert.equal(multiById.get(multiB.id).version, 3);
    assert.equal(findItem(multiById.get(multiA.id).payload, "multi-a").productId, products.target.id);
    assert.equal(findItem(multiById.get(multiB.id).payload, "multi-b").productId, products.target.id);

    const staleA = await createSubmission([{ id: "stale-a", productId: products.source.id, brand: products.source.brand, model: products.source.model }], { version: 3 });
    const staleB = await createSubmission([{ id: "stale-b", productId: products.source.id, brand: products.source.brand, model: products.source.model }], { version: 7 });
    const staleResult = await callMove(tx, adminId, products.source.id, products.target.id, [reference(staleA, "stale-a"), reference(staleB, "stale-b", 6)]);
    assert.equal(staleResult.status, "version_conflict");
    const staleRows = await tx`select id, payload, version from public.submissions where id in (${staleA.id}, ${staleB.id}) order by id`;
    assert.ok(staleRows.every((row) => findItem(row.payload, row.id === staleA.id ? "stale-a" : "stale-b").productId === products.source.id), "Version conflict harus rollback seluruh batch.");
    assert.deepEqual(staleRows.map((row) => row.version).sort((a, b) => a - b), [3, 7]);
    const [staleAudits] = await tx`select count(*)::integer as count from public.admin_audit_log where action = 'PRODUCT_REFERENCE_MOVE' and target_id in (${staleA.id}, ${staleB.id})`;
    assert.equal(staleAudits.count, 0, "Operasi gagal tidak boleh menulis success audit.");

    const concurrent = await createSubmission([{ id: "concurrent", productId: products.source.id, brand: products.source.brand, model: products.source.model, notes: "Sebelum update sah" }], { version: 2 });
    assert.equal((await callPreflight(tx, adminId, products.source.id, products.target.id, [reference(concurrent, "concurrent")])).status, "ready");
    await tx`update public.submissions set payload = jsonb_set(payload, '{metadata,concurrentUpdate}', 'true'::jsonb, true), version = version + 1 where id = ${concurrent.id}`;
    assert.equal((await callMove(tx, adminId, products.source.id, products.target.id, [reference(concurrent, "concurrent")])).status, "version_conflict");
    const [concurrentAfter] = await tx`select payload, version from public.submissions where id = ${concurrent.id}`;
    assert.equal(concurrentAfter.version, 3);
    assert.equal(concurrentAfter.payload.metadata.concurrentUpdate, true, "Perubahan sah pihak lain harus dipertahankan.");
    assert.equal(findItem(concurrentAfter.payload, "concurrent").productId, products.source.id, "Execute stale tidak boleh menimpa product reference.");

    const activeLock = await createSubmission([{ id: "active-lock", productId: products.source.id, brand: products.source.brand, model: products.source.model }], { version: 1, lockAgeMinutes: 1 });
    const activeLockResult = await callMove(tx, adminId, products.source.id, products.target.id, [reference(activeLock, "active-lock")]);
    assert.equal(activeLockResult.status, "active_lock");
    const expiredLock = await createSubmission([{ id: "expired-lock", productId: products.source.id, brand: products.source.brand, model: products.source.model }], { version: 1, lockAgeMinutes: 6 });
    const expiredResult = await callMove(tx, adminId, products.source.id, products.target.id, [reference(expiredLock, "expired-lock")]);
    assert.equal(expiredResult.status, "moved", "Lock lewat 5 menit tidak boleh dianggap aktif.");

    const missing = await createSubmission([{ id: "existing", productId: products.source.id, brand: products.source.brand, model: products.source.model }]);
    assert.equal((await callMove(tx, adminId, products.source.id, products.target.id, [reference(missing, "missing")])).status, "missing_item");
    const mismatch = await createSubmission([{ id: "mismatch", productId: products.other.id, brand: products.other.brand, model: products.other.model }]);
    assert.equal((await callMove(tx, adminId, products.source.id, products.target.id, [reference(mismatch, "mismatch")])).status, "source_mismatch");
    assert.equal((await callMove(tx, adminId, products.source.id, products.source.id, [reference(missing, "existing")])).status, "same_product");
    assert.equal((await callMove(tx, adminId, products.source.id, products.inactive.id, [reference(missing, "existing")])).status, "target_inactive");
    const archived = await createSubmission([{ id: "archived", productId: products.source.id, brand: products.source.brand, model: products.source.model }], { archived: true });
    assert.equal((await callMove(tx, adminId, products.source.id, products.target.id, [reference(archived, "archived")])).status, "archived_submission");

    const [pendingProposal] = await tx`
      insert into public.product_proposals (station_id, created_by_auth_user, proposed_brand, proposed_model, normalized_brand, normalized_model, status)
      values (${station.id}, ${stationUserId}, 'Pending', ${`Move ${suffix}`}, 'pending', ${`move ${suffix}`}, 'PENDING') returning id
    `;
    const proposalOnly = await createSubmission([{ id: "proposal-only", productProposalId: pendingProposal.id, brand: "Pending", model: `Move ${suffix}` }]);
    assert.equal((await callMove(tx, adminId, products.source.id, products.target.id, [reference(proposalOnly, "proposal-only")])).status, "unsupported_reference");
    const mixedIdentity = await createSubmission([{ id: "mixed-identity", productId: products.source.id, productProposalId: pendingProposal.id, brand: products.source.brand, model: products.source.model }]);
    assert.equal((await callMove(tx, adminId, products.source.id, products.target.id, [reference(mixedIdentity, "mixed-identity")])).status, "unsupported_reference");

    const alreadyTargetSite = await createSubmission([
      { id: "already-target", productId: products.target.id, brand: products.target.brand, model: products.target.model },
      { id: "move-into-target", productId: products.source.id, brand: products.source.brand, model: products.source.model },
    ]);
    const targetBeforeDedupe = await callDependencies(tx, adminId, products.target.id);
    assert.equal((await callMove(tx, adminId, products.source.id, products.target.id, [reference(alreadyTargetSite, "move-into-target")])).status, "moved");
    const targetAfterDedupe = await callDependencies(tx, adminId, products.target.id);
    assert.equal(targetAfterDedupe.preflight.currentSiteCount, targetBeforeDedupe.preflight.currentSiteCount, "Target yang sudah dipakai di Site sama tidak boleh menambah distinct Site.");
    assert.equal(targetAfterDedupe.preflight.currentDirectReferenceCount, targetBeforeDedupe.preflight.currentDirectReferenceCount + 1);

    const exactCanonical = await createSubmission([{ id: "q330-exact", productId: products.q330.id, brand: products.q330.brand, model: products.q330.model }]);
    assert.equal((await callMove(tx, adminId, products.q330.id, products.q330plus.id, [reference(exactCanonical, "q330-exact")])).status, "moved");
    const [exactAfter] = await tx`select payload from public.submissions where id = ${exactCanonical.id}`;
    assert.equal(findItem(exactAfter.payload, "q330-exact").productId, products.q330plus.id, "UUID Q330 dan Q330+ harus tetap dibedakan secara exact.");

    const [sourceAfter] = await tx`select active from public.products where id = ${products.source.id}`;
    assert.equal(sourceAfter.active, true, "Pemindahan referensi tidak boleh menonaktifkan Produk sumber.");
    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}

console.log("Verifikasi pemindahan referensi Produk lulus; direct-only, preservasi payload, version, lock, atomic conflict, audit, QC history, dan rollback fixture teruji.");
