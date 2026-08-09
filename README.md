# Aloptama Collect

Aloptama Collect adalah aplikasi pendataan metadata lokasi dan perangkat
Aloptama BMKG. Petugas stasiun mengisi data site miliknya, sedangkan Super
Admin mengelola akun, lock, seluruh submission, dan pemeriksaan usulan produk.

Production: https://aloptama-collect.vercel.app

## Mulai di sini

Pembaca baru mulai dari [docs/MULAI-DI-SINI.md](docs/MULAI-DI-SINI.md). Dokumen
itu menjelaskan tujuan aplikasi, aliran data, jenis pengguna, istilah dasar,
dan urutan dokumen berikutnya.

Arsitektur ringkas:

```text
Next.js di Vercel
  + Supabase Auth dan PostgreSQL
  + localStorage sebagai cadangan draf browser
  + Spreadsheet/CSV sebagai sumber master
```

## Quick start

```powershell
cd Z:\collect-irm-data\web
npm.cmd install
npm.cmd run dev
```

Buka `http://localhost:3000`.

Pemeriksaan utama:

```powershell
npm.cmd run check
npm.cmd run verify:auth-autosave
npm.cmd run verify:admin-qc
npm.cmd run verify:admin-api
```

## Command penting

- `npm.cmd run validate:master`: validasi CSV tanpa mengubah database.
- `npm.cmd run sync:master`: sinkronkan Spreadsheet/CSV ke Supabase.
- `npm.cmd run provision:station-accounts`: buat akun stasiun yang belum ada.
- `npm.cmd run provision:super-admin`: buat Super Admin secara idempotent.

## Environment dan keamanan

Browser boleh menerima `NEXT_PUBLIC_SUPABASE_URL` dan
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `SUPABASE_SECRET_KEY` hanya boleh
digunakan server atau script tepercaya. `SUPABASE_DB_URL` hanya untuk workflow
lokal seperti migration, sync master, dan verification database.

Jangan commit `.env.local`, `private-output/`, credential CSV, atau secret.

## Git dan Vercel

Kerjakan fitur di branch, jalankan seluruh pemeriksaan, push branch untuk
Vercel Preview, uji Preview, lalu merge ke `main` setelah disetujui. Push ke
`main` memicu deployment Production. Panduan lengkap ada di
[docs/PANDUAN-PENGEMBANG.md](docs/PANDUAN-PENGEMBANG.md).
