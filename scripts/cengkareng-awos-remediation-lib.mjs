import { createHash } from "node:crypto";

export const CENGKARENG_AWOS_REMEDIATION = {
  siteId: "cd5167ab-e1b2-4939-8040-85dc4259d258",
  stationId: "f3f3a411-05c2-488b-82b7-57740c3c66cc",
  siteTypeName: "AWOS Kategori III",
  siteName: "AWOS All Weather Kat. 3 Cengkareng 25 L & 7 R",
  sourceFamily: "Coastal",
  targetFamily: "AllWeather",
  roles: ["End Point", "Mid", "Station", "TDZ"],
};

function fail(message) {
  throw new Error(message);
}

function one(rows, message) {
  if (rows.length !== 1) fail(message);
  return rows[0];
}

function subtypeName(family, role) {
  return `AWOS Kategori III ${family} ${role}`;
}

function payloadHash(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function findValuePaths(value, expected, path = "$") {
  if (value === expected) return [path];
  if (Array.isArray(value)) return value.flatMap((entry, index) => findValuePaths(entry, expected, `${path}[${index}]`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, entry]) => findValuePaths(entry, expected, `${path}.${key}`));
}

function payloadCompatibility(payload, sourceSubtypeId) {
  const paths = findValuePaths(payload, sourceSubtypeId);
  const allowed = paths.every((path) => path === "$.siteSubtypeId");
  return {
    paths,
    compatible: allowed,
    needsCanonicalSubtypePatch: paths.includes("$.siteSubtypeId"),
  };
}

function replacePayloadSubtype(payload, sourceSubtypeId, targetSubtypeId) {
  if (payload?.siteSubtypeId !== sourceSubtypeId) return payload;
  return { ...payload, siteSubtypeId: targetSubtypeId };
}

function lockState(submission) {
  if (!submission.locked_by_session_id) return "NO_LOCK";
  return submission.active_lock ? "BLOCKED_BY_ACTIVE_LOCK" : "EXPIRED_LOCK";
}

