# Runbook Production

## Status Dokumen

- Baseline source: `f5b4c1a7248b3da680fff7b19750fcfd00ec40a4`
- Target pembaca: Developer/Operator Aloptama Collect
- Source of truth: source code, configuration, tests, migrations, dan fakta operator yang secara eksplisit ditandai

## Sebelum Menyentuh Production

Pastikan repository, branch, SHA feature, dan target production benar; worktree bersih; `origin/main` terbaru; test/build relevan lulus; compatibility migration dipahami; serta ada otorisasi eksplisit untuk setiap mutation production. Read-only production query berbeda dari izin untuk mutation.

Policy current ada pada [OP-008](./OPERATOR-INPUT-WORKSHEET.md): developer boleh melakukan read-only analysis dan koreksi row-level terbatas; schema, migration, RPC/RLS/Auth, destructive cleanup, credential rotation, dan DNS adalah owner-only. Jangan memperluas izin row-level menjadi bulk/cascade/dependency-heavy mutation.

## Standard Release - Application Only

1. Verifikasi feature branch dan Preview.
2. Buat/review PR lalu merge ke `main`.
3. Sinkronkan `main` dengan `origin/main` menggunakan fast-forward.
4. [VERIFIKASI SAAT OPERASI] Tunggu dan cek deployment Hostinger dari SHA `main`.
5. [VERIFIKASI SAAT OPERASI] Cek compatibility Vercel bila redirect terkait.
6. Jalankan smoke canonical dan legacy bila relevan.
7. Bersihkan branch hanya setelah deployment sehat, ancestor terbukti, dan unique commit nol.

## Release dengan Database Migration

Migration adalah operasi terpisah dari merge. Gunakan hanya jika feature membutuhkannya dan migration telah diuji local.

## Production Migration Preflight

1. Baca SQL penuh dan cari DDL/DML/privilege yang tidak diharapkan.
2. Terapkan/reset local sesuai kontrak lalu jalankan test/verifier.
3. Periksa migration history target dan dry-run bila tooling mendukung.
4. Jalankan oracle read-only pada project production yang benar.
5. Konfirmasi compatibility aplikasi lama/baru dan otorisasi mutation production.
6. STOP bila target salah, ada DML tak terduga, atau oracle tidak sesuai.

## Apply Migration

Terapkan migration sekali ke target yang sudah diverifikasi. Jangan menjalankan ulang migration yang telah applied. Simpan bukti status migration dan ringkasan hasil tanpa secret.

## Post-Migration Verification

Periksa history migration, schema/RPC/grant yang berubah, dan oracle read-only. Lanjutkan ke deployment frontend hanya jika app current/baru kompatibel.

## Merge dan Deploy

Setelah gate migration dan Preview lulus, merge feature ke `main`, jalankan `npm.cmd run check` serta `npm.cmd run build` pada hasil merge, lalu push normal. Jangan force push atau rewrite history.

## Production Smoke

Verifikasi canonical app, login, Admin Ringkasan, Station flow terdampak, feature baru, serta error 5xx jelas. Untuk redirect, periksa legacy host memberi 307 dengan Location canonical dan path/query utuh. Jangan membuat data test production kecuali eksplisit diperlukan dan diotorisasi.

## Rollback Application

Sebelum rollback deployment/Git, jawab: apakah app versi sebelumnya masih kompatibel dengan schema production saat ini? Bila tidak, jangan rollback secara buta. Pilih release forward-fix atau release kompatibel yang telah diverifikasi.

## Roll Forward Database

Default database production adalah migration baru yang memperbaiki state ke depan. Jangan menghapus migration history, mengedit SQL applied, atau melakukan schema rewind manual tanpa rollback khusus yang diuji dan disetujui.

## Kenapa Migration Tidak Di-Rollback Sembarangan

Migration dapat dipakai app baru, RPC, RLS, dan data nyata. Rewind parsial mudah membuat aplikasi dan history tidak konsisten. Forward-fix menjaga audit trail dan dapat diuji sebagai perubahan baru.

