# TASK-306 — Spec 042 detail photographs at the hero's ladder (042-V)

Row: `TASKS.md` → TASK-306. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 042 §5.1, §12 row 042-V and §13 Q6 (advisor fix F1); spec 006 §14 A-founder-2026-10-20b (in PR 284).
- **ACs owned:** AC-20 (variants and `seed:check` half); test T-20 (unit half). The gallery half (the second slide's `currentSrc`) is TASK-309's.
- Every approved `productDetail` asset gets the product hero's ladder (up to 828 px today); `pnpm seed:check` fails when one lacks a width of it.
- Independent of TASK-307, TASK-310 and TASK-311; TASK-309 and TASK-312 wait for it.
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): seed data and the `seed:check` gate.

## Read

- `specs/042-premium-interactions.md`: `## 0. Index`, then §5.2, §5.3 for the idea, §9 and §10 for the ACs below, §13
- `docs/codebase-map.md`
- `seed/data/media-variants.json`, `seed/data/media.json`, the `media:variants` script (spec 006)

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-21, to the orchestrator (and the reviewer, in PR 314): **the `productDetail` byte cap.**
  Spec 006 §14 A-founder-2026-10-20b gives the slot the hero ladder at the pinned qualities and is
  silent on `seed/budgets.ts`'s per-slot cap, an `[agent-inferred]` 60 000 B sized for the old
  384 px step. Measured on the 84 detail originals, the 828 WebP reaches 117 920 B (87 files over
  60 000 B, 16 over the hero's 90 000 B), so AC-20 cannot hold under the old number, and neither
  the qualities (pinned by the amendment) nor the ladder (AC-20) may move. **Applied: 120 000 B**
  (above the largest file, the same number as the `og` cap), recorded in `seed/budgets.ts`'s
  header. Detail photographs are never first-load bytes (lazy slide, hover-only layer), so no
  page budget moves. Answer: `open` (reverse by naming another number; the gate then names the
  files above it).
- 2026-10-21, to the orchestrator: **the upload is a merge precondition, not done here.** Clause
  2 has `pnpm media:upload` publish the new rungs; this agent holds no R2 credential (and does not
  read `.env.local`). Until they are uploaded, a phone at DPR 2 or more fetches a 404 for the
  product page's second slide once this manifest deploys. Upload before merge:
  `pnpm media:upload --only <each approved detail id>` from a checkout holding the derived tree
  (the worktree `../fo-wt-306` holds it, or re-run `pnpm media:variants` in the main checkout:
  deterministic), then `pnpm media:upload --verify --only <the same ids>`. Answer: `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-21: started; worktree `../fo-wt-306`, branch `task/TASK-306-detail-ladder`. Next: measure the detail ladder's bytes, the red test, the ladder change, the re-derive.
- 2026-10-21: `PRODUCT_HERO_WIDTHS` shared by `productHero` and `productDetail`; `seed:check` rule `detail-ladder`; `tests/unit/media-variants-ladder.test.ts`; cap 120 000 B (escalated); full `pnpm media:variants` re-derive from the main checkout's originals (symlinked into the worktree's git-ignored `.local/`).
- 2026-10-24, finisher: rebased on `origin/main` (map regenerated, no code conflict; zod 4.6.7 from main clears `audit`); `pnpm gates:cheap` PASS on `e4b879af` (tests: 142 changed files green at load 7). Still open before merge: escalation 2, upload the new rungs to R2 (`pnpm media:upload --only <ids>` then `--verify`), which needs the founder's R2 credential.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 314](https://github.com/itsahmeds/flowers-overseas/pull/314). `productDetail` ships the product
hero's ladder by reference (`PRODUCT_HERO_WIDTHS`, 384 / 480 / 640 / 828, `seed/schema/variants.ts`);
`pnpm seed:check` has a `media` rule `detail-ladder` that fails an approved detail asset with
variant rows that lacks a rung (or carries one the hero lacks), per format. A full
`pnpm media:variants` from the 175 originals added **504 rows** (84 detail assets x 480/640/828 x
AVIF/WebP) and changed or removed **none** (every existing checksum reproduced); `media:variants
--check`: 1366 rows, 1366 files, every checksum matched; `public/media/` unchanged;
`seed/snapshot/media_variant.json` regenerated. Largest detail file 117 920 B (828 WebP); cap
raised to 120 000 B (escalated above). Unit: `tests/unit/media-variants-ladder.test.ts`, 7 cases
(data scan, header, clean tree, missing 828, 384-only, extra rung, rejected / no-row skip), each
watched red under a mutation (data cut to 384: 5 red; rule silenced: 3; slot table `[384]`: 1;
review-state filter dropped: 1; extra-rung half removed: 1); `media-budgets.test.tsx` widest detail
384 -> 828. Handed on: **upload the new rungs before merge** (escalation 2); TASK-309 owns the
gallery half (second slide `currentSrc`, `sizes`).

`pnpm gates:cheap` (head ebab631a, load average 63 at the time):

```
typecheck             exit 0 · 9.1 s
lint                  exit 0 · 74.8 s
format:check          exit 0 · 36.0 s
i18n:check            exit 0 · 1.6 s
check:no-db           exit 0 · 0.3 s
codebase:map --check  exit 0 · 0.3 s
tests                 exit 1 · 189.1 s · changed 134 + map 0 + always 3
RESULT: FAIL (1 of 7 red: tests)
```

The red was 3 of 137 files: `seed-diff.test.ts` (the snapshot needed `pnpm seed:diff --write`,
fixed in 555d53dc) and timeouts at load 63 in `url-pii.test.ts` and `product-route.test.tsx`.
Re-run alone at load 13 with `--maxWorkers=2` (the orchestrator's MACHINE HEAT rule, so no second
wide run): `seed-diff`, `url-pii`, `product-route`, `media-variants-ladder`: 4 files, 51 tests,
all green. No build slot taken: nothing here needs a build.
