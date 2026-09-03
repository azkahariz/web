# Testing dan Verification

## Status Dokumen

- Baseline source: `f5b4c1a7248b3da680fff7b19750fcfd00ec40a4`
- Target pembaca: Developer/Operator Aloptama Collect
- Source of truth: source code, configuration, tests, migrations, dan fakta operator yang secara eksplisit ditandai

## Filosofi Verifikasi

Verifikasi harus sesuai risiko dan target. Test source tidak membuktikan data production; HTTP 200 tidak membuktikan browser workflow. Untuk perubahan database, pisahkan local mutation verifier, read-only oracle production, dan smoke UI.

## Test Layers

| Layer | Tujuan | Bukan bukti untuk |
| --- | --- | --- |
| lint | kesalahan statis/style | behavior database/live UI |
| application tests | kontrak source dan renderer | deployment production |
| build | bundling Next.js | Auth/RPC production |
| local verifier | kontrak DB melalui fixture rollback | data production |
| Preview/smoke | flow terintegrasi | semua edge case |
| read-only oracle | state target nyata | permission mutation |

## Unit / Application Tests

`npm run test` menjalankan build lalu 30 file test Node yang mencakup master, Auth/autosave, QC, Product, Submission monitoring, Gudang, runtime master, redirect legacy, serta Panduan. Ia menangkap regression kontrak source tetapi tidak menjalankan verifier Supabase local.

## `npm run test`

Prasyaratnya dependency tersedia dan build dapat berjalan. Karena command memanggil build, error bundling juga dapat membuat test gagal. Ia tidak membuktikan migration sudah diterapkan di target remote.

## `npm run check`

`npm run check` menjalankan `npm run lint`, `npm run test`, lalu `npm run test:station-completion`. Ini adalah gate umum sebelum commit/release, tetapi bukan pengganti verifier database feature atau smoke Preview.

## Build Verification

`npm run build` menjalankan `next build`. Jalankan setelah perubahan aplikasi, routing, environment boundary, atau sebelum release. Build lulus tidak membuktikan RPC, RLS, atau data remote.

## `git diff --check`

Gunakan untuk whitespace/error diff. Ia wajib untuk perubahan dokumentasi dan kode, tetapi tidak melakukan semantic testing.

## Supabase Local Verification

Pastikan target sebelum verifier mutating. `npx supabase status` menampilkan endpoint local yang aktif; konfigurasi repo memakai DB local `127.0.0.1:54322`. Jangan percaya URL yang ditempel tanpa memeriksa host dan status CLI.

## Database Verifiers

| Test / verifier | Read/Write | Target | Production safe? |
| --- | --- | --- | --- |
| `validate:master` | read/parse source | local files | ya |
| `export:master:csv:remote`, `export:source-csv:remote` | read-only | remote yang dipilih | hanya setelah target diaudit |
| `sync:master` | write | remote | hanya dengan otorisasi release |
| `sync:master:local` | write | local | ya, local saja |
| `verify:auth-autosave`, `verify:admin-qc`, `verify:admin-products`, `verify:admin-submissions` | fixture mutation dan rollback | harus local | **DO NOT RUN AGAINST PRODUCTION** |
| `verify:product-dependencies`, `verify:product-reference-move`, `verify:product-merge`, `verify:product-delete` | fixture mutation dan rollback | script menolak non-local DB | local saja |
| `verify:warehouse`, `verify:station-completion`, `verify:site-subtype-family`, `verify:station-runtime-master` | verifier feature | verifikasi target script sebelum run | local sebagai default aman |
| `benchmark:station-completion` | fixture/benchmark | local DB | local saja |

Script yang memuat `.env.local` tidak otomatis aman terhadap production. Sebelum run, baca target resolver atau atur environment local secara eksplisit.

## Completion Verifiers

`test:station-completion` menjalankan lima test completion UI/engine/monitoring. `verify:station-completion` menguji kontrak database local. `benchmark:station-completion` mengukur local benchmark dan semantic parity; jangan bandingkan angka local dengan latency production yang tidak setara.

## Product / QC Verifiers