## Branch Cleanup

Sebelum delete: PR/merge/deployment sehat, `git merge-base --is-ancestor <branch> main` lulus, `git log main..<branch>` kosong, dan branch bukan branch aktif. Hapus dengan `git branch -d`, delete remote normal, lalu `git fetch --prune`. Jangan gunakan force delete sebagai kebiasaan.

## Incident Triage

Kumpulkan symptom, URL/route, waktu, SHA, peran user, response/error aman, serta layer yang diduga. Observasi dan read-only check mendahului UPDATE/DELETE/payload edit.

## Hostinger Deployment Failure

1. Verifikasi SHA `main` dan status deployment. Lihat [OP-011](./OPERATOR-INPUT-WORKSHEET.md) untuk lokasi dashboard/log Hostinger.
2. Bedakan build failure dan runtime failure.
3. Reproduksi `npm ci` dan `npm run build` local bila relevan.
4. Pastikan nama environment runtime tersedia tanpa mencetak nilainya.
5. Jangan mengubah DNS sebagai respons pertama.

## Supabase/RPC Failure

Identifikasi RPC/route gagal, baca error aplikasi, cek migration history, lalu jalankan oracle read-only untuk signature/schema/grant yang diharapkan. Jangan memakai write sebagai diagnostik default.

## Auth Incident

Untuk login, 401/403, admin forbidden, atau station scope salah: cek auth/session route, role/RLS/RPC, dan host cookie. Perpindahan hostname legacy ke canonical dapat meminta login lagi karena boundary cookie host. Jangan merotasi credential kecuali ada indikasi compromise.

## Completion Incident

Untuk card blank, lambat, percentage salah, atau Gudang salah: cek RPC completion, oracle DB, master Site Type, semantics Gudang distinct Station, dan traversal payload. Jangan menambal angka percentage di UI.

## Product/QC Incident

Untuk count/reference/merge/category salah: cek RPC status/list paginasi, `resolved_product_id`, direct JSON occurrence, QC reference, stale guard, dan audit. Jangan rewrite semua payload Submission secara global.

## Legacy Redirect Incident

Periksa legacy hostname, status 307, header Location, path, query, lalu canonical Hostinger. Bila canonical gagal, jangan menganggap redirect sebagai root cause tanpa bukti.

## DNS Incident

Verifikasi resolusi canonical, custom domain binding Hostinger, record Cloudflare, dan target provider. [VERIFIKASI SAAT OPERASI] Nilai dashboard/record dapat berubah; jangan mengganti record secara spekulatif.

## Credential Incident

Jika secret diduga bocor, perlakukan sebagai compromise: rotate di provider, perbarui environment yang sah, deploy/restart bila perlu, verifikasi credential lama invalid, dan catat incident. Menghapus satu baris Git bukan mitigasi cukup.

## Emergency Stop Rules

STOP bila project Supabase salah, migration mengandung DML tak terduga, worktree kotor, migration sudah applied tak terduga, oracle DB tidak cocok dengan RPC, migration tidak kompatibel dengan app deployed, destructive operation belum diotorisasi, atau secret muncul di diff/log.

## Operator Contacts / Ownership

Lihat [OP-001 sampai OP-012](./OPERATOR-INPUT-WORKSHEET.md) untuk ownership, recovery, approval, observability, dan emergency contact. Repository tidak dapat membuktikan informasi manusia/dasbor ini.

## Source of Truth untuk Dokumen Ini

- `package.json`, `supabase/migrations/`, verifier di `scripts/`, dan test di `tests/`.
- `proxy.ts` dan `app/lib/legacy-vercel-redirect.ts` -> redirect compatibility.
- Dokumen 06-10 -> Auth, Submission, Product, Completion, dan Gudang.

## Baca Sebelumnya

[Testing dan Verification](./12-TESTING-DAN-VERIFICATION.md)

## Baca Selanjutnya

[Troubleshooting](./14-TROUBLESHOOTING.md)
