# TASK-290 — Spec 043 product lists and photographs

Row: `TASKS.md` → TASK-290. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 043 §5.3 F (§13 Q6 answered A: photographed products first, the empty box wordless) and §12 task 3.
- **ACs owned:** AC-13, AC-14, AC-15; tests T-13 to T-15.
- **Ships in TASK-285's feature PR, by the same agent** (spec 043 §12 item 2: spec 004 §14 A-founder-2026-10-19b's row goes with task 3; both edit `ProductCard` and the listing grids). The branch and title carry TASK-285; the PR description names TASK-285 and TASK-290.
- The advisor's fix says task 3 waits for neither TASK-239 nor TASK-241, but TASK-285 waits for TASK-241 (PR 235), so this row does too, through the shared PR.
- `photoFirst()` is stable within each group; `price-asc` and `price-desc` are not partitioned; `ItemList` equals the rendered cards (AC-13).
- `docs/design/` artboards from PR 295 (spec 043): the wordless placeholder in `country-shop-*`, `country-category-*` (plants page: Olive Sapling and Peace Lily last) and `category-hub-desktop`; each opens with a "Spec 043 · site clarity" entry and ends with a "Spec 043" band. Match them pixel for pixel.
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): `ItemList` order and prices on cards, and TASK-285 keeps it.
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`; the founder records approved copy.

## Read

- `specs/043-site-clarity.md`: `## 0. Index`, then §5.3, §7, §9 and §10 for the ACs below
- `docs/codebase-map.md`
- `src/modules/ui/shop/ProductCard.tsx`, the listing grids, `MediaAsset`'s placeholder

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** PR 295 escalation 3: `system/components.dc.html` still draws the Photo placeholder's caption. Say in `## Result` that the placeholder is now wordless so the orchestrator sends the designer a follow-up.
- **From `/plan-tasks` (orchestrator, 2026-10-20):** TASK-310 (spec 042 soft loading) edits the same `MediaAsset` placeholder box and comes after this PR.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-22: its own PR on top of TASK-285's branch (orchestrator's work order of 2026-10-22: two PRs, in order; this overrides the "ships in TASK-285's feature PR" line above). Built: `photoFirst()` (stable partition; in `ui/shop`, re-exported from the catalog barrel, so the home row in `ui` can use it without a runtime cycle) applied to the country listings and hubs over the whole set before paging, to the related row before the six are picked, and to the home row (partitioned by the same `resolveMedia` gate `MediaAsset` uses); price sorts read the unpartitioned order. Placeholder box wordless and `aria-hidden` on every slot (`Photo decorative`), `media.placeholder.*` deleted in en/de/pl and meta. Motions 11 and 12 scoped to `@media screen`. Unit tests green; next: local e2e in the build slot, push and PR once PR 330 is ready.
- 2026-10-24 (finisher): rebased onto PR 330's rebased head f86bff97 (itself on `origin/main` 1f88cade, TASK-377 fonts). The old stack carried an earlier PR 330 without its phone spacing fix; the TASK-290 commits replayed onto the new one with no conflict. Old baseline commit dropped; the set re-rendered by `visual-baselines` run 40055731631. Next: `ci:full` on the new head.
- 2026-10-24 (finisher): CI run 40057248055 on bfae8840: everything green except e2e T-15's print scan (red on the pre-rebase head too, run 39828641439): eleven card shadow layers rest at opacity 0. Fixed by scoping the layer's paint and resting opacity to `@media screen`; unit pin added. Next: `ci:full` on the new head.
- 2026-10-24 (finisher): `main` moved to 0935d7b3 (TASK-316) and PR 330 was rebased again; this branch followed onto PR 330's head 38fd6698 (map regenerated, old baseline commit dropped) and was re-rendered (run 40065235653). Next: `ci:full` on the new head.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 335 (stacked on PR 330): `photoFirst()` on every default product list (listings and hubs before paging, related row, home row), price sorts unpartitioned; the placeholder box wordless and `aria-hidden` on every slot, `media.placeholder.*` deleted (en-gb share 1.792 % to 1.805 %); motions 11 and 12 on screen only. Tests: unit `catalog-photo-first` (12) plus adapted media/card/PDP/home/seed-copy tests; e2e `photographs-first` (T-13 to T-15); a11y plants page and Peace Lily at 1440 and 390. **For the designer (carry-forward from `/plan-tasks`):** the placeholder is now wordless, so `system/components.dc.html`'s Photo placeholder caption is stale and needs a follow-up.

