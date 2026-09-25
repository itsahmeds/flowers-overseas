# Work order template

The orchestrator fills this in for **every** agent it dispatches: implementer, breaker, reviewer,
finisher, spec writer, advisor, designer or auditor. It is the whole of what the agent is told about its task. The agent cannot see the
orchestrator's conversation. Everything that is true for every task lives in `CLAUDE.md` and the
agent's own definition, and is **not** repeated here.

How to fill it in:
- **Aim for one page of task-specific content** (roughly 300–600 words). Give paths, not pasted
  content: no spec prose, no logs, no diffs.
- Write what to do, in plain sentences, not shouted MUSTs.
- Leave a field out only when it truly does not apply, and write `none` rather than deleting it.
- Copy everything from `---` to the end of the last role section that applies. Parts 1–5 always go
  in; add the role section for the agent you are sending.

Before sending, the orchestrator has checked the **Ready** list. A work order that fails one is
not sent:
- every task this one depends on is `done` on `main`, not only merged somewhere or assumed;
- the brief `docs/tasks/TASK-NNN.md` is filled in on the branch the agent will read, not a template;
- the brief's blockers are current (re-read, not remembered);
- the spec is `approved`, and every founder decision the task needs has been taken;
- the task does not share files with anything in `.claude/state/in-flight.md`, or the overlap is
  named under "Who else is working" with an owner for each shared file;
