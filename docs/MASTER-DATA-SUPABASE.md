# Master Data Supabase

## Sumber utama

Google Spreadsheet/CSV adalah **source of truth**, yaitu acuan akhir master.
`app/data.generated.json` adalah fallback aplikasi, sedangkan Supabase menyimpan
mirror ber-UUID dan overlay produk hasil QC.

```text
Spreadsheet -> CSV -> generate-data.ps1 -> data.generated.json
                         +-> sync:master -> Supabase -> .synced.csv
```

Jangan edit `data.generated.json` atau UUID secara manual.

## Kontrak faktual

- Nama Stasiun menghubungkan stasiun, site, dan tipe site.
- Jenis Site menghubungkan tipe site, subtipe, dan profil barang.
- Barang adalah mapping profil ke barang.
- product_categories adalah daftar mandiri.
- products hanya memiliki `Merk + Tipe`; tidak ada relasi faktual ke category.

Kolom products final:

```text
product_id, Merk, Tipe, active
```

## Aturan UUID

- **Tambah:** UUID kosong; Supabase membuat atau memulihkan UUID berdasarkan
  natural key.
- **Edit:** pertahankan UUID yang sama; sync melakukan UPDATE.
- **Nonaktif:** set `active=false`; jangan delete row.
- **Aktifkan kembali:** set `active=true` dengan UUID lama.
- **Hilang dari CSV:** record tidak dihapus; sync memberi warning.

## Workflow rutin

1. Export lima sheet CSV ke folder `Z:\collect-irm-data`.
2. Jalankan `npm.cmd run validate:master`.
3. Jalankan `npm.cmd run sync:master`.
4. Import file `sync-output/*.synced.csv` kembali ke Spreadsheet.
5. Commit CSV/source yang memang menjadi bagian repository sesuai kebijakan tim.

Satu sync berjalan dalam transaction dan tidak mempunyai hard delete.

## Pengecualian sementara: Product QC

Produk hasil **Approve Baru** dibuat dulu di Supabase agar langsung tersedia:

```text
source_origin=QC
spreadsheet_synced=false
```

Admin mengunduh `products-qc-pending-spreadsheet.csv`, memasukkannya ke sheet
products dengan `product_id` yang sama, lalu menjalankan sync. Sync mengenali
UUID tersebut, melakukan UPDATE, dan mengubahnya menjadi:

```text
source_origin=SPREADSHEET
spreadsheet_synced=true
```

Produk QC yang belum masuk Spreadsheet tidak memunculkan missing warning.
Koreksi canonical admin juga ditandai `spreadsheet_synced=false` agar tidak
menjadi divergence diam-diam.

Alias variasi penulisan tetap di Supabase dan tidak perlu masuk Spreadsheet.

## Keamanan

`SUPABASE_DB_URL` hanya untuk komputer pengelola. Browser tidak memakai koneksi
database langsung atau secret. Master table tidak boleh diedit rutin melalui
Supabase Dashboard.
