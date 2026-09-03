# Product QC Flow Diagram

## Purpose

Show dual Product references and QC/Product maintenance boundaries.

## Diagram

```mermaid
flowchart LR
  S[Submission payload] -->|productId| P[Canonical Product]
  S -->|productProposalId| Q[Product Proposal]
  Q -->|APPROVED or MERGED resolved_product_id| P
  Q --> A[Approve Baru]
  Q --> M[Resolve Existing]
  Q --> R[Reject]
  P --> MV[Pindahkan Referensi]
  P --> MG[Gabungkan Produk]
```

## Important Invariants

- DIRECT and QC_RESULT references have different mutation semantics.
- QC history survives canonical resolution and Product merge.
- Reject does not create a canonical Product.

## Detailed Documentation

[Admin dan QC](../08-FLOW-ADMIN-DAN-QC.md), [Product Master](../09-PRODUCT-MASTER-DAN-REFERENSI.md)
