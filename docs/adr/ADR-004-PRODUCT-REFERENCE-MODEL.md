# ADR-004: Product Reference Model

## Status

Accepted.

## Context

Submission may select a canonical Product or propose a new Product that requires QC history.

## Decision

Maintain DIRECT (`productId`) and QC_RESULT (`productProposalId` -> `resolved_product_id`) references.

## Rationale

Collapsing every result into direct JSON would destroy proposal provenance and review semantics.

## Consequences

### Positive

Canonical catalog and historical QC decision remain traceable.

### Trade-offs

Reference operations must process both classes.

## Invariants

Do not globally rewrite QC_RESULT payload solely to represent resolution.

## Evidence

- `app/lib/product-reference-selection.ts` and Product migrations.
- [Product Master](../09-PRODUCT-MASTER-DAN-REFERENSI.md).

## Revisit When

An explicit replacement model preserves equivalent QC provenance.
