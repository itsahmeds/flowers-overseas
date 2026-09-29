# TASK-156 — `release:status`, `release:promote` (fast-forward, lease, pinned SHA) and `release:rollback`, the rollback runbook steps and the push-to-`release` guard rules

Row: `TASKS.md` → TASK-156. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-156`; keep it current by editing this file, not the row.

## Binding

`specs/040-hosting-railway-cloudflare.md` §14 A3 L907: AC-35, AC-36, AC-39, AC-40 (T-36, T-37, T-38, T-40, T-43). `release:promote --sha --expect` is fast-forward only with a lease; `--create` makes `release` the first time; `release:rollback` is step 2 of the 2 a.m. runbook (step 1 is the dashboard redeploy); the guard denies agent pushes to `release` and `main`. Founder answers of 2026-09-28 (`docs/decisions-log.md`, last rows) and the advisor fixes are already written into the amendment; do not reopen them.

## Read

- `specs/040-hosting-railway-cloudflare.md`: read `## 0. Index` first, then only A19/A3's changes and the ACs named above
- `docs/codebase-map.md`: where everything lives
- docs/runbooks/rollback.md
- TASK-150's guard (merged first)
- TASK-155's deploy-triggers file (merged first)

## Carry-forwards

- **From `/break 104` and `/review 104` (2026-09-28):**
- Your test rows are **T-36, T-37, T-38, T-40, T-43**.
- `release:rollback --to` must be a commit production has already run successfully, or the previous release note's SHA, never just any ancestor; add that case to T-37.
- T-40 needs allowed branch names that contain `release` (e.g. `task/TASK-156-release-promote`) and deny rows for `--mirror`, `--delete release` and `+sha:release` (landed in A3 via PR 104).
- T-43 is the rollback rehearsal with the founder, recorded in `TASKS.md`.
- ~~Make the `CLAUDE.md` edits A3 owes.~~ Dropped by the founder, 2026-09-29 (see below).

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/break 108` (2026-09-28):** you wait for TASK-158, because both edit `package.json` (your `release:*` scripts, its lint flags).
- **From the founder (2026-09-29):** spec 040 A3's owed `CLAUDE.md` line and its W-n are dropped (`docs/decisions-log.md`, 2026-09-29); do not edit `CLAUDE.md` or `docs/framework/why.md`. The release mechanism is unchanged.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-29 — A3's owed `CLAUDE.md` line and its `W-n`** ("Production deploys only from
  `release`, which only `pnpm release:promote` moves…", spec 040 §14 A3, last paragraph; and the
  carry-forward "Make the `CLAUDE.md` edits A3 owes"). To: the founder, via the orchestrator.
  **Answered 2026-09-29: dropped.** No kernel line and no `W-n` are written; `CLAUDE.md` and
  `docs/framework/why.md` are not touched by this task. The mechanism (the three commands and the
  guard rules) stays.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-29 — started: row `in_progress`, kernel-line drop recorded under Escalations. Next: the
  T-36/T-37/T-38 integration tests (temporary bare repo) and T-40 guard rows, red first.
- 2026-09-29 — `scripts/release.ts` + `src/lib/release.ts` + the deployments query in
  `src/lib/railway.ts`; T-36/T-37/T-38 green (37 cases), each brief mutation seen red (ancestor
  check, lease, `--expect` check, any-ancestor). T-40 rows written in `bash-guard.test.sh`, red
  (140 failing) — next: the push/command rules in `bash_guard.py`, then runbook, plan/08, rebase.
- 2026-09-29 — finisher: AC-40 rules in `bash_guard.py` (`analyse_pushes`, `release_command_denial`);
  `bash-guard.test.sh` 477/477 green; each rule seen red with it removed (release rule 109, `--all`
  16, whole-refspec parse 64 with 0 allow rows red, substring match 20 allow rows red, HEAD 24,
  main 13, commands 16, refs/heads 32, `+` 14, glob 8, `cd` 1, `-C` 2). `release:*` scripts added
  to `package.json` (missing from `06219c0`). Next: runbook, plan/08, gates, rebase.
- 2026-09-29 — runbook hosting section (2 a.m. version (a)(b)(c), steps 1 and 2) and the plan/08 §6
  pointer to A3. Next: `codebase:map`, gates:cheap, rebase, ready, `ci:full`.
- 2026-09-29 — rebased on `origin/main` (TASKS.md: main's TASK-154/155 rows kept, this row kept);
  map regenerated; prettier on the release files and README rows for the three scripts (both
  forced by gates). gates:cheap PASS at `f848d93`. Next: ready, `ci:full`, CI.

## Result

PR https://github.com/itsahmeds/flowers-overseas/pull/115. `pnpm release:status`,
`release:promote` and `release:rollback` (`scripts/release.ts`, `src/lib/release.ts`, the
deployments query in `src/lib/railway.ts`, three `package.json` scripts with README rows); the shell
guard's AC-40 rules in `.claude/hooks/bash_guard.py` (`analyse_pushes`, `release_command_denial`);
the hosting section of `docs/runbooks/rollback.md` (the 2 a.m. version (a)(b)(c), then steps 1 and
2); one A3 pointer in `plan/08` §6. Tests: integration T-36/T-37/T-38 in
`tests/integration/release-{status,promote,rollback}.test.ts` (temporary bare repos), shell T-40 in
`tests/dev-os/bash-guard.test.sh` (477/477). Each AC-40 rule was removed in turn and its rows went
red; removing the destination parse turned 64 deny rows red and no allow row. **T-43**, the
rollback rehearsal with the founder, is owed until production `web` exists (TASK-104). It has not
been run. No expensive gate was run locally.

`pnpm gates:cheap` at `f848d93`. It ran with a private `TMPDIR`: TASK-159's gates were running in
`fo-wt-159` at the same time, and its dev-os check wrote `fo-dev-os.*` into the shared `$TMPDIR`,
which made `dev-os.test.ts` "leaves no temp project behind" fail twice on this tree:

```
gates:cheap · f848d93a29a2a905c9af2123004fcc097220d0f9 · tree clean · base origin/main · 2026-09-29T14:42:15.278Z
typecheck             exit 0 · 2.2 s
lint                  exit 0 · 9.6 s
format:check          exit 0 · 8.1 s
i18n:check            exit 0 · 0.4 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 145.0 s · changed 204 + map 0
RESULT: PASS
```
