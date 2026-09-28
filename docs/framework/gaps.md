# Framework gaps

What is still wrong with how this project is built, and which step fixes it. Opened 2026-09-25
with the founder; each step is planned and decided together before any change is made. When a
gap closes, mark it ✅ with the PR, and don't delete the row.

| # | Gap | In plain words | Step | Status |
|---|---|---|---|---|
| 1 | Rulebook too long, reads like a diary | Every agent read 1,900 words of rules and incident notes each time | A | ✅ PR 102 |
| 2 | Rulebook contradicts itself | Job descriptions said the opposite of `CLAUDE.md` in places | A | ✅ PR 102 |
| 3 | No standard work order | Every dispatch was written from scratch | B | ✅ PR 103 |
| 4 | Safety rules only on paper | Stop your processes, push early, one build at a time: nothing enforces them; anyone can release another agent's build lock | C | open |
| 5 | Edit guard has a back door | It watches the Edit/Write tools only; a shell command can write into `src/`; the Stop hook forgets `db/` | C | open |
| 6 | The CI label dance | Browser jobs run only with `ci:full`; a later push fires nothing; re-running means toggling the label | E | open |
| 7 | No breaker | "Break it on purpose" was one buried sentence | D | ✅ PR 103 (breaker on every PR) |
| 8 | No advisors | Nobody gave the founder a second opinion on specs and decisions | D | ✅ PR 103 (one advisor, four angles) |
| 9 | Every agent runs on the most expensive model | Including the ones writing status reports | F | open |
| 10 | One generated file conflicts on every merge | `docs/codebase-map.md`: four rebases in one day | E | open |
| 11 | Outdated instructions | Vercel in the launch agent, Supabase in the standards, moved config paths | A | ✅ PR 102, except `docs/runbooks/rollback.md`'s hosting section (owned by spec 040 AC-13) |
| 12 | Nobody checks the process itself | Rules are added after incidents; nobody checks they are followed or still needed | G | open |
| 13 | `main` has no branch protection | GitHub would merge a PR with red CI | decided 2026-09-28 | **won't fix**: founder chose no branch protection; the orchestrator enforces the merge rule |
| 14 | The orchestrator has too few rules of its own | It broke `main` three times with untested commits and once committed onto an agent's branch | G | open |
| 15 | No designer | `CLAUDE.md` requires artboards before `/plan-tasks`, but no agent owned drawing them | D | ✅ PR 103 |
| 16 | Production gates don't sit in front of ordinary merges | Spec 040 deploys every merge to `main` to production, so `/launch production`'s gates guard only the release it is run for, not each task merge (found while fixing PR 103's hole H) | C | decided 2026-09-28: production deploys only from a release ref `/launch` promotes (spec 040 amendment) |
| 17 | Coding standards never audited | `plan/12` §2 and `CLAUDE.md` claim some coding standards are machine-enforced (e.g. a lint rule against direct order-status updates); none of those claims has been checked, and others rely on the reviewer noticing | H | audited 2026-09-28: `docs/framework/standards-audit-2026-09-28.md` (6 enforced, 14 partial, 3 words only, one split row, 6 false claims); locks to decide |

**Carried to step C with the enforcement work** (they are code, so they need a spec note and a task):
- nothing reads the new agent, skill and template files, or `## Progress`, or the breaker in DoD §4
  and the merge rule: deleting any of them leaves every check green (the breaker, PR 103);
  ✅ PR 106: `tests/unit/framework-text.test.ts` (spec 001 AC-44), red by deletion on a scratch
  copy passed as `FRAMEWORK_ROOT`;
- `scripts/pr-policy.ts` guards only `src/ tests/ db/ seed/ emails/`, so an owner's `no-task` PR can
  change `scripts/`, `.github/`, `messages/` or `package.json` unchecked (the breaker, PR 103);
  ✅ PR 106: the `NO_TASK_ALLOWED` allow-list (spec 001 AC-47);
- the breaker cannot mutate `CLAUDE.md` or `.claude/` files under this session's auto-mode
  classifier, even inside its own worktree, so framework holes are closed by replay, not mutation
  (founder decided 2026-09-28 to keep it blocked; revisit once tests read those files);
  PR 106's `FRAMEWORK_ROOT` lets a breaker mutate a scratch copy instead, which reaches the
  revisit trigger; the orchestrator raises it;
- `.prettierignore` excludes `.claude/`, `docs/`, `plan/`, `specs/` and `CLAUDE.md`: no formatter
  checks any framework file; decided 2026-09-28 (spec 001 §13 Q13: not reformatted), and
  `pnpm gates:cheap` prints what `format:check` covers (PR 106);
- a unit test that fails if a skill stops pointing at `.claude/templates/work-order.md`; ✅ PR 106;
- `pnpm gates:cheap`, one command for every cheap gate, whose output is the report's proof;
  ✅ PR 106;
- real time limits (the work order's limits are written, not enforced).

**From the PR 103 breaker, round 5, for the release work (gap 16):**
- `RELEASE: READY` must name the SHA its gates ran on, and the merge/promotion must be pinned to it, or a push between the two launch visits reaches production ungated.
- `work-order.md` Role: launch still says "May … promote to the target"; for production the promotion is the orchestrator's act.
- A production `HALTED` has no step that commits the release note.

**Orphan carry-forwards (no open task owns them yet):**
- From `/review 90` round 2, rescued in PR 105: the commitlint resolver has five test cases (`tests/unit/ci-workflow.test.ts` L730–830; the fifth case starts at L800) and the review asked for a sixth. See `docs/tasks/TASK-137.md`.

**Found in wave 1 (PRs 106–108):**
- Shell-guard evasions outside A19 AC-37's list (`/break 107`): `timeout N` as a prefix; kills via `ps|grep`, `pgrep|while read`, `xargs sh -c`, `fuser -k`; writes via `rsync`, `curl -o`, `tar -C`, `patch`, `git restore`, and `rm -rf` from the repo root; `gh workflow run ./path` or a numeric id; `echo … | bash`, `bash <<< …`. Candidates for an A19 amendment.
- Agents sharing the session scratchpad deleted each other's files mid-run. The `/break 107` round-1 agent reported this to the orchestrator; it is not in its PR comment. The work order should tell every agent to use a private `mktemp -d` under `$TMPDIR`.
- Reviewers found the sandbox refusing `tasks:check`, `codebase:map --check` and `specs:index --check` locally in some runs (`/review 106` round 3). CI covered them. Watch for a repeat.
- Tests that scan English prose (T-50) can be chased indefinitely. Rule of thumb for step G: such a test catches a class of mistake, not every phrasing, and the breaker and reviewer reading each change are the backstop (`/review 106` HOLE 8(b) and HOLE 11).
- `gates:cheap` maps only framework paths to their tests. A docs-only diff touching `README.md`, `docs/runbooks/`, `docs/architecture.md` or `specs/_template.md` can print `RESULT: PASS` while `docs.test.ts`, `architecture-doc.test.ts` or `specs-index.test.ts` is red (`/break 106` hole 4). Widening A19 AC-43's path list needs a spec amendment.
- Dev-OS tests running in two worktrees at once share `$TMPDIR`, and a foreign `fo-dev-os.*` folder turns one case red. That's a false red only, never a false green (`/break 106`). Candidate fix: count only the folders your own run created.
- Orchestrator planning: three plans in a row were caught with the same class of error (guessed T-ids, fences missing the files that ACs, T-rows and fixtures name, concurrent tasks sharing a file). A planning checklist belongs in step G (gap 14).

**Found by `/break 104`:**
- `tasks:check` and `specs:index --check` don't validate a task row's AC/T ids against its spec: a row changed to `AC-99, T-99` stays green. The orchestrator guessed spec 040's T-ids, and only the reviewer caught it. Candidate for step E tooling.

**Nits from the PR 103 rounds, still open:**
- W-18 says every field has a `TASKS.md` line but cites lines for only some of the eleven. ✅ PR 106
  (W-18 now says a line is cited where the Log has one).

**Nits from the PR 102 review, still open:**
- The `ci.yml` comments at L72–77 and L901 describe the old minutes budget. ✅ PR 106
  (`tests/unit/ci-workflow.test.ts` T-51).
- The guard test does not check that every `(why: W-n)` resolves. ✅ PR 106
  (`tests/unit/framework-text.test.ts` case 5).
