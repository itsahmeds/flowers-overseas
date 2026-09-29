# TASK-159 — Zod at every body read (a test over all of `src/`, `READERS`/`PARSERS` exemption lists in the test) and the `gates:cheap` always-run list

Row: `TASKS.md` → TASK-159. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-159`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A20: AC-53 and AC-61's local clause (T-57, T-66). A unit test reads all of `src/` (every body read today sits in `src/lib/` behind thin route files), with the exemption lists `READERS` and `PARSERS` inside the test, never a comment. `useSearchParams()` in client components is listed as not covered. `gates:cheap` always runs this test. Founder answers (2026-09-28, `docs/decisions-log.md`) and the four advisor fixes are already in the amendment; do not reopen them. Each task updates its own `plan/12` §2 row (AC-62).

## Read

- `specs/001-repo-dev-os-bootstrap.md`: `## 0. Index`, then A20 and only the ACs above
- `docs/framework/standards-audit-2026-09-28.md`: the evidence (planted cases and results)
- `docs/codebase-map.md`

**Fence: every file the ACs name** (read from the spec, 2026-09-28). Anything else needs an escalation:

- tests/unit/zod-boundaries.test.ts (new)
- scripts/gates-cheap.ts (the always-run list)
- src/lib/reminders.ts and src/modules/ui/consent/consentCookie.ts (only if AC-53 names a missing parse)
- plan/12-dev-workflow.md (its own §2 row)
- tests/fixtures/zod-boundaries/ (new; T-57)
- tests/unit/gates-cheap.test.ts (T-45's test, extended by T-66)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/break 108` (2026-09-28):** AC-53's `PARSERS` check follows one call inside the same file (e.g. `listingRequest` → `parseSearch()` → the `.parse` at `params.ts` L141), as the input rule does (landed in A20, round 3). You run after TASK-154, because both write `scripts/gates-cheap.ts`.
- **From `/review 116` round 2 (2026-09-29):** `/break 116` round-2 HOLE 1 ACCEPTABLE (a phrasing variant outside the spec's named cases), and closed anyway by the `= await props` case in `page-props`. Open: `export { Page as default }` is not treated as a page; `tests/fixtures/README.md` has no `zod-boundaries/` row. Follow-ups: `req["json"]()` and `.call`; any `.parse` counts as a schema; no `.entries()` fixture.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-29: T-57 written — `tests/unit/zod-boundaries.test.ts` (scanner and the `READERS`/`PARSERS` lists inside it) and 14 fixture trees under `tests/fixtures/zod-boundaries/`. The real tree is green with the spec's two entries (6 raw inputs, all parsed or exempt), so `reminders.ts` and `consentCookie.ts` need no fix. Draft PR #116.
- 2026-09-29: T-66 — `ALWAYS_TESTS` in `scripts/gates-cheap.ts` (zod-boundaries, lint-coverage), named on the test gate's line; five cases in `gates-cheap.test.ts`; deleting `lint-coverage` from the list turns 4 cases red (checked).
- 2026-09-29: `plan/12` §2 Validation row names the test and its limits (AC-62); codebase map regenerated. Next: `gates:cheap`, rebase, ready, `ci:full`.
- 2026-09-29 (round-1 fixes, item 1): `const { searchParams } = props` in a page/`generateMetadata`, and `const { searchParams } = new URL(…)`/`= req.nextUrl`, are now raw inputs; fixtures `page-props`, `url-search`. Deleting either detector turns its case red (checked).
- 2026-09-29 (item 2): a `"use server"` file's `export { act }`, `export default <arrow>` and `export const x = wrap(async (fd) => …)` are server actions; fixture `server-action-exports`. Deleting each of the three turns the case red (checked).
- 2026-09-29 (item 3): pinned `isURLValue` (and its `nextUrl` branch), a method's first argument, `JSON.parse` alone, the `JSON` exclusion in `callsSink`, the one-binding limit, inline `"use server"`, the `generateMetadata` and `generateViewport` matches, `props.searchParams`, and `arrayBuffer`/`blob`; fixtures `rule-limits`, `parsers-json`, `inline-server`. Each mutation turns exactly one case red (checked). Next: gates, rebase, CI.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#116](https://github.com/itsahmeds/flowers-overseas/pull/116). **AC-53 / T-57:** `tests/unit/zod-boundaries.test.ts` parses every `.ts`/`.tsx` under `src/` with the compiler API and finds the three kinds of raw input; `READERS = [src/lib/consent.ts#readBoundedBody]` and `PARSERS = [src/modules/catalog/params.ts#listingRequest]` live in the test, each with a reason, and a comment exempts nothing. Unit: 22 cases over 14 fixture trees in `tests/fixtures/zod-boundaries/` (T-57's nine red and five green cases, the empty tree, plus the flips: the plant's function added to `READERS`, the escaping `use()` added to `PARSERS`, and the one-call follow switched off, each flipping its case). The real tree is green with 6 raw inputs (2 page `searchParams`, 2 `readBoundedBody` calls, 1 `.json()`, 1 exempt `.text()` inside the reader), so `reminders.ts` and `consentCookie.ts` were not touched. `useSearchParams()` in client components is listed as not covered in the test header and the `plan/12` row. **AC-61 local clause / T-66:** `ALWAYS_TESTS` in `scripts/gates-cheap.ts` runs `zod-boundaries` and `lint-coverage` on every diff and names them on the test gate's line; a missing entry turns the gate red. `gates-cheap.test.ts` has 5 new cases (26 total); removing `lint-coverage` from the list turned 4 red. TASK-160 adds `url-pii` to `ALWAYS_TESTS` and to `EXPECTED_ALWAYS`. **AC-62:** the `plan/12` §2 Validation row. No expensive gate was run locally. Left for someone else: `tests/fixtures/README.md` has no row for `zod-boundaries/` because it is outside this fence.

**Round-1 fixes (`/review` FAIL, `/break` HOLES on `74f6cbf`).** The scan now finds `const { searchParams } = props` in a page or `generateMetadata`, `const { searchParams } = new URL(…)` / `= req.nextUrl` (each followed by an unparsed `searchParams.get`), and, in a `"use server"` file, actions exported as `export { act }`, `export default <arrow>` and `export const x = wrap(async (fd) => …)`. New cases pin `isURLValue` (with its `nextUrl` branch), a method's first argument (`db.save(body)`), `JSON.parse` alone and the `JSON` exclusion in `callsSink`, the one-binding limit, inline `"use server"`, the `generateMetadata`/`generateViewport` matches, `props.searchParams`, and `arrayBuffer`/`blob`. Unit is now 28 cases over 21 fixture trees (new: `page-props`, `url-search`, `server-action-exports`, `inline-server`, `rule-limits`, `parsers-json`). I ran 17 mutations, one at a time, each deleting a detector or loosening a rule. Each one turned exactly one case red. The real tree is unchanged: 6 raw inputs, all parsed or exempt. No `src/` file failed the new rules. **Round 2 (`/break 116` on `92d0c8e`, 1 hole):** `page-props` gains `src/app/c/page.tsx`, `const { searchParams } = await props` then a raw `.page`. Setting the parenthesis/`await` unwrap to `false` turns that case red, missing exactly the `c/page.tsx:7` line (checked). The block below is from `16132dc`; the only later commit changes this brief. It ran with `TMPDIR` set to a private subdirectory of the system temp dir. With the shared one, `dev-os.test.ts` "leaves no temp project or registry behind" went red twice on another worktree's live `fo-dev-os.*` dirs: `fo-wt-156` was running `dev-os-check.ts` at the same time.

**Follow-ups, logged and not done:** `export { Page as default }` is not treated as a page default export. `.parse` on any object, `Date.parse` included, counts as a schema parse (a gap in the spec's wording). `req["json"]()` and `.call` are not caught. The `.entries()` step has no fixture. `tests/fixtures/README.md` has no `zod-boundaries/` row (outside this fence).

```
gates:cheap · 16132dc24c709e1385251b9ebf9ef395a1f92b21 · tree clean · base origin/main · 2026-09-29T14:39:22.576Z
typecheck             exit 0 · 2.2 s
lint                  exit 0 · 9.2 s
format:check          exit 0 · 7.6 s
i18n:check            exit 0 · 0.3 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 114.6 s · changed 4 + map 0 + always 1 · always run: zod-boundaries, lint-coverage
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts
RESULT: PASS
```
