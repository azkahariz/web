# Handover Checklist

## Status Dokumen

- Baseline source: `63288a1ca27bb60004204a5b73c67147b033d73e`
- Target pembaca: Developer/Operator Aloptama Collect
- Source of truth: source code, configuration, tests, migrations, dan fakta operator yang secara eksplisit ditandai

## Tujuan

Checklist ini adalah bukti transfer, bukan sekadar daftar baca. Isi setiap kotak hanya setelah dapat diamati/didemonstrasikan. Jangan menaruh credential value di dokumen ini.

## Definition of Done

Handover COMPLETE bila docs 00-17 telah direview, akses kritis ditransfer, input operator diselesaikan atau diterima formal, developer baru dapat boot local dan menjalankan verification, dapat menjelaskan flow kritis/release/troubleshooting, dan ownership/recovery production eksplisit.

## A. Repository dan Source Code

- [ ] GitHub repository access telah diberikan.
- [ ] Developer baru dapat clone repository dan melihat `main`.
- [ ] Workflow feature branch, PR, merge, dan cleanup branch dapat dijelaskan.
- [ ] Branch documentation dan docs 00-17 telah direview.

## B. Local Development

- [ ] Node/npm sesuai minimum project tersedia.
- [ ] Docker dan Supabase CLI tersedia.
- [ ] Environment local dikonfigurasi tanpa memasukkan secret ke Git.
- [ ] Supabase local dapat dijalankan dan diperiksa dengan `npx supabase status`.
- [ ] Aplikasi dapat dijalankan dengan `npm.cmd run dev`.
- [ ] `npm.cmd run build` dan test yang relevan dapat dijalankan.

## C. Architecture Knowledge

- [ ] Developer baru dapat membedakan Browser, Hostinger runtime, Supabase, Cloudflare DNS, Vercel compatibility, dan GitHub source control.
- [ ] Developer baru dapat menjelaskan canonical URL dan legacy 307 tanpa menyebut Vercel sebagai runtime canonical.

## D. Database dan Supabase

- [ ] Developer baru dapat menemukan Station, Site/Subtipe, Submission, Product, Product Proposal, RPC, RLS, dan migration.
- [ ] Developer baru dapat membuat migration local baru tanpa mengedit migration production-applied.
- [ ] Developer baru dapat membedakan query read-only dari mutation production.

## E. Authentication dan Authorization

- [ ] Developer baru dapat menjelaskan Station User, Super Admin, session Supabase, station scope, dan server secret boundary.
- [ ] Developer baru memahami cookie tidak dibagi antar hostname legacy/canonical.

## F. Station dan Submission

- [ ] Developer baru dapat membuka flow Station, menemukan Site/Subtipe, dan menemukan Submission local/dev.
- [ ] Developer baru dapat menjelaskan payload, version, soft lock, autosave, dan final save.
- [ ] Developer baru dapat membedakan authorization dari soft lock.

## G. Admin, QC, dan Product

- [ ] Developer baru dapat menjelaskan Product, Alias, Product Proposal, `productId`, `productProposalId`, dan `resolved_product_id`.
- [ ] Developer baru dapat membedakan Pindahkan Referensi dari Gabungkan Produk.
- [ ] Developer baru dapat menjelaskan DIRECT dan QC_RESULT tanpa menghapus history QC.

## H. Completion dan Gudang

- [ ] Developer baru dapat menjelaskan expected, filled, status Station, global weighted progress, dan Site Type progress.
- [ ] Developer baru dapat menjelaskan Gudang informational progress tidak masuk category completeness.

## I. Testing dan Verification

- [ ] Developer baru dapat menjelaskan `npm run test`, `npm run check`, dan kapan build diperlukan.
- [ ] Developer baru dapat mengidentifikasi verifier local-only dan production read-only check.
- [ ] Developer baru mengetahui mutation verifier MUST NOT target production.

## J. Deployment

- [ ] Developer baru dapat menjelaskan Preview -> PR -> `main` -> Hostinger -> smoke -> cleanup.
- [ ] Developer baru dapat membedakan app deployment dan Supabase migration.
- [ ] Walkthrough release terakhir atau release approved telah dilakukan tanpa deployment dummy.

## K. Production Runbook

- [ ] Developer baru dapat mengikuti preflight, migration compatibility gate, rollback compatibility check, dan emergency STOP rules.

## L. Troubleshooting

- [ ] Developer baru dapat triage Completion salah tanpa mutation acak.
- [ ] Developer baru dapat triage QC count salah tanpa menghitung page UI.
- [ ] Developer baru dapat triage autosave/version conflict tanpa force overwrite.

## M. Security dan Secrets

