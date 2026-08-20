import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { CENGKARENG_AWOS_REMEDIATION, applyRemediation, backupFromPlan, inspectRemediation, rollbackRemediation } from "./cengkareng-awos-remediation-lib.mjs";
import { resolveLocalDatabaseUrl } from "./master/database-connection.mjs";

const sql = postgres(resolveLocalDatabaseUrl(), { max: 1 });
const rollbackMarker = `ROLLBACK_CENGKARENG_AWOS_${randomUUID()}`;

function assertReady(inspection) {
  assert.equal(inspection.ready, true, `Fixture harus READY: ${inspection.plan.map((entry) => entry.action).join(", ")}`);
}

async function createFixture(tx, { activeLock = false, targetCollision = false, profileMismatch = false } = {}) {
  const suffix = randomUUID();
  const [station] = await tx`insert into public.stations (name) values (${`VERIFY CENGKARENG STATION ${suffix}`}) returning id`;
  const [siteType] = await tx`insert into public.site_types (name) values (${`VERIFY CENGKARENG TYPE ${suffix}`}) returning id`;
  const [site] = await tx`
    insert into public.sites (station_id, site_type_id, name)
    values (${station.id}, ${siteType.id}, ${`VERIFY CENGKARENG ${suffix}`})
    returning id
  `;
  const roles = CENGKARENG_AWOS_REMEDIATION.roles;
  const sourceSubtypes = [];
  const targetSubtypes = [];
  const profileIds = [];
  const itemIds = [];
  for (const role of roles) {
    const [profile] = await tx`insert into public.item_profiles (name) values (${`VERIFY PROFILE ${role} ${suffix}`}) returning id`;
    const [item] = await tx`insert into public.items (name) values (${`VERIFY ITEM ${role} ${suffix}`}) returning id`;
    await tx`insert into public.profile_items (item_profile_id, item_id) values (${profile.id}, ${item.id})`;
    profileIds.push(profile.id);
    itemIds.push(item.id);
    let targetProfileId = profile.id;
    if (profileMismatch && role === "Mid") {
      const [differentProfile] = await tx`insert into public.item_profiles (name) values (${`VERIFY DIFFERENT PROFILE ${suffix}`}) returning id`;
      const [differentItem] = await tx`insert into public.items (name) values (${`VERIFY DIFFERENT ITEM ${suffix}`}) returning id`;
      await tx`insert into public.profile_items (item_profile_id, item_id) values (${differentProfile.id}, ${differentItem.id})`;
      profileIds.push(differentProfile.id);
      itemIds.push(differentItem.id);
      targetProfileId = differentProfile.id;
    }
    const [source] = await tx`
      insert into public.site_subtypes (site_type_id, item_profile_id, name)
      values (${siteType.id}, ${profile.id}, ${`AWOS Kategori III Coastal ${role}`})
      returning id
    `;
    const [target] = await tx`
      insert into public.site_subtypes (site_type_id, item_profile_id, name)
      values (${siteType.id}, ${targetProfileId}, ${`AWOS Kategori III AllWeather ${role}`})
      returning id
    `;
    sourceSubtypes.push(source);
    targetSubtypes.push(target);
  }
  const submissions = [];
  for (let index = 0; index < roles.length; index += 1) {
    const [submission] = await tx`
      insert into public.submissions (
        station_id, site_id, site_subtype_id, payload, version, operator_name,
        locked_by_session_id, lock_operator_name, lock_last_activity_at
      ) values (
        ${station.id}, ${site.id}, ${sourceSubtypes[index].id},
        ${tx.json({ schemaVersion: 1, stationId: station.id, siteId: site.id, siteSubtypeId: sourceSubtypes[index].id, inventory: {}, runwayAzimuth: "", siteMetadata: {} })},
        ${index + 3}, 'Verifier',
        ${activeLock && index === 0 ? randomUUID() : null},
        ${activeLock && index === 0 ? 'Verifier Lock' : null},
        ${activeLock && index === 0 ? new Date() : null}
      ) returning id, version
    `;
    submissions.push(submission);
  }
  if (targetCollision) {
    await tx`
      insert into public.submissions (station_id, site_id, site_subtype_id, payload, version)
      values (${station.id}, ${site.id}, ${targetSubtypes[0].id}, ${tx.json({ schemaVersion: 1, siteSubtypeId: targetSubtypes[0].id, inventory: {} })}, 1)
    `;
  }
  return {
    config: {
      ...CENGKARENG_AWOS_REMEDIATION,
      stationId: station.id,
      siteId: site.id,
      siteName: `VERIFY CENGKARENG ${suffix}`,
      siteTypeName: `VERIFY CENGKARENG TYPE ${suffix}`,
    },
    stationId: station.id,
    siteTypeId: siteType.id,
    profileIds,
    itemIds,
    submissions,
  };
}

