# Panduan Pengguna Stasiun

Panduan ini ditulis untuk petugas yang tidak perlu memahami pemrograman.

1. Buka website dan masuk memakai **Username** serta **Password** stasiun.
   Tekan ikon mata pada kolom Password untuk menampilkan atau menyembunyikan
   password yang sedang diketik.
2. Nama stasiun terisi otomatis dan tidak dapat diganti.
3. Pilih **Site**, lalu pilih **Subtipe Site**.
4. Aplikasi mulai dalam **Mode lihat**. Anda dapat melihat dan mengunduh CSV/JSON
   tanpa mengambil lock dan tanpa masuk ke mode pengisian.
5. Isi **Nama petugas**, lalu tekan **Mulai Pengisian** atau **Edit Data** hanya
   jika ingin mengubah data.
6. Jika berhasil, status berubah menjadi **Mode pengisian aktif**.
7. Isi metadata lokasi pada bagian Metadata Aloptama.
8. Buka kategori barang, tekan **Pilih produk**, lalu pilih produk terpasang.
9. Atur jumlah. Setiap unit mempunyai Nomor Seri, Kondisi, Tahun Pasang, dan
   Catatan sendiri.
10. Perubahan disimpan di browser dan dikirim ke server sekitar lima detik
    setelah perubahan terakhir. Penyimpanan maksimum ditunda sekitar 18 detik.
11. Tekan **Simpan** untuk mengirim perubahan saat itu juga.
12. Menu **Unduh** menyediakan CSV dan JSON, termasuk saat masih dalam Mode
    lihat. Jika sedang mengedit dan ada perubahan, aplikasi menyimpan draf lokal
    lalu mencoba sinkron ke server sebelum mengunduh. Jika server gagal, file
    tetap dibuat dari data terbaru di browser dan muncul peringatan bahwa server
    belum sinkron. Nama file mengikuti pilihan terbaru:
    `nama-stasiun_nama-site_nama-subtipe.csv`, misalnya
    `stasiun-meteorologi-soekarno-hatta_awos-runway-07l_awos-end-point.csv`.
    JSON memakai pola nama yang sama dengan akhiran `.json`.
13. Setelah selesai, tekan **Selesai Mengedit**. Aplikasi melakukan final save
    lalu melepas lock.

Status **Tersimpan di server** berarti data sudah terkirim. Status **Tersimpan
lokal** berarti data aman pada browser ini, tetapi belum tersedia dari perangkat
lain. Mengunduh saat Mode lihat tidak membuat submission, tidak menaikkan versi,
dan tidak mengubah lock.

## Jika data sedang diedit orang lain

Aplikasi menjadi read-only dan menampilkan nama operator serta aktivitas
terakhir. Tekan **Coba lagi** untuk memeriksa lock terbaru. Tidak perlu logout
atau reload. **Muat versi terbaru** hanya memuat payload/version terbaru; tombol
itu berbeda dari percobaan memperoleh lock.

Lock dapat diambil alih Station User setelah lima menit tanpa aktivitas. Super
Admin dapat melakukan force takeover dengan konfirmasi.

## Jika internet terputus

Data tetap disimpan di browser. Jangan menghapus data browser. Setelah koneksi
kembali, buka draft dan tekan **Edit Data** serta **Simpan**. Jika muncul version
conflict, bandingkan data lokal dan server sebelum memilih **Muat versi terbaru**.

## Produk tidak ditemukan

1. Isi Brand dan Tipe pada bagian **Usulkan produk baru**.
2. Periksa saran "Apakah yang Anda maksud...". Jika cocok, pilih produk tersebut.
3. Jika memang berbeda, lanjutkan usulan.
4. Pesan **menunggu pemeriksaan admin** berarti raw Brand/Tipe sudah tersimpan,
   tetapi belum menjadi master.
5. Jika admin merge atau approve, aplikasi menampilkan nama produk hasil QC dan
   export memakai nama tersebut.
6. Jika ditolak, raw input tidak hilang. Pilih produk lain atau buat usulan yang
   sudah diperbaiki.

## Logout

Tekan **Keluar**. Hanya browser/perangkat ini yang logout. Lock milik session ini
dicoba dilepas sebelum logout; perangkat lain dengan akun stasiun yang sama tetap
login.
