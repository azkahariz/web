# Struktur Codebase

## Status Dokumen

- Baseline source: `1e306ebe683dd5a1cc5c1fe54e9c288727e56331`
- Target pembaca: Developer Aloptama Collect
- Source of truth: source code, tests, dan migrations pada baseline di atas

## Cara Membaca Repository

Mulai dari user-facing entry point, lanjutkan ke primary component, lalu audit API/RPC/table/test yang dipanggil. Jangan mulai dari nama class, komentar lama, atau migration tunggal tanpa mengetahui caller current.

```text
Route/page -> component/hook -> API atau RPC -> migration/schema -> regression test
```

Untuk perubahan kecil, baca consumer langsung dan test terkait. Untuk kontrak shared seperti Submission, Product, atau completion, baca semua consumer yang disebut pada Quick Map sebelum mengubah behavior.

## Peta Directory

```text
app/
  admin/          Super Admin UI, dialog Product, monitoring, export
  api/            Next.js Route Handlers
  components/     shared UI: feedback, button, guide, footer
  config/         pilihan form/domain
  hooks/          lifecycle draft, catalog Product, region, progress
  lib/            domain helpers, Supabase helpers, export, navigation
  panduan/        panduan Station dalam aplikasi
  types/          kontrak TypeScript inventory dan metadata
  page.tsx        SSR entry Station/Admin routing
  InventoryApp.tsx Station/Admin editor utama

supabase/
  migrations/     schema, RLS, function/RPC evolution yang immutable
  config.toml     local Supabase project/port configuration

tests/            contract, source and rendered UI regression tests
scripts/          master/export/provision/verify/remediation tools
scripts/master/   CSV source, validation, database connection/sync helper
docs/             user/operator/developer documentation
private-output/   ignored local audit, backup, credential, temporary output
```

`app/data.generated.json` adalah generated artifact yang masih dipakai generator/test/recovery. Jangan mengedit manual dan jangan memperlakukannya sebagai Station runtime master.

## Entry Points Utama

### `app/page.tsx`

Memilih pengalaman pengguna setelah SSR session/account check: redirect Super Admin ke `/admin`, atau memuat runtime master scoped dan merender `InventoryApp` untuk Station User. File ini tidak memiliki lifecycle save/lock; lanjutkan ke `useServerDraft.ts`.

### `app/InventoryApp.tsx`

Memiliki pilihan Site/Subtipe, state form inventory/metadata/Gudang, Product picker, proposal custom Product, export, dan presentasi editor. Jangan menduplikasi guard database atau mapping shared di file ini; lanjutkan ke hook/lib sesuai domain.

### `app/hooks/useServerDraft.ts`

Memiliki lifecycle Browse/Edit, acquire/retry lock, autosave, version conflict, touch activity, release, dan state local-only. Ini adalah file pertama untuk perubahan autosave atau lock.

### `app/admin/page.tsx` dan `app/admin/AdminDashboard.tsx`

Membuka Super Admin guard dan dashboard URL-driven (`/admin?view=...`). `AdminDashboard` mengoordinasikan Ringkasan, Station & Pengisian, QC, accounts, lock, audit, serta cache detail monitoring. Product maintenance besar berada di `AdminProducts.tsx`.

### `app/api/`

Route handler untuk Product, Admin Product, Submission, account, runtime master Admin, dan region proxy. API bukan pengganti final boundary RPC/RLS.

### `proxy.ts`

Menangani compatibility redirect legacy Vercel sebelum session refresh. Jangan memindahkan behavior ini ke komponen React.

## Frontend Areas

| Area | File awal | Lanjutkan ke |
| --- | --- | --- |
| Station editor | `InventoryApp.tsx` | `useServerDraft.ts`, `server-draft.ts`, `inventory.ts` |
| Site metadata | `SiteMetadataForm.tsx` | `types/site-metadata.ts`, `lib/site-metadata.ts`, `useRegionOptions.ts` |
| Product picker | `useProductCatalog.ts` | `/api/products`, `lib/product-picker.ts` |
| Station progress | `StationSiteProgressPanel.tsx` | `useStationSiteProgress.ts`, `station-site-progress.ts` |
| Admin shell | `AdminDashboard.tsx` | `admin-navigation.ts`, `admin-summary.ts`, monitoring helpers |
| Submission monitor | `AdminSubmissionMonitor.tsx` | `/api/admin/submissions`, `submission-monitoring.ts` |
| Product master | `AdminProducts.tsx` | `/api/admin/products`, dialog components |
| QC | `AdminDashboard.tsx`, `ApproveProductDialog.tsx`, `MergeTargetDialog.tsx` | `/api/admin/product-proposals`, `product-qc.ts` |
| Guide | `app/panduan/page.tsx`, `app/admin/panduan/page.tsx` | `guide-updates.ts`, Guide components |

