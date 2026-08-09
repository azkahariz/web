# Checklist Publikasi

## Database dan test

- [ ] Migration baru sudah di-review dan applied ke project Supabase yang benar.
- [ ] `npm.cmd run check` PASS.
- [ ] `npm.cmd run verify:auth-autosave` PASS dan fixture rollback.
- [ ] `npm.cmd run verify:admin-qc` PASS dan fixture rollback.
- [ ] `npm.cmd run verify:admin-api` PASS dan fixture dibersihkan.
- [ ] Station isolation, version conflict, lock lima menit, dan local logout PASS.
- [ ] Approve, merge, bulk merge, reject, alias, audit, dan reconciliation PASS.
- [ ] CSV/JSON existing tidak berubah format.

## Environment Vercel

- [ ] `NEXT_PUBLIC_SUPABASE_URL` tersedia untuk Preview dan Production.
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` tersedia.
- [ ] `SUPABASE_SECRET_KEY` tersedia server-side dan bukan `NEXT_PUBLIC_`.
- [ ] `SUPABASE_DB_URL` tidak ditambahkan ke Vercel tanpa kebutuhan khusus.

## Smoke Preview

Station User:

- [ ] Login, browse, edit, save, finish, logout lokal.
- [ ] Read-only dan Coba lagi memperoleh lock terbaru.
- [ ] Proposal produk, suggestion, status Pending, dan export.

Super Admin:

- [ ] Login diarahkan ke `/admin`.
- [ ] Seluruh tab dashboard usable desktop/mobile.
- [ ] Buka submission tanpa auto-lock; edit/force takeover memakai confirmation.
- [ ] Force release, account action, QC, export Spreadsheet, dan audit bekerja.
- [ ] Password sementara hanya tampil setelah aksi berhasil.

## Git dan Production

- [ ] `git status` hanya berisi file yang dimaksud.
- [ ] Tidak ada `.env.local`, `private-output`, credential, log, atau archive.
- [ ] Commit feature branch sudah push dan Vercel Preview berstatus Ready.
- [ ] Preview diuji manual.
- [ ] Pull request/merge ke `main` dilakukan setelah persetujuan.
- [ ] Deployment Production berstatus Ready.
- [ ] Production smoke test dan pengecekan audit selesai.
