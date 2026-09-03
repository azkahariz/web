# Changelog

> [!NOTE]
> **Status: HISTORICAL**
>
> Dokumen ini merangkum milestone pada periode tertentu, bukan behavior runtime
> saat ini. Untuk implementasi current, mulai dari
> [Mulai di Sini](./00-MULAI-DI-SINI.md) dan
> [History dan Legacy](./16-HISTORY-DAN-LEGACY.md).

Tanggal mengikuti Git history. Ini ringkasan milestone, bukan daftar seluruh
commit.

## 2026-08-12

- Domain `Seismograph InaTEWS` dipetakan ke Geofisika.

## 2026-08-11

- Mapping AWOS Kategori III Vaisala dan penyempurnaan subtype radar.
- Bulk download Admin serta pembatasan subtype AWOS per Site.

## 2026-08-10

- Super Admin, Product QC, audit, dan pengelolaan akun diperkenalkan.
- Perbaikan site count, pagination master Site, dan UX akun/export.
- Lifecycle lock diperbaiki agar retry memperoleh kondisi server terbaru.

## 2026-08-09

- Station Auth, autosave server, lock, version conflict, dan local logout.
- Sinkronisasi master data Supabase serta metadata Aloptama.
- Field/Domain dan penambahan tipe Site klimatologi.

Untuk prosedur perubahan berikutnya, baca [SOP Perubahan Production](SOP-PERUBAHAN-PRODUCTION.md).
