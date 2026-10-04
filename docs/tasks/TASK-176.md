# TASK-176 — Visual identity v2 chrome

Row: `TASKS.md` → TASK-176. This brief is the task's long form (spec 001 §14 A15, AC-34).

## Binding

- `specs/004-design-system-layout.md` §14 **A21** (visual identity v2) and A20 (no dead controls).
- **Design source of truth:** `docs/design/directions/warm-c/` (home, shop, product) and design system v2 in
  `docs/design/system/` plus `docs/design/wireframes/` (every page type, desktop 1440 and mobile 390, with an
  annotation block). Match the artboards.
- Founder, 2026-10-03, in chat: "A is good", "I like A with C colors better not the researched one... but i just think main background
  color could just be a little lighter", "a bit more light", "Good. Now lets lock in the design and start building".
- Cards are printed, never claimed as handwritten. The trending heading is "Popular choices" (TASK-140). Honest copy,
  future tense for florists. No new English string ships unreviewed (5 % gate): list any you need for the founder.
- Keep: server rendering, logical CSS, no literal strings, WCAG 2.2 AA, the 2,000 ms LCP budget, the client-JS budget,
  the AC-21 crawl, every existing SEO gate. Re-take only the visual baselines this task causes, via the label flow.
- Visual identity v2 chrome: header, footer and notice bar in the new look, every control a real link or absent (spec 004 §14 A20/A21)
- Depends on: TASK-175, TASK-173.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A20, A21; `docs/design/README.md`; `docs/codebase-map.md`.

## Carry-forwards

- **From `/review 162` round 2 (2026-10-03, TASK-173), carried by the orchestrator:** the `de`/`pl` `footer.link.*`
  labels for unpublished entries are still English ("The guarantee", "Cookies"); translate them with the v2 footer.
- **From `/review 162` round 1 (2026-10-03, TASK-173), carried by the orchestrator:** the footer has no legal or imprint
  links until TASK-174, which must land before the robots/noindex gates lift or checkout opens.
- **From the PR 166 design round (2026-10-03), carried by the orchestrator:** the shipped footer draws "Card payments are
  processed by Stripe. We never store card numbers." in Phase 0, against spec 004 §14 A10 (it renders only once a payment
  integration ships). The `chrome-*` artboards mark it hidden in Phase 0; the v2 footer drops it.
- **From PR 168 (TASK-175) breaker round 2, HOLE 1 ACCEPTABLE (reviewer, PR 168 comment 5974924179):** the utility strip's wrap below 390 px is pinned by nothing. Add a 320 px no-horizontal-scroll case in all four locales, and extend the 390 px chip-in-viewport case beyond `/en` to all four locales. Deleting the wrap classes must turn it red.
- **From PR 168 breaker round 2, HOLE 2 ACCEPTABLE (same comment):** the Linux fallback faces (`src/app/globals.css` L378–L392, `src/modules/ui/fonts/index.ts` L59, L107) are pinned by nothing. Add a unit test that recomputes the override values with Next's fallback-metrics function (mutations FB1–FB6 must go red), and correct the comments at `globals.css` L375 and `fonts/index.ts` L26–L28, which claim `fonts.test.ts` already does.

## Escalations

- **E1 — spec 004 §14 A4 vs the `chrome-mobile` artboard. RULED (coordinator, 2026-10-04): A4 binds.** The switcher and
  the currency must be reachable at 390 px (an i18n gate and a conversion issue; A21 does not supersede A4). Done: below
  `lg` the notice bar has a second centred 44 px row with the four languages and the currency; the help line stays in the
  footer there. Mobile notice bar re-pinned 36 → 80 px; recorded in `docs/design/README.md` with A4 cited.
- **E2 — copy held back for the 5 % gate. RESOLVED:** the founder approved the batch on 2026-10-04; both strings ship.

## Progress