function sameList(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function profileContract(sql, profileId) {
  if (!profileId) return { profileId: null, items: [], names: [] };
  const rows = await sql`
    select profile_item.item_id, item.name
    from public.profile_items as profile_item
    join public.items as item on item.id = profile_item.item_id
    where profile_item.item_profile_id = ${profileId}
      and profile_item.active
      and item.active
    order by profile_item.item_id
  `;
  return {
    profileId,
    items: rows.map((row) => row.item_id),
    names: rows.map((row) => row.name),
  };
}

async function loadSite(sql, config) {
  const rows = await sql`
    select site.id, site.station_id, site.site_type_id, site.name, site.active,
      site_type.name as site_type_name
    from public.sites as site
    join public.site_types as site_type on site_type.id = site.site_type_id
    where site.id = ${config.siteId}
  `;
  const site = one(rows, "TARGET_SITE_NOT_FOUND");
  if (site.station_id !== config.stationId) fail("TARGET_STATION_MISMATCH");
  if (!site.active || site.site_type_name !== config.siteTypeName || site.name !== config.siteName) fail("TARGET_SITE_CONFIGURATION_MISMATCH");
  return site;
}

async function loadSubtypeMapping(sql, site, config) {
  const rows = await sql`
    select id, site_type_id, item_profile_id, name, active
    from public.site_subtypes
    where site_type_id = ${site.site_type_id}
  `;
  const mappings = [];
  for (const role of config.roles) {
    const source = one(rows.filter((row) => row.name === subtypeName(config.sourceFamily, role)), `SOURCE_SUBTYPE_AMBIGUOUS_${role}`);
    const target = one(rows.filter((row) => row.name === subtypeName(config.targetFamily, role)), `TARGET_SUBTYPE_AMBIGUOUS_${role}`);
    if (!source.active || !target.active || source.site_type_id !== site.site_type_id || target.site_type_id !== site.site_type_id) {
      fail(`SUBTYPE_CONFIGURATION_MISMATCH_${role}`);
    }
    const [sourceProfile, targetProfile] = await Promise.all([
      profileContract(sql, source.item_profile_id),
      profileContract(sql, target.item_profile_id),
    ]);
    const compatible = sourceProfile.profileId === targetProfile.profileId
      && sameList(sourceProfile.items, targetProfile.items)
      && sameList(sourceProfile.names, targetProfile.names);
    mappings.push({ role, source, target, sourceProfile, targetProfile, compatible });
  }
  return mappings;
}

async function loadSubmissions(sql, site, mappings, forUpdate) {
  const subtypeIds = mappings.flatMap((mapping) => [mapping.source.id, mapping.target.id]);
  const rows = await sql.unsafe(`
    select submission.id, submission.station_id, submission.site_id, submission.site_subtype_id,
      submission.payload, submission.version, submission.operator_name, submission.archived_at,
      submission.locked_by_session_id, submission.lock_operator_name, submission.lock_last_activity_at,
      submission.created_at, submission.updated_at, submission.last_saved_at,
      (submission.locked_by_session_id is not null
        and submission.lock_last_activity_at is not null
        and submission.lock_last_activity_at >= now() - interval '5 minutes') as active_lock
    from public.submissions as submission
    where submission.station_id = $1
      and submission.site_id = $2
      and submission.site_subtype_id = any($3::uuid[])
    order by submission.site_subtype_id, submission.id
    ${forUpdate ? "for update" : ""}
  `, [site.station_id, site.id, subtypeIds]);
  return rows;
}

function planAction(mapping, sourceSubmission, targetSubmission) {
  if (!mapping.compatible) return "PROFILE_MISMATCH";
  if (sourceSubmission && targetSubmission) return "TARGET_SUBMISSION_ALREADY_EXISTS";
  if (!sourceSubmission && targetSubmission) {
    const compatibility = payloadCompatibility(targetSubmission.payload, mapping.target.id);
    return compatibility.compatible ? "ALREADY_REMEDIATED" : "PAYLOAD_REQUIRES_REVIEW";
  }
  if (!sourceSubmission) return "SOURCE_SUBMISSION_NOT_FOUND";
  if (sourceSubmission.archived_at) return "SOURCE_SUBMISSION_ARCHIVED";
  if (lockState(sourceSubmission) === "BLOCKED_BY_ACTIVE_LOCK") return "BLOCKED_BY_ACTIVE_LOCK";
  return payloadCompatibility(sourceSubmission.payload, mapping.source.id).compatible ? "READY" : "PAYLOAD_REQUIRES_REVIEW";
}

export async function inspectRemediation(sql, config = CENGKARENG_AWOS_REMEDIATION, { forUpdate = false } = {}) {
  const site = await loadSite(sql, config);
  const mappings = await loadSubtypeMapping(sql, site, config);
  const submissions = await loadSubmissions(sql, site, mappings, forUpdate);
  const plan = mappings.map((mapping) => {
    const sourceSubmission = submissions.find((row) => row.site_subtype_id === mapping.source.id) ?? null;
    const targetSubmission = submissions.find((row) => row.site_subtype_id === mapping.target.id) ?? null;
    const payload = sourceSubmission ? payloadCompatibility(sourceSubmission.payload, mapping.source.id) : null;
    return {
      role: mapping.role,
      sourceSubtype: { id: mapping.source.id, name: mapping.source.name },
      targetSubtype: { id: mapping.target.id, name: mapping.target.name },
      profileCompatibility: mapping.compatible,
      sourceProfile: mapping.sourceProfile,
      targetProfile: mapping.targetProfile,
      submission: sourceSubmission && {
        id: sourceSubmission.id,
        stationId: sourceSubmission.station_id,
        siteId: sourceSubmission.site_id,
        subtypeId: sourceSubmission.site_subtype_id,
        version: sourceSubmission.version,
        operatorName: sourceSubmission.operator_name,
        archivedAt: sourceSubmission.archived_at,
        updatedAt: sourceSubmission.updated_at,
        lastSavedAt: sourceSubmission.last_saved_at,
        lock: {
          state: lockState(sourceSubmission),
          sessionId: sourceSubmission.locked_by_session_id,
          operatorName: sourceSubmission.lock_operator_name,
          lastActivityAt: sourceSubmission.lock_last_activity_at,
        },
        payload: {
          bytes: Buffer.byteLength(JSON.stringify(sourceSubmission.payload)),
          hash: payloadHash(sourceSubmission.payload),
          subtypeReferencePaths: payload?.paths ?? [],
          compatible: payload?.compatible ?? false,
          needsCanonicalSubtypePatch: payload?.needsCanonicalSubtypePatch ?? false,
        },
      },
      targetCollision: targetSubmission && {
        id: targetSubmission.id,
        version: targetSubmission.version,
        archivedAt: targetSubmission.archived_at,
      },
      action: planAction(mapping, sourceSubmission, targetSubmission),
    };
  });
  const ready = plan.every((entry) => entry.action === "READY");
  const alreadyRemediated = plan.every((entry) => entry.action === "ALREADY_REMEDIATED");
  const backupEntries = plan.map((entry) => {
    const sourceSubmission = submissions.find((row) => row.site_subtype_id === entry.sourceSubtype.id) ?? null;
    const afterPayload = sourceSubmission
      ? replacePayloadSubtype(sourceSubmission.payload, entry.sourceSubtype.id, entry.targetSubtype.id)
      : null;
    return {
      role: entry.role,
      submissionId: sourceSubmission?.id ?? null,
      sourceSubtypeId: entry.sourceSubtype.id,
      targetSubtypeId: entry.targetSubtype.id,
      sourceVersion: sourceSubmission?.version ?? null,
      sourcePayload: sourceSubmission?.payload ?? null,
      sourcePayloadHash: sourceSubmission ? payloadHash(sourceSubmission.payload) : null,
      targetPayloadHash: afterPayload ? payloadHash(afterPayload) : null,
      sourceUpdatedAt: sourceSubmission?.updated_at ?? null,
    };
  });
  return { site, config, plan, backupEntries, ready, alreadyRemediated };
}

export function backupFromPlan(plan) {
  return {
    schemaVersion: 1,
    kind: "cengkareng-awos-subtype-remediation-before",
    createdAt: new Date().toISOString(),
    siteId: plan.site.id,
    stationId: plan.site.station_id,
    entries: plan.backupEntries,
  };
}

async function applyWithinTransaction(tx, config, { onReady } = {}) {
  const inspection = await inspectRemediation(tx, config, { forUpdate: true });
  if (inspection.alreadyRemediated) return { changed: false, inspection, updated: [] };
  if (!inspection.ready) fail(`REMEDIATION_NOT_READY: ${inspection.plan.map((entry) => `${entry.role}=${entry.action}`).join(", ")}`);
  if (onReady) await onReady(backupFromPlan(inspection));
  const updated = [];
  for (const entry of inspection.plan) {
    const [row] = await tx`
        update public.submissions
        set site_subtype_id = ${entry.targetSubtype.id},
            payload = case
              when payload ->> 'siteSubtypeId' = ${entry.sourceSubtype.id}
                then jsonb_set(payload, '{siteSubtypeId}', to_jsonb(${entry.targetSubtype.id}::text), true)
              else payload
            end,
            version = version + 1,
            last_saved_at = now()
        where id = ${entry.submission.id}
          and station_id = ${inspection.site.station_id}
          and site_id = ${inspection.site.id}
          and site_subtype_id = ${entry.sourceSubtype.id}
        returning id, site_subtype_id, version, updated_at, last_saved_at, payload
    `;
    if (!row) fail(`REMEDIATION_UPDATE_FAILED_${entry.role}`);
    updated.push(row);
  }
  return { changed: true, inspection, updated };
}

export async function applyRemediation(sql, config = CENGKARENG_AWOS_REMEDIATION, options = {}) {
  if (typeof sql.begin !== "function") return applyWithinTransaction(sql, config, options);
  return sql.begin((tx) => applyWithinTransaction(tx, config, options));
}

async function rollbackWithinTransaction(tx, backup, config) {
  if (backup?.kind !== "cengkareng-awos-subtype-remediation-before" || backup.siteId !== config.siteId || backup.stationId !== config.stationId) {
    fail("ROLLBACK_BACKUP_INVALID");
  }
  if (!Array.isArray(backup.entries) || backup.entries.length !== config.roles.length) fail("ROLLBACK_BACKUP_INCOMPLETE");
  const rows = await tx.unsafe(`
      select id, station_id, site_id, site_subtype_id, payload, version, locked_by_session_id,
        lock_last_activity_at,
        (locked_by_session_id is not null and lock_last_activity_at is not null
          and lock_last_activity_at >= now() - interval '5 minutes') as active_lock
      from public.submissions
      where id = any($1::uuid[])
      for update
  `, [backup.entries.map((entry) => entry.submissionId)]);
  if (rows.length !== backup.entries.length) fail("ROLLBACK_SUBMISSION_SET_MISMATCH");
  const updated = [];
  for (const entry of backup.entries) {
    const row = one(rows.filter((candidate) => candidate.id === entry.submissionId), `ROLLBACK_SUBMISSION_NOT_FOUND_${entry.role}`);
    if (row.station_id !== config.stationId || row.site_id !== config.siteId || row.site_subtype_id !== entry.targetSubtypeId) fail(`ROLLBACK_STATE_MISMATCH_${entry.role}`);
    if (row.version !== entry.sourceVersion + 1 || row.active_lock || payloadHash(row.payload) !== entry.targetPayloadHash) fail(`ROLLBACK_NOT_SAFE_${entry.role}`);
    const payload = payloadCompatibility(row.payload, entry.targetSubtypeId);
    if (!payload.compatible) fail(`ROLLBACK_PAYLOAD_REQUIRES_REVIEW_${entry.role}`);
    const [restored] = await tx`
        update public.submissions
        set site_subtype_id = ${entry.sourceSubtypeId},
            payload = case
              when payload ->> 'siteSubtypeId' = ${entry.targetSubtypeId}
                then jsonb_set(payload, '{siteSubtypeId}', to_jsonb(${entry.sourceSubtypeId}::text), true)
              else payload
            end,
            version = version + 1,
            last_saved_at = now()
        where id = ${entry.submissionId}
        returning id, site_subtype_id, version, payload
    `;
    updated.push(restored);
  }
  return updated;
}

export async function rollbackRemediation(sql, backup, config = CENGKARENG_AWOS_REMEDIATION) {
  if (typeof sql.begin !== "function") return rollbackWithinTransaction(sql, backup, config);
  return sql.begin((tx) => rollbackWithinTransaction(tx, backup, config));
}
