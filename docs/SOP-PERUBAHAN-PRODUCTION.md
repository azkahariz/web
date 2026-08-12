# SOP Perubahan Production

Terakhir diperbarui: 12 Agustus 2026. Aplikasi telah menyimpan data nyata.

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
siapkan rollback plan; uji fixture serta verification yang relevan. Jangan apply
migration hanya untuk menyelesaikan masalah yang dapat ditangani code/config.

## Jika mengubah master

Spreadsheet adalah sumber utama. Pertahankan UUID, ubah `active` alih-alih
delete, jalankan validasi dahulu, kemudian jalankan sync dengan hati-hati.

```powershell
npm.cmd run validate:master
npm.cmd run sync:master
```

## Jika mengubah form atau ekspor

Pertahankan kompatibilitas submission lama, localStorage, CSV, dan JSON. Jangan
menambah input tampilan tanpa memastikan payload, export, dan test yang relevan.

## Sebelum production

1. Jalankan `npm.cmd run check`.
2. Jalankan verification yang relevan bila Auth, lock, QC, Admin, atau database
   berubah.
3. Push branch untuk Vercel Preview dan lakukan smoke test manual.
4. Review diff dan secret, lalu merge ke `main` setelah disetujui.

## Setelah production

Lakukan smoke test login, browse, edit, save, finish, download, dan Admin yang
terpengaruh. Cek error dan audit. Hentikan penambahan fitur bila ada masalah
production sampai penyebabnya jelas.

← [Panduan Pengembang](PANDUAN-PENGEMBANG.md) | → [Troubleshooting](TROUBLESHOOTING.md)
