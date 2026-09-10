# Changelog

> [!NOTE]
> **Status: HISTORICAL**
>
> Dokumen ini merangkum milestone pada periode tertentu, bukan behavior runtime
> saat ini. Untuk implementasi current, mulai dari
> [Mulai di Sini](./00-MULAI-DI-SINI.md) dan
> [History dan Legacy](./16-HISTORY-DAN-LEGACY.md).

Tanggal mengikuti Git history. Ini ringkasan milestone, bukan daftar seluruh
commit.

## 2026-09-11

- Super Admin dapat melepas occurrence Product terpilih secara atomik melalui
  Hapus Referensi tanpa menghapus Product, Submission, atau riwayat QC.
- Daftar referensi Product menyajikan QC_RESULT per inventory occurrence agar
  jumlah, kategori, filter, dan tindakan selektif memakai source current yang sama.
- Admin Produk menampilkan baris master lebih dahulu dan mengisi Usage/Kategori
  secara asinkron untuk sort biasa.
- Enrichment page-level menggabungkan dua traversal referensi menjadi satu scan
  dengan parity DIRECT, QC_RESULT, archived, count, dan category terverifikasi.
- Filter metadata dimuat setelah enrichment awal dan digunakan kembali selama
  sesi UI agar tidak bersaing dengan critical path pertama.

## 2026-09-10

- Admin Produk membatasi enrichment usage/kategori ke page aktif pada sort
  biasa, membatalkan request list stale, dan memisahkan kegagalan enrichment
  dari zero/empty state Product.
- Admin Produk menyediakan filter referensi Kategori multi-select, Kelompok
  Stasiun, dan Tipe Site dengan same-occurrence semantics sebelum pagination.
- Super Admin memperoleh kontrol global DIBUKA/DITUTUP untuk akses pengisian
  UPT, dengan enforcement RPC Station, stale-tab handling, dan audit transisi.
- Form Station dan tampilan form Admin me-resolve Merk/Tipe Product current dari
  UUID canonical tanpa menulis ulang snapshot Submission atau history QC.
- Detail Submission dan export inventaris Admin menggunakan Merk/Tipe Product
  canonical current; snapshot, usulan, QC History, dan alias historis tetap utuh.

## 2026-09-09

- Daftar Admin Produk menampilkan kategori unik dari referensi Product current
  melalui agregasi bulk tanpa query per Product.

## 2026-09-08

- QC menjaga UUID proposal REJECTED sebagai history terminal dan menampilkan pembeda proposal pada row yang beridentitas Produk sama.
- Approve Baru mengembalikan conflict terstruktur untuk canonical duplicate; QC Merge mengikuti canonical successor target secara atomik.
- Target QC Merge memakai pencarian server-side terpaginated agar Product canonical tetap ditemukan ketika katalog melebihi 1.000 row.
- Product Picker dan perhitungan penggunaan Product memakai batching melewati batas PostgREST; pagination rekomendasi Product/QC memakai urutan UUID deterministik.

## 2026-08-12

- Domain `Seismograph InaTEWS` dipetakan ke Geofisika.

## 2026-08-11

- Mapping AWOS Kategori III Vaisala dan penyempurnaan subtype radar.
- Bulk download Admin serta pembatasan subtype AWOS per Site.

## 2026-08-10

- Super Admin, Product QC, audit, dan pengelolaan akun diperkenalkan.
- Perbaikan site count, pagination master Site, dan UX akun/export.
- Lifecycle lock diperbaiki agar retry memperoleh kondisi server terbaru.

## 2026-08-09

- Station Auth, autosave server, lock, version conflict, dan local logout.
- Sinkronisasi master data Supabase serta metadata Aloptama.
- Field/Domain dan penambahan tipe Site klimatologi.

Untuk prosedur perubahan berikutnya, baca [SOP Perubahan Production](SOP-PERUBAHAN-PRODUCTION.md).
