# Product Master dan Referensi

## Status Dokumen

- Baseline source: `45e90d205a8485469583342f0d69e73f58410d24`
- Target pembaca: Developer Aloptama Collect
- Source of truth: source code, tests, dan migrations pada baseline di atas

## Konsep Product Canonical

`products.id` adalah identity canonical Product. Display memakai `brand` dan `model`, tetapi identity dan operation aman selalu memakai UUID. Kolom lifecycle penting mencakup `active`, `source_origin`, timestamps, dan `merged_into_product_id` untuk Product yang telah digabungkan.

Product inactive tidak ditawarkan untuk pilihan baru, tetapi history/references tetap dapat dibaca. Product merged tidak hard-deleted: source dibuat inactive dan menunjuk target canonical melalui `merged_into_product_id`.

## Product Alias

`product_aliases` memetakan variasi Brand/Model ke satu `products.id` canonical. Alias membantu lookup/search dan menjaga penulisan historis tetap resolvable.

Alias bukan Product Proposal dan bukan direct reference Submission. Alias tidak membuat row inventory baru. Product Merge memindahkan/deduplicate alias ke target; Pindahkan Referensi tidak mengubah `products` maupun `product_aliases`.

## Product Proposal

`product_proposals` menyimpan usulan raw dari Station. Setelah QC:

- APPROVED/MERGED menyimpan `resolved_product_id` ke Product canonical.
- REJECTED tidak memiliki Product result.
- proposal dan `submission_id` asal tetap menjadi history.

Product yang dibuat dengan Approve Baru dapat memiliki banyak proposal history yang `resolved_product_id`-nya menunjuk Product tersebut.

## Product Provenance

`source_origin` memberi provenance, misalnya master legacy, QC, atau Admin sesuai value yang divalidasi current schema/RPC. `spreadsheet_synced` adalah metadata legacy/provenance; ia bukan instruksi untuk menyinkronkan runtime master ke Spreadsheet dan bukan indikator kualitas canonical.

## Bagaimana Product Direferensikan

```mermaid
flowchart LR
  S[Submission payload.inventory]
  D[productId]
  Q[productProposalId]
  P[Product Proposal]
  C[Canonical Product]
  S --> D --> C
  S --> Q --> P
  P -->|resolved_product_id after APPROVED or MERGED| C
```

Relasi `productId` dan `productProposalId` berada di JSON payload; bukan FK conventional dari `submissions` ke Product. Resolver harus membedakan keduanya.

## Direct Reference

**DIRECT** adalah satu occurrence exact `productId` pada item `submissions.payload.inventory` current. Identity selective move adalah kombinasi Submission UUID, expected Submission version, dan `itemId`. Reference direct tidak selectable bila Submission archived atau memiliki active lock.

## QC Result Reference

**QC_RESULT** adalah `product_proposals` APPROVED/MERGED dengan `resolved_product_id` yang menunjuk Product target. Proposal tersebut terhubung ke Submission current melalui `submission_id`; payload occurrence asal tetap memakai `productProposalId`.

Identity selective QC move memakai proposal UUID dan `expectedProposalUpdatedAt`. Proposal yang status/resolution/timestamp-nya berubah setelah UI load ditolak sebagai `reference_changed`.

## Dependency dan Referensi

Dialog Penggunaan Produk membedakan dua pandangan:

- **Dependency**: ringkasan hubungan yang memblokir/menjelaskan operation Product, termasuk reference canonical dan hubungan QC/alias yang relevan.
- **Referensi**: baris occurrence yang dapat ditelusuri dan, bila valid, dipilih untuk Pindahkan Referensi.

`admin_product_dependencies` dan `admin_product_references` adalah RPC berbeda. Referensi menggunakan pagination server-side, search sebelum pagination, dan tidak mengirim payload Submission penuh ke browser.

## Category Context

Context referensi DIRECT berasal dari occurrence JSON exact: Station, Site, Tipe Site, Subtipe, kategori storage, dan `functionCategories` bila tersedia. Context tidak ditebak dari nama Product.

