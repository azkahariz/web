# Completion Flow Diagram

## Purpose

Separate normal Site/Subtipe category completeness from Gudang informational coverage.

## Diagram

```mermaid
flowchart TD
  ST[Active Station] --> N[Current non-Gudang Site and Subtype]
  N --> E[Expected categories]
  N --> F[Recognized filled categories]
  E --> SS[Station status]
  F --> SS
  SS --> M[Global and Site Type monitoring]
  ST --> G[Gudang Site]
  G --> GS{Current Gudang Submission exists?}
  GS --> GI[Informational Gudang coverage]
```

## Important Invariants

- Gudang path does not enter expected/filled/global completion.
- Completion remains master-current and DB-authoritative.

## Detailed Documentation

[Completion dan Monitoring](../10-COMPLETION-DAN-MONITORING.md)
