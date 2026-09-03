# Operator Input Worksheet

## Cara Menggunakan

Worksheet ini adalah source canonical untuk fakta operasional yang tidak dapat dibuktikan dari repository. Isi bersama owner/operator sebelum sign-off handover. Status memakai `BELUM DIISI`, `SUDAH DIISI`, `SUDAH DIISI SEBAGIAN`, atau `TIDAK BERLAKU`; sub-item yang belum diketahui ditulis `BELUM DIKONFIRMASI`.

**Jangan memasukkan password, token, API key, private key, recovery code, nilai secret, full DB connection string, atau nomor kartu pembayaran ke file ini.** Catat pemilik, role, lokasi proses, dan jalur recovery saja.

## Critical Handover Blockers

**Developer Knowledge Transfer** dapat selesai saat dokumentasi, latihan, dan batas access developer cukup. **Full Operational Ownership Transfer** bukan target saat ini dan belum selesai selama risiko continuity owner masih ada.

`OP-001`, `OP-002`, `OP-003`, `OP-004`, `OP-006`, `OP-010`, dan `OP-012` menyimpan blocker continuity. `OP-005` dan `OP-011` direkomendasikan sebelum handover. `OP-007` tidak berlaku untuk scope ini; `OP-008` dan `OP-009` sudah didefinisikan.

## GitHub

### OP-001 - GitHub Ownership, Access, and Recovery

**Status:** SUDAH DIISI SEBAGIAN
**Handover impact:** HANDOVER BLOCKER
**Category:** ACCOUNT OWNERSHIP, ACCESS / ROLE, RECOVERY

**Pertanyaan**
Siapa owner/admin repository, backup maintainer, dan siapa yang dapat memulihkan access tanpa membagikan credential?

**Isi operator**
- Repository: `azkahariz/web` (personal repository, bukan Organization)
- Primary owner: Azka Hariz
- Primary maintainers: Azka Hariz dan developer yang diundang sebagai Collaborator
- Effective developer access: read/write development access untuk clone, feature branch, push, dan Pull Request
- Backup owner: NONE
- Owner 2FA: ACTIVE
- Recovery process location: UNKNOWN / NOT YET CONFIRMED
- Recovery email/codes/passkey/security key: NOT CONFIRMED
- Continuity note: tidak ada backup owner dan recovery path belum terkonfirmasi

**Digunakan oleh:** `11`, `13`, `15`, `17`.

## Hostinger

### OP-002 - Hostinger Production Ownership and Access

**Status:** SUDAH DIISI
**Handover impact:** HANDOVER BLOCKER
**Category:** ACCOUNT OWNERSHIP, ACCESS / ROLE, RECOVERY

**Pertanyaan**
Siapa owner dan backup owner Hostinger untuk runtime canonical, siapa dapat deploy/edit environment, dan bagaimana recovery account dilakukan?

**Isi operator**
- Primary owner: Azka Hariz (personal account)
- Current access: Azka Hariz only
- Developer production access: NONE; developer memelihara source dan escalation ke operator
- Backup owner: NONE
- New maintainer deploy access: TIDAK BERLAKU untuk model saat ini
- Environment editor access: Azka Hariz only
- Emergency redeploy, environment, and deployment-failure responsibility: Azka Hariz only
- Owner 2FA: NOT ACTIVE
- Recovery process location: NONE / NOT CONFIRMED
- Continuity note: single-account production operator tanpa backup, 2FA, atau recovery terverifikasi

**Digunakan oleh:** `11`, `15`, `17`.

### OP-011 - Deployment Logs, Auto-Deploy, and Observability

**Status:** SUDAH DIISI
**Handover impact:** RECOMMENDED BEFORE HANDOVER
**Category:** INFRASTRUCTURE DASHBOARD FACT, CONTACT / ESCALATION

**Pertanyaan**
Di mana deployment log Hostinger dibuka, apakah branch `main` auto-deploy, dan di mana log/alerting Hostinger, Vercel, dan Supabase dilihat?

**Isi operator**
- Current deployment/production check: Azka Hariz biasanya memeriksa Hostinger Dashboard
- Auto-deploy `main`: BELUM DIKONFIRMASI
- Vercel/Supabase log location: diperiksa bila incident mengarah ke layer tersebut; tidak ada rutinitas formal
- Formal scheduled log review, centralized observability, automatic 5xx/uptime/deployment alert, and monitoring rotation: NOT YET ESTABLISHED
- Alerting/on-call: lihat OP-012
- Log retention information: BELUM DIKONFIRMASI

**Digunakan oleh:** `11`, `13`, `14`.

## Supabase

### OP-003 - Supabase Production Ownership and Access

**Status:** SUDAH DIISI SEBAGIAN
**Handover impact:** HANDOVER BLOCKER
**Category:** ACCOUNT OWNERSHIP, ACCESS / ROLE, RECOVERY, INFRASTRUCTURE DASHBOARD FACT

