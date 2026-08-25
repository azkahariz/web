import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import data from "../app/data.generated.json" with { type: "json" };
import { hasMixedMergeProposalFamilies, normalizeProductText, rankMergeProducts, rankProductSearch, recommendStationProducts, recommendMergeProducts, resolveInstalledProduct, suggestProducts } from "../app/lib/product-qc.ts";
import { buildQcProposalContexts, proposalCategoriesById } from "../app/lib/qc-proposal-context.ts";

test("normalisasi dan suggestion mengenali variasi Campbell CR1000X tanpa auto merge", () => {
  assert.equal(normalizeProductText(" CR-1000 X "), "cr1000x");
  const suggestions = suggestProducts("Campbel", "CR 1000 X", data.products);
  assert.equal(suggestions[0]?.brand, "Campbell Scientific");
  assert.equal(suggestions[0]?.model, "CR1000X");
});

test("rekomendasi merge QC memakai seluruh proposal checkbox secara deterministic", () => {
  const products = [
    { id: "young", brand: "R. M. Young", model: "Wind Monitor", active: true },
    { id: "vaisala", brand: "Vaisala", model: "HMP155", active: true },
    { id: "weak", brand: "Morningstar", model: "TS-M-2", active: true },
    { id: "q330", brand: "Kinematrics", model: "Kinematrics Q330", active: true },
    { id: "q330-plus", brand: "Kinematrics", model: "Kinematrics Q330+", active: true },
  ];
  assert.deepEqual(recommendMergeProducts([], products), []);
  assert.equal(recommendMergeProducts([{ proposedBrand: "Vaisalla", proposedModel: "HMP155" }], products)[0]?.id, "vaisala");
  const aggregate = recommendMergeProducts([
    { proposedBrand: "RM Young", proposedModel: "Wind Monitor" },
    { proposedBrand: "R.M Young", proposedModel: "Wind Monitor" },
    { proposedBrand: "R M Young", proposedModel: "Wind Monitor" },
  ], products);
  assert.equal(aggregate[0]?.id, "young");
  assert.ok(aggregate.length <= 5);
  assert.ok(!aggregate.some((product) => product.id === "weak"));
  const q330 = recommendMergeProducts([{ proposedBrand: "Kinematrics", proposedModel: "Kinematrics Q330" }], products);
  assert.deepEqual(new Set(q330.filter((product) => product.id.startsWith("q330")).map((product) => product.id)), new Set(["q330", "q330-plus"]));
});

test("ranking merge QC tahan variasi format dan satu proposal noisy", () => {
  const products = [
    { id: "young", brand: "R. M. Young", model: "Wind Monitor", active: true },
    { id: "vaisala", brand: "Vaisala", model: "HMP155", active: true },
    { id: "other", brand: "Campbell", model: "CR1000X", active: true },
  ];
  const punctuation = rankMergeProducts([{ proposedBrand: "R M Young", proposedModel: "Wind-Monitor" }], products);
  assert.equal(punctuation[0]?.product.id, "young");
  assert.equal(punctuation[0]?.confidence, "Sangat mirip");
  const typo = rankMergeProducts([{ proposedBrand: "Vaisalla", proposedModel: "HMP155" }], products);
  assert.equal(typo[0]?.product.id, "vaisala");
  const noisySelection = rankMergeProducts([
    { proposedBrand: "RM Young", proposedModel: "Wind Monitor" },
    { proposedBrand: "R.M Young", proposedModel: "WindMonitor" },
    { proposedBrand: "Unknown", proposedModel: "Wind device" },
  ], products);
  assert.equal(noisySelection[0]?.product.id, "young");
  assert.ok(noisySelection[0].coverage >= 2 / 3);
  assert.deepEqual(rankMergeProducts([{ proposedBrand: "Ban kendaraan", proposedModel: "Ring 20" }], products), []);
});

