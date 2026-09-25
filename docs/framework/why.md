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
`github.event_name == 'pull_request'`, so it skips, and `e2e`, `a11y`, `visual` and `lighthouse`
skip with it — the dispatch reaches the spine and never the browser chain, which is the half you
re-ran for.

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
PR 95 on 2026-09-23, so `visual` is no longer excused.

## W-8 · Push as soon as there is one coherent commit

**2026-09-22, TASK-113.** An eight-hour run existed only in a worktree on one laptop, with no
remote branch and no PR, when its session ended. It was saved only because the orchestrator went
looking. **2026-09-16/17:** every background Opus agent hit the 600-second stream watchdog for
several hours; agents that had committed after each step lost nothing, and a twice-stalled agent
was replaced by a fresh finisher with a tight brief.

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

## Retired

- **"The `preview` job waits on a Vercel preview deployment, so under Vercel's build rate limit the
  browser chain cannot run and a local run is the evidence of record."** True until TASK-137, when
  `preview` started building and serving the app on the runner itself
  (`.github/actions/preview-origin`). Removed from the kernel on 2026-09-25.
- **"The `pgrep` wait loop."** Replaced by the build-slot lock (W-9).
