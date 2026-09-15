# TASK-056 — Gates, budgets, docs and spec close: `lighthouse` made blocking on five URLs with the restated Brotli budget, `scripts/check-bundle-budget.ts` + committed baseline + step summary, the axe URL set extended to eight surfaces with no exception list, visual baselines for `/`, `/en`, `/en-gb`, `/de`, `/pl` and `/ar-XB` on both platforms across every new section, `i18n:check` green with the `banner.*` retained flags removed, `check:no-db` over the added file set, `docs/runbooks/design-system.md`, `docs/architecture.md` §2/§3/§4, RoPA, README, `.env.example`, spec §14

Row: `TASKS.md` → TASK-056. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-056-gates-budgets-docs-close`. Last task by design: it measures the finished thing, which is why the enforcement flip comes after every pixel has landed. Spec §13's 2026-09-08 resolution note is binding and overrides §5 defaults where they differ. **AC-24 with the restated budget:** `continue-on-error: true` deleted from the `lighthouse` job (spec 001's second deferred row, `ci.yml`), URL set `["/", "/en", "/en-gb", "/de", "/pl"]`, assertions performance / accessibility / best-practices ≥0.95, LCP <2000 ms, CLS <0.05, **script transfer ≤131 072 B (128 KB) measured as Brotli** (§13 Q13 option (a) as corrected by spec §14 A1 after TASK-046's measurement; option (b) — strings-as-props islands and no client message provider — is the fallback TASK-056 takes if the finished homepage exceeds it), image transfer ≤204 800 B, and `categories:seo` explicitly **not** asserted with the `noindex` reason in `lighthouserc.json` so nobody indexes early to make a number green. Also update spec 001 AC-23's queued correction (the `NO_FCP` wording) as now satisfied. **AC-25**: per-route first-load JS, ≤4 KB gz client message payload, ≤45 KB font transfer for **both** faces, a 5 KB regression guard against a committed baseline, `/` still zero app JS, and neither `@sentry/` nor `zod` in any public route's client bundle — printed as the §11 table to the step summary. **AC-27**: baselines on `darwin/` **and** `linux/` at 0.1% for `/`, each locale home at mobile **and** desktop with every new section in frame (utility strip, masthead, category row, hero + finder, proof row, occasion tiles, relay explainer, trending row, destinations grid, colophon), the gallery, consent banner shown, settings open, suggestion banner shown, and `/ar-XB` — where the `pseudo-rtl` project now screenshots real mirrored layout (arrow and chevron flipped, `mark.svg` and the check not) instead of spec 003's blank page. **AC-26**: axe zero serious/critical on `/`, `/en`, `/en-gb`, `/de`, `/pl`, `/dev/components`, a 404, the 500 boundary and `/ar-XB`, no exception list. **AC-29**: `i18n:check` green, the four `banner.*` `retained: true` flags removed, `common.floristCount` keeps its flag with the reason recorded, `de`/`pl` re-drafted deterministically and still non-indexable. **AC-2**: `pnpm build` + `pnpm test` with `DATABASE_URL` unset and no network; `check:no-db` covers every file this spec added. **AC-30**: `docs/architecture.md` §2 (new config files + `(dev)` route group), §3 (`ui` module row), §4 with **neither** the CSP row nor the `vercel.live` note and the deferred overlay-token and `role="status"` items discharged by TASK-055; `docs/runbooks/design-system.md` + its index row (how to add a token, the contrast manifest, adding a component to the gallery, `<bdi>` and `mirror-in-rtl`, updating a baseline, reading the bundle table, and the design-source files under `docs/design/homepage-v1/`); RoPA rows verified; README and `.env.example` for `ENABLE_DEV_UI`, `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, `CSP_REPORT_ONLY`. **Spec §14 corrections to record:** two font families instead of one (§13 Q2 vs §2), the commerce header superseding §5.3's minimal header, the four-way split of §12's task 5, the canvas sections §2's home skeleton does not mention (occasion tiles, trending, reviews, destinations grid), the payment-colophon honesty ruling from TASK-049, the `Continue` target helper from TASK-052, and the Brotli budget restatement. **Spec exit signal:** this PR merged with a recorded `/review` PASS, Phase 0 specs `4 / 12`, `lighthouse` green and **required** on five URLs, the bundle table under budget on every public route, axe 8/8 with no exception list. Tests: T-26, T-27, T-28, T-29, T-31, T-32, T-03 (final run).

