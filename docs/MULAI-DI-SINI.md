# Mulai di Sini

Terakhir diperbarui: 12 Agustus 2026. Status: **Production / Pilot**.

Aloptama Collect mencatat metadata lokasi dan perangkat yang terpasang pada
setiap Site Aloptama BMKG. Pengisian dapat dilakukan bertahap, disimpan,
dibuka kembali, dan diunduh sebagai CSV atau JSON.

## Siapa yang memakai?

- **Station User** adalah petugas UPT. Akun ini otomatis terikat ke satu
  stasiun dan hanya dapat mengisi Site stasiun tersebut.
- **Super Admin** mengelola pengisian lintas stasiun, akun, lock, QC produk,
  bulk download, dan audit.
- **Developer** menjaga aplikasi, master data, database, dan deployment.

## Istilah dasar

- **Aloptama / Site**: lokasi atau paket alat yang dipilih pada aplikasi.
- **Subtipe Site**: jenis rincian pengisian di dalam tipe Site.
- **Master data**: daftar stasiun, Site, subtipe, profil barang, barang, dan
  produk yang menentukan pilihan yang tersedia.
- **Submission**: data pengisian untuk satu kombinasi Site dan Subtipe.
- **Draft**: data pengisian yang masih dapat dilanjutkan.

## Alur data

Master data:

```text
Spreadsheet -> CSV -> generated data -> Supabase
```

Pengisian:

```text
Station User -> Aloptama Collect -> localStorage + Supabase -> CSV / JSON
```

QC produk:

```text
Produk tidak ditemukan -> Proposal -> Super Admin -> Approve / Merge / Reject
```

Spreadsheet adalah source of truth untuk master. Supabase menyimpan akun,
submission, lock, QC, dan audit operasional.

## Baca sesuai peran

- Saya pengguna pengisian: [Panduan Pengguna Stasiun](PANDUAN-PENGGUNA-STASIUN.md).
- Saya Super Admin: [Panduan Super Admin](PANDUAN-SUPER-ADMIN.md).
- Saya developer: [Panduan Pengembang](PANDUAN-PENGEMBANG.md), lalu
  [Arsitektur dan Alur Data](ARSITEKTUR-DAN-ALUR-DATA.md).

## Glosarium singkat

**UUID** adalah ID tetap suatu record. **localStorage** adalah cadangan draf di
browser. **Autosave** menyimpan perubahan otomatis. **Lock** membatasi satu
editor aktif. **Version** mencegah perubahan lama menimpa data baru. **RLS**
adalah batas akses di database. **RPC** adalah operasi database terkontrol.
**Proposal** adalah usulan produk. **Merge** menghubungkan variasi penulisan ke
produk yang sama. **Alias** adalah variasi nama. **Canonical Product** adalah
Brand/Tipe baku hasil QC.

Lanjutkan ke [Troubleshooting](TROUBLESHOOTING.md) bila ada kendala.
