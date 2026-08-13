# Panduan Super Admin

Terakhir diperbarui: 13 Agustus 2026. Dashboard tersedia setelah login dengan
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

Halaman ini mempunyai dua tab:

- **Master Pengisian** menjawab apa yang seharusnya tersedia. Semua Stasiun,
  Site, dan Subtipe valid tetap tampil walaupun belum mempunyai submission.
- **Submission** menjawab apa yang sudah mulai dikerjakan. Tabel ini hanya
  memuat submission aktif atau arsip sesuai filter, sebanyak 50 baris per
  halaman.

Jumlah Site adalah jumlah Site unik dari master, bukan jumlah submission. Nama
Site tetap tampil meskipun belum ada submission. Setiap Site ditampilkan untuk
subtipe validnya; status menunjukkan apakah kombinasi itu sudah diisi.

Bagian **Site berdasarkan Tipe Site** mengelompokkan `sites.site_type_id` ke
`site_types`. AWOS Kategori III dihitung satu kali sebagai Site parent;
subtipe TDZ, Mid, End Point, dan Station tidak menjadi empat Site.

- **Buka**: baca snapshot server atau form default. Tidak ada lock, submission
  baru, maupun write database.
- **Unduh CSV**: baca snapshot atau buat CSV default. Tidak ada lock atau write.

Tombol **Buka** membuka form read-only di tab browser baru agar dashboard tetap
tersedia. Menu Master Pengisian hanya menampilkan **Buka** dan **Unduh**;
kemampuan edit Admin tetap tersedia pada lifecycle form yang sudah ada.

Pencarian bagian ini mencari stasiun, Site, tipe Site, dan subtipe. AWOS Kategori
III dibatasi ke empat subtipe family yang sesuai Site: AllWeather, Coastal,
Degreane, Microstep, atau Vaisala. Variant belum terpetakan tidak diberi semua
subtipe secara otomatis.

### Monitoring submission

Cari berdasarkan Stasiun, Site, Subtipe, atau operator. Filter tersedia untuk
Stasiun, Tipe Site, status progress, waktu pembaruan, serta Aktif/Diarsipkan.
Urutan awal menampilkan data terbaru. Klik header Stasiun, Site, Tipe Site,
Subtipe, Progres, Versi, Operator, atau Terakhir Diperbarui untuk mengurutkan
seluruh hasil di server. Gunakan **Baris per halaman** untuk memilih 50, 100,
200, 500, 1000, atau Custom 10-1000.

Progress hanya menghitung kategori barang yang terikat pada profil Subtipe.
Kategori dianggap terisi bila mempunyai minimal satu produk dengan Brand dan
Tipe, atau satu bahan mounting dengan nama bahan. Metadata Aloptama, koordinat,
runway, dan field unit opsional tidak masuk perhitungan. Status **Lengkap** hanya
berarti semua kategori expected mempunyai data menurut aturan aplikasi, bukan
jaminan bahwa isinya sudah benar secara substantif.

Klik row atau panah detail untuk memuat satu payload dan melihat kategori
terisi/kosong, Merk dan Tipe produk, material, operator, versi, waktu simpan,
dan jumlah QC Pending. Kategori dengan beberapa produk dapat dibuka lagi tanpa
request tambahan. Membuka tab tidak mengunduh seluruh payload. **Buka** membuka
read-only view di tab baru dan **Unduh** memakai snapshot terbaru.

**Arsipkan Submission** mengeluarkan submission dari pengisian aktif tanpa
menghapus UUID, payload, atau version. Kombinasi tersebut kembali berstatus
"Belum ada submission" pada Master Pengisian. Gunakan filter **Diarsipkan** dan
**Pulihkan Submission** bila data perlu dikembalikan. Archive dan restore
tercatat di Audit Admin; submission arsip harus dipulihkan sebelum diedit.
Archive ditolak bila masih ada lock editor aktif agar perubahan yang belum
tersimpan tidak terputus; tunggu editor selesai atau tangani lock terlebih dahulu.

**Hapus Permanen** berbeda dengan arsip: data Submission tidak dapat dipulihkan
dan tidak akan tampil di daftar Aktif maupun Diarsipkan. Gunakan hanya setelah
memastikan data memang harus dihapus. Modal meminta teks `HAPUS`, menolak
Submission dengan lock aktif, dan mencatat `SUBMISSION_PERMANENT_DELETE` tanpa
menyalin payload ke Audit Admin. Master Stasiun, Site, Subtipe, produk, dan akun
tidak ikut dihapus.

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

## Gudang pada Master dan Submission

Gudang tetap muncul sebagai Site di **Master Pengisian** dan memakai aksi Buka
serta Unduh existing. Pada tab Submission, kolom Progres menampilkan jumlah unit
fisik dan kategori tercatat, bukan persentase kelengkapan seluruh katalog.
Detail Gudang tetap lazy-load dan menampilkan fungsi sensor kombinasi.

Produk baru dari Gudang masuk ke antrean QC yang sama. Buka/Edit sebagai Admin,
lock, version, archive, dan bulk download tetap mengikuti lifecycle Submission.

## QC Produk dan audit

Gunakan **Approve Baru** untuk produk benar-benar baru, **Merge** untuk variasi
tulisan produk existing, dan **Tolak** dengan alasan bila tidak dapat diterima.
Raw input pengguna tidak dihapus. Baca [Panduan QC Produk](PANDUAN-QC-PRODUK.md).

Audit mencatat force lock, edit admin, perubahan akun, reset password, dan
tindakan QC. Audit tidak boleh berisi password atau secret.

← [Mulai di Sini](MULAI-DI-SINI.md) | → [Troubleshooting](TROUBLESHOOTING.md)
