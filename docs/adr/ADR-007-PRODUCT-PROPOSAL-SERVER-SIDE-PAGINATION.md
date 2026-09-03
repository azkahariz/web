# ADR-007: Product Proposal Server-Side Pagination

## Status

Accepted.

## Context

Client count from a broad paginated/PostgREST list can be truncated by row cap.

## Decision

Use aggregate server-side RPC for status totals and filtered/paginated server-side RPC for rows.

## Rationale

Global workload count must not depend on the current page.

## Consequences

### Positive

QC badges remain authoritative while UI stays bounded.

### Trade-offs

Summary and list are intentionally separate data calls.

## Invariants

Never derive global QC count from loaded page rows.

## Evidence

- `20260902120000_admin_product_proposal_status_summary.sql`.
- `20260902130000_admin_list_product_proposals.sql`.
- `tests/qc-pending-summary.test.mjs`.

## Revisit When

A replacement query preserves aggregate/list separation and pagination safety.
