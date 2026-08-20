import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Product dependency preflight tetap read-only, beridentitas stabil, dan hanya untuk Super Admin", async () => {
  const [migration, dependenciesRoute, referencesRoute, component, packageJson] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260821120000_product_reference_preflight.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/products/[id]/dependencies/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/products/[id]/references/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminProducts.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  for (const rpc of ["product_direct_reference_rows", "admin_product_dependencies", "admin_product_direct_references"]) assert.match(migration, new RegExp(`function public\\.${rpc}`));
  assert.match(migration, /perform public\.require_super_admin\(\)/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /submission_id[\s\S]*submission_version[\s\S]*item_id[\s\S]*product_id/);
  assert.match(migration, /item\.value ->> 'productId'/);
  assert.match(migration, /jsonb_array_length\(item\.value -> 'units'\)/);
  assert.match(migration, /functionCategories/);
  assert.match(migration, /archived_at is null/);
  assert.match(migration, /archived_at is not null/);
  assert.match(migration, /interval '5 minutes'/);
  assert.match(migration, /status in \('APPROVED', 'MERGED'\)/);
  assert.doesNotMatch(migration, /\b(update|delete|insert into)\s+public\.(products|submissions|product_aliases|product_proposals)\b/i);
  assert.match(migration, /revoke all on function public\.product_direct_reference_rows/);
  assert.match(migration, /grant execute on function public\.admin_product_dependencies/);
  assert.match(migration, /p_page_size in \(50, 100, 200\)/);

  for (const route of [dependenciesRoute, referencesRoute]) {
    assert.match(route, /PRODUCT_UUID_PATTERN/);
    assert.match(route, /requireProductDependencyClient/);
    assert.match(route, /productDependencyRpcError/);
  }
  assert.match(referencesRoute, /pageSize/);
  assert.match(referencesRoute, /archiveScope/);
  for (const text of ["Dependency", "Referensi", "QC History", "Alias", "Referensi langsung", "QC resolved", "Sedang diedit"]) assert.match(component, new RegExp(text));
  assert.match(component, /expectedSubmissionVersion/);
  assert.match(component, /referencePageSize/);
  assert.match(component, /function DependencyPagination/);
  assert.match(component, /label="Site"/);
  assert.match(component, /label="referensi"/);
  assert.match(component, /setDependencyPageSize/);
  assert.match(component, /setReferencePageSize/);
  assert.doesNotMatch(component, /Pindahkan Referensi|Merge Product|Split Product|Hapus Produk/);
  assert.match(component, /product-usage-dialog/);
  assert.match(component, /product-usage-pagination/);
  assert.match(component, /Belum ada referensi pada scope ini/);
  assert.match(component, /aria-busy=\{usageLoading \|\| dependenciesLoading \|\| referencesLoading\}/);
  assert.match(component, /setDependencyPage\(1\)/);
  assert.match(component, /setReferencePageSize\(50\)/);
  assert.match(await readFile(new URL("../app/globals.css", import.meta.url), "utf8"), /\.app-dialog\.product-usage-dialog \{[^}]*overflow: hidden/);
  assert.match(await readFile(new URL("../app/globals.css", import.meta.url), "utf8"), /\.product-usage-content \{[^}]*overflow-y: auto/);
  assert.doesNotMatch(await readFile(new URL("../app/globals.css", import.meta.url), "utf8"), /\.product-usage-list \{[^}]*overflow/);
  assert.doesNotMatch(await readFile(new URL("../app/globals.css", import.meta.url), "utf8"), /\.product-reference-list \{[^}]*overflow/);
  assert.match(await readFile(new URL("../app/globals.css", import.meta.url), "utf8"), /\.product-usage-pagination button \{[^}]*border: 1px solid/);
  assert.match(await readFile(new URL("../app/globals.css", import.meta.url), "utf8"), /\.product-usage-pagination button:focus-visible/);
  assert.match(await readFile(new URL("../app/globals.css", import.meta.url), "utf8"), /\.product-usage-pagination button:disabled/);
  assert.match(await readFile(new URL("../app/globals.css", import.meta.url), "utf8"), /\.product-usage-pagination > span \{[^}]*font-size: 9px/);
  assert.ok(component.indexOf("product-dependency-tabs") < component.indexOf("product-usage-content"), "Tabs harus berada di luar area content yang scroll.");
  const canonicalCountsMigration = await readFile(new URL("../supabase/migrations/20260822120000_product_dependency_canonical_counts.sql", import.meta.url), "utf8");
  assert.match(canonicalCountsMigration, /canonical_current_references/);
  assert.match(canonicalCountsMigration, /item\.value ->> 'productId'/);
  assert.match(canonicalCountsMigration, /item\.value ->> 'productProposalId'/);
  assert.match(canonicalCountsMigration, /proposal\.status in \('APPROVED', 'MERGED'\)/);
  assert.match(canonicalCountsMigration, /count\(distinct site_id\)/);
  assert.match(canonicalCountsMigration, /count\(distinct submission_id\)/);
  assert.doesNotMatch(canonicalCountsMigration, /\b(update|delete|insert into)\s+public\.(products|submissions|product_aliases|product_proposals)\b/i);
  assert.match(component, /Referensi langsung/);
  assert.match(packageJson, /verify:product-dependencies/);
});
