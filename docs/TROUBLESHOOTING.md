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
