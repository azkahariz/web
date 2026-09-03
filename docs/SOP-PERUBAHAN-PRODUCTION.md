# SOP Perubahan Production

> **Status: Current supporting documentation**
> Runbook canonical ada di [Deployment dan Infrastruktur](./11-DEPLOYMENT-DAN-INFRASTRUKTUR.md),
> [Runbook Production](./13-RUNBOOK-PRODUCTION.md), dan
> [Security dan Secrets](./15-SECURITY-DAN-SECRETS.md).

Terakhir diperbarui: 3 September 2026. Aplikasi telah menyimpan data nyata.

Production canonical adalah https://aloptama-collect.azkahariz.com pada
Hostinger Managed Next.js. Vercel dipakai untuk Preview dan hostname legacy yang
memberikan redirect 307; bukan runtime production canonical.

## Sebelum edit

1. Pastikan branch dan folder project benar, lalu periksa `git status`.
2. Pahami scope dan data contract yang terpengaruh. Jangan menebak schema.
3. Audit consumer sebelum menghapus field, mengubah mapping, atau format export.
4. Kerjakan perubahan kecil dalam branch terpisah.

## Dilarang

- Mengganti UUID existing, hard delete master, mass delete, atau rewrite
  submission tanpa kebutuhan dan rencana pemulihan.
- Mengedit migration yang sudah diterapkan, reset database, atau bypass RLS.
- Mengekspos secret, memasukkan secret ke `NEXT_PUBLIC_*`, atau commit
  `.env.local`, `private-output`, credential CSV, log, maupun archive.
- Push langsung ke `main` tanpa test dan Preview.

## Jika mengubah database

Buat migration baru yang backward-compatible. Review RLS, RPC, dan data lama;
uji fixture serta verification yang relevan. Migration yang sudah diterapkan
tidak boleh diedit; perubahan berikutnya memakai migration baru. Jangan apply
migration hanya untuk menyelesaikan masalah yang dapat ditangani code/config.

## Jika mengubah master

Supabase production adalah sumber master utama. Gunakan Super Admin untuk
perubahan rutin, pertahankan UUID, dan gunakan `active` alih-alih delete.
CSV legacy hanya boleh diimpor secara eksplisit untuk recovery yang disetujui.

```powershell
npm.cmd run validate:master
npm.cmd run sync:master:legacy:remote
```

## Jika mengubah form atau ekspor

Pertahankan kompatibilitas submission lama, localStorage, CSV, dan JSON. Jangan
menambah input tampilan tanpa memastikan payload, export, dan test yang relevan.

## Kategori release

- **Application-only:** code/docs/config application tanpa migration; lakukan
  verification, Preview bila relevan, PR, merge, dan production smoke.
- **Dengan migration backward-compatible:** tambah migration baru, uji lokal,
  review compatibility, `db push --linked --dry-run`, lalu apply hanya setelah
  otorisasi production eksplisit; verifikasi DB/RPC sebelum app smoke.
- **Koreksi data production:** analisis scope dan dampak dahulu. Developer hanya
  boleh melakukan DML row-level terbatas yang telah disetujui; schema, bulk,
  cascade, dan perubahan semantik bisnis adalah owner-only.
- **Maintenance destructive/high-risk:** hard delete, cleanup dependency-heavy,
  restore, credential, DNS, schema/RPC/RLS/Auth harus dieskalasikan ke Azka Hariz.

## Sebelum production

1. Jalankan `npm.cmd run check`.
2. Jalankan verification yang relevan bila Auth, lock, QC, Admin, atau database
   berubah.
3. Push feature branch dan lakukan Preview/smoke test bila scope memerlukannya.
4. Review diff dan secret, lalu merge PR ke `main` setelah disetujui. Verifikasi
   deployment Hostinger dan smoke test production.

## Setelah production

Lakukan smoke test login, browse, edit, save, finish, download, dan Admin yang
terpengaruh. Cek error dan audit. Hentikan penambahan fitur bila ada masalah
production sampai penyebabnya jelas.

## Backup, rollback, dan eskalasi

Supabase production menggunakan scheduled physical backup harian dengan retensi
7 hari pada Pro. Production restore tersedia dan Restore to New Project tersedia
sebagai Beta; PITR tidak aktif dan recovery exercise belum dilakukan. Backup
bukan alasan untuk melakukan mutation destruktif secara santai.

Jika ada penghapusan row tidak disengaja: hentikan mutation, catat scope/waktu,
eskalasikan, lalu nilai koreksi terarah sebelum mempertimbangkan restore. Untuk
masalah database, utamakan forward-fix migration. Rollback aplikasi hanya boleh
dipakai bila versi sebelumnya kompatibel dengan database saat ini. Azka Hariz
memegang otoritas migration/schema/RPC/RLS/Auth, credential, restore,
maintenance destructive, Hostinger, dan DNS.

← [Panduan Pengembang](PANDUAN-PENGEMBANG.md) | → [Troubleshooting](TROUBLESHOOTING.md)