Gunakan verifier sesuai domain: `verify:admin-qc`, `verify:product-proposal-summary`, `verify:admin-products`, `verify:product-usage`, `verify:product-dependencies`, `verify:product-reference-move`, `verify:product-merge`, `verify:product-delete`, dan `verify:product-delete-concurrency`. Semua yang membuat fixture harus diperlakukan sebagai local-only walaupun rollback tersedia.

## Read-Only Production Verification

Read-only query/oracle berguna untuk memastikan project, migration, RPC output, atau record target. Ia tidak menggantikan test local dan tidak memberi izin untuk mutation. Catat target project, waktu, query, dan hasil ringkas tanpa menampilkan secret.

## Mutation Safety

Sebelum test yang dapat menulis: pastikan host local, project target benar, fixture dapat rollback, dan tidak ada produksi di connection string. Jangan menjalankan `sync:master`, provisioning account, remediation, atau verifier fixture terhadap production hanya untuk membuat test hijau.

## Test Data dan Fixtures

Fixture verifier bersifat sementara dan harus dibersihkan/rollback oleh script. Jangan menggunakan count data production yang berubah sebagai assertion permanen. Product, Submission, dan master production bukan test fixture.

## Feature-Specific Verification Matrix

| Change type | Minimum tests | DB required | Preview required | Production read-only check |
| --- | --- | --- | --- | --- |
| Submission/autosave/Auth | focused test + `check` + `verify:auth-autosave` | local | ya | bila incident/migration |
| QC/Product | focused test + `check` + verifier domain | local | ya | bila data/RPC berubah |
| Product reference move/merge/delete | focused test + verifier domain | local | ya | ya sebelum mutation release |
| Completion/Gudang | completion tests + verifier/benchmark relevan | local | ya | bila RPC/migration berubah |
| redirect/deployment | redirect test + build | tidak selalu | ya | canonical/legacy smoke |
| documentation-only | link, secret, Mermaid, `diff --check` | tidak | tidak | tidak |

## Release Verification Matrix

| Release | Required minimum |
| --- | --- |
| app-only | focused tests, `check`, build, Preview, production smoke |
| compatible migration | local migration/verifier, SQL review, target oracle, explicit authorization, app verification |
| performance | semantic parity, benchmark same dataset, focused regression, Preview/smoke |

## Performance Verification

Bandingkan dataset dan environment yang sama, ambil beberapa sampel, dan pisahkan cold/warm bila relevan. Hindari kesimpulan dari fixture 1,000 row untuk masalah production 10 row. Gunakan benchmark repository bila domainnya tersedia.

## Semantic Parity Verification

Optimasi harus membandingkan calculation referensi dan calculation baru pada input yang sama. Completion benchmark menggunakan pola ini sebelum mengukur performa. Parity tidak mewajibkan mempertahankan behavior yang memang sedang diperbaiki secara sengaja; perubahan semantics harus memiliki test expectation baru yang eksplisit.

## Documentation-Only Changes

Markdown yang tidak dibaca application tidak memerlukan seluruh app suite. Tetap jalankan `git diff --check`, pemeriksaan link relatif, secret scan, Mermaid sanity, dan review placeholder. Periksa dahulu apakah registry/index yang diubah dibaca app; Batch 4 tidak mengubah registry aplikasi.

## Common Test Failures

- local Supabase/Docker belum aktif: nyalakan dan cek `npx supabase status`, jangan fallback ke production;
- migration/RPC tidak ada: reset/apply local sesuai prosedur, jangan edit migration applied;
- URL verifier remote: hentikan dan audit environment;
- build failure: perbaiki source/dependency sebelum mempercayai test lain.

## Source of Truth untuk Dokumen Ini

- `package.json` -> seluruh script yang didokumentasikan.
- `supabase/config.toml` -> endpoint Supabase local.
- `scripts/master/database-connection.mjs` -> guard local/remote connection.
- `scripts/verify-*.mjs`, `scripts/benchmark-station-completion.mjs`, dan `tests/*.test.mjs` -> verifier serta kontrak aktual.

## Baca Sebelumnya

[Deployment dan Infrastruktur](./11-DEPLOYMENT-DAN-INFRASTRUKTUR.md)

## Baca Selanjutnya

[Runbook Production](./13-RUNBOOK-PRODUCTION.md)
