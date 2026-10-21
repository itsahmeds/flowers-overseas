# TASK-244 — Non-critical client chunks wait for the LCP paint

Row: `TASKS.md` → TASK-244. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

On 2026-10-15 the founder answered TASK-235 escalation E1 with "go with option a". The founder
approved the amendment the same day ("specs ok (237 and 240)"). PR 237 has merged; read it on `main`. The class is **keeps
the breaker**: it touches CWV, the LCP assertion and the CI budget (`CLAUDE.md` DoD §4).

- **Spec 004 §14 A-founder-2026-10-15b. Owned: AC-55 (T-60). Re-verified: §9 AC-24.**
  - **Clause 1.** A client chunk that is not needed to paint the LCP element is neither requested
    nor finished before that paint. It loads after the paint, on idle, or on the first interaction
    with its control. You choose the mechanism; record it here under `## Result`.
  - **Clause 2.** The deferred set is declared once in `src/modules/ui`, and a unit test reads it.
    It holds at least the motions, the first-visit language popup and the header and phone Menu
    enhancements. It also holds every other island that is not on the first screen's paint path.
    The consent banner is **not** deferred. If its chunk turns out to be part of the race, escalate
    instead of delaying it.
  - **Clause 3. Nothing else changes:**
    - the measurement basis (A12, A18, the URL set, `numberOfRuns`, throttling, aggregation);
    - the visual baselines taken at first paint;
    - no indexable content moves to the client;
    - the 131,072 B Brotli JS budget and CLS < 0.05;
    - every control that works without JavaScript keeps working, and a tap before the chunk has
      loaded still works.
- **How this relates to other tasks.**
  - **TASK-235 (PR 231)** holds the warm-up and the evidence (C1 to C3, E1). It merges first. Its
    warm-up stays.
  - **TASK-194 (PR 221, the motions)** has to build to clause 1 before it merges (clause 4). Its own
    motion module loads after the LCP paint. This task then adds that module to the declared set.
    *Re-sequenced by the orchestrator, 2026-10-18:* this task no longer waits for TASK-194. The
    LCP flake (2,009 to 2,117 ms on `/en`) turned CI red on most PRs of 2026-10-17/18, and TASK-194
    is blocked on a founder budget ruling. This task declares the deferred set with a reserved
    entry for the motions module; TASK-194 adds its module to the set when it lands (a
    carry-forward in its brief). Never run it beside a TASK-194 finisher: both live in `src/modules/ui`.
  - **The language popup.** TASK-119 shipped it and is merged (PR 205), so making it lazy is this
    task's job. T-60's red case is the popup module imported eagerly again. TASK-237 (in TASK-233's
    feature, PR 229) changes the popup and the phone Menu. This task starts after PR 229 merges.
  - **TASK-103 (median)** does not change this rule (clause 3).
  - **Every later island** follows clause 1. A merged island that breaks it gets a new task row.
- **Test and evidence (AC-55, T-60).**
  - Unit: the set contents.
  - E2e on every URL in `tests/fixtures/seo/lighthouse-urls.json`: `PerformanceObserver` for LCP,
    plus resource timing. Every deferred chunk starts after the LCP render time. A tap on Menu and
    on the language control before idle still opens it.
  - Lighthouse LCP under 2,000 ms on every audited URL, on the head and in three `ci:full` runs.
    Record the per-URL numbers in `## Result`.
  - The JavaScript-off e2e cases of the home, the Menu and the language links pass unchanged.
- **Watched red:** the popup imported eagerly; a Menu enhancement imported eagerly; the set emptied.
- **Spec 004 §14 A-founder-2026-10-19a clause 3 (binding since TASK-194 merged first, PR 221):**
  this task replaces the reserved motions entry with TASK-194's motion module
  (`src/modules/ui/motion/MotionIsland.tsx`), behind the same mechanism as the other entries, and
  its AC-55 evidence covers the module. T-60 unit: the motions entry resolves to that module, red
  with the entry left reserved; T-60 e2e: red with the motion module imported eagerly.
- **Gates:** run `pnpm gates:cheap` and paste the block. CI must be green on the head with
  `ci:full`; CI is the gate of record for LCP. Report any local number with the load average. Then
  `/review` and `/break`.

## Read

