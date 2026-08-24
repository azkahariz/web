import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260827120000_station_completion_engine.sql", import.meta.url);
const warehouseExclusionMigrationUrl = new URL("../supabase/migrations/20260828120000_exclude_warehouse_from_station_completion.sql", import.meta.url);

test("completion engine memakai satu canonical inventory fact source", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const progressFunction = migration.match(/create or replace function public\.submission_progress[\s\S]*?\n\$\$;/)?.[0] ?? "";
  const itemFunction = migration.match(/create or replace function public\.submission_item_is_filled[\s\S]*?\n\$\$;/)?.[0] ?? "";

  assert.match(migration, /submission_inventory_facts\(p_payload jsonb\)/);
  assert.match(progressFunction, /submission_category_coverage/);
  assert.match(itemFunction, /submission_inventory_facts/);
  assert.match(migration, /functionCategories/);
  assert.match(migration, /itemKind[\s\S]*material[\s\S]*brand[\s\S]*model/);
  assert.doesNotMatch(migration, /WIGOS|AWS Center|siteMetadata|latitude|longitude|elevation|addressDetail/i);
});

test("expected pair, missing denominator, Gudang, dan structural issues dikunci di SQL", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /site_type\.requires_site_subtype_assignment[\s\S]*site_subtype_assignments/);
  assert.match(migration, /where station\.active/);
  assert.match(migration, /site\.active/);
  assert.match(migration, /site_type\.active/);
  assert.match(migration, /candidate\.active/);
  assert.match(migration, /mapping\.active/);
  assert.match(migration, /item\.active/);
  assert.match(migration, /current_submission\.archived_at is null/);
  assert.match(migration, /coalesce\(submission\.payload, '\{\}'::jsonb\)/);
  assert.match(migration, /when context\.is_warehouse then 'GUDANG_TERSEDIA'/);
  assert.match(migration, /expected_category_count = 0 then null/);
  assert.match(migration, /station_has_no_active_site/);
  assert.match(migration, /unexpected_active_submission/);
  assert.match(migration, /duplicate_active_submission/);
});

test("Gudang dikeluarkan dari seluruh bucket assessment dan memakai status Tidak Dinilai", async () => {
  const migration = await readFile(warehouseExclusionMigrationUrl, "utf8");
  const summaryFunction = migration.match(/create or replace function public\.station_completion_summary_rows[\s\S]*?comment on function public\.station_completion_summary_rows/)?.[0] ?? "";
  const detailFunction = migration.match(/create or replace function public\.admin_station_completion_detail[\s\S]*?comment on function public\.admin_station_completion_detail/)?.[0] ?? "";

  assert.match(migration, /station_completion_is_warehouse_site_type/);
  assert.match(migration, /da5d00b1-cd15-4b1d-8087-1057eb31c7d8/);
  assert.match(summaryFunction, /not public\.station_completion_is_warehouse_site_type\(detail\.site_type_id\)/);
  assert.match(summaryFunction, /when calculated\.expected_submission_count = 0 then 'TIDAK_DINILAI'/);
  assert.match(summaryFunction, /calculated\.complete_submission_count = calculated\.expected_submission_count/);
  assert.doesNotMatch(summaryFunction, /complete_submission_count \+ calculated\.warehouse_existing_count/);
  assert.match(detailFunction, /where not public\.station_completion_is_warehouse_site_type\(detail\.site_type_id\)/);
});

test("pending QC hanya menghitung proposal current yang direferensikan", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const rowsFunction = migration.match(/create or replace function public\.station_completion_rows[\s\S]*?comment on function public\.station_completion_rows/)?.[0] ?? "";

  assert.match(rowsFunction, /count\(distinct proposal\.id\)/);
  assert.match(rowsFunction, /proposal\.id = fact\.product_proposal_id/);
  assert.match(rowsFunction, /proposal\.submission_id = submission\.id/);
  assert.match(rowsFunction, /proposal\.status = 'PENDING'/);
});

test("RPC completion read-only, berizin Super Admin, dan tidak mengirim payload", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  for (const name of ["admin_station_completion_summary", "admin_station_completion_detail"]) {
    const source = migration.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`))?.[0] ?? "";
    assert.match(source, /stable/);
    assert.match(source, /security definer/);
    assert.match(source, /set search_path = ''/);
    assert.match(source, /require_super_admin\(\)/);
    assert.doesNotMatch(source, /\b(insert|update|delete)\b/i);
  }
  assert.match(migration, /revoke all on function public\.admin_station_completion_summary\(\) from public, anon/);
  assert.match(migration, /grant execute on function public\.admin_station_completion_detail\(uuid\) to authenticated/);
  assert.doesNotMatch(migration.match(/admin_station_completion_summary[\s\S]*$/)?.[0] ?? "", /'payload'/);
});

test("TypeScript contract mendeskripsikan backend tanpa business calculation", async () => {
  const types = await readFile(new URL("../app/lib/station-completion.ts", import.meta.url), "utf8");
  for (const status of ["PERLU_PERHATIAN", "BELUM_DIMULAI", "TERISI_SEBAGIAN", "LENGKAP", "TIDAK_DINILAI", "KOSONG", "GUDANG_TERSEDIA"]) {
    assert.match(types, new RegExp(`"${status}"`));
  }
  assert.match(types, /category_progress: number \| null/);
  assert.match(types, /missing_categories: MissingCompletionCategory\[\]/);
  assert.doesNotMatch(types, /function\s+\w+\s*\(/);
});
