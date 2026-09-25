# Why each rule exists

`CLAUDE.md` is the kernel: the rules, in the present tense, with no history. This file is the
history. Each entry is the incident or measurement that produced a rule, so nobody deletes a rule
later thinking it is ceremony. A rule in the kernel points here as `(why: W-n)`.

Agents do not need to read this file to work. Read it before you **change or remove** a rule.

Adding a rule: write the rule in `CLAUDE.md` in one or two plain sentences, add the story here
under the next free `W-n`, and link the two. Never put dates, PR numbers or "correction" notes in
`CLAUDE.md` itself.

---

## W-1 · CI is the gate of record; implementers run only the cheap checks

**2026-09-18.** A median implementer run was 30 minutes; the tail reached 346, 243, 199 and 196
minutes. Every agent was re-running about 950 browser tests (build, e2e in four locales, axe, visual
baselines, Lighthouse) that CI ran again anyway. With eight agents on an eight-core Mac the
15-minute load average sat at 32, and under that load Lighthouse measures the machine, not the
site. The expensive gates moved to CI, which runs them on dedicated runners.

## W-2 · The `ci:full` label

**2026-09-18.** The browser jobs (`preview`, `e2e`, `visual`, `a11y`) are guarded by
`contains(labels, 'ci:full')`. They had never run on any PR in the repo, and the label itself did
not exist until PR 85. The guard exists because of the Actions-minutes budget (spec 001 §14 A14,
2026-09-09): GitHub Free gave the then-private repo 2,000 minutes a month at roughly 30 minutes a
full run.

## W-3 · Draft first, then ready, then label

**2026-09-18, TASK-109.** `ci.yml` triggers on `pull_request: [ready_for_review, labeled]` only, so
a PR created directly as ready fired no run at all.

## W-4 · Re-run by toggling the label, never `gh workflow run`

**2026-09-21, PRs 84 and 93.** A push to a PR that is already ready and labelled fires nothing.
A `workflow_dispatch` looks like a re-run but `preview`'s guard is
`github.event_name == 'pull_request'`, so it skips, and `e2e`, `a11y` and `visual` skip with it —
the dispatch reaches the spine and never the browser chain, which is the half you re-ran for.
(`lighthouse` hangs off `build` with no guard, so it does run on a dispatch; the old `CLAUDE.md`
listed it among the skipped jobs, which was wrong.)

## W-5 · Rebase before `gh pr ready`; no run fires on a conflicting PR

**2026-09-23 (day 6).** GitHub fires no `pull_request` run while a PR conflicts with `main`, and
the only symptom is that no run appears. The generated `docs/codebase-map.md` conflicted every open
PR after every merge and cost four rebases in one session. Regenerate it; never hand-merge it.

## W-6 · Green against the head you merge

**2026-09-22, PR 88.** Merged on a green run that predated its own 17-path rebase, so the tree
that landed on `main` had never been through CI. `gh pr view --json statusCheckRollup` reports the
latest run, not necessarily one against the current head.

## W-7 · The orchestrator merges on review pass + green CI

**2026-09-22, founder's instruction.** Eight agents produced PRs faster than one person could
click merge, so merges became the bottleneck. The review stays the gate; only the clicking changed
hands. The `visual` gate was excused while TASK-139's Linux baselines were missing; they landed in
PR 95 on 2026-09-22, and `visual` has been green on PRs 98, 99 and 100 since, so no gate is excused.

## W-8 · Push as soon as there is one coherent commit

**2026-09-22, TASK-113.** An eight-hour run existed only in a worktree on one laptop, with no
remote branch and no PR, when its session ended. It was saved only because the orchestrator went
looking. **2026-09-16/17:** every background Opus agent hit the 600-second stream watchdog for
several hours. The fix adopted was to commit after each coherent step and to replace a
twice-stalled agent with a fresh finisher on a tight brief, which worked first time for TASK-105.

## W-9 · The build slot is a lock, not a `pgrep` wait loop

**2026-09-18.** Agents were told to sleep until
`pgrep -f "next build|next start|playwright|lighthouse"` came back empty. That pattern matches the
waiting shell's own command line, so waiters blocked themselves and each other forever: four
waiting shells against sixteen real processes. Likeliest cause of the 346/243/199-minute runs.
`.claude/bin/build-slot.sh` uses an atomic `mkdir` lock that is reaped after 45 minutes.

## W-10 · Stop only what you started, by its own PID

**2026-09-21, TASK-112.** A broad `pkill -f "next-server"` killed the sibling agents' servers too,
including TASK-110's in the middle of its run.

## W-11 · Four or five agents, never eight

**2026-09-18.** Two Next builds at once exhaust 16 GB, so the build slot is serialised. Past four
or five agents the extra ones only add contention for the slot and for review; the ninth agent
makes the first eight slower. Throughput is capped by the slot and by review, not agent count.

## W-12 · Never `git stash`

Every worktree shares one `.git`, so a stash made in one worktree is visible to, and can be popped
by, every other agent.

## W-13 · No assertion may pass with its subject removed

Three times the project shipped a test that tested nothing:
- **PR 89:** `expect([200, 404]).toContain(status)` where those are the only two statuses the route
  can return.
