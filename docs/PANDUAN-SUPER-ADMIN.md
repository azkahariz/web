# Panduan Super Admin

Terakhir diperbarui: 12 Agustus 2026. Dashboard tersedia setelah login dengan
akun aktif di `super_admins`. Baca [SOP Perubahan Production](SOP-PERUBAHAN-PRODUCTION.md)
sebelum menjalankan tindakan yang mengubah data.

## Dashboard

- **Ringkasan**: jumlah stasiun, akun, Site, submission, lock, dan status QC.
- **Stasiun & Pengisian**: kombinasi master Site/Subtipe dan submission.
- **Akun Stasiun**: provision, aktif/nonaktif, dan reset password.
- **Lock Aktif**: lock yang belum melewati lima menit tanpa aktivitas.
- **QC Produk**: pemeriksaan usulan Brand/Tipe.
- **Audit Admin**: rekam tindakan administrasi yang berisiko.

## Stasiun dan Pengisian

Jumlah Site adalah jumlah Site unik dari master, bukan jumlah submission. Nama
Site tetap tampil meskipun belum ada submission. Setiap Site ditampilkan untuk
subtipe validnya; status menunjukkan apakah kombinasi itu sudah diisi.

- **Buka**: baca snapshot server atau form default. Tidak ada lock, submission
  baru, maupun write database.
- **Unduh CSV**: baca snapshot atau buat CSV default. Tidak ada lock atau write.
- **Edit sebagai Admin**: baru memulai lifecycle submission dan meminta lock.

Pencarian bagian ini mencari stasiun, Site, tipe Site, dan subtipe. AWOS Kategori
III dibatasi ke empat subtipe family yang sesuai Site: AllWeather, Coastal,
Degreane, Microstep, atau Vaisala. Variant belum terpetakan tidak diberi semua
subtipe secara otomatis.

## Bulk Download

Pilih Stasiun, lalu Site dan Subtipe bila diperlukan. Stasiun menghasilkan ZIP
seluruh Site/subtipe valid, Site menghasilkan ZIP semua subtipe, sedangkan satu
Subtipe menghasilkan CSV. Kombinasi tanpa submission tetap dimasukkan sebagai
template kosong. Bulk download tidak mengambil lock dan tidak membuat submission.

Panduan langkahnya ada di [Panduan Bulk Download](PANDUAN-BULK-DOWNLOAD.md).

## Lock dan version

Lock berarti ada session editor aktif. **Paksa Lepas Lock** menghapus lock aktif;
**Ambil Alih sebagai Admin** mengambil hak edit dari editor lain. Keduanya perlu
konfirmasi karena perubahan editor lama yang belum tersimpan dapat gagal disimpan.
Gunakan setelah menghubungi editor bila memungkinkan. Tindakan ini tetap memakai
version check dan tercatat dalam audit.

## Akun Stasiun

- **Provision akun** membuat akun untuk stasiun yang belum memiliki akun.
- **Nonaktifkan/Aktifkan** menghentikan atau mengembalikan akses akun.
- **Reset Password** memberi password sementara baru. Password lama tidak dapat
  dibaca, dan password baru hanya tampil pada dialog hasil reset.

Simpan atau kirim password baru sebelum dialog ditutup. Jangan menyimpan
password di audit, catatan publik, atau Git.

## QC Produk dan audit

Gunakan **Approve Baru** untuk produk benar-benar baru, **Merge** untuk variasi
tulisan produk existing, dan **Tolak** dengan alasan bila tidak dapat diterima.
Raw input pengguna tidak dihapus. Baca [Panduan QC Produk](PANDUAN-QC-PRODUK.md).

Audit mencatat force lock, edit admin, perubahan akun, reset password, dan
tindakan QC. Audit tidak boleh berisi password atau secret.

← [Mulai di Sini](MULAI-DI-SINI.md) | → [Troubleshooting](TROUBLESHOOTING.md)
