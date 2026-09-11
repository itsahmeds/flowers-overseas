# TASK-031 — Docs, records and spec close: `docs/architecture.md` §1–§4 (Neon + R2, no Supabase node, `db/migrations/` path, data layer credited to 002, `ALLOW_PLACEHOLDER_ENV` row deleted, Neon-compute-cap row added), `docs/compliance/ropa.md` Neon + Cloudflare + `plan/07` §1.2 flow rows, `README.md` script table, spec 002 §14 corrections

Row: `TASKS.md` → TASK-031. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-031-docs-ropa-close`. RoPA rows 3–4 replace the placeholder row: Neon Inc. (Frankfurt eu-central-1, sub-processor AWS, DPA filed) and Cloudflare R2 (EU jurisdiction restriction, DPA at account creation), each with subjects, categories, basis, retention and transfer notes per §8; the Supabase row ADR-0008 would have produced is never written. `tests/unit/architecture-doc.test.ts` must stay green against `scripts/check-layout.ts`. Spec 002 §14 records the deviations accumulated by this spec's tasks — notably that migration numbering runs `0001`…`0012` because §5.1's ten-file grouping was split for one-day tasks (concerns and order preserved), plus anything the reviewers rule on. Spec exit signal: this PR merged with a recorded `/review` PASS, Phase 0 specs `2 / 12`, CI green including real `test-integration` and `db-check`, and a seeded preview database spec 003 can start from. Tests: T-33.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `tests/unit/architecture-doc.test.ts`
- `scripts/check-layout.ts`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._
