# Master Data Supabase

## Peran setiap sumber

```text
Google Spreadsheet / CSV  = source of truth master
app/data.generated.json   = data aplikasi hasil generator
Supabase                  = mirror master terstruktur dengan UUID
```

Master tetap diedit di Spreadsheet. Jangan mengedit nama master rutin melalui
Supabase Dashboard. Website saat ini tetap membaca `app/data.generated.json`
dan tidak membutuhkan koneksi Supabase saat render.

## Kontrak data faktual

- `Nama Stasiun.csv` menghubungkan stasiun, site, dan tipe site. Site unik di
  dalam stasiun, bukan berdasarkan nama site secara global.
- `Jenis Site.csv` menghubungkan tipe site dengan subtipe. Profil AWOS Kategori
  III diturunkan dari suffix TDZ, Mid, End Point, atau Station.
- `Barang.csv` adalah mapping banyak-ke-banyak antara profil (`Jenis`) dan
  barang (`Barang Terpasang`).
- `product_categories.csv` adalah daftar kategori mandiri.
- `products.csv` hanya mempunyai natural key `Merk + Tipe`. Tidak ada kolom
  sumber yang menghubungkan produk dengan product category.

## Kolom CSV setelah sync

`Nama Stasiun`:

```text
station_id, Nama Stasiun, station_active,
site_id, Nama Site, site_active,
site_type_id, Tipe Site, site_type_active
```

`Jenis Site`:

```text
site_type_id, Tipe Site, site_type_active,
site_subtype_id, Sub Tipe Site, site_subtype_active,
item_profile_id, Profil Barang
```

`Barang`:

```text
item_profile_id, Jenis, item_profile_active,
item_id, Barang Terpasang, item_active,
profile_item_id, mapping_active
```

`product_categories`:

```text
product_category_id, product_categories, active
```

`products`:

```text
product_id, Merk, Tipe, active
```

Kolom aktif dipisahkan per entitas. `mapping_active` hanya mengatur hubungan
profil-barang, bukan menonaktifkan profil atau barangnya.
Jika satu entitas muncul berulang di beberapa baris atau sheet, UUID dan status
aktifnya harus sama pada semua kemunculan; validator akan menolak konflik.

## Persiapan pertama

1. Dari Supabase Dashboard, buka **Connect** dan ambil connection string Direct.
   Jika jaringan tidak mendukung IPv6, gunakan **Session pooler** port 5432.
2. Buat `.env.local` berdasarkan `.env.example`, lalu isi `SUPABASE_DB_URL`.
   File ini diabaikan Git dan tidak boleh dibagikan.
3. Hubungkan CLI dan jalankan migration:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref PROJECT_REF
npx.cmd supabase db push
```

4. Validasi sumber tanpa mengubah database:

```powershell
npm.cmd run validate:master
```

5. Jalankan bootstrap:

```powershell
npm.cmd run sync:master
```

Hasil berada di `sync-output/` dengan akhiran `.synced.csv`. Import setiap file
itu kembali ke sheet yang sesuai agar UUID menjadi bagian source berikutnya.

## Sync rutin

1. Export ulang lima sheet sebagai CSV ke `Z:\collect-irm-data`.
2. Pastikan UUID lama tetap ada dan tidak diedit manual.
3. Jalankan `npm.cmd run validate:master`.
4. Jalankan `npm.cmd run sync:master`.
5. Import kembali file dari `sync-output/` ke Spreadsheet.

Perintah sync juga menjalankan `generate-data.ps1`, sehingga data aplikasi tetap
diperbarui dari sumber yang sama.

## Aturan perubahan

- **Tambah:** biarkan UUID kosong. Sync memeriksa natural key sebelum insert.
- **Edit nama:** pertahankan UUID. Record dengan UUID tersebut akan di-update.
- **Nonaktifkan:** ubah kolom aktif entitas yang tepat menjadi `FALSE`.
- **Reactivate:** ubah kembali menjadi `TRUE`.
- **Record hilang:** database tidak dihapus dan tidak dinonaktifkan otomatis;
  sync hanya mengeluarkan warning.
- **UUID hilang:** natural key digunakan untuk memulihkan UUID existing agar
  sync ulang tidak membuat duplikat.

Seluruh perubahan satu kali sync berjalan dalam satu transaction. Jika terjadi
error, transaction dibatalkan. Script tidak mempunyai operasi hard delete.

## Keamanan

Migration mengaktifkan RLS dan mencabut akses `anon` serta `authenticated`.
Sync menggunakan koneksi PostgreSQL tepercaya dari komputer lokal. Jangan
menamai credential dengan awalan `NEXT_PUBLIC_` dan jangan menambahkannya ke
Vercel pada tahap master ini.

Folder Cloudflare D1 `db/` dan `drizzle/` tetap dipertahankan untuk kompatibilitas
Sites lama, tetapi bukan schema Supabase.
