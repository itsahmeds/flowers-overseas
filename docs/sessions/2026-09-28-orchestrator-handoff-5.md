# Session handoff — 2026-09-28 (orchestrator, framework overhaul)

Read this, then `CLAUDE.md`, then `docs/framework/gaps.md`. The founder's standing instruction, 2026-09-28: **finish the planned work autonomously and fast.**

## Operating rules for the rest of this work (founder, 2026-09-28)
- **Rounds:** at most about two per PR:
  1. `/break` + `/review`;
  2. one fix round;
  3. one scoped recheck.

  Leftover wording or prose-scanner holes are ruled `HOLE n ACCEPTABLE` by the reviewer and logged in `gaps.md`, not chased.
- **Merging:** never on less than all three: a review PASS, a closed breaker verdict and CI green on the **head SHA**.
- **After every merge**, check that each other open PR is still `MERGEABLE`. A conflicting PR fires **no** CI run, silently (W-5). PR 107 sat waiting on one that never came.
- **Dispatch** a task as soon as its dependency's PR is merged on `origin/main`. Batch the `TASKS.md` `done` marking into the next bookkeeping PR.
- **Fleet:** up to five agents. Every dispatch uses `.claude/templates/work-order.md`, with a fence read from the spec's ACs **and** T-rows **and** fixtures (three plans were caught with incomplete fences).
- **Scratch:** agents use a private `mktemp -d` under `$TMPDIR`.
- **Stop for the founder only on:**
  - a `.claude/settings.json` change (explicit approval per change);
  - Railway dashboard clicks (F1–F4);
  - anything outside the approved specs;
  - steps E, F and G (planned together).

## State at close
- **Merged today:** PRs 104 (step C specs, TASK-150…157), 105, 106 (TASK-152/153), 107 (TASK-150/151, **the shell guard is live**), 108 (A20, TASK-158…163), 109.
- **In flight:**
  - PR 110 (TASK-155: CI on push to `main`, plus the `railway:check` trigger check), with round-2 fixes on CI;
  - TASK-154 (turn caps and the clock), builder dispatched. Its `.claude/settings.json` hook entries need the founder's explicit yes before merge.
- **Next, in order:**
  1. TASK-158 (after 155);
  2. TASK-156 (after 155 and 158);
  3. TASK-159 (after 154 and 158);
  4. TASK-160 (after 159);
  5. TASK-161 and 162 (after 160);
  6. TASK-157 (after 152, 153, 154 and 156);
  7. TASK-163 (last).

  Then the founder's Railway clicks (TASK-157's runbook), and the first `/launch production`.
- **Open founder items:** Railway F1–F4; whether a privacy adviser is engaged and whether Sentry's server-side scrubbing is on (A20 O1/O2); the AC-42 staging-`worker` line (escalated in TASK-155's brief); steps E, F and G; the parked product PRs 98, 99, 101, 94, 92 and 86.
