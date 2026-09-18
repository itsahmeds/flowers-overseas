# TASK-095 — Gates, honesty and spec close: forbidden-claim scan over both states in all locales + JSON-LD, Lighthouse on hub + one corridor per indexable locale (`categories:seo` on indexable URLs only), axe on hub + corridor both states × 4 locales + `/ar-XB` with no exception list, visual baselines (9 × 2 platforms), `docs/design` artboard test rows, `docs/runbooks/corridor-content.md`, architecture §2/§3, RoPA note, README, spec §14

Row: `TASKS.md` → TASK-095. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-095`; keep it current by editing this file, not the row.

## Binding

- **This is spec 007's closing gate.** Owns **AC-19** (§9 L266; T-20), **AC-25** (L276; T-26),
  **AC-26** (L277; T-27, T-28), **AC-27** (L280; T-29), **AC-28** (L281; T-30). Nothing here adds a
  feature: every item either proves what shipped or records it. Dependencies TASK-088, 093, 094 and
  120 are all merged or in review before you start — read their `## Result` sections first, because
  your job is to prove their claims collectively rather than re-derive them.
- **AC-19 is the honesty gate and the reason this task exists.** No corridor page, hub page or their
  JSON-LD may contain a review, rating, star, testimonial, review count, Trustpilot mark, partner
  name, partner photo, florist count or delivery-photo claim; and in **guide state** additionally no
  price, cutoff, delivery date or same-day claim. Scan the served DOM and the JSON-LD, in every
  locale, in **both** states — not the source. TASK-120 built the shared sweep in
  `tests/e2e/chrome-honesty.spec.ts` and `tests/support/listing-honesty.ts`; extend those rather
  than writing a third scanner, and inherit its `PAGES` list (TASK-120 added the all-destinations
  hub; TASK-109 added the country shop root).
- **AC-25's numbers must be trustworthy.** Lighthouse over the Brotli origin on the hub plus one
  corridor per indexable locale: performance, accessibility and best-practices ≥ 0.95, LCP
  < 2 000 ms, CLS < 0.05; `categories:seo` ≥ 0.95 asserted on indexable URLs only and deliberately
  unasserted on the `noindex` set. **Run it on a quiet machine.** On 2026-09-18 the orchestrator ran
  eight agents at once and the 15-minute load average reached 28 — Lighthouse measures wall-clock,
  so a score collected under that load describes the machine, not the site. Check
  `pgrep -fl "next build|next start|playwright|lighthouse"` **and** `uptime` before you collect, and
  record the load average beside the numbers in `## Result` so a reviewer can judge them.
- **AC-26**: axe with zero serious/critical and **no exception list** on the hub and on a corridor in
  both states, in all four locales and `/ar-XB`; nine visual baselines × two platforms at 0.1 %.
  `linux/` baselines are stale (3 files against 82 `darwin`) — TASK-099 owns regenerating them from a
  CI artefact, so state plainly which platform you actually produced rather than claiming both.
- **AC-27**: the §12 artboards exist, are listed in **both** `canvas.json` files and the
  `docs/design/README.md` table, pass `tests/unit/design-docs.test.ts`, and the shipped page matches
  their block order, states and copy. Where a drawing and the code disagree, spec 008 §14 **A9** is
  the precedent: the spec text governs, the drawing is the stale artefact, and you add a dated row to
  the README rather than building the drawing. Two such rows already exist (TASK-120's chrome band,
  TASK-109's delivery-facts panel) — check whether either is now dischargeable.
- **AC-28**: `docs/runbooks/corridor-content.md` exists and is indexed; `docs/architecture.md`
  §2/§3 list the new content directory, routes and the `geo`/`seo` module surfaces;
  `codebase:map --check`, `i18n:check`, `specs:index --check` green; the RoPA carries the "no new
  processing" note; the README documents `corridor:check`.
- **You do not flip indexing.** TASK-096 owns the domain, `NEXT_PUBLIC_SITE_URL`,
  `isIndexingEnvironment()` and the `noindex` lift. Your job is to make that flip a one-line
  configuration act with every gate already proven. If you find something that would only fail
  *after* the flip, record it in `## Carry-forwards` for TASK-096 rather than pre-empting it.
- Gates: the extended e2e honesty scan, Lighthouse, axe, visual, the docs unit tests,
  `pnpm typecheck`, `pnpm lint`, `pnpm i18n:check`, `pnpm codebase:map --check`,
  `pnpm specs:index --check`. Report every number with the machine load it was taken under.

## Read

- `specs/007-corridor-pages.md` — `## 0. Index`, then §9 AC-19/25/26/27/28, §10 T-20/26/27/28/29/30,
  §12 (the artboard list and the exit signal), §14 **A1–A8**.
- `specs/008-country-shop-category-occasion-pages.md` §14 **A9** only (the stale-artboard precedent).
- `docs/tasks/TASK-088.md`, `TASK-093.md`, `TASK-094.md`, `TASK-120.md` — each `## Result`, which is
  what you are proving; and `docs/tasks/TASK-096.md`, which is what you are unblocking.
- `docs/design/README.md` (the "where the sheet and the code currently differ" table),
  `docs/design/wireframes/canvas.json` and the root `canvas.json`.
- `docs/codebase-map.md` — `modules/seo`, `tests/e2e/chrome-honesty.spec.ts`,
  `tests/support/listing-honesty.ts`, the Lighthouse and visual configuration.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review 65` (2026-09-16, TASK-090):** add `src/modules/seo` to `SCANNED_PATHS` in `scripts/check-no-db-imports.ts` (spec 007 AC-1); the module is DB-free so the gate passes on addition.
- **From `/review 66` (2026-09-16, TASK-088):** rule 5 (shingle distinctness) compares bodies within one locale only, so an `en-gb` override that near-copies its `en` base is invisible to it (rule 17 checks title/description/≥2 FAQ answers, never the body); measured cross-locale `en/nl` vs `en-gb/nl` 0.695, others 0.80–0.95. Alternates are near-duplicate by design (§13 Q9), so decide at the gates close whether rule 17 gains a body clause or rule 5 a cross-locale term, and record it in spec 007 §14.
- **From `/review 70` (2026-09-16, TASK-091):** (1) the AC-19 honesty scan must cover the **whole document**, not `main` — TASK-091's e2e passed only because it was scoped to `<main>` while the chrome promised same-day delivery (fixed by TASK-120; make TASK-120 a dependency). (2) The 2026-09-15 ruling (e) — the FAQ item saying the page is not yet available in Polish — is **absent** from `content/corridors/en/pl-guide.md` (10 items; the artboard drew 12): add it in the content pass. (3) `linux/` visual baselines for the corridor follow the first CI run. (4) The page artboards' fourth calendar column ("what it means here") has no data source — three columns ship; the artboard amendment lands in TASK-091 round 2, and a fourth column would need a schema field plus ~80 authored sentences (spec 007 §14 record if ever pursued).
- **From `/review 70` round 2 (2026-09-16):** harden `tests/unit/corridor-corpus-index.test.ts`'s `node:fs` detector — it matches only `from "node:fs"` and misses a bare `import "node:fs";` and `await import("node:fs")`; `tests/unit/support/import-closure.ts` `tsconfigAliases()` strips JSONC line-by-line and would break on a trailing same-line comment.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
