# Struktur Proyek

```text
web/
|-- app/
|   |-- admin/                 Dashboard dan editor Super Admin
|   |-- api/admin/             Operasi Auth Admin server-only
|   |-- config/                Pilihan form
|   |-- hooks/                 Autosave, katalog produk, wilayah
|   |-- lib/                   Auth, QC, storage, export, Supabase
|   |-- types/                 Bentuk data TypeScript
|   |-- InventoryApp.tsx       Form station dan editor admin
|   `-- data.generated.json    Hasil CSV, jangan diedit
|-- docs/                      Panduan manusia
|-- scripts/master/            Parser dan sync Spreadsheet/CSV
|-- scripts/provision-*.mjs    Provisioning akun
|-- scripts/verify-*.mjs       Verification database nyata
|-- supabase/migrations/       Schema, RLS, RPC version-controlled
|-- tests/                     Kontrak otomatis
`-- README.md                  Landing page repository
```

## Lapisan sistem

Frontend:
`InventoryApp`, `SiteMetadataForm`, `AdminDashboard`, dan `globals.css`.

Auth:
Supabase SSR client, browser client, `proxy.ts`, `station_accounts`, dan
`super_admins`.

Master data:
Spreadsheet/CSV, `generate-data.ps1`, `data.generated.json`, `sync-master.mjs`,
serta table master Supabase.

Operational data:
`submissions.payload` JSONB, localStorage, version, dan soft lock.

Admin:
route `/admin`, admin RPC, API akun server-only, dan `admin_audit_log`.

Product QC:
`product_proposals`, `product_aliases`, overlay active `products`, similarity
deterministic, dan export rekonsiliasi Spreadsheet.

Deployment:
Next.js dibuild dan dihost Vercel. Supabase adalah layanan terpisah untuk Auth
dan database.

## Aliran data

```text
CSV -> generated fallback -----------+
                                      +-> katalog produk UI
Supabase active products + aliases --+

InventoryApp -> localStorage
             -> submissions JSONB/version/lock
             -> CSV/JSON existing
```

## Jika ingin mengubah...

- Form inventaris: `app/InventoryApp.tsx` dan types terkait.
- Pilihan form: `app/config/form-options.ts`.
- Master: Spreadsheet/CSV dan `scripts/master/`.
- Auth: `app/lib/auth.ts`, Supabase helpers, login, dan migration baru.
- Autosave/lock: `app/hooks/useServerDraft.ts` dan RPC submission.
- Admin UI: `app/admin/`; permission tetap harus ada di migration/RPC.
- Product QC: `app/lib/product-qc.ts`, `useProductCatalog`, admin QC, dan RPC.
- Export: pertahankan header/format di `InventoryApp` dan update tes.

Jangan mencampur refactor luas dengan perubahan perilaku. Setiap perubahan
schema dibuat sebagai migration baru.
