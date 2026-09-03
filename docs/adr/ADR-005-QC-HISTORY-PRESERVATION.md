# ADR-005: QC History Preservation

## Status

Accepted.

## Context

QC decision, reviewer, note, original proposal, and source Submission are audit history even after canonical resolution changes.

## Decision

Preserve Product Proposal identity/history and update `resolved_product_id` only through authorized transactional flows.

## Rationale

Deleting/recreating proposal to alter canonical resolution loses traceability.

## Consequences

### Positive

Approved/Merged history remains readable across Product maintenance.

### Trade-offs

Merge/move must include QC dependencies.

## Invariants

Do not delete/recreate a resolved Proposal merely to change its canonical result.

## Evidence

- `20260831120000_product_merge_qc_references.sql`.
- `tests/product-merge.test.mjs`.

## Revisit When

The audit model is replaced through an approved data-retention design.
