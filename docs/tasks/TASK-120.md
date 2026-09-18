# TASK-120 — Honest cutoff copy: gate `nav.utility.cutoff`, `nav.utility.cutoffShort`, `finder.cutoff` and `faq.whoDelivers.answer` on spec 009's `pickerState('PL') === 'live'` (false in Phase 0) with honest fallback strings in four locales; remove the PL `sunday` surcharge seed rows while `sundayDelivery: false`; e2e asserts no same-day or cutoff promise renders anywhere while no destination is live

Row: `TASKS.md` → TASK-120. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-120`; keep it current by editing this file, not the row.

## Binding

- Spec 004 §14 A19 and spec 009's §13 design-round resolution (Q1, Q2): gate every same-day / cutoff promise in the site chrome on the destination's picker state, false everywhere in Phase 0; honest fallback copy in four locales; PL `sunday` surcharge seed rows removed while `sundayDelivery: false`.
- **Widened by `/review 70` (2026-09-16):** the set is not only the four keys — the header's "Same-day delivery" and the footer's "Delivery times and cutoffs" links carry the same promise on every guide page whose facts block says "no cutoff" (spec 007 AC-19's forbidden set). Enumerate every chrome string that asserts a cutoff, a same-day or a delivery-time promise (grep `messages/*.json` for cutoff/same-day/today/delivery time) and gate them all by one predicate. TASK-095's whole-document AC-19 scan depends on this task.
- Predicate: `deliveryDatesOpen(iso2)` in `src/config/countries.ts` until spec 009 task 3 (TASK-123/124) re-sources it to `pickerState()`; same shape as `ActivePartnersProvider`.

## Read

- `specs/004-design-system-layout.md` §14 A19 (the amendment this task executes)
- `specs/008-*.md` §8, AC-6, AC-9 (ranking transparency; the DOM absence rule)
- `specs/007-*.md` AC-19 (the corridor guide's forbidden set)
- `src/config/countries.ts`, `src/config/categories.ts`, `src/config/site-links.ts`
- `src/modules/ui/layout/{SiteHeader.tsx,header-model.ts,footerView.ts}`,
  `src/modules/ui/home/{FinderCard,HomeFaq,OccasionDates}.tsx`
- `docs/design/homepage-v1/homepage-{desktop,mobile}.dc.html`
- `tests/support/listing-honesty.ts`

## Carry-forwards

- **From `/review 70` (2026-09-16):** the set is every chrome promise string, not the four keys —
  the header's "Same-day delivery" and the footer's "Delivery times and cutoffs" carry the same
  promise on every guide page whose facts block says "no cutoff". Gate them all by one predicate.
  TASK-095's whole-document AC-19 scan depends on this task. **Done:** one predicate,
  `anyDeliveryDatesOpen()`, and `tests/e2e/chrome-honesty.spec.ts` scans `body`, not `main`.
- **From TASK-108 escalation 3 (2026-09-17):** the ranking labels `nav.category.bestSellers` and
  `nav.category.sameDayDelivery` are rendered by the site header on every page a listing will live
  on, and spec 008 AC-9 forbids the first outright. **Done:** renamed, not gated.

- **From `/review 77` round 1 (2026-09-18) — required 1 — done (round 2):** rebase onto `origin/main` (6 commits
  ahead; TASK-092 landed the all-destinations hub). Eight `darwin` baselines are regenerated on
  **both** sides — `footer-{de,en}-mobile`, `home-{de,en,en-gb,pl}-mobile`,
  `home-{desktop,mobile}-destinations` — so a squash-merge of this branch reverts TASK-092's
  drawings and leaves `test:visual` red on `main`. Rebase, regenerate those eight, rerun
  `test:visual`.
- **From `/review 77` round 1 (2026-09-18) — required 2 — done (round 2):** after the rebase, add TASK-092's
  all-destinations hub (`/[locale]/[destinations]`, four locales) to `PAGES` in
  `tests/e2e/chrome-honesty.spec.ts`. The file's own claim — "every page type that exists in
  Phase 0 is covered" — is false without it, and TASK-095's whole-document AC-19 scan inherits
  this list.
- **From `/review 77` round 1 (2026-09-18) — required 3 — done (round 2):** design source of truth. Forty artboards
  under `docs/design/wireframes/` still draw the superseded chrome band — "Best sellers",
  "Same-day", "Delivery times and cutoffs", "Order by 14:00 Warsaw time for same-day delivery" —
  and `CLAUDE.md` binds implementers to match them pixel-for-pixel, so the next chrome task
  reintroduces exactly what this one removed. Redraw the band, or record one dated TASK-120 note
  (e.g. in `docs/design/wireframes/canvas.json` or the design README) naming the four superseded
  strings and the owning spec. Implementer's choice; the note is enough.
- **From `/review 77` round 1 (2026-09-18) — nit, carried:** `FORBIDDEN_DELIVERY_PROMISE_TEXT`'s
  `order-by cutoff promise` pattern requires a digit or an ICU placeholder directly after
  "order by", so the *rendered* form of `home.dates.orderBy` — "Order by Fri, 30 Oct, 14:00 CET" —
  escapes it (proved by flipping `anyDeliveryDatesOpen()` to true: `OccasionDates` still passes
  the sweep). The targeted case in `tests/unit/ui-home-sections.test.tsx` nets it, so nothing
  ships wrong; widen the pattern when spec 008 next touches it. Same class: bare `heute` /
  `dzisiaj` without `noch` / `jeszcze`.
- **From `/review 77` round 1 (2026-09-18) — nit, carried:** `unreviewedShare("en")` is now
  **3.75 %** against the 5 % `isLocaleIndexable` gate (`plan/03` §6.4). The
  `AWAITING_FOUNDER_REVIEW` queue doubling took it there; roughly five more unreviewed keys would
  make `/en` and `/en-gb` `noindex`. Priority-1 risk to watch, not this PR's defect.

## Escalations

- **2026-09-18 — RESOLVED, the founder approved the wording as shipped.** `TASKS.md` log and
  `docs/decisions-log.md`: "Delivery dates open when we confirm our first florist" /
  "Delivery dates are not open yet" and "Our selection" (id `our-selection`) stand. The four `en`
  manifest entries — `nav.utility.datesPending`, `nav.utility.datesPendingShort`,
  `finder.datesPending`, `nav.category.ourSelection` — are now `reviewed: true`,
  `reviewedBy: "founder"`, `reviewedAt: "2026-09-18T00:00:00Z"`, and they left the pinned
  `AWAITING_FOUNDER_REVIEW` queue in `tests/unit/i18n-messages-schema.test.ts` (16 keys → 12).
  `unreviewedShare("en")` fell from **3.75 % to 2.74 %** against the 5 % `isLocaleIndexable` gate,
  so `/en` and `/en-gb` keep their margin. **The `de` and `pl` entries were deliberately not
  flipped**: both catalogues still echo the English string verbatim under `source: "machine"`, and
  what the founder attested is the English wording, not a German or Polish rendering of it —
  signing his name on a machine draft is the exact thing `/review 58` required change 2 forbids.
  Their shares are 100 % either way. The remaining escalation below (the six other reworded
  strings) is untouched and still open.

- **2026-09-18 — the honest fallback wording is the implementer's, not the founder's.** *(The
  `datesPending` half of this is resolved above; the six other reworded strings still wait.)* Spec 004
  §14 A19 offers "Delivery dates open when our first Polish florist is confirmed" *or the copy
  key's final wording*. The chrome is not destination-scoped — the header renders above every page
  in the site — so a sentence naming Poland would be wrong on the German guide. Shipped as
  **"Delivery dates open when we confirm our first florist"** (`nav.utility.datesPending`,
  `finder.datesPending`, pinned byte-equal) and **"Delivery dates are not open yet"**
  (`nav.utility.datesPendingShort`). Both are `source: "human", reviewed: false` with no
  `reviewedBy` and are in `AWAITING_FOUNDER_REVIEW`, together with the six other strings this
  sweep reworded. **To the founder; open.** Nothing blocks on the answer: a rewording is one
  catalogue edit and four `i18n:draft` echoes.
- **2026-09-18 — "Our selection" replaces "Best sellers".** Spec 008 §8 and AC-9 forbid describing
  the default order as a ranking we cannot evidence and license "a ranking we can describe
  truthfully"; the default order is a founder-set curation index, and this is the shortest true
  name for it. The category id moved with the label (`best-sellers` → `our-selection`) because it
  is spec 008's future URL and the row is `published: false` today, so the rename is free now and
  a redirect later. **To the founder; open.**
- **2026-09-18 — recorded, not fixed: `scrollable-region-focusable` on the header category row
  below 900 px** (serious; owner spec 004 / TASK-048). Rediscovered by `/review 73` on
  `/dev/components` at 390 px (TASK-108 escalation), and again by this sweep. Written into the
  header block comment of `tests/a11y/header.spec.ts` so the next axe run reads it instead of
  re-escalating it. The fix (a named, focusable scroller, or publishing the entries as links) is
  spec 008's and changes the tab order and the visual baselines; it is not a copy task's.
- **2026-09-18 (round 2) — the same macOS case-insensitivity now fails a second, TASK-092 test.**
  `tests/e2e/destinations-hub.spec.ts:113` expects `/en/Send-Flowers-To` to 404 and gets 200 on
  APFS, exactly as `corridor.spec.ts:52` does. It came in with the rebase, fails on `main` as much
  as here, and is Linux-green. Owner: spec 007 / TASK-092.

- **2026-09-18 — pre-existing, unrelated, local-only: `/en/send-flowers-to/Poland` answers 200 on
  macOS.** `tests/e2e/corridor.spec.ts:52` fails on a pristine server before any casing probe, on
  `main` as much as here: APFS is case-insensitive, so the prerendered `poland.html` is served for
  the mixed-case path. On Linux it 404s. Nothing in this branch touches routing. Owner: spec 007.

## Result

### Round 2 (2026-09-18) — `/review 77` round 1 fix round

**Required 1 — rebase and baselines.** Rebased onto `origin/main` (`e65baab`, 8 commits). Two
conflict sets: `docs/codebase-map.md` (generated — resolved to main's and regenerated with
`pnpm codebase:map`) and the eight `darwin` baselines both sides had drawn, resolved to **main's**
so nothing of TASK-092's was carried over blind. Then every baseline in the tree was reset to
`origin/main` and regenerated only where a run actually failed, one failing baseline at a time,
because `--update-snapshots` rewrites passing baselines byte-wise (the defect this review found).
**55** baselines ship, each pixel-compared against `origin/main` before it was staged — all 55
differ in pixels, none is a byte-only rewrite. The eight the review named —
`footer-{de,en}-mobile`, `home-{de,en,en-gb,pl}-mobile`, `home-{desktop,mobile}-destinations` —
are rendered on top of the hub, so the squash reverts none of TASK-092's drawings. The eleven
`listing-*` baselines moved too: the shorter utility strip puts the gallery's cards at a different
subpixel offset, a 1 px vertical shift, the same class as `4680ea0` on main. `test:visual` **43
passed**, run twice for stability.

**Required 2 — the hub in the served sweep.** `tests/e2e/chrome-honesty.spec.ts` `PAGES` gains the
all-destinations hub in all four locales with the localised segment from `locales.data.ts`:
`/en/send-flowers-to`, `/en-gb/send-flowers-to`, `/de/blumen-verschicken`, `/pl/wyslij-kwiaty`.
The file's header comment now says so. The spec runs **30 passed** (was 22).

**Required 3 — design source of truth.** One dated note, in the place `docs/design/` already keeps
them: a **2026-09-18 (TASK-120)** row in `README.md` → "Where the sheet and the code currently
differ". It names the four superseded strings ("Best sellers", "Same-day", "Delivery times and
cutoffs", "Order by 14:00 in Warsaw — the recipient's own time — and we deliver today"), their
owning clauses (spec 008 §8 / AC-9, spec 004 §14 A19), what the code renders instead, that the two
homepage artboards were redrawn and the forty page wireframes were not, and that each page task
redraws its own band. The Voice section's "Say the specific thing" bullet, which quotes the cutoff
sentence as a model, now points at that row. No artboard was redrawn: forty files belonging to
forty page tasks are not a copy task's to move.

**Founder attestation (2026-09-18, mid-round).** The four approved keys were flipped to
`reviewed: true` / `reviewedBy: "founder"` / `reviewedAt: "2026-09-18T00:00:00Z"` in
`messages/en.meta.json` and removed from the pinned queue in
`tests/unit/i18n-messages-schema.test.ts` (16 → 12). `de` and `pl` were left `machine` /
unreviewed on purpose (see escalations). `unreviewedShare`: **en 2.740 %**, en-gb 2.740 %,
de 100 %, pl 100 % — the `en` figure was 3.75 % before the flip, against the 5 % gate.

**Gates, round 2.** `typecheck`, `lint`, `i18n:check` clean. Unit **4 118 passed / 5 skipped**
(170 files) — including `tests/unit/catalog-geo-surface.test.ts`, which CI timed out at 5 000 ms
on the Linux runner and which passes locally. E2E **782 passed / 2 failed / 2 skipped** — both
failures are the macOS APFS case-insensitivity pair (see escalations), Linux-green. A11y **73
passed**. Visual **43 passed**.


**PR:** `fix(chrome): honest cutoff and ranking copy, gated on corridor facts (TASK-120)`.

One predicate, `deliveryDatesOpen(iso2)` / `anyDeliveryDatesOpen()` in `src/config/countries.ts`
(spec 004 §14 A19, widened by `/review 70` and TASK-108): a destination may assert a delivery date
only when it is `live` **and** carries an `operations` block, and none does in Phase 0. Spec 009
task 3 (TASK-123/124) re-sources the function body to `pickerState()` with no call-site change.

Twelve strings, three treatments. **Gated** (the promise is true later, so the copy is
conditional): `nav.utility.cutoff`/`cutoffShort` → `nav.utility.datesPending`/`datesPendingShort`;
`finder.cutoff` → `finder.datesPending`, still pinned byte-equal to the strip by
`tests/unit/ui-home.test.tsx`; `faq.whoDelivers.answer` drops its cutoff sentence into the gated
`faq.whoDelivers.answerCutoff`; the `same-day-delivery` category row and the `delivery-times`
footer row are absent (`requiresDeliveryDates` on both registries, filtered in
`headerCategoryItems()` and `footerView()`); `home.dates.orderBy` no longer prints
`occasions.ts`'s three hand-authored order-by instants. **Rewritten** (the claim cannot be made
honestly at all): `nav.category.bestSellers` → `nav.category.ourSelection` "Our selection",
`home.proof.photo.body`, `home.howItWorks.choose.body`, `finder.help`. **Data**: a `live`
destination with no agreed `country.sunday_delivery` emits no `sunday` surcharge row, so PL loses
84 of them (3 416 → 3 332 `country_price` rows); the six `demo` destinations keep theirs and
spec 005's surcharge contract is exercised against DE.

Four locales, `messages/*.meta.json` refreshed, `i18n:check` clean. Both homepage artboards
redrawn (the ranking label, the utility-strip sentence, the two rewritten home sentences, and a
dated comment in the place of each gated row).

**Tests.** Unit 4 086 passed / 5 skipped (30 new in `tests/unit/chrome-honesty.test.tsx`: the
catalogue scan in four locales, the six rendered chrome surfaces × four locales, and two
planted-violation cases). E2E 737 passed, 1 pre-existing macOS-only failure (see escalations),
2 skipped — 11 new in `tests/e2e/chrome-honesty.spec.ts`. A11y 62 passed, unchanged. Visual 41
passed; 56 `darwin` baselines regenerated, the 4 `linux` ones stale until a CI run exists.
`tests/support/listing-honesty.ts` gained `FORBIDDEN_RANKING_TEXT` and
`FORBIDDEN_DELIVERY_PROMISE_TEXT` (de/pl forms; "Order by" counts only with a time after it, so
`corridor.facts.orderBy.none` still passes) and one new named pattern for spec 008's callers.

**Handed on.** TASK-095's whole-document AC-19 scan can now pass. TASK-123/124 re-source
`deliveryDatesOpen()` to `pickerState()`. The founder owns the two copy escalations and the
`AWAITING_FOUNDER_REVIEW` queue, which grew from 8 keys to 16.
