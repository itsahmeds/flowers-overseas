# Framework gaps

What is still wrong with how this project is built, and which step fixes it. Opened 2026-09-25
with the founder; each step is planned and decided together before any change is made. When a
gap closes, mark it ✅ with the PR, and don't delete the row.

| # | Gap | In plain words | Step | Status |
|---|---|---|---|---|
| 1 | Rulebook too long, reads like a diary | Every agent read 1,900 words of rules and incident notes each time | A | ✅ PR 102 |
| 2 | Rulebook contradicts itself | Job descriptions said the opposite of `CLAUDE.md` in places | A | ✅ PR 102 |
| 3 | No standard work order | Every dispatch was written from scratch | B | ✅ PR 103 |
| 4 | Safety rules only on paper | Stop your processes, push early, one build at a time: nothing enforces them; anyone can release another agent's build lock | C | ✅ PR 107 (the shell guard refuses `pkill`, `killall`, `git stash`, wait loops and a `ci.yml` dispatch; the build slot is released only with its owner's token); push early (W-8) and the agent cap (W-11) stay unenforced, step G |
| 5 | Edit guard has a back door | It watches the Edit/Write tools only; a shell command can write into `src/`; the Stop hook forgets `db/` | C | ✅ PR 107 (the shell guard denies shell writes into application code with no task, in every branch worktree; the Stop hook reads `db/` from the shared `guarded_paths.py`); `python -c`, `node -e`, `git apply` and run-time command strings stay open, as the hook's header says |
| 6 | The CI label dance | Browser jobs run only with `ci:full`; a later push fires nothing; re-running means toggling the label | E | open |
| 7 | No breaker | "Break it on purpose" was one buried sentence | D | ✅ PR 103 (breaker on every PR; narrowed by W-21) |
| 8 | No advisors | Nobody gave the founder a second opinion on specs and decisions | D | ✅ PR 103 (one advisor, four angles) |
| 9 | Every agent runs on the most expensive model | Including the ones writing status reports | F | open |
| 10 | One generated file conflicts on every merge | `docs/codebase-map.md`: four rebases in one day | E | open |
| 11 | Outdated instructions | Vercel in the launch agent, Supabase in the standards, moved config paths | A | ✅ PR 102, except `docs/runbooks/rollback.md`'s hosting section (owned by spec 040 AC-13) |
| 12 | Nobody checks the process itself | Rules are added after incidents; nobody checks they are followed or still needed | G | open |
| 13 | `main` has no branch protection | GitHub would merge a PR with red CI | decided 2026-09-28 | **won't fix**: founder chose no branch protection; the orchestrator enforces the merge rule |
| 14 | The orchestrator has too few rules of its own | It broke `main` three times with untested commits and once committed onto an agent's branch | G | open |
| 15 | No designer | `CLAUDE.md` requires artboards before `/plan-tasks`, but no agent owned drawing them | D | ✅ PR 103 |
| 16 | Production gates don't sit in front of ordinary merges | Spec 040 deploys every merge to `main` to production, so `/launch production`'s gates guard only the release it is run for, not each task merge (found while fixing PR 103's hole H) | C | decided 2026-09-28: production deploys only from a release ref `/launch` promotes (spec 040 amendment) |
| 17 | Coding standards never audited | `plan/12` §2 and `CLAUDE.md` claim some coding standards are machine-enforced (e.g. a lint rule against direct order-status updates); none of those claims has been checked, and others rely on the reviewer noticing | H | ✅ audited 2026-09-28 (`docs/framework/standards-audit-2026-09-28.md`: 6 enforced, 14 partial, 3 words only, one split row, 6 false claims), and the founder's H2 locks landed (spec 001 §14 A20): no comment switches a lint rule off and the config cannot either, PR 113 (TASK-158); Zod at every body read, PR 116 (TASK-159); PII in log values, Sentry and our URLs, the logger's side doors and SDKs only in their adapters, PR 117 (TASK-160); the money lint's workarounds, PR 118 (TASK-161); the order-status lint's shapes, PR 119 (TASK-162); the branded `Minor` type, PR 120 (TASK-163). `plan/12` §2 states each check's limit. **Not done:** H3, the gaps in the other partial rules (literal strings, physical CSS, `Intl`, IP redirects: audit rows 1–3 and 13), and H4, go-live as data (row 16) |

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
- Agents sharing the session scratchpad deleted each other's files mid-run. The `/break 107` round-1 agent reported this to the orchestrator; it is not in its PR comment. The work order should tell every agent to use a private `mktemp -d` under `$TMPDIR`. Seen again on
  2026-09-30 (PR 127, reported to the orchestrator): a breaker and a reviewer both saved a runner as
  `mut.sh` in the session scratchpad, so the breaker's first ten mutations ran in the reviewer's
  worktree and left one stray line there. Stopgap in every work order since: every script and temp
  file stays inside the agent's own worktree. The work-order template does not say so yet (step E).
- Reviewers found the sandbox refusing `tasks:check`, `codebase:map --check` and `specs:index --check` locally in some runs (`/review 106` round 3). CI covered them. Watch for a repeat.
- Tests that scan English prose (T-50) can be chased indefinitely. Rule of thumb for step G: such a test catches a class of mistake, not every phrasing, and the breaker and reviewer reading each change are the backstop (`/review 106` HOLE 8(b) and HOLE 11).
- `gates:cheap` maps only framework paths to their tests. A docs-only diff touching `README.md`, `docs/runbooks/`, `docs/architecture.md` or `specs/_template.md` can print `RESULT: PASS` while `docs.test.ts`, `architecture-doc.test.ts` or `specs-index.test.ts` is red (`/break 106` hole 4). Widening A19 AC-43's path list needs a spec amendment.
- Dev-OS tests running in two worktrees at once share `$TMPDIR`, and a foreign `fo-dev-os.*` folder turns one case red. That's a false red only, never a false green (`/break 106`). Candidate fix: count only the folders your own run created.
- Orchestrator planning: three plans in a row were caught with the same class of error (guessed T-ids, fences missing the files that ACs, T-rows and fixtures name, concurrent tasks sharing a file). A planning checklist belongs in step G (gap 14).

**Found in wave 2 (PRs 110, 112, 113):**
- `/break 110` round 3: no fixture for a production trigger on an unknown `serviceId`; the code is correct.
- `/break 112` round 2: the shell lexer fails open on process substitution (`<(`, `>(`), so the clock allows it; also an unquoted heredoc joined by `$\`+newline, `$(( $(cmd) ))`, and a `BASH_ENV=` prefix. The `.claude/settings.json` → `docs.test.ts` `PATH_TESTS` entry has no `gates-cheap.test.ts` assertion.
- `/review 112`: `git push | tail` and `--body "$(cat f)"` are denied past the ceiling (work-order wording); stale clock files are never reaped; `git diff --output=` writes from the save set; the `<<\EOF` form is untested.
- `/break 112` round 1: `gh pr create --title "--draft"` passes as a draft.
- TASK-154 `## Result`: `SubagentStart` fires again on resume and resets the clock.
- Spec 040 §14 A3 (L1182–1186) still lists the `CLAUDE.md` line as owed "with the founder's approval"; the founder declined it on 2026-09-29 (`docs/decisions-log.md`), so the line is not owed. TASK-156's brief strikes it in PR for TASK-156.
- `/break 113` round 3: a parser replaced in place under the same name silences every TS file; candidate fix: an identity check (`parser === tseslint.parser`). HOLE 3 (`.stylelintignore`) was accepted; its leftovers are in `docs/tasks/TASK-158.md`.
- Orchestrator (step G, gap 14): it quoted a `pr-policy` run as CI twice; always read `gh run list --workflow ci`.

**Found in wave 3 (PRs 115–122):**
- Shell guard, still not caught (named in `bash_guard.py`'s header): `--config-env=alias.*`, `xargs`-fed refspecs, writing `.git/HEAD` directly; `gh api …/git/refs/heads/release` sits outside AC-40's "git push" wording.
- `/review 117` and `/break 117`: phone numbers written with a bracket next to a space (`+44 (0)20 …`, `+48 (22) …`) are not scrubbed, because the pattern allows one separator; a spec amendment is needed. `fs.writeSync(1, …)`, `process.emitWarning`, and Sentry's `transaction` / `logentry.message` fields are not scanned.
- `/break 119`: a `let` reassigned to `"orders"` before a `sql` template (SQL built at run time) lints clean; the rule's header states the limit.
- `/break 118` / TASK-161: an average of money through a callback (`xs.reduce(… priceMinor …) / n`) lints clean; the `Minor` type is the backstop.
- `/review 120` HOLE N1–N3 accepted: zod's `z.BRAND<"Minor">` alias, `.brand` through a template literal type or `["brand"]`, and `z.any()` behind a `z.ZodType<Minor>` annotation. `plan/12`'s Money row names them (PR 123), and the next task that touches `eslint/sdk-adapters.js` adds `BRAND` to the `$brand` entry.
- `/break 121` holes 1–5 accepted as prose-scanner variants; the visit-2 step "production runs the READY SHA" has no text test.
- `/break 122` / `/break 104`: `tasks:check` does not check that a row's dependency and AC ids exist (step E tooling). Seen again on `/break 130` (`AC-99` passes).
- Parallel agents: dev-OS tests collide in a shared `$TMPDIR` (seen again on TASK-156 and TASK-159); every agent now uses a private `TMPDIR`.
- Agents stalled on the stream watchdog four times on 2026-09-29; short commands and a push after every step kept the work, and a fresh finisher recovered each one (W-8).
- Orchestrator (step G): a paused `git rebase -i` was found in a worktree with no process behind it; it was aborted, and the reword was done with `git filter-branch --msg-filter`, which leaves every tree unchanged.

**Found by `/break 104`:**
- `tasks:check` and `specs:index --check` don't validate a task row's AC/T ids against its spec: a row changed to `AC-99, T-99` stays green. The orchestrator guessed spec 040's T-ids, and only the reviewer caught it. Candidate for step E tooling.

**Found on 2026-09-30 (PRs 125–130):**
- **The safety check refused a breaker's mutation runs** once it had touched another worktree
  (PR 127 round 1); later breakers, each in its own worktree, ran theirs. This is not the
  `.claude/`-files block above: it followed a breach of the own-worktree rule, and keeping to that
  rule avoided it. No founder decision is needed unless it recurs.
- **`pr-policy` refuses `no-task` for `package.json` and the lockfile**, correctly. The
  `NO_TASK_ALLOWED` list is spelled out only in the work order's Role: designer; the writing-roles
  paragraph (`work-order.md` §4) and the orchestrator's texts do not mention it, so PR 128 had to be
  moved to a task branch (PR 130, TASK-165).
- Nits from `/break 125` round 2: TASK-099's Order line cites a loose rule and sits under
  "_None recorded._"; TASK-157's closed escalation still names `onlyAbsentProductionServices`,
  which no longer exists in `src/lib/railway.ts`.

**Nits from the PR 103 rounds, still open:**
- W-18 says every field has a `TASKS.md` line but cites lines for only some of the eleven. ✅ PR 106
  (W-18 now says a line is cited where the Log has one).

**Nits from the PR 102 review, still open:**
- The `ci.yml` comments at L72–77 and L901 describe the old minutes budget. ✅ PR 106
  (`tests/unit/ci-workflow.test.ts` T-51).
- The guard test does not check that every `(why: W-n)` resolves. ✅ PR 106
  (`tests/unit/framework-text.test.ts` case 5).

**Found on 2026-10-02/03 (PRs 98–134):**
- **No check reads the new breaker-scope rule** (`/break 134` HOLE 1, accepted). `framework-text`
  case 3 pins `/break`, `HOLDS` and the reviewer-only wording, so the scope sentence in DoD §4 can
  be deleted or widened with every check green. When a spec 001 AC-44/T-46 task next opens (paused
  under "visible first"), case 3 should pin: the review-only definition, "every other PR keeps the
  breaker", the reviewer's binding call, the reviewer-confirmed class, and "The orchestrator never
  accepts a hole." as a whole sentence. It must be red under `/break 134`'s M2–M5, M7 and M8.
- **Agents ran out their time limit while reading.** TASK-126's first agent used its 180 minutes
  (the machine slept) and wrote no code; TASK-113's fourth finisher spent its limit on one long
  dump. Work orders now ask for the first visible stage to be pushed early, and for long
  enumerations to be avoided.
- **Two of TASK-113's escalations were never answered** (`docs/tasks/TASK-113.md`, 2026-09-22,
  both `open` at PR 98's merge). (1) Spec 008 §2 gives the country-less **category hub** no
  publisher and no inbound link; is it a sixth `site-links.ts` family, or the header's category
  rows through `categoryHref()` (`src/modules/ui/layout/header-model.ts`)? (2) The country **shop
  root** has no inbound link in `de` and `pl`, because its one publisher, the corridor page, does
  not exist in a draft locale; does the German and Polish shop wait for reviewed corridor copy, or
  does a draft locale get another inbound edge? Both are listed in `EXCLUDED`
  (`tests/support/shop-crawl-targets.ts`), which `tests/e2e/shop-reachability.spec.ts` asserts holds
  exactly these. A spec 008 amendment answers both. (1) must be answered before TASK-096 indexes
  the category hubs, and TASK-096's brief carries that. (2) costs reachability, not ranking: the
  `de`/`pl` shop roots stay `noindex` until their locale is reviewed, so it must be answered before
  either locale becomes indexable.
- **`next dev` writes into `CLAUDE.md`.** Next.js 16 adds a `<!-- BEGIN:nextjs-agent-rules -->`
  block to `CLAUDE.md` whenever the dev server starts. Nothing stops an agent from staging it;
  today the work order tells agents not to, and `git checkout -- CLAUDE.md` drops it. A check (the
  framework-text test, or a pre-commit refusal of that marker) would make it impossible.
- **Is a page's `<title>` or meta description copy, or an SEO gate?** DoD §4's review-only class
  names "copy keys" as presentation and "an SEO gate" as not. Copy that feeds `<title>`, meta
  description or JSON-LD (`seoTitle`, `seoDescription`, product descriptions) sits in both. The
  orchestrator classes it full (TASK-166); DoD §4 should say so. To decide with the founder.
- **Merging's first condition reads ambiguously** (`/review 134` round 2, nit 2): "a `/review`
  **pass** is recorded on it, unless DoD item 4 makes it review-only (…), its `/break` verdict…"
  can be read as "unless" waiving the review pass. The Never list prevents that reading in
  practice. Number the three conditions. To decide with the founder (framework text).
- Nits carried from the overnight rounds: `/break 133` round 2 — on a day after the first red day,
  `seed:check --report`'s "goes red on" column shows today, and the `redOn` comment in
  `seed/check.ts` says "the first destination day on which the rule is red" (code unchanged since
  `89e749bb`). `/review 129` round 2 — `.jpeg` originals, a `sku: null` row, the T-31/T-32 index
  line, and naming TASK-138 in A7; for the photo-intake task to pick up.

**Found on 2026-10-03, overnight (PRs 94, 135, 136, 138–140):**
- **Agents share one scratchpad, and a scratch name collided.** `/break 94` round 1's `mut.sh` was
  overwritten by the reviewer's script of the same name, which `cd`s into the reviewer's worktree,
  so six breaker runs ran (and `git checkout`-restored) inside the reviewer's worktree, as the
  breaker reported. The
  orchestrator now tells every read-only agent to name scratch files `<role><PR>-<name>` and to use
  absolute paths in scripts. The work-order template does not say so yet; adding it is a framework
  change to decide with the founder. The same applies to the `next dev` line in the entry above:
  the template does not yet carry it either.
- **Servers stopped by a `ps | grep` match.** Two PR 135 finishers reported stopping their own
  `next-server` by matching its name (both checked the PIDs were theirs). `pnpm exec` wraps the server, so the
  PID noted at start is the wrapper's, and killing it leaves the child listening. The kernel's
  "stop it by that PID" needs a recipe: start `node` directly, or note the child's PID.
- **Vercel's daily build limit.** Every push to a PR builds a Vercel preview, and the Hobby plan's
  limit was reached around 23:00 UTC on 2026-10-02 ("retry in 24 hours"); production stayed on
  `4ea52972` while PR 136 merged behind it. Whether to stop preview builds, or move plans, is the
  founder's account decision.
- **A flaky e2e case.** The same `consent-banner` forged-cookie case (`consent-banner.spec.ts`
  ~666–667) failed in three PR 135 runs (37070734831, 37073827670, 37080265401) and passed on
  retry and locally. Not this night's code; it needs a look
  before it hides a real failure.
- **Smaller nits, for whichever task next touches them:** `syncCopyLocale` (`seed/copy-draft.ts`)
  leaves `en`/`en-gb` `sourceHash` stale after `--sync-copy` (TASK-166 refreshed 143 by hand);
  `tests/fixtures/seed/_cases/copy/bad-word-count.json`'s `why` text predates the new sentence;
  the report-only CSP header carries `upgrade-insecure-requests`, which browsers ignore there with a
  console error (13 per page on `/en`); on macOS, `/EN` first answered 200 from the prerendered
  file (case-insensitive filesystem) before 404, so the uppercase cases should be watched on Linux
  CI; `test-integration` skips three files "until spec 002".
- **The shell guard misses file writes made through a Python heredoc.** TASK-167's implementer
  reported (to the orchestrator), and `/break 144` reproduced the miss, that its `python3 - <<'EOF'` writes under `tests/` and `seed/` went through while the
  main checkout's `TASKS.md` had no TASK-167 row (so the guard counted no active task). The header
  of `.claude/hooks/bash_guard.py` lists what it does not catch; this case should be added there or
  caught. A dev-OS guard change, to decide with the founder.
- **A build-time warning per page floods the build log.** `catalog.fx_stale` is logged once per
  rendered page; with every product page prebuilt (spec 009 §14 A6), PR 135's production build hit
  Vercel's 4 MB build-log cap. Log it once per build. The stale FX snapshot (2026-09-08) is why
  `en`/`de` product pages quote PLN.
- **Nits left by `/review 135` when TASK-126/127 closed,** for whichever task next touches them:
  `zoneCity()` prints an English city name ("Warsaw") into the cutoff line, so translated `de`/`pl`
  copy will read "w Warsaw" until a localised city key exists; `localeOf()` narrows with a bare `as`
  cast; `listing-honesty.ts:65` has no pattern for a bare "Arrives tomorrow" (no page prints a
  relative day today, and the product page's AC-10 test guards against one).
- **`railway-check` is not yet a step of `cloudflare-check`** (`/review 126` round 1 nit). Spec 040
  §5.5 and AC-34 say the nightly `cloudflare-check` job runs `pnpm railway:check`, so a trigger
  changed in the Railway dashboard shows up the next morning; `scripts/railway-check.ts` exists,
  but no CI step runs it, and TASK-100 did not build that step. It needs a task row (and a
  repository secret for the Railway token) before the nightly run covers AC-34.

**Found on 2026-10-03, day (PRs 126, 148, 152, 153, 162, 166):**
- **A push during a rebase closed PR 152.** Pushing the branch mid-rebase (HEAD equal to `origin/main`) left the PR with
  zero commits; GitHub closed it (15:55Z) and the later push did not reopen it; reopened by hand at 16:12Z. Rule to add:
  never push during a rebase, and after any force-push check `gh pr view --json state`.
- **A rebase-carry comparison must use the last *reviewed* head.** PR 152's carry ran `git range-diff` against the
  previous head (`baf4983d`) instead of the last reviewed head (`eb38f369`) and missed a stale duplicate paragraph left by
  an earlier conflict resolution. `CLAUDE.md` "Merging" should name the reviewed head as the comparison's old side.
- **`design-docs.test.ts` misses physical CSS in artboards** (`/review 166` round 1 nit): `margin-left` and `left:` in a
  `.dc.html` passed 183 of 183, so the logical-properties rule is not checked in `docs/design/`.
- **`media:upload --verify` has no retry** (TASK-168): `verifyPublished()` aborts the whole run on one `fetch failed`; it
  crashed at 144 ids and was re-run in groups of 16. Give it a bounded retry in the next media task.
- **`railway-check` hides GraphQL errors.** When Railway answers `data: null` with an `errors` array,
  `scripts/railway-check.ts` crashes with a `ZodError` instead of printing the error messages (the founder hit it on
  2026-10-03). Needs a task row under spec 040: print each error message (no data), exit 3.
- **The `container` job's scope step has TASK-100's depth-1 merge-base bug** (found by the TASK-100 finisher,
  `/review 126` round 2 nit 2): it runs `git merge-base FETCH_HEAD HEAD` on `actions/checkout@v4`'s depth-1 merge commit,
  finds no base and builds the image anyway, so it likely builds on every unlabelled PR. Needs a task row: the same
  `HEAD^1..HEAD` fix as `cloudflare-check`, with the reviewer's pin that the checkout step has no `with.ref`.
- **The decisions log holds a duplicate row.** "Runbook F1–F5 done; TASK-157 closes on T-44's paste" is on `main` twice
  (PR 153, the second a reworded copy that also records the founder's "railway configured"). The log is append-only, so
  the duplicate stays; read the second row as the one of record. A check that refuses duplicate decision titles would catch
  the next one.
- **The orchestrator's merge-guard script misread `SKIPPED=1` as pending.** Its `grep '=1 '` for checks with an empty
  status also matched a `SKIPPED=1` count, so a green PR looked unfinished. Match empty-status entries with
  `'(^| )=[0-9]'`; better, read `statusCheckRollup` as JSON with `jq`.
- **The shipped footer prints "Card payments are processed by Stripe" in Phase 0,** against spec 004 §14 A10 (it renders
  only once a payment integration ships). The v2 `chrome-*` artboards mark it hidden; carried in TASK-176's brief.
- **Open questions from `/review 166` round 2 (design v2), for TASK-178 and TASK-179.** In the reviewer's words: (1) "The
  equivalents are joined with ' · ', while clause 6(b) says to use the `format.ts` list formatter. The spec's own example
  uses ' · ' too. TASK-178 should say which separator the formatter emits." (2) "In the fresh-rate PDP, the add-on rows
  stay in złoty and carry the currency sentence, while the bouquet and total are in euro. This matches the shipped
  `AddonPriceList`, but TASK-178/179 should decide whether add-ons follow the display currency." Orchestrator ruling
  2026-10-04: TASK-178 joins equivalents with the `format.ts` list formatter (spec 004 A21 clause 6(b) says so). Add-on
  prices stay in the destination's currency, as the shipped `AddonPriceList` and TASK-179 (E-1) keep them; showing them
  in the display currency needs add-on FX pricing and belongs to the checkout spec (010), not Phase 0. The briefs are on
  open branches (PRs 169, 170), so their work orders carry the ruling.
- **Date-driven blocks shift visual baselines by a sub-pixel amount every day** (PR 168, 2026-10-04). The server-rendered product date grid has fractional row heights that change with where Sundays and occasions fall, so every block below it re-rounds; the baseline taken at 21:50Z failed after 00:00Z on identical code. Fixed for the product blocks by hiding `[data-fo-date-grid]` in their `stylePath` sheet. The home's occasion-dates band, the occasion hubs' date tables and the country-occasion dated line carry the same risk (TASK-176–179 work orders carry the rule). No unit test pins the `data-fo-date-grid` attribute the sheet depends on.
- **The home LCP sits about 3% under its budget** (PR 168): /en measured 2054 ms against 2000 ms once on CI (run 37167556805), and 1830–1978 ms on the other runs on the same code. One unlucky runner flips the gate. Spec 004 §14 A18 says `median` alone would turn `/` red; the fix is `median` together with the HTTP/2 origin (TASK-103). No rule exists yet for a red `lighthouse` on a test-only diff; PR 168's run was re-run by the orchestrator, recorded here, and the decision belongs to TASK-103 or the founder.
- **Every label toggle restarts `ci`.** `ci` triggers on `labeled` in one concurrency group per PR, so adding `visual:baselines` (or `no-task`) cancels a running `ci` on the same head (two TASK-175 runs were cancelled this way).
- **The honesty scan treats "Blumen" as a florist name.** German "Blumen senden" fails the partner/shop-name pattern, so TASK-176 and TASK-177 used "Strauß senden". The pattern needs a word list, not a substring.
- **The auto-mode classifier refused the orchestrator recording the founder's copy approval** (`record-approval.py`, [External System Writes]), even with the founder's written authorisation. The founder ran it themselves. Founder-approval recording stays a founder action until the permission rules allow it.
- **`pnpm -s` is not a valid flag here**, and a `--verify` run through it printed help and exited 0 through `tail`. Read the exit code of the command itself (`${pipestatus[1]}`), never of the pipe.
- **A reviewed record can carry changed text and stay "reviewed"** (`/break` round 1 on PR 170, holes C6c, G1 and C7a). For `en` copy (message keys, seed rows, corridor guides) the `sourceHash` is the hash of the *current* text, so it only checks itself: a writer who rewords a reviewed record and refreshes its hash keeps `reviewed: true` and the old `reviewedBy`/`reviewedAt` over text nobody reviewed, and `i18n:check`, `seed:check` and `corridor:check` all pass. PR 170 pins the 2026-10-04 founder batch by exact text (`tests/unit/copy-batch-2026-10-04.test.ts`), which closes it for that batch only. The general fix is a check that stores the **attested** hash beside the current one (written only by the attestation tool) and fails when they differ on a reviewed record. Needs a spec 003/006/007 amendment and a task; the reviewer decides whether to accept the general mechanism meanwhile.