**Pertanyaan**
Siapa owner/backup owner project Supabase production, apa project reference yang benar, siapa maintainer yang diizinkan, dan bagaimana dashboard recovery dilakukan?

**Isi operator**
- Primary owner: Azka Hariz
- Organization members: Azka Hariz (Owner); two members with role Developer
- Developer members: noviantmdwi@gmail.com; simonsiagian0301@gmail.com
- Access scope observed: organization-wide
- Backup Owner: NONE / NOT CONFIRMED
- Owner 2FA and recovery process: UNKNOWN / NOT YET CONFIRMED
- Permission note: role label Owner/Developer tidak sendiri membuktikan capability mutation tertentu; lihat OP-008
- Production project reference: sudah dicatat pada konfigurasi/operator tooling bila diperlukan, tetapi tidak diduplikasi di worksheet ini

**Digunakan oleh:** `11`, `15`, `17`.

## Cloudflare

### OP-004 - Cloudflare DNS Ownership and Recovery

**Status:** SUDAH DIISI
**Handover impact:** HANDOVER BLOCKER
**Category:** ACCOUNT OWNERSHIP, ACCESS / ROLE, RECOVERY, INFRASTRUCTURE DASHBOARD FACT

**Pertanyaan**
Siapa owner/backup owner Cloudflare zone, siapa yang dapat mengubah DNS, dan bagaimana recovery zone dilakukan?

**Isi operator**
- Primary owner: Azka Hariz (personal account)
- DNS responsibility: Azka Hariz
- Current access/developer access: Azka Hariz only / NONE
- Backup owner: NONE
- Owner 2FA: NOT ACTIVE
- Recovery process location: NONE
- Canonical record/proxy mode: BELUM DIKONFIRMASI
- Continuity note: single-person DNS ownership without backup/recovery path

**Digunakan oleh:** `11`, `15`, `17`.

## Vercel

### OP-005 - Vercel Preview and Legacy Compatibility Access

**Status:** SUDAH DIISI
**Handover impact:** RECOMMENDED BEFORE HANDOVER
**Category:** ACCOUNT OWNERSHIP, ACCESS / ROLE, RECOVERY

**Pertanyaan**
Siapa owner/backup owner project Vercel, siapa yang dapat melihat Preview/compatibility deployment, dan bagaimana access dipulihkan?

**Isi operator**
- Primary owner: Azka Hariz
- Current access/developer access: Azka Hariz only / NONE
- Backup owner: NONE
- New maintainer Preview access: TIDAK BERLAKU untuk ordinary source development; Preview URL dari workflow PR dapat digunakan bila tersedia
- Recovery process location: BELUM DIKONFIRMASI
- Role: PR/feature Preview dan compatibility `aloptama-collect.vercel.app`; bukan runtime canonical

**Digunakan oleh:** `11`, `15`, `17`.

## Domain / Registrar

### OP-006 - Domain Registrar Ownership and Continuity

**Status:** SUDAH DIISI
**Handover impact:** HANDOVER BLOCKER
**Category:** ACCOUNT OWNERSHIP, RECOVERY

**Pertanyaan**
Siapa registrant/owner dan backup owner domain `azkahariz.com`, di mana registrar dikelola, dan bagaimana access/recovery domain dilakukan?

**Isi operator**
- Registrar: Hostinger
- Primary owner: Azka Hariz (personal account)
- Current registrar access/developer access: Azka Hariz only / NONE
- Backup owner: NONE
- DNS managed separately: Cloudflare
- Recovery process location: BELUM DIKONFIRMASI
- Scope note: billing, auto-renew, notification, and payment details are intentionally out of scope for developer handover

**Digunakan oleh:** `17`.

## Billing / Renewal

### OP-007 - Production Service Billing and Renewal Matrix

**Status:** TIDAK BERLAKU
**Handover impact:** OUT OF SCOPE
**Category:** BILLING / RENEWAL

**Keputusan operator**
Billing, payment, renewal ownership, auto-renew, dan payment details sengaja dikeluarkan dari scope technical developer handover. Tidak ada pertanyaan billing yang perlu diisi dalam package ini.

**Digunakan oleh:** `13`, `15`, `17`.

## Production Change Approval

### OP-008 - Production Mutation Approval Matrix

**Status:** SUDAH DIISI
**Handover impact:** CAN BE COMPLETED LATER
**Category:** PRODUCTION APPROVAL

**Pertanyaan**
Siapa berwenang menyetujui migration Supabase production, manual data mutation, destructive maintenance, credential rotation, dan DNS change? Apakah approval/audit path berbeda untuk tiap tindakan?

