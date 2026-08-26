import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Product reference move memakai preflight atomik dan hanya mengubah direct current reference", async () => {
  const [migration, apiHelper, moveRoute, preflightRoute, productsRoute, component, dialog, css, packageJson] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260823120000_product_reference_move.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/admin-product-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/products/[id]/move/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/products/[id]/move-preflight/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/products/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminProducts.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/ProductReferenceMoveDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  for (const rpc of ["product_reference_move_validation", "admin_product_reference_move_preflight", "admin_move_product_references"]) {
    assert.match(migration, new RegExp(`function public\\.${rpc}`));
  }
  assert.match(migration, /perform public\.require_super_admin\(\)/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /order by submission\.id[\s\S]*for update of submission/);
  assert.ok((migration.match(/product_reference_move_validation\(p_source_product_id, p_target_product_id, p_references\)/g) ?? []).length >= 2, "Execute harus revalidate setelah row lock.");
  assert.match(migration, /submission\.archived_at is not null/);
  assert.match(migration, /interval '5 minutes'/);
  assert.match(migration, /submission\.version <> selected\.expected_version/);
  assert.match(migration, /item\.value ->> 'productProposalId'/);
  assert.match(migration, /item\.value ->> 'productId' is distinct from p_source_product_id::text/);
  assert.match(migration, /'productId', v_target\.id[\s\S]*'brand', v_target\.brand[\s\S]*'model', v_target\.model/);
  assert.match(migration, /version = submission\.version \+ 1/);
  assert.match(migration, /'PRODUCT_REFERENCE_MOVE'/);
  assert.match(migration, /oldSubmissionVersion[\s\S]*newSubmissionVersion/);
  assert.doesNotMatch(migration, /\b(update|delete)\s+public\.(products|product_proposals|product_aliases)\b/i);
  assert.match(migration, /revoke all on function public\.product_reference_move_validation/);
  assert.match(migration, /grant execute on function public\.admin_move_product_references/);

  assert.match(apiHelper, /references\.length > 500/);
  assert.match(apiHelper, /expectedSubmissionVersion/);
  assert.match(apiHelper, /version_conflict/);
  assert.match(apiHelper, /active_lock/);
  for (const route of [moveRoute, preflightRoute]) {
    assert.match(route, /requireProductDependencyClient/);
    assert.match(route, /parseProductMoveRequest/);
    assert.match(route, /PRODUCT_UUID_PATTERN/);
  }
  assert.match(moveRoute, /admin_move_product_references/);
  assert.match(preflightRoute, /admin_product_reference_move_preflight/);
  assert.match(productsRoute, /activeOnly/);
  assert.match(productsRoute, /excludeProductId/);

  assert.match(component, /productReferenceSelectionKey/);
  assert.match(component, /submissionId.*expectedSubmissionVersion.*itemId/s);
  assert.match(component, /selectedReferences/);
  assert.match(component, /Pindahkan Referensi/);
  assert.match(component, /isProductReferenceSelectable/);
  assert.match(component, /CurrentPageReferenceCheckbox/);
  assert.match(component, /indeterminate/);
  assert.match(component, /Pilih semua referensi di halaman ini/);
  assert.match(component, /Batalkan semua/);
  assert.match(component, /Submission v\{row\.expectedSubmissionVersion\}/);
  assert.match(component, /row\.categoryName/);
  assert.match(dialog, /activeOnly: "1"/);
  assert.match(dialog, /excludeProductId: source\.id/);
  assert.match(dialog, /move-preflight/);
  assert.match(dialog, /\/move`/);
  assert.match(dialog, /Memeriksa referensi terbaru/);
  assert.match(dialog, /Data unit, nomor seri, kondisi, tahun, catatan, dan metadata lainnya tidak berubah/);
  assert.match(dialog, /disabled=\{plan\?\.status !== "ready" \|\| preflightLoading\}/);
  assert.match(css, /\.product-reference-selection-toolbar/);
  assert.match(css, /\.product-move-dialog/);
  assert.match(packageJson, /verify:product-reference-move/);
});

test("Product reference move dapat memilih hasil QC resolved tanpa Product Merge", async () => {
  const [migration, component, apiHelper] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260901120000_product_reference_move_qc_results.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminProducts.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/admin-product-api.ts", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /admin_product_references/);
  assert.match(migration, /'QC_RESULT'/);
  assert.match(migration, /proposal\.status in \('APPROVED',\s*'MERGED'\)/);
  assert.match(migration, /update public\.product_proposals set resolved_product_id=p_target_product_id/);
  assert.match(migration, /for update of p/);
  assert.match(migration, /for update of s/);
  assert.doesNotMatch(migration, /update public\.products set/i);
  assert.doesNotMatch(migration, /update public\.product_aliases set/i);
  assert.match(apiHelper, /expectedProposalUpdatedAt/);
  assert.match(component, /referensi dipilih.*referensi langsung.*hasil QC/s);
  assert.match(component, /row\.referenceType === "QC_RESULT"/);
});
