# Panduan Pengguna Stasiun

Terakhir diperbarui: 12 Agustus 2026. Baca [Mulai di Sini](MULAI-DI-SINI.md)
untuk istilah dasar.

Akses resmi aplikasi: https://aloptama-collect.vercel.app

## Yang perlu dilakukan

1. Buka aplikasi, isi **Username** dan **Password**, lalu tekan **Masuk**.
   Gunakan ikon mata untuk menampilkan atau menyembunyikan password.
2. Nama stasiun otomatis mengikuti akun. Pilih **Aloptama / Site**, lalu
   **Subtipe Site** yang akan diperiksa.
3. Awalnya aplikasi berada di **Mode lihat**. Baca data atau pilih **Unduh**
   untuk CSV/JSON tanpa mengambil lock.
4. Isi **Nama operator**, lalu tekan **Mulai Pengisian** atau **Edit Data**.
   Jika berhasil, status menjadi **Mode pengisian aktif**.
5. Lengkapi **Metadata Aloptama**, lalu buka kategori barang dan pilih produk.
   Bila jumlah lebih dari satu, isi Nomor Seri, Kondisi, Tahun Pasang, dan
   Catatan untuk setiap unit.
6. Aplikasi menyimpan draf di browser dan mengirim perubahan otomatis sekitar
   lima detik setelah perubahan terakhir. Tekan **Simpan** untuk mengirim
   sekarang.
7. Setelah selesai, tekan **Selesai Mengedit**. Aplikasi melakukan final save
   dan melepas lock untuk session ini.

Status **Tersimpan di server** berarti data sudah tersedia dari perangkat lain.
Status **Tersimpan lokal** berarti draf masih aman di browser ini, tetapi belum
berhasil dikirim ke server.

## Mengunduh hasil

Menu **Unduh** menyediakan CSV dan JSON saat Mode lihat maupun Edit. Saat
mengedit, aplikasi mencoba sinkron lebih dulu; bila server tidak dapat dihubungi,
file tetap dibuat dari draf browser dan peringatan ditampilkan.

Nama CSV memakai pola:

```text
nama-stasiun_nama-site_nama-subtipe.csv
```

Contoh: `stasiun-meteorologi-soekarno-hatta_awos-runway-07l_awos-end-point.csv`.
JSON menggunakan pola sama dengan akhiran `.json`.

## Produk tidak ditemukan

1. Cari dahulu berdasarkan Brand atau Tipe. Gunakan saran yang muncul bila
   produknya sama.
2. Bila memang belum ada, isi **Brand**, **Tipe**, dan Catatan opsional pada
   **Usulkan produk baru**.
3. Status **Pending QC** berarti usulan telah tersimpan dan menunggu pemeriksaan
   Super Admin.
4. **Merged** berarti variasi tulisan dihubungkan ke produk yang sudah ada.
   **Approved** berarti menjadi produk canonical baru. **Rejected** berarti
   usulan ditolak; raw input tetap tersimpan bersama alasan admin.

Lihat [Panduan QC Produk](PANDUAN-QC-PRODUK.md) untuk penjelasan status.

## Bila ada kendala

- Data sedang diedit orang lain: aplikasi read-only. Tekan **Coba lagi** untuk
  meminta lock berdasarkan kondisi server terbaru. Jangan perlu logout atau
  reload halaman.
- **Muat versi terbaru** hanya memuat payload dan versi server; tombol ini tidak
  mengambil lock.
- Version conflict: jangan langsung menimpa. Muat versi terbaru dan periksa
  kembali perubahan lokal.
- Internet putus: jangan hapus data browser. Setelah koneksi kembali, pilih
  draft yang sama lalu tekan **Edit Data** dan **Simpan**.
- Logout: tekan **Keluar**. Hanya browser/perangkat ini yang logout; aplikasi
  mencoba melepas lock session ini terlebih dahulu.

## Yang jangan dilakukan

- Jangan mengisi satu Site/Subtipe yang sama dari beberapa perangkat bersamaan.
- Jangan menutup pekerjaan tanpa mencoba **Selesai Mengedit**.
- Jangan menghapus cache/browser data saat status masih tersimpan lokal atau
  terjadi conflict.
- Jangan meminta Site/Subtipe diubah langsung dari form. Laporkan ke pengelola
  master data.

## Mengisi Gudang

1. Pilih Site bertipe **Gudang** dan Subtipe **Gudang**, lalu mulai pengisian.
2. Tekan **Tambah Kategori Barang** dan cari kategori yang benar-benar tersedia.
   Katalog profil Gudang bukan daftar barang yang wajib dipenuhi.
3. Pilih atau usulkan Brand/Tipe melalui alur QC yang sama dengan Site biasa.
4. Isi Nomor Seri, Kondisi, Tahun Pengadaan, Nama Kegiatan Pengadaan, dan Catatan
   untuk setiap unit. Metadata Aloptama dan Tahun Pasang tidak digunakan.
5. Untuk sensor kombinasi, pilih Suhu + Kelembaban atau Kecepatan + Arah. Satu
   unit fisik tetap dicatat sekali walaupun memenuhi dua kategori.

Kategori kosong dapat dihapus langsung. Menghapus kategori yang sudah berisi
unit meminta konfirmasi; fungsi lain dari sensor kombinasi tetap dipertahankan.

Untuk pilot, uji login, pemilihan Site/Subtipe, pengisian, save, unduh, dua
perangkat, dan usulan produk. Laporkan istilah yang membingungkan, data salah,
error, tampilan sulit, atau langkah yang terlalu panjang.

← [Mulai di Sini](MULAI-DI-SINI.md) | → [Troubleshooting](TROUBLESHOOTING.md)