test("ranking merge QC memprioritaskan keluarga merk daripada model exact beda merk", () => {
  const products = [
    { id: "vaisala-110", brand: "Vaisala", model: "HMP110", active: true },
    { id: "vaisala-155", brand: "Vaisala", model: "HMP155", active: true },
    { id: "campbell-155", brand: "Campbell", model: "HMP155", active: true },
    { id: "young-05103", brand: "R. M. Young", model: "05103", active: true },
    { id: "campbell-05103", brand: "Campbell", model: "05103", active: true },
  ];
  const vaisala = rankMergeProducts([{ proposedBrand: "Vaisala", proposedModel: "HMP155" }], products);
  assert.equal(vaisala[0]?.product.id, "vaisala-155");
  const vaisalaFamilyIndex = vaisala.findIndex((candidate) => candidate.product.id === "vaisala-110");
  const campbellModelIndex = vaisala.findIndex((candidate) => candidate.product.id === "campbell-155");
  assert.ok(campbellModelIndex < 0 || vaisalaFamilyIndex < campbellModelIndex);
  assert.equal(rankMergeProducts([{ proposedBrand: "Vaisalla", proposedModel: "HMP155" }], products)[0]?.product.id, "vaisala-155");
  assert.equal(rankMergeProducts([{ proposedBrand: "RM Young", proposedModel: "WindMonitor" }], [{ id: "young", brand: "R. M. Young", model: "Wind Monitor", active: true }])[0]?.confidence, "Sangat mirip");
  const young = rankMergeProducts([{ proposedBrand: "RM Young", proposedModel: "05103" }], products);
  const youngFamilyIndex = young.findIndex((candidate) => candidate.product.id === "young-05103");
  const campbellNumberIndex = young.findIndex((candidate) => candidate.product.id === "campbell-05103");
  assert.ok(campbellNumberIndex < 0 || youngFamilyIndex < campbellNumberIndex);
  const mixed = rankMergeProducts([
    { proposedBrand: "Vaisala", proposedModel: "HMP155" },
    { proposedBrand: "Vaisala", proposedModel: "HMP110" },
    { proposedBrand: "Campbell", proposedModel: "CR1000X" },
  ], products);
  assert.notEqual(mixed[0]?.confidence, "Sangat mirip");
  assert.equal(hasMixedMergeProposalFamilies([
    { proposedBrand: "Vaisala", proposedModel: "HMP155" },
    { proposedBrand: "Vaisala", proposedModel: "HMP110" },
    { proposedBrand: "Campbell", proposedModel: "CR1000X" },
  ]), true);
  assert.equal(hasMixedMergeProposalFamilies([
    { proposedBrand: "RM Young", proposedModel: "Wind Monitor" },
    { proposedBrand: "R.M Young", proposedModel: "WindMonitor" },
  ]), false);
  assert.equal(hasMixedMergeProposalFamilies([
    { proposedBrand: "Vaisala", proposedModel: "HMP155" },
    { proposedBrand: "Vaisala", proposedModel: "WXT530" },
  ]), true);
});

test("pencarian dan rekomendasi Station User memakai canonical product secara brand-aware", () => {
  const products = [
    { id: "apc-20", brand: "APC", model: "SRTG20KXLI UPS 20 KVA", active: true },
    { id: "vaisala-155", brand: "Vaisala", model: "HMP155", active: true },
    { id: "vaisala-110", brand: "Vaisala", model: "HMP110", active: true },
    { id: "campbell-155", brand: "Campbell", model: "HMP155", active: true },
    { id: "young", brand: "R. M. Young", model: "Wind Monitor", active: true },
    { id: "q330", brand: "Kinematrics", model: "Q330", active: true },
    { id: "q330-plus", brand: "Kinematrics", model: "Q330+", active: true },
  ];
  assert.equal(rankProductSearch("APC UPS 20 KVA", products)[0]?.product.id, "apc-20");
  assert.equal(rankProductSearch("Vaisalla HMP155", products)[0]?.product.id, "vaisala-155");
  assert.equal(rankProductSearch("RMYoung", products)[0]?.product.id, "young");
  assert.equal(rankProductSearch("WindMonitor", products)[0]?.product.id, "young");
  const q330 = rankProductSearch("Q330", products).map((candidate) => candidate.product.id);
  assert.deepEqual(q330.slice(0, 2), ["q330", "q330-plus"]);
  const recommendations = recommendStationProducts("Vaisalla", "HMP155", products);
  assert.equal(recommendations[0]?.product.id, "vaisala-155");
  assert.ok(recommendations.length <= 5);
  const vaisalaIndex = recommendations.findIndex((candidate) => candidate.product.id === "vaisala-110");
  const campbellIndex = recommendations.findIndex((candidate) => candidate.product.id === "campbell-155");
  assert.ok(campbellIndex < 0 || vaisalaIndex < campbellIndex);
  const brandOnly = recommendStationProducts("APC", "", products);
  assert.equal(brandOnly[0]?.product.id, "apc-20");
  assert.equal(brandOnly[0]?.confidence, "Kemungkinan");
  const modelOnly = recommendStationProducts("", "Q330", products);
  assert.deepEqual(modelOnly.slice(0, 2).map((candidate) => candidate.product.id), ["q330", "q330-plus"]);
  assert.equal(modelOnly[0]?.confidence, "Kemungkinan");
  assert.deepEqual(recommendStationProducts("Ban", "Ring 20", products), []);
});

