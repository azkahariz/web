# Aloptama Collect

Aloptama Collect adalah aplikasi untuk mengelola metadata Site dan inventaris
perangkat Aloptama BMKG. Station User mengisi data Site sesuai stasiunnya,
sedangkan Super Admin mengelola akun, submission, lock, dan QC produk.

Production: https://aloptama-collect.azkahariz.com

Runtime production canonical: **Hostinger Managed Next.js**. Vercel dipakai
untuk Preview branch dan hostname legacy
`https://aloptama-collect.vercel.app`, yang mengarahkan pengguna dengan 307 ke
URL canonical.

Status dokumentasi: **Production / Pilot**. Aplikasi telah digunakan untuk
data nyata. Jangan mengubah data, UUID, schema, atau secret tanpa prosedur
yang benar.

Arsitektur singkat:

```text
Browser -> Next.js di Hostinger -> Supabase Auth + PostgreSQL
       -> localStorage sebagai cadangan draf browser
Supabase -> runtime master, Submission, Product, dan audit
```

Supabase adalah runtime source of truth. CSV, Spreadsheet, dan
`app/data.generated.json` hanya artefak legacy untuk import, recovery,
provenance, atau test; bukan master runtime.

## Dokumentasi Developer

Mulai dari [docs/00-MULAI-DI-SINI.md](docs/00-MULAI-DI-SINI.md). Untuk tugas
spesifik, gunakan [Setup Development](docs/03-SETUP-DEVELOPMENT.md),
[Deployment](docs/11-DEPLOYMENT-DAN-INFRASTRUKTUR.md),
[Runbook Production](docs/13-RUNBOOK-PRODUCTION.md), dan
[Handover Checklist](docs/17-HANDOVER-CHECKLIST.md).

## Quick Start Developer

```powershell
cd Z:\collect-irm-data\web
npm.cmd install
npm.cmd run dev
npm.cmd run check
```

Jangan commit `.env.local`, `private-output/`, credential CSV, atau nilai
secret. Panduan praktis pendukung tersedia di
[docs/PANDUAN-PENGEMBANG.md](docs/PANDUAN-PENGEMBANG.md) dan
[docs/SOP-PERUBAHAN-PRODUCTION.md](docs/SOP-PERUBAHAN-PRODUCTION.md).

## Master data dan verification

```powershell
npm.cmd run validate:master
npm.cmd run verify:warehouse
npm.cmd run check
npm.cmd run build
```

Supabase production adalah master authoritative. CSV dan
`app/data.generated.json` adalah legacy/import/reference artifacts. Untuk
membaca kembali master Supabase ke CSV tanpa write:

```powershell
npm.cmd run export:master:csv
```

Command export memakai database lokal secara default. Database remote hanya
digunakan bila `SUPABASE_DB_URL` diberikan secara eksplisit.
