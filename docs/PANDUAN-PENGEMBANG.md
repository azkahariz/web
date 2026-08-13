# Panduan Pengembang

Terakhir diperbarui: 13 Agustus 2026. Baca [SOP Perubahan Production](SOP-PERUBAHAN-PRODUCTION.md)
sebelum mengubah aplikasi karena production sudah berisi data nyata.

## Menjalankan lokal

```powershell
cd Z:\collect-irm-data\web
npm.cmd install
npm.cmd run dev
npm.cmd run check
```

Node.js minimal 22.13 diperlukan. Local URL biasanya `http://localhost:3000`.

## Workflow branch

Gunakan alur berikut untuk perubahan baru:

```text
main -> feature branch -> implement -> validate/test/build -> commit
     -> push -> Vercel Preview -> smoke test -> merge main
     -> production smoke test -> hapus branch yang sudah merged
```

Branch bukan arsip permanen. History commit tetap tersimpan setelah branch
yang sudah merged dihapus. Jangan menghapus branch yang masih memiliki commit
unik atau pekerjaan aktif.

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
| Monitoring submission | `app/admin/AdminSubmissionMonitor.tsx`, `app/lib/submission-monitoring.ts` |
| Toast dan dialog | `app/components/AppFeedback.tsx` |
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

## Feedback async

Gunakan `app/components/AsyncButton.tsx` untuk aksi async yang dapat dipicu user.
Berikan `loading` dan `loadingText` yang menjelaskan proses; komponen akan
menonaktifkan tombol dan menambahkan spinner. Untuk pemuatan tabel atau detail,
pertahankan data/layout yang ada lalu tampilkan teks inline seperti `Memuat...`.
Jangan memakai delay buatan, progress palsu, atau loader global untuk request
kecil. Pastikan setiap operasi mengembalikan UI ke kondisi normal pada `finally`.

Gunakan `useAppFeedback()` untuk Toast, confirmation modal, dan input dialog.
Jangan menambahkan `alert()`, `confirm()`, atau `prompt()` native pada application
code. Secret dan temporary password tidak boleh masuk Toast; password sementara
tetap hanya ditampilkan pada credential dialog sekali setelah reset/provision.

## Test dan verification

