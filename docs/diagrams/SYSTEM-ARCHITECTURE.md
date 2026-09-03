# System Architecture Diagram

## Purpose

Visualize runtime, control/deployment, and compatibility boundaries.

## Diagram

```mermaid
flowchart LR
  B[Browser] --> D[Cloudflare DNS]
  D --> H[Hostinger Next.js canonical runtime]
  B --> S[Supabase Auth]
  H --> P[Supabase PostgreSQL RPC RLS]
  S --> P
  G[GitHub main] -. deploy control .-> H
  G -. Preview control .-> V[Vercel Preview]
  L[Legacy Vercel host] -. 307 compatibility .-> H
  H --> E[External APIs when feature requires]
```

## Important Invariants

- Hostinger is canonical runtime; Cloudflare is DNS, not asserted as app host.
- Vercel legacy compatibility is separate from Preview.
- Supabase remains the data/Auth authority.

## Detailed Documentation

[Architecture](../02-ARSITEKTUR.md), [Deployment](../11-DEPLOYMENT-DAN-INFRASTRUKTUR.md)
