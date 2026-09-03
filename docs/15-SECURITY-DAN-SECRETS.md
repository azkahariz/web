# Security dan Secrets

## Status Dokumen

- Baseline source: `f5b4c1a7248b3da680fff7b19750fcfd00ec40a4`
- Target pembaca: Developer/Operator Aloptama Collect
- Source of truth: source code, configuration, tests, migrations, dan fakta operator yang secara eksplisit ditandai

## Security Model Ringkas

Browser memakai konfigurasi publik dan sesi Auth. Hostinger server menjalankan route server yang dapat memakai secret khusus. Supabase menegakkan Auth, RLS, grant, dan RPC authorization. Tool operasional/developer memiliki batas credential sendiri dan tidak boleh dipindahkan ke browser.

## Trust Boundaries

| Boundary | Rule |
| --- | --- |
| browser -> app/Supabase | hanya public config dan user session |
| browser -> server admin | authorization tetap diverifikasi server/DB |
| Hostinger server -> Supabase admin | `SUPABASE_SECRET_KEY` server-only bila diperlukan |
| verifier developer -> DB | hanya target yang divalidasi, local untuk fixture mutation |
| database | RLS/RPC authorization adalah boundary final untuk domain terkait |

## Public vs Secret Configuration

| Credential / Variable | Browser safe | Server only | Commit? |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ya | tidak wajib | nama boleh, nilai runtime tidak di-commit |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ya | tidak wajib | nama boleh, nilai runtime tidak di-commit |
| `SUPABASE_SECRET_KEY` | tidak | ya | tidak |
| `SUPABASE_DB_URL` | tidak | developer/verifier/admin saja | tidak |
| `SUPABASE_DB_POOLER_URL` | tidak | developer/verifier/admin saja | tidak |
| `SUPABASE_LOCAL_URL` | local config | local | jangan commit credential |
| `SUPABASE_LOCAL_SECRET_KEY` | tidak | local saja | tidak |
| `ADMIN_VERIFY_BASE_URL` | bukan secret secara otomatis | controlled verifier config | jangan pakai untuk menyimpan credential |

Prefix `NEXT_PUBLIC_` berarti nilai dibundle/terlihat browser. Publishable key bukan password, tetapi tetap gunakan hanya sebagai konfigurasi publik yang dimaksudkan aplikasi.

## Supabase Publishable Key

Key publik dipakai untuk membuat client browser/server session normal bersama URL Supabase. Keamanan data tidak boleh bergantung pada menyembunyikan key ini; RLS dan authorization harus tetap benar.

## Supabase Secret Key

`SUPABASE_SECRET_KEY` adalah credential elevated server-only. Helper `app/lib/supabase/admin.ts` diberi `server-only` dan membangun admin client hanya di server. Jangan memasukkannya ke komponen client, variable `NEXT_PUBLIC_*`, screenshot, log, atau Markdown.

## Database Credentials

`SUPABASE_DB_URL` dan `SUPABASE_DB_POOLER_URL` digunakan tooling developer/verifier/administrative sesuai script. Jangan otomatis menambahkannya ke runtime Hostinger karena aplikasi runtime tidak membuktikan memerlukannya. Full URL dengan credential tidak boleh di-commit atau dicetak.

## Recovery Configuration Principle

Source code recovery from GitHub and database recovery from Supabase Scheduled Backups do not recover provider-held environment values or account access automatically. Public identifiers can be reconstructed where documented. Server secrets and database credentials must be recovered from authorized provider storage where available or rotated securely by Azka Hariz; never copy their values into this runbook. See [OP-009 dan OP-010](./OPERATOR-INPUT-WORKSHEET.md).

## Browser vs Server Boundary

Client hanya boleh memanggil kontrak publik yang sudah diauthorize. Server route boleh menggunakan credential elevated hanya ketika source membutuhkannya dan tetap harus membatasi tindakan. Service/admin key tidak pernah menjadi solusi untuk bypass RLS dari browser.

## Authentication Tokens dan Cookies

Session Supabase memakai cookie melalui SSR helper. Cookie memiliki boundary hostname; redirect dari legacy Vercel ke canonical Hostinger dapat membuat pengguna perlu login lagi. Jangan log token atau full Authorization header.

## RLS dan Authorization

RLS, `auth.uid()`, role check, dan RPC guard adalah defense-in-depth. Jangan hanya mengandalkan hide/show UI. Perubahan authorization membutuhkan audit code, migration, grant, dan test domain terkait.

## Production Access

Lihat [OP-008 dan OP-012](./OPERATOR-INPUT-WORKSHEET.md) untuk authority mutation production, emergency approver, dan jalur audit/approval.

