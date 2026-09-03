# Operator Input Worksheet

## Cara Menggunakan

Worksheet ini adalah source canonical untuk fakta operasional yang tidak dapat dibuktikan dari repository. Isi bersama owner/operator sebelum sign-off handover. Status hanya boleh memakai `BELUM DIISI`, `SUDAH DIISI`, atau `TIDAK BERLAKU`.

**Jangan memasukkan password, token, API key, private key, recovery code, nilai secret, full DB connection string, atau nomor kartu pembayaran ke file ini.** Catat pemilik, role, lokasi proses, dan jalur recovery saja.

## Critical Handover Blockers

`OP-001`, `OP-002`, `OP-003`, `OP-004`, `OP-006`, `OP-007`, `OP-008`, `OP-009`, `OP-010`, dan `OP-012` harus terisi atau diterima formal oleh operator sebelum handover final. `OP-005` dan `OP-011` direkomendasikan sebelum handover, tetapi tidak menghalangi transfer source bila provider production lain sudah aman.

## GitHub

### OP-001 - GitHub Ownership, Access, and Recovery

**Status:** BELUM DIISI
**Handover impact:** HANDOVER BLOCKER
**Category:** ACCOUNT OWNERSHIP, ACCESS / ROLE, RECOVERY

**Pertanyaan**
Siapa owner/admin repository, backup maintainer, dan siapa yang dapat memulihkan access tanpa membagikan credential?

**Isi operator**
- Primary owner:
- Backup owner:
- New maintainer access granted: YA / TIDAK
- Recovery process location:
- Catatan:

**Digunakan oleh:** `11`, `13`, `15`, `17`.

## Hostinger

### OP-002 - Hostinger Production Ownership and Access

**Status:** BELUM DIISI
**Handover impact:** HANDOVER BLOCKER
**Category:** ACCOUNT OWNERSHIP, ACCESS / ROLE, RECOVERY

**Pertanyaan**
Siapa owner dan backup owner Hostinger untuk runtime canonical, siapa dapat deploy/edit environment, dan bagaimana recovery account dilakukan?

**Isi operator**
- Primary owner:
- Backup owner:
- Project/site identifier:
- New maintainer deploy access: YA / TIDAK
- Environment editor access: YA / TIDAK
- Recovery process location:
- Catatan:

**Digunakan oleh:** `11`, `15`, `17`.

### OP-011 - Deployment Logs, Auto-Deploy, and Observability

**Status:** BELUM DIISI
**Handover impact:** RECOMMENDED BEFORE HANDOVER
**Category:** INFRASTRUCTURE DASHBOARD FACT, CONTACT / ESCALATION

**Pertanyaan**
Di mana deployment log Hostinger dibuka, apakah branch `main` auto-deploy, dan di mana log/alerting Hostinger, Vercel, dan Supabase dilihat?

**Isi operator**
- Hostinger deployment log location:
- Auto-deploy `main`: YA / TIDAK / TIDAK BERLAKU
- Vercel/Supabase log location:
- Alerting/on-call contact or process:
- Log retention information, if known:
- Catatan:

**Digunakan oleh:** `11`, `13`, `14`.

## Supabase

### OP-003 - Supabase Production Ownership and Access

**Status:** BELUM DIISI
**Handover impact:** HANDOVER BLOCKER
**Category:** ACCOUNT OWNERSHIP, ACCESS / ROLE, RECOVERY, INFRASTRUCTURE DASHBOARD FACT

**Pertanyaan**
Siapa owner/backup owner project Supabase production, apa project reference yang benar, siapa maintainer yang diizinkan, dan bagaimana dashboard recovery dilakukan?

**Isi operator**
- Primary owner:
- Backup owner:
- Production project reference:
- New maintainer access granted: YA / TIDAK
- Authorized maintainers/roles:
- Recovery process location:
- Catatan:

**Digunakan oleh:** `11`, `15`, `17`.

## Cloudflare

### OP-004 - Cloudflare DNS Ownership and Recovery

**Status:** BELUM DIISI
**Handover impact:** HANDOVER BLOCKER
**Category:** ACCOUNT OWNERSHIP, ACCESS / ROLE, RECOVERY, INFRASTRUCTURE DASHBOARD FACT

**Pertanyaan**
Siapa owner/backup owner Cloudflare zone, siapa yang dapat mengubah DNS, dan bagaimana recovery zone dilakukan?

**Isi operator**
- Primary owner:
- Backup owner:
- Zone identifier/name:
- New maintainer DNS access: YA / TIDAK
- Canonical record/proxy mode: [diisi operator bila relevan]
- Recovery process location:
- Catatan:

**Digunakan oleh:** `11`, `15`, `17`.

## Vercel

### OP-005 - Vercel Preview and Legacy Compatibility Access

**Status:** BELUM DIISI
**Handover impact:** RECOMMENDED BEFORE HANDOVER
**Category:** ACCOUNT OWNERSHIP, ACCESS / ROLE, RECOVERY

**Pertanyaan**
Siapa owner/backup owner project Vercel, siapa yang dapat melihat Preview/compatibility deployment, dan bagaimana access dipulihkan?

**Isi operator**
- Primary owner:
- Backup owner:
- New maintainer Preview access: YA / TIDAK
- Recovery process location:
- Catatan:

**Digunakan oleh:** `11`, `15`, `17`.

## Domain / Registrar

### OP-006 - Domain Registrar Ownership and Renewal