- starting this agent keeps the fleet at four or five agents at most (`CLAUDE.md` "Working on this
  machine").

---

## 1. The job

**Task:** TASK-NNN — <title> (or the spec / PR / decision for a role with no task) · **Role:**
implementer | breaker (round N) | reviewer (round N) | finisher | spec writer | advisor | designer |
auditor ·
**Size:** S | M | L
**Brief:** `docs/tasks/TASK-NNN.md` (on branch `task/TASK-NNN-<slug>`)
**Spec:** `specs/NNN-<slug>.md` — read `## 0. Index`, then only: <§ anchors for the AC ids owned>
**Map:** `docs/codebase-map.md`

**Why it matters:** <one or two sentences: what this protects or unlocks, and what "good" means
when something comes up that this order did not foresee>

**Done when:** <one line per AC id: the exact check that proves it, and what breaking it on
purpose looks like>
- AC-n — <check> · broken on purpose by <mutation> → <which case goes red>
- The cheap gates in `CLAUDE.md` "Definition of done" §2 exit 0, read one by one.
- CI green on your **head SHA** (not an earlier one).

## 2. The fence

**Only touch:** <files or directories this task owns>
**Do not touch:** <nearby files that belong to someone else, or that look tempting but are out of
scope> · no "while I'm here" changes anywhere.
**Who else is working right now:** <task → files, from `.claude/state/in-flight.md`; for every shared
file, who owns it and what you may do to it> | none

## 3. What we already know

**Already decided — do not reopen:** <rulings, founder decisions and measured facts, each with
where it is recorded> | none
**Known traps:** <what earlier attempts or review rounds found, what was ruled out, which
carry-forwards in the brief apply> | none

## 4. Rules of the road

**You may, without asking:** read anything · run the cheap gates and the tests your diff touches ·
commit · push your own branch · open a **draft** PR · update your brief's `## Progress`, `## Result`
and `## Escalations`.
**Never:** merge · add or remove labels · trigger workflows · push to `main` or to anyone else's
branch · mark any copy `reviewed` · edit a spec or ADR · change another task's row or brief ·
start a second task.

**Stop and hand back — report `blocked`, don't push on — when:**
- the spec or brief is ambiguous or silent on something you would have to decide;
- the work needs a file outside "Only touch";
- a gate goes red for a reason your diff did not cause;
- a founder decision is needed, or following the order would break a rule in `CLAUDE.md` or an ADR;
- <task-specific trigger, e.g. "the budget is still missed after the change: stop, don't tune">.

**Time:** S = 45 min · M = 90 min · L = 180 min · reviewer and breaker = 30 min per round ·
advisor = 30 min · spec writer and designer take the size limit. At the limit: commit,
push, write `## Progress`, and report `partial` with what is left. Don't start a new step after
the limit.

## 5. Coming back

**As you go:** after each coherent step, commit and push, and add one line to `## Progress` in the
brief (add the section above `## Result` if an older brief lacks it): what is done, what is next, and anything a replacement agent must know. Someone else may
have to finish from exactly where you stop.

**Report** — these boxes, in this order, with proof rather than claims:
1. **Status:** `done` | `partial` | `blocked` | `declined`, with a one-line reason.
2. **PR:** URL, head SHA, and CI state *on that SHA*, with a link to the run.
3. **AC by AC:** for each id, the evidence (test name, command and exit code, URL, screenshot path)
   and what went red when you broke it on purpose.
4. **Changed:** the files, and anything outside "Only touch" together with why.
5. **Found vs suggested:** what you observed, kept separate from what you recommend.
6. **Escalations:** each question, already written into the brief's `## Escalations`.
7. **Clean-up:** the processes you started and confirmation that each is stopped, the build slot
   released, the branch pushed, `task.sh clear` run.
8. **Time taken** against the size limit.

Keep the report under about 400 words. Detail belongs in the brief and the PR, not the report.

---

## Role: implementer

- Set the active task (`.claude/bin/task.sh set TASK-NNN`), create or check out the branch, write
  the tests first, and push and open the draft PR at the first coherent commit.
- Fix the code, not the tests: a test bent to go green is a defect, not progress.
- Before `gh pr ready`: rebase on `origin/main` and push. After it: add `ci:full`.

## Role: reviewer

- Read-only. Your only write is the temporary mutation you use to break a test, restored
  before you finish (`git status` clean).
- Round <N>: <round 1: full checklist | round 2+: scoped to `git diff <last-reviewed-sha> <head>`;
  do not re-read what earlier rounds passed>.
- Read CI on the head SHA; don't re-run what CI ran green. If the browser jobs did not run on
  the head: `FAIL — CI not run on head`.
- Verdict first (`VERDICT: PASS | FAIL`), posted with `gh pr review <n> --comment`. Required changes
  also go into the brief's `## Carry-forwards`, dated.

## Role: finisher (picking up someone else's run)

- **Start from:** branch `<branch>`, head `<sha>`. Commits already made: <list, one line each>.
- **Already done — do not redo:** <from the brief's `## Progress`>.
- **Left to do:** <only the remaining steps>.
- If the worktree has uncommitted changes you did not make, stop and report them. Don't commit
  or discard them.

## Role: auditor (SEO, launch)

- Read-only. Target: <env / URL set / page types> · sample sizes as the agent definition says.
- A local Lighthouse run goes inside the build slot and reports the load average.
- Output file: <`docs/audits/YYYY-MM-DD-<env>.md` | `docs/releases/…`>.

## Role: breaker

- Your job is to make this PR fail. You win when you find a hole, so look for one.
- Work in your **own** detached worktree at the head SHA (`git worktree add ../fo-break-<PR> <sha>`),
  never the implementer's or the reviewer's, and remove it when you finish.
- Round <N>: <round 1: the whole diff | round 2+: only `git diff <last-broken-sha> <head>` and the
  holes you reported last round>.
- Areas to attack: <from the diff — money, dates and cutoffs, order status, SEO gates, security,
  i18n; or "docs only: break whatever check reads the changed files">.
- Verdict first: `BREAKER: HOLDS | HOLES`, posted with `gh pr review <n> --comment`. The
  orchestrator copies each hole into the brief's `## Carry-forwards`; you write nothing.

## Role: spec writer

- Number `<NNN>` and slug `<slug>` (reserved in `plan/09`, or next free).
- Plan sections to read: <list>. Existing specs that overlap: <list> | none.
- Founder inputs already given: <answers, decisions> | none.
- Stop at `Status: draft` with the open questions in §13. The advisor reads it next.

## Role: advisor

- Subject: <`specs/NNN-<slug>.md` at `Status: draft` | the decision in `docs/adr/…` or in plain words>.
- What the founder is weighing: <the options as the founder sees them> | the whole spec.
- Opinion only. Open the memo with `ADVISOR: GO | GO WITH FIXES | NO-GO`, write it to
  `docs/advice/YYYY-MM-DD-<subject>.md`, and change nothing else.

## Role: designer

- Spec: `specs/NNN-<slug>.md` (`approved`). Page types and journeys it changes: <list>.
- Existing artboards to extend: <files in `docs/design/wireframes/` and `flows/`> | none.
- Registry copy that already exists: <paths in `messages/` or `src/config/`> | none.
- Write only under `docs/design/`. Open a draft PR with the `no-task` label (a design PR has no
  task ID); the founder looks at the canvas before `/plan-tasks`.

