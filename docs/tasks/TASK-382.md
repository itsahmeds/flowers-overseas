# TASK-382 — The core range confirmed: the founder's yes or changes to the proposed 10-SKU core list (spec 004 Q-24a), applied to `coreRank` in the seed; closes with no code if he confirms the list as proposed

Row: `TASKS.md` → TASK-382. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-382`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Spec 004 Q-24a: "the catalogue research §5 rows 1 to 10, each mapped by the orchestrator to the committed SKU closest in type, main flower and colour, listed in the `/plan-tasks` PR for the founder to confirm there; no row that renders the core range merges before he confirms."
- **The proposed list** (also drawn on the home boards), rank: 1 Season's Hand `FO-BQ-034` (florist's choice seasonal); 2 Pastel Weekend `FO-BQ-031` (pastel romantic; alternative Quiet Blush `FO-BQ-004`, which has roses as the recipe asks); 3 Baltic Dawn `FO-BQ-003` (pink roses); 4 Bright Side `FO-BQ-026` (gerbera, bright); 5 Field of Gold `FO-BQ-023` (yellow); 6 Vistula Red `FO-BQ-002` (red roses); 7 Amber Hour `FO-BQ-001` (no mixed-colour rose SKU exists; orange roses is the closest); 8 White Linen `FO-BQ-015` (white elegant); 9 Moth Orchid White `FO-PT-001` (white orchid plant); 10 Standing Spray `FO-FN-002` (white sympathy spray).
- On his yes: record it here and in the log, set the row `done` with no PR. On changes: one seed PR updating `coreRank`, `seed:check` green, AC-72's today's-data clause re-run.
- Class: review-only (seed data, no price).

## Read

- `docs/advice/2026-10-24-international-catalogue-research.md` §5
- `src/config/catalogue/products.data.ts`
- `docs/codebase-map.md`

## Carry-forwards

_None recorded._

## Escalations

- **2026-10-24, the mapping** (orchestrator → founder; `closed`): founder, verbatim, "core ok". The list above stands as proposed (rank 1 to 10, with Pastel Weekend `FO-BQ-031` at rank 2, not the Quiet Blush alternative).

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: founder confirmed the list ("core ok"); nothing to change in the seed.

## Result

Closed with no code: the founder confirmed the proposed core list on 2026-10-24 ("core ok"). `coreRank` in the seed already carries it if TASK-381 seeds it as listed; TASK-381 owns writing `coreRank`. Rows 383, 386, 387 and 388 are free to merge on their own gates.