## Read

- `specs/004-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `docs/architecture.md`
- `docs/runbooks/design-system.md`
- `docs/design/homepage-v1/`

## Carry-forwards

- **Inherited from `/review 27` (nit 3):** the `largest-contentful-paint` assertion this task flips to required is currently red on `/de` because the spec-003 suggestion banner island is the LCP element (~2.4 s render delay); decide here whether it is fixed or the banner is deferred, since the flip cannot land red.
- **From `/review 28` (2026-09-09):** the CSP enforce flip is no longer this task's — TASK-058 owns it (spec §14 A2); this task decides where the GA4 tag (~30–35 KB when `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is set) sits relative to `resource-summary:script:size` before the id is ever set, since §14 A1 leaves 1 434 B of headroom on locale documents. **From PR 40:** Lighthouse already fails LCP and `script.size` on main; PR 40 moves LCP `/en` 2 654→2 801 ms, `/de` 2 654→2 953 ms via the same message blob — re-measure after TASK-085 before treating it as a homepage problem.
- **From `/review 53`:** `/de` LCP element is the consent sheet body (`ConsentBannerView.tsx:190`), 2.66–2.80 s local — the LCP fix lives here; Lighthouse's `resource-summary.script.size` reads gzip (156 444 B) against a 119.5 KB br budget — make the blocking measurement Brotli; the site promises a delivery photograph in three places for spec 027's not-yet-existing feature — add a launch-gate row (strings render only once 027 ships or reword); `linux/` visual baselines refresh once CI is restored.
- **From `/review 53` round 3:** the dates band renders 106 vs the artboard's 97 px because the artboard uses an off-scale 22 px padding and unstyled `normal` line-height — founder canvas question: snap the drawing to `--space-lg`/the body line-height token, or add a token; at 1280 the date labels wrap (artboard is a 1440 drawing).
- **From `/review 55`:** own a deliberately reachable 500 route for AC-26's axe set and a visual baseline; add a `document.fonts.ready` wait before the notice screenshots.

- **From `/review 61` (2026-09-15, FAIL):** the `lighthouse` step summary's per-URL table can never
  print — `ci.yml` guards on `.lighthouseci/manifest.json` but LHCI writes it to
  `.lighthouseci/reports/manifest.json` (`upload.outputDir`); fix the path and pin it in
  `tests/unit/ci-workflow.test.ts`.
- **From `/review 61` (2026-09-15):** `/` measured 2 425 / 2 106 / 1 952 ms LCP across the three
  warmed runs against a 2 000 ms required assertion — it passes only on the median, and a GitHub
  runner is slower than this laptop. Reduce it or record the spread and the decision.
- **From `/review 61` (2026-09-15):** record the AC-30 §4 reading as a spec §14 amendment (A17),
  not only in this brief's reviewer notes; note there that §12's exit signal ("one row left") is
  stale — §4 has three rows.
- **From `/review 61` (2026-09-15):** `TASKS.md` row 74 still reads `in_progress` with no PR link.
- **From `/review 61` (2026-09-15, nit):** `tests/visual/__screenshots__` is 18 MB with a 4.3 MB
  `dev-components-desktop.png` that every UI task re-baselines — split into element baselines or
  move to Git LFS before the next design task.
- **From `/review 61` (2026-09-15, nit):** `en.meta.json` `consent.body` keeps `reviewed: true` /
  `reviewedBy: founder` under a refreshed `sourceHash`; re-attest at the next copy review.
- **From `/review 61` (2026-09-15, nit):** `tests/e2e/home.spec.ts:369` (type-ahead, `e2e-mobile`)
  is flaky under a full parallel run; passes alone. Pre-existing, will read as a red `e2e`.

## Escalations