- `specs/004-design-system-layout.md`: `## 0. Index`, then §9 AC-24, §14 A1, A12, A18, A23 clause
  11, A24, A-founder-2026-10-15b
- `docs/tasks/TASK-235.md` on branch `task/TASK-235-lighthouse-warmup` (`## Result` C1 to C3,
  `## Escalations` E1)
- `docs/codebase-map.md`
- `src/modules/i18n/ui/LanguagePopupLoader.tsx`, `LanguagePopupIsland.tsx`,
  `src/modules/ui/consent/ConsentBannerLoader.tsx` (the loader pattern to compare),
  `src/modules/ui/index.ts`, `tests/e2e/lcp.spec.ts`, `lighthouserc.json`, `scripts/client-js-budget.ts`

## Carry-forwards

_None yet._

## Escalations

_None recorded._

## Progress

- 2026-10-18: the set (`src/modules/ui/deferred/deferredSet.ts`), `AfterPaint` + `whenPainted()`,
  two new loaders (Menu `Esc`, home sentence) and the popup wrapped in the layout; unit test
  green, mutations red (popup eager, Menu eager, set emptied); T-60 e2e written; PR 253 open,
  ready, `ci:full`. Next: local build in the slot (budget bytes, T-60 against `next start`, the
  popup-eager mutation red in e2e), then three `ci:full` runs for the LCP table.
- 2026-10-18: CI run 39095055543 (head 8ca5caac) red on two counts my first design caused:
  `lighthouse` script transfer 131,771 B on the homes and 131,868 B on the roses pages (over
  131,072), and `client-js-budget.spec.ts` (the sentence's chunk charged on pages that never
  fetch it). Cause: each new lazy chunk costs about 380 B of headers plus its body, and `main`'s
  roses page had 100 B left (130,972 B). Redesigned: the Menu's `Esc` and the sentence load on
  the first interaction only, in one lazy chunk through `React.lazy`; the popup keeps its own
  chunk after the paint. No new request on an untouched load; the initial loader chunk is
  +86 B Brotli (2,126 vs 2,040). Local e2e (T-60, budget, phone chrome, popup, links, LCP,
  consent, home, header) 546 passed; mutations red. Rebased on `origin/main` (a0d9201d). Next:
  three `ci:full` runs and the LCP table.