**Isi operator**
| Action | Authorized approver | Required notification/audit path |
| --- | --- | --- |
| `SELECT` / read-only SQL/data analysis | Developer boleh | Audit target sesuai prosedur |
| Ordinary limited row `INSERT`, `UPDATE`, `DELETE` | Developer boleh | Hanya koreksi row-level terbatas; tidak mencakup bulk/cascade/dependency-heavy cleanup |
| Table/schema/migration | Azka Hariz only | Owner-only |
| Apply migration production | Azka Hariz only | Owner-only |
| RPC/function, RLS/policy, Auth settings | Azka Hariz only | Owner-only |
| Hard delete/destructive cleanup | Azka Hariz only | Owner-only |
| Credential rotation/DNS change | Azka Hariz only | Owner-only |

**Digunakan oleh:** `13`, `15`, `17`.

## Credential Rotation

### OP-009 - Credential Rotation Ownership

**Status:** SUDAH DIISI
**Handover impact:** CAN BE COMPLETED LATER
**Category:** CREDENTIAL ROTATION

**Pertanyaan**
Untuk Supabase secret/DB credentials, GitHub, Hostinger, Cloudflare, dan Vercel, siapa dapat rotate credential, siapa wajib diberi tahu, dan siapa memperbarui environment deployment? Jangan tulis nilainya.

**Isi operator**
| Credential area | Rotation owner | Notification | Environment/deployment updater |
| --- | --- | --- | --- |
| Supabase server/DB | Azka Hariz | Escalate suspected compromise to Azka Hariz | Azka Hariz |
| GitHub | Azka Hariz | Escalate suspected compromise to Azka Hariz | Azka Hariz |
| Hostinger | Azka Hariz | Escalate suspected compromise to Azka Hariz | Azka Hariz |
| Cloudflare | Azka Hariz | Escalate suspected compromise to Azka Hariz | Azka Hariz |
| Vercel | Azka Hariz | Escalate suspected compromise to Azka Hariz | Azka Hariz |

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
| Source repository | GitHub stores source; not a DB/environment/account recovery strategy | BELUM DITETAPKAN | NOT YET DOCUMENTED | Formal plan needed |
| Supabase database | UNKNOWN / NOT YET DOCUMENTED | BELUM DITETAPKAN | NOT YET DOCUMENTED | Audit actual provider capability first |
| Environment/secrets | NOT YET DOCUMENTED | BELUM DITETAPKAN | NOT YET DOCUMENTED | Formal plan needed |
| Provider accounts | Per-account continuity listed in OP-001 through OP-006 | Azka Hariz currently | NOT YET DOCUMENTED | No formal recovery plan |
| DNS/domain | Cloudflare/registrar continuity listed in OP-004/OP-006 | Azka Hariz currently | NOT YET DOCUMENTED | No formal recovery plan |

**Digunakan oleh:** `17`.

## Emergency / Escalation

### OP-012 - Emergency Contact and Escalation

**Status:** SUDAH DIISI
**Handover impact:** HANDOVER BLOCKER
**Category:** CONTACT / ESCALATION

**Pertanyaan**
Siapa primary/backup contact untuk incident production, recovery, dan escalation di luar jam kerja; serta di mana jalur contact resmi dicatat?

**Isi operator**
- Primary incident contact: Azka Hariz
- Backup incident contact: None
- Scope: application/source, Hostinger/runtime, Supabase/database/RPC, Auth, Cloudflare/DNS, registrar, credential, migration, destructive maintenance, backup/recovery
- Developer normal workflow: investigate code, feature branch, implementation, tests, and Pull Request
- Production authority: see OP-008
- Official escalation channel/location: BELUM DIKONFIRMASI
- Continuity note: no official backup escalation contact

**Digunakan oleh:** `11`, `13`, `17`.

## Non-Blocking Operational Details

`OP-005` dan `OP-011` adalah rekomendasi. Detail dashboard yang berubah tidak boleh menggantikan runbook stable. Billing (`OP-007`) sengaja out of scope untuk developer handover ini.

## Completion Status

| OP ID | Status | Handover impact |
| --- | --- | --- |
| OP-001 | SUDAH DIISI SEBAGIAN | HANDOVER BLOCKER |
| OP-002 | SUDAH DIISI | HANDOVER BLOCKER |
| OP-003 | SUDAH DIISI SEBAGIAN | HANDOVER BLOCKER |
| OP-004 | SUDAH DIISI | HANDOVER BLOCKER |
| OP-005 | SUDAH DIISI | RECOMMENDED BEFORE HANDOVER |
| OP-006 | SUDAH DIISI | HANDOVER BLOCKER |
| OP-007 | TIDAK BERLAKU | OUT OF SCOPE |
| OP-008 | SUDAH DIISI | CAN BE COMPLETED LATER |
| OP-009 | SUDAH DIISI | CAN BE COMPLETED LATER |
| OP-010 | BELUM DIISI | HANDOVER BLOCKER |
| OP-011 | SUDAH DIISI | RECOMMENDED BEFORE HANDOVER |
| OP-012 | SUDAH DIISI | HANDOVER BLOCKER |
