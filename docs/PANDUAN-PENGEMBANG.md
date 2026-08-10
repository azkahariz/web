# Panduan Pengembang

## Requirement

- Windows PowerShell
- Node.js minimal 22.13
- npm
- akses project Supabase dan Vercel untuk pekerjaan deployment

## Menjalankan project

```powershell
cd Z:\collect-irm-data\web
npm.cmd install
npm.cmd run dev
```

Local URL biasanya `http://localhost:3000`.

## Environment

Buat `.env.local` berdasarkan `.env.example`:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
SUPABASE_DB_URL=...
```

- Dua variable `NEXT_PUBLIC_` boleh masuk browser dan diperlukan di Vercel.
- `SUPABASE_SECRET_KEY` hanya server-side. Diperlukan Vercel untuk provision dan
  reset password melalui route admin.
- `SUPABASE_DB_URL` hanya workflow lokal tepercaya: sync dan verification.

## Pemeriksaan

```powershell
npm.cmd run check
npm.cmd run verify:auth-autosave
npm.cmd run verify:admin-qc
npm.cmd run verify:admin-api
```

`check` menjalankan lint, tes, build kompatibilitas Vinext, dan build native
Next.js. Verification database memakai fixture sementara yang di-rollback atau
dibersihkan pada akhir proses.

## Index command

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run check
npm.cmd run validate:master
npm.cmd run sync:master
npm.cmd run provision:station-accounts
npm.cmd run provision:super-admin
npm.cmd run verify:auth-autosave
npm.cmd run verify:admin-qc
npm.cmd run verify:admin-api
```

`verify:admin-api` memerlukan server lokal pada `http://127.0.0.1:3000` dan
credential Super Admin lokal. Script membuat fixture sendiri dan membersihkannya.

## Git dan Vercel

```powershell
git switch -c feature/nama-fitur
git status
git add <file-yang-relevan>
git commit -m "feat: jelaskan perubahan"
git push -u origin feature/nama-fitur
```

Push feature branch membuat Vercel Preview. Uji Preview sebelum merge ke
`main`. Production berasal dari branch produksi yang dikonfigurasi di Vercel.

## Migration Supabase

Jangan mengedit migration yang sudah applied. Buat file baru di
`supabase/migrations/`, lalu:

```powershell
npx.cmd supabase link --project-ref PROJECT_REF
npx.cmd supabase db push --linked --dry-run
npx.cmd supabase db push --linked
```

Setelah push, jalankan verification terkait.

## Master data

```powershell
npm.cmd run validate:master
npm.cmd run sync:master
```

Jangan edit `app/data.generated.json`. Edit Spreadsheet/CSV, lalu jalankan
generator/sync. Lihat [MASTER-DATA-SUPABASE.md](MASTER-DATA-SUPABASE.md).

## Provisioning

```powershell
npm.cmd run provision:station-accounts
npm.cmd run provision:super-admin
```

Hasil credential baru berada di `private-output/` dan tidak boleh di-commit.
Provision Super Admin idempotent: rerun tidak mengubah password existing.

## Tanggung jawab file

- `app/InventoryApp.tsx`: alur form station dan editor admin.
- `app/hooks/useServerDraft.ts`: browse/edit, autosave, lock, dan version.
- `app/hooks/useProductCatalog.ts`: generated fallback + katalog live Supabase.
- `app/lib/product-qc.ts`: normalisasi, similarity, dan resolusi export.
- `app/lib/site-subtypes.ts`: satu-satunya business rule subtype per Site,
  termasuk family AWOS Kategori III.
- `app/lib/inventory-export.ts`: serializer CSV/JSON bersama untuk Station dan
  Admin; jangan membuat schema export khusus Admin.
- `app/lib/admin-export.ts`: query batch read-only dan pembuatan ZIP Admin.
- `app/lib/admin-export-plan.ts`: scope Station/Site/Subtipe serta filename.
- `app/admin/`: dashboard dan editor Super Admin.
- `app/api/admin/`: tindakan Admin server-only. Endpoint `submissions/ensure`
  hanya dipanggil oleh aksi Edit eksplisit, bukan Buka atau Unduh.
- `supabase/migrations/`: schema, RLS, dan RPC.
- `scripts/master/`: validasi dan sync Spreadsheet/CSV.
- `tests/`: kontrak yang tidak boleh rusak.

## Yang tidak boleh dilakukan

- Jangan masukkan service/secret key ke komponen client atau prefix
  `NEXT_PUBLIC_`.
- Jangan hard delete master atau mengganti UUID existing.
- Jangan bypass RLS dengan secret di browser.
- Jangan mengubah timeout lock lima menit atau format CSV/JSON tanpa keputusan
  produk yang eksplisit.
- Jangan menjalankan sync master sebelum validasi CSV lulus.

## Mapping subtype dan export

Seluruh consumer wajib memakai `getAllowedSiteSubtypes()`. Untuk AWOS Kategori
III, nama Site menentukan salah satu family AllWeather, Coastal, Degreane, atau
Microstep. Variant unknown menghasilkan daftar kosong agar masalah master tampak,
bukan fallback ke 16 subtype.

CSV Station, single Admin, dan bulk Admin semuanya memakai
`buildInventoryCsv()`. Data tanpa submission menggunakan
`createDefaultDraftPayload()` dan tidak ditulis ke database. ZIP dibuat di
browser dengan dynamic import `fflate`, sehingga bundle Station tidak memuat ZIP
library pada jalur normal.

Query bulk mengambil submission dan proposal per stasiun, lalu melakukan mapping
lokal dengan `site_id + site_subtype_id`; jangan membuat request per file. Semua
query yang dapat melebihi batas PostgREST 1.000 row harus memakai
`loadAllAdminRows()`, stable ordering, dan `.range()`.

Lifecycle harus tetap terpisah: Browse/Buka/Unduh adalah read-only dan tidak
menyentuh lock. Hanya Edit yang boleh membuat submission, acquire/touch/release
lock, autosave, atau menaikkan version.
