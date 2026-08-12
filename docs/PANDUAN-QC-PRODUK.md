# Panduan QC Produk

Terakhir diperbarui: 12 Agustus 2026. QC Produk dipakai Super Admin untuk
memeriksa Brand/Tipe yang tidak ditemukan Station User.

Contoh: pengguna menulis `Campbel | CR 1000 X`, sedangkan master sudah memiliki
`Campbell Scientific | CR1000X`.

## Status proposal

- **PENDING**: menunggu pemeriksaan.
- **APPROVED**: disetujui sebagai produk canonical baru.
- **MERGED**: dihubungkan ke produk canonical existing.
- **REJECTED**: ditolak dengan alasan.

Raw input pengguna selalu tetap tersimpan pada proposal. Hasil QC menentukan
nama canonical yang dipakai katalog dan ekspor setelah proposal teratasi.

## Pilihan tindakan

- **Approve Baru**: gunakan jika produk benar-benar belum ada. Isi Brand/Tipe
  canonical secara konsisten.
- **Merge**: gunakan jika proposal hanya salah eja atau variasi penulisan dari
  produk existing. Sistem menyimpan alias agar penulisan serupa dapat dikenali.
- **Gabungkan Semua**: gunakan untuk beberapa proposal yang jelas menuju satu
  produk tujuan. Periksa seluruh proposal sebelum konfirmasi.
- **Tolak**: wajib isi alasan. Jangan menolak hanya karena format penulisan
  belum rapi jika produk sebenarnya dapat di-merge.

## Rekonsiliasi Spreadsheet

Produk hasil approve atau koreksi canonical tersedia operasional di Supabase,
tetapi Spreadsheet tetap source of truth master. Dari QC Produk, unduh
`products-qc-pending-spreadsheet.csv`, masukkan baris ke sheet `products` tanpa
mengganti `product_id`, export CSV master, lalu jalankan validasi dan sync.

```powershell
npm.cmd run validate:master
npm.cmd run sync:master
```

Jangan menghapus proposal, alias, atau UUID produk untuk memperbaiki QC.

← [Panduan Super Admin](PANDUAN-SUPER-ADMIN.md) | → [Master Data](MASTER-DATA.md)