- 2026-10-18, at the 180-minute limit (report `partial`): CI run 39099532738 on 9e750074 was red
  on `e2e` only in `checkout-ui.spec.ts` (4 cases, both projects): typing in the `/dev/components`
  checkout form was the first interaction, so the window-wide trigger loaded `lazyIslands.ts`
  and the spec's "the islands make no network request" saw it. Fixed in the last commit by
  clause 1's own words, "the first interaction with **its control**": `AfterPaint` takes a
  `control` selector (`[data-fo-menu]`, `#send`) and `whenReady()` listens on that element only;
  `focusin` is back in the event list (it is scoped now, so the popup's `showModal()` focus no
  longer counts). Unit 45 green. **Not yet verified on a build**: the local build was running
  when the limit hit, and no CI run has fired on the new head (64df36dd; the `ci:full` label
  has to be toggled). Run 39099532738 on 9e750074 finished with every job green except `e2e`
  (the four `checkout-ui` cases above), so its `lighthouse` job passed: script budget and
  LCP < 2,000 ms held with the interaction design. Its per-URL LCP numbers are in that run's
  step summary and `lighthouseci` artifact; they are not copied here yet.
  **Budget warning for the finisher:** the local build of 64df36dd finished after the limit. The
  initial chunk that holds `AfterPaint` is 2,160 B Brotli (quality 11), +120 B against `main`'s
  2,040 B, where 9e750074's was +86 B. At about 380 B of headers per request, that puts the
  roses listings near 131,092 B, about 20 B **over** 131,072. Trim the control-scoped
  `whenReady()` by 30 B or more before CI (for example, drop `click` from the event list if
  `input` and `pointerdown` cover the AT cases, or fold the `afterPaint` flag into `control`),
  then measure the Brotli size of the chunk holding `AfterPaint` again. The popup's chunk is
  unchanged (`3tb19_x2z4xfp.js`, same hash as `main`). **Left for the finisher:** (1)
  rebuild in the slot, `pnpm budget:client-js` and the Brotli size of the chunk holding
  `AfterPaint` (must stay within about +100 B of `main`'s 2,040 B), then run T-60,
  `checkout-ui`, `client-js-budget`, `home`, `phone-chrome`, `language-popup` and
  `language-links` against `next start`; (2) toggle `ci:full` and read the head's run; (3) three
  `ci:full` runs, the per-URL LCP table below; (4) the row to `in_review`.

- 2026-10-18, resumed: trimmed the shared initial chunk from 2,160 B to 2,129 B Brotli (−31 B):
  one `AbortController` instead of a remove loop, `control` alone picks the wait (a union type
  keeps `on` and `control` paired), one animation frame before the idle callback (an idle period
  asked for inside a frame's callback comes after that frame paints), no `passive`, and the events
  `pointerdown`, `focusin`, `input` (a key on a control always follows its focus). +89 B against
  `main`'s 2,040 B, so roses should read about 131,061 B, 11 B under. Local e2e on that build
  (T-60, `checkout-ui`, `client-js-budget`, `phone-chrome`, `home`, `language-popup`,
  `language-links`, `consent-banner`): 413 passed, 0 failed. Unit 41 green.

- 2026-10-20 (finisher): squashed the branch onto `origin/main` 642b5655 (13 commits had
  conflicts with TASK-194, which deleted `MenuEscape` and moved the Menu's `Esc` into
  `MotionIsland`; old head 14bf158d). Under A-founder-2026-10-19a clause 3 the `motions` entry
  now resolves to `MotionIsland`, loaded after the paint by `deferred/MotionLoader.tsx`
  (`next/dynamic`, `ssr: false`) inside `<AfterPaint island="motions" on="paint">` in
  `SiteHeader`; the `menu-escape` entry is folded into it (the `Esc` is in that module), and
  `MotionIsland.tsx` itself is unchanged. Unit 41 green; watched red: the module imported eagerly
  in `SiteHeader`, the entry left reserved, the `Esc` selector in a second client module. The
  motion e2e waits for `html[data-fo-motion]` in the three cases that acted before the module ran.

## Result

### The mechanism (clause 1, recorded as the brief asks)

- **Since 2026-10-20 (A-founder-2026-10-19a):** the set is `motions` (TASK-194's
  `MotionIsland`, which also carries the Menu's `Esc`; trigger `paint`, its own `next/dynamic`
  chunk through `deferred/MotionLoader.tsx`, mounted by `SiteHeader`, marker
  `details[data-fo-menu][open]`, User Timing mark `fo:deferred:motions` written by the loader),
  `language-popup` and `home-sentence` (the interaction chunk `lazyIslands.ts` now holds the
  sentence alone). A tap on the Menu before idle is a first interaction anywhere, so it loads
  the module before an `Esc` can follow; a link or submit before it loads works natively and
  only misses motion 1's bloom or motion 3's busy mark. Motion 4's shimmer now counts its 800 ms
  from the module's start, not from `load`. Main measured 129,213 B of script on every audited URL
  (run 39447455399), so one more request after the paint fits the 131,072 B budget. The bullets
  below describe the 2026-10-18 design and stand except where this one replaces them.
- **The set**, once: `src/modules/ui/deferred/deferredSet.ts` (`DEFERRED_ISLANDS`): `motions`
  (reserved for TASK-194: `module`, `loader`, `mounts` and `trigger` are `null` until it lands;
  the unit test names the entry, so removing it goes red), `language-popup`, `menu-escape` (the
  header and phone Menu enhancement, AC-47's `Esc`), `home-sentence`. `NOT_DEFERRED` lists every
  other `"use client"` module with its reason; the unit test fails on an unlisted one.
- **The wait**: `<AfterPaint island on control>` (`AfterPaint.tsx`) renders nothing on the server and on
  hydration, then renders the island's loader inside a `Suspense` when `whenReady()`
  (`paintSignal.ts`) fires. Until then the loader's `import()` never runs.
  - `on="paint"`, the popup: window `load`, one animation frame, then `requestIdleCallback`
    (2 s timeout; a zero `setTimeout` where it is missing), or the first interaction. Its own
    `next/dynamic` chunk, unchanged (same hash as `main`).
  - `on="interaction"` with a `control`, the Menu's `Esc` (`[data-fo-menu]`) and the sentence
    (`#send`): the first `pointerdown`, `focusin` or `input` **on that control**
    (clause 1: "the first interaction with its control"). One lazy chunk (`lazyIslands.ts`)
    through `React.lazy` (`InteractionLoaders.tsx`). `input` covers assistive technology and
    autofill on the sentence's select. Scoped, so neither the popup's `showModal()` focus nor
    typing in another form (`checkout-ui.spec.ts`) loads it. One `AbortController` removes the
    listeners and is the "done" flag (`paintSignal.ts`); `AfterPaintProps` is a union, so an
    interaction island always names its control and a paint island never does.
- **Taps before the islands load (clause 3)**: the Menu is a native `<details>` and opens; the
  pointer press that opened it loads the `Esc` listener before an `Esc` can follow. The language
  links are `<a>`. The sentence is a plain form, and the island syncs the current "who" when it
  mounts. "A tap on the language control still opens it" is read as: the header's and the
  Menu's language links navigate (the popup has no opener).
- **Why two kinds (the budget, clause 3).** On `main` (CI run 39093592233) the roses listings
  measured 130,972 B of script transfer in Lighthouse, 100 B under 131,072, and the other URLs
  130,121 B. Lighthouse counts each request's headers (about 380 B here) on top of its Brotli
  body. The first design (each island its own chunk after idle) measured 131,771 B on the homes
  and 131,868 B on the roses pages (CI run 39095055543) and also made `client-js-budget.spec.ts`
  red. An interaction-only chunk is not part of a page load nobody touches, which is what
  Lighthouse and the budget e2e measure, so the untouched load now fetches exactly `main`'s
  requests. The one shared initial chunk (`AfterPaint`, `whenReady`, the loaders, the consent and
  popup loaders) is 2,129 B Brotli against `main`'s 2,040 B: +89 B, so the roses pages should
  read about 131,061 B (11 B under; any later +11 B on that page breaks the budget). `budget:client-js` locally: `/en` 123.4 KB, roses 123.9 KB.

### What the traces show (found, not changed): in plain words for the founder

- **The islands were already loading after the LCP in CI.** In CI's Lighthouse traces the
  popup's chunk started well after the photo had painted, even on `main`. So this change makes
  the rule hold by design (no island can race the photo, on any origin), but **it may not move
  `/en`'s measured LCP much**. What still finishes before the paint in CI is the framework's own
  runtime, which clause 1 allows. If `/en` keeps reading close to 2,000 ms, the lever is that
  runtime or the measurement basis (TASK-103), not the islands.
- In CI's Lighthouse traces the deferred chunks were not in the race even on `main`: the popup's
  chunk started at 740 ms against an observed LCP of 301 ms (run 39093592233, `/en`), and on this
  branch's first run at 1,243 ms against 514 ms. What finishes before the observed LCP is the
  framework runtime (`1rztb…`, `turbopack-…`), which clause 1 calls "needed". So this task makes
  the rule hold by construction; it is not expected to move CI's LCP by itself.
- **The consent banner is not in the race**: its chunk started at 1,222 ms against the observed
  LCP of 514 ms (run 39095055543, `/en`), and at 115 ms against 92 ms locally unthrottled. No
  escalation.

### Islands not in the set, for new rows under clause 4 (orchestrator)

`NOT_DEFERRED` names them with reasons. These two groups run on pages outside the audited URL set,
and none of them is deferred yet:

- **The product page's card-message field**, `src/modules/ui/product/CardMessageField.tsx`: it is
  on every product page, which is not in the audited set, and its buy section belonged to PR 239
  (TASK-228), so this task did not touch it.
- **The checkout islands**, `src/modules/ui/checkout/{BlurValidation,CardCounter,FocusOnMount,
  PlaceOrderButton}.tsx`: today only `/dev/components` mounts them. They need a row when TASK-204
  mounts them on `/checkout`.

### Evidence

- Unit `tests/unit/deferred-set.test.tsx`: 40 cases. Watched red: the popup imported eagerly
  (static import), the Menu enhancement imported eagerly (static import and mount), the set
  emptied (6 red), `lazyIslands.ts` imported eagerly, one animation frame instead of two, no
  wait for `load`.
- E2e T-60 `tests/e2e/deferred-chunks.spec.ts`, local `next start` in the build slot (load
  average 4 to 16), Lighthouse's mobile emulation and throttling, no cookie: 14/14 URLs green.
  Popup chunk start against LCP render time, for example `/en` 2,364 against 840 ms, `/en/send-flowers-to`
  1,846 against 672 ms, roses 2,580 against 740 ms; the interaction chunk not requested by the
  untouched load on any URL, and after one key at 2,572 to 3,404 ms. Watched red on a build with
  the popup and the Menu imported eagerly: 14/14 URLs red on both counts (popup chunk at about
  225 ms, before the LCP; Menu chunk on the untouched load).
- Related e2e locally against the same build: T-60, `client-js-budget`, `phone-chrome`,
  `language-popup`, `language-links`, `lcp`, `consent-banner`, `consent`, `home`, `home-v3`,
  `header`: 546 passed, 66 skipped (project filters), 0 failed. The JavaScript-off cases of the
  home, the Menu and the language links are untouched and pass.
- Local runs took the build slot because the budget and T-60's red case cannot be judged
  without a build.
- **Lighthouse, `ci:full` run 1 on 38e84130 (run 39119415288): red on one assertion only, `/en`
  LCP 2,022 ms (best of 2,022 / 2,151 / 2,150) against 2,000.** Script transfer: 130,210 B on
  ten URLs and 131,061 B on the two roses pages, exactly as predicted (11 B under). Every other
  assertion passed. In the `/en` trace the observed LCP is 500 ms; the popup's chunk starts at
  1,233 ms, the consent chunk at 1,223 ms, and the interaction chunk is not requested. Only the
  framework runtime finishes before the paint. This is the finding above in numbers: the rule
  now holds by design, and `/en`'s LCP sits where it sat on `main` (1,866 to 1,945 ms in run
  39093592233, 2,009 to 2,117 ms on the PRs of 2026-10-17). I did not tune anything.

| URL | Run 1 LCP per run (ms), 38e84130 |
|---|---|
| `/en` | 2022 / 2151 / 2150 |
| `/en-gb` | 1858 / 1993 / 2139 |
| `/de` | 1692 / 1862 / 2148 |
| `/pl` | 1989 / 2001 / 1755 |
| `/en/send-flowers-to` | 1652 / 1633 / 1485 |
| `/en-gb/send-flowers-to` | 1591 / 1738 / 1665 |
| `/en/send-flowers-to/poland` | 1678 / 1868 / 1798 |
| `/en-gb/send-flowers-to/poland` | 1692 / 1689 / 1685 |
| `/en/poland/flowers` | 1958 / 1820 / 1838 |
| `/en-gb/poland/flowers` | 1904 / 1818 / 1906 |
| `/en/poland/flowers/roses` | 1942 / 1905 / 1831 |
| `/en-gb/poland/flowers/roses` | 1824 / 1907 / 1972 |
| `/en/occasions/mothers-day` | 1814 / 1821 / 1834 |
| `/en-gb/occasions/mothers-day` | 1839 / 1812 / 1836 |

Runs 2 and 3 were fired after the 90-minute window; their numbers are not in this table.
AC-24's "LCP < 2,000 ms in three `ci:full` runs" is **not met** on run 1 for `/en`, and this
change cannot be expected to meet it: that is a founder decision (the runtime, or TASK-103's
measurement basis), not a tuning step.

### Addendum: admin confirm switch (after PR 306)

`src/modules/ui/admin/AdminConfirmSwitch.tsx` (TASK-220, /admin/flags) arrived on main after this PR was written. It is an admin-only client module: no public page, no LCP budget. Added to `NOT_DEFERRED` in `src/modules/ui/deferred/deferredSet.ts` with a reason; no path-prefix rule exists, so none was used. Not deferred.

Gates, head b42e8adc plus this change (load average 70+, so the wide suite was run once and not repeated):

```
deferred-set.test.tsx  41 passed
lint 0 · format:check 0 · i18n:check 0 · check:no-db 0 · codebase:map --check 0
typecheck 2 on first run: stale ignored .next/types (removed); re-run clean, exit 0
tests: 3 timeouts at 5000 ms under load (url-pii, zod-boundaries, lint-coverage); re-run alone with --testTimeout=60000: 77 passed
```