test("konteks proposal QC berasal dari submission dan menduplikasi kategori secara aman", () => {
  const sharedProposal = "proposal-shared";
  const orphanProposal = "proposal-orphan";
  const payload = {
    inventory: {
      "Sensor Suhu Udara": [
        { productProposalId: sharedProposal, functionCategories: ["Sensor Suhu Udara", "Sensor Kelembaban Udara"] },
        { productProposalId: sharedProposal, functionCategories: ["Sensor Suhu Udara", "Sensor Kelembaban Udara"] },
      ],
      "Sensor Tekanan Udara": [{ productProposalId: sharedProposal }],
    },
  };
  assert.deepEqual([...proposalCategoriesById(payload).get(sharedProposal)].sort(), ["Sensor Kelembaban Udara", "Sensor Suhu Udara", "Sensor Tekanan Udara"]);
  const contexts = buildQcProposalContexts(
    [
      { id: sharedProposal, submission_id: "submission-awos" },
      { id: orphanProposal, submission_id: "submission-awos" },
      { id: "missing", submission_id: null },
      { id: "missing-row", submission_id: "submission-deleted" },
      { id: "warehouse", submission_id: "submission-warehouse" },
    ],
    [
      { id: "submission-awos", site_id: "site-awos", site_subtype_id: "subtype-tdz", payload },
      { id: "submission-warehouse", site_id: "site-warehouse", site_subtype_id: "subtype-warehouse", payload: { inventory: { Persediaan: [{ productProposalId: "warehouse" }] } } },
    ],
    [{ id: "site-awos", name: "AWOS Kategori III Halim" }, { id: "site-warehouse", name: "Gudang BMKG Pusat" }],
    [{ id: "subtype-tdz", name: "AWOS Kategori III TDZ" }, { id: "subtype-warehouse", name: "Gudang" }],
  );
  assert.deepEqual(contexts.get(sharedProposal), {
    state: "resolved",
    siteName: "AWOS Kategori III Halim",
    subtypeName: "AWOS Kategori III TDZ",
    categories: ["Sensor Kelembaban Udara", "Sensor Suhu Udara", "Sensor Tekanan Udara"],
  });
  assert.deepEqual(contexts.get(orphanProposal), {
    state: "orphaned",
    siteName: "AWOS Kategori III Halim",
    subtypeName: "AWOS Kategori III TDZ",
    categories: [],
  });
  assert.deepEqual(contexts.get("missing"), {
    state: "missing-submission",
    siteName: null,
    subtypeName: null,
    categories: [],
  });
  assert.deepEqual(contexts.get("missing-row"), contexts.get("missing"));
  assert.deepEqual(contexts.get("warehouse"), {
    state: "resolved",
    siteName: "Gudang BMKG Pusat",
    subtypeName: "Gudang",
    categories: ["Persediaan"],
  });
});

test("konteks QC enriched membawa scope kategori stasiun, Tipe Site, dan bucket penggunaan", () => {
  const contexts = buildQcProposalContexts(
    [{ id: "proposal", station_id: "station", submission_id: "submission" }],
    [{ id: "submission", site_id: "site", site_subtype_id: "subtype", payload: { inventory: { "Sensor": [{ productProposalId: "proposal" }] } } }],
    [{ id: "site", name: "AWOS Uji", site_type_id: "awos" }],
    [{ id: "subtype", name: "AWOS TDZ" }],
    [{ id: "station", station_category_id: "11111111-1111-4111-8111-111111111111" }],
    [{ id: "awos", name: "AWOS Kategori III" }],
  );
  assert.deepEqual(contexts.get("proposal"), {
    state: "resolved",
    siteName: "AWOS Uji",
    subtypeName: "AWOS TDZ",
    categories: ["Sensor"],
    stationCategoryId: "11111111-1111-4111-8111-111111111111",
    siteTypeId: "awos",
    stationCategoryName: "Meteorologi",
    siteTypeName: "AWOS Kategori III",
    qcContext: "pengisian",
  });
});

