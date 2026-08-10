# Troubleshooting

## Login gagal

**Gejala:** Username/password ditolak.
**Penyebab umum:** Salah ketik, password sudah direset, atau domain synthetic
account tidak sesuai.
**Yang harus dilakukan:** Coba ulang. Jika tetap gagal, minta Super Admin reset
password.

## Akun nonaktif

**Gejala:** Login berhasil tetapi akun tidak terhubung ke stasiun aktif.
**Penyebab umum:** `station_accounts.active=false`.
**Yang harus dilakukan:** Super Admin membuka Akun Stasiun lalu mengaktifkan akun.

## Password lama tidak dapat dilihat Admin

**Gejala:** Super Admin hanya menemukan tombol Reset Password, bukan Lihat
Password.
**Penyebab umum:** Ini memang desain keamanan Supabase Auth. Password existing
tidak dapat dibaca kembali.
**Yang harus dilakukan:** Reset password, lalu simpan atau kirim password baru
saat dialog masih terbuka. Setelah dialog ditutup, lakukan reset lagi jika
credential belum sempat disimpan.

## Browser menawarkan Simpan alamat

**Gejala:** Browser tetap menawarkan autofill atau menyimpan alamat pada form
metadata.
**Penyebab umum:** Aplikasi sudah menandai field non-login dengan autocomplete
off, tetapi beberapa browser dapat mengabaikan petunjuk tersebut.
**Yang harus dilakukan:** Tolak penawaran browser. Data aplikasi tetap tersimpan
normal dan login autofill tetap dapat digunakan.

## Lock tidak lepas

**Gejala:** User lain tetap read-only setelah editor selesai.
**Penyebab umum:** Release gagal karena jaringan atau editor belum menekan
Selesai Mengedit.
**Yang harus dilakukan:** Tekan **Coba lagi**. Jika masih aktif, tunggu lima
menit atau minta Super Admin melakukan force release.

## Version conflict

**Gejala:** Pesan versi server lebih baru.
**Penyebab umum:** Browser menyimpan version lama.
**Yang harus dilakukan:** Pastikan data lokal tidak dibutuhkan, lalu tekan
**Muat versi terbaru**. Tombol ini tidak memperoleh lock; setelah itu tekan
**Edit Data**.

## Autosave server gagal atau internet mati

**Gejala:** Status Tersimpan lokal.
**Penyebab umum:** Internet, Supabase, atau environment bermasalah.
**Yang harus dilakukan:** Jangan hapus data browser. Setelah koneksi kembali,
buka draft, tekan Edit Data, lalu Simpan.

## Data localStorage hilang

**Gejala:** Draft lokal kosong.
**Penyebab umum:** Data browser dihapus, memakai browser/device lain, atau mode
private.
**Yang harus dilakukan:** Pilih site/subtipe yang sama agar payload server
dimuat. localStorage adalah cadangan, bukan satu-satunya penyimpanan.

## CSV tidak sesuai

**Gejala:** Kolom/isi export berbeda dari yang diharapkan.
**Penyebab umum:** Memilih draft yang salah atau perubahan format tanpa tes.
**Yang harus dilakukan:** Periksa site/subtipe dan jalankan `npm.cmd run check`.
Jangan menambah kolom QC ke CSV inventaris existing.

Nama file normal adalah `nama-stasiun_nama-site_nama-subtipe.csv`. Jika pilihan
lokasi belum lengkap, aplikasi memakai `aloptama-data.csv` agar filename tidak
berisi `undefined` atau `null`.

## Subtipe AWOS Kategori III salah

**Gejala:** Site Coastal melihat subtype AllWeather, atau Site AWOS unknown
melihat seluruh subtype.
**Penyebab umum:** Consumer tidak memakai shared mapping atau nama variant Site
tidak memuat All Weather, Coastal, Degreane, Microstep, atau Vaisala.
**Yang harus dilakukan:** Periksa `getAllowedSiteSubtypes()` dan nama master Site.
Variant unknown harus tampil **Belum terpetakan**.

## Jumlah Site atau data lebih dari 1.000 terpotong

**Gejala:** Count Admin lebih kecil dari tabel `sites`, atau ZIP tidak lengkap.
**Penyebab umum:** Query global Supabase hanya mengambil page pertama.
**Yang harus dilakukan:** Gunakan pagination `.range()` dengan stable ordering.
Jalankan regression pagination dan bandingkan distinct `sites.id` dengan database.

## CSV atau ZIP gagal/tidak lengkap

**Gejala:** Bulk Download gagal, jumlah CSV kurang, atau file bertabrakan.
**Penyebab umum:** Master subtype belum terpetakan, query bulk terpotong, atau
browser kehabisan resource.
**Yang harus dilakukan:** Coba satu Site, periksa pesan **Belum terpetakan**, dan
jalankan `npm.cmd run check`. Nama yang sama setelah sanitization mendapat suffix
angka otomatis.

## Site belum mempunyai submission

**Gejala:** Status **Belum ada submission** tetapi Buka/Unduh tersedia.
**Penyebab umum:** Ini perilaku normal. Master menentukan row, bukan submission.
**Yang harus dilakukan:** Buka untuk melihat form default, Unduh untuk CSV
default, atau pilih Edit sebagai Admin jika memang akan mulai mengisi. Buka dan
Unduh tidak menambah submission count.

## Perbedaan Browse dan Edit

**Gejala:** Form tidak dapat diubah tetapi CSV/JSON dapat diunduh.
**Penyebab umum:** Aplikasi sedang dalam Mode lihat.
**Yang harus dilakukan:** Ini normal. Browse dan download tidak membutuhkan
lock. Tekan Edit Data/Edit sebagai Admin hanya saat ingin mengubah data.

## Sync master warning atau UUID hilang

**Gejala:** Record Supabase disebut hilang dari CSV, atau validator menolak UUID.
**Penyebab umum:** Row Spreadsheet terhapus, UUID tidak ikut di-export, atau
file synced tidak diimport utuh.
**Yang harus dilakukan:** Pulihkan UUID dari `.synced.csv`, validasi, lalu sync.
Produk QC dengan `source_origin=QC` dan belum synced tidak dianggap missing.

## Proposal duplicate atau QC belum muncul

**Gejala:** Ada beberapa variasi produk atau status admin belum terlihat.
**Penyebab umum:** User tetap mengusulkan walau saran mirip ada, atau katalog
belum dimuat ulang.
**Yang harus dilakukan:** Admin gunakan bulk merge. User buka ulang pemilih
produk atau halaman agar katalog/status terbaru dimuat.

## Vercel build gagal

**Gejala:** Deployment Error.
**Penyebab umum:** `npm.cmd run check` belum lulus atau environment Vercel belum
lengkap.
**Yang harus dilakukan:** Jalankan check lokal, baca error pertama, lalu pastikan
tiga environment runtime tersedia.

## Migration belum applied

**Gejala:** Table/RPC tidak ditemukan.
**Penyebab umum:** Source sudah baru tetapi database belum di-push.
**Yang harus dilakukan:** Jalankan dry-run lalu `npx.cmd supabase db push --linked`.
