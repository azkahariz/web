# Setup Development

## Status Dokumen

- Baseline source: `1e306ebe683dd5a1cc5c1fe54e9c288727e56331`
- Target pembaca: Developer Aloptama Collect
- Source of truth: source code, tests, dan migrations pada baseline di atas

## Prerequisites

| Kebutuhan | Minimum / catatan |
| --- | --- |
| Git | clone dan workflow branch |
| Node.js | `>=22.13.0` dari `package.json` |
| npm | gunakan lockfile repository |
| Docker Desktop | dibutuhkan Supabase local |
| Supabase CLI | tersedia melalui `npx.cmd supabase ...` |
| Port lokal | Next.js biasanya 3000; Supabase API 54321, DB 54322, Studio 54323 |

Repository hanya menetapkan minimum `>=22.13.0`. Versi Node yang disetel pada Hostinger perlu dikonfirmasi operator; jangan menganggap Node 24 sebagai requirement keras sebelum ada konfigurasi repo/operator yang menetapkannya.

## Clone Repository

Windows PowerShell:

```powershell
git clone <repository-url> Z:\collect-irm-data\web
Set-Location Z:\collect-irm-data\web
git status
```

Unix/macOS:

```bash
git clone <repository-url> aloptama-collect
cd aloptama-collect
git status
```

Gunakan branch feature untuk perubahan. Jangan mengembangkan langsung pada `main`.

## Install Dependency

Untuk install reproducible gunakan lockfile:

```powershell
npm.cmd ci
```

Pada Unix/macOS gunakan `npm ci`. `npm install` hanya dipakai bila memang sedang memperbarui dependency secara sadar.

## Environment Variables

Salin bentuk dari `.env.example` menjadi `.env.local`, lalu isi melalui channel secret yang benar. Jangan commit file ini.

| Variable | Dibutuhkan aplikasi web | Dibutuhkan verifier/script | Public atau secret |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Ya, browser/SSR Supabase | kadang | public configuration |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Ya, browser/SSR Supabase | kadang | public configuration |
| `SUPABASE_SECRET_KEY` | route Admin tertentu | provisioning | server secret |
| `SUPABASE_DB_POOLER_URL` | Tidak | preferred trusted remote export/sync | connection secret |
| `SUPABASE_DB_URL` | Tidak | local verifier atau explicit trusted DB script | connection secret |
| `SUPABASE_LOCAL_DB_URL` | Tidak | optional local master script override | local connection secret |
| `SUPABASE_LOCAL_URL` | Tidak | local provisioning | local configuration |
| `SUPABASE_LOCAL_SECRET_KEY` | Tidak | local provisioning | local secret |
| `SUPER_ADMIN_USERNAME` | Tidak | provisioning default | local/ops configuration |
| `ADMIN_VERIFY_BASE_URL` | Tidak | Admin API verifier | controlled test URL |

Nilai tidak boleh masuk dokumentasi, source, log, atau `NEXT_PUBLIC_*` bila sifatnya secret. `SUPABASE_DB_POOLER_URL` diprioritaskan helper master remote; script harus gagal jelas bila remote URL tidak tersedia, bukan diam-diam memakai localhost.

## Start Supabase Lokal

Pastikan Docker Desktop benar-benar running, lalu:

```powershell
npx.cmd supabase start
npx.cmd supabase status
```

Konfigurasi repository menetapkan local PostgreSQL pada `127.0.0.1:54322`. Port API adalah 54321 dan Studio 54323.

Local config saat ini mematikan Auth, Storage, dan Realtime. Karena itu jangan mengharapkan demo login Station/Admin bawaan hanya dari `supabase start`. Verifier database memakai fixture lokal; interactive Auth membutuhkan setup yang memang disiapkan khusus, bukan credential yang ditebak.

## Reset Database Lokal

Gunakan reset saat perlu menguji semua migration dari awal atau ketika fixture/local schema perlu dikembalikan ke baseline:

```powershell
npx.cmd supabase db reset
```

Perintah ini destructive untuk database **lokal**. Sebelum menjalankan verifier mutation, periksa target URL dan pastikan bukan host production. Target yang diharapkan untuk verifier lokal adalah `127.0.0.1:54322`, bukan project Supabase remote.

## Start Next.js Development Server

```powershell
npm.cmd run dev
```

Lalu buka URL yang ditampilkan Next.js, umumnya `http://localhost:3000`.

Untuk boot yang lebih dekat ke production:

```powershell
npm.cmd run build
npm.cmd run start
```

`dev` memberi reload dan tooling development. `build` + `start` memeriksa bahwa aplikasi dapat dibangun dan dijalankan sebagai Node server biasa.

## Verifikasi Setup

Setup dasar berhasil ketika:

1. `npx.cmd supabase status` menunjukkan service local yang diharapkan.
2. `npm.cmd run dev` dapat melayani aplikasi.
3. `npm.cmd run check` lulus.
4. `npm.cmd run build` lulus.
5. Verifier fitur yang relevan dapat dijalankan ke local DB saja.

Tidak ada demo credential universal di repository. Jangan membuat atau mencari credential production untuk membuktikan setup lokal.

## Standard Node Build/Start

`package.json` mendefinisikan `dev = next dev`, `build = next build`, dan `start = next start`. Gunakan `npm.cmd run build` sebelum menganggap perubahan siap review.

## Common Setup Problems

| Gejala | Pemeriksaan pertama |
| --- | --- |
| `supabase start` gagal | Docker Desktop engine, ruang disk, port 54321/54322/54323 |
| app berkata konfigurasi Supabase belum tersedia | nama variable public pada `.env.local`, lalu restart Next.js |
| verifier mencoba remote atau DNS gagal | cek `SUPABASE_DB_URL` / `SUPABASE_DB_POOLER_URL`; jangan lanjut sampai target jelas |
| login lokal tidak tersedia | local config memang mematikan Auth; gunakan verifier fixture atau setup Auth lokal terkontrol |
| build gagal karena Node | cek `node --version` terhadap minimum package |
| port 3000 dipakai | hentikan process yang memakai port atau gunakan port lain dari Next.js |

## Production Safety

- Export remote yang memang `READ ONLY` tetap harus memakai URL remote eksplisit.
- `sync:master`, provisioning remote, remediation, dan migration production bukan bagian dari local setup; jangan jalankan hanya untuk membuktikan environment hidup.
- Verifier yang membuat fixture dan rollback tetap hanya untuk Supabase lokal/disposable.
- Jangan menjalankan `db reset` terhadap database remote.

## Stop / Restart Environment

Hentikan Next.js dengan `Ctrl+C` pada terminal server. Untuk mematikan Supabase lokal:

```powershell
npx.cmd supabase stop
```

Gunakan `npx.cmd supabase status` sebelum dan setelah restart untuk memastikan port/target yang aktif.

## Source of Truth untuk Dokumen Ini

- `package.json` -> Node requirement dan scripts.
- `.env.example` -> nama variable yang didokumentasikan.
- `.gitignore` -> `.env*`, `private-output/`, output build/export yang tidak dilacak.
- `supabase/config.toml` -> port dan service local.
- `scripts/master/database-connection.mjs` -> remote pooler priority dan local URL convention.
- `scripts/verify-*.mjs` -> verifier fixture/rollback dan target assumptions.
- `tests/rendered-html.test.mjs` -> build-backed test behavior.

## Baca Sebelumnya

[Arsitektur](./02-ARSITEKTUR.md)

## Baca Selanjutnya

[Struktur Codebase](./04-STRUKTUR-CODEBASE.md) untuk menentukan file yang perlu dibaca setelah local environment siap.