async function deleteFixture(tx, fixture) {
  await tx`delete from public.submissions where station_id = ${fixture.stationId}`;
  await tx`delete from public.sites where station_id = ${fixture.stationId}`;
  await tx`delete from public.site_subtypes where site_type_id = ${fixture.siteTypeId}`;
  await tx`delete from public.profile_items where item_profile_id = any(${tx.array(fixture.profileIds, 2950)})`;
  await tx`delete from public.item_profiles where id = any(${tx.array(fixture.profileIds, 2950)})`;
  await tx`delete from public.items where id = any(${tx.array(fixture.itemIds, 2950)})`;
  await tx`delete from public.site_types where id = ${fixture.siteTypeId}`;
  await tx`delete from public.stations where id = ${fixture.stationId}`;
}

const racer = postgres(resolveLocalDatabaseUrl(), { max: 1 });
let atomicFixture = null;
try {
  try {
    await sql.begin(async (tx) => {
    const fixture = await createFixture(tx);
    const before = await inspectRemediation(tx, fixture.config);
    assertReady(before);
    const backup = backupFromPlan(before);
    const result = await applyRemediation(tx, fixture.config);
    assert.equal(result.changed, true);
    assert.equal(result.updated.length, 4);
    for (const entry of before.plan) {
      const updated = result.updated.find((row) => row.id === entry.submission.id);
      assert.equal(updated.site_subtype_id, entry.targetSubtype.id);
      assert.equal(updated.version, entry.submission.version + 1);
      assert.equal(updated.payload.siteSubtypeId, entry.targetSubtype.id);
    }
    const after = await inspectRemediation(tx, fixture.config);
    assert.equal(after.alreadyRemediated, true, "Rerun harus idempotent setelah seluruh pasangan dipindahkan.");
    const rerun = await applyRemediation(tx, fixture.config);
    assert.equal(rerun.changed, false, "Rerun tidak boleh membuat mutation kedua.");
    const rollback = await rollbackRemediation(tx, backup, fixture.config);
    assert.equal(rollback.length, 4);
    for (const entry of before.plan) {
      const restored = rollback.find((row) => row.id === entry.submission.id);
      assert.equal(restored.site_subtype_id, entry.sourceSubtype.id);
      assert.equal(restored.version, entry.submission.version + 2);
      assert.equal(restored.payload.siteSubtypeId, entry.sourceSubtype.id);
    }

    const lockedFixture = await createFixture(tx, { activeLock: true });
    const locked = await inspectRemediation(tx, lockedFixture.config);
    assert.equal(locked.plan[0].action, "BLOCKED_BY_ACTIVE_LOCK");
    await assert.rejects(() => applyRemediation(tx, lockedFixture.config), /REMEDIATION_NOT_READY/);

    const collisionFixture = await createFixture(tx, { targetCollision: true });
    const collision = await inspectRemediation(tx, collisionFixture.config);
    assert.equal(collision.plan[0].action, "TARGET_SUBMISSION_ALREADY_EXISTS");
    await assert.rejects(() => applyRemediation(tx, collisionFixture.config), /REMEDIATION_NOT_READY/);

    const mismatchFixture = await createFixture(tx, { profileMismatch: true });
    const mismatch = await inspectRemediation(tx, mismatchFixture.config);
    assert.equal(mismatch.plan.find((entry) => entry.role === "Mid").action, "PROFILE_MISMATCH");
    await assert.rejects(() => applyRemediation(tx, mismatchFixture.config), /REMEDIATION_NOT_READY/);

      throw new Error(rollbackMarker);
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
  }

  atomicFixture = await createFixture(sql);
  const atomicBefore = await inspectRemediation(sql, atomicFixture.config);
  assertReady(atomicBefore);
  const mid = atomicBefore.plan.find((entry) => entry.role === "Mid");
  await assert.rejects(() => applyRemediation(sql, atomicFixture.config, {
    onReady: async () => {
      await racer`
        insert into public.submissions (station_id, site_id, site_subtype_id, payload, version)
        values (
          ${atomicFixture.stationId}, ${atomicFixture.config.siteId}, ${mid.targetSubtype.id},
          ${racer.json({ schemaVersion: 1, siteSubtypeId: mid.targetSubtype.id, inventory: {} })}, 1
        )
      `;
    },
  }), /duplicate key/);
  const endpointBefore = atomicBefore.plan.find((entry) => entry.role === "End Point");
  const [endpointAfterFailure] = await sql`
    select site_subtype_id, version
    from public.submissions
    where id = ${endpointBefore.submission.id}
  `;
  assert.equal(endpointAfterFailure.site_subtype_id, endpointBefore.sourceSubtype.id, "Kegagalan Mid harus merollback End Point.");
  assert.equal(endpointAfterFailure.version, endpointBefore.submission.version, "Rollback transaksi tidak boleh menaikkan version End Point.");
} finally {
  if (atomicFixture) await sql.begin((tx) => deleteFixture(tx, atomicFixture));
  await racer.end({ timeout: 5 });
  await sql.end({ timeout: 5 });
}

console.log("Verifikasi remediation AWOS Cengkareng lulus; seluruh fixture lokal telah di-rollback.");
