# ADR-002: Station Category Authoritative Model

## Status

Accepted.

## Context

Station labels are not stable relational classification.

## Decision

Use `station_categories` and `stations.station_category_id` as authoritative category identity.

## Rationale

UUID relation is stable, queryable, and avoids naming heuristics.

## Consequences

### Positive

Filtering and monitoring are explicit across Meteorologi, Klimatologi, Geofisika, Balai, and Pusat.

### Trade-offs

Category mapping must be maintained as master data.

## Invariants

Do not infer category by parsing Station name.

## Evidence

- `20260830130000_station_categories.sql`.
- `tests/station-monitoring.test.mjs`.

## Revisit When

The relational category model is formally replaced with another stable identity model.
