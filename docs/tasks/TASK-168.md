# TASK-168 — Approve photo batch 2 on the founder's word: flip the approved rows, add FO-BQ-004's chosen pair, record the sign-off instant(s), upload the approved ids

Row: `TASKS.md` → TASK-168. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-168`; keep it current by editing this file, not the row.

## Binding

- **Input: the founder's own recorded word, and nothing else.** The orchestrator records the
  founder's chat answer to the batch-2 approval page (https://claude.ai/artifact/SMqQmEETfD9UjB7n1byDvP)
  under `## Escalations` here, with the message's instant and the exact words: which numbers are
  approved (each number is a row's `n` in `content/imagery/remaining-images.csv`), which are to be
  redone, and FO-BQ-004's pair (**A** = the un-suffixed files, **B** = the `(1)` files). This task
  is not dispatched before that entry exists. No agent approves anything the founder did not.
- **The data edit** (spec 006 §14 A7 clause 5, the parts TASK-167 left): for each approved row,
  `reviewState: "approved"`, `reviewedBy: "founder"`, `reviewedAt` = the instant of the founder's
  message; a row the founder asks to redo stays `pending` and is listed in `- 2026-10-03 (finisher, from `ffaf761f`, CI run 37118872307): `home.spec.ts:187` pinned to the
  new truth on all four homes — five `[data-fo-media-slot="trending"]` boxes, five `<img>` (five
  inside the slot boxes), zero `[data-fo-media-placeholder]`; the run itself is the red for the slot
  half (the old `grid` locator received 0 against this head). The `<img>`/placeholder halves are
  not watched red locally (Playwright needs the build slot, held by another agent at load 22) — left
  for the breaker. **Listing baselines:** 9 `listing-*` PNGs (desktop card-image, card-link,
  card-placeholder, card-tile, grid, toolbar; mobile card-link, card-placeholder, grid) taken from
  baselines run 37118133249 (`9ee86f75`, whose `src`/`app`/`seed` equal this head's). They are this
  diff's: they passed on `97b7a934` and moved when the `trending` sample box (+111 px) landed above
  them on `/dev/components` — ±1 px heights from the sub-pixel offset; each viewed side by side
  with the committed one: same cards, same text, same photographs. `visual:baselines --verify`
  reports 104 of 104 against both the committed manifest and that run's own. **Measured on
  `ffaf761f`:** mobile image bytes `/en` 215 876, `/de` 215 876, `/pl` 215 876 (budget 204 800 B,
  over → escalated, not tuned); Lighthouse LCP `/en` 1 758 ms, `/en-gb` 1 746, `/de` 1 738,
  `/pl` 1 739 (budget 2 000 ms). `product.spec.ts:96` escalated (no subject, outside the fence).
  `consent-banner.spec.ts:667` failed again on `e2e-desktop` (the known flake, both forged-cookie
  cases).

- 2026-10-03: CI run 37120922778 on `a4166b9f`: `home.spec.ts:187` and every `listing-*` baseline
  green; red only on the two escalations (mobile homes 215 876 B each, `product.spec.ts:96`) and
  the known `consent-banner.spec.ts:667` flake (`e2e-mobile`, the `hello` case). `build`, `a11y`,
  `lighthouse` green. Stopped on the budget, as ordered.

## Result`.
- **FO-BQ-004:** stage only the chosen pair into the main checkout's
  `.local/imagery/originals/` under the canonical names, give it its two `media.json` rows and prompt
  records as TASK-167 did for the others, derive its variants; the other pair is neither staged nor
  given rows.
- **The sign-off case** in `tests/unit/seed-media-manifest.test.ts` gains the batch-2 sign-off
  instant(s) and asserts the approved count exactly; batch 1's assertion is unchanged.
- **Upload only the approved ids:** `pnpm media:upload --only <assetId>` for each approved id (check
  in `scripts/media-upload.ts` how `--only` takes several ids), then `--verify` with the same
  `--only` set. Never run it without `--only`. Never print a `.env.local` value.
- **LCP:** approved product heroes start rendering in the locale homes' trending row
  (`src/modules/ui/home/trending-provider.ts`). Spec 006 §14 A8 clause 4: `/en`'s margin was 55 ms.
  CI's Lighthouse on this PR's head is the measurement; if a locale home misses the 2,000 ms budget,
  stop and report, do not tune.
- **Visual baselines:** pages that now show photos change; refresh only the baselines this task
  causes, through the repo's `visual:baselines` label flow, and inspect each.
- **Gates.** `pnpm seed:check`, `pnpm media:variants --check`, the unit files touched, then
  `pnpm gates:cheap`; CI green on the head, browser jobs and Lighthouse included.

## Read

- `docs/tasks/TASK-167.md` (what landed, and how the originals were staged).
- `specs/006-seed-catalogue-import-imagery-pipeline.md` — `## 0. Index`, then §14 A6, A7, A8.
- `docs/runbooks/imagery.md`, `scripts/media-upload.ts`, `tests/unit/seed-media-manifest.test.ts`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From TASK-167 and its reviews (2026-10-03), carried by the orchestrator:** (1) spec 006 §14 A9:
  alt text is required for every `approved` product asset in all four launch locales, so this task
  writes `seed/data/alt/{en,en-gb,de,pl}.json` rows for each asset it approves, in the same change
  (en is English site text: draft it from the prompt record's facets and list it for the founder
  with the approval); (2) `pnpm media:upload` and `--verify` now act only on `approved` assets'
  variants (PR 142), so after the approval flip, `--only <ids>` narrows to the batch; (3) the batch
  split in `tests/unit/seed-media-manifest.test.ts` reads `content/imagery/remaining-images.csv`:
  approving a row and regenerating the sheet moves it into batch 1 and turns the 2026-09-18
  sign-off case red — handle that split; (4) the derived variants for batch 2 are in
  `/Users/ahmed/dev/fo-wt-167/.local/media/` (or re-derive with `pnpm media:variants`).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-03 — the founder's approval of batch 2 and FO-BQ-004's pair (founder). Answered.**
  Founder, in chat, exact words: "approve all the batch 2 photos." Instant: the orchestrator
  recorded the message at `2026-10-03T09:21:10Z` (the chat carries no timestamp; use this
  instant as `reviewedAt` for every batch-2 row). **Every** batch-2 row is approved; none is to
  be redone. **FO-BQ-004's pair:** the founder approved both versions and named neither, so the
  orchestrator chose **B** (the `(1)` files), the version that matches the product's brief, as
  the morning report proposed; the founder may swap to A later, which is a data edit. Stage B
  only; A gets no rows.
- **2026-10-03 — 20 unit cases in six files outside the fence pin the photo coverage of the
  committed data (orchestrator, `open`).** With all 175 assets approved there is no `pending`
  asset and no product without a photograph left in `seed/data/media.json`, and these cases took
  their subjects from it. No production code is involved; each is a test edit:
  - `tests/unit/media-upload.test.ts` (10 cases, the `/break 142` HOLE 5–9 suite): `PENDING =
    "fo-bq-005-detail"` and `OTHER` are read as `pending` from the committed manifest. Fix: make
    the subject `pending` in the temp tree's `media.json`, as `tree("rejected")` already does for
    `rejected`.
  - `tests/unit/seed-check.test.ts` (1): the merged-tree approved count, `31` → `175`.
  - `tests/unit/catalog-category-page.test.tsx` (2), `catalog-hub-pages.test.tsx` (3),
    `catalog-occasion-page.test.tsx` (2), `catalog-shop-page.test.tsx` (1): AC-24's LCP nomination
    pins "three of twelve cards are photographs" (now 12 of 12), and the cases that need a
    placeholder first card found one in the shipped data. Fix: pin the shipped counts, and build
    the placeholder subject in-test (an injected manifest or a pending override).
  - `tests/unit/product-page.test.tsx` (2, AC-21 vase sentence, AC-25): "a product with no
    photograph" no longer exists. Fix: the same in-test subject.
  The e2e and visual suites may hold the same assumption (`tests/e2e/home.spec.ts`,
  `product-page.spec.ts`, `honesty.spec.ts`, `tests/visual/listing.spec.ts`); CI will say.
  **Recommendation:** widen this task's fence to those six test files (tests only), keeping every
  placeholder case's subject alive by construction rather than deleting the case. Everything else
  in Binding is done or running; the PR stays draft.
  **Answered 2026-10-03 (orchestrator ruling, relayed by the coordinator): fence widened** to
  `tests/unit/media-upload.test.ts`, `seed-check.test.ts`,
  `catalog-{category,hub,occasion,shop}-page.test.tsx` and `product-page.test.tsx`, test-only.
  Each case builds its own subject in the test (a fixture `pending` asset, or a product with its
  media removed); no case is deleted; a case keeps its assertion on the real manifest only where it
  tracks the real count, and then asserts the exact new value (175, 12 of 12); each fixed case's
  subject is mutated and watched red. The e2e and visual spec files that fail in CI on the same
  assumption are inside the fence under the same rule; baselines change only through the
  `visual:baselines` label flow, each inspected.
- **2026-10-03 — the mobile locale homes miss AC-15's image-transfer budget (orchestrator,
  `open`; stop-and-report, nothing tuned).** CI run 37115494615 on `97b7a934`, `e2e-mobile`,
  `tests/e2e/media-budgets.spec.ts:87`: `/en`, `/de` and `/pl` each transfer **215 876 B** of
  images against `PAGE_IMAGE_BUDGET_BYTES` 204 800 B (11 076 B, 5.4 % over; desktop passes).
  Top five: `home-hero/1200.avif` 41 135 B (site origin), then the trending row's product heroes
  at the 640 rung — `fo-bq-003-hero` 27 685, `fo-bq-002-hero` 21 843, `fo-bq-001-hero` 20 752,
  `fo-bq-004-hero` 20 730. Batch 2 put photographs on trending cards that were placeholders
  before. **LCP is inside budget** on the same head (Lighthouse job, `lighthouserc.json` 2 000 ms):
  `/en` 1 749 ms, `/en-gb` 1 756, `/de` 1 747, `/pl` 1 892. Options, none taken: fewer photographed
  trending cards on the home; a smaller rung for the trending tile at mobile (`sizes`/slot);
  raising the budget (a spec change). The rest of CI on that head: `visual` 25 baselines differ
  (pages that now show photos; not refreshed, since the answer may change the home), and `e2e`
  has four photo-coverage pins red, now inside the fence — `country-category.spec.ts:184`,
  `country-shop.spec.ts:126` (shipped nomination counts), `country-occasion.spec.ts:168` (expects
  no photograph on Mother's Day, now 7 of 7), `product-page.spec.ts:238` (`NO_PHOTO_PDP`
  anthurium is photographed; the browser has no seam to remove a product's media, so its subject
  needs a choice: a `/dev/components` placeholder gallery, or the case pinned on the real page).
  **Answered 2026-10-03 (orchestrator rulings, relayed by the coordinator).** (1) Budget stays
  204 800 B and no card is removed; first check the trending card's `sizes`: at Lighthouse mobile
  (~412 CSS px, DPR 1.75) a ~160–200 CSS px card should pick ~320 w, so a 640 w pick means `sizes`
  overstates the width. Fence widened to the component that sets the trending card's `sizes` and
  its unit test: make `sizes` state the rendered width at each breakpoint, no quality change, no new
  variants, a unit case pinning the string and red under mutation. If the honest `sizes` still
  leaves a home over 204 800 B, stop and report the bytes. (2) e2e: pin
  `country-category.spec.ts:184`, `country-shop.spec.ts:126`, `country-occasion.spec.ts:168` to
  the exact new real values; `product-page.spec.ts:238` points at `/dev/components` if it already
  renders the PDP no-photo state, otherwise asserts the real page's photo and the no-photo branch
  is recorded as covered by `product-page.test.tsx`'s `withoutMedia()` cases; no new dev page.
  (3) Then refresh only this diff's baselines through `visual:baselines`, each inspected.
