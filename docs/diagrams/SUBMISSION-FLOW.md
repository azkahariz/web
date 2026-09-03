# Submission Flow Diagram

## Purpose

Show Station selection, lock lifecycle, save/versioning, and optional Product Proposal.

## Diagram

```mermaid
flowchart TD
  A[Station User] --> B[Site]
  B --> C[Subtype]
  C --> D[Ensure or open Submission]
  D --> E[Acquire soft lock]
  E --> F[Edit payload]
  F --> G[Autosave or manual save]
  G --> H[Version check]
  H --> I[Persist current payload]
  F --> J{Existing Product?}
  J -->|No| K[Product Proposal]
  J -->|Yes| L[Direct Product reference]
```

## Important Invariants

- Authorization determines access; soft lock coordinates editors.
- Payload-changing save follows version contract.
- Proposal is not automatically a canonical Product.

## Detailed Documentation

[Flow Station dan Submission](../07-FLOW-STATION-DAN-SUBMISSION.md)
