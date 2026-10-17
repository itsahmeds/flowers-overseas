# TASK-231 — Home headings and the sentence to the artboards

Row: `TASKS.md` → TASK-231. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

A bug in merged work (TASK-177, TASK-196), so a new task (founder rule, 2026-10-14). Class:
**keeps the breaker** (changed 2026-10-15 from review-only): spec 004 AC-52 changes
`pnpm i18n:check` (the tag set) and the founder's `record-approval` comparison, which are
`scripts/` gates and i18n tooling (`CLAUDE.md` DoD §4), and TASK-232 in the same PR changes home
links (PR 226 review nit 1).

- **Spec 004 §14 A21 clause 1, A24 clause 1:** implementers match the round-2 artboards
  `docs/design/wireframes/home-desktop.dc.html` and `home-mobile.dc.html` (PR 189).
- **The poppy italic phrase (QA-3 D-01).** A21 clause 2: poppy `--accent` is for "Send, prices and
  the one emotional phrase per page"; clause 3: Fraunces italic 300 is "the emotional phrase"; the
  identity table in `docs/design/README.md` ("Act: poppy … the one italic phrase in a heading").
  The artboards set *far away.*, *choices*, *sending for*, *occasion?*, *None of them is a
  courier.*, *promise*, *ask first* and *send flowers* in the home's `h1 em`/`h2 em`
  (sunflower on the phone cover), and *our order* in `product-desktop`'s related-products heading.
  The built pages print every one in roman. **No new words:** the marker wraps words already in
  each approved string. Where TASK-226 or the founder's copy batch changes a heading's text, the
  marker follows the approved text.
- **Spec 004 §14 A-founder-2026-10-14d ("italic ok", 2026-10-14). Owned: AC-52 (T-57).** This
  replaces the earlier "if the review state changes, stop and escalate" hedge:
  1. A heading whose artboard draws the phrase carries one `<em>…</em>` pair around exactly that
     phrase in its **message value**, rendered with next-intl's `t.rich` into an `<em>`. At most
     one pair per heading, none outside a heading's value. The PR names each key and phrase.
  2. `h1 em` and `h2 em` render Fraunces italic 300 in the poppy token (sunflower on the phone
     cover), tokens only; clause 3's fallback applies if the italic file was cut.
  3. A marker-only change **keeps the founder's approval**: a value whose tag-stripped text equals
     the base byte for byte keeps `reviewed`, `reviewedBy` and `reviewedAt`; only `sourceHash` is
     recomputed. `record-approval`'s exact-match comparison reads the value with the two tags
     removed. Any other change in the same value is an ordinary edit.
  4. Each `de` and `pl` value of these keys carries one pair around the phrase's translation, and
     `i18n:check` treats the tag set like the argument set: a locale value that lacks the pair or
     adds another fails.
- **The country select never clips its value (QA-1 Q1-04, QA-4 #1).** A21 clause 4 (the sentence
  picker): at 390, 360 and 320 px in all four locales the selected country renders whole ("Poland",
  "Deutschland", "Rumunia", the longest name in each locale) with its chevron clear of the text;
  the artboard draws it whole. AC-43 (the phone) and AC-46 (home half) re-verified.
