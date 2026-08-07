# Rencana Database

## Kondisi saat ini

Draf berada di `localStorage`. Cara ini cepat dan dapat digunakan tanpa login,
tetapi datanya hanya tersedia pada satu browser dan satu perangkat. Menghapus
data browser juga dapat menghapus draf.

Folder `db` dan paket Drizzle sudah tersedia sebagai kerangka. Database belum
diaktifkan dan `.openai/hosting.json` masih mempunyai nilai `d1: null`.

## Kapan database diperlukan

Database diperlukan ketika pengguna harus:

- menyimpan sebagian pengisian dengan aman;
- melanjutkan dari perangkat lain;
- melihat daftar draf miliknya;
- mengirim hasil untuk diperiksa;
- bekerja bersama pengguna lain; atau
- melihat riwayat perubahan.

## Urutan implementasi yang disarankan

1. Selesaikan rancangan website dan alur pengguna.
2. Tentukan sistem akun serta peran pengguna dan admin.
3. Tetapkan struktur data site, metadata, inventaris, unit, dan riwayat.
4. Tambahkan database beserta migrasi.
5. Tambahkan autosave server tanpa langsung menghapus penyimpanan lokal.
6. Uji pemulihan draf dan perpindahan perangkat.
7. Setelah stabil, gunakan database sebagai sumber utama.

## Entitas awal

| Entitas | Isi utama |
| --- | --- |
| `users` | Identitas dan peran pengguna |
| `sites` | Stasiun, Aloptama, tipe, dan subtipe |
| `submissions` | Draf pengisian dan statusnya |
| `site_metadata` | Metadata satu site pada pengisian |
| `inventory_items` | Produk atau bahan per kategori |
| `inventory_units` | Nomor seri, kondisi, tahun, dan catatan per unit |
| `submission_history` | Waktu dan pengguna yang mengubah data |

Rancangan tabel final harus dibuat setelah alur website baru disepakati agar
database tidak mengikuti struktur tampilan yang masih berubah.
