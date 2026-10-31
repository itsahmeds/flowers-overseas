# TASK-289 — Spec 043 listing heads, chips and the eyebrow rule

Row: `TASKS.md` → TASK-289. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

**Redrawn 2026-10-24: the spec revision and the artboards win where they differ from the rest of
this section.** The founder, on the Poland Birthday listing: "This design feels so cluttered and
so shit"; on the redraw (design PR 347): "head ok, short H1". This task now builds the redrawn
listing head on the three country listings (shop root, country category, country occasion; hubs
unchanged): spec 043 §14 A-founder-2026-10-22 **as revised 2026-10-24** (spec PR 346), items 1, 2,
3, 5, 6 and 7; **AC-5, AC-7, AC-19, AC-35, AC-36, AC-37, AC-40, AC-41, AC-43, AC-51, AC-52,
AC-53, AC-54** with the defaults Q-22d (the quiet line reuses `nav.utility.pricesInclude`,
"Prices include delivery and VAT"), Q-22e (`shop.root.demoNotice` keeps its value) and Q-22f
(the example note under the grid). The drawing is the `lh:2026-10-24b` block at the top of
`docs/design/wireframes/country-{shop,category,occasion}-{desktop,mobile}.dc.html`, option B's
H1. Item 4 (the merge of combination products) is not this task's. The older bullets below
(AC-11, AC-12, AC-16 to AC-18, the P.S. and the chips) stand only where the revision does not
replace them.

Spec 043 §5.3 B, D, E and §7 (the copy table, §13 Q4 and Q5 answered by default) and §12 task 2.
- **ACs owned:** AC-5, AC-7, AC-11, AC-12, AC-16, AC-17, AC-18, AC-19 (count-line half); tests T-05, T-07, T-11, T-12, T-16, T-17, T-18, T-19 (count-line half).
- After TASK-239 (the "Ordering opens soon" words) and TASK-241 (PR 235, the toolbar above the grid) (§12 item 1), and after TASK-285's PR, which puts the example label on the count line's row (spec 004 19b clause 3): never beside it.
- AC-19: `messages/en.json` gains no key; the count-line values are spec 043 §7's approved copy; the founder records them (`reviewed: true` in `messages/en.meta.json`) on the branch before merge (A17 clause 5). Ship them `reviewed: false` and say so in `## Result`.
- Spec 004 rebound AC-34 (first-row prices inside the first viewport at 1440 × 900, 1280 × 800 and 390 × 844) still passes (AC-16).
- `docs/design/` artboards from PR 295 (spec 043): `country-shop-*`, `country-category-*`, `country-occasion-*`, `occasion-hub-desktop`, `occasions-index-mobile`, `category-hub-desktop`; each opens with a "Spec 043 · site clarity" entry and ends with a "Spec 043" band. Match them pixel for pixel.
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): price-display copy: `shop.hub.noMoney` and the demo notice; listing links.
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`; the founder records approved copy.

## Read

- `specs/043-site-clarity.md`: `## 0. Index`, then §5.3, §7, §9 and §10 for the ACs below
- `docs/codebase-map.md`
- the listing head and count line in `src/modules/ui/shop`, the hub pages, the occasions index

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** the design review (PR 295) noted stale pre-043 note text in `country-shop-desktop`'s First screen row ("beside the P.S. (shop.root.demoNotice)"). The "Spec 043" band binds; ignore the stale note.
- **From `/plan-tasks` (orchestrator, 2026-10-20):** PR 295 escalation 3: `system/components.dc.html` still draws the shop note's "P.S.". The system sheet must follow `src/modules/ui`; say in `## Result` which components changed so the orchestrator sends the designer a follow-up.

