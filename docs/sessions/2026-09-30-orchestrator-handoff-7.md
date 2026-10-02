# Orchestrator handoff 7 — 2026-09-30 (evening)

Carries on from `2026-09-30-orchestrator-handoff-6.md`. Read this, then `CLAUDE.md`, then the
last rows of the `TASKS.md` Log.

## Where things stand

| PR | What | State | Next |
|---|---|---|---|
| 130 | TASK-165: next 16.3.6, brace-expansion 5.0.12, fast-uri 3.1.8 (five prod advisories published 2026-09-30; `audit` red on every PR until it merges) | `/review 128` PASS + `/break 128` HOLDS on `1fdbe2c` (same commit); `/break 130` HOLDS on `b111b87`; scoped `/review 130` was running at close | Merge first, the moment its review is PASS and CI is green on the head. Replaces PR 128 (closed: `pr-policy` refuses `no-task` for `package.json`). |
| 125 | Bookkeeping: TASK-164 `done`, TASK-157's founder gate lifted, TASK-099 waits for TASK-100 | `/break` round 2 HOLDS on `d52c420`; `/review` round 2 **FAIL** on `d52c420`, on CI `audit` only (content fixed) | Rebase on 130, toggle `ci:full`, confirm `git range-diff` unchanged, then `/review 125` round 3 (the range-diff and CI job by job on the new head). Merge on its PASS. |
| 127 | TASK-102: Cloudflare purge adapter | `/review` round 2 PASS on `004ad8c1`; `/break` round 3 on `bfcdaf8f`: holes 1, 2, 3, 5 closed, **HOLE 6** open (the timeout test passes with a never-firing signal; §5.4 names no timeout) | After 130: implementer rebases and toggles `ci:full` (it is waiting to be told). Then one reviewer round: the tests-only diff `004ad8c1..head`, a ruling on HOLE 6 (`ACCEPTABLE` is expected), CI on the head. |
| 126 | TASK-100: Cloudflare zone config, `cloudflare:check`/`apply`, the `cloudflare-check` job | Built; row `blocked`; no `/break` or `/review` yet | Waits for the founder's E-1 ruling, then `/break` + `/review`. `cloudflare-check` stays red until the founder does runbook Z1–Z4 (it runs on every `ci:full` PR), so Z1–Z4 must come **before** the merge. |
| 129 | Spec 006 §14 A7 (a second generator, xAI Grok Imagine, for 62 assets) and `docs/compliance/imagery-generator-terms-grok.md` | Draft, awaiting "approve A7" | On approval: `/plan-tasks` for the 144-image intake. |

## Founder decisions still owed

1. **E-1 (TASK-100):** allow a fifth, read-only token scope, Zone → Bot Management → Read (spec
   040 AC-24 lists four). Orchestrator recommends yes: without it the check cannot prove crawlers
   are not blocked (AC-17's do-not-enable rows; AC-24 lists the scopes). A yes needs a one-line spec 040 amendment (A5) before PR 126 merges.
2. **Z1–Z4:** the Cloudflare token, zone id, first apply (run from `~/dev/fo-wt-100`, since the
   script is not on `main` yet) and the two repository secrets. After E-1.
3. **F1–F6 and T-44's paste** (TASK-157): unblocked since PR 124.
4. **"approve A7"** (PR 129).
5. **Grok:** made on grok.com / the app, or inside X? And the three x.ai PDF prints into the
   Drive "Flower Images" folder (the intake PR may not merge without them).
6. **FO-BQ-004:** which of the two different hero and detail versions to keep.

## The 144 photographs

The zip is extracted, untouched, under this session's scratchpad (`imgs/fi/`); none of the 144 is
in `.local/imagery/originals/` yet (it holds the first 31, approved 2026-09-18). Facts measured from the files: all 144 asset ids present; the zip holds 148
image files, 86 of them PNGs, of which four are `(1)` copies (the AR-005/006 heroes, BQ-004's hero and
detail), leaving 82 ChatGPT assets at 1122×1402 (C2PA `ChatGPT` / `gpt-image`, no version number); 62 Grok Imagine JPEGs
(heroes 784×1168; details 912×1136 for 19 products and 784×1168 for 12: FO-BQ-016, 017, 021, 022,
024–027, 035, 036, 038, 039) for 31 products; FO-AR-005 and FO-AR-006 hero duplicates are
byte-identical; FO-BQ-004 has two different versions of each shot. The founder kept the Grok photos
with **no** "Created with Grok" line, knowing xAI's Terms ask for it (the Grok record, clause 5).
Re-extract from `~/Downloads/Flower Images -20260930T155221Z-1-001.zip` if the scratchpad is gone.

## Carry-forwards to record

- **TASK-104** owns: `src/lib/railway.ts` `OPTIONAL_VARIABLE_KEYS` must list `CLOUDFLARE_API_TOKEN`
  and `CLOUDFLARE_ZONE_ID` before either is set on Railway (`/review 127` round 1).
- **TASK-099** owns: TASK-100's E-2, the nightly `cloudflare-check` sharing a concurrency group with
  pushes to `main` (one can cancel the other).
- Open: which pages the `sitemap` and `catalog:*` tags purge (TASK-102 escalation). It gates the
  first task that calls `invalidate`, not PR 127.
- `docs/tasks/TASK-165.md` says all five advisories failed the gate; only the three high/critical
  ones did (`/break 130` note).

## Rules that proved themselves today

- Every read-only agent keeps its scripts and temp files inside its own worktree, never the
  session scratchpad (`docs/framework/gaps.md`, 2026-09-30).
- Dependency changes need a task ID: `pr-policy`'s `no-task` allow-list is docs and framework paths only.
- Read a generator from the file's C2PA manifest, not from what anyone says made it.
- Do not take a release published hours ago when an older one carries the fix.
