import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { resolveLocalDatabaseUrl } from "./master/database-connection.mjs";

const databaseUrl = resolveLocalDatabaseUrl();
const sql = postgres(databaseUrl, { ssl: false, max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_STATION_COMPLETION_${randomUUID()}`;

const WAREHOUSE_TYPE_ID = "da5d00b1-cd15-4b1d-8087-1057eb31c7d8";
const WAREHOUSE_SUBTYPE_ID = "346cfc56-437c-4c5d-9c6b-c9f75926a31c";
const WAREHOUSE_PROFILE_ID = "78b3c5db-2606-43fb-bd5e-ab6e379b9e6e";

function inventory(names, options = {}) {
  return Object.fromEntries(names.map((name, index) => [name, [{
    id: randomUUID(),
    brand: options.brand ?? "Verifier",
    model: `${options.model ?? "Model"} ${index + 1}`,
    quantity: options.quantity ?? 0,
    ...(options.productProposalId ? { productProposalId: options.productProposalId } : {}),
    ...(options.functionCategories ? { functionCategories: options.functionCategories } : {}),
  }]]));
}

async function createStation(tx, name) {
  const [row] = await tx`insert into public.stations (name) values (${`VERIFY COMPLETION ${name} ${randomUUID()}`}) returning id, name`;
  return row;
}

async function createProfile(tx, name, count, labels) {
  const [profile] = await tx`insert into public.item_profiles (name) values (${`VERIFY PROFILE ${name} ${randomUUID()}`}) returning id`;
  const itemNames = labels ?? Array.from({ length: count }, (_, index) => `${name} Category ${index + 1} ${randomUUID()}`);
  const createdItems = await tx`insert into public.items ${tx(itemNames.map((itemName) => ({ name: itemName })))} returning id, name`;
  await tx`insert into public.profile_items ${tx(createdItems.map((item) => ({ item_profile_id: profile.id, item_id: item.id })))}`;
  return { id: profile.id, items: createdItems };
}

async function createTypeContext(tx, name, profileId, requiresAssignment = false) {
  const [siteType] = await tx`insert into public.site_types (name, requires_site_subtype_assignment) values (${`VERIFY TYPE ${name} ${randomUUID()}`}, ${requiresAssignment}) returning id`;
  const [subtype] = await tx`insert into public.site_subtypes (site_type_id, item_profile_id, name) values (${siteType.id}, ${profileId}, ${`VERIFY SUBTYPE ${name} ${randomUUID()}`}) returning id, name`;
  return { siteType, subtype };
}

async function createSite(tx, stationId, siteTypeId, name, active = true) {
  const [site] = await tx`insert into public.sites (station_id, site_type_id, name, active) values (${stationId}, ${siteTypeId}, ${`VERIFY SITE ${name} ${randomUUID()}`}, ${active}) returning id, name`;
  return site;
}

async function createSubmission(tx, stationId, siteId, subtypeId, payload, extra = {}) {
  const [submission] = await tx`
    insert into public.submissions (station_id, site_id, site_subtype_id, payload, version, last_saved_at, archived_at)
    values (${stationId}, ${siteId}, ${subtypeId}, ${tx.json(payload)}, ${extra.version ?? 1}, ${extra.lastSavedAt ?? null}, ${extra.archivedAt ?? null})
    returning id, version
  `;
  return submission;
}

function byName(rows, name) {
  const row = rows.find((candidate) => candidate.station_name === name);
  assert.ok(row, `Summary ${name} harus tersedia.`);
  return row;
}

try {
  await sql.begin(async (tx) => {
    const adminAuthId = randomUUID();
    const stationAuthId = randomUUID();
    await tx`insert into auth.users (id, email) values (${adminAuthId}, ${`completion-admin-${adminAuthId}@verify.local`}), (${stationAuthId}, ${`completion-station-${stationAuthId}@verify.local`})`;
    await tx`insert into public.super_admins (auth_user_id, username) values (${adminAuthId}, ${`completion.admin.${adminAuthId}`})`;

    const profile3 = await createProfile(tx, "THREE", 3);
    const context3 = await createTypeContext(tx, "THREE", profile3.id);

    const completeStation = await createStation(tx, "COMPLETE");
    const completeSite = await createSite(tx, completeStation.id, context3.siteType.id, "COMPLETE");
    const completeSavedAt = new Date("2026-08-24T01:02:03.000Z");
    const completeSubmission = await createSubmission(tx, completeStation.id, completeSite.id, context3.subtype.id, {
      inventory: inventory(profile3.items.map((item) => item.name)),
      siteMetadata: { wigosId: "ignored", latitude: "-6.2", addressDetail: "ignored" },
    }, { lastSavedAt: completeSavedAt });

    const partialStation = await createStation(tx, "PARTIAL");
    const partialSite = await createSite(tx, partialStation.id, context3.siteType.id, "PARTIAL");
    await createSubmission(tx, partialStation.id, partialSite.id, context3.subtype.id, { inventory: inventory([profile3.items[0].name]) });

    const emptyStation = await createStation(tx, "EMPTY");
    const emptySite = await createSite(tx, emptyStation.id, context3.siteType.id, "EMPTY");
    await createSubmission(tx, emptyStation.id, emptySite.id, context3.subtype.id, { inventory: { [profile3.items[0].name]: [] }, siteMetadata: { wigosId: "complete metadata" } });

    const notStartedStation = await createStation(tx, "NOT STARTED");
    await createSite(tx, notStartedStation.id, context3.siteType.id, "NOT STARTED");

    const profile10 = await createProfile(tx, "TEN", 10);
    const profile20 = await createProfile(tx, "TWENTY", 20);
    const context10 = await createTypeContext(tx, "TEN", profile10.id);
    const context20 = await createTypeContext(tx, "TWENTY", profile20.id);
    const denominatorStation = await createStation(tx, "MISSING DENOMINATOR");
    const denominatorSite10 = await createSite(tx, denominatorStation.id, context10.siteType.id, "TEN");
    await createSite(tx, denominatorStation.id, context20.siteType.id, "TWENTY");
    await createSubmission(tx, denominatorStation.id, denominatorSite10.id, context10.subtype.id, { inventory: inventory(profile10.items.map((item) => item.name)) });

    const proposalProfile = await createProfile(tx, "PROPOSAL", 1);
    const proposalContext = await createTypeContext(tx, "PROPOSAL", proposalProfile.id);
    const proposalStation = await createStation(tx, "PROPOSAL");
    const proposalSite = await createSite(tx, proposalStation.id, proposalContext.siteType.id, "PROPOSAL");
    const proposalId = randomUUID();
    const proposalSubmission = await createSubmission(tx, proposalStation.id, proposalSite.id, proposalContext.subtype.id, {
      inventory: inventory([proposalProfile.items[0].name], { productProposalId: proposalId }),
    });
    await tx`
      insert into public.product_proposals (
        id, station_id, submission_id, created_by_auth_user,
        proposed_brand, proposed_model, normalized_brand, normalized_model, status
      ) values (
        ${proposalId}, ${proposalStation.id}, ${proposalSubmission.id}, ${stationAuthId},
        'Verifier', 'Proposal', 'verifier', 'proposal', 'PENDING'
      )
    `;

    await tx`insert into public.item_profiles (id, name) values (${WAREHOUSE_PROFILE_ID}, ${`VERIFY WAREHOUSE PROFILE ${randomUUID()}`}) on conflict (id) do nothing`;
    await tx`insert into public.site_types (id, name) values (${WAREHOUSE_TYPE_ID}, ${`VERIFY WAREHOUSE TYPE ${randomUUID()}`}) on conflict (id) do nothing`;
    await tx`insert into public.site_subtypes (id, site_type_id, item_profile_id, name) values (${WAREHOUSE_SUBTYPE_ID}, ${WAREHOUSE_TYPE_ID}, ${WAREHOUSE_PROFILE_ID}, ${`VERIFY WAREHOUSE SUBTYPE ${randomUUID()}`}) on conflict (id) do nothing`;

    const warehouseAbsentStation = await createStation(tx, "WAREHOUSE ABSENT");
    await createSite(tx, warehouseAbsentStation.id, WAREHOUSE_TYPE_ID, "WAREHOUSE ABSENT");
    const warehousePresentStation = await createStation(tx, "WAREHOUSE PRESENT EMPTY");
    const warehousePresentSite = await createSite(tx, warehousePresentStation.id, WAREHOUSE_TYPE_ID, "WAREHOUSE PRESENT");
    await createSubmission(tx, warehousePresentStation.id, warehousePresentSite.id, WAREHOUSE_SUBTYPE_ID, { inventory: {} });

    const noSiteStation = await createStation(tx, "NO SITE");

    const archivedStation = await createStation(tx, "ARCHIVED ONLY");
    const archivedSite = await createSite(tx, archivedStation.id, context3.siteType.id, "ARCHIVED");
    await createSubmission(tx, archivedStation.id, archivedSite.id, context3.subtype.id, { inventory: inventory(profile3.items.map((item) => item.name)) }, { archivedAt: new Date("2026-08-20T00:00:00.000Z") });

    const inactiveStation = await createStation(tx, "INACTIVE SITE EXCLUDED");
    const inactiveActiveSite = await createSite(tx, inactiveStation.id, context3.siteType.id, "ACTIVE");
    await createSite(tx, inactiveStation.id, context3.siteType.id, "INACTIVE", false);
    await createSubmission(tx, inactiveStation.id, inactiveActiveSite.id, context3.subtype.id, { inventory: inventory(profile3.items.map((item) => item.name)) });

    const unexpectedProfile = await createProfile(tx, "UNEXPECTED", 1);
    const unexpectedContext = await createTypeContext(tx, "UNEXPECTED", unexpectedProfile.id, false);
    const [expectedSubtype] = await tx`insert into public.site_subtypes (site_type_id, item_profile_id, name) values (${unexpectedContext.siteType.id}, ${unexpectedProfile.id}, ${`VERIFY EXPECTED SUBTYPE ${randomUUID()}`}) returning id`;
    const unexpectedStation = await createStation(tx, "UNEXPECTED");
    const unexpectedSite = await createSite(tx, unexpectedStation.id, unexpectedContext.siteType.id, "UNEXPECTED");
    await createSubmission(tx, unexpectedStation.id, unexpectedSite.id, unexpectedContext.subtype.id, { inventory: inventory([unexpectedProfile.items[0].name]) });
    await tx`update public.site_types set requires_site_subtype_assignment = true where id = ${unexpectedContext.siteType.id}`;
    await tx`insert into public.site_subtype_assignments (site_id, site_subtype_id, site_type_id) values (${unexpectedSite.id}, ${expectedSubtype.id}, ${unexpectedContext.siteType.id})`;

    const combinedNames = [`Combined Temperature ${randomUUID()}`, `Combined Humidity ${randomUUID()}`];
    const combinedProfile = await createProfile(tx, "COMBINED", 2, combinedNames);
    const combinedContext = await createTypeContext(tx, "COMBINED", combinedProfile.id);
    const combinedStation = await createStation(tx, "COMBINED");
    const combinedSite = await createSite(tx, combinedStation.id, combinedContext.siteType.id, "COMBINED");
    await createSubmission(tx, combinedStation.id, combinedSite.id, combinedContext.subtype.id, {
      inventory: inventory([combinedNames[0]], { functionCategories: combinedNames }),
    });

    const materialProfile = await createProfile(tx, "MATERIAL", 1);
    const materialContext = await createTypeContext(tx, "MATERIAL", materialProfile.id);
    const materialStation = await createStation(tx, "MATERIAL");
    const materialSite = await createSite(tx, materialStation.id, materialContext.siteType.id, "MATERIAL");
    await createSubmission(tx, materialStation.id, materialSite.id, materialContext.subtype.id, {
      inventory: { [materialProfile.items[0].name]: [{ id: randomUUID(), itemKind: "material", material: "Tiang galvanis", quantity: 0 }] },
    });

    const awosProfile = await createProfile(tx, "AWOS ASSIGNMENT", 1);
    const [awosType] = await tx`insert into public.site_types (name, requires_site_subtype_assignment) values (${`VERIFY AWOS III ${randomUUID()}`}, true) returning id`;
    const awosSubtypes = await tx`insert into public.site_subtypes ${tx(["End Point", "Mid", "Station", "TDZ"].map((suffix) => ({ site_type_id: awosType.id, item_profile_id: awosProfile.id, name: `VERIFY AWOS ${suffix} ${randomUUID()}` })))} returning id`;
    const awosStation = await createStation(tx, "AWOS FOUR");
    const awosSite = await createSite(tx, awosStation.id, awosType.id, "AWOS FOUR");
    await tx`insert into public.site_subtype_assignments ${tx(awosSubtypes.map((subtype) => ({ site_id: awosSite.id, site_subtype_id: subtype.id, site_type_id: awosType.id })))}`;

    await tx`insert into public.station_accounts (auth_user_id, station_id, username) values (${stationAuthId}, ${completeStation.id}, ${`completion.station.${stationAuthId}`})`;

    const [metadataEmpty] = await tx`select * from public.submission_progress(${tx.json({ inventory: inventory(profile3.items.map((item) => item.name)), siteMetadata: {} })}, ${profile3.id})`;
    const [metadataFull] = await tx`select * from public.submission_progress(${tx.json({ inventory: inventory(profile3.items.map((item) => item.name)), siteMetadata: { wigosId: 'full', serialNumber: '', condition: '' } })}, ${profile3.id})`;
    assert.deepEqual(metadataEmpty, metadataFull, "Metadata dan Unit optional tidak boleh mengubah progress.");

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${stationAuthId}, true)`;
    await tx.unsafe(`
      do $$
      begin
        perform public.admin_station_completion_summary();
        raise exception 'station_completion_admin_rpc_was_not_blocked';
      exception when insufficient_privilege then null;
      end
      $$;
    `);
    await tx`reset role`;
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${adminAuthId}, true)`;

    const [response] = await tx`select public.admin_station_completion_summary() as result`;
    const rows = response.result.rows;

    const complete = byName(rows, completeStation.name);
    assert.equal(complete.station_status, "LENGKAP");
    assert.equal(complete.complete_submission_count, 1);
    assert.equal(complete.expected_category_count, 3);
    assert.equal(complete.filled_category_count, 3);
    assert.equal(new Date(complete.content_last_updated).toISOString(), completeSavedAt.toISOString());

    const partial = byName(rows, partialStation.name);
    assert.equal(partial.station_status, "TERISI_SEBAGIAN");
    assert.equal(partial.partial_submission_count, 1);
    assert.equal(partial.filled_category_count, 1);

    const empty = byName(rows, emptyStation.name);
    assert.equal(empty.empty_submission_count, 1);
    assert.equal(empty.station_status, "TERISI_SEBAGIAN");

    const notStarted = byName(rows, notStartedStation.name);
    assert.equal(notStarted.not_started_count, 1);
    assert.equal(notStarted.station_status, "BELUM_DIMULAI");

    const denominator = byName(rows, denominatorStation.name);
    assert.equal(denominator.expected_submission_count, 2);
    assert.equal(denominator.existing_submission_count, 1);
    assert.equal(denominator.expected_category_count, 30);
    assert.equal(denominator.filled_category_count, 10);
    assert.equal(denominator.category_progress, 33);

    const proposal = byName(rows, proposalStation.name);
    assert.equal(proposal.filled_category_count, 1);
    assert.equal(proposal.pending_qc_count, 1);
    assert.equal(proposal.station_status, "LENGKAP");

    const warehouseAbsent = byName(rows, warehouseAbsentStation.name);
    assert.equal(warehouseAbsent.not_started_count, 1);
    assert.equal(warehouseAbsent.station_status, "BELUM_DIMULAI");
    assert.equal(warehouseAbsent.category_progress, null);

    const warehousePresent = byName(rows, warehousePresentStation.name);
    assert.equal(warehousePresent.warehouse_existing_count, 1);
    assert.equal(warehousePresent.warehouse_category_count, 0);
    assert.equal(warehousePresent.warehouse_unit_count, 0);
    assert.equal(warehousePresent.category_progress, null);
    assert.equal(warehousePresent.station_status, "LENGKAP");

    const noSite = byName(rows, noSiteStation.name);
    assert.equal(noSite.station_status, "PERLU_PERHATIAN");
    assert.ok(noSite.issues.some((issue) => issue.code === "station_has_no_active_site" && issue.label === "Belum Ada Konfigurasi"));

    const archived = byName(rows, archivedStation.name);
    assert.equal(archived.existing_submission_count, 0);
    assert.equal(archived.not_started_count, 1);
    assert.equal(archived.station_status, "BELUM_DIMULAI");

    const inactive = byName(rows, inactiveStation.name);
    assert.equal(inactive.site_count, 1);
    assert.equal(inactive.expected_submission_count, 1);
    assert.equal(inactive.station_status, "LENGKAP");

    const unexpected = byName(rows, unexpectedStation.name);
    assert.equal(unexpected.unexpected_submission_count, 1);
    assert.ok(unexpected.attention_count > 0);
    assert.equal(unexpected.station_status, "PERLU_PERHATIAN");

    const combined = byName(rows, combinedStation.name);
    assert.equal(combined.expected_category_count, 2);
    assert.equal(combined.filled_category_count, 2);
    assert.equal(combined.station_status, "LENGKAP");

    const material = byName(rows, materialStation.name);
    assert.equal(material.filled_category_count, 1);
    assert.equal(material.station_status, "LENGKAP");

    const awos = byName(rows, awosStation.name);
    assert.equal(awos.expected_submission_count, 4);
    assert.equal(awos.expected_category_count, 4);

    for (const row of rows.filter((candidate) => candidate.station_name.startsWith("VERIFY COMPLETION"))) {
      assert.ok(row.filled_category_count >= 0 && row.filled_category_count <= row.expected_category_count);
      assert.ok(row.existing_submission_count <= row.expected_submission_count);
      assert.equal(
        row.expected_submission_count,
        row.complete_submission_count
          + row.partial_submission_count
          + row.empty_submission_count
          + row.not_started_count
          + row.expected_attention_count
          + row.warehouse_existing_count,
        `Bucket identity gagal untuk ${row.station_name}`,
      );
      if (row.station_status === "LENGKAP") {
        assert.equal(row.not_started_count, 0);
        assert.equal(row.partial_submission_count, 0);
        assert.equal(row.empty_submission_count, 0);
        assert.equal(row.attention_count, 0);
      }
    }

    const [detailResponse] = await tx`select public.admin_station_completion_detail(${denominatorStation.id}) as result`;
    assert.equal(detailResponse.result.rows.length, 2);
    const missingRow = detailResponse.result.rows.find((row) => row.submission_id === null);
    assert.equal(missingRow.missing_categories.length, 20);
    assert.ok(missingRow.missing_categories.every((category) => category.id && category.label));

    await tx`reset role`;
    const [canonicalProgress] = await tx`select * from public.submission_progress((select payload from public.submissions where id = ${completeSubmission.id}), ${profile3.id})`;
    const [completionRow] = await tx`select filled_category_count, expected_category_count from public.station_completion_rows(${completeStation.id}) where is_expected`;
    assert.equal(completionRow.filled_category_count, canonicalProgress.filled_count);
    assert.equal(completionRow.expected_category_count, canonicalProgress.total_count);

    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (error instanceof Error && error.message === rollbackMarker) {
    console.log("Station completion verifier passed: 18 deterministic scenarios, authorization, identities, detail gaps, and canonical progress equivalence.");
  } else {
    throw error;
  }
} finally {
  await sql.end({ timeout: 5 });
}