test("resolusi proposal menjaga raw input dan memakai canonical hanya setelah QC", () => {
  const item = { id: "item", brand: "Campbel", model: "CR 1000 X", itemKind: "custom-product", quantity: 1, productProposalId: "proposal" };
  const pending = new Map([["proposal", { id: "proposal", proposedBrand: item.brand, proposedModel: item.model, status: "PENDING" }]]);
  assert.deepEqual(resolveInstalledProduct(item, pending), { brand: "Campbel", model: "CR 1000 X", status: "PENDING", reviewNote: undefined });
  const merged = new Map([["proposal", { ...pending.get("proposal"), status: "MERGED", resolvedBrand: "Campbell Scientific", resolvedModel: "CR1000X" }]]);
  assert.deepEqual(resolveInstalledProduct(item, merged), { brand: "Campbell Scientific", model: "CR1000X", status: "MERGED" });
  assert.equal(item.brand, "Campbel");
  assert.equal(item.model, "CR 1000 X");
});

test("migration menegakkan super admin, QC, alias, audit, dan admin lock di database", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260810170000_super_admin_product_qc.sql", import.meta.url), "utf8");
  for (const table of ["super_admins", "product_proposals", "product_aliases", "admin_audit_log"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
  }
  assert.match(sql, /create or replace function public\.is_super_admin/);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/);
  assert.match(sql, /admin_force_release_submission/);
  assert.match(sql, /admin_force_takeover_submission/);
  assert.match(sql, /QC_BULK_MERGE/);
  assert.match(sql, /spreadsheet_synced boolean not null default true/);
  assert.match(sql, /and submission\.locked_by_session_id = p_session_id/);
});

test("cleanup proposal Pending hanya berjalan setelah payload submission tersimpan", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260814120000_pending_product_proposal_cleanup.sql", import.meta.url), "utf8");
  assert.match(sql, /reconcile_pending_product_proposals/);
  assert.match(sql, /entry\.value ->> 'productProposalId'/);
  assert.match(sql, /proposal\.status = 'PENDING'/);
  assert.match(sql, /proposal\.station_id = p_station_id/);
  assert.match(sql, /proposal\.submission_id = p_submission_id/);
  assert.match(sql, /perform public\.reconcile_pending_product_proposals\(v_station_id, v_submission\.id, p_payload\)/);
  assert.match(sql, /perform public\.reconcile_pending_product_proposals\(v_submission\.station_id, v_submission\.id, p_payload\)/);
  assert.match(sql, /revoke all on function public\.reconcile_pending_product_proposals/);
});

