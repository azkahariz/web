# Auth Flow Diagram

## Purpose

Show authentication separately from role and Station scope authorization.

## Diagram

```mermaid
flowchart TD
  B[Browser] --> A[Supabase Auth]
  A --> C[Session cookie]
  C --> R{Account role}
  R -->|Station User| ST[Station account and station scope]
  R -->|Super Admin| AD[Super Admin authorization]
  ST --> X[Authorized API RPC]
  AD --> X
```

## Important Invariants

- Soft lock is not authorization.
- Legacy and canonical host cookies are not shared.
- DB/RPC authorization remains a final boundary.

## Detailed Documentation

[Auth dan Otorisasi](../06-AUTH-DAN-OTORISASI.md)
