# Aloptama Collect

## Apa aplikasi ini?

Aloptama Collect dipakai untuk mencatat metadata lokasi dan perangkat yang
terpasang pada setiap site Aloptama BMKG. Data dapat disimpan bertahap, dibuka
kembali, dan diunduh sebagai CSV atau JSON tanpa menghilangkan format lama.

Production: https://aloptama-collect.vercel.app

## Siapa yang menggunakan?

- **Station User**: akun bersama satu stasiun. Hanya dapat melihat dan mengubah
  site milik stasiunnya.
- **Super Admin**: pengelola lintas stasiun. Dapat melihat submission, lock,
  akun stasiun, proposal produk, dan audit tindakan admin.

## Gambaran alur

```text
Station User
    -> Login
    -> Stasiun sendiri
    -> Pilih Site dan Subtipe
    -> Browse Mode
    -> Edit Data
    -> localStorage + Supabase
    -> CSV / JSON
```

Browse Mode hanya membaca. Lock baru diminta saat pengguna menekan **Edit
Data**. Satu draft hanya dapat diedit satu session pada satu waktu. Lock habis
setelah lima menit tanpa aktivitas.

## Komponen utama

- **Google Spreadsheet**: tempat master stasiun, site, subtipe, profil, barang,
  dan produk dipelihara manusia.
- **CSV**: hasil export Spreadsheet yang dibaca script lokal.
- **data.generated.json**: hasil generator untuk fallback cepat aplikasi.
- **Supabase**: layanan login dan database PostgreSQL untuk master ber-UUID,
  akun, submission, lock, proposal produk, serta audit admin.
- **Vercel**: layanan yang menjalankan website Next.js di internet.

## Bagaimana data mengalir?

MASTER:

```text
Google Spreadsheet
      -> CSV
      -> scripts/generate-data.ps1
      -> app/data.generated.json
      -> npm.cmd run sync:master
      -> Supabase
```

PENGISIAN:

```text
Station User
      -> Aloptama Collect
      -> localStorage + Supabase submissions
      -> CSV / JSON
```

PRODUCT QC:

```text
User mengusulkan produk
      -> PENDING
      -> Super Admin
         +-> APPROVED sebagai produk baru
         +-> MERGED ke produk existing
         `-> REJECTED
      -> produk baku/canonical
      -> langsung tersedia dari Supabase
      -> export products-qc-pending-spreadsheet.csv
      -> Spreadsheet
      -> sync:master
      -> selesai direkonsiliasi
```

Raw input pengguna tidak ditimpa. Contoh `Campbel / CR 1000 X` tetap tersimpan
di proposal walaupun hasil QC menjadi `Campbell Scientific / CR1000X`.

## Istilah sederhana

- **UUID**: nomor identitas unik yang tetap sama walaupun nama record berubah.
- **Supabase**: layanan login dan database aplikasi.
- **Vercel**: layanan hosting website Production dan Preview.
- **localStorage**: penyimpanan cadangan di browser/perangkat yang sedang dipakai.
- **RLS**: aturan database yang membatasi baris mana yang boleh dilihat user.
- **Migration**: file SQL berurutan untuk mengubah struktur database secara aman.
- **RPC**: fungsi database yang dipanggil aplikasi untuk operasi terkontrol.
- **Payload**: isi lengkap satu draft yang disimpan sebagai JSONB.
- **JSONB**: format JSON yang disimpan dan dapat diproses PostgreSQL.
- **Soft lock**: tanda bahwa satu draft sedang diedit session tertentu.
- **Version conflict**: server sudah memiliki versi lebih baru daripada browser.
- **Proposal Produk**: Brand/Tipe baru yang diajukan pengguna untuk diperiksa.
- **Produk Canonical**: penulisan Brand/Tipe baku yang disetujui admin.
- **Merge**: menghubungkan proposal ke produk existing yang sebenarnya sama.
- **Alias**: variasi penulisan yang diarahkan ke produk canonical.
- **Source of Truth**: sumber utama yang menjadi acuan akhir. Untuk master
  Aloptama, sumber ini adalah Spreadsheet.

## Baca apa selanjutnya?

1. [Panduan Pengguna Stasiun](PANDUAN-PENGGUNA-STASIUN.md)
2. [Panduan Super Admin](PANDUAN-SUPER-ADMIN.md)
3. [Master Data Supabase](MASTER-DATA-SUPABASE.md)
4. [Panduan Pengembang](PANDUAN-PENGEMBANG.md)
5. [Struktur Proyek](STRUKTUR-PROYEK.md)
6. [Troubleshooting](TROUBLESHOOTING.md)
7. [Checklist Publikasi](CHECKLIST-PUBLIKASI.md)
