# TASK-163 — The branded `Minor` money type, and the audit's docs and gaps closed out

Row: `TASKS.md` → TASK-163. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-163`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A20: AC-59 and AC-62 (T-63, T-67). The branded `Minor` type per Q19, after tasks 158–162, extending TASK-160's config builder. It may split under its own stop rule: say so and stop rather than overflow one PR. As last to merge, close gap 17 in `docs/framework/gaps.md`. **`docs/framework/standards-audit-2026-09-28.md` stays unchanged** (AC-62): it is the dated record. Founder answers (2026-09-28, `docs/decisions-log.md`) and the four advisor fixes are already in the amendment; do not reopen them. Each task updates its own `plan/12` §2 row (AC-62).

## Read

- `specs/001-repo-dev-os-bootstrap.md`: `## 0. Index`, then A20 and only the ACs above
- `docs/framework/standards-audit-2026-09-28.md`: the evidence (read-only; AC-62 keeps it unchanged)
- `docs/codebase-map.md`

**Fence: every file the ACs name** (read from the spec, 2026-09-28). Anything else needs an escalation:

- src/modules/catalog/pricing/money.ts, src/modules/catalog/types.ts, and the call sites AC-59 names
- plan/12-dev-workflow.md (its own §2 row)
- docs/framework/gaps.md row 17 (AC-62: last to merge)
- eslint.config.mjs (the `as Minor` ban)
- tsconfig.fixtures.json and its type fixtures (T-63)
- tests/unit/lint-coverage.test.ts (your row)
- the `MinorUnitsSchema` file AC-59 names (A20 now says which of the two)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/break 108` and `/review 108` (2026-09-28):** there are two exported `MinorUnitsSchema`s (`src/modules/catalog/schemas.ts` L55 and `src/config/catalogue/schemas.ts` L314); A20 now names which one gets the brand.

- **From `/review 120` round 2 (2026-09-29):** HOLE N1–N3 accepted. (1) The next docs PR names in `plan/12`'s Money-row limit: `z.BRAND<"Minor">`, `.brand` through a template literal type or `["brand"]`, and `z.any()` behind `z.ZodType<Minor>`; `eslint/sdk-adapters.js` gets the same wording when next touched. (2) The next task that touches `sdk-adapters.js` adds `BRAND` to the `$brand` entry, with specimens. (3) Nits: `netFromGross` returns `number`; `Minor` and `toMinor` are not in the catalog barrel; `PriceTable.entries` is `number`.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-29: measured first (stop rule): branding the pricing types surfaced 51 type errors, 8 in `src/modules/catalog/pricing/` and 43 in 7 test files, so it fits one PR; no split.
- 2026-09-29: `Minor`, `toMinor()`, the brand on `src/modules/catalog/schemas.ts`' `MinorUnitsSchema` and the call sites (546a9d7); the `as Minor` ban in the builder (6c7f943); `@ts-expect-error` outside `tests/` (ff21db2); the AC-52 row (6c42373). Next: docs rows, gates, rebase, ready.
- 2026-09-29: `plan/12` Money and PII rows, gap 17, fixtures README (cb35167); `pnpm gates:cheap` PASS. PR 120 ready with `ci:full`.
- 2026-09-29: round 1 (`/review 120` FAIL, `/break 120` HOLES 5 on 19f9264), after a rebase onto PR 119: casts to every `Minor`-holding type of `types.ts` and to `typeof` `toMinor`/the `Minor`-holding schemas; no second brand, `custom<Minor>()` or `$brand` outside `schemas.ts`; all 11 `*Minor` fields pinned in the fixture plus a compiler walk that pins the lint's lists; `plan/12` Money row and the builder header say what is and is not caught.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 120. `MinorUnitsSchema` in `src/modules/catalog/schemas.ts` carries `.brand<"Minor">()`; `types.ts` exports `Minor` (zod's brand, so `z.infer<typeof MinorUnitsSchema>` is exactly it), and the 11 `*Minor` fields of the pricing types are `Minor`; `toMinor()` in `pricing/money.ts` throws unless `Number.isSafeInteger` and is the only `as Minor`; `money.ts`' outputs are `Minor`. The dataset schema (`src/config/catalogue/schemas.ts`) stays unbranded: `resolve.ts` and `history.ts` take its amounts in through `toMinor()`. Stop rule measured first: 51 type errors, 8 in `src/modules/catalog/pricing/`, 43 in 7 test files; no split. Lint: AC-59's two `no-restricted-syntax` entries (`as`/`<T>` to a type that is or contains `Minor`, bare or qualified, and a hand-made `$brand`) join the one builder in `eslint/sdk-adapters.js` on every root, `tests/` included (a new `fo/restricted/tests` group), off only in `money.ts`; `@ts-expect-error` is an error outside `tests/` (`fo/ts-expect-error` in `eslint.config.mjs`). Tests (unit): `catalog-pricing-minor.test.ts` 31 cases (toMinor 8, tsc fixture 1 reading tsc's output for the 5 red lines and no others, lint 22); `lint-coverage.test.ts` gains the AC-59 row, 5 entry checks run by what the resolved options do, and 2 T-56 red cases. Mutations run: brand removed, `IntegerMoney.amountMinor` back to `number`, the builder's AC-59 spread removed, the tests group removed: each goes red. Limits said plainly in `plan/12`: a type alias of `Minor`, a generic that casts, an `any`. No expensive gate run locally. Files outside the literal fence, both named by the brief: `eslint/sdk-adapters.js` (the Binding's "extending TASK-160's config builder"; AC-52 forbids a second `no-restricted-syntax` block) and `tests/fixtures/README.md` (the `ts/` fixtures row). Round 1 closed breaker holes 1–4 and the review's AC-62 change (hole 5). `Minor` is now `z.output<typeof MinorUnitsSchema>`, so no file but `schemas.ts` names `$brand`. Review nits, logged: `netFromGross()` (exported through the barrel) still returns `{ netMinor: number; vatMinor: number }`, the safe direction but unlike `VatSplit`; `Minor` and `toMinor` are not exported from `src/modules/catalog/index.ts`, so code outside the module makes a `Minor` only through `MinorUnitsSchema.parse` (add both when the first consumer needs them). `PriceTable.entries` is still `number`.
