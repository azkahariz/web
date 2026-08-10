# Panduan Super Admin

## Login dan Dashboard

Super Admin memakai halaman login yang sama dengan Station User. Setelah login,
database mengenali row aktif pada `super_admins` dan mengarahkan ke `/admin`.
Jangan membuat Super Admin sebagai akun stasiun palsu.

Dashboard mempunyai enam bagian:

- **Ringkasan**: jumlah stasiun, akun, site, submission, lock, dan status QC.
- **Stasiun & Pengisian**: seluruh submission dan payload lintas stasiun.
- **Akun Stasiun**: aktif/nonaktif, reset password, dan provision akun.
- **Lock Aktif**: operator, session pendek, durasi, serta force release.
- **QC Produk**: approve, merge, bulk merge, reject, dan export Spreadsheet.
- **Audit Admin**: catatan tindakan admin yang berisiko.

Pada **Stasiun & Pengisian**, kotak pencarian mencari nama stasiun, nama site,
tipe site, dan subtipe. Jumlah site adalah jumlah site unik milik stasiun, bukan
jumlah submission. Semua nama site tetap ditampilkan walaupun belum mempunyai
submission. Setiap site ditampilkan per subtipe valid dari master; kolom status
menunjukkan apakah submission untuk kombinasi tersebut sudah tersedia. Angka
site pada header tetap total master meskipun isi tabel sedang difilter. Pada
**Akun Stasiun**, pencarian hanya memakai nama stasiun dan username.

## Submission dan lock

Membuka daftar submission tidak mengambil lock. Tekan **Buka / edit**, lalu
**Edit sebagai Admin** untuk mencoba lock biasa. Jika masih dikunci petugas,
informasi operator ditampilkan.

**Ambil Alih sebagai Admin** adalah tindakan paksa. Konfirmasi terlebih dahulu,
karena editor lama dapat kehilangan hak menyimpan. Force takeover bersifat
atomik dan tetap memakai version checking. **Paksa Lepas Lock** juga harus
dikonfirmasi dan dicatat di audit.

## Akun stasiun

- **Provision akun** membuat Auth user dan row `station_accounts` bila belum ada.
- **Nonaktifkan** membuat akun tidak dapat memperoleh scope stasiun atau RPC.
- **Aktifkan** mengembalikan akses.
- **Reset Password** membuat password sementara yang kuat. Password lama tidak
  dapat dilihat karena Supabase Auth tidak menyimpan password dalam bentuk yang
  dapat dibaca kembali.

Setelah reset berhasil, dialog menampilkan username dan password baru. Gunakan
ikon mata untuk menampilkan password, lalu tekan **Salin Password**. Simpan atau
kirim password saat dialog masih terbuka. Setelah dialog ditutup atau halaman
dimuat ulang, password tidak dapat ditampilkan lagi dan harus direset kembali
bila diperlukan. Password tidak disimpan di database, audit, atau penyimpanan
browser.

## QC Produk

Contoh proposal: `Campbel / CR 1000 X`.

- **Approve Baru**: gunakan jika produknya benar-benar baru. Admin boleh
  memperbaiki penulisan menjadi Brand/Tipe canonical.
- **Merge**: pilih produk existing jika usulan hanya variasi penulisan.
- **Gabungkan Semua**: centang beberapa proposal Pending dan pilih satu produk
  tujuan. Alias raw dibuat untuk setiap variasi.
- **Tolak**: isi alasan. Proposal dan raw input tidak dihapus.

Produk hasil approve langsung masuk katalog Supabase sehingga user lain dapat
memakainya tanpa deployment. Produk tersebut belum selesai sebagai master
Spreadsheet sampai direkonsiliasi.

## Rekonsiliasi ke Spreadsheet

1. Pada QC Produk, tekan **Unduh Produk Baru untuk Spreadsheet**.
2. File `products-qc-pending-spreadsheet.csv` berisi `product_id`, `Merk`,
   `Tipe`, dan `active`.
3. Masukkan baris ke sheet products tanpa mengubah `product_id`.
4. Export kembali CSV master normal.
5. Jalankan `npm.cmd run validate:master` dan `npm.cmd run sync:master`.
6. Sync melakukan UPDATE berdasarkan UUID, bukan INSERT duplicate, lalu menandai
   produk sudah sinkron Spreadsheet.

Koreksi canonical oleh admin juga masuk daftar export ini agar perubahan tidak
menjadi perbedaan diam-diam dengan Spreadsheet.

## Audit dan tindakan berisiko

Audit mencatat force release/takeover, edit submission, perubahan akun, reset
password, approve, merge, bulk merge, reject, dan koreksi canonical. Audit tidak
boleh memuat password atau secret.

Jangan menghapus master, mengubah UUID, mass-merge produk existing, membagikan
credential CSV, atau memakai secret key di browser.