QC_RESULT menampilkan konteks Submission/proposal dan category result `Hasil QC`; proposal context QC terpisah dapat menemukan semua category payload yang memakai `productProposalId`. Multi-category dideduplikasi oleh source context sebelum UI menampilkan ringkasannya.

## Pindahkan Referensi

Pindahkan Referensi memindahkan **baris yang dipilih saja** dari Product source ke Product target active. Selection dapat berisi DIRECT, QC_RESULT, atau campuran sampai limit API yang tervalidasi.

| Reference type | Mutation |
| --- | --- |
| DIRECT | item JSON `productId`, `brand`, `model` berubah ke target; Submission `version` naik satu per Submission yang disentuh |
| QC_RESULT | `product_proposals.resolved_product_id` berubah ke target; payload Submission tidak direwrite |

Operation mengambil lock row proposal/Submission, menjalankan validation ulang setelah lock, dan seluruh mutation berada dalam satu transaction RPC. Bila precondition gagal, return status conflict tanpa partial mutation.

## Gabungkan Produk

Product Merge memindahkan **semua dependency supported** dari Product source ke target setelah preflight token current. Ia menangani direct reference current, QC_RESULT resolved proposal, aliases, audit, lalu membuat source inactive dan mengisi `merged_into_product_id` target.

Merge tidak sama dengan destructive delete. Source UUID/history tetap ada untuk traceability, tetapi status UI menjadi Digabungkan dan Product tidak lagi active untuk selection baru.

## Pindahkan Referensi dan Gabungkan Produk

| Behavior | Pindahkan Referensi | Gabungkan Produk |
| --- | --- | --- |
| Scope | selected reference rows | all supported source dependencies |
| DIRECT | hanya item terpilih | seluruh direct current reference source |
| QC_RESULT | hanya proposal result terpilih | seluruh resolved proposal result source |
| Submission version | naik untuk Submission DIRECT yang diubah | naik untuk Submission direct payload yang diubah |
| Alias | tidak berubah | pindah/deduplicate ke target |
| Source Product | tetap apa adanya | inactive dan `merged_into_product_id` target |
| Target | harus Product active | harus Product active dan bukan source |
| Audit | `PRODUCT_REFERENCE_MOVE` | `PRODUCT_MERGE` |

Gunakan Pindahkan Referensi untuk koreksi subset. Gunakan Gabungkan Produk hanya ketika dua canonical Product memang harus menjadi satu identity operational.

## Stale QC Guard dan Atomicity

Preflight menangkap snapshot identity. Saat apply, RPC mengunci row terkait dan memvalidasi ulang:

- DIRECT: Submission ada, current, unlocked, expected version sama, item muncul tepat satu kali, dan masih menunjuk source Product.
- QC_RESULT: proposal masih APPROVED/MERGED, masih menunjuk source Product, Submission current, serta `updated_at` sama pada precision milidetik dengan snapshot.

Failure seperti `version_conflict`, `active_lock`, `reference_changed`, atau `source_mismatch` menghentikan operation. Transaction menjamin mutation complex berhasil bersama atau rollback; jangan menambah client-side loop yang memindahkan sebagian row sendiri.

## Submission Version Semantics

Direct Product reference mutation mengubah JSON payload sehingga menaikkan `submissions.version`. QC_RESULT move hanya mengubah `resolved_product_id` proposal sehingga tidak menaikkan version Submission. Product Merge mengikuti aturan yang sama: direct payload current yang berubah menaikkan version; repoint QC result tidak membutuhkan rewrite payload.

Ini melengkapi [Flow Station dan Submission](./07-FLOW-STATION-DAN-SUBMISSION.md): expected version tetap wajib untuk semua mutation payload direct.

## Audit Trail

Reference move mencatat `PRODUCT_REFERENCE_MOVE` per Submission yang payload-nya berubah dan satu record Product-level. Merge mencatat `PRODUCT_MERGE` beserta snapshot/preflight semantics. QC resolution memiliki reviewer/timestamp/note pada proposal dan audit Admin. Audit membantu traceability, bukan izin untuk melewati preflight.