- 2026-10-21 (orchestrator ruling on TASK-288 escalation 1, PR 308): spec 043 AC-6 is false on main: 20 of the 23 category hubs (tulips, lilies, orchids and others) are linked by no page, only by their language alternates. This task's grouped chips and opened "Categories" panel must link every category hub, so the TASK-288 e2e's pinned orphan list becomes empty. Ranking is priority 1: orphan hubs are not crawled from internal links.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-25, copy headroom (to the orchestrator for the founder; `open`): the work order ships the
  short H1 pattern and "How we sort" unreviewed, and the not-open state must read "Ordering opens
  soon". Five values are unreviewed: `shop.h1.countryShopRoot` "Flowers to {country}",
  `shop.h1.countryCategory` "{entity} to {country}", `shop.h1.countryOccasion` "{occasion} flowers
  to {country}", `shop.toolbar.howWeSort` "How we sort", `destinations.state.guideNotDelivering`
  "Ordering opens soon". `en` goes to 30 of 568 (5.3%) and `en-gb` to 31 (5.5%), over spec 003
  A17's 5%, so both locales read non-indexable and 26 unit and contract files fail until the
  founder's record run sets them `reviewed: true` (TASK-119 precedent). With the record simulated
  locally only `sitemap-fixtures` fails, regenerated with `UPDATE_SEO_FIXTURES=1` in the same
  commit. Not routed around.
- 2026-10-25, TASK-239 overlap (to the orchestrator; `open`): TASK-239 is not built, so this task
  changes `destinations.state.guideNotDelivering` to TASK-239's prescribed "Ordering opens soon";
  the home and destinations hub read it too.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-25: worktree `fo-wt-289` on `task/TASK-289-listing-head`; row `in_progress`; Binding updated to the 2026-10-24 redraw. Next: the head components, the sort island, the copy, the tests.
- 2026-10-25: head, quiet line, toolbar, sort island, copy and tests built; local build e2e green on the touched files except the /dev gallery and pseudo-locale cases (env flags off locally); row `in_review`, PR 415.
- 2026-11-01 (finisher F2): Linux baselines from visual-baselines run 41242373892 (head d0b53c72d) copied in and verified (109 match the manifest), commit a770be7e6: the three listing pages at 1440 and 390 and the two laptop shots checked against `country-{shop,category,occasion}-{desktop,mobile}` (breadcrumb or back link, the short H1, the quiet line, Categories and the sort pill on one row, rule, grid); the home, hub, guide, shell and footer shots move only with the destinations' status words (`guideNotDelivering`, Ordering opens soon). Next: CI on the head.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 415 builds the redrawn head on the shop root, country category and country occasion: the quiet
trail, the short H1 at `--text-3xl-fluid`, one quiet line (count, the not-open state, "Prices
include delivery and VAT"), "page N of M" from page 2 only, Categories in two groups, a closed "How
we sort", a "Sort by" pill whose select applies on change (`listing-sort` deferred island; the
Sort button only in `<noscript>`), the example note under the grid, and no lead photo or date card
on the occasion page. Tests: unit (head, count, parts, grouping, sort href, deferred set, barrels)
and e2e (`listing-first-screen.spec.ts` rewritten; band, params, price-once, chunks and page specs
updated). First screen on a local build (load average 5 to 9; today's header, about 34 px taller
than TASK-383's): first photo top 353 px (occasion 386) and first-row price bottom 812 (845) at
1440 x 900, 762 (795) at 1280 x 800; first photo top 273 (occasion 337) at 390 x 844. A local
build ran inside the build slot because the first-screen numbers and the screenshot comparison
cannot be judged without one. Deviations: the phone back link's box is 44 px (spec 004 AC-50) laid
over the artboard's 32 px row; the phone select keeps 16 px (iOS zoom). Carry-forwards: AC-5's
header half waits for TASK-383; AC-40 on the hubs goes to TASK-388; AC-12 (count by noun) is not
built; `ListingGrid`'s `lead` prop is now unused; the occasion page's "Also in" holds the shop root
chip only, as drawn; `system/components.dc.html` should draw the quiet `Breadcrumbs` tone, the sort
pill and `ChevronDown`.
