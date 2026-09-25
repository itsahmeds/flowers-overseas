# Framework gaps

What is still wrong with how this project is built, and which step fixes it. Opened 2026-09-25
with the founder; each step is planned and decided together before any change is made. When a
gap closes, mark it ✅ with the PR, and don't delete the row.

| # | Gap | In plain words | Step | Status |
|---|---|---|---|---|
| 1 | Rulebook too long, reads like a diary | Every agent read 1,900 words of rules and incident notes each time | A | ✅ PR 102 |
| 2 | Rulebook contradicts itself | Job descriptions said the opposite of `CLAUDE.md` in places | A | ✅ PR 102 |
| 3 | No standard work order | Every dispatch was written from scratch | B | this PR |
| 4 | Safety rules only on paper | Stop your processes, push early, one build at a time: nothing enforces them; anyone can release another agent's build lock | C | open |
| 5 | Edit guard has a back door | It watches the Edit/Write tools only; a shell command can write into `src/`; the Stop hook forgets `db/` | C | open |
| 6 | The CI label dance | Browser jobs run only with `ci:full`; a later push fires nothing; re-running means toggling the label | E | open |
| 7 | No breaker | "Break it on purpose" was one buried sentence | D | this PR (breaker on every PR) |
| 8 | No advisors | Nobody gave the founder a second opinion on specs and decisions | D | this PR (one advisor, four angles) |
| 9 | Every agent runs on the most expensive model | Including the ones writing status reports | F | open |
| 10 | One generated file conflicts on every merge | `docs/codebase-map.md`: four rebases in one day | E | open |
| 11 | Outdated instructions | Vercel in the launch agent, Supabase in the standards, moved config paths | A | ✅ PR 102, except `docs/runbooks/rollback.md`'s hosting section (owned by spec 040 AC-13) |
| 12 | Nobody checks the process itself | Rules are added after incidents; nobody checks they are followed or still needed | G | open |
| 13 | `main` has no branch protection | GitHub would merge a PR with red CI | C (to decide) | open |
| 14 | The orchestrator has too few rules of its own | It broke `main` three times with untested commits and once committed onto an agent's branch | G | open |
| 15 | No designer | `CLAUDE.md` requires artboards before `/plan-tasks`, but no agent owned drawing them | D | this PR |

**Carried to step C with the enforcement work** (they are code, so they need a spec note and a task):
- nothing reads the new agent, skill and template files, or `## Progress`, or the breaker in DoD §4
  and the merge rule: deleting any of them leaves every check green (the breaker, PR 103);
- `scripts/pr-policy.ts` guards only `src/ tests/ db/ seed/ emails/`, so an owner's `no-task` PR can
  change `scripts/`, `.github/`, `messages/` or `package.json` unchecked (the breaker, PR 103);
- the breaker cannot mutate `CLAUDE.md` or `.claude/` files under this session's auto-mode
  classifier, even inside its own worktree, so framework holes are closed by replay, not mutation
  (the founder decides whether to allow it; no agent changes permission settings);
- `.prettierignore` excludes `.claude/`, `docs/`, `plan/`, `specs/` and `CLAUDE.md`: no formatter
  checks any framework file;
- a unit test that fails if a skill stops pointing at `.claude/templates/work-order.md`;
- `pnpm gates:cheap`, one command for every cheap gate, whose output is the report's proof;
- real time limits (the work order's limits are written, not enforced).

**Nits from the PR 103 rounds, still open:**
- W-18 says every field has a `TASKS.md` line but cites lines for only some of the eleven.

**Nits from the PR 102 review, still open:**
- The `ci.yml` comments at L72–77 and L901 describe the old minutes budget.
- The guard test does not check that every `(why: W-n)` resolves.
