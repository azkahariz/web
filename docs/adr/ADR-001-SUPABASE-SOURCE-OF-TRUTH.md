# ADR-001: Supabase Source of Truth

## Status

Accepted.

## Context

Spreadsheet/CSV provenance and recovery tooling exist, while runtime requires one mutable authoritative master.

## Decision

Supabase is the authoritative runtime source of truth for master and business data.

## Rationale

It provides relational identity, Auth/RLS, RPC, migration history, and one current data boundary.

## Consequences

### Positive

Runtime reads/writes do not depend on Spreadsheet labels or browser memory.

### Trade-offs

Database migration/release discipline is required.

## Invariants

Do not add a second mutable runtime authority without an explicit ADR.

## Evidence

- `app/lib/station-runtime-master.ts`, Supabase clients, and migrations.
- [History dan Legacy](../16-HISTORY-DAN-LEGACY.md).

## Revisit When

A replacement backend can provide a tested migration and authority plan.
