# Session handoff — 2026-09-23 (orchestrator, day 6)

Read this, then `TASKS.md` (the Log's last ~25 rows), then `CLAUDE.md`. The standing rules in
`docs/sessions/2026-09-22-orchestrator-handoff-3.md` and the founder's day-6 prompt still hold except
where this file supersedes them.

## The one-line state

**90 / 149 tasks done.** Four PRs merged this session (95, 96, 97, 100). The shop is **almost**
reachable from the home page: PR 98 links 183 of 206 English shop pages within three clicks and is
one review away from merging. The site still sells nothing, and the product page is being built
underneath it (TASK-125 is written; 126/127 are next).

## Merged this session

Each merge was pinned with `--match-head-commit` to a head carrying both a recorded `/review` pass
and a green CI run on that same SHA.

| PR | Task | What it did |
|---|---|---|
| 95 → `46db59b` | TASK-139 | 93 Linux visual baselines, so the `visual` gate can pass on CI. It is no longer red by default. |
| 96 → `8d64899` | TASK-121 | Product-page existence set and route plumbing. Two AC-3 clauses are carried to TASK-127's brief. |
| 97 → `2b64267` | TASK-123 | The delivery calendar. Timezone independence and DST were proved by mutation, and so was the test harness itself. |
| 100 → `eb70230` | TASK-124 | Poland's operating data and four `seed:check` calendar rules. Delivery dates open only on `pickerState() === "live"`, proved on real pages: no cutoff is printed while no florist is signed. |

## Open PRs, and exactly what each needs next

**All four open task PRs conflict on the generated `docs/codebase-map.md`** (PR 100's merge moved
it). Rebase each one: regenerate the map with `pnpm codebase:map`, never hand-merge it. Confirm the
PR is `MERGEABLE`, **then** toggle `ci:full`. GitHub fires no `pull_request` run while a PR
conflicts, and the only symptom is that no run appears.

| PR | Task | Head at close | Needs |
|---|---|---|---|
| **98** | TASK-113 link publishing | `433c707` (24 green, lighthouse pending) | Round-2 fixes pushed by a finisher, whose result is in the brief's `## Result`. Needs **`/review 98` round 3**, then a rebase, then a merge. |
| **99** | TASK-143 assertion sweep | `fa126c4` (24 green, lighthouse pending) | Round-1 fixes pushed. Needs **`/review 99` round 2**, then a rebase, then a merge. |
| **101** | TASK-125 `productView()` | `7a50c7b` (CI green, conflicting) | **Unreviewed. Money, so a full `/review`.** It has 21 mutations recorded. It raises one founder question (freshness, below). |
| **94** | TASK-138 R2 media | `a450ae0` | **Blocked on the founder's decision** (below). CI was green except `lighthouse` on `d40e4cd`. |
| 92, 86 | design benchmark; locale dialog | — | Unchanged. The founder has not looked at 92; 86 is a draft that conflicts. |

## Rulings made this session (recorded in specs, not only here)

- **Spec 007 §14 A9.** The guide-state corridor shows only the reviewed "See flowers for
  {country}" link, and no florist, delivery or price claim.
- **Spec 007 §14 A10.** Spec 008 AC-20 ("no markup change") is met by the shop-root link. The
  state-B chip row moves to **TASK-147**, which must land before any corridor goes live.
- **TASK-148** (money). Every static provider read (all nine) returns shared, unfrozen data, and
  a caller's write changes every later caller's price. Its contract test could never fail.
- **TASK-149 — hard deadline 2026-12-30 23:00 UTC.** Poland's 2028 holidays. After that moment
  `seed:check` fails on `PL/2028` and turns every PR red. Do not weaken the rule.
- Both implementer agent files now match `CLAUDE.md` on `ci:full`.

## What the founder owes

1. **PR 94.** Every image now answers `cf-cache-status: HIT`, yet LCP is 2,118–2,144 ms against
   2,000. The cache was not the cause; the likely cost is the second origin's connection, which
   Lighthouse's throttling models at a fixed round trip. The options:
   - (a) **Recommended:** serve the hero from the site's own origin and keep the 2,000 ms budget.
   - (b) Amend the spec to relax the budget.
   - (c) Leave PR 94 blocked.
2. **English copy review.** `main` is at **22/498 = 4.4 %** unreviewed against the 5 % gate; PR 98's
   branch is at 25/511 = 4.9 %. What to review:
   - PR 98's two draft captions.
   - Three lines already on `main` that claim we make or deliver flowers: TASK-091's "Our florist
     makes it where it is going" and "Our florists count the stems so you do not have to", and the
     occasions intro "what we make for it".
   - The **14 Polish holiday names** TASK-126/127 must add. At most 1–3 can land unreviewed.
3. **Freshness (from PR 101).** Spec 009 Q5 puts a 7-day freshness guarantee on every product page,
   but 10 of the 84 products have `freshnessDays: 5`. Gate the claim per product, or change the
   promise.
4. **Unchanged from before:**
   - The 144 images, Mother's Day first.
   - An EU phone number. Do not invent one.
   - The `de`/`pl` slugs (TASK-106).
   - `R2_PUBLIC_BASE_URL` in `.env.local`.

## Things that bit, so they do not bite again

- **The codebase map conflicts every open PR on every merge.** It cost four rebases this session.
  Worth a small tooling task: a merge driver that regenerates it, or a map that is not committed.
- **`pnpm -s` is not valid** with this pnpm, and it fails silently inside `&&` chains. **zsh does not
  word-split `$VAR`**, so a file list in a variable reaches vitest as one filter that matches
  nothing. Pass files literally.
- **Commitlint caps the header at 100 characters.**
- **Lighthouse reports have never been uploaded.** `upload-artifact@v4` skips the dot-folder
  `.lighthouseci/` unless `include-hidden-files: true` is set. It is a one-line CI fix, still
  unmade.
- **This session started in `~/dev`, not the repo,** so its transcripts live under another project
  folder. `ledger.py` now also reads `docs/ledger/extra-sessions.txt`. **Start the next session
  inside `~/dev/flowers-overseas`**, or add its transcript path to that file.
- **Finishers leave the reviewer's verdict uncommitted.** After a PASS, the orchestrator saves it
  as a patch, merges the reviewed head, and commits the bullet to `main`. Pushing it to the branch
  moves the head off the green run.

## Machine

At most four Opus agents at a time held up this session, and the load stayed under ~12 on 8 cores
with the build slot serialising builds. The founder asked to **stop dispatching at close**.
No agent was dispatched after that. The PR 98 and PR 99 finishers were still waiting on `lighthouse` when this was
written; their final results land in each brief's `## Result`.