```powershell
npm.cmd run check
npm.cmd run verify:auth-autosave
npm.cmd run verify:admin-qc
npm.cmd run verify:admin-submissions
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

### Export master ke CSV

Export master bersifat read-only dan secara default memakai Supabase lokal:

```powershell
npm.cmd run export:master:csv
npm.cmd run export:master:csv -- --output exports/master-snapshot
```

Command remote harus dipilih secara eksplisit dan membaca `SUPABASE_DB_URL`
dari `.env.local` atau environment sesi:

```powershell
npm.cmd run export:master:csv:remote
```

Command pertama selalu LOCAL dan mengabaikan `SUPABASE_DB_URL`. Command kedua
selalu REMOTE, gagal bila URL tidak tersedia, dan menolak URL `127.0.0.1` atau
localhost. Keduanya hanya menjalankan query baca dalam transaksi `READ ONLY`.

Hasil ditulis ke `exports/master/` (diabaikan Git) sebagai CSV UTF-8 dengan BOM,
escaping CSV standar, UUID, dan nama relasi. File per tabel mencakup sembilan
tabel master: stations, sites, site_types, site_subtypes, item_profiles, items,
profile_items, product_categories, dan products. `nama-stasiun.csv` adalah
gabungan referensi Station/Site/Type/Subtype/Profile; satu Site AWOS Kategori III
tetap memakai satu `site_id` dan dapat muncul beberapa kali untuk setiap subtype.
Site Gudang mempertahankan label literal `Gudang`.

Untuk database remote, set `SUPABASE_DB_URL` hanya pada sesi PowerShell yang
memang diizinkan membaca database tersebut, lalu jalankan command yang sama.
Script membuka transaksi `READ ONLY`, mengurutkan hasil secara deterministik,
memeriksa UUID/FK, dan tidak memuat submission, lock, audit, QC, atau tabel
operasional lain. Jangan menaruh URL berisi credential di source code atau log.

### Source of truth

Workflow master berjalan sebagai berikut:

```text
CSV/Spreadsheet master -> generator -> app/data.generated.json -> Supabase master tables
Supabase master tables -> export:master:csv -> CSV snapshot read-only
```

CSV/Spreadsheet adalah input master. `data.generated.json` adalah generated
artifact yang sengaja dilacak Git. Snapshot hasil export bukan input otomatis
dan tidak mengubah source of truth. Data submission, lock, QC, dan audit adalah
data operasional yang terpisah.

### Warehouse verification

```powershell
npx.cmd supabase start
npm.cmd run verify:warehouse
```

Verification default memakai Supabase lokal dan mengembalikan fixture database
keadaan semula. Jangan memakai database production untuk regression test.

## Migration dan deploy

Buat migration baru; jangan edit migration yang sudah applied. Uji lokal dahulu,
lalu periksa `migration list --linked` dan jalankan
`db push --linked --dry-run`. Setelah review, terapkan ke environment yang
sesuai dan lakukan smoke test. Uji Vercel Preview dari branch fitur, lalu merge
ke `main` setelah review. Jangan menjalankan migration production dalam workflow
housekeeping. Production resmi adalah https://aloptama-collect.vercel.app.

Jangan ubah timeout lock lima menit, lifecycle Browse/Edit, format CSV/JSON,
RLS, atau pagination data besar tanpa audit consumer dan regression test.

## Kontrak monitoring submission

`admin_list_submissions` adalah source list Super Admin. RPC ini melakukan join
master, search/filter, progress, sort, dan pagination di database, lalu hanya
mengembalikan metadata ringkas. Jangan menambahkan `payload` ke projection list.
Ukuran halaman default 50 dan query tidak boleh diganti dengan load-all lalu
slice di browser. Cache key client wajib mencakup page, page size, search,
filter, archive, sort field, dan direction. Sorting harus dilakukan database
sebelum limit/offset dengan `id` sebagai tie-breaker stabil.

`admin_get_submission_detail` baru dipanggil saat satu row dibuka. Komponen
menyimpan detail dalam state selama halaman aktif; Muat ulang mengosongkan cache.
Tidak ada Realtime atau polling periodik.

Progress memakai `profile_items` aktif untuk profil Subtipe sebagai denominator.
Kategori terisi jika array `payload.inventory[nama_item]` mempunyai minimal satu
produk dengan Brand dan Tipe, atau material dengan nama bahan. Metadata Aloptama
dan field unit opsional sengaja tidak dibaca. Helper TypeScript dan fungsi SQL
harus tetap mempunyai contract yang sama.

Archive memakai `archived_at`, `archived_by`, dan `archive_reason`. List dan
count aktif wajib mengecualikan arsip. Restore hanya membersihkan field archive;
UUID, payload, dan version tidak diubah. Semua perubahan archive/restore melalui
RPC Super Admin dan audit hanya menyimpan identitas relasi serta alasan, bukan
payload. RPC archive menolak lock yang masih aktif dan hanya membersihkan lock
yang sudah kedaluwarsa.

Hard delete hanya melalui `admin_permanently_delete_submission()`. RPC wajib
memanggil `require_super_admin()`, mengunci row, menolak lock aktif, menulis
audit metadata tanpa payload, lalu menghapus Submission secara atomic. FK
`product_proposals.submission_id` memakai `ON DELETE SET NULL`, sehingga record
QC tetap dipertahankan. Migration hard delete tidak boleh diterapkan ke
production sebelum verifikasi lokal, Preview, dan persetujuan deployment.

## Contract Gudang dan multi-category

Mode Gudang dipilih oleh UUID canonical Site Type, Subtype, dan Item Profile di
`app/lib/warehouse.ts`; nama Site tidak dipakai. Payload tetap schema v1 dan
berbentuk `inventory[kategori] -> InstalledItem[] -> UnitDetail[]`.

Field additive `functionCategories` dan `functionCategoryIds` berada pada
`InstalledItem`. Payload lama tanpa field tersebut otomatis memakai kategori
penyimpanan sebagai satu-satunya fungsi. `UnitDetail.id` adalah stable physical
unit ID. Field Gudang `procurementYear` dan `procurementActivity` bersifat
opsional; Site biasa tetap memakai `installedYear`.

Pasangan fungsi canonical didefinisikan terpusat di
`app/lib/category-functions.ts`: Suhu/Kelembaban dan Kecepatan/Arah Angin.
Istilah UI **Kategori Barang** mengacu pada `items` yang dipetakan melalui
`profile_items`; tabel `product_categories` tidak mempunyai relasi faktual ke
`products`, sehingga fitur Gudang tidak mengarang filter Product per kategori.
Progress Site tetap expected-category based dan membership kombinasi dapat
memenuhi dua numerator. Profil `Gudang` adalah allowed catalog;
monitoring Gudang memakai category/unit count dan tidak memiliki completeness.

Master Gudang disinkronkan melalui CSV dan `npm.cmd run sync:master`. UUID
existing harus dipertahankan. Migration warehouse hanya mengganti helper/RPC
monitoring dan wajib diuji lokal/Preview sebelum diterapkan ke production.

← [Arsitektur dan Alur Data](ARSITEKTUR-DAN-ALUR-DATA.md) | → [Master Data](MASTER-DATA.md)
