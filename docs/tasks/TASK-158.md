# TASK-158 — No comment can switch a lock off (`noInlineConfig`, `--max-warnings 0`, the out-of-ESLint comment scan, Stylelint's disable locked), the lint-coverage table, and CI running every check on every PR

Row: `TASKS.md` → TASK-158. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-158`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A20: AC-50, AC-51, AC-52, and AC-61 except its local clause (T-54–T-56, T-65). No comment may switch a lint rule off (Q17); Stylelint's disable is locked too (Q18). `noInlineConfig: true` plus `--max-warnings 0`, backed by an out-of-ESLint scan for bare disables and any `fo/` rule name; a test proves the config itself cannot switch a lock off. **Count today's warnings before you flip `--max-warnings 0`**, and fix or list each one (the spec's known risk). The planted audit case (`/* eslint-disable */` + `price = 1.5`) is a T-row. Founder answers (2026-09-28, `docs/decisions-log.md`) and the four advisor fixes are already in the amendment; do not reopen them. Each task updates its own `plan/12` §2 row (AC-62).

## Read

- `specs/001-repo-dev-os-bootstrap.md`: `## 0. Index`, then A20 and only the ACs above
- `docs/framework/standards-audit-2026-09-28.md`: the evidence (planted cases and results)
- `docs/codebase-map.md`

**Fence: every file the ACs name** (read from the spec, 2026-09-28). Anything else needs an escalation:

