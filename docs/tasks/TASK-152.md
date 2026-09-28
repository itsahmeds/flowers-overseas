# TASK-152 — `pnpm gates:cheap` (every cheap gate, every exit code, a pasteable proof block) and the framework-text guard tests with a `FRAMEWORK_ROOT`

Row: `TASKS.md` → TASK-152. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-152`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A19 L612: AC-43, AC-44 (T-45, T-46). `pnpm gates:cheap` runs every cheap gate in `CLAUDE.md` DoD §2, reads every exit code, prints a pasteable proof block, and prints which paths `format:check` covers (Q13's alternative). The framework-text tests take a `FRAMEWORK_ROOT` so a breaker can delete-and-watch-red on a scratch copy. Founder answers of 2026-09-28 (`docs/decisions-log.md`, last rows) and the advisor fixes are already written into the amendment; do not reopen them.

## Read

- `specs/001-repo-dev-os-bootstrap.md`: read `## 0. Index` first, then only A19/A3's changes and the ACs named above
- `docs/codebase-map.md`: where everything lives
- package.json scripts
- tests/unit/agent-orientation.test.ts (the pattern to extend)
- CLAUDE.md, .claude/templates/work-order.md, docs/framework/why.md (what the tests read)

## Carry-forwards

- **From `/review 104` round 2 (2026-09-28):** the spec chose the path→test **map** (`PATH_TESTS`), not `forceRerunTriggers`; the spec wins over the "or" above. Build TASK-152 **before** TASK-153 in your shared run. TASK-154 later adds T-47's test to your map.

- **From `/break 104` (2026-09-28):** `vitest --changed` finds no tests for a non-code change. So when only `CLAUDE.md` or `.claude/hooks/*.sh` changes, `gates:cheap` must still run the framework-text, dev-os and ci-workflow tests (use `forceRerunTriggers` or a path→test map), with a T-45 row. Name exactly which DoD §2 sentence the drift test reads, because that section also backticks the expensive gates. Make the `CLAUDE.md` edit A19 owes for AC-43.

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-28 · `.claude/skills/spec/SKILL.md` is outside the fence** (to the orchestrator; `open`). AC-44 case 1 is "red on today's tree: `/spec` launches `spec-writer` with no pointer. The implementing PR adds it." Tested fix (on a scratch copy, 23/23 green): step 2 → "Launch the `spec-writer` agent with a filled-in `.claude/templates/work-order.md` (spec writer role): the feature, …".
- **2026-09-28 · `CLAUDE.md` DoD §4 has no `HOLDS`** (to the orchestrator; `open`). AC-44 case 3 says "DoD §4 names `/break` and `HOLDS`"; today only "Merging" names `HOLDS`, and the fence gives me only the DoD §2 line. Tested fix: "a `/break` verdict (`HOLDS`, or `HOLES`) **on the current head SHA**".
- **2026-09-28 · `tests/unit/agent-orientation.test.ts` is outside the fence** (to the orchestrator; `open`). AC-44 case 2 says its five-heading case "becomes six". TASK-150+151 edits the same file (T-53). `framework-text.test.ts` case 2 already asserts `## Progress` above `## Result`; adding `"## Progress"` to that list is a one-line change for whoever owns the file.
- **2026-09-28 · `README.md` is outside the fence** (to the orchestrator; `open`). `tests/unit/docs.test.ts` (AC-30) requires every `package.json` script in README's scripts table exactly once, so adding `gates:cheap` needs one README row, e.g. "`pnpm gates:cheap` | every cheap gate of `CLAUDE.md` DoD §2 plus the related unit/contract tests; paste its block".
- **2026-09-28 · Orchestrator ruling on all seven escalations of PR 106:** the fence is widened to every one of them ("the fence was my mistake: every file is one the spec itself requires"). Applied: the `/spec` skill pointer, `HOLDS` in DoD §4 (that wording only), the `pr-policy.yml` `--jq` and header, the README `gates:cheap` row, W-18's sentence, `agent-orientation.test.ts` five → six headings (TASK-150+151 may add a T-53 case to the same file; whichever PR merges second rebases and keeps both). gaps.md row 5 is marked by whichever of PR 106 and the TASK-150+151 PR merges second; PR 107 was still open on `origin/main` `d85b69e`, so row 5 stays open here.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-28 · `scripts/gates-cheap.ts` + `pnpm gates:cheap`, `PATH_TESTS` (incl. T-50's `work-order-roles.test.ts`), `tests/unit/gates-cheap.test.ts` (T-45 runner + map), `tests/unit/framework-text.test.ts` (T-46 five cases + T-45 drift, `FRAMEWORK_ROOT`), CLAUDE.md DoD §2 line. Red on the real tree until out-of-fence edits land (see `## Escalations`): `/spec` skill pointer, DoD §4 `HOLDS`. Next: TASK-153.
- 2026-09-28 · TASK-153 committed on the same branch (see its brief). Blocked on the out-of-fence edits in `## Escalations`; PR 106 stays draft until they land.
- 2026-09-28 · Ruling applied (see `## Escalations`), rebased on `origin/main` `d85b69e`; all 11 red cases green on the real tree; row set `in_review`.
- 2026-09-28 · `/review 106` + `/break 106` round 1 fixes: gates-cheap cases for an untracked `.claude/hooks/new.sh` and a throwing lister; brief escalations bullet restored and the ruling given its own bullet; `## Result` updated. Breaker hole 4 and the dirty-tree PASS left as the orchestrator ruled.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 106 (ready, `ci:full`, shared with TASK-153; CI green on `0955ed7` before `/review 106` round 1). `scripts/gates-cheap.ts` + `pnpm gates:cheap`; `PATH_TESTS` with the spec's entries plus T-50's `work-order-roles.test.ts`. Tests: `tests/unit/gates-cheap.test.ts` 18 (T-45 runner, block, map, temp git repos, stubbed Vitest calls); `tests/unit/framework-text.test.ts` 23 (T-46's five cases over `FRAMEWORK_ROOT`, 12 red-by-deletion cases on scratch copies, 4 T-45 drift fixtures). 23/23 green on the real tree; each of the five subjects deleted in its own copy turns exactly its case red. No build slot taken; no expensive gate run. TASK-154 adds T-47's test to `PATH_TESTS`.