## GitHub Access

Lihat [OP-001](./OPERATOR-INPUT-WORKSHEET.md) untuk owner repository, collaborator model, backup, dan recovery. Gunakan credential workstation yang sudah sah; jangan menyimpan PAT plaintext di repo.

## Hostinger Access

Lihat [OP-002 dan OP-011](./OPERATOR-INPUT-WORKSHEET.md) untuk owner-only Hostinger production authority, deployer, environment, log, dan recovery tanpa menulis password. Developer tidak memerlukan akses Hostinger untuk workflow source normal.

## Supabase Dashboard Access

Lihat [OP-003](./OPERATOR-INPUT-WORKSHEET.md) untuk owner, Developer membership, maintainer, dan recovery Supabase. Jangan menginfer capability production hanya dari nama role; lihat OP-008 untuk policy mutation.

## Cloudflare Access

Lihat [OP-004, OP-006, dan OP-008](./OPERATOR-INPUT-WORKSHEET.md) untuk zone/DNS owner, registrar continuity, recovery, dan approval DNS. Developer tidak memiliki akses DNS pada model saat ini.

## Vercel Access

Lihat [OP-005](./OPERATOR-INPUT-WORKSHEET.md) untuk project owner, Preview maintainer, dan recovery Vercel. Vercel bukan canonical runtime; developer dapat memakai Preview URL dari workflow PR bila tersedia tanpa provider access langsung.

## Local `.env`

Simpan nilai environment hanya dalam file local yang di-ignore atau secret manager/dashboard yang disetujui. Review `git status` dan diff sebelum commit. Jangan menyalin `.env.local` ke issue, chat, test output, atau Markdown.

## Logging dan Secret Leakage

Jangan log full Authorization header, full DB URL, secret key, token, password, atau seluruh environment. Sanitasi identifier/payload bila cukup untuk diagnosis. Bukti incident harus minimal dan aman.

## Git dan Secret Scan

Sebelum commit, periksa diff dan lakukan secret scan yang mencari JWT-like value, token provider, DB URL dengan credential, dan secret key. Nama variable boleh didokumentasikan; nilainya tidak.

## Credential Rotation

1. Identifikasi credential yang dicurigai.
2. Rotate di provider.
3. Perbarui environment runtime/tool yang sah.
4. Redeploy/restart bila diperlukan.
5. Verifikasi credential lama tidak lagi berlaku dan aplikasi sehat.
6. Catat incident dan review access.

Lihat [OP-009](./OPERATOR-INPUT-WORKSHEET.md) untuk provider procedure dan owner credential rotation.

## Incident jika Secret Bocor

1. Perlakukan secret sebagai compromised.
2. Rotate lebih dulu.
3. Hapus dari file aktif dan output yang masih dapat diakses.
4. Nilai kebutuhan remediation Git history sesuai kebijakan/eksposur.
5. Perbarui environment sah dan verifikasi health.

Menghapus satu baris Git saja tidak membuat credential yang pernah terpapar menjadi aman.

## Handover Access Checklist

- [ ] developer baru memiliki GitHub access;
- [ ] owner/backup Hostinger, Supabase, Cloudflare, dan Vercel dibaca dari worksheet;
- [ ] recovery status dan escalation path dipahami; billing berada di luar scope developer handover;
- [ ] MFA diaktifkan jika provider mendukung dan operator telah mengonfirmasi;
- [ ] akses maintainer lama direview;
- [ ] lokasi secret runtime terdokumentasi tanpa nilainya;
- [ ] tidak ada secret value di Markdown, source, atau Git diff.

## Hal yang Tidak Boleh Dilakukan

- Jangan `gh auth login/logout`, rotate token, atau mengubah credential helper hanya karena sandbox/tool gagal autentikasi.
- Jangan commit `.env.local`, token, password, connection string credential, atau service key.
- Jangan gunakan admin key di browser atau untuk membypass RLS.
- Jangan menganggap publishable key sebagai secret atau secret key sebagai public config.

## Source of Truth untuk Dokumen Ini

- `app/lib/supabase/admin.ts`, `app/lib/supabase/config.ts`, `proxy.ts` -> boundary config/session.
- `package.json` dan `scripts/master/database-connection.mjs` -> tooling environment/connection.
- migration/RPC/Auth tests -> authorization contracts.

## Baca Sebelumnya

[Troubleshooting](./14-TROUBLESHOOTING.md)

## Lanjutan Dokumentasi

[History dan Legacy](./16-HISTORY-DAN-LEGACY.md)