## API Routes

| Area | Route location | What it owns |
| --- | --- | --- |
| Product picker | `app/api/products/route.ts` | authenticated active catalog, search, alias/canonical resolution |
| Region data | `app/api/regions/route.ts` | allowlisted wilayah.id proxy |
| Admin accounts | `app/api/admin/accounts/route.ts` | provision, reset password, active state, audit |
| Admin QC list | `app/api/admin/product-proposals/route.ts` | paginated proposals and aggregate counts |
| Admin Product | `app/api/admin/products/` | list/CRUD/status/usage/dependency/reference/move/merge/delete |
| Admin runtime master | `app/api/admin/runtime-master/route.ts` | active master for Admin editor |
| Admin Submission | `app/api/admin/submissions/` | list/detail/archive/restore/delete and ensure/open |

Route methods and exact auth boundary can change; inspect route and called RPC together before changing a request contract.

## Library / Helpers

| Helper group | Examples | Responsibility |
| --- | --- | --- |
| Supabase clients | `lib/supabase/*` | browser, SSR cookie, server-only admin clients |
| Submission | `server-draft.ts`, `draft-storage.ts`, `submission-monitoring.ts` | payload shape, browser draft, monitoring projection |
| Master/runtime | `station-runtime-master.ts`, `admin-inventory-master.ts`, `site-subtypes.ts`, `warehouse.ts` | live master conversion and allowed context |
| Completion | `station-completion*.ts`, `station-monitoring.ts`, `admin-summary.ts` | parse/display/filter current summary data |
| Product/QC | `product-qc.ts`, `product-picker.ts`, `product-reference-*.ts`, `admin-product-api.ts` | client ranking, request parsing, conflict messages |
| Export | `inventory-export.ts`, `admin-export.ts`, `download.ts` | CSV/JSON and Admin bulk export |
| Guide/UI | `guide-*.ts`, `AppFeedback.tsx`, `AsyncButton.tsx` | shared feedback and guide state |

## Supabase / Migrations

`supabase/migrations/` contains 33 chronological SQL migrations at this baseline. Migration files create/replace schema, policies, triggers, and RPC. Read the newest migration that defines a function and the tests that assert its current contract; older migrations explain history but may be superseded.

Important current milestones include Station Auth/autosave, Super Admin/QC, runtime master, Product references/merge/delete, Site/Subtype validation, completion performance, and Gudang progress. Detailed database map is intentionally deferred to Batch 2.

## Tests

There are 33 test files under `tests/`:

- General suite verifies source contracts, rendering, master/export, Auth/autosave, Admin/QC/Product, runtime master, family validation, Guide, and redirect behavior.
- Completion suite verifies expected/filled semantics, detail UI, unified filling, and Station monitoring.
- Test file names track domains: `product-merge.test.mjs`, `station-completion-engine.test.mjs`, `legacy-vercel-redirect.test.mjs`, and similar.

Use the closest domain test as the first regression target. Do not rely on an unrelated full-suite pass to justify changing a shared behavior without a focused assertion.

## Scripts / Verifiers

| Script group | Examples | Safety |
| --- | --- | --- |
| Master validation/export | `sync-master.mjs`, `export-master-csv.mjs`, `export-source-csv-remote.mjs` | validate/read-only export versus explicit sync must be distinguished |
| Provisioning | `provision-station-accounts.mjs`, `provision-super-admins.mjs` | can mutate; remote requires explicit target/confirmation |
| Local DB verifier | `verify-auth-autosave.mjs`, `verify-admin-qc.mjs`, Product/Completion/Gudang verifiers | local/disposable DB only; fixture rollback is not a production permit |
| Controlled remediation | Cengkareng remediation scripts | historical targeted tool; explicit target/confirmation/backup |
| Benchmark | `benchmark-station-completion.mjs` | disposable local DB only |

## Documentation

`docs/` now has canonical developer onboarding files numbered `00` through `04`. Existing unnumbered user/operator guides remain during the staged documentation migration. `docs/MULAI-DI-SINI.md` is retained as a compatibility entry point for links in README and user guides.

## Feature -> Code Quick Map

