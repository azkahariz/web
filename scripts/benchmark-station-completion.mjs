import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import postgres from "postgres";
import { resolveLocalDatabaseUrl } from "./master/database-connection.mjs";

const databaseUrl = resolveLocalDatabaseUrl();
const sql = postgres(databaseUrl, { ssl: false, max: 12, connect_timeout: 15, idle_timeout: 5 });
const prefix = `BENCH COMPLETION ${randomUUID()}`;

function extractFunction(source, name) {
  const pattern = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`);
  const match = source.match(pattern)?.[0];
  assert.ok(match, `Function ${name} tidak ditemukan.`);
  return match;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function timed(query, runs = 5) {
  await query();
  const durations = [];
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    await query();
    durations.push(performance.now() - started);
  }
  return { medianMs: median(durations), minMs: Math.min(...durations), maxMs: Math.max(...durations) };
}

function payload(categoryNames, proposalId, index) {
  const filledCount = index % (categoryNames.length + 1);
  return {
    inventory: Object.fromEntries(categoryNames.map((name, categoryIndex) => [name,
      categoryIndex < filledCount ? [{
        id: randomUUID(),
        brand: "Benchmark",
        model: `Model ${index}-${categoryIndex}`,
        quantity: 1,
        ...(proposalId && categoryIndex === 0 ? { productProposalId: proposalId } : {}),
      }] : [],
    ])),
  };
}

async function insertBatches(tx, table, rows, batchSize = 250) {
  for (let index = 0; index < rows.length; index += batchSize) {
    await tx`insert into ${tx(table)} ${tx(rows.slice(index, index + batchSize))}`;
  }
}

try {
  const [existing] = await sql`select count(*)::integer as count from public.stations where name like ${`${prefix}%`}`;
  assert.equal(existing.count, 0, "Fixture benchmark dengan prefix yang sama sudah ada.");

  const [engineSource, warehouseSource, siteTypeSource] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260827120000_station_completion_engine.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260828120000_exclude_warehouse_from_station_completion.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260830140000_fix_admin_site_type_completion_summary.sql", import.meta.url), "utf8"),
  ]);

  const legacyRowsSql = extractFunction(engineSource, "station_completion_rows")
    .replace("public.station_completion_rows", "public.station_completion_rows_benchmark_legacy");
  const legacySummarySql = extractFunction(warehouseSource, "station_completion_summary_rows")
    .replace("public.station_completion_summary_rows", "public.station_completion_summary_rows_benchmark_legacy")
    .replaceAll("public.station_completion_rows(p_station_id)", "public.station_completion_rows_benchmark_legacy(p_station_id)");
  const legacySiteTypeSql = extractFunction(siteTypeSource, "admin_site_type_completion_summary")
    .replace("public.admin_site_type_completion_summary", "public.admin_site_type_completion_summary_benchmark_legacy")
    .replaceAll("public.station_completion_rows(null)", "public.station_completion_rows_benchmark_legacy(null)");

  await sql.begin(async (tx) => {
    await tx.unsafe(legacyRowsSql);
    await tx.unsafe(legacySummarySql);
    await tx.unsafe(legacySiteTypeSql);

    const adminId = randomUUID();
    await tx`insert into auth.users (id, email) values (${adminId}, ${`bench-${adminId}@verify.local`})`;
    await tx`insert into public.super_admins (auth_user_id, username) values (${adminId}, ${`bench.${adminId}`})`;

    const [profile] = await tx`insert into public.item_profiles (name) values (${`${prefix} PROFILE`}) returning id`;
    const categoryNames = Array.from({ length: 10 }, (_, index) => `${prefix} CATEGORY ${index + 1}`);
    const items = await tx`insert into public.items ${tx(categoryNames.map((name) => ({ name })))} returning id, name`;
    await tx`insert into public.profile_items ${tx(items.map((item) => ({ item_profile_id: profile.id, item_id: item.id })))}`;
    const [siteType] = await tx`insert into public.site_types (name) values (${`${prefix} TYPE`}) returning id`;
    const [subtype] = await tx`insert into public.site_subtypes (site_type_id, item_profile_id, name) values (${siteType.id}, ${profile.id}, ${`${prefix} SUBTYPE`}) returning id`;

    const stations = Array.from({ length: 192 }, (_, index) => ({ name: `${prefix} STATION ${String(index + 1).padStart(3, "0")}` }));
    const createdStations = await tx`insert into public.stations ${tx(stations)} returning id, name`;
    const siteRows = Array.from({ length: 2252 }, (_, index) => ({
      station_id: createdStations[index % createdStations.length].id,
      site_type_id: siteType.id,
      name: `${prefix} SITE ${String(index + 1).padStart(4, "0")}`,
    }));
    await insertBatches(tx, "sites", siteRows);
    const createdSites = await tx`select id, station_id from public.sites where name like ${`${prefix} SITE %`} order by name`;

    const proposalIds = Array.from({ length: 1197 }, () => randomUUID());
    const submissionRows = Array.from({ length: 1230 }, (_, index) => ({
      station_id: createdSites[index].station_id,
      site_id: createdSites[index].id,
      site_subtype_id: subtype.id,
      payload: payload(categoryNames, proposalIds[index], index),
      version: 1,
      last_saved_at: new Date("2026-08-27T00:00:00.000Z"),
    }));
    await insertBatches(tx, "submissions", submissionRows, 100);
    const submissions = await tx`select id, station_id, site_id from public.submissions where site_id in (select id from public.sites where name like ${`${prefix} SITE %`})`;
    const submissionBySite = new Map(submissions.map((submission) => [submission.site_id, submission]));
    const proposalRows = proposalIds.map((id, index) => ({
      id,
      station_id: submissionBySite.get(createdSites[index].id).station_id,
      submission_id: submissionBySite.get(createdSites[index].id).id,
      created_by_auth_user: adminId,
      proposed_brand: "Benchmark",
      proposed_model: `Proposal ${index}`,
      normalized_brand: "benchmark",
      normalized_model: `proposal ${index}`,
      status: "PENDING",
    }));
    await insertBatches(tx, "product_proposals", proposalRows, 100);
  });

  await sql`analyze public.stations`;
  await sql`analyze public.sites`;
  await sql`analyze public.submissions`;
  await sql`analyze public.product_proposals`;

  const [admin] = await sql`select auth_user_id from public.super_admins where username like 'bench.%' order by created_at desc limit 1`;
  const runAdmin = async (query) => sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', ${admin.auth_user_id}, true)`;
    await tx`select set_config('request.jwt.claim.role', 'authenticated', true)`;
    await tx`set local role authenticated`;
    return tx.unsafe(query);
  });
  const timedAdmin = async (query, runs = 5) => timed(() => runAdmin(query), runs);
  const [detailStation] = await sql`select id from public.stations where name like ${`${prefix} STATION %`} order by name limit 1`;

  const legacyRows = await sql`select to_jsonb(row_value) as value from public.station_completion_rows_benchmark_legacy(null) as row_value order by station_id, site_id, site_subtype_id, is_expected desc, submission_id`;
  const optimizedRows = await sql`select to_jsonb(row_value) as value from public.station_completion_rows(null) as row_value order by station_id, site_id, site_subtype_id, is_expected desc, submission_id`;
  assert.deepEqual(optimizedRows, legacyRows, "SEMANTIC PARITY gagal pada completion rows.");

  const legacyStation = await sql`select to_jsonb(row_value) as value from public.station_completion_summary_rows_benchmark_legacy(null) as row_value order by station_id`;
  const optimizedStation = await sql`select to_jsonb(row_value) as value from public.station_completion_summary_rows(null) as row_value order by station_id`;
  assert.deepEqual(optimizedStation, legacyStation, "SEMANTIC PARITY gagal pada Station summary.");

  const [legacySiteType] = await runAdmin("select public.admin_site_type_completion_summary_benchmark_legacy() as value");
  const [optimizedSiteType] = await runAdmin("select public.admin_site_type_completion_summary() as value");
  assert.deepEqual(optimizedSiteType.value, legacySiteType.value, "SEMANTIC PARITY gagal pada Site Type summary.");

  const benchmark = {
    legacyStation: await timed(() => sql`select * from public.station_completion_summary_rows_benchmark_legacy(null)`),
    optimizedStation: await timed(() => sql`select * from public.station_completion_summary_rows(null)`),
    legacySiteType: await timedAdmin("select public.admin_site_type_completion_summary_benchmark_legacy()"),
    optimizedSiteType: await timedAdmin("select public.admin_site_type_completion_summary()"),
    combined: await timedAdmin("select public.admin_completion_monitoring_summary()"),
    legacyDetail: await timed(() => sql`select * from public.station_completion_rows_benchmark_legacy(${detailStation.id})`, 3),
    optimizedDetail: await timed(() => sql`select * from public.station_completion_rows(${detailStation.id})`, 3),
  };

  const concurrentStarted = performance.now();
  const concurrentDurations = await Promise.all(Array.from({ length: 8 }, async () => {
    const started = performance.now();
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${admin.auth_user_id}, true)`;
      await tx`select set_config('request.jwt.claim.role', 'authenticated', true)`;
      await tx`set local role authenticated`;
      await tx`select public.admin_completion_monitoring_summary()`;
    });
    return performance.now() - started;
  }));
  const sortedConcurrent = [...concurrentDurations].sort((left, right) => left - right);
  const result = {
    fixture: { stations: 192, sites: 2252, submissions: 1230, proposals: 1197, categoriesPerProfile: 10 },
    semanticParity: "PASS",
    benchmark,
    concurrent: {
      calls: concurrentDurations.length,
      success: concurrentDurations.length,
      errors: 0,
      p50Ms: sortedConcurrent[Math.floor(sortedConcurrent.length * 0.5)],
      p95Ms: sortedConcurrent[Math.min(sortedConcurrent.length - 1, Math.ceil(sortedConcurrent.length * 0.95) - 1)],
      maxMs: Math.max(...sortedConcurrent),
      wallMs: performance.now() - concurrentStarted,
    },
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
