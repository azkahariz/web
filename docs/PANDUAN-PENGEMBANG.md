# Panduan Pengembang

Terakhir diperbarui: 12 Agustus 2026. Baca [SOP Perubahan Production](SOP-PERUBAHAN-PRODUCTION.md)
sebelum mengubah aplikasi karena production sudah berisi data nyata.

## Menjalankan lokal

```powershell
cd Z:\collect-irm-data\web
npm.cmd install
npm.cmd run dev
npm.cmd run check
```

Node.js minimal 22.13 diperlukan. Local URL biasanya `http://localhost:3000`.

## Hosting dan deployment

- Development: `http://localhost:3000` melalui `npm.cmd run dev`.
- Preview: Vercel Preview Deployment dari feature branch.
- Production resmi: https://aloptama-collect.vercel.app

Flow resmi adalah feature branch -> GitHub -> Vercel Preview -> test dan smoke
test -> merge `main` -> Vercel Production. ChatGPT Sites sudah tidak digunakan
untuk deployment production.

## Environment

Salin format dari `.env.example` ke `.env.local`; jangan commit nilainya.

- `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` boleh
  tersedia di browser/Vercel.
- `SUPABASE_SECRET_KEY` hanya untuk route server dan script provisioning.
- `SUPABASE_DB_URL` hanya untuk workflow database tepercaya seperti sync master
  dan verification.

`.env.local`, `private-output/`, output credential, `sync-output/`, dan archive
sudah diabaikan Git. Jangan memasukkan secret pada komponen client atau nama
variable `NEXT_PUBLIC_*`.

## Struktur dan tanggung jawab

| Fitur | File utama |
| --- | --- |
| Login dan akun | `app/LoginForm.tsx`, `app/lib/auth.ts`, `app/lib/supabase/` |
| Form Station/Admin | `app/InventoryApp.tsx`, `app/SiteMetadataForm.tsx` |
| Autosave, lock, version | `app/hooks/useServerDraft.ts`, `app/lib/server-draft.ts` |
| Logout lokal | `app/lib/local-logout.ts` |
| Admin | `app/admin/AdminDashboard.tsx`, `app/api/admin/` |
| QC produk | `app/lib/product-qc.ts`, `app/hooks/useProductCatalog.ts` |
| AWOS mapping | `app/lib/site-subtypes.ts` |
| Field/Domain | `app/config/form-options.ts`, `app/lib/site-metadata.ts` |
| CSV/JSON | `app/lib/inventory-export.ts`, `app/lib/download.ts` |
| Bulk export | `app/lib/admin-export.ts`, `app/lib/admin-export-plan.ts` |
| Master sync | `scripts/sync-master.mjs`, `scripts/master/` |
| Schema/RLS/RPC | `supabase/migrations/` |
| Regression | `tests/` |

Gunakan helper bersama, bukan aturan baru dalam beberapa komponen. Contohnya,
subtipe AWOS selalu melalui `getAllowedSiteSubtypes()` dan export Station/Admin
selalu memakai `buildInventoryCsv()`.

## Test dan verification

```powershell
npm.cmd run check
npm.cmd run verify:auth-autosave
npm.cmd run verify:admin-qc
npm.cmd run verify:admin-api
```

`check` menjalankan lint, build Next.js, dan seluruh test. Regression test
rendering membuka server Next.js hasil build pada port lokal sementara. Script
verification database hanya dijalankan bila area terkait berubah.
`verify:admin-api` memerlukan server lokal dan credential Super Admin lokal.

## Master dan provisioning

```powershell
npm.cmd run validate:master
npm.cmd run sync:master
npm.cmd run provision:station-accounts
npm.cmd run provision:super-admin
```

Validasi tidak menulis database. Sync memperbarui master dari Spreadsheet/CSV;
jangan edit `app/data.generated.json` atau UUID manual. Credential baru hanya
ditulis ke `private-output/`. Provisioning tidak dipakai untuk reset data atau
mengambil kembali password existing.

## Migration dan deploy

Buat migration baru; jangan edit migration yang sudah applied. Uji Vercel
Preview dari branch fitur, lakukan smoke test, lalu merge ke `main` setelah
review. Production resmi adalah https://aloptama-collect.vercel.app.

Jangan ubah timeout lock lima menit, lifecycle Browse/Edit, format CSV/JSON,
RLS, atau pagination data besar tanpa audit consumer dan regression test.

← [Arsitektur dan Alur Data](ARSITEKTUR-DAN-ALUR-DATA.md) | → [Master Data](MASTER-DATA.md)