- **2026-10-03 — where the trending card's honest `sizes` lives (orchestrator, `open`).** The
  row renders `MediaAsset slot="grid"`, and `sizes` is the slot's: `MEDIA_SLOT_SPECS.grid` =
  `(min-width: 768px) 25vw, 50vw`, shared with every listing card (`CARD_MEDIA_SLOT = "grid"`,
  `src/modules/catalog/listing.ts`). `slots.ts` states the rule "decided here, once, per slot
  rather than at a call site", and `MediaAsset` has no `sizes` prop. The row's real geometry
  (`HOME_BLEED` `px-md md:px-[56px]`, `Grid columns="2-5" gap="lg"`, no max-width on `<main>`):
  `calc(50vw - 28px)` below 768 px, `calc(20vw - 41.6px)` from 768 px. Arithmetic, not measured:
  on `e2e-mobile` (Pixel 7, 412 px, DPR 2.625) today's 50vw = 206 px gives candidate densities
  1.86 (384 w) and 3.11 (640 w); Chromium picks by their geometric mean (2.41 < 2.625 → 640 w,
  which is what CI fetched). The honest 178 px gives 2.16 and 3.60, mean 2.79 > 2.625 → 384 w, so
  the honest string should bring the four trending heroes from ~21–28 KB to their 384 w files
  (about half). Lighthouse (DPR 1.75) already picks 384 w today. Options: **(a)** a `trending`
  (or `rowCard`) UI slot in `slots.ts` with the honest string and the `grid` crop mapping —
  keeps "per slot, never per call site"; **(b)** an optional `sizes` override on `MediaAsset`
  passed by `TrendingRow` — smallest diff, breaks that rule; **(c)** make `grid` itself honest —
  moves every listing page's picks and baselines too. Recommendation: **(a)**. Needs the fence to
  include `src/modules/ui/media/slots.ts` (+ its seed↔UI mapping and `tests/unit/ui-media.test.ts`,
  which pins the slot table) and `TrendingRow.tsx`.
  **Answered 2026-10-03 (orchestrator ruling): (a).** A new `trending` UI slot in `slots.ts` whose
  `sizes` states the row's rendered width, derived from the layout; same variant ladder as `grid`,
  no new variants, no quality change; `grid` and the listing pages unchanged. Fence widened to
  `slots.ts` (and its seed↔UI mapping only if the slot needs a row), `tests/unit/ui-media.test.ts`,
  `TrendingRow.tsx` and its test. A case pins the exact `trending` string and one asserts the row
  uses the slot, each watched red; then baselines through `visual:baselines`, `ci:full`, report
  mobile image bytes and LCP; a mobile home still over 204 800 B → stop and report.
