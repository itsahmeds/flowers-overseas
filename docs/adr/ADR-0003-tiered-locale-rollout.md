# ADR-0003 — Tiered locale rollout: en, de, pl first

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-09-05 |
| Deciders | Ahmed |
| Supersedes | — |
| Related | plan/03-i18n-spec.md, plan/09-roadmap.md |

## Context
The brief assumed eight launch languages. Each indexed locale multiplies translation QA, hreflang surface, legal page variants and thin-content risk, before any florist exists.

## Options considered
1. **All eight at launch** — maximum footprint; machine translation with human review; noindex until reviewed.
2. **Tiered: en, de, pl now; fr, es, it, nl, ro, tr, then sv in Phase 4** — covers the two largest corridors and the florist pitch; architecture supports every locale from day one.
3. **Tiered plus ro/tr early** — RO and TR are named diaspora corridors but have no live florists in Phase 1.

## Decision
Option 2: tiered rollout, en/de/pl at Phase 0–1.

## Consequences and the trade-off accepted
Easier: three locales a founder can actually QA. Harder: German has no live corridor for months and is demo-only; if scope must be trimmed, German goes before Polish. Romanian and Turkish move ahead of Dutch and Italian in Phase 4 ordering because they are diaspora corridors.