| Saya Ingin Mengubah | Mulai dari | API/RPC terkait | Test terkait |
| --- | --- | --- | --- |
| Login | `app/LoginForm.tsx`, `app/page.tsx` | Supabase Auth, account tables | `auth-autosave.test.mjs`, rendered HTML |
| Station Submission | `app/InventoryApp.tsx` | submission RPC family | `auth-autosave.test.mjs` |
| Autosave | `app/hooks/useServerDraft.ts` | `save_submission`, `admin_save_submission` | `auth-autosave.test.mjs`, verifier |
| Soft Lock | `useServerDraft.ts`, `local-logout.ts` | open/touch/release/takeover RPCs | `auth-autosave.test.mjs` |
| Admin Ringkasan | `app/admin/AdminDashboard.tsx` | `admin_completion_monitoring_summary` | station monitoring tests |
| Completion | `lib/station-completion*.ts` | completion summary/detail RPCs | completion engine/detail tests |
| Gudang progress | `lib/warehouse.ts`, `admin-summary.ts` | warehouse summary/completion RPCs | `warehouse.test.mjs`, completion verifier |
| QC Produk | `AdminDashboard.tsx` | Product proposal list and QC v2 RPC | `admin-qc.test.mjs`, verifier |
| Proposal status counts | `qc-proposal-status-summary.ts` | aggregate status RPC | `qc-pending-summary.test.mjs`, verifier |
| Produk | `AdminProducts.tsx` | `/api/admin/products`, Product RPCs | `admin-products.test.mjs`, verifier |
| Dependency / Referensi | Product usage dialog | dependency/reference API and RPC | product dependencies/context tests |
| Pindahkan Referensi | `ProductReferenceMoveDialog.tsx` | move preflight/apply API/RPC | `product-reference-move.test.mjs`, verifier |
| Product Merge | `ProductMergeDialog.tsx` | merge preflight/apply API/RPC | `product-merge.test.mjs`, verifier |
| Admin Panduan | `app/admin/panduan/page.tsx` | no API required | Guide tests |
| Legacy Vercel redirect | `proxy.ts`, `legacy-vercel-redirect.ts` | none | `legacy-vercel-redirect.test.mjs` |

## Critical Files Reading Order

### Must Read

1. `package.json` - scripts, dependency versions, Node minimum.
2. `app/page.tsx` - Station/Admin entry selection.
3. `app/InventoryApp.tsx` - Station editor and Gudang behavior.
4. `app/hooks/useServerDraft.ts` - autosave, lock, version conflict.
5. `app/lib/server-draft.ts` - Submission payload and browser draft scope.
6. `app/admin/AdminDashboard.tsx` - Admin shell, monitoring, QC, accounts.
7. `app/admin/AdminProducts.tsx` - Product maintenance UI.
8. `app/lib/station-runtime-master.ts` - Station runtime master contract.
9. `app/lib/admin-inventory-master.ts` - Admin runtime master builder.
10. `supabase/migrations/20260903120000_optimize_station_completion.sql` - final completion query architecture.
11. `supabase/migrations/20260905120000_gudang_submission_progress.sql` - final Gudang progress semantics.
12. `supabase/migrations/20260824120000_product_merge.sql` - canonical merge semantics.

### Important References

- `app/lib/supabase/`, `app/lib/admin-product-api.ts`, `app/lib/site-subtypes.ts`.
- Product move/delete dialogs and corresponding API routes.
- migrations for runtime master, Site/Subtype guard, QC v2, Product reference move, category compatibility, proposal pagination/context.
- domain test and verifier matching the changed feature.

## Generated / Local-Only Files

- `.env*` is ignored except `.env.example`; never commit real values.
- `private-output/` is ignored for audit, backup, temporary credentials, and local outputs.
- `.next/`, `node_modules/`, `exports/`, `sync-output/`, `outputs/`, `work/`, and archive artifacts are ignored.
- `.vercel/` is local Vercel metadata and ignored.
- `app/data.generated.json` is tracked generated/reference data; do not manually edit or casually regenerate.

## Legacy / Compatibility Locations

- `app/lib/legacy-vercel-redirect.ts` and `proxy.ts` -> legacy hostname compatibility.
- `app/lib/category-identity.ts` and migration `20260829120000_legacy_category_alias_compatibility.sql` -> payload category compatibility.
- `app/lib/station-runtime-master.ts` -> legacy subtype remediation gate data.
- `scripts/master/`, `generate-data.ps1`, `app/data.generated.json` -> legacy/recovery master tooling.
- migrations and verifiers with older wrapper functions -> history/compatibility; inspect consumer before removal.

## Source of Truth untuk Dokumen Ini

- `app/`, `app/api/`, `app/admin/`, `app/hooks/`, `app/lib/`, `app/types/`.
- `supabase/migrations/` and `supabase/config.toml`.
- `scripts/` and `scripts/master/`.
- `tests/` and `package.json`.
- `.gitignore` -> generated/local-only status.
- `private-output/knowledge-transfer-audit-2026-09-03.md` -> audited feature map, rechecked against paths above.

## Baca Sebelumnya

[Setup Development](./03-SETUP-DEVELOPMENT.md)

## Baca Selanjutnya

[Database dan Supabase](./05-DATABASE-SUPABASE.md)
