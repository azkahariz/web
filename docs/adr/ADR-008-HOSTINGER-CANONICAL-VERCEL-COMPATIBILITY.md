# ADR-008: Hostinger Canonical and Vercel Compatibility

## Status

Accepted.

## Context

Production canonical hostname moved while legacy Vercel links may remain in use.

## Decision

Hostinger is canonical Next.js runtime; exact Vercel legacy hostname returns 307 to canonical while Preview remains usable.

## Rationale

The redirect preserves old paths/query without making Vercel the current runtime authority.

## Consequences

### Positive

Legacy bookmarks remain compatible and production identity is unambiguous.

### Trade-offs

Cross-host cookie scope can require re-login.

## Invariants

Redirect is hostname-specific and preserves path/query.

## Evidence

- `app/lib/legacy-vercel-redirect.ts`, `proxy.ts`.
- `tests/legacy-vercel-redirect.test.mjs`.

## Revisit When

Legacy traffic is demonstrably gone and operator approves redirect retirement or permanent behavior.
