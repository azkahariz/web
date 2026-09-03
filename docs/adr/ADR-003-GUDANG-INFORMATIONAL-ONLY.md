# ADR-003: Gudang Informational Only

## Status

Accepted.

## Context

Gudang inventory does not share expected-category completeness semantics of normal Site/Subtipe.

## Decision

Exclude Gudang from category completion; expose separate informational Submission coverage.

## Rationale

Category/unit count cannot honestly represent inventory completeness as a completion score.

## Consequences

### Positive

Global completion denominator remains meaningful while monitoring still shows Gudang adoption.

### Trade-offs

Gudang percent is not inventory fullness.

## Invariants

Gudang must not enter global completion numerator/denominator.

## Evidence

- `20260828120000_exclude_warehouse_from_station_completion.sql`.
- `20260905120000_gudang_submission_progress.sql`.
- [Completion](../10-COMPLETION-DAN-MONITORING.md).

## Revisit When

A separately defined and validated Gudang completeness model is approved.