- [ ] Developer baru memahami public config vs `SUPABASE_SECRET_KEY` server-only.
- [ ] Developer baru mengetahui lokasi secret, tanpa menerima nilainya dalam Markdown/chat.
- [ ] Developer baru memahami rotation dan leak response.

## N. Account Ownership dan Access Transfer

- [ ] GitHub, Hostinger, Supabase, Cloudflare, dan Vercel access baru telah diuji.
- [ ] Primary/backup owner dan recovery method telah dicatat oleh operator.
- [ ] MFA state telah dikonfirmasi bila provider mendukung.

## O. Billing / Subscription Ownership

- [ ] Billing owner, renewal responsibility, dan recovery ownership Hostinger telah dicatat.
- [ ] Billing owner Supabase, Cloudflare, Vercel, dan domain registrar (bila terpisah) telah dicatat.
- [ ] Tidak ada detail kartu pembayaran dalam repository/dokumentasi.

## P. Domain dan DNS

- [ ] Ownership `azkahariz.com` diketahui.
- [ ] Cloudflare zone access dan canonical record telah diverifikasi.
- [ ] Hostinger custom-domain binding dan approval proses DNS dapat dijelaskan.

## Q. Backup / Recovery Knowledge

- [ ] BACKUP/RECOVERY PROCEDURE NOT YET FORMALLY DOCUMENTED telah diselesaikan atau diterima sebagai risiko operator.
- [ ] OP-010 owner backup, retention, restore test, dan recovery runbook telah dicatat.

## R. Legacy / Compatibility

- [ ] Developer baru memahami Spreadsheet/provenance bukan runtime authority.
- [ ] Developer baru memahami category alias, payload compatibility, dan Vercel redirect tidak dihapus tanpa evidence.

## S. Documentation Review

- [ ] Developer baru mengetahui urutan docs 00-17, ADR, dan diagrams.
- [ ] Link/repository source dapat digunakan untuk menelusuri klaim teknis.

## T. Practical Handover Exercises

- [ ] Jelaskan hubungan Station -> Site -> Submission tanpa bantuan maintainer lama.
- [ ] Jalankan local app dan satu verifier aman pada local DB.
- [ ] Jelaskan satu Product QC result dan satu Product reference move/merge scenario.
- [ ] Jelaskan perhitungan Completion dan Gudang dari source/test.

## U. Outstanding Operator Inputs

Worksheet canonical: [Operator Input Worksheet](./OPERATOR-INPUT-WORKSHEET.md). Semua input awal berstatus **BELUM DIISI**. Ownership/recovery/billing provider kritis adalah **HANDOVER BLOCKER** sampai operator mengonfirmasi; detail observability non-kritis dapat dilengkapi setelah handover bila diterima formal.

| Document | Topic | Required operator input | Status |
| --- | --- | --- | --- |
| OP-001 | GitHub ownership/access/recovery | BELUM DIISI | HANDOVER BLOCKER |
| OP-002 | Hostinger ownership/access/recovery | BELUM DIISI | HANDOVER BLOCKER |
| OP-003 | Supabase ownership/access/recovery | BELUM DIISI | HANDOVER BLOCKER |
| OP-004 | Cloudflare ownership/access/recovery | BELUM DIISI | HANDOVER BLOCKER |
| OP-005 | Vercel Preview/legacy access | BELUM DIISI | RECOMMENDED BEFORE HANDOVER |
| OP-006 | Domain registrar/renewal | BELUM DIISI | HANDOVER BLOCKER |
| OP-007 | Billing/renewal matrix | BELUM DIISI | HANDOVER BLOCKER |
| OP-008 | Production mutation approvals | BELUM DIISI | HANDOVER BLOCKER |
| OP-009 | Credential rotation ownership | BELUM DIISI | HANDOVER BLOCKER |
| OP-010 | Backup/recovery plan | BELUM DIISI | HANDOVER BLOCKER |
| OP-011 | Logs, auto-deploy, observability | BELUM DIISI | RECOMMENDED BEFORE HANDOVER |
| OP-012 | Emergency contacts/escalation | BELUM DIISI | HANDOVER BLOCKER |

## V. Sign-Off

### Maintainer Lama
- Nama:
- Tanggal:
- Catatan:

### Maintainer Baru
- Nama:
- Tanggal:
- Catatan:

### Operator / Owner
- Nama:
- Tanggal:
- Catatan:

## Source of Truth untuk Dokumen Ini

- Docs 00-16, `package.json`, source/runtime helpers, migrations, tests, dan runbook current.
- [Operator Input Worksheet](./OPERATOR-INPUT-WORKSHEET.md) -> provider ownership, billing, recovery, backup, dan approval values.

## Kembali ke Awal

[Mulai di Sini](./00-MULAI-DI-SINI.md)
