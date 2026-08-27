import postgres from "postgres";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia.");
if (!/localhost|127\.0\.0\.1/.test(databaseUrl)) throw new Error("Verifier Product Proposal summary hanya boleh memakai database lokal.");

const sql = postgres(databaseUrl, { ssl: false, max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_PRODUCT_PROPOSAL_SUMMARY_${randomUUID()}`;
let report;

function assert(value, message) {
  if (!value) throw new Error(message);
}

function valueOf(result) {
  return result[0]?.data;
}

try {
  await sql.begin(async (tx) => {
    const adminId = randomUUID();
    await tx`
      insert into auth.users (
        id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        ${adminId}, 'authenticated', 'authenticated', ${`proposal-summary-${adminId}@verify.invalid`}, '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
      )
    `;
    await tx`insert into public.super_admins (auth_user_id, username, display_name) values (${adminId}, ${`verify-summary-${adminId}`}, 'Verifier Summary')`;
    const [station] = await tx`
      insert into public.stations (name, station_category_id)
      values (${`VERIFY SUMMARY STATION ${randomUUID()}`}, '11111111-1111-4111-8111-111111111111') returning id, station_category_id
    `;
    const [siteType] = await tx`insert into public.site_types (name) values (${`VERIFY SUMMARY TYPE ${randomUUID()}`}) returning id`;
    const [site] = await tx`insert into public.sites (station_id, site_type_id, name) values (${station.id}, ${siteType.id}, ${`VERIFY SUMMARY SITE ${randomUUID()}`}) returning id`;
    const [subtype] = await tx`insert into public.site_subtypes (site_type_id, name) values (${siteType.id}, ${`VERIFY SUMMARY SUBTYPE ${randomUUID()}`}) returning id`;
    const [submission] = await tx`
      insert into public.submissions (station_id, site_id, site_subtype_id, operator_name)
      values (${station.id}, ${site.id}, ${subtype.id}, 'Verifier Summary') returning id
    `;

    const inserted = await tx`
      insert into public.product_proposals (
        station_id, submission_id, created_by_auth_user, operator_name,
        proposed_brand, proposed_model, normalized_brand, normalized_model, status, created_at
      )
      select ${station.id}, case when fixture.n <= 60 then ${submission.id}::uuid else null::uuid end, ${adminId}, 'Verifier Summary',
        case when fixture.n <= 60 then 'Needle Filter' else 'Fixture Brand' end,
        'Model ' || fixture.n, case when fixture.n <= 60 then 'needlefilter' else 'fixturebrand' end,
        'model' || fixture.n,
        case when fixture.n <= 300 then 'PENDING'
          when fixture.n <= 600 then 'APPROVED'
          when fixture.n <= 900 then 'MERGED' else 'REJECTED' end,
        '2026-01-01 00:00:00+00'::timestamptz + fixture.n * interval '1 millisecond'
      from generate_series(1, 1200) as fixture(n)
      returning id, status, proposed_brand
    `;
    const contextRows = inserted.filter((row) => row.proposed_brand === "Needle Filter");
    await tx`
      update public.submissions set payload = ${tx.json({
        inventory: {
          Sensor: contextRows.map((row, index) => ({
            id: `fixture-${index + 1}`,
            brand: "Needle Filter",
            model: `Model ${index + 1}`,
            productProposalId: row.id,
          })),
        },
      })}
      where id = ${submission.id}
    `;

    const directCounts = await tx`select status, count(*)::integer as count from public.product_proposals group by status order by status`;
    const directTotal = directCounts.reduce((total, row) => total + row.count, 0);
    assert(directTotal === 1200, `Fixture total salah: ${directTotal}.`);

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${adminId}, true)`;
    const functionAudit = await tx`
      select p.proname, p.prosecdef, p.provolatile, p.proconfig,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('admin_product_proposal_status_summary', 'admin_list_product_proposals')
      order by p.proname
    `;
    assert(functionAudit.length === 2, "Dua RPC Product Proposal wajib tersedia.");
    for (const fn of functionAudit) {
      assert(fn.prosecdef === true, `${fn.proname} wajib SECURITY DEFINER.`);
      assert(fn.provolatile === "s", `${fn.proname} wajib STABLE.`);
      assert(fn.proconfig?.includes("search_path=\"\"") || fn.proconfig?.includes("search_path="), `${fn.proname} wajib mengunci search_path.`);
      assert(fn.authenticated_execute === true, `${fn.proname} harus executable oleh authenticated.`);
    }

    const summary = valueOf(await tx`select public.admin_product_proposal_status_summary() as data`);
    assert(summary.total === 1200, "Summary harus menghitung seluruh 1.200 proposal.");
    for (const status of ["pending", "approved", "merged", "rejected"]) assert(summary[status] === 300, `${status} harus 300.`);
    assert(summary.other === 0, "OTHER harus nol untuk domain status saat ini.");

    const summaries = [];
    for (const pageSize of [25, 50, 100]) {
      for (const page of [1, 2, Math.min(4, 300 / pageSize)]) {
        const list = valueOf(await tx`select public.admin_list_product_proposals('PENDING', ${page}, ${pageSize}, null, null, null, null) as data`);
        assert(list.totalCount === 300, `Total PENDING berubah pada page ${page}, size ${pageSize}.`);
        assert(list.rows.length === pageSize, `Jumlah row page ${page}, size ${pageSize} tidak sesuai.`);
        summaries.push(valueOf(await tx`select public.admin_product_proposal_status_summary() as data`));
      }
    }
    assert(summaries.every((item) => JSON.stringify(item) === JSON.stringify(summary)), "Summary berubah mengikuti page list.");

    const pendingPages = [];
    for (let page = 1; page <= 6; page += 1) {
      const list = valueOf(await tx`select public.admin_list_product_proposals('PENDING', ${page}, 50, null, null, null, null) as data`);
      assert(list.rows.length === 50, `PENDING page ${page} harus berisi 50 row.`);
      pendingPages.push(...list.rows.map((row) => row.id));
    }
    assert(new Set(pendingPages).size === 300, "Pagination PENDING memiliki duplicate atau missing row.");

    for (const status of ["APPROVED", "MERGED", "REJECTED"]) {
      const first = valueOf(await tx`select public.admin_list_product_proposals(${status}, 1, 50, null, null, null, null) as data`);
      const last = valueOf(await tx`select public.admin_list_product_proposals(${status}, 6, 50, null, null, null, null) as data`);
      assert(first.totalCount === 300 && first.rows.length === 50 && last.rows.length === 50, `${status} pagination tidak lengkap.`);
      assert([...first.rows, ...last.rows].every((row) => row.status === status), `${status} mengembalikan status lain.`);
    }

    const search = valueOf(await tx`select public.admin_list_product_proposals('PENDING', 1, 50, 'needle filter', null, null, null) as data`);
    const category = valueOf(await tx`select public.admin_list_product_proposals('PENDING', 1, 50, null, ${station.station_category_id}, null, null) as data`);
    const siteTypeFilter = valueOf(await tx`select public.admin_list_product_proposals('PENDING', 1, 50, null, null, ${siteType.id}, null) as data`);
    const context = valueOf(await tx`select public.admin_list_product_proposals('PENDING', 1, 50, null, null, null, 'pengisian') as data`);
    for (const [name, result, expected] of [["search", search, 60], ["station category", category, 300], ["site type", siteTypeFilter, 60], ["context", context, 60]]) {
      assert(result.totalCount === expected, `${name} harus diterapkan sebelum pagination.`);
      assert(result.rows.length === 50, `${name} page pertama harus berisi 50 row.`);
    }
    assert(search.rows.every((row) => row.proposed_brand === "Needle Filter"), "Search mengembalikan row yang tidak cocok.");
    assert(context.rows.every((row) => row.context.qcContext === "pengisian"), "Context filter mengembalikan bucket lain.");

    const statusConstraint = await tx`
      select pg_get_constraintdef(constraint_row.oid) as definition
      from pg_constraint as constraint_row
      join pg_class as table_row on table_row.oid = constraint_row.conrelid
      join pg_namespace as namespace_row on namespace_row.oid = table_row.relnamespace
      where namespace_row.nspname = 'public' and table_row.relname = 'product_proposals'
        and pg_get_constraintdef(constraint_row.oid) ilike '%status%'
    `;
    assert(statusConstraint.some((row) => ["PENDING", "APPROVED", "MERGED", "REJECTED"].every((status) => row.definition.includes(status))), "Status constraint tidak membatasi empat status canonical.");

    report = { total: summary.total, statuses: summary, pageSize: 50, filteredCount: search.totalCount };
    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}

console.log(`Verifikasi Product Proposal summary lulus; ${report.total.toLocaleString("id-ID")} fixture lokal telah di-rollback.`);
console.log(JSON.stringify(report));
