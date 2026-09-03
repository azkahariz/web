# Master Data

> **Status: Current supporting documentation**
> Model database dan source of truth canonical dijelaskan di
> [Database Supabase](./05-DATABASE-SUPABASE.md).

Terakhir diperbarui: 15 Agustus 2026. **Supabase production adalah authoritative
master source of truth.** Perubahan master rutin dilakukan melalui aplikasi
Super Admin. CSV, Spreadsheet, dan `app/data.generated.json` adalah artefak
legacy untuk import eksplisit, referensi, development, recovery, dan backup;
bukan sumber yang boleh menimpa master production sehari-hari.

Master terdiri dari `stations`, `sites`, `site_types`, `site_subtypes`,
`item_profiles`, `items`, mapping profil-barang, kategori produk, dan `products`.
Kolom `active` dipakai untuk menonaktifkan record tanpa menghapusnya.

```text
Super Admin -> Supabase -> export/backup CSV
```

```powershell
npm.cmd run validate:master
npm.cmd run sync:master:local
```

`validate:master` tidak mengubah database. `sync:master` sekarang diblokir untuk
remote secara default. `sync:master:local` hanya untuk development lokal.
`sync:master:legacy:remote` adalah recovery/import legacy yang memerlukan opt-in
eksplisit dan tidak boleh menjadi workflow rutin.

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

## Produk dan QC

Menu **Super Admin -> Produk** mengelola canonical Merk dan Tipe. Produk dapat
ditambah, diubah, diaktifkan, atau dinonaktifkan tanpa hard delete. Produk
nonaktif tetap tersedia untuk history lama, tetapi tidak ditawarkan pada pilihan
baru Station User. Produk dari QC APPROVED dan target MERGED memakai tabel
canonical yang sama. Rename menyimpan nama lama sebagai alias bila diperlukan
untuk resolusi input lama. Export dari Supabase menjadi jalur backup/referensi.

Jangan mengedit `app/data.generated.json` langsung, mengubah UUID, atau melakukan
hard delete master.

## Gudang

Master canonical Gudang adalah Site Type `Gudang`, Subtype `Gudang`, dan profil
Profil `Gudang`. Profil tersebut memetakan seluruh kategori valid sebagai
katalog yang boleh dipilih, bukan checklist expected. Site Gudang tetap dibuat
per Station/Balai melalui sheet Nama Stasiun; jangan membuat Site Gudang massal
atau relasi Balai baru tanpa daftar master yang disetujui.

← [Arsitektur dan Alur Data](ARSITEKTUR-DAN-ALUR-DATA.md) | → [SOP Perubahan Production](SOP-PERUBAHAN-PRODUCTION.md)
