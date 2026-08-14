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