- **"Continue →" (QA-3 D-19):** the arrow is the drawn `chevron`/arrow icon (aria-hidden, mirrored
  under `dir="rtl"` per spec 004's `mirror-in-rtl`), not a new string.
- **Touches the product page** only for the related heading's italic phrase: never run beside
  TASK-227, TASK-228, TASK-229 or TASK-230 (same files); sequence after their PR or hand that one
  line to their agent.
- **Gates:** cheap gates; CI green with `ci:full` (home visual baselines re-taken in CI); `/review`
  and `/break`. Mutations watched red: `em` removed from one heading; select width back to its old
  value at 390; T-57: one word inside a marked value changed (the tag-stripped comparison fails),
  `t.rich` replaced by `t` (the tags print as text), a `de` value without the pair.
- **Not this task:** the home finder's "soon" mark on a not-open country (spec 007 AC-33) is
  TASK-239's, after this PR; keep `SentencePicker` changes to the clipping fix.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A21 clauses 1–4, A23 clause 6, A24 clause 1, A-founder-2026-10-14d, AC-43, AC-46, AC-52
- `specs/003-i18n-foundation.md` — §14 A15 clause 6, A17 clause 5 (`record-approval`); `scripts/i18n-check.ts`
- `docs/design/wireframes/home-desktop.dc.html`, `home-mobile.dc.html`, `product-desktop.dc.html` (related heading); `docs/design/README.md` (identity table, the 2026-10-13 TASK-196 row)
- `docs/codebase-map.md`
- `src/modules/ui/home/SentencePicker.tsx`, `HomeHero.tsx`, the home section components, `src/modules/ui/product/ProductPage.tsx` (related heading)

## Carry-forwards

- **For TASK-228 (product page):** the related-products heading's italic phrase, *our order* in
  "Six more, in our order" (`product.related.heading`, `product-desktop.dc.html` `#rel-h`), is not
  done here (work order fence: TASK-227 to TASK-230 own the product page). Mark it with
  `HEADING_EM` (`src/modules/ui/primitives/typography.tsx`) the same way.
- **For TASK-194 (motions):** the hero phrase is `#hero-heading em[data-fo-em]`, the hook for the
  underline motion (cell 5); no motion is built here.

- **From the site test (2026-10-14):**
  - QA-1 Q1-04 (P1): "Poland" reads "Polana" at 390 and every phone width.
    `.claude/state/qa-2026-10-14/QA-1-05.png`; QA-4 `QA-4-out/sent-en-390-mum-birthday.png`.
  - QA-3 D-01 (P1): `QA-3-home-1440-first-built.png` against `-design.png`,
    `QA-3-home-card-sidebyside.png`, `QA-3-home-390-first-*`.
  - QA-3 D-19 (P2): Continue lost its arrow. `QA-3-home-card-sidebyside.png`.
- **From PR 226's review (2026-10-14):** spec 004 AC-52 and T-57 now own the italic phrase; cite
  them, and the escalation hedge is dropped (done above).
- Same agent and PR as TASK-232 (branch `task/TASK-231-…`).

## Escalations

- **E1 (2026-10-15), resolved the same day by spec 004 §14 A-founder-2026-10-14d (PR 227).** The
  first build shipped the eight marked `en` values `reviewed: false`, which put `en` at 6.27 % and
  `en-gb` at 6.46 % unreviewed and turned both non-indexable. Clause 3 of the amendment keeps the
  founder's approval for a marker-only change, so every marked value keeps `reviewed`, `reviewedBy`
  and `reviewedAt` and only its `sourceHash` follows the value; the share is unchanged (`en` 4.80 %,
  `en-gb` 4.98 %).
- **E2 (2026-10-15): the destinations heading is `destinationsHub.h1`, shared with the hub page.**
  The home's "Where we can send flowers" is the destinations hub's `<h1>` key. It carries the marker
  (the home's artboard draws the phrase), the home renders it in `<em>`, and the hub page renders
  the marker as plain words (`DestinationsHubPage.tsx`, one line outside this fence) so the hub
  looks as it did; the hub's `<title>` reads `seoTitle`, not this key. Whether the hub's own H1
  shows the phrase (its artboard draws `<em class="sun">send flowers</em>`) is a hub-page task.

## Progress

- 2026-10-15: started on `task/TASK-231-home-to-artboards` (one feature PR with TASK-231/232).
- 2026-10-15: implementation, unit and e2e tests; build slot once for the select clip probe, once
  for `next build` + `next start` + the e2e suites; rebased on PR 227/232 (A-founder-2026-10-14d:
  marked values keep their approval) and reworked the messages to match; PR 230 ready.
- 2026-10-15 (stopped at the weekly usage cap): every Binding item of both briefs is built and
  tested (see `## Result`), except TASK-232 item 7's house/camera/plus (E3) and the product
  heading (carry-forward to TASK-228). CI on `ecf1b1e2`: spine green; `visual` red (baselines,
  the orchestrator's `visual:baselines` label); `a11y` red on the two home FAQ cases that assumed
  every question closed, fixed in the next commit (not yet re-run); `e2e` 1798 passed, 1 failed:
  `language-popup.spec.ts:401` "a top sheet at 360 × 640" (CLS, AC-39), not yet investigated: the
  hero's italic swap (0.0003 at 390) may be the cause, as the popup test excludes only the
  sentence. Remaining: look at that case (likely `FONT_SWAP_REGIONS` in `language-popup.spec.ts`),
  toggle `ci:full`, refresh visual baselines, `/review` and `/break`.
- 2026-10-15 (finisher): rebased on `origin/main` (map regenerated); found the 360 × 640 CLS cause
  (the H1 gaining a line on the italic swap, not a region the test should exclude) and fixed it in
  `HomeHero` with e2e cases first (red at 360/375/389, then green); `ci:full` toggled on `98e46a1d`.
- 2026-10-15 (finisher, session closing): e2e green on `5feaef5e` (1829 passed); Linux baselines
  refreshed from run 38696273273 and committed (`ea1c1541`); `ci:full` toggled on the final head.
  Next: read CI on that head (expect `visual` green now); remove the `visual:baselines` label;
  `/review` and `/break`. A replacement must know: the scratchpad is shared, use a private subdir.
- 2026-10-18: breaker r1 holes closed in `tests/unit/destinations-hub.test.tsx` (hub h1 has no `<em>`, exact words, 4 locales; watched red with `<em>{chunks}</em>`, 4 failed) and `tests/unit/home-round2.test.tsx` (h1 carries `max-[390px]:[&_em]:block`; watched red with the class removed, 1 failed). Source restored.

## Result

- **PR:** https://github.com/itsahmeds/flowers-overseas/pull/230 (one feature PR with TASK-232).
- **AC-52 (T-57).** The marked keys, words unchanged, review records unchanged (only `sourceHash`
  recomputed, clause 3), `de`/`pl` one pair each:
  - `home.hero.heading` "Flowers for someone <em>far away.</em>"
  - `home.trending.heading` "Popular <em>choices</em>" (`de` "Beliebte <em>Auswahl</em>", `pl` "Popularne <em>wybory</em>")
  - `home.dates.heading` "Dates worth <em>sending for</em>"
  - `home.occasions.heading` "What is the <em>occasion?</em>"
  - `home.howItWorks.heading` "Three people touch your order. <em>None of them is a courier.</em>"
  - `trust.heading` "Our <em>promise</em>"
  - `faq.heading` "Questions people <em>ask first</em>"
  - `destinationsHub.h1` "Where we can <em>send flowers</em>" (E2: the hub page renders it plain)
  Rendered by `t.rich` with `HEADING_EM` (`src/modules/ui/primitives/typography.tsx`); sunflower
  on the phone cover. `i18n:check` counts tag pairs (check 4), with the `em-pair-missing` fixture.
  Tests: `tests/unit/home-round2.test.tsx` (each heading in four locales; the marker keeps the
  approval; no other `en` value has `<em>`), `tests/unit/i18n-check.test.ts`, and
  `tests/e2e/home-round2.spec.ts` (computed italic 300 poppy at 1440, sunflower at 390, and no
  other heading with an `em`). Mutations watched red: `<em>` removed from `faq.heading`.
- **"Polana" (A21 clause 4; AC-43, AC-46).** The select's content box gains a quarter em past the
  italic overhang (`SELECT_INK_ROOM`, `calc-size()`); e2e measures every destination's ink in four
  locales at 320/360/390 and the chevron clear of it. Mutation watched red (the select back to its
  old width: "Poland" inks 58.9 px in a 54.4 px box).
- **"Continue →":** `arrow-end` after the label, `mirror-in-rtl`, unit-tested.
- **Font swap.** The H1's italic is never preloaded (A21 clause 3), so its swap re-balances the
  heading: 0.00012 at 1280, 0.00031 at 390 (`next start`, load average about 17). The header and
  consent zero-shift tests exclude the hero copy with the sentence (`FONT_SWAP_REGIONS`), and
  `tests/e2e/home.spec.ts` bounds the hero copy's own swap at 0.001, as it does the sentence's.
- **Build slot:** taken twice, because the clipping and the swap cannot be judged without a
  browser: a static probe of the select (Chromium), then `next build` + `next start` + the e2e
  suites (`home-round2`, `home`, `home-v3`, `header`, `consent-banner`, `destinations-hub`,
  `phone-chrome`, `honesty`, `links`; green but for `/dev/components` and `/ar-XB`, which a local
  production start does not serve). Visual baselines are the orchestrator's `visual:baselines`.
- **The 360 × 640 CLS (AC-39; finisher).** Cause: at 360 px the H1 is at its 50 px floor and
  "someone far away." ran 318.4 of the 320 px the cover leaves, so whether "far away." wrapped hung
  on sub-pixel advances. On Linux the metric-matched fallback kept it on line 2 and Fraunces pushed
  it to line 3, and the cover's copy (bottom-anchored, `self-end`) rose 48 px when the italic
  swapped in: one entry of 0.158 sourced on `[data-fo-hero-copy]`, outside the popup test's
  excluded sentence. Not the test: the font swap moved real content a real Android phone sees.
  Fix: below the artboard's 390 px the phrase takes its own line (`max-[390px]:[&_em]:block` on the
  H1 in `HomeHero.tsx`), so the heading has three lines in either face; from 390 it follows
  "someone" as drawn (30 px spare). No token, font or preload change. Numbers: CI before 0.158
  (run 38646687793, `ba88aaa7`, both attempts); CI after, run 38692990715 on `5feaef5e`: the popup
  case green, e2e 1829 passed, and the hero copy's swap at 360 logged `0` on all four homes (the
  360 × 640 viewport added to `home.spec.ts`'s swap bounds). Locally (`next start`, fonts delayed
  1.5 s, load average about 16) at 358 px, where macOS reproduces it: 0.15686 before, 0.00002
  after (the popup's own "Current" tag). Tests first: `home-round2.spec.ts` "the hero H1 breaks the
  same way before and after the swap" (320/360/375/389: phrase starts its line, three lines in
  Fraunces and in the fallback; 390: after "someone", two lines), red at 360/375/389 before the
  fix. Residual, not in AC-39's widths: any width where a line ends within a pixel or two of the
  measure can still break differently on the swap (here, near the phone's one-line width).
- **Visual baselines.** `visual:baselines` run 38696273273 on `5feaef5e`: 64 of 112 Linux PNGs
  changed, all opened. The home sections match `home-desktop.dc.html` and `home-mobile.dc.html`
  (order, two-column picks, stamps, "Occasions →", italic phrases, first FAQ open, chips), less
  the ruled deviations (no prices on Popular choices, AC-53; E3 icons). Outside the home: the notice
  bar on every page, and sub-threshold gradient or 1 px offsets on listing, product and footer
  shots. `--verify` 112 of 112, `--check` clean.
- **Build slot (finisher):** once, for `next build` + `next start` + the e2e suites above and the
  CLS probe, because the swap cannot be judged without a browser; released.
- **Gates (finisher, `ea1c1541`):** typecheck, lint, format:check, i18n:check, check:no-db and
  codebase:map --check exit 0; tests 4171 of 4172, the one red a 5 s timeout in
  `catalog-pricing-minor.test.ts` (untouched by this PR) at load average 35; it and the other
  timeouts of the first run pass in isolation. CI's `test-unit` is the gate of record.