- 2026-10-04 · Header, notice bar and footer rebuilt from `chrome-{desktop,mobile}.dc.html` (commit 1390b313); unit contracts moved (c66d27f0); e2e/a11y header and footer specs moved to the v2 heights (measured on a production build: notice 36/62, banner 121/83, identical in en/de/pl at 390–1 920 px, no horizontal overflow anywhere). Next: visual baselines through the `visual:baselines` label, then `ci:full` once PR 168 merges and this branch is rebased.
- 2026-10-04 · Baselines committed from visual-baselines run 37153534704 (whole change list, verified). A4 ruling applied (notice bar second row on mobile, 80 px); founder copy batch and the home-less price claim (`@notice` slot) applied; baselines from run 37156816415. Left: when PR 168 merges, `git rebase --onto origin/main 2a1d1489` (expect conflicts in `SiteHeader`/`SiteFooter` with the TASK-175 finisher's header/footer fixes: keep this branch's markup), re-take baselines, ready, `ci:full`.
- 2026-10-04 · Rebased onto main after PR 168 (`git rebase --onto origin/main 2a1d1489`): this branch's header, footer and e2e chrome markup kept; TASK-175's tokens, fonts and primitives taken from main. HOLE 1 and HOLE 2 carry-forwards done (see Result). Baselines from visual-baselines run 37172063082 (six images, all opened). Ready with `ci:full`.

## Result

**PR:** https://github.com/itsahmeds/flowers-overseas/pull/172 (rebased onto main after PR 168 merged as `df5cab72`; the diff is this task alone).

**What shipped** (spec 004 §14 A20, A21; AC-7, AC-8, AC-9, AC-14):
- `SiteHeader`: `NoticeBar` (dates line gated by A19, "Prices include delivery and VAT", the guarantee; from `lg` the `tel:`
  help line, spec 003's switcher and the currency as text) + sticky banner (Mark + outlined `Wordmark` named by the trading
  name, the eight category links, the "Send flowers" pill → `/{locale}#send`). Mobile (< `xl`): 64 px row + scrolling
  44 px chip row; the notice bar's second row carries the languages and the currency (A4). No search, account, basket,
  menu or WhatsApp icon-link.
- `SiteFooter`: paper-2, `airmail-edge-footer`, four columns (about, Sending, Help & WhatsApp, Payment), fine row
  (languages, Cookie settings). The reminder form is gone (A20, A21 clause 1; route and constants kept). The Stripe
  sentence renders only once a payment method is available (A10).
- `NoticeDocument` (chooser, 404): outlined wordmark. The two 500 boundaries keep live type (client chunks; 11 KB of
  paths would ride on every document).
- **Heights, deliberately re-pinned** (A21 clause 7, and A4 per the 2026-10-04 ruling): notice bar 80 mobile / 62 desktop, banner 121 mobile / 83 desktop
  (was 113 + 96 / 45 + 138). Measured on a production build at 320–1 440 px in en/en-gb/de/pl: identical across
  locales at 390 and 412, no horizontal overflow at any width (at 320 px the currency wraps to a third row), CLS 0. This owns TASK-175's
  390 px overflow fix for the header and footer markup it replaces, and the footer label sizes (13 px headings, 14 px
  fine row).
- The local build was taken inside the build slot to measure those heights (the e2e pins needed real numbers; load
  average 33–78 at the time, so no timing number is claimed). `pnpm budget:client-js`: every URL within budget.

