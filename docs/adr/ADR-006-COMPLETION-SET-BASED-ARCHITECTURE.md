# ADR-006: Completion Set-Based Architecture

## Status

Accepted.

## Context

Repeated global expansion of Submission JSON risks slow Admin monitoring and inconsistent duplicate calculations.

## Decision

Use set-based aggregation, combined summary, one payload expansion where practical, and lazy detail.

## Rationale

This reduces repeated traversal without moving authoritative business calculation to the client.

## Consequences

### Positive

Monitoring remains DB-authoritative and scalable relative to prior repeated scans.

### Trade-offs

SQL/RPC semantic tests are required for change.

## Invariants

Optimization preserves Completion semantics unless an intentional, tested rule change says otherwise.

## Evidence

- `20260903120000_optimize_station_completion.sql`.
- `tests/station-monitoring.test.mjs`.

## Revisit When

Measured workload requires a new benchmarked architecture with parity proof.
