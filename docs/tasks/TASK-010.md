# TASK-010 — Dev-OS checks: `tests/dev-os/` shell + Vitest tests for PreToolUse guard, `task.sh`, Stop hook; `dev-os:check` script + CI job

Row: `TASKS.md` → TASK-010. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-010-dev-os-check`. Must not edit `.claude/hooks/*` or `CLAUDE.md` (§3) — respected; the checks run the real scripts against throwaway project roots via `CLAUDE_PROJECT_DIR` and never read or write the repo's `.claude/state/active-task` or `TASKS.md` (`assert_not_repo_root` aborts with exit 99 if one ever resolves to the repo root). Tests: T-25 (19), T-26 (26), T-27 (15) = 60 shell assertions + 17 unit tests (`tests/unit/dev-os.test.ts`, incl. five negative cases proving the harness reports failure). T-27's "temp clone" implemented as a minimal temp project (`mktemp -d` + `.claude/state/` + fixture `TASKS.md`, `git init` for the Stop hook) rather than a clone of this repo — rationale in the PR body. CI 16/17 (`lighthouse` informational-red by design). `.claude/settings.json` allow-list entry `Bash(pnpm dev-os:check*)` (spec line 72) left to TASK-012.

## Read

- `specs/001-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `tests/unit/dev-os.test.ts`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#10](https://github.com/itsahmeds/flowers-overseas/pull/10); `/review` pass recorded in `TASKS.md`.
