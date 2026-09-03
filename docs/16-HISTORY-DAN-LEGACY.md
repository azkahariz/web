# History dan Legacy

## Status Dokumen

- Baseline source: `63288a1ca27bb60004204a5b73c67147b033d73e`
- Target pembaca: Developer/Operator Aloptama Collect
- Source of truth: source code, configuration, tests, migrations, dan fakta operator yang secara eksplisit ditandai

## Cara Membaca Dokumen Ini

Dokumen ini bukan changelog. Gunakan label berikut: **CURRENT** untuk behavior aktif, **COMPATIBILITY** untuk mekanisme lama yang masih didukung, dan **HISTORICAL** untuk alasan desain saat ini. History tidak pernah mengalahkan source current.

## Current vs Compatibility vs Historical

| Kelas | Makna | Aturan developer |
| --- | --- | --- |
| CURRENT | kontrak runtime sekarang | ubah hanya dengan test/migration yang sesuai |
| COMPATIBILITY | representasi lama masih harus dapat dibaca | jangan hapus tanpa audit referensi |
| HISTORICAL | pelajaran dari desain sebelumnya | jangan hidupkan kembali sebagai workflow |

## Evolusi Source of Truth

**CURRENT:** Supabase adalah source of truth runtime untuk master dan business data. **HISTORICAL:** CSV/spreadsheet dan `data.generated.json` pernah mendukung import, recovery, atau provenance. Keberadaan artefak itu bukan izin untuk menjadikannya mutable runtime authority.

## Spreadsheet Legacy

Field Product seperti `source_origin` dan `spreadsheet_synced` menyimpan provenance legacy. Mereka tidak mengharuskan developer menyinkronkan master runtime kembali ke spreadsheet. Gunakan tooling export/import hanya dengan kontrak dan target yang diaudit.

## Supabase-Native Runtime

**CURRENT:** Station runtime master, Site, Subtipe, Profile, Submission, Product, dan authorization dibaca dari Supabase/RPC. Jangan membangun source of truth kedua di browser, CSV, atau memory process.

## Evolusi Station Category

**CURRENT:** `station_categories` bersama `stations.station_category_id` adalah identity authoritative. Parsing nama Station adalah anti-pattern karena nama bersifat label, bukan relasi stabil. Migration kategori memetakan UUID eksplisit dan test melarang heuristic nama.

## Submission dan Payload Compatibility

**COMPATIBILITY:** Payload lama dapat dibaca melalui canonical normalization/alias yang ada. Polanya adalah read old representation -> normalize -> apply current semantics. New write harus memakai representation canonical; compatibility reader bukan alasan mempertahankan typo atau key lama.

## Legacy Category Alias

Migration dan helper category identity membuktikan alias kategori controlled. Contohnya `SIstem Catu Daya Tidak Terputus` dibaca sebagai `Sistem Catu Daya Tidak Terputus`. Typo tidak menjadi canonical; alias hanya menjaga payload lama tetap terbaca.

## Product dan Product Proposal Evolution

**CURRENT:** `products.id` adalah identity canonical. Payload direct memakai `productId`; usulan baru memakai `productProposalId`; proposal APPROVED/MERGED menunjuk hasil canonical melalui `product_proposals.resolved_product_id`. Tiga identity ini mempertahankan provenance QC tanpa memaksa rewrite payload lama.

## Product Reference / Merge Evolution

**HISTORICAL:** memindahkan hanya `productId` dapat meninggalkan dependency QC result. **CURRENT:** direct references, `resolved_product_id`, dan aliases diproses transactionally oleh move/merge contract. Product merge bukan sekadar replace Product UUID pada JSON.

## Product Proposal >1000 Incident

**HISTORICAL:** count dari broad PostgREST list dapat salah ketika row cap/pagination memotong result. **CURRENT:** `admin_product_proposal_status_summary()` menghasilkan status total dan `admin_list_product_proposals(...)` menghasilkan list server-side paginated. Panjang list UI tidak boleh menjadi count authoritative.

## Completion Engine Evolution

