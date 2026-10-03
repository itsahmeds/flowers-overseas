# Orchestrator handoff 8 — 2026-10-03 (overnight)

Carries on from `2026-09-30-orchestrator-handoff-7.md`. Read this, then `CLAUDE.md`, then the
last rows of the `TASKS.md` Log.

## What shipped overnight (all on review PASS, break HOLDS or holes closed/accepted, CI green)

| PR | What |
|---|---|
| 133 | TASK-149: Poland's 2028 holidays and the 60-day holiday-coverage warning |
| 137, 139, 140, 141, 144 | Rows and briefs (TASK-166, 167, 168, 169, 170) and bookkeeping |
| 129 | Spec 006 §14 A7: a second generator (Grok), demo imagery, FO-BQ-004 has two versions |
| 138 | Overnight bookkeeping (a): done marks, three founder decisions, gaps |
| 94 | TASK-138: every photograph but the home hero from R2 (spec 006 §14 A8); production verified |
| 136 | TASK-166: the future-tense florist sentence and the two search descriptions; live |
| 135 | TASK-126 + TASK-127: the product page; every product prebuilt (spec 009 §14 A6), trailing slash 308 (A7); live at `/en/poland/product/amber-hour` |
| 142 | TASK-167: 142 batch-2 photos staged `pending`; upload acts on approved assets only; alt only for approved product assets (spec 006 §14 A9) |
| 145 | TASK-169: spec 006 §14 A10, the real R2 bucket names; the preview-bucket question stays the founder's |

## Orchestrator rulings the founder may reverse (all in `docs/decisions-log.md`)

- Spec 009 §14 A6: every product page prebuilt. Option A (layout `dynamicParams = true`) was measured
  and broke spec 003 AC-8. Cost: build ~100 s vs 53 s, ~630 MB of product pages at 4 locales.
- Spec 009 §14 A7: a trailing slash on a product URL answers 308 to the bare URL.
- Spec 006 §14 A9: alt text required only for `approved` product assets.
- TASK-166: FO-BQ-001 "to be hand-tied", FO-BQ-003 "Will be made and delivered".

## Waiting on the founder

1. Batch-2 photo approval and FO-BQ-004's pair (A or B) on
   https://claude.ai/artifact/SMqQmEETfD9UjB7n1byDvP — TASK-168's input. Not started until then.
2. Vercel's Hobby build limit (hit ~23:00 UTC 2026-10-02): wait, Pro, or stop preview builds.
3. Product page copy: "When we open, you will order by 14:00 in Warsaw" vs "Order by — no cutoff,
   because no florist has agreed to one"; and the photo caption "our florist hand-makes each one"
   (present tense).
4. TASK-170 (404s with no `lang` at depth 3): a design choice — (a) prebuild the shop root,
   (b) a proxy rewrite, (c) Cache Components, (d) accept for now. Draft PR 143 holds 15 e2e shapes, 7 red.
5. TASK-169's preview-bucket question (default: none).
6. Still open from before: TASK-100 E-1 and Z1–Z4; Railway F1–F6 and T-44's paste; de/pl slugs
   (TASK-106); an EU phone number; E-2 freshness; PR 98's occasion strings; A8 (Ahrefs).

## In flight at close

- `../fo-wt-167` kept: batch-2 derived variants in `.local/media/` (TASK-168 can reuse them).
- `../fo-wt-170`: TASK-170, blocked, draft PR 143.
- PR 126 (TASK-100) idle, blocked on the founder. PRs 92 and 86 parked.

## Next, when the founder is back

- TASK-168 the moment the founder answers the batch-2 page (approval, FO-BQ-004 pair, alt text
  in four locales listed for the founder, `media:upload --only`, LCP watched).
- TASK-128 → 129 → 130 → 131 → 132 → 133 close spec 009. Their briefs are still templates: fill
  each from spec 009 and the carry-forwards before dispatch (TASK-130 inherits TASK-125/127's).
- Refresh the fleet ledger (`python3 .claude/bin/ledger.py`) and republish it to
  https://claude.ai/artifact/1f9qu9kZ9ztd2acPr4EASE at session close.

## Rules that proved themselves overnight

- Name every scratch file `<role><PR>-<name>` and use absolute paths: a shared `mut.sh` sent a
  breaker's runs into a reviewer's worktree.
- After a squash merge, rebase the next PR before re-firing CI: a conflicting PR runs nothing.
- Copy accepted holes into the brief and into the task that inherits them, the same day.
- A "done" mark must not hide an open escalation; give it a tracked home first.
- Match `## Result` with `^## Result` (a regex anchored to the line), never `str.index`: briefs quote headings in backticks.
