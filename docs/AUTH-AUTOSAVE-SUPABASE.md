# Auth dan Autosave Supabase

Dokumen ini menjelaskan autentikasi akun stasiun dan penyimpanan draf ke server.

## Alur pengguna

1. Pengguna masuk memakai username dan password akun stasiun.
2. Aplikasi mengambil `station_accounts` milik user yang sedang login.
3. Nama stasiun otomatis terkunci. Pengguna hanya memilih site dan subtipe milik stasiunnya.
4. Setiap perubahan tetap disimpan ke `localStorage`, lalu dikirim ke Supabase setelah jeda 1,5 detik.
5. Satu draf hanya dapat diedit oleh satu tab/sesi. Draf lain pada stasiun yang sama tetap dapat diedit bersamaan.

Tidak tersedia pendaftaran akun mandiri dan tidak ada halaman admin di website.

## Environment

Salin nama variabel dari `.env.example` ke `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
SUPABASE_DB_URL=...
```

- `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` diperlukan browser dan Vercel.
- `SUPABASE_SECRET_KEY` hanya untuk provisioning lokal. Jangan tambahkan ke Vercel.
- `SUPABASE_DB_URL` hanya untuk migrasi dan sinkronisasi master dari komputer pengelola.

## Migrasi database

Migrasi fitur berada di `supabase/migrations/20260810010000_station_auth_autosave.sql`.

```powershell
npx.cmd supabase db push --linked
```

Migrasi membuat `station_accounts`, `submissions`, RLS, dan RPC untuk membuka, menyimpan, menyentuh, melepas, serta mengambil alih lock.

## Membuat akun stasiun

Pastikan migration sudah diterapkan dan `SUPABASE_SECRET_KEY` tersedia, lalu jalankan:

```powershell
npm.cmd run provision:station-accounts
```

Hasil akun baru disimpan di `private-output/station-credentials.csv`. Folder itu diabaikan Git. Password tidak dicetak ke terminal. Menjalankan ulang skrip akan melewati stasiun yang sudah mempunyai akun.

## Aturan draf

- Kunci draf adalah kombinasi `station_id`, `site_id`, dan `site_subtype_id`.
- ID sesi dibuat per tab dan disimpan di `sessionStorage`.
- Lock kedaluwarsa setelah lima menit tanpa aktivitas.
- Tidak ada heartbeat kosong. Aktivitas form menyentuh lock paling sering setiap 45 detik.
- Takeover harus dipilih pengguna dan hanya berhasil secara atomik setelah lock kedaluwarsa.
- Setiap penyimpanan membawa nomor `version`. Server menolak penyimpanan dari versi lama.
- Saat versi berbeda, draf lokal tidak dihapus dan versi server tidak ditimpa otomatis. Pengguna harus memilih **Muat versi terbaru**.
- Jika jaringan atau konfigurasi server tidak tersedia, perubahan tetap berada di penyimpanan lokal perangkat.

## Batas keamanan

Browser hanya memakai publishable key. RLS memeriksa `auth.uid()`, akun stasiun aktif, kepemilikan site oleh stasiun, dan kecocokan subtipe dengan tipe site. Tabel `submissions` tidak menerima tulis langsung dari role `authenticated`; semua operasi tulis melalui RPC yang melakukan validasi tersebut.

## File utama

- `app/page.tsx`: memvalidasi sesi dan akun stasiun di server.
- `app/LoginForm.tsx`: form username/password.
- `proxy.ts`: menyegarkan cookie sesi Supabase untuk Next.js.
- `app/hooks/useServerDraft.ts`: autosave, lock, takeover, dan konflik versi.
- `app/lib/server-draft.ts`: payload dan penyimpanan lokal per UUID.
- `scripts/provision-station-accounts.mjs`: pembuatan akun oleh pengelola.
- `tests/auth-autosave.test.mjs`: kontrak utama fitur.

## Pemeriksaan

```powershell
npm.cmd run check
npm.cmd run verify:auth-autosave
```

Perintah `verify:auth-autosave` menguji RLS lintas stasiun, dua sesi, expiry,
takeover, dan optimistic version di dalam transaksi yang selalu di-rollback.
Uji login browser tetap memerlukan publishable key dan akun hasil provisioning.
