# Deployment Flow Diagram

## Purpose

Separate application deployment from database migration release steps.

## Diagram

```mermaid
flowchart TD
  F[Feature branch] --> T[Tests and build]
  T --> P[Preview validation]
  P --> PR[PR review]
  PR --> M[Merge main]
  M --> H[Hostinger production]
  L[Local migration and verifier] --> C[Compatibility gate]
  C -->|explicit authorization| DB[Production migration apply]
  DB --> H
  V[Legacy Vercel host] -->|307| H
```

## Important Invariants

- Migration is not application deployment.
- Production mutation needs explicit authorization.
- App rollback requires schema compatibility review.

## Detailed Documentation

[Deployment](../11-DEPLOYMENT-DAN-INFRASTRUKTUR.md), [Runbook](../13-RUNBOOK-PRODUCTION.md)
