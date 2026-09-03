# Arsitektur dan Alur Data

> **Status: Current supporting documentation**
> Arsitektur canonical ada di [Arsitektur](./02-ARSITEKTUR.md) dan
> [Database Supabase](./05-DATABASE-SUPABASE.md).

Terakhir diperbarui: 3 September 2026.

```text
Browser
  |-- Cloudflare DNS --> Next.js production di Hostinger
  |-- Vercel Preview / legacy 307 compatibility
  |-- localStorage (cadangan draf perangkat)
  `-- Supabase Auth + RLS + RPC --> runtime master / submissions / lock / QC / audit

CSV / Spreadsheet legacy
  `-- import/recovery/provenance eksplisit, bukan authority runtime
```

## Master data dan data pengisian

**Master data** menentukan pilihan yang tersedia: stasiun, Site, tipe,
subtipe, profil barang, barang, dan produk. Supabase production adalah master
authoritative untuk runtime aplikasi.

`app/data.generated.json` adalah hasil generate yang dilacak Git untuk
test/recovery. Import CSV ke Supabase hanya dilakukan sebagai operasi legacy atau
recovery yang eksplisit; export master membaca Supabase dan menghasilkan snapshot
CSV tanpa mengubah runtime master. Artefak generated tidak dipakai untuk runtime
Station User.

Kategori Station memakai relasi `stations.station_category_id` ke
`station_categories`; nama Station bukan sumber klasifikasi.

Station User membaca `station_runtime_master()` yang mengidentifikasi akun dari
`auth.uid()`, lalu mengembalikan hanya Site aktif milik stasiun tersebut,
Subtipe aktif, profil, mapping kategori, dan item aktif yang relevan. RPC tidak
menerima `station_id` dari browser. Jika master runtime gagal dimuat, form
menampilkan retry dan tidak melakukan fallback ke artifact generated.

**Data pengisian** adalah submission per Station, Site, dan Subtipe. Submission
menyimpan payload JSON, version, operator, dan informasi lock di Supabase.

## Monitoring Super Admin

```text
Tab Submission -> RPC list metadata + progress (50/page, tanpa payload)
Klik satu row  -> RPC detail satu submission -> cache state halaman
Archive        -> tandai archived_at + audit, payload tetap tersimpan
Restore        -> aktifkan UUID yang sama + audit
```

Progress dihitung di database dari `site_subtypes.item_profile_id` ke
`profile_items` dan `items`. Denominator adalah kategori aktif yang expected
untuk Subtipe. Numerator adalah kategori dengan minimal satu produk valid
(Brand dan Tipe) atau material bernama pada `payload.inventory`. Metadata
Aloptama tidak ikut progress. Model ini menghindari N+1 dan mencegah seluruh
JSONB payload dikirim ketika tabel monitoring dibuka.

## Station Completion backend

`admin_station_completion_summary()` menyediakan ringkasan batch seluruh stasiun,
sedangkan `admin_station_completion_detail(station_id)` menyediakan rincian Site dan
Subtipe satu stasiun. Keduanya read-only, hanya untuk Super Admin, dan tidak mengirim
payload submission mentah.

Expected submission diturunkan dari Site, Subtipe, dan assignment aktif. AWOS Kategori
III mengikuti `site_subtype_assignments`; tipe Site lain mengikuti aturan runtime aktif
untuk seluruh tipe. Submission archived dan master inactive tidak masuk perhitungan.

Completion kategori hanya memakai kategori fungsi expected non-Gudang. Metadata
Aloptama dan field Unit tidak dihitung. Submission yang belum ada tetap berada di
denominator. Gudang hanya memeriksa keberadaan struktur submission aktif dan tidak
memiliki persentase kategori. Proposal berstatus `PENDING` dilaporkan sebagai indikator
QC terpisah tanpa memengaruhi progress.

## Pengisian

```text
Browse -> baca submission/default -> Edit eksplisit -> acquire lock
      -> localStorage + autosave -> final save -> release lock -> Browse
```

Browse, Buka Admin, dan Unduh adalah read-only. Hanya Edit eksplisit yang boleh
membuat submission, meminta lock, atau menaikkan version. Autosave memakai draf
browser sebagai cadangan dan server sebagai data bersama. Lock berakhir setelah
lima menit tanpa aktivitas. Version mencegah payload lama menimpa data server
yang lebih baru.

## Akses dan keamanan

Supabase Auth menangani session. RLS membatasi Station User ke stasiunnya;
Super Admin memiliki operasi terkontrol melalui RPC dan route server. Secret
tidak masuk browser. `SUPABASE_SECRET_KEY` hanya digunakan server/script
tepercaya, sedangkan `NEXT_PUBLIC_*` hanya untuk konfigurasi publik.

List, detail, archive, dan restore submission memanggil RPC `security definer`
yang selalu menjalankan `require_super_admin()`. Station User hanya dapat membaca
submission aktif milik stasiunnya melalui RLS existing.

## QC dan ekspor

Usulan produk disimpan sebagai Product Proposal terpisah. Item menyimpan
`productProposalId`; hasil APPROVED/MERGED menunjuk Product canonical melalui
`resolved_product_id`, sedangkan referensi langsung memakai `productId`. QC dapat
approve produk baru, merge proposal ke Product canonical, atau reject. Pindahkan
Referensi dan Gabungkan Produk adalah operasi berbeda. CSV/JSON Station dan Admin
memakai serializer bersama; bulk export membuat ZIP dari data baca saja.

## Gudang Stasiun/Balai

```text
Station/Balai -> Site -> Tipe Site: Gudang -> Sub Tipe Site: Gudang
               -> Profil Barang: Gudang -> kategori yang dipilih user
               -> Product/QC -> physical units
```

Gudang memakai tabel `sites` dan `submissions`; tidak ada entity atau persistence
kedua. Form tidak menampilkan Metadata Aloptama dan tidak merender seluruh katalog
kosong. Key inventaris kosong menyimpan kategori yang dipilih, sedangkan produk
dan unit baru ditambahkan setelahnya.

Satu product group dapat mempunyai dua `functionCategories`. Unit fisik tetap
unik berdasarkan `UnitDetail.id`; CSV menyertakan ID dan fungsi, sedangkan JSON
menambahkan projection `physicalUnits` tanpa menghapus struktur `items` lama.
Autosave, lock, version, RLS, QC, Admin monitoring, dan bulk export tetap reuse
infrastruktur Submission existing.

Gudang dimiliki dan ditampilkan dalam scope Station/Balai yang sama dengan Site
biasa. Tidak ada alur Gudang yang hanya tersedia untuk Super Admin.

Gudang dikeluarkan dari category completeness. Ringkasan Admin tetap dapat
menampilkan progress informasional berupa jumlah Station dengan Submission
Gudang current dibanding jumlah Station yang mempunyai Site Gudang; angka itu
bukan kelengkapan item atau kategori Gudang.

Lihat [Master Data](MASTER-DATA.md), [Panduan QC Produk](PANDUAN-QC-PRODUK.md),
dan [Panduan Pengembang](PANDUAN-PENGEMBANG.md).