## Legacy / Historical Guardrails

Migration `20260831120000_product_merge_qc_references.sql` memperbaiki merge agar resolved QC proposal ikut direpoint secara atomik. Tanpa langkah ini, Product source dapat terlihat tidak lagi dipakai pada direct payload tetapi masih direferensikan `resolved_product_id`.

Guardrail current:

- Jangan memindahkan alias saat selective reference move.
- Jangan menghapus source Product setelah merge.
- Jangan mengabaikan QC_RESULT hanya karena tidak memiliki `productId` payload.
- Jangan count dependency dari satu page client.

## Execution Paths

| Operation | API | RPC | Primary mutation |
| --- | --- | --- | --- |
| list/dependency | `/api/admin/products`, `/dependencies` | list/dependencies | no |
| reference view | `/references` | `admin_product_references` | no |
| move preflight | `/move-preflight` | `admin_product_reference_move_preflight` | no |
| move apply | `/move` | `admin_move_product_references` | selected JSON/reference result |
| merge preflight | `/merge-preflight` | `admin_product_merge_preflight` | no |
| merge apply | `/merge` | `admin_merge_product` | all supported dependencies + source state |
| delete preflight/apply | `/delete-preflight`, `DELETE /[id]` | delete RPC | only eligible inactive orphan Product |

## Relevant Source / RPC / Migration

- `app/admin/AdminProducts.tsx`, `ProductReferenceMoveDialog.tsx`, `ProductMergeDialog.tsx`.
- `app/lib/admin-product-api.ts`, `app/lib/product-reference-selection.ts`, `app/lib/admin-product-list.ts`.
- `app/api/admin/products/[id]/dependencies`, `references`, `move-preflight`, `move`, `merge-preflight`, `merge`.
- `20260821120000_product_reference_preflight.sql` through `20260904120000_product_reference_category_context.sql`.

## Relevant Tests

- `tests/product-dependencies.test.mjs` - dependency visibility.
- `tests/product-reference-context.test.mjs`, `tests/product-reference-move.test.mjs`, `tests/product-reference-selection.test.mjs` - exact reference/move contract.
- `tests/product-merge.test.mjs`, `tests/product-delete.test.mjs` - merge/delete safety.
- `tests/admin-products.test.mjs` - Product Admin list/create/edit/status behavior.

## Invariants

- Canonical identity is `products.id`, not display text.
- DIRECT and QC_RESULT are different reference types.
- Selective move never changes aliases or Product source state.
- Merge repoints aliases and QC results, then retires source Product without hard delete.
- JSON payload mutation must carry expected Submission version.
- Product reference operations require Super Admin and preflight/revalidation.

## Hal yang Tidak Boleh Dilakukan

- Jangan update `resolved_product_id` dari client/table direct.
- Jangan global-rewrite payload untuk QC_RESULT movement.
- Jangan use Product Merge untuk sekadar satu reference correction.
- Jangan resolve source/target Product berdasarkan Brand/Model string.
- Jangan remove stale guard, active-lock guard, atau preflight token.

## Source of Truth untuk Dokumen Ini

- `app/lib/admin-product-api.ts`, `app/lib/product-reference-selection.ts`, `app/lib/admin-product-list.ts`.
- `app/api/admin/products/[id]/references/route.ts`, move/merge/dependency routes.
- `supabase/migrations/20260823120000_product_reference_move.sql`, `20260824120000_product_merge.sql`, `20260831120000_product_merge_qc_references.sql`, `20260901120000_product_reference_move_qc_results.sql`, `20260904120000_product_reference_category_context.sql`.
- `tests/product-reference-move.test.mjs`, `tests/product-reference-context.test.mjs`, `tests/product-merge.test.mjs`, `tests/product-delete.test.mjs`.

## Baca Sebelumnya

[Flow Admin dan QC](./08-FLOW-ADMIN-DAN-QC.md)

## Baca Selanjutnya

[Completion dan Monitoring](./10-COMPLETION-DAN-MONITORING.md)