**Rebase of 2026-10-24 (finisher).** The old branch was stacked on an earlier PR 330 (four of its commits, without 9a1fdd6d's phone spacing fix and the related-row `qualifierBelow`). Rebuilt on PR 330's rebased head f86bff97: this PR's two commits replayed with no conflict (the `ProductCard` changes are orthogonal: 330 adds `qualifierBelow`, 290 swaps the caption for `Photo decorative`), and `docs/codebase-map.md` was regenerated (`tests/unit/` 350 to 351). The old Linux baseline commit was dropped and the set re-rendered by `visual-baselines` run 40055731631 on the rebased code (`--update-snapshots=all`), copied in with its manifest: `--verify` 114 of 114, `--check` green. 8 PNGs move against PR 330's set: the wordless placeholder in `listing-{desktop,mobile}-card-placeholder`, `listing-{desktop,mobile}-grid`, `product-{desktop,mobile}-gallery-placeholder`, the pseudo-RTL page and popup, and `dev-components-desktop` (six placeholder-caption bands, nothing else). Five are byte-identical to this PR's pre-rebase baselines; `dev-components-desktop` differs from its old file only in the nine row bands TASK-377 moved on main, and the three phone images take TASK-285's spacing fix. The phone and placeholder images were opened and read. Re-check after the rebase: typecheck, lint, format:check, i18n:check, check:no-db, codebase map green; related unit/contract run (`--changed origin/main --maxWorkers=2`) 177 files, 4908 of 4908 green. No AC code changed in the rebase; the Self-review in the PR stands. Carry-forward (dev-only, outside the ACs): the dev gallery's placeholder descriptions in `src/app/(dev)/dev/components/catalog.ts` (`ProductCard`, `Gallery` and `MediaAsset` placeholder states) still say "the captioned box", now that the box is wordless.

**AC-15 fix of 2026-10-24 (finisher).** The first full CI run on the rebased head (40057248055) was green except e2e T-15's print case on `/en/poland/flowers` and `/plants`: eleven `span`s in `<main>` under full opacity, the `[data-fo-card-shadow]` layer of every moving card (motion 6, TASK-277, rests at opacity 0). The same case was red on the pre-rebase head (run 39828641439), so it was never green. Fix in `src/app/globals.css`: the layer's `box-shadow` and resting `opacity: 0` now sit under `@media screen`, like motions 11 and 12; printed, it is a transparent box at full opacity that paints nothing, and every screen rule (hover to opacity 1 under `hover: hover`) is unchanged, so no baseline moves. Unit pin: `tests/unit/motion-css.test.ts` "rests motions 11 and 12 and the card's shadow layer at opacity 0 on a screen only" asserts the exact three rules with their at-rules; red with the shadow rule unscoped (mutation run locally), green with the fix. The e2e T-15 run on the new head is the proof of record.

**Second rebase of 2026-10-24 (finisher).** `main` moved to 0935d7b3 (PR 323, TASK-316) and PR 330 was rebased again to 38fd6698; this branch followed it. The feature commit's only conflict was `docs/codebase-map.md`, regenerated with `pnpm codebase:map`; the old map and baseline commits were dropped. Re-rendered by `visual-baselines` run 40065235653 (on fbf8b323, the same code as this head): 12 PNGs plus the manifest against PR 330's set, `--verify` 116 of 116, every one byte-identical to this PR's previous refresh, so the images read before stand. Re-check: cheap gates green, related unit/contract 181 files, 5042 of 5042.
