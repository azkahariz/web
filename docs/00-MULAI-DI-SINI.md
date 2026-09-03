# Aloptama Collect - Mulai di Sini

## Status Dokumen

- Baseline source: `1e306ebe683dd5a1cc5c1fe54e9c288727e56331`
- Target pembaca: Developer Aloptama Collect
- Source of truth: source code, tests, dan migrations pada baseline di atas

Dokumen ini adalah pintu masuk developer baru. Baca sekitar 10-15 menit sebelum membuka area kode tertentu.

## Apa Itu Aloptama Collect?

Aloptama Collect adalah aplikasi BMKG untuk mencatat metadata Site Aloptama dan inventaris perangkatnya. Sistem mendukung pengisian bertahap oleh Station User, pengawasan lintas stasiun oleh Super Admin, serta pemeriksaan Product yang belum ada di katalog.

Data operasional nyata berada di Supabase. Aplikasi bukan spreadsheet editor dan tidak menggunakan CSV sebagai sumber runtime sehari-hari.

## Siapa Penggunanya?

- **Station User** mengisi Site untuk satu Station yang sudah terikat ke akunnya.
- **Super Admin** memantau pengisian, mengelola akun, Produk, Product QC, lock, dan audit.
- **Developer** memelihara source, migration, test, dan deployment dengan prosedur aman.

## URL dan Environment Utama

| Environment | URL / peran |
| --- | --- |
| Production canonical | `https://aloptama-collect.azkahariz.com` |
| Legacy compatibility | `https://aloptama-collect.vercel.app` |
| Legacy URL behavior | HTTP 307 ke canonical URL; path dan query tetap dibawa |
| Local web | biasanya `http://localhost:3000` saat `npm.cmd run dev` |
| Local Supabase DB | `127.0.0.1:54322` saat Supabase local aktif |

Hostinger menjalankan Next.js production. Vercel tetap dipakai untuk Preview branch dan compatibility redirect. Cloudflare memegang DNS hostname aplikasi. Detail akses akun dan DNS adalah informasi operator, bukan konfigurasi yang disimpan di Git.

## Stack Teknologi

| Area | Teknologi / peran |
| --- | --- |
| Application runtime | Next.js 16.2.6 dan React 19.2.6 |
| Bahasa | TypeScript 5.9.3 |
| Package manager | npm dengan `package-lock.json` |
| Node minimum | `>=22.13.0` |
| Backend | Supabase Auth, PostgreSQL, RLS, dan RPC |
| Production web | Hostinger Managed Next.js |
| DNS | Cloudflare |
| Compatibility / Preview | Vercel |
| Source control | GitHub |

## Source of Truth

Gunakan urutan berikut saat ada informasi yang saling berbeda:

1. Source terbaru pada branch `main`.
2. Test terbaru yang memeriksa kontrak perilaku.
3. Migration Supabase yang sudah diterapkan dan RPC current.
4. Dokumentasi developer ini.
5. Dokumentasi lama, catatan percakapan, CSV, atau spreadsheet.

Secara operasional:

- Master dan business data runtime: Supabase.
- Source code: repository Git, branch `main` setelah release.
- Evolusi database: `supabase/migrations/`.
- CSV, spreadsheet, dan `app/data.generated.json`: artefak legacy untuk import/recovery/reference eksplisit, bukan authority runtime.

## Peta Dokumentasi

| Dokumen | Gunakan untuk |
| --- | --- |
| Dokumen ini | orientasi dan aturan aman |
| [Overview Sistem](./01-OVERVIEW-SISTEM.md) | memahami domain dan aktor |
| [Arsitektur](./02-ARSITEKTUR.md) | memahami request path dan batas sistem |
| [Setup Development](./03-SETUP-DEVELOPMENT.md) | menyalakan lingkungan lokal |
| [Struktur Codebase](./04-STRUKTUR-CODEBASE.md) | menemukan implementation suatu fitur |
| [Database Supabase](./05-DATABASE-SUPABASE.md) dan [Auth](./06-AUTH-DAN-OTORISASI.md) | memahami data, migration, dan akses |
| [Submission](./07-FLOW-STATION-DAN-SUBMISSION.md) dan [Admin/QC](./08-FLOW-ADMIN-DAN-QC.md) | memahami workflow operasional |
| [Product](./09-PRODUCT-MASTER-DAN-REFERENSI.md) dan [Completion](./10-COMPLETION-DAN-MONITORING.md) | memahami master Product dan progress |
| [Deployment](./11-DEPLOYMENT-DAN-INFRASTRUKTUR.md) sampai [Security](./15-SECURITY-DAN-SECRETS.md) | menjalankan release, verifikasi, dan operasi aman |
| [History](./16-HISTORY-DAN-LEGACY.md) dan [Handover](./17-HANDOVER-CHECKLIST.md) | memahami compatibility dan membuktikan transfer |
| [ADR](./adr/README.md) dan [Diagrams](./diagrams/README.md) | rationale keputusan dan referensi visual |
| [Operator Input Worksheet](./OPERATOR-INPUT-WORKSHEET.md) | hanya untuk owner/operator sebelum sign-off handover |

