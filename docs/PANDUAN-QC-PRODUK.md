# Panduan QC Produk

> **Status: Current supporting documentation**
> Semantik Product/QC canonical dijelaskan di
> [Flow Admin dan QC](./08-FLOW-ADMIN-DAN-QC.md) serta
> [Product Master dan Referensi](./09-PRODUCT-MASTER-DAN-REFERENSI.md).

Terakhir diperbarui: 18 Agustus 2026. QC Produk dipakai Super Admin untuk
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

## Beberapa Admin bekerja bersamaan

Gunakan akun Super Admin masing-masing dan jangan berbagi password. Admin dapat
memproses proposal berbeda secara bersamaan. Setiap perubahan dikunci secara
atomik pada proposal yang diproses, bukan pada seluruh antrean QC.

Jika proposal yang sama lebih dulu diproses Admin lain, tindakan kedua tidak
menimpa hasil pertama. Aplikasi menampilkan status dan nama reviewer terbaru,
lalu memuat ulang antrean QC tanpa menghapus pencarian, tab, atau pilihan lain.
Untuk bulk merge, proposal yang masih PENDING tetap diproses dan proposal yang
sudah berubah dilewati serta dilaporkan.

Tab APPROVED, MERGED, dan REJECTED menampilkan reviewer bila identitasnya
tersedia. History lama yang dibuat akun bersama tetap tercatat sebagai akun
lama dan tidak diubah menjadi identitas personal tanpa bukti.

## Hubungan dengan master Produk

Produk hasil approve tersedia langsung di master Supabase dan dapat dikelola
pada **Super Admin -> Produk**. Produk MERGED menunjuk canonical product existing;
proposal dan alias tetap disimpan sebagai history. CSV/Spreadsheet hanya untuk
backup, export, atau import legacy eksplisit, bukan rekonsiliasi rutin yang
menimpa master Supabase.

```powershell
npm.cmd run export:master:csv:remote
```

Jangan menghapus proposal, alias, atau UUID produk untuk memperbaiki QC.

← [Panduan Super Admin](PANDUAN-SUPER-ADMIN.md) | → [Master Data](MASTER-DATA.md)
