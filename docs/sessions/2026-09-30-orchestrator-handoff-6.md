# Orchestrator handoff 6 — 2026-09-30

Carries on from `2026-09-28-orchestrator-handoff-5.md`.

## Where things stand

- **Merged:** TASK-150 to TASK-163, via PRs 107 and 109–121. Also the spec 040 A4 amendment (PR 122) and the bookkeeping PRs 111, 114 and this one.
- **TASK-157** stays `in_review`. It closes when the founder pastes T-44's live `railway:check` output (`docs/tasks/TASK-157.md` `## Escalations`).
- **TASK-164** (spec 040 A4: staging's missing `worker` is an expected red, and the runbook's F5 fix) is in flight, in `../fo-wt-164`.

## Order from here

1. TASK-164: `/break` + `/review`, then merge.
2. Tell the founder it is safe to do F1–F6, F5 included, and paste T-44's output. **Not before TASK-164 merges:** until then the runbook's F5 bullet would tell them to replace a good token (`/review 121` HOLE 6).
3. The first `/launch production` (spec 040 AC-43). TASK-104 creates production `web`, and TASK-103 creates staging `worker`. TASK-103 now waits for TASK-164, because its PR removes AC-44's case (b).
4. Steps E, F and G of the framework overhaul, planned with the founder (`docs/framework/gaps.md`).
5. The parked product PRs 98, 99, 101, 94, 92 and 86, when the founder asks.

## Rules that proved themselves this wave

- Read CI with `gh run list --workflow ci`. The `pr-policy` run is not CI.
- After every merge, check each open PR is still MERGEABLE. A conflicting PR fires no run.
- A PR's only red being an old commit message: reword with `git filter-branch --msg-filter` over `origin/main..HEAD`. It keeps every tree and merge, so `git diff old new` is empty and the verdicts carry. The session's safety check refused this for an agent; the founder authorised it for the orchestrator on 2026-09-29.
- The session's safety check refuses the orchestrator a merge of a PR that changes `.claude/settings.json`; the founder merges those (PR 112).
- Agents that stall on the stream watchdog: resume once, then send a fresh finisher. Tell every agent to keep commands short and push after each step.
- Every agent uses a private `TMPDIR`, because parallel dev-OS tests collide.
