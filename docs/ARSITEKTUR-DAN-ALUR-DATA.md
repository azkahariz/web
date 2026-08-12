# Arsitektur dan Alur Data

Terakhir diperbarui: 12 Agustus 2026.

```text
Spreadsheet / CSV
        |
        +--> generate-data.ps1 --> app/data.generated.json
        |
        `--> sync-master.mjs --> Supabase PostgreSQL

Browser
  |-- Next.js / Vercel
  |-- localStorage (cadangan draf perangkat)
  `-- Supabase Auth + RLS + RPC --> submissions / lock / QC / audit
```

## Master data dan data pengisian

**Master data** menentukan pilihan yang tersedia: stasiun, Site, tipe,
subtipe, profil barang, barang, dan produk. Sumber utamanya Spreadsheet/CSV.

**Data pengisian** adalah submission per Station, Site, dan Subtipe. Submission
menyimpan payload JSON, version, operator, dan informasi lock di Supabase.

## Pengisian

```text
Browse -> baca submission/default -> Edit eksplisit -> acquire lock
      -> localStorage + autosave -> final save -> release lock -> Browse
```

Browse, Buka Admin, dan Unduh adalah read-only. Hanya Edit eksplisit yang boleh
membuat submission, meminta lock, atau menaikkan version. Autosave memakai draf
browser sebagai cadangan dan server sebagai data bersama. Lock berakhir setelah
lima menit tanpa aktivitas. Version mencegah payload lama menimpa data server
yang lebih baru.

## Akses dan keamanan

Supabase Auth menangani session. RLS membatasi Station User ke stasiunnya;
Super Admin memiliki operasi terkontrol melalui RPC dan route server. Secret
tidak masuk browser. `SUPABASE_SECRET_KEY` hanya digunakan server/script
tepercaya, sedangkan `NEXT_PUBLIC_*` hanya untuk konfigurasi publik.

## QC dan ekspor

Usulan produk disimpan sebagai proposal terpisah. QC dapat approve produk baru,
merge ke canonical product, atau reject. CSV/JSON Station dan Admin memakai
serializer bersama. Bulk export membuat ZIP di browser dari data baca saja.

Lihat [Master Data](MASTER-DATA.md), [Panduan QC Produk](PANDUAN-QC-PRODUK.md),
dan [Panduan Pengembang](PANDUAN-PENGEMBANG.md).