**HISTORICAL:** beberapa calculation dapat melakukan global traversal JSON berulang. **CURRENT:** completion memakai aggregation set-based, one-call combined summary, dan lazy detail. Optimasi berikutnya harus menjaga semantic output, bukan hanya mengejar latency.

## Gudang Semantics

Gudang tetap dikecualikan dari category completeness. Informational Submission coverage Gudang adalah metrik terpisah: Station dengan Submission Gudang current dibanding Station dengan Site Gudang. Ini bukan perubahan denominator completion.

## Hosting Evolution

**CURRENT:** Hostinger adalah runtime Next.js canonical. **COMPATIBILITY:** `aloptama-collect.vercel.app` tetap dilayani sebagai hostname legacy melalui 307 ke canonical. Detail waktu/account historis tidak cukup dibuktikan repository dan sengaja tidak direkonstruksi.

## Vercel Legacy Compatibility

Redirect hanya cocok dengan hostname legacy exact, mempertahankan path/query, dan tidak mengalihkan Preview Vercel lain. Jangan menghapus atau mengubah 307 tanpa audit external link/traffic dan keputusan operator.

## Data Provenance

Provenance menjelaskan asal data, bukan current authority. UUID relational, master current, RPC, dan payload current tetap harus diaudit pada source runtime sebelum perubahan data.

## Compatibility yang Masih Aktif

| Compatibility | Mengapa masih ada | Evidence sebelum removal |
| --- | --- | --- |
| Vercel legacy redirect | bookmark/integrasi lama mungkin masih memakai host legacy | traffic/link audit, operator approval, monitoring period |
| category aliases | payload lama perlu dibaca canonical | audit payload production, test migration, rollout plan |
| payload normalization | Submission historical harus tetap terbaca | inventory key/reference audit dan compatibility test |
| spreadsheet provenance/tooling | import/recovery/reference eksplisit | operator workflow audit dan source replacement plan |

## Historical Artifact yang Tidak Boleh Dianggap Runtime

CSV, spreadsheet, `app/data.generated.json`, catatan lama, dan documentation historical tidak boleh mengalahkan master Supabase/current source. Jika detail sejarah tidak memiliki migration, test, compatibility code, repository documentation, atau Git evidence, gunakan pernyataan: `Tidak cukup bukti repository untuk merekonstruksi detail ini.`

## Kandidat Legacy Removal di Masa Depan

Tidak ada kandidat di atas yang otomatis aman dihapus. Setiap removal perlu inventory usage, audit production read-only, test, migration/data compatibility plan bila perlu, staged rollout, monitoring, dan final cleanup setelah bukti cukup.

## Cara Menghapus Compatibility dengan Aman

1. Petakan consumer dan data reference.
2. Audit production read-only dengan identity UUID/current schema.
3. Tambah test untuk behavior old dan planned removal.
4. Buat forward migration/data plan bila diperlukan.
5. Roll out staged dan monitor.
6. Hapus hanya setelah evidence dan otorisasi eksplisit.

## Source of Truth untuk Dokumen Ini

- `app/lib/category-identity.ts`, `app/lib/legacy-vercel-redirect.ts`, dan runtime master helpers.
- `supabase/migrations/20260829120000_legacy_category_alias_compatibility.sql`, `20260830130000_station_categories.sql`, `20260831120000_product_merge_qc_references.sql`, `20260902120000_admin_product_proposal_status_summary.sql`, `20260902130000_admin_list_product_proposals.sql`, dan completion migrations.
- `tests/legacy-category-compatibility.test.mjs`, `tests/station-monitoring.test.mjs`, `tests/product-merge.test.mjs`, `tests/qc-pending-summary.test.mjs`.

## Baca Sebelumnya

[Security dan Secrets](./15-SECURITY-DAN-SECRETS.md)

## Catatan Milestone Historis

[Changelog](./CHANGELOG.md) merangkum milestone awal berdasarkan tanggal Git.
Gunakan hanya sebagai riwayat; kontrak runtime current tetap mengikuti source,
test, migration efektif, dan dokumentasi canonical.

## Baca Selanjutnya

[Handover Checklist](./17-HANDOVER-CHECKLIST.md)
