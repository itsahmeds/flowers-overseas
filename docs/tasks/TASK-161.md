# TASK-161 — The money lint: `/100`, `* 0.23` on a minor value, fractional `*Minor`, decimal money literals, `Number(s)` on money

Row: `TASKS.md` → TASK-161. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-161`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A20: AC-58 (T-62). Lint catches the listed shapes: `/100`, `* 0.23` on a minor value, fractional `*Minor`, decimal money literals, and `Number(s)` on money. What lint cannot see is left to TASK-163's `Minor` type; say so rather than over-claim. Fix the existing `Number(...amountMinor)` at `listing.ts` L1117. Founder answers (2026-09-28, `docs/decisions-log.md`) and the four advisor fixes are already in the amendment; do not reopen them. Each task updates its own `plan/12` §2 row (AC-62).

## Read

- `specs/001-repo-dev-os-bootstrap.md`: `## 0. Index`, then A20 and only the ACs above
- `docs/framework/standards-audit-2026-09-28.md`: the evidence (planted cases and results)
- `docs/codebase-map.md`

**Fence: every file the ACs name** (read from the spec, 2026-09-28). Anything else needs an escalation:

- eslint/fo/no-float-money.js and its test
- src/config/catalogue/schemas.ts
- src/modules/catalog/listing.ts (the L1117 `Number(...amountMinor)`)
- src/modules/catalog/pricing/vat.ts
- plan/12-dev-workflow.md (its own §2 row)
- seed/check.ts (L2437 `percent(total / COMMITTED_MEDIA_BYTE_CAP)`: a byte count, not money; listed in A20's goes-red list)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/break 108` (2026-09-28):** `seed/check.ts` L2437 divides a byte count, and AC-58 clause 3 would block it. A20 lists it as known code: **rename `total` to `mediaBytes`**. No exemption is possible, because AC-50 and AC-52 forbid switching `fo/no-float-money` off.

- **From `/break 118` and `/review 118` (2026-09-29):** round 1 closed ten unpinned rule branches with test rows only (PR 118, `fa46327`). Logged: an average of money through a callback lints clean (the `Minor` type is the backstop); `globalThis.Number(x)` is inside the stated limit; the negative-amount fixture string is wrong but only a fixture.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-29, to the orchestrator: a file outside the fence goes red. Answered 2026-09-29: fence widened to the L9 call in `float-money-valid.ts` only, with the proposed fix; `lint-fixtures.test.ts` unchanged. Applied.** Clause 3 turns
  `tests/fixtures/lint/float-money-valid.ts` L9, `.format(totalMinor / 100)`, red: it is T-62's
  own `priceMinor / 100` shape. Two tests pin that fixture clean: `tests/unit/no-float-money.test.ts`
  L47 (in the fence) and `tests/unit/lint-fixtures.test.ts` L104 (outside it), so CI cannot go
  green without touching the fixture. `pnpm lint` on the real tree reports nothing else. Proposed
  fix, tried locally and reverted (153/153 green across both tests, `lint:fixtures` clean): add
  the fixture to the fence and change that one call so it formats a decimal string, the way
  `src/modules/i18n/format.ts` does:
  `` .format(`${String(Math.trunc(totalMinor / 100))}.${String(totalMinor % 100).padStart(2, "0")}`) ``.
  The fixture README (L77) and the `eslint.config.mjs` comments stay accurate.
- **2026-09-29, to the reviewer: the `listing.ts` fix differs from the spec text. Orchestrator 2026-09-29: keep the `<`/`>` comparison; the reviewer rules on it.** AC-58
  clause 5 says to delete the `Number(` calls because both values are whole numbers. They are,
  but their type is `Money.amountMinor: number | bigint` (`src/modules/i18n/format.ts` L91), so
  `left - right` fails `tsc` (TS2365). The comparator now uses `<` / `>`, which accept
  `number | bigint`, with no `Number(` left. It is still one expression at L1117. Flipping `-1`
  to `1` turns 4 tests in `catalog-listing`/`catalog-shop-page` red. Please accept this, or name
  the fix you want.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-29: the rule, T-62 and the per-clause tests, the `listing.ts`/`seed/check.ts` fixes and the `plan/12` Money row are in `ed259f7`. I broke all 12 new branches one at a time and each turned the T-62 case red. `pnpm lint` on the real tree finds only the two known sites, both fixed. **Blocked**: `float-money-valid.ts` is outside the fence (see Escalations). Next: once the fence is widened, apply the one-line fixture fix, run `gates:cheap`, rebase, mark ready, add `ci:full`.
- 2026-09-29: I applied the approved one-line fix at the `float-money-valid.ts` L9 call and set the row back to `in_review`. Next: run `gates:cheap`, rebase, mark ready, add `ci:full`.

## Result

PR [#118](https://github.com/itsahmeds/flowers-overseas/pull/118).
- **The rule:** `fo/no-float-money` has AC-58's five clauses: money words, whole-number endings, division, decimal factors, and text-to-number.
- **Unit tests:** `tests/unit/no-float-money.test.ts` has 122 cases. They include every T-62 Invalid and Valid row exactly as listed, plus one block per clause.
- **Mutation check:** I broke each of the 12 new branches, and each time the T-62 case went red.
- **Real code:** `pnpm lint` on the real tree flagged only `listing.ts` L1117 and `seed/check.ts` L2437, and both are fixed. The `listing.ts` fix is a `<`/`>` comparison rather than a deletion; see Escalations (TS2365, `number | bigint`).
- **Fixture:** `float-money-valid.ts` L9 now formats a decimal string, under the widened fence.
- **What lint cannot see:** values — a rate in a variable, money under a name that is not a money word, and plural names. These are handed to TASK-163's `Minor` type.
- **Gates:** no expensive gate was run locally.

`pnpm gates:cheap` (private `TMPDIR`) on `7bf3318`, which is also the rebased head. "Tree DIRTY" is the untracked `node_modules` symlink:

```
gates:cheap · 7bf3318d7ecff445911f1dd139f548b07874d950 · tree DIRTY · base origin/main · 2026-09-29T16:47:17.361Z
typecheck             exit 0 · 2.1 s
lint                  exit 0 · 10.7 s
format:check          exit 0 · 8.3 s
i18n:check            exit 0 · 0.4 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 21.0 s · changed 27 + map 0 + always 2 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```
