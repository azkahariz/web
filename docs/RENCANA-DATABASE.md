# Status Database

Dokumen ini dahulu berisi rencana sebelum database aktif. Implementasi tersebut
sekarang sudah berjalan di Supabase.

## Yang sudah aktif

- master data ber-UUID dari Spreadsheet/CSV;
- Supabase Auth SSR;
- akun per stasiun dan RLS antarstasiun;
- submission JSONB dengan autosave localStorage + server;
- Browse/Edit Mode, soft lock lima menit, takeover, dan version conflict;
- Super Admin terpisah, dashboard, account management, force lock, dan audit;
- product proposal, aliases, approve, merge, bulk merge, reject;
- katalog live Supabase dengan generated fallback;
- rekonsiliasi produk QC kembali ke Spreadsheet.

## Batas desain saat ini

Payload submission tetap JSONB agar draft lama kompatibel. Metadata site,
inventory, dan unit belum dipecah menjadi banyak table relational. Perubahan ini
tidak diperlukan selama kebutuhan query operasional masih dipenuhi dashboard
dan export.

Spreadsheet tetap source of truth master. Supabase menjadi sumber operasional
untuk login, submission, lock, QC, dan audit. Tidak ada hard delete master.

Lihat [MULAI-DI-SINI.md](MULAI-DI-SINI.md) dan
[STRUKTUR-PROYEK.md](STRUKTUR-PROYEK.md) untuk arsitektur saat ini.