- eslint.config.mjs
- stylelint.config.mjs
- scripts/check-no-literal-disable.ts
- tests/unit/no-literal-disable.test.ts
- tests/unit/lint-coverage.test.ts (new)
- src/modules/ui/consent/ConsentBannerIsland.tsx (the L170 disable)
- package.json (lint scripts)
- .github/workflows/ci.yml and tests/unit/ci-workflow.test.ts (AC-61)
- plan/12-dev-workflow.md (its own §2 row, AC-62)
- tests/fixtures/lint/bare-disable.ts (new) and tests/unit/lint-fixtures.test.ts (T-54)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/break 108` and `/review 108` (2026-09-28):** AC-52's lint-coverage table checks only the locks that exist when you merge; TASK-160, 162 and 163 add their rows as they land (landed in A20, round 3). You run before TASK-156, because both edit `package.json`.
- **From `/review 113` round 2 (2026-09-29):** HOLE 3 ACCEPTABLE (a tracked `.stylelintignore`): it hides no CSS file that exists today, because `src/app/globals.css` is the only tracked CSS and ignoring it makes Stylelint fail with AllFilesIgnoredError. Leftover: the first task that adds tracked CSS outside `globals.css` adds `.stylelintignore` to the config-name set in `tests/unit/lint-coverage.test.ts`.
- **From `/review 113` round 2 (2026-09-29):** leftovers, logged and not required:
  - `continue-on-error: ${{ true }}` at job level passes the `=== true` check in `ci-workflow.test.ts`;
  - an `.npmrc` `script-shell` pointing at `true` would stop every pnpm script;
  - `|| exit 0` or `|| echo` on lint-job steps that are not pinned is not matched by `SWALLOWED`.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-09-28, to the orchestrator: `README.md` L86 and L102 describe `pnpm lint` as `lint:js` + `lint:css` and the scan as "no file under `src/` disables `fo/no-literal-strings`". Both are stale after this PR, and README is outside the fence. Not blocking. Answer (orchestrator, round-1 fixes, 2026-09-28): fence widened to those two rows only. Both are updated in round 1.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-28: measured `eslint .` on bfae5c9 before the flip: 0 warnings, 0 errors (610 files). Tests first (T-54, T-55, T-56, T-65: 50 red), then `noInlineConfig`, `--max-warnings 0`, `ignoreDisables`, the rewritten scan, the ConsentBannerIsland ref fix and the `ci.yml` fold; 181 green in the five touched files. Draft PR 113, commit 9eb32e8.
- 2026-09-28: broke each lock on purpose and watched its test go red: `noInlineConfig` removed (T-54 and T-56), `--max-warnings 0` removed (T-54 and T-65), each of the scan's four patterns deleted in turn (T-55), `fo/no-raw-color` set to `off` (T-56), the `ci:full` guard put back on `lint` (T-65, T-39), and `ignoreDisables` removed (T-54). Added the `plan/12` §2 "Lint locks" row and regenerated the map. Next: gates:cheap, rebase, ready, `ci:full`.
- 2026-09-28, round 1 (`/review 113` FAIL and `/break 113` HOLES on 4bf006d): fixes and holes below; each new test was seen red with its fix removed.
  - Review 1, AC-51 (a): the rule list is now parsed like ESLint's `parseListConfig`, so `eslint-disable ,`, `""`, `''` and `-next-line ,` are bare (four new T-55 forms).
  - Review 2, AC-52: `basePath` global-ignores objects are counted, and `isPathIgnored` over every tracked lintable file plus one probe per pattern must equal today's six patterns (new T-56 case `{ basePath: "db", ignores: ["**"] }`).
  - Review 3: README L86 and L102 are updated.
  - H1: no other ESLint or Stylelint config name anywhere (root or tracked tree), no `eslintConfig` or `stylelint` key in `package.json`, and `new ESLint({ cwd }).findConfigFile()` is `eslint.config.mjs`.
  - H2: any `processor` outside `PROCESSORS_TODAY` (empty) is red.
  - H3: `lint`, `lint:js`, `lint:css` and `check:no-literal-disable` are pinned exactly.
  - H4: no step of the `lint` job may have `continue-on-error` or run `|| true` / `|| :`, and the `pnpm lint` step's run is pinned. The summary step's `|| true` is removed.
- 2026-09-28: CI run 36466493420 on ba129ea failed in `lint` → "Summarise the lint gate". GitHub runs `shell: bash` with `-e`, so `grep -c` with no match exited 1; my local check had run without `-e`. The count now uses `awk`, which exits 0. A new T-65 pair runs the real step under `bash --noprofile --norc -e -o pipefail`; putting `grep -c` back turns the clean-log case red.
- 2026-09-29, round 2 (`/review 113` PASS on 75e754c, `/break` HOLES; test-only fixes):
  - `ac61Violations` flags a `shell` on any `lint`-job step and any `defaults` on the `lint` job (break hole 1).
  - `lint-coverage` pins the ordered list of objects that set `languageOptions.parser` (`next`, `next/typescript`, `typescript-eslint/base`) and those that set `language` (none) (break hole 2).
  - New red cases: step `shell: sh`, job `defaults.run.shell: sh`, a no-op parser block, a second block named `next` that sets a parser, and a `language` block. Each was seen red before the check existed, and again with the real files mutated.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#113](https://github.com/itsahmeds/flowers-overseas/pull/113). **Warnings before the flip:** `eslint .` on bfae5c9 gave 0 warnings and 0 errors over 610 files, so `--max-warnings 0` needed no fixes. What changed:
- `eslint.config.mjs` gains `fo/no-inline-config`, one object with no `files` key, setting `noInlineConfig: true` (AC-50).
- `pnpm lint:js` is `eslint . --max-warnings 0`, and `pnpm lint` also runs `check:no-literal-disable`.
- `stylelint.config.mjs` sets `ignoreDisables: true` (§13 Q18).
- The scan is rewritten (AC-51). It reads comments through TypeScript's parse tree, so JSX text and strings never count. It uses ESLint's directive grammar and covers 612 files. It adds `types/`, which the spec's root list leaves out but ESLint lints.
- The one disable, `ConsentBannerIsland.tsx` L170, is gone. The mount-only effect now reads its mount-time values from a ref and `secure()` moved to module scope, so behaviour is unchanged and no `fo/exception` block was needed.
- `ci.yml` folds the separate scan step into `pnpm lint`.

**Tests (unit):**
- T-54: 7 cases in `lint-fixtures.test.ts`, with the new fixture `tests/fixtures/lint/bare-disable.ts`.
- T-55: 31 cases in `no-literal-disable.test.ts`. One checks the scan's file list against ESLint's own `isPathIgnored` over `git ls-files`.
- T-56: 11 cases in the new `lint-coverage.test.ts`. It runs every tracked file in each table root, plus `noInlineConfig` for every file ESLint lints. Scratch configs go under `node_modules/.cache/` and are removed in `afterAll`.
- T-65: 7 cases in `ci-workflow.test.ts`, plus one T-51 stale-comment phrase.

**Mutations, each seen red:**
- `noInlineConfig` removed: T-54 and T-56.
- `--max-warnings 0` removed: T-54 and T-65.
- Each of the scan's four patterns deleted: T-55.
- `fo/no-raw-color` set to `off`: T-56.
- The `ci:full` guard put back on `lint`: T-65.
- `ignoreDisables` removed: T-54.

`plan/12` §2 gains a "Lint locks" row, because AC-62 names no row for this task. No expensive gate was run locally.

`gates:cheap` on 972f666 (clean tree): typecheck, lint, format:check, i18n:check, check:no-db and codebase:map --check all exit 0. Tests exit 0: 204 files, 5270 passed, 5 skipped. RESULT: PASS. A first run went red on `dev-os.test.ts` "leaves no temp project behind". Those were `fo-dev-os.*` folders from another worktree's run in the shared tmpdir, and the file is green alone.

**Handed on:**
- `README.md` rows for `pnpm lint` and `pnpm check:no-literal-disable` (L86, L102) still describe the old scripts. README is outside this fence.
- TASK-160, 162 and 163 add their rows to `TABLE` in `lint-coverage.test.ts`.

**Suggestions left open by round 1 (not required):**
- An unnamed block such as `{ files: ["src/**"], rules: { "react-hooks/exhaustive-deps": "off" } }` still passes. The `fo/exception/<path>` shape is enforced only on objects that carry that name, and a rule that is not in the lock table may be turned off by any block.
- `consent-islands.test.tsx` does not cover the `ConsentBannerIsland` mount-only effect. Inverting `initial !== null` stays green there, and the e2e `consent-banner.spec.ts` is its only cover.
- `lint-coverage`'s static `globalIgnores` union includes `eslint-config-next`'s own ignore objects, so dropping `.next/**`, `out/**`, `build/**` or `next-env.d.ts` from ours goes unseen. That is harmless, because ESLint still ignores them (review nit).