**Status:** BELUM DIISI
**Handover impact:** HANDOVER BLOCKER
**Category:** ACCOUNT OWNERSHIP, RECOVERY, BILLING / RENEWAL

**Pertanyaan**
Siapa registrant/owner dan backup owner domain `azkahariz.com`, di mana registrar dikelola, dan siapa bertanggung jawab atas renewal/recovery?

**Isi operator**
- Registrar:
- Primary owner:
- Backup owner:
- Renewal responsible person:
- Recovery process location:
- Expiry/renewal notification recipient:
- Catatan:

**Digunakan oleh:** `17`.

## Billing / Renewal

### OP-007 - Production Service Billing and Renewal Matrix

**Status:** BELUM DIISI
**Handover impact:** HANDOVER BLOCKER
**Category:** BILLING / RENEWAL

**Pertanyaan**
Untuk Hostinger, Supabase, Cloudflare, Vercel, dan domain registrar, siapa menerima notifikasi billing/renewal, siapa bertanggung jawab memperbarui layanan, dan apa escalation jika pembayaran/akun berisiko expired?

**Isi operator**
| Provider | Billing/renewal owner | Notification recipient | Expiry escalation process |
| --- | --- | --- | --- |
| Hostinger | | | |
| Supabase | | | |
| Cloudflare | | | |
| Vercel | | | |
| Domain registrar | | | |

**Digunakan oleh:** `13`, `15`, `17`.

## Production Change Approval

### OP-008 - Production Mutation Approval Matrix

**Status:** BELUM DIISI
**Handover impact:** HANDOVER BLOCKER
**Category:** PRODUCTION APPROVAL

**Pertanyaan**
Siapa berwenang menyetujui migration Supabase production, manual data mutation, destructive maintenance, credential rotation, dan DNS change? Apakah approval/audit path berbeda untuk tiap tindakan?

**Isi operator**
| Action | Authorized approver | Required notification/audit path |
| --- | --- | --- |
| Supabase migration production | | |
| Manual production data mutation | | |
| Destructive maintenance | | |
| Credential rotation | | |
| DNS change | | |

**Digunakan oleh:** `13`, `15`, `17`.

## Credential Rotation

### OP-009 - Credential Rotation Ownership

**Status:** BELUM DIISI
**Handover impact:** HANDOVER BLOCKER
**Category:** CREDENTIAL ROTATION

**Pertanyaan**
Untuk Supabase secret/DB credentials, GitHub, Hostinger, Cloudflare, dan Vercel, siapa dapat rotate credential, siapa wajib diberi tahu, dan siapa memperbarui environment deployment? Jangan tulis nilainya.

**Isi operator**
| Credential area | Rotation owner | Notification | Environment/deployment updater |
| --- | --- | --- | --- |
| Supabase server/DB | | | |
| GitHub | | | |
| Hostinger | | | |
| Cloudflare | | | |
| Vercel | | | |

**Digunakan oleh:** `15`, `17`.

## Backup / Recovery

### OP-010 - Backup and Recovery Plan

**Status:** BELUM DIISI
**Handover impact:** HANDOVER BLOCKER
**Category:** BACKUP / RECOVERY

**Pertanyaan**
Mekanisme backup/recovery apa yang tersedia untuk source, database production, environment/secret, provider account, dan DNS/domain; siapa yang berwenang melakukan restore; dan kapan restore terakhir diuji?

**Isi operator**
| Area | Mechanism/process location | Restore authority | Last restore test | Retention/notes |
| --- | --- | --- | --- | --- |
| Source repository | | | | |
| Supabase database | | | | |
| Environment/secrets | | | | |
| Provider accounts | | | | |
| DNS/domain | | | | |

**Digunakan oleh:** `17`.

## Emergency / Escalation

### OP-012 - Emergency Contact and Escalation

**Status:** BELUM DIISI
**Handover impact:** HANDOVER BLOCKER
**Category:** CONTACT / ESCALATION

**Pertanyaan**
Siapa primary/backup contact untuk incident production, billing/recovery, dan escalation di luar jam kerja; serta di mana jalur contact resmi dicatat?

**Isi operator**
- Primary incident contact:
- Backup incident contact:
- Billing/recovery contact:
- Official escalation channel/location:
- Catatan:

**Digunakan oleh:** `11`, `13`, `17`.

## Non-Blocking Operational Details

`OP-011` dapat diisi setelah handover final bila critical access, recovery, billing, and approval matrix sudah lengkap. Detail dashboard yang berubah sering tidak boleh menggantikan runbook stable.

## Completion Status

| OP ID | Status | Handover impact |
| --- | --- | --- |
| OP-001 | BELUM DIISI | HANDOVER BLOCKER |
| OP-002 | BELUM DIISI | HANDOVER BLOCKER |
| OP-003 | BELUM DIISI | HANDOVER BLOCKER |
| OP-004 | BELUM DIISI | HANDOVER BLOCKER |
| OP-005 | BELUM DIISI | RECOMMENDED BEFORE HANDOVER |
| OP-006 | BELUM DIISI | HANDOVER BLOCKER |
| OP-007 | BELUM DIISI | HANDOVER BLOCKER |
| OP-008 | BELUM DIISI | HANDOVER BLOCKER |
| OP-009 | BELUM DIISI | HANDOVER BLOCKER |
| OP-010 | BELUM DIISI | HANDOVER BLOCKER |
| OP-011 | BELUM DIISI | RECOMMENDED BEFORE HANDOVER |
| OP-012 | BELUM DIISI | HANDOVER BLOCKER |