- **2026-10-03 — every `.env.local` on this machine holds the old `*.r2.dev` value of
  `R2_PUBLIC_BASE_URL` (founder action, not blocking).** `pnpm media:upload` refuses to run unless
  it equals `MEDIA_ORIGIN` (spec 006 §14 A8 clause 7). The bucket is the same one behind
  `media.flowersoverseas.com`, so I passed `R2_PUBLIC_BASE_URL=https://media.flowersoverseas.com`
  inline for the upload and verify runs and edited no env file. The founder should change that one
  line in `.env.local` (`docs/runbooks/imagery.md` §6, second note).

- **2026-10-03 — the honest `trending` sizes did not move the mobile pick; the homes are still
  over AC-15's image budget (orchestrator, `open`; stop-and-report, nothing tuned).** CI run
  37118872307 on `ffaf761f`, `e2e-mobile`, `media-budgets.spec.ts:87`: `/en`, `/de`, `/pl` each
  **215 876 B** against 204 800 B, byte-identical to `97b7a934` before the slot: `home-hero/1200.avif`
  41 135, then `fo-bq-003-hero/640.avif` 27 685, `-002` 21 843, `-001` 20 752, `-004` 20 730 — still
  the 640 rung. Desktop passes. Arithmetic, not measured: the ladder is 384/640/828 w; on Pixel 7
  (412 px, DPR 2.625) Chromium returns 640 only when the source size it evaluates is between about
  189 and 244 CSS px — the old `50vw` (206), not the new `calc(50vw - 28px)` (178, which selects
  384). So either the browser is not reading the `trending` string the unit suite pins (worth a look
  at the served `<source sizes>` on a real build), or the pick rule differs from that arithmetic.
  No other home component renders those assets. LCP on the same head is inside 2 000 ms.
