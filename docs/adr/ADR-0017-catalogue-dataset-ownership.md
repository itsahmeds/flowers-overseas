# ADR-0017 — One catalogue dataset: spec 005 authors it, specs 006 and 002 consume projections

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-09-09 |
| Deciders | Ahmed (delegated to the orchestrator: "accept defaults for both specs") |
| Supersedes | — |
| Related | specs/005 §13 Q9, specs/006 §13 Q10, specs/002 §14 A1, ADR-0015, plan/10 |

## Context
Spec 005 (catalogue + pricing) owns the Phase 0 product, tier, add-on and price data as zod-parsed
constants in `src/config/catalogue/*.data.ts` so the demo runs with no database. Spec 006 (seed
import + imagery) writes `seed/data/**` files that spec 002's seed reads once the database exists.
Both describe the same 84 products from `plan/10`. Two hand-authored copies would disagree within a
week, and `/plan-tasks` for 005/006 escalated the ruling.

## Options considered
1. **Spec 006 authors its own `seed/data/` catalogue rows** — keeps spec 006 §2.2 literal · two
   sources of truth for names, tiers and prices; `seed:check` can only detect drift, not prevent it.
2. **Spec 005's dataset is the single authored source; spec 006's `products.json`,
   `product-tiers.json`, `addons.json` and the price directories are generated projections of it,
   asserted byte-equal by `seed:check`; spec 002's seed reads those files** — one place to edit,
   drift is a failing gate · a generation step in spec 006 and one sentence of spec 006 §2.2 read
   as "projected", not "authored".
3. **Move the dataset into `seed/` and have spec 005 import it** — spec 002's text stays literal ·
   the demo's only catalogue would live behind scripts that cannot run without a database.

## Decision
Option 2. `src/config/catalogue/*.data.ts` is authored; everything under `seed/data/` that
describes catalogue entities is generated from it (TASK-072/074) and `seed:check` (TASK-075) fails
when the projection is stale. Spec 002's seed task reads `seed/data/**` (spec 002 §14 A1 (d)).

## Consequences and the trade-off accepted
Easier: one edit changes the demo, the seed and, later, the database; the "price shown = price
charged" invariant has one origin. Harder: spec 006 carries a generation step and must never
hand-edit a projected file — its README says so and the gate enforces it. Media, translations and
partner rows remain spec 006's / spec 002's own authored data; only catalogue entities are
projected.

## Rules
- Accepted ADRs are never edited. The only legal touch is flipping Status to `superseded-by`.
- `deferred` requires: guardrails while deferred, revisit trigger, cost of deferral.
- `not-applicable` requires a reason.