1. **The consent sheet still paints at ~2.4 s; only server-rendering it would change that, and
   AC-17/§5.4 forbid it.** AC-24's LCP assertion is green because the LCP *element* is the hero
   `H1` again (the sheet's body is two text blocks now, neither larger than the heading — §14 A14),
   and that is an honest fix for the metric: the page's main content really is painted at ~1.5 s.
   What it does not fix is when the consent copy itself appears. The durable fix is to put the
   sheet's markup in the cached document and have the ≤1 KB consent bootstrap hide it for a visitor
   who has already decided — which is what AC-17 ("appears after hydration"), §5.4 ("no consent
   markup in the cached document") and `tests/e2e/consent-banner.spec.ts` currently forbid, and
   which has a real cost (consent copy in every cached document; a no-JS visitor would see nothing
   change). **Decision needed from the founder/orchestrator**, as a §14 amendment; an implementer
   may not overturn another task's reviewed AC. Not blocking this PR.
2. **Turning GA4 on now makes `lighthouse` red.** Measured at the flip: 1 774–4 486 B of headroom
   on the script budget, against ~30–35 KB for `gtag.js` (§14 A15). Setting
   `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is therefore a budget decision as well as a RoPA-affecting act.
   Recorded, not taken.
3. **The delivery-photograph promise (carry-forward from `/review 53`) is a launch gate, not a code
   change here.** The copy promises a photograph at the door in three places for spec 027's
   not-yet-existing feature. Rewording founder-approved copy is the founder's call; the honest
   options are (a) reword now, (b) gate those strings on spec 027 shipping. Recorded for the
   launch checklist; no code in this PR renders a new claim.
4. **The dates band renders 106 px against the artboard's 97 px** (`/review 53` round 3). Still
   open, still a founder canvas question — snap the drawing to `--space-lg` and the body
   line-height token, or add a token. Untouched here: this task measures, it does not redraw.

## Result

**Done. The spec's gates are enforced, measured and green locally.** CI is billing-blocked, so
every gate below was run on this machine against a cold `pnpm build` + `pnpm start`; the PR body
carries the same numbers.

### What landed

- **AC-24 — `lighthouse` blocks.** `continue-on-error` deleted (it was the last one in `ci.yml`,
  and `pnpm branch-protection` now derives `lighthouse` into the required set by itself). URL set
  `["/", "/en", "/en-gb", "/de", "/pl"]`; assertions performance / accessibility / best-practices
  ≥0.95 (the last two were collected and never asserted), LCP <2 000 ms, CLS <0.05, script transfer
  ≤131 072 B **Brotli**, image ≤204 800 B, `categories:seo` still unasserted with the `noindex`
  reason in the file. Two decisions the spec left to this task are taken and recorded as §14 A12
  and §14 A15.
- **The Brotli measurement (carry-forward from `/review 53`).** `scripts/seo/brotli-origin.ts` +
  `pnpm lighthouse:origin`: the job builds, serves and measures **this repository's own bytes,
  Brotli-encoded**, instead of a preview that injects 25–48 KB of `vercel.live`. A subresource is
  forwarded without the document-only headers, because `transferSize` counts headers and HTTP/1.1
  repeats 774 B of inert CSP/Permissions-Policy on every chunk — 13 180 B on a locale document that
  no HTTP/2 edge sends. Documents keep every header.
- **The `/de` LCP fix (carry-forward from `/review 27` nit 3 and `/review 53`).** Measured cause:
  the consent sheet's body paragraph, 20 748 px² against the hero `H1`'s 16 461 px², painting after
  hydration (2.36 s of render delay). The body is now two paragraphs — the same words, a blank line
  in the catalogue value, `bodyParagraphs()` in the view — so the LCP element is the `H1` at ~FCP.
  `/de` LCP 2 660–2 820 ms → **1 576–1 628 ms**. `tests/e2e/lcp.spec.ts` (8 cases) fails if any
  overlay text block grows past the heading again, which a real German or Polish translation could
  do. The deeper fix is escalation 1 above.
- **best-practices 0.93 → 0.96.** A missing `/favicon.ico` was logging a console error on every
  URL and costing 1 of the category's 28 weighted points. `public/icon.svg` (the brand mark) plus
  `metadata.icons` on the root layout. The app-directory `icon.svg` convention could not be used:
  under this root — a pass-through layout whose documents are rendered by the leaves — `next start`
  answers its generated route with `Internal: NoFallbackError`. The remaining 0.04 is
  `inspector-issues`, a Report-Only CSP violation from Next's flight blocks (§14 A2, TASK-058's).
- **AC-25 — the bundle gate blocks too.** `pnpm budget:client-js` (the spec names
  `check-bundle-budget.ts`; §14 A13 records why spec 003's script was extended instead) gained the
  ≤45 KB font transfer, the committed baseline `tests/fixtures/seo/bundle-baseline.json` with a
  5 KB regression allowance and an `--update-baseline` flag, the §11 table with its fonts and
  baseline-delta columns, and the first real assertion that **`/` ships zero application
  JavaScript** — from chunk *contents* (`data-fo-*` markup), because a module name in a loader stub
  proves nothing (`/review 36`). The `continue-on-error: true` on the `build` job's step is gone.
- **AC-26 — axe on eight surfaces, no exception list**, including **both** 500 documents through
  two routes that throw on purpose: `/dev/boom` (global boundary, server throw) and
  `/{locale}/boom` (localised boundary, post-hydration throw — a server throw is answered with the
  global document whatever segment it is in). Both are behind `ENABLE_DEV_UI`, which the env schema
  refuses in production; the locale gate is checked before the throw, so `/fr/boom` is a 404 like
  `/fr`. 57 axe cases green.
- **AC-27 — baselines.** Eight new full-page baselines (four locales × the two artboard widths,
  every section in frame), the gallery, and the two 500 documents; `settle()` — `networkidle`,
  `document.fonts.ready`, two animation frames — added to every full-page shot (`/review 55`). The
  eight consent baselines changed on purpose (the two-paragraph body). 37 visual cases green.
- **AC-29** green with no change needed: the four `banner.*` `retained` flags were already gone,
  `common.floristCount` keeps its flag with the reason recorded in `scripts/i18n-check.ts`'s
  header, and `de`/`pl` were re-drafted deterministically after the consent-copy edit.
- **AC-2** — `check:no-db` now scans the whole of `src/modules/ui`, the spec-004 route tree, the
  §5.2 server seams and `src/modules/analytics`. `src/app/api` is deliberately not scanned as a
  whole (spec 013's checkout will import the client there on purpose).
- **AC-30** — `docs/runbooks/design-system.md` + its index row; README rewritten for the three
  changed gates and the new script; `.env.example`, RoPA and `docs/architecture.md` §2/§3/§4
  verified current (see the notes below). Spec §14 gained **A6–A16**.

### Notes for the reviewer

- **`linux/` visual baselines are deferred**, as agreed in the 2026-09-10 handoff: they cannot be
  generated on macOS and CI is billing-blocked. No `linux/` file was deleted or touched; the first
  CI `visual` run after billing is restored writes the missing ones from its failure artifact.
- **`docs/architecture.md` §4 was left as it is.** AC-30 asks for "neither the CSP row nor the
  `vercel.live` note"; TASK-046's `tests/unit/architecture-doc.test.ts` asserts that the deferred
  *rows* are gone **and** that the discharged-CSP paragraph keeps ADR-0016, the `vercel.live`
  position and the superseded `plan/01` §9 sentence. Read as "no deferred row for either", which is
  the state today, both hold; read as "the words must not appear", they contradict each other.
  Flagged rather than silently resolved.
- **`PURPOSE_LIMIT` in `scripts/codebase-map.ts` is 100 → 80.** The four files this task adds took
  the generated map to 12 748 B against spec 001 AC-33's ≤ 12 KB *target*, which had 76 B of slack.
  The target exists to keep an agent's orientation cheap, so the lever taken was a tighter index
  (12 086 B, every row still naming what the file is for) rather than a wider budget.
- **`tests/visual/__screenshots__` is 18 MB** (was 5.8). `dev-components-desktop.png` alone is
  4.3 MB and will be re-baselined by every UI task. AC-27 asks for the gallery, so it is here; a
  later task may want to split it into element baselines.
- One Lighthouse run on `/` reported LCP 2 679 ms against ~1 480 ms on the two after it: a cold
  `next start`. The CI job warms every URL before measuring, and the runbook says to do the same.