- **2026-10-03 — `tests/visual/product.spec.ts`'s `gallery-placeholder` block has no subject
  (orchestrator, `open`; outside this work order's fence).** CI run 37118872307, `product.spec.ts:96`
  at 1440 and 390: `[data-fo-gallery="placeholder"]` times out on `/en/poland/product/anthurium`,
  which batch 2 photographed — not a pixel difference, so no baseline refresh can fix it. The
  committed `product-*-gallery-placeholder.png` are the old ones (the baselines run on `9ee86f75`
  reproduced every `product-*` byte for byte). Fix, same as the e2e ruling: point that block at
  `/dev/components`, which renders the PDP `Gallery` with `PRODUCT_GALLERY_PLACEHOLDER`, then take
  its two new baselines through `visual:baselines`. Needs the fence to include that file; TASK-171
  also refreshes `product-*` baselines, so expect a rebase.

- **2026-10-03 — the trending pick is the browser's correct pick; no honest markup change brings
  the mobile homes under AC-15 (orchestrator, `open`; stop-and-report, nothing tuned).** Measured
  on a local `next build` (table in `## Progress`): `/en`, `/en-gb`, `/de`, `/pl` 215 876 B each
  against 204 800 B. Served `sizes` is the honest `trending` string; Chromium 153 takes the
  smallest rung with density ≥ DPR (probed), so a 178 px card at DPR 2.625 needs 467 device px and
  the ladder's next rung above 384 is 640. The trending five are 108 099 B at 640 w and would be
  50 852 B at 384 w (−57 247 B → 158 629 B in all); the hero's 1080 w rung (34 819 B) misses its
  412 px box by 1.5 device px, and would save only 6 316 B (still 209 560 B). Options, none taken:
  **(i)** a 480 w rung in the `productHero` ladder (480/178 = 2.70 ≥ 2.625, so the browser would
  take it honestly; new variants, so a spec 006 §2.5 change, a `media:variants` run and an upload
  of one AVIF and one WebP per photographed asset in that crop); **(ii)** the budget stated per DPR or measured at a lower-DPR profile (a
  spec change); **(iii)** fewer photographed trending cards (ruled out). Recommendation: (i).

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-03: pair B's C2PA manifests read (`ChatGPT` / `gpt-image`), staged as
  `fo-bq-004-{hero,detail}.png` in the main checkout's `.local/imagery/originals/` (175 files);
  FO-BQ-004's records → `gpt-image`, re-hashed; two rows; all 144 batch-2 rows `approved` /
  `founder` / `2026-10-03T09:21:10Z`; `media:variants --only` the pair (8 rows, 694 total);
  `--check` exit 0. The worktree reads originals through `.local/imagery` → main's, and the derived
  tree is a copy of `fo-wt-167/.local/media` plus the pair.
- 2026-10-03: alt text for the 144 in en, en-gb (= en, as batch 1), de, pl, each written from the
  photograph itself (12 labelled contact sheets of the 384 variants, every photo viewed), never the
  product name; `seed:check` exit 0.
- 2026-10-03: sign-off case (144 at the founder's instant, 175 approved in all, pair B digests),
  each mutation watched red; `seed/snapshot` regenerated. The sheet CSV is **not** regenerated (the
  batch split reads it; see the test's header). Full unit run: 20 red in six files outside the
  fence → escalated. Upload of the 144 ids running.
- 2026-10-03: `pnpm media:upload --only <the 144 ids>` (`--dry-run` first): 576 variants, 576
  uploaded, 0 already current, 15 229 911 B, 0 unapproved skipped, exit 0. `--verify` with the
  same 144 ids died twice on `fetch failed` (a thrown network error aborts the whole run;
  `verifyPublished()` has no retry, out of fence, not changed); run as nine chunks of 16 ids, the
  same set: 9 × 64 = 576 rows verified, every exit 0. Next: the escalation's answer.
- 2026-10-03 (fence widened): `seed-check` pins 175; `media-upload`'s two suites stage their
  `pending`/`rejected` subject in the fixture tree's own `media.json` (`setReviewState`; helper
  made a no-op → 9 cases red); AC-24 shipped pins exact (category and hub roses 12 of 12, shop
  12 of 12, Mother's Day 7 of 7) and each placeholder case withdraws photographs from a real view
  (withdrawal disabled → 2 hub, 1 category, 2 occasion cases red); `product-page` builds its
  no-photo subject with `withoutMedia()` (no-op → 2 red; the vased case's new placeholder half red
  under a temporary, reverted mutation of `PriceSummary.tsx`'s condition). Full unit run 217 files
  green; `gates:cheap` PASS on `0debf680`. Branch already on `origin/main`. Next: ready, `ci:full`;
  `tests/e2e/product-page.spec.ts`'s `NO_PHOTO_PDP` (anthurium, now photographed) is expected red.
- 2026-10-03: rebased on `origin/main` `8c2d4d0b` (docs only), `gates:cheap` PASS on
  `97b7a934`, ready, `ci:full` (toggled after the rebase). CI run 37115494615: every spine job,
  `build`, `container`, `a11y`, `preview` and `lighthouse` green; `e2e` red (four photo pins and
  the mobile image budget), `visual` red (25 baselines). Budget miss escalated; stopped there.
- 2026-10-03 (rulings round): e2e pins set to the real values — `country-category.spec.ts` 12
  card images / 11 lazy, `country-shop.spec.ts` 12 / 11, `country-occasion.spec.ts` 1 nomination
  of 7 / 6 lazy (case renamed, kept); `product-page.spec.ts`'s no-photo case now reads
  `/dev/components`, which already renders the PDP `Gallery` with `PRODUCT_GALLERY_PLACEHOLDER`
  (gallery-scoped: no `<img>`, no `<picture>`/`<source>`, no honesty label, the caption present;
  the page's one deliberate `priority` image elsewhere makes a whole-`<head>` zero untrue there).
  Not run locally (browser suite, CI's). **`sizes` not changed — see Escalations:** the trending
  card's `sizes` is the shared `grid` slot's (`src/modules/ui/media/slots.ts`), also the listing
  cards' (`CARD_MEDIA_SLOT`), and `MediaAsset` takes no per-call `sizes`, so an honest trending
  string needs a mechanism outside the fence. Visual baselines and `ci:full` wait on it.
- 2026-10-03 (ruling (a)): `trending` UI slot in `src/modules/ui/media/slots.ts`, `sizes`
  `(min-width: 768px) calc(20vw - 41.6px), calc(50vw - 28px)` derived from the row's layout
  (`HOME_BLEED` 16/56 px, `gap-lg` 24 px, 2-up/5-up, Tailwind `md` 768 px, no max-width above
  `<main>`); ratio and variant ladder as `grid`; no seed↔UI row needed (the row passes the slot);
  `MediaAsset.tsx` gains the slot's caption key (its table is total over `MediaSlot`, so the type
  required it). `TrendingRow` uses it. Pins: `ui-media.test.tsx` (exact string, `grid` unchanged)
  and `ui-home-gated.test.tsx` (every `sizes` the row emits is the string; five `trending` boxes,
  five `<img>`, no placeholder). Mutations: string set to `grid`'s → 2 red; row back on `grid` →
  2 red. `gates:cheap` PASS (`9ee86f75`). `visual:baselines` label added, run 37118133249.
- 2026-10-03: baselines from run 37118133249 (`9ee86f75`, ubuntu). 31 PNGs differed; **23
  taken**, each inspected against the committed one: 10 home baselines (`home-{en,en-gb,de,pl}-
  {desktop,mobile}`, `en`, `de`) differ only in the trending band (desktop cols 597–1383, mobile
  rows 1785–2282: Baltic Dawn, Quiet Blush, Northern Light now photographs, same boxes); the two
  trending crops (26 % changed: the same three cards); 10 listing/hub pages (`country-{category,
  occasion,shop}`, `{category,occasion}-hub`, × desktop/mobile) grew because every card now
  carries its photograph and the "Example arrangement" line; `dev-components-desktop` +111 px from
  the new `trending` slot's sample box beside `thumb` (the gallery renders every slot), the rest
  of the page the same content shifted. **8 left out:** `listing-*` (`/dev/components` fixture
  cards, ±1 px heights, toolbar 4.7 %), which passed CI's `visual` on `97b7a934` after the photo
  flip and are not this diff's; their PNGs and manifest entries stay as committed, so
  `pnpm visual:baselines --verify` on the committed manifest reports 104 of 104 matched.

- 2026-10-03 (finisher, measured on `8b576dfb`, build slot, load 3.3): `next build` from
  `.env.example` + `next start`, Playwright's own `Pixel 7` (412 × 839, DPR 2.625, Chromium
  153.0.8010.12), the budget case's method (networkidle, scroll to bottom, networkidle). **Every
  image response on `/en`** (all twelve fetched before the scroll; all twelve displayed):

  | bytes | URL | `<img>`/`<source>` `sizes` served | rendered box | srcset rungs |
  |---:|---|---|---:|---|
  | 41 135 | `/media/home-hero/1200.avif` | `100vw` | 412 px | 384/640/828/1080/1200 |
  | 27 685 | `media.flowersoverseas.com/media/fo-bq-003-hero/640.avif` | `(min-width: 768px) calc(20vw - 41.6px), calc(50vw - 28px)` | 178 px | 384/640/828 |
  | 21 843 | `…/fo-bq-002-hero/640.avif` | same | 178 px | same |
  | 20 752 | `…/fo-bq-001-hero/640.avif` | same | 178 px | same |
  | 20 730 | `…/fo-bq-004-hero/640.avif` | same | 178 px | same |
  | 17 089 | `…/fo-bq-005-hero/640.avif` | same | 178 px | same |
  | 12 629 | `…/home-occasion-birthday/384.avif` | `(min-width: 768px) 17vw, 50vw` | 178 px | 384 only |
  | 12 409 | `…/home-occasion-sympathy/384.avif` | same | 178 px | 384 only |
  | 11 291 | `…/home-occasion-name-day/384.avif` | same | 178 px | 384 only |
  | 10 476 | `…/home-occasion-anniversary/384.avif` | same | 178 px | 384 only |
  | 10 199 | `…/home-occasion-just-because/384.avif` | same | 178 px | 384 only |
  |  9 638 | `…/home-occasion-new-baby/384.avif` | same | 178 px | 384 only |
  | **215 876** | total (`/en-gb`, `/de`, `/pl`: 215 876 each) | | | |

  The served `sizes` is the new `trending` string on both the `<source>` and the `<img>`, and the
  trending images are lazy but inside Chromium's load-in margin, so they load before any scroll.
  **The cause is the pick rule, not the markup:** probed in the same Chromium with a 384/640/828
  ladder, it takes the **smallest rung whose density ≥ DPR** — 384 w at `sizes` ≤ 146 px, 640 w
  from 147 px to 243 px, 828 w from 244 px; no geometric-mean step. So the honest 178 px and the
  old 206 px both need ≥ 467 device px and both get 640 w, which is why the bytes did not move;
  the hero at 412 px needs 1 081.5 device px, 1.5 more than the 1080 rung, so it takes 1200 w.
  No honest `sizes` fixes this (384 w needs a 146 px claim for a 178 px card). Stopped, escalated.
- 2026-10-03: `tests/visual/product.spec.ts`'s `gallery-placeholder` block now reads
  `/dev/components`'s PDP `Gallery` with `PRODUCT_GALLERY_PLACEHOLDER` (the e2e ruling); its two
  linux baselines from run 37123143990 (`38cb1093`): of 104 rendered, exactly those two differ;
  each viewed beside the committed one — the same caption, gradient box and four empty
  thumbnails, narrower in the `/dev/components` column (desktop 420 px wide, mobile 324 px).
  `visual:baselines --verify` on that run's manifest: 104 of 104. `gates:cheap` PASS on `38cb1093`.
- 2026-10-03: CI run 37123660543 on `81818052` (`origin/main` merged in, no force-push): every job
  green but `e2e`, red only on `media-budgets.spec.ts:87` × `/en`, `/de`, `/pl` (215 876 B each,
  the escalation); `visual` green with the two new baselines; the consent flake did not recur.
  Lighthouse LCP `/en` 1 870 ms, `/en-gb` 1 933, `/de` 1 866, `/pl` 1 799 (budget 2 000; `/en-gb`'s
  margin is 67 ms). Stopped on the budget; row `blocked`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

**Partial, blocked (2026-10-03).** Draft PR [#148](https://github.com/itsahmeds/flowers-overseas/pull/148).
Data: 144 batch-2 rows approved at `2026-10-03T09:21:10Z`; FO-BQ-004 pair B (2 rows, 8 variants,
694 variant rows in all); 576 alt strings (144 × en, en-gb, de, pl); `seed/snapshot` regenerated.
Unit: the sign-off case and two new cases in `tests/unit/seed-media-manifest.test.ts` (20 cases
green, three mutations each red). Bucket: 576 objects uploaded and verified. Gates:
`seed:check` 0, `media:variants --check` 0, `gates:cheap` six of seven exit 0, `tests` exit 1
(the 20 escalated cases). Not yet: the six out-of-fence test files, CI, Lighthouse on the four
locale homes, visual baselines. No build slot taken.