- **PR 84:** an AC "proved" by prose instead of the fixture flip its brief bound.
- **PR 87:** `seo:validate` checked the type allow-list and nothing else, so a document with
  breadcrumb positions `0, 7`, an unnamed `ListItem` and a nameless `Organization` reported
  `1 fixture(s) ok`.

Each was caught by a reviewer **breaking the test** — mutating the subject and watching the case go
red — never by reading it.

## W-14 · A performance number carries the load average

**2026-09-18.** Lighthouse figures collected at a load average of 32 described the machine. A
local performance number without the load average beside it is not evidence.

## W-15 · A breaker on every PR

**2026-09-25, founder's decision.** Ten tests that could not fail reached PRs on 2026-09-21/22, and
every one was caught by someone changing the code on purpose, never by someone reading the test
(W-13). A reviewer judges against a checklist and leans towards passing. Anthropic's own write-up
on long-running agents makes the same point: agents grade work leniently, and a separate tester
catches more (https://www.anthropic.com/engineering/harness-design-long-running-apps, 2026-03-24:
a generator agent paired with a separate evaluator agent). So the breaker is its own agent, it only wins by finding a hole, and it runs on every
PR, including docs-only ones, where it breaks whatever check reads the changed files. The founder
chose every PR over risky-only PRs.

## W-16 · An advisor before the founder approves

**2026-09-25, founder's decision.** The founder is new to software and approved specs with only the
orchestrator's explanation — and the orchestrator is on the side that wrote them. Phase 1 (payments)
is next, where a legal or money mistake is expensive. The advisor is one agent with four angles
(building, Google, law and compliance, customer) and no power. It is not a lawyer: VAT and terms
still need a human professional's sign-off (`docs/compliance/`).

## W-17 · A designer owns the artboards

**2026-09-25.** `CLAUDE.md` required `.dc.html` artboards before `/plan-tasks` (TASK-059), and
implementers must match them, but no agent's definition said who draws them. A rule with no owner
is a rule that happens by accident. The founder chose a separate designer over folding it into the
spec writer, which also gives the founder a moment to look before anything is built.

## W-18 · Every dispatch uses the work order

**2026-09-25.** A search of `docs/sessions/`, `docs/tasks/` and `TASKS.md` found about 35 incidents
that trace back to what an agent was or was not told when dispatched. They group into eleven
missing fields:
- the fence, and who else is working;
- preconditions that were not true (TASK-082, `TASKS.md` L421; TASK-113's brief said "wait for
  TASK-119", a task that produces no corridor copy, so "it would wait forever", `TASKS.md` L461);
- wrong or missing context;
- which gates to run locally;
- the push and progress policy (TASK-113's eight hours);
- the evidence standard (TASK-093 cited another task's PR, `TASKS.md` L418; TASK-138 called a 2-in-9
  flake "fixed", L438);
- authority limits (TASK-112 marked copy "reviewed" under the founder's name, L419; TASK-069
  amended a spec, L290);
- where carry-forwards go;
- review scope;
- founder decisions;
- where the verdict goes.

Outside sources name the same fields, among them Anthropic's multi-agent research system
(https://www.anthropic.com/engineering/multi-agent-research-system), Devin's guide
(https://docs.devin.ai/essential-guidelines/instructing-devin-effectively), GitHub Copilot's
coding-agent guidance (https://docs.github.com/en/copilot/tutorials/coding-agent/get-the-best-results),
and commander's intent (https://pavilion.dinfos.edu/Article/Article/2163950/the-elements-of-commanders-intent/).
The line numbers above are the `TASKS.md` Log as of 2026-09-25. The ledger put the median implementer run at 62 minutes (reviewer 15), which set
the size limits.

## W-19 · Verdicts name a SHA; only the reviewer accepts a hole

**2026-09-26, the breaker's first run (PR 103).** It found that a PR could get `HOLDS` on one head and
merge on another; that nothing defined when a hole was "closed"; and that in practice the
orchestrator, the one party that wants the merge, would end up writing "acceptable" itself. So
every breaker verdict names its SHA, a hole closes only when a later round breaks the same thing
and the new test goes red, and only the reviewer can accept one. The same run found that the
`prettier --check` quoted as evidence on PRs 102 and 103 checked none of their files:
`.prettierignore` excludes `.claude/`, `docs/`, `plan/` and `CLAUDE.md`.

## Retired

- **"The `preview` job waits on a Vercel preview deployment, so under Vercel's build rate limit the
  browser chain cannot run and a local run is the evidence of record."** True until TASK-137, when
  `preview` started building and serving the app on the runner itself
  (`.github/actions/preview-origin`). Removed from the kernel on 2026-09-25.
- **"The `pgrep` wait loop."** Replaced by the build-slot lock (W-9).
- **"CI green apart from gates a task owns elsewhere"** (the merge exception for `visual` while
  TASK-139's baselines were missing). Retired 2026-09-25: the baselines landed (W-7), and the kernel
  now says never merge on any red gate.
- **The `docs/sessions/two-day-plan.md` row in "Where state lives"** ("read it before
  dispatching"). Retired 2026-09-25: the sprint it planned is over. Its durable rules moved — the
  agent cap and batching into the kernel's "Working on this machine" (W-11), CI as gate of record
  into the definition of done (W-1), and the three orchestrator-only rules (one gates task per
  spec, scoped round-2 reviews, docs-only failures fixed on the branch) into
  `.claude/agents/orchestrator.md`. The file stays as a record.