test("admin route memvalidasi role sebelum memakai secret dan secret tidak masuk komponen client", async () => {
  const [route, serverAdmin, dashboard, inventory] = await Promise.all([
    readFile(new URL("../app/api/admin/accounts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/supabase/admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /is_super_admin/);
  assert.match(route, /status: 403/);
  assert.match(route, /createSupabaseAdminClient/);
  assert.match(serverAdmin, /SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(dashboard, /SUPABASE_SECRET_KEY|sb_secret_/);
  assert.doesNotMatch(inventory, /SUPABASE_SECRET_KEY|sb_secret_/);
});

test("station product proposal dan admin QC tetap mempertahankan format export lama", async () => {
  const [inventory, exportSource, typeSource, databaseSync] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/inventory-export.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/types/inventory.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/master/database.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(typeSource, /productProposalId\?: string/);
  assert.match(typeSource, /itemKind\?: "product" \| "custom-product" \| "material"/);
  assert.match(inventory, /create_product_proposal/);
  assert.match(inventory, /resolveInstalledProduct/);
  assert.match(exportSource, /"Stasiun"[\s\S]*"Merk"[\s\S]*"Tipe Produk"/);
  assert.match(databaseSync, /function spreadsheetProductValues/);
  assert.match(databaseSync, /function shouldWarnForMissingProduct/);
});

test("QC merge memakai selection bar dan dialog target dengan ranking canonical existing", async () => {
  const [dashboard, dialog] = await Promise.all([
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/MergeTargetDialog.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /selectedPendingProposals/);
  assert.match(dashboard, /rankMergeProducts/);
  assert.match(dashboard, /qc-selection-bar/);
  assert.match(dashboard, /Pilih target merge/);
  assert.match(dashboard, /MergeTargetDialog/);
  assert.match(dashboard, /hasMixedMergeProposalFamilies/);
  assert.match(dashboard, /p_product_id: mergeProductId/);
  assert.match(dashboard, /setSelectedProposals\(\[proposal\.id\]\)/);
  assert.match(dashboard, /Pilih minimal satu proposal untuk di-merge/);
  assert.match(dashboard, /setMergeProductId\(""\)/);
  assert.match(dialog, /Cari Produk/);
  assert.match(dialog, /Disarankan/);
  assert.match(dialog, /onSubmit/);
  assert.match(dialog, /autoFocus|searchRef\.current\?\.focus/);
});

test("QC workflow memakai dialog approve satu form dan shortcut merge row", async () => {
  const [dashboard, dialog] = await Promise.all([
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/ApproveProductDialog.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /ApproveProductDialog/);
  assert.match(dashboard, /setApproveDialogProposal\(input\)/);
  assert.match(dashboard, /setMergeDialogOpen\(true\)/);
  assert.match(dialog, /Merk/);
  assert.match(dialog, /Tipe/);
  assert.match(dialog, /Catatan pemeriksaan/);
  assert.match(dialog, /Promise<boolean>/);
  assert.doesNotMatch(dashboard, /title: "Brand canonical"/);
});

test("hasil QC menampilkan note APPROVED/MERGED tanpa mengubah fallback REJECTED", async () => {
  const dashboard = await readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /className="qc-result-cell"/);
  assert.match(dashboard, /proposal\.review_note\?\.trim\(\)/);
  assert.match(dashboard, /Catatan: \{proposal\.review_note\}/);
  assert.match(dashboard, /proposal\.resolved_product_id \? <><strong>/);
  assert.match(dashboard, /: proposal\.review_note \|\| "-"/);
});

test("QC multi-admin memakai RPC atomik dan revalidation terarah", async () => {
  const dashboard = await readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/admin/product-proposals/route.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/20260818120000_multi_super_admin_qc.sql", import.meta.url), "utf8");
  assert.match(migration, /add column if not exists display_name text/);
  assert.match(migration, /admin_approve_product_proposal_v2/);
  assert.match(migration, /admin_merge_product_proposals_v2/);
  assert.match(migration, /admin_reject_product_proposal_v2/);
  assert.match(migration, /order by proposal\.id\s+for update/);
  assert.match(migration, /when jsonb_array_length\(v_conflicts\) > 0 then 'partial'/);
  assert.match(migration, /reviewerDisplayName/);
  assert.match(dashboard, /refreshQcProposals/);
  assert.match(dashboard, /Proposal ini sudah diproses/);
  assert.match(dashboard, /setSelectedProposals\(\(current\) => current\.filter/);
  assert.match(dashboard, /Diproses oleh \{proposal\.reviewer\.displayName\}/);
  assert.match(route, /reviewed_by, reviewed_at/);
  assert.match(route, /displayName: admin\.display_name\?\.trim\(\) \|\| admin\.username/);
});

test("provisioning Super Admin individual aman, idempotent, dan private", async () => {
  const script = await readFile(new URL("../scripts/provision-super-admins.mjs", import.meta.url), "utf8");
  const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  for (const username of ["malik", "haryas", "hendri", "agha", "imam", "ofan", "rachel", "rafi", "simon", "vian", "yogas", "eko"]) {
    assert.match(script, new RegExp(`\\["${username}",`));
  }
  assert.match(script, /--confirm-production=PROVISION_SUPER_ADMINS/);
  assert.match(script, /if \(!apply\)/);
  assert.match(script, /adminWithDisplayName\.error\?\.code === "42703"/);
  assert.match(script, /auth\.admin\.createUser/);
  assert.match(script, /target === "remote"[\s\S]*super-admin-credentials-production\.csv/);
  assert.match(script, /super-admin-credentials\.csv/);
  assert.match(script, /super-admin-credentials-production\.csv/);
  assert.match(gitignore, /\/private-output\//);
  assert.doesNotMatch(script, /@bmkg\.go\.id/);
});
