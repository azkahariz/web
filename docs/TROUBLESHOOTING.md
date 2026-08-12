# Troubleshooting

Terakhir diperbarui: 12 Agustus 2026.

## Untuk pengguna

### Login gagal atau lupa password

**Kemungkinan:** username/password salah atau akun nonaktif.

**Yang dilakukan:** periksa penulisan; bila tetap gagal, minta Super Admin reset
password.

**Hubungi Admin:** bila login berhasil tetapi aplikasi menyatakan akun tidak
terhubung ke stasiun.

### Site tidak ada, subtipe salah, atau AWOS tidak dapat dipilih

**Kemungkinan:** master belum sesuai atau variant AWOS Kategori III belum
terpetakan.

**Yang dilakukan:** jangan mengisi Site lain sebagai pengganti.

**Hubungi Admin:** sertakan nama stasiun, Site, dan subtipe yang diharapkan.

### Autosave gagal atau internet putus

**Kemungkinan:** jaringan putus atau server tidak dapat dihubungi.

**Yang dilakukan:** jangan hapus data browser. Saat koneksi kembali, pilih
draft sama, tekan Edit Data lalu Simpan.

**Hubungi Admin:** bila status tetap tersimpan lokal setelah koneksi normal.

### Data sedang diedit atau lock tidak lepas

**Kemungkinan:** editor lain masih aktif atau belum melewati lima menit tanpa
aktivitas.

**Yang dilakukan:** tekan Coba lagi.

**Hubungi Admin:** bila editor sudah selesai tetapi lock tetap aktif; Admin dapat
memeriksa sebelum force release.

### Version conflict

**Kemungkinan:** versi server lebih baru dari browser.

**Yang dilakukan:** simpan catatan perubahan lokal, lalu Muat versi terbaru dan
periksa kembali.

**Hubungi Admin:** bila konflik berulang atau data server tampak tidak sesuai.

### CSV, JSON, atau ZIP gagal

**Kemungkinan:** browser memblokir download atau jaringan gagal saat sinkron.

**Yang dilakukan:** coba lagi, izinkan download browser, dan periksa folder
Downloads.

**Hubungi Admin:** sertakan nama Site/Subtipe dan pesan error.

### Proposal produk Pending atau Rejected

**Kemungkinan:** masih menunggu QC atau ditolak dengan alasan.

**Yang dilakukan:** gunakan produk yang disarankan bila cocok; perbaiki usulan
jika perlu.

**Hubungi Admin:** bila produk urgent atau alasan reject tidak jelas.

## Untuk Super Admin dan developer

- Site count salah atau data lebih dari 1.000 tampak terpotong: audit query yang
  harus menggunakan `loadAllAdminRows()` dan master Site, bukan submission saja.
- Submission tidak muncul di tab aktif: periksa filter **Aktif/Diarsipkan**.
  Submission arsip sengaja tidak masuk count dan Master Pengisian menampilkannya
  sebagai "Belum ada submission"; pulihkan sebelum melakukan Edit sebagai Admin.
- Progress "Belum terpetakan": periksa relasi Subtipe ke `item_profiles` serta
  `profile_items` aktif. Jangan memperbaikinya dengan memasukkan metadata ke
  denominator.
- Detail gagal tetapi list tampil: list dan detail adalah request terpisah.
  Periksa RPC `admin_get_submission_detail`, session Super Admin, dan jaringan;
  klik Muat ulang untuk menghapus cache detail halaman.
- List terasa berat atau egress naik: pastikan `admin_list_submissions` tetap 50
  row per halaman dan response list tidak mempunyai field `payload`.
- Supabase environment salah: periksa hanya nama variable dan availability,
  jangan menampilkan nilainya.
- Vercel build gagal: lihat log build, jalankan `npm.cmd run check` lokal, lalu
  periksa Preview sebelum merge.
- Lock/version/Auth bermasalah: jalankan verification yang relevan dan baca
  [Arsitektur dan Alur Data](ARSITEKTUR-DAN-ALUR-DATA.md); jangan force reset
  database sebagai langkah pertama.

← [Panduan Pengguna Stasiun](PANDUAN-PENGGUNA-STASIUN.md) | → [Panduan Super Admin](PANDUAN-SUPER-ADMIN.md)