Pilih dokumen sesuai area kerja; tidak perlu membaca seluruh detail dalam satu sesi onboarding.

## Urutan Onboarding Developer Baru

1. Baca dokumen ini dan [Overview Sistem](./01-OVERVIEW-SISTEM.md).
2. Baca [Arsitektur](./02-ARSITEKTUR.md) agar tahu request tidak selalu melewati Next.js.
3. Ikuti [Setup Development](./03-SETUP-DEVELOPMENT.md) tanpa memakai credential production.
4. Gunakan [Struktur Codebase](./04-STRUKTUR-CODEBASE.md) untuk memilih entry point fitur.
5. Baca dokumen lanjutan yang sesuai sebelum mengubah database, Auth, Submission, Product, atau monitoring.
6. Jalankan test yang relevan sebelum dan setelah perubahan.

## Perintah Dasar yang Harus Dikenal

```powershell
git status
npm.cmd ci
npx.cmd supabase start
npx.cmd supabase db reset
npm.cmd run dev
npm.cmd run check
npm.cmd run build
git diff --check
```

`check` menjalankan lint, test umum, dan test completion. Verifier database seperti `verify:admin-qc` atau `verify:product-merge` adalah integration test lokal dan tidak boleh diarahkan ke production.

## Aturan Keselamatan Utama

- Jangan mengedit migration yang sudah production-applied; buat migration baru.
- Jangan melakukan mutation production manual tanpa audit target, guard, dan otorisasi eksplisit.
- Jangan rewrite `submissions.payload` tanpa memahami version, lock, export, dan consumer lain.
- Jangan menjalankan verifier yang membuat fixture terhadap database production, walaupun verifier berusaha rollback.
- Jangan commit `.env.local`, connection string, secret key, token, atau output credential.
- Jangan menebak aturan business dari UI; cek source, test, dan RPC yang menjalankannya.
- Jangan menjadikan CSV/spreadsheet sebagai cara rutin untuk menimpa master Supabase.

## Hal yang Jangan Dilakukan

- Jangan menggunakan `git reset --hard`, force push, atau menghapus branch yang masih punya commit unik.
- Jangan menganggap `data.generated.json` sebagai runtime master Station User.
- Jangan mengubah timeout/lifecycle lock, pagination data besar, atau completion query tanpa audit consumer dan regression test.
- Jangan menyimpan business state pada memory process Next.js; state persisten harus berada di Supabase.
- Jangan mengekspos `SUPABASE_SECRET_KEY` melalui `NEXT_PUBLIC_*` atau komponen client.

## Jika Saya Hanya Punya 30 Menit

1. Baca dokumen ini dan bagian Feature -> Code Quick Map di [Struktur Codebase](./04-STRUKTUR-CODEBASE.md).
2. Buka `app/page.tsx`, `app/InventoryApp.tsx`, `app/hooks/useServerDraft.ts`, dan `app/admin/AdminDashboard.tsx`.
3. Jalankan `npm.cmd run check` dan `npm.cmd run build`.
4. Untuk perubahan database, berhenti dulu dan baca migration terkait sebelum menulis kode.

## Source of Truth untuk Dokumen Ini

- `package.json` -> nama project, versi stack, scripts, dan minimum Node.
- `app/lib/legacy-vercel-redirect.ts` -> hostname canonical dan legacy destination.
- `proxy.ts` -> behavior redirect 307 dan refresh session.
- `supabase/config.toml` -> port dan karakter local Supabase.
- `scripts/master/database-connection.mjs` -> prioritas URL database trusted script.
- `tests/legacy-vercel-redirect.test.mjs` -> path/query redirect dan host yang tidak dialihkan.
- `private-output/knowledge-transfer-audit-2026-09-03.md` -> peta audit yang sudah dicek ulang terhadap source.

## Baca Selanjutnya

[Overview Sistem](./01-OVERVIEW-SISTEM.md) -> [Arsitektur](./02-ARSITEKTUR.md) -> [Setup Development](./03-SETUP-DEVELOPMENT.md)
