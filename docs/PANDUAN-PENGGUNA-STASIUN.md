# Panduan Pengguna Stasiun

Panduan ini ditulis untuk petugas yang tidak perlu memahami pemrograman.

1. Buka website dan masuk memakai **Username** serta **Password** stasiun.
2. Nama stasiun terisi otomatis dan tidak dapat diganti.
3. Pilih **Site**, lalu pilih **Subtipe Site**.
4. Aplikasi mulai dalam **Mode lihat**. Pada tahap ini belum ada lock.
5. Isi **Nama petugas**, lalu tekan **Mulai Pengisian** atau **Edit Data**.
6. Jika berhasil, status berubah menjadi **Mode pengisian aktif**.
7. Isi metadata lokasi pada bagian Metadata Aloptama.
8. Buka kategori barang, tekan **Pilih produk**, lalu pilih produk terpasang.
9. Atur jumlah. Setiap unit mempunyai Nomor Seri, Kondisi, Tahun Pasang, dan
   Catatan sendiri.
10. Perubahan disimpan di browser dan dikirim ke server sekitar lima detik
    setelah perubahan terakhir. Penyimpanan maksimum ditunda sekitar 18 detik.
11. Tekan **Simpan** untuk mengirim perubahan saat itu juga.
12. Menu **Unduh** menyediakan CSV dan JSON. Jika ada perubahan, aplikasi
    mencoba menyimpannya terlebih dahulu.
13. Setelah selesai, tekan **Selesai Mengedit**. Aplikasi melakukan final save
    lalu melepas lock.

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
