# Master Data

Terakhir diperbarui: 12 Agustus 2026. Spreadsheet/CSV adalah **source of truth**
untuk master. Supabase menyimpan mirror operasional ber-UUID; jangan menjadikan
Dashboard Supabase sebagai tempat edit rutin master.

Master terdiri dari `stations`, `sites`, `site_types`, `site_subtypes`,
`item_profiles`, `items`, mapping profil-barang, kategori produk, dan `products`.
Kolom `active` dipakai untuk menonaktifkan record tanpa menghapusnya.

```text
Spreadsheet -> CSV -> validate -> generated data + sync -> Supabase
```

```powershell
npm.cmd run validate:master
npm.cmd run sync:master
```

`validate:master` tidak mengubah database. `sync:master` menjalankan generator,
lalu melakukan insert/update/reactivate/deactivate dalam transaction dan tidak
melakukan hard delete. File hasil sync ditulis ke `sync-output/` untuk
direkonsiliasi kembali ke Spreadsheet.

## UUID dan active

- ID kosong pada record baru dapat dibuat oleh Supabase berdasarkan natural key.
- UUID yang sudah ada berarti record tersebut di-update; jangan diganti.
- Gunakan `active=false` untuk menonaktifkan, bukan delete.
- Bila record hilang dari CSV, sync memberi warning dan tidak langsung menghapus
  record di Supabase.

## Field/Domain

Mapping domain berada di `app/config/form-options.ts`, dipakai form dan ekspor.

| Domain | Contoh tipe Site |
| --- | --- |
| Meteorologi | AWOS Kategori I/II/III, AWS Rekayasa, Water Level, Radar |
| Klimatologi | AAWS, AWS, ARG, ASRS, Soil Moisture, Iklim Mikro |
| Geofisika | Seismograph InaTEWS |

Daftar lengkap harus mengikuti konfigurasi tersebut, bukan menyalin daftar
baru di beberapa komponen.

## AWOS Kategori III

Mapping subtipe berada di `app/lib/site-subtypes.ts`. Nama Site menentukan satu
family: AllWeather, Coastal, Degreane, Microstep, atau Vaisala. Setiap family
hanya memperoleh End Point, Mid, Station, dan TDZ miliknya. Variant yang tidak
dikenali menghasilkan daftar kosong agar masalah master terlihat.

## Produk hasil QC

Produk baru atau koreksi canonical dari QC tersedia lebih dulu di Supabase dan
ditandai belum sinkron Spreadsheet. Unduh CSV rekonsiliasi dari QC Produk,
masukkan `product_id` yang sama ke sheet products, lalu validasi dan sync.
Alias tetap berada di Supabase dan tidak perlu menjadi baris master Spreadsheet.

Jangan mengedit `app/data.generated.json` langsung, mengubah UUID, atau melakukan
hard delete master.

## Gudang

Master canonical Gudang adalah Site Type `Gudang`, Subtype `Gudang`, dan profil
Profil `Gudang`. Profil tersebut memetakan seluruh kategori valid sebagai
katalog yang boleh dipilih, bukan checklist expected. Site Gudang tetap dibuat
per Station/Balai melalui sheet Nama Stasiun; jangan membuat Site Gudang massal
atau relasi Balai baru tanpa daftar master yang disetujui.

← [Arsitektur dan Alur Data](ARSITEKTUR-DAN-ALUR-DATA.md) | → [SOP Perubahan Production](SOP-PERUBAHAN-PRODUCTION.md)
