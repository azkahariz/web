# Auth, Autosave, dan Lock Supabase

## Login dan role

Supabase Auth menyimpan sesi login. Username diubah menjadi email internal oleh
aplikasi; pengguna tetap hanya melihat Username dan Password.

- `station_accounts` menghubungkan Auth user ke tepat satu stasiun.
- `super_admins` adalah identitas terpisah dan tidak mempunyai station palsu.
- `app/page.tsx` memilih Station UI atau mengarahkan Super Admin ke `/admin`.
- RLS dan RPC menegakkan permission di database, bukan hanya di tombol UI.

Logout memakai `signOut({ scope: "local" })`, sehingga hanya session browser
saat ini yang keluar. Lock session dilepas best-effort sebelum signOut.

## Browse dan Edit Mode

Memilih Site/Subtipe hanya memanggil RPC baca. Lock baru diperoleh setelah klik
**Edit Data**. `session_id` UUID disimpan per tab di `sessionStorage`.

```text
Browse -> Edit Data -> open/acquire lock -> Edit Mode
     -> autosave/version -> Selesai Mengedit -> final save -> release
```

Autosave:

- localStorage ditulis segera selama Edit Mode;
- server save memakai debounce lima detik;
- max wait sekitar 18 detik;
- payload identik tidak ditulis ulang;
- aktivitas form menyentuh lock paling sering setiap 45 detik.

Lock habis setelah lima menit tanpa aktivitas. Takeover Station User hanya
berhasil setelah expiry. Super Admin mempunyai force takeover/release terpisah,
wajib confirmation, dan masuk audit.

`Coba lagi` selalu memanggil acquire terbaru. State read-only lama tidak boleh
menghentikan RPC. `Muat versi terbaru` hanya mengganti payload/version dan tidak
menjadi syarat acquire.

## Version conflict

Setiap submission memiliki integer `version`. Save membawa expected version.
Jika berbeda, server mengembalikan `version_conflict`; browser tidak menimpa
payload server diam-diam. CSV/JSON tetap dapat memakai data browser, tetapi UI
memberi peringatan server belum sinkron.

## Environment

- Client/Vercel: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Server Vercel dan script provisioning: `SUPABASE_SECRET_KEY`.
- Workflow lokal database: `SUPABASE_DB_URL`.

Secret tidak boleh masuk bundle client, Git, atau prefix `NEXT_PUBLIC_`.

## Verification

```powershell
npm.cmd run check
npm.cmd run verify:auth-autosave
npm.cmd run verify:admin-qc
```

Verification database memakai transaction dan selalu rollback fixture.
