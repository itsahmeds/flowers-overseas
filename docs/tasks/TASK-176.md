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

## Escalations

- **E1 — spec 004 §14 A4 vs the `chrome-mobile` artboard (not blocking).** A4 puts the language switcher and the currency
  "in the utility strip on every breakpoint, where they are visible without scrolling" (AC-8's chip at 390 px). The v2
  mobile artboard drops both from the notice bar ("the languages move to the footer"; the currency "desktop only"), and
  TASK-175's `NoticeBar` hides its utilities below `md`. I followed the artboard: below `lg` the notice bar is one sentence,
  the currency still renders in the HTML with its localised `aria-label` (AC-8's text, cookie and byte-identity clauses
  hold), and the four languages are in the footer. **Question for the orchestrator/founder:** confirm the artboard, or rule
  A4 still binds, in which case the fix is to show the notice bar's utility row on mobile as a second 44 px line (+44 px).
- **E2 — copy held back for the 5 % gate.** "A note from us:" (notice lead-in) and "With love, from wherever you are."
  (footer sign-off) are drawn on the artboards and not rendered until the founder approves them (see Result).

## Progress

- 2026-10-04 · Header, notice bar and footer rebuilt from `chrome-{desktop,mobile}.dc.html` (commit 1390b313); unit contracts moved (c66d27f0); e2e/a11y header and footer specs moved to the v2 heights (measured on a production build: notice 36/62, banner 121/83, identical in en/de/pl at 390–1 920 px, no horizontal overflow anywhere). Next: visual baselines through the `visual:baselines` label, then `ci:full` once PR 168 merges and this branch is rebased.
- 2026-10-04 · Baselines committed from visual-baselines run 37153534704 (whole change list, verified). Left: when PR 168 merges, `git rebase --onto origin/main 2a1d1489` (expect conflicts in `SiteHeader`/`SiteFooter` with the TASK-175 finisher's header/footer fixes: keep this branch's markup), re-take baselines, ready, `ci:full`.

## Result

**PR:** https://github.com/itsahmeds/flowers-overseas/pull/172 (draft until PR 168 merges; its diff includes TASK-175).

**What shipped** (spec 004 §14 A20, A21; AC-7, AC-8, AC-9, AC-14):
- `SiteHeader`: `NoticeBar` (dates line gated by A19, "Prices include delivery and VAT", the guarantee; from `lg` the `tel:`
  help line, spec 003's switcher and the currency as text) + sticky banner (Mark + outlined `Wordmark` named by the trading
  name, the eight category links, the "Send flowers" pill → `/{locale}#send`). Mobile (< `xl`): 64 px row + scrolling
  44 px chip row. No search, account, basket, menu or WhatsApp icon-link.
- `SiteFooter`: paper-2, `airmail-edge-footer`, four columns (about, Sending, Help & WhatsApp, Payment), fine row
  (languages, Cookie settings). The reminder form is gone (A20, A21 clause 1; route and constants kept). The Stripe
  sentence renders only once a payment method is available (A10).
- `NoticeDocument` (chooser, 404): outlined wordmark. The two 500 boundaries keep live type (client chunks; 11 KB of
  paths would ride on every document).
- **Heights, deliberately re-pinned** (A21 clause 7): notice bar 36 mobile / 62 desktop, banner 121 mobile / 83 desktop
  (was 113 + 96 / 45 + 138). Measured on a production build at 390, 412, 768, 1 023, 1 024, 1 280, 1 440, 1 920 px in
  en/de/pl: identical across locales, no horizontal overflow at any width, CLS 0 (no island). This owns TASK-175's
  390 px overflow fix for the header and footer markup it replaces, and the footer label sizes (13 px headings, 14 px
  fine row).
- The local build was taken inside the build slot to measure those heights (the e2e pins needed real numbers; load
  average 33–78 at the time, so no timing number is claimed). `pnpm budget:client-js`: every URL within budget.

**Copy for the founder's batch (en, `reviewed: false`):**
- `nav.send` — "Send flowers" (new)
- `nav.utility.guarantee` — "Fresh-on-arrival guarantee" (founder, 2026-10-04; was "7-day freshness guarantee")
- `company.description` — "We send flowers across Europe. You order from us; a local florist in the recipient's town will
  make the bouquet and hand it over in person." (future tense)
- Not rendered yet, awaiting approval: "A note from us:" (notice lead-in), "With love, from wherever you are." (sign-off).
- de/pl drafts (`reviewed: false`): every `footer.*` label, `company.support.*`, the three keys above.

`en` unreviewed share after this task: 26 / 541 = 4.8 %.
