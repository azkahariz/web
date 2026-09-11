import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim() || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/localhost|127\.0\.0\.1/.test(databaseUrl)) throw new Error("Benchmark Product hanya boleh memakai database lokal.");

const sql = postgres(databaseUrl, { ssl: false, max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_PRODUCT_BENCHMARK_${randomUUID()}`;
const PRODUCT_COUNT = 1150;
const SUBMISSION_COUNT = 2200;
const REFERENCES_PER_SUBMISSION = 16;
const RUNS = 5;

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function timed(run) {
  const startedAt = performance.now();
  await run();
  return performance.now() - startedAt;
}

async function measure(run) {
  await run();
  const values = [];
  for (let index = 0; index < RUNS; index += 1) values.push(await timed(run));
  return { medianMs: Math.round(median(values) * 100) / 100, runsMs: values.map((value) => Math.round(value * 100) / 100) };
}

try {
  await sql.begin(async (tx) => {
    const suffix = randomUUID().slice(0, 8);
    const adminId = randomUUID();
    await tx`
      insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (${adminId}, 'authenticated', 'authenticated', ${`product-benchmark-${suffix}@verify.invalid`}, '',
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    `;
    await tx`insert into public.super_admins (auth_user_id, username) values (${adminId}, ${`product-benchmark-${suffix}`})`;
    const [station] = await tx`insert into public.stations (name) values (${`Product Benchmark Station ${suffix}`}) returning id`;
    const [siteType] = await tx`insert into public.site_types (name) values (${`Product Benchmark Type ${suffix}`}) returning id`;
    const [subtype] = await tx`insert into public.site_subtypes (site_type_id, name) values (${siteType.id}, ${`Product Benchmark Subtype ${suffix}`}) returning id`;
    const products = await tx`
      insert into public.products (brand, model, active, source_origin, spreadsheet_synced)
      select 'Benchmark Brand', ${suffix} || '-' || lpad(series::text, 4, '0'), true, 'ADMIN', false
      from generate_series(1, ${PRODUCT_COUNT}) as series
      returning id
    `;
    const productIds = products.map((product) => product.id);
    const sites = await tx`
      insert into public.sites (station_id, site_type_id, name)
      select ${station.id}, ${siteType.id}, ${`Benchmark Site ${suffix} `} || series
      from generate_series(1, ${SUBMISSION_COUNT}) as series
      returning id
    `;
    await tx`
      insert into public.submissions (station_id, site_id, site_subtype_id, payload)
      select ${station.id}, site.id, ${subtype.id}, jsonb_build_object(
        'inventory', jsonb_build_object(
          'Sensor', (
            select jsonb_agg(jsonb_build_object(
              'id', 'item-' || item_no,
              'productId', (${productIds}::uuid[])[(site_no + item_no - 2) % ${PRODUCT_COUNT} + 1],
              'functionCategories', jsonb_build_array('Sensor', 'Kategori ' || ((item_no - 1) % 8 + 1))
            ))
            from generate_series(1, ${REFERENCES_PER_SUBMISSION}) as item_no
          )
        )
      )
      from unnest(${sites.map((site) => site.id)}::uuid[]) with ordinality as site(id, site_no)
    `;

    if (process.env.BENCHMARK_PENDING === "1") {
      const legacyPendingSql = (await readFile(new URL("../supabase/migrations/20260830150000_admin_pending_product_proposal_summary.sql", import.meta.url), "utf8"))
        .replaceAll("admin_pending_product_proposal_summary", "admin_pending_product_proposal_summary_benchmark_legacy");
      await tx.unsafe(legacyPendingSql);
      const [submission] = await tx`select id from public.submissions where station_id = ${station.id} order by id limit 1`;
      const [proposal] = await tx`
        insert into public.product_proposals (
          station_id, submission_id, created_by_auth_user, operator_name,
          proposed_brand, proposed_model, normalized_brand, normalized_model, status
        ) values (
          ${station.id}, ${submission.id}, ${adminId}, 'Product Benchmark',
          'Benchmark Pending', ${suffix}, 'benchmarkpending', ${suffix}, 'PENDING'
        ) returning id
      `;
      await tx`
        update public.submissions
        set payload = jsonb_set(payload, '{inventory,Sensor,0,productProposalId}', to_jsonb(${proposal.id}::text), true)
        where id = ${submission.id}
      `;
    }

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${adminId}, true)`;
    const pageIds = productIds.slice(0, 50);
    const filterCategories = ["Sensor"];
    const metrics = {
      fixture: { products: PRODUCT_COUNT, submissions: SUBMISSION_COUNT, references: SUBMISSION_COUNT * REFERENCES_PER_SUBMISSION },
      baseProductRows: await measure(() => tx`select id, brand, model, active, source_origin, merged_into_product_id from public.products order by id`),
      searchRows: await measure(() => tx`select id, brand, model, active, source_origin, merged_into_product_id from public.products where brand ilike '%Benchmark%' or model ilike '%Benchmark%' order by id`),
      nextPageRows: await measure(() => tx`select id, brand, model, active, source_origin, merged_into_product_id from public.products order by id limit 50 offset 50`),
      ordinarySortRows: await measure(() => tx`select id, brand, model, active, source_origin, merged_into_product_id from public.products order by brand, model, id`),
      usagePage: await measure(() => tx`select * from public.admin_product_usage_counts(${pageIds})`),
      categoryPage: await measure(() => tx`select * from public.admin_product_reference_categories(${pageIds})`),
      filterCombined: await measure(() => tx`select public.admin_product_reference_filter_ids(${filterCategories}, null, ${siteType.id})`),
      filterOptions: await measure(() => tx`select public.admin_product_reference_filter_options()`),
      usageSort: await measure(() => tx`select * from public.admin_product_usage_counts(${productIds})`),
    };
    if (process.env.BENCHMARK_COMBINED === "1") {
      metrics.combinedPage = await measure(() => tx`select * from public.admin_product_page_enrichment(${pageIds})`);
      metrics.combinedUsageSort = await measure(() => tx`select * from public.admin_product_page_enrichment(${productIds})`);
    }
    if (process.env.BENCHMARK_PENDING === "1") {
      const [legacyPending, optimizedPending] = await Promise.all([
        tx`select public.admin_pending_product_proposal_summary_benchmark_legacy() as value`,
        tx`select public.admin_pending_product_proposal_summary() as value`,
      ]);
      if (JSON.stringify(legacyPending[0].value) !== JSON.stringify(optimizedPending[0].value)) {
        throw new Error("Output pending Product Proposal berubah setelah optimasi.");
      }
      metrics.pendingSummaryLegacy = await measure(() => tx`select public.admin_pending_product_proposal_summary_benchmark_legacy()`);
      metrics.pendingSummaryOptimized = await measure(() => tx`select public.admin_pending_product_proposal_summary()`);
      metrics.pendingSummaryOutput = optimizedPending[0].value;
    }
    if (process.env.BENCHMARK_EXPLAIN === "1") {
      const plans = {};
      for (const [name, query] of [
        ["usagePage", tx`explain (analyze, buffers, format json) select * from public.admin_product_usage_counts(${pageIds})`],
        ["categoryPage", tx`explain (analyze, buffers, format json) select * from public.admin_product_reference_categories(${pageIds})`],
        ["combinedPage", tx`explain (analyze, buffers, format json) select * from public.admin_product_page_enrichment(${pageIds})`],
        ...(process.env.BENCHMARK_PENDING === "1" ? [
          ["pendingSummaryLegacy", tx`explain (analyze, buffers, format json) select public.admin_pending_product_proposal_summary_benchmark_legacy()`],
          ["pendingSummaryOptimized", tx`explain (analyze, buffers, format json) select public.admin_pending_product_proposal_summary()`],
        ] : []),
      ]) {
        const rows = await query;
        const plan = rows[0]["QUERY PLAN"][0];
        plans[name] = {
          nodeType: plan.Plan["Node Type"],
          actualRows: plan.Plan["Actual Rows"],
          executionMs: Math.round(plan["Execution Time"] * 100) / 100,
          sharedHitBlocks: plan.Plan["Shared Hit Blocks"],
          sharedReadBlocks: plan.Plan["Shared Read Blocks"],
          tempReadBlocks: plan.Plan["Temp Read Blocks"],
          tempWrittenBlocks: plan.Plan["Temp Written Blocks"],
        };
      }
      metrics.plans = plans;
    }
    console.log(JSON.stringify(metrics, null, 2));
    await tx`reset role`;
    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}
