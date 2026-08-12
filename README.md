# Aloptama Collect

Aloptama Collect adalah aplikasi pengisian metadata Site dan inventaris
perangkat Aloptama BMKG. Station User mengisi Site stasiunnya, sedangkan Super
Admin mengelola akun, submission, lock, dan QC produk.

Production: https://aloptama-collect.vercel.app

Hosting resmi: **Vercel**. ChatGPT Sites pernah dipakai pada tahap awal
pengembangan, tetapi sudah dihentikan dan bukan target deployment repository.

Status dokumentasi: **Production / Pilot**. Aplikasi telah digunakan untuk
data nyata. Jangan mengubah data, UUID, schema, atau secret tanpa prosedur
yang benar.

Arsitektur singkat:

```text
Browser -> Next.js di Vercel -> Supabase Auth + PostgreSQL
       -> localStorage sebagai cadangan draf
Spreadsheet/CSV -> master data -> aplikasi dan Supabase
```

Mulai dari [docs/MULAI-DI-SINI.md](docs/MULAI-DI-SINI.md) untuk menentukan
panduan sesuai peran.

## Quick Start Developer

```powershell
cd Z:\collect-irm-data\web
npm.cmd install
npm.cmd run dev
npm.cmd run check
```

Jangan commit `.env.local`, `private-output/`, credential CSV, atau nilai
secret. Panduan pengembangan dan prosedur production ada di
[docs/PANDUAN-PENGEMBANG.md](docs/PANDUAN-PENGEMBANG.md) dan
[docs/SOP-PERUBAHAN-PRODUCTION.md](docs/SOP-PERUBAHAN-PRODUCTION.md).