**Copy** (founder's batch, 2026-10-04, "ok from my end", transcribed as `reviewed: true` in `en.meta.json` with the
founder as reviewer): `nav.send` "Send flowers"; `nav.utility.guarantee` "Fresh-flower promise"; `company.support.hours`
"Message us any time, 24/7 — we reply within a few hours."; `company.description` (since round 1: main's reviewed present-tense sentence, restored byte for byte, see below); `nav.notice.lead`
"A note from us:"; `footer.signoff` "With love, from wherever you are." de/pl drafts stay `reviewed: false` (all
`footer.*` labels, `company.support.*`, the six keys above; de "Strauß senden", because the AC-15 partner-name check reads
"Blumen" as a florist brand).

**Price claim** (founder, 2026-10-04, "dont write this on home"): the `@notice` parallel-route slot of
`src/app/[locale]/layout.tsx` — `@notice/page.tsx` renders nothing on `/{locale}`, `@notice/default.tsx` renders
`NoticePriceClaim` everywhere else. No path read, documents stay static; the bar's height is set by its 44 px links, so
62 px desktop with or without the claim (measured, CLS 0).

`en` unreviewed share after this task: 23 / 543 = 4.2 % (every chrome key it added is attested).

**Carry-forwards from PR 168 breaker round 2 (done on the rebase):**
- HOLE 1: `tests/e2e/header.spec.ts` — the 390 px switcher-and-currency case now runs in `/en`, `/en-gb`, `/de`, `/pl`;
  a new 320 × 568 case per locale asserts `[data-fo-utility]` and `[data-fo-header]` have `scrollWidth === clientWidth`,
  the document does not scroll sideways, and the switcher, each of its links and the currency lie inside the notice
  bar's gutters. Mutation: deleting `max-lg:[&>div>div]:flex-wrap` from the `NoticeBar` wrapper turned the case red in
  all four locales (2–3 elements outside the gutters) on a production build; a viewport-only check survived it on macOS
  (the unwrapped row is 310 px in a 280 px box but still inside 320 px), hence the gutter check. Restored: header spec
  64/64 on a production build (local, inside the build slot, load average 14–20; run only to watch the mutation go red).
- HOLE 2: `tests/unit/fonts.test.ts`, "the metric-matched Linux fallback faces" (6 cases) recomputes the four overrides of
  each Liberation face with Next's `getFallbackMetricsFromFontFile` over the file Next's
  `pickFontFileForFallbackGeneration` picks from the call's `src`, checks each face's `src` and that each Latin call names
  its face first. FB1–FB6 each turned it red. The comments at `globals.css` and `fonts/index.ts` now name that case.
- Finding: `§` is not in the font repertoire, so it renders from the fallback (now the size-adjusted Liberation face on
  Linux). It appears only on `/dev/components`; that is why `dev-components-desktop.png` moved.

**First `ci:full` (run 37173032829 on `a98fd30b`): e2e and a11y red, fixed.** Three stale or broken contracts, none seen
before because the PR had not run `ci:full`:
- `locale-routing.spec` (AC-6): the v2 footer's logo linked home, a second `href` to the document's own path. The masthead
  lockup is the only one allowed, so the footer logo is now drawn, named, and links nowhere (`docs/design/README.md` row,
  deviation 6). Unit case: "links no document to its own home"; making the logo a home link again turns it red.
- `notices.spec` (AC-12): it compared the lockup's computed font with the masthead's `.display` text, which v2 replaced
  with the outlined `Wordmark`; it now compares the two SVG drawings and the accessible name.
- a11y `footer.spec`: it required the reminder form's field, which A20 removed; it now requires no form and no field in
  the footer.
- `banner.spec:669` was flaky (it passed on retry) and this diff does not touch it.
Local check on a production build (inside the build slot): notices, locale-routing, footer, banner e2e 196 passed; a11y
footer and header 10 passed.

**Round 1 (review `pullrequestreview-5404343162` FAIL, breaker `pullrequestreview-5404354054` HOLES), fixed in one round:**
- R1: rebased onto `origin/main` (05d0af0f); `TASKS.md` keeps main's rows, only this row changes; map regenerated.
- R2 (spec 004 §14 A22 clause 1): main's reviewed `company.description` and its en attestation restored byte for byte;
  de/pl drafts in the present tense, `reviewed: false`; `company-config.test.ts` asserts main's sentence;
  `docs/design/README.md` TASK-176 row records the `chrome-*` future-tense line as difference 7.
- H1: `nav.utility.pricesInclude` drafts de "Preise inkl. MwSt. und Versand" (spec 005's formula) and pl "Ceny zawierają
  dostawę i VAT", `reviewed: false`. `ui-site-header.test.tsx` "{locale}: the price claim says the price includes VAT and
  delivery" (four cases). Mutations red: de "zzgl.", pl "nie zawierają … dostawy", de back to the English sentence.
- H2: `header.spec` "the notice bar's price claim on listing and guide pages": occasions index and destinations hub (one
  segment), shop root and corridor guide (two), category and occasion listings (three), de and pl shop roots. Mutation: a
  null-returning `src/app/[locale]/@notice/[segment]/page.tsx` turned the two one-segment cases red on a production
  build; removed, header/footer/notices/locale-routing e2e 224 passed (build slot, load average 8–30).
- H3: `ui-site-header.test.tsx` "{locale}: no N-day freshness promise anywhere in the chrome" (four cases: no digit in the
  guarantee's name, no number beside day/Tag/Tage/dni/dzień in the chrome). Mutations red: de "7-Tage-Frische-Versprechen",
  pl "Obietnica świeżości przez 7 dni", pl "7-dniowa obietnica świeżości". `site-footer.test.tsx` "A22 clause 1" pins
  the en about line in the present tense; the future-tense sentence turns it (and company-config) red. de/pl tense is a
  translation-review matter, not pinned.
- Reviewer's note recorded, no change: on phones the header claim is hidden (`hidden md:inline`), as on main and in the
  mobile artboard; every priced card carries the wording itself.

