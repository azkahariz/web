# Aloptama Collect

Website untuk Pendataan Metadata dan Inventaris Aloptama pada bidang
Meteorologi, Klimatologi, dan Geofisika. Aplikasi memakai akun bersama per
stasiun, menyimpan draf di browser dan Supabase, serta dapat mengekspor hasil
ke CSV atau JSON.

## Mulai di sini

Dokumentasi dibuat berurutan agar perubahan sederhana dapat dilakukan tanpa
harus memahami seluruh kode:

1. [Panduan perubahan](docs/PANDUAN-PERUBAHAN.md) - langkah paling praktis.
2. [Struktur proyek](docs/STRUKTUR-PROYEK.md) - fungsi setiap folder dan file.
3. [Checklist sebelum publikasi](docs/CHECKLIST-PUBLIKASI.md) - pemeriksaan wajib.
4. [Rencana database](docs/RENCANA-DATABASE.md) - batas sistem saat ini dan arah berikutnya.
5. [Master data Supabase](docs/MASTER-DATA-SUPABASE.md) - bootstrap UUID dan sync CSV.
6. [Auth dan autosave Supabase](docs/AUTH-AUTOSAVE-SUPABASE.md) - akun stasiun, RLS, lock, dan pemulihan draf.

## Menjalankan di komputer

```powershell
cd Z:\collect-irm-data\web
npm.cmd install
npm.cmd run dev
```

Buka alamat lokal yang ditampilkan terminal, biasanya
`http://localhost:3000`.

## Pemeriksaan otomatis

Setelah melakukan perubahan, jalankan satu perintah berikut:

```powershell
npm.cmd run check
```

Perubahan baru boleh dipublikasikan jika pemeriksaan selesai tanpa error.

Perintah tersebut memeriksa build ChatGPT Sites yang masih dipertahankan dan
build native Next.js yang digunakan oleh Vercel.

## Deployment Vercel

Repository ini siap dikenali sebagai project Next.js. Di Vercel, import
repository GitHub, gunakan project name `aloptama-collect`, lalu biarkan
Framework Preset dan Build Command terdeteksi otomatis. Tambahkan
`NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` pada
Environment Variables project.

Setelah repository terhubung, setiap push ke branch produksi akan membuat
deployment baru secara otomatis. Deployment ChatGPT Sites yang sudah aktif
tidak berubah oleh proses persiapan ini.

## Penyimpanan saat ini

Draf disimpan secara hybrid di `localStorage` dan tabel `submissions` Supabase.
Jika koneksi gagal, draf lokal tetap tersedia. Lihat
[Auth dan autosave Supabase](docs/AUTH-AUTOSAVE-SUPABASE.md) untuk aturan lock,
konflik versi, migrasi, dan provisioning akun.

## Master data Supabase

Spreadsheet/CSV tetap menjadi source of truth master. Supabase menyimpan mirror
master ber-UUID, akun stasiun, dan draf inventaris.

```powershell
npm.cmd run validate:master
npm.cmd run sync:master
```

`sync:master` adalah proses lokal tepercaya dan memerlukan `SUPABASE_DB_URL` di
`.env.local`. Credential database dan secret key tidak boleh ditambahkan ke Vercel.
