# TASK-177 — Visual identity v2 home

Row: `TASKS.md` → TASK-177. This brief is the task's long form (spec 001 §14 A15, AC-34).

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
- Visual identity v2 home: the sentence picker as a server-rendered GET form (replaces the finder card), hero, Popular choices, Poland's dates as stamps, how-it-works band, all four locales
- Depends on: TASK-175.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A20, A21; `docs/design/README.md`; `docs/codebase-map.md`.

## Carry-forwards

- **From `/review 162` (2026-10-03, TASK-173), carried by the orchestrator:** the home's occasion tiles are still not
  links; the v2 home links each to its occasion page or does not draw it (spec 004 §14 A20).
- **From `/review 148` round 2 (2026-10-03, TASK-168), carried by the orchestrator:** home LCP on `main` is `/en` 1 766 ms,
  `/en-gb` 1 767, `/de` 1 776, `/pl` 1 791 (CI run 37137399567; budget 2 000), so the tightest margin is 209 ms; measure
  anything new above the fold.

- **From PR 172's breaker round 2 (TASK-176), accepted by the reviewer in comment 5977141046, carried by the orchestrator 2026-10-04. Done here:**
  - **a. Pin the exact de/pl price claims.** `tests/unit/ui-site-header.test.tsx` requires `nav.utility.pricesInclude` to be exactly de "Preise inkl. MwSt. und Versand" and pl "Ceny zawierają dostawę i VAT". `tests/e2e/header.spec.ts`'s de and pl shop-root checks compare the claim's own words, after its " · " separator, with the same sentences.
    - Each of the four breaker sentences went red: "Preise inkl. MwSt., Versand wird extra berechnet", "Preise inkl. MwSt. und Versand nicht enthalten", "Ceny zawierają VAT, dostawa płatna osobno", "Ceny zawierają dostawę i VAT, koszt dostawy doliczamy".
    - In the unit test they were set in the catalogue, red at "the price claim says …".
    - In the e2e they were written into the rendered claim against `next start`, red on the exact-words check. The token check alone passed them.
  - **b. Widen the no-N-day check.** A number, at most one hyphen or space, then a stem: day, tag/täg, dni/dzie. It sweeps the rendered header **and footer** text in all four locales. A matcher case lists the forms that must match and allows exactly "24/7".
    - Both breaker strings went red when set in `messages/de.json`: "Unsere 7-tägige Frische-Garantie:" as `nav.notice.lead`, and "Mit Liebe und 7 Tage Frische." as `footer.signoff`.
  - **c. Footer shot.** `tests/visual/footer.spec.ts` photographs the footer on the home, so it now takes the dates band out with `home-dates.css`.

## Escalations

1. **Which destinations the sentence opens (A21 clause 4).** The clause says that an unpublished destination is a disabled "not yet" option and that flipping `corridorPagePublished` enables it. TASK-092 already set `corridorPagePublished: true` on all seven countries, and all seven have a shop root, while the artboards (and "Poland first") draw six as "not yet". Implemented default: open = `corridorPagePublished` **and** `status: "live"` **and** the shop root exists (`isSentenceDestination()`, one predicate in `src/modules/ui/home/sentence-model.ts`). The route uses the same rule, so `?country=DE` → destinations hub. **Question for the orchestrator/founder:** keep this, or open all seven, sending Germany and the rest to their demo shops?
   **Ruling (orchestrator, PR 174 review round 1, R3): the honest default.** A country opens in the sentence only when it is published, `live` and has a shop root; every other country is a disabled "{country} (not yet)" option that does not submit. That is what ships: `isSentenceDestination()`, with the route on the same predicate. The de and pl "not yet" labels are pinned by test (H1).
2. **"The occasion page" for evergreen occasions.** Spec 008's `countryOccasion` exists only for seasonal occasions (Poland: Mother's Day). Birthday, anniversary, sympathy, new baby and just because are country *categories* with the same key. The route tries `countryOccasion`, then `countryCategory` with the same key, then the shop root. That is what makes T-12's "PL + birthday → the PL occasion page" true (`/pl/polska/kwiaty/kwiaty-na-urodziny`).
3. ~~The 5 % copy gate decides how the sentence looks.~~ **Resolved 2026-10-04.** The founder chose the sentence ("go ahead with it. 2") and approved the copy batch ("ok from my end"), so the letter now ships as the sentence with its "who it's for" select. See `## Result

4. **FAQ.** Spec 004 A9 keeps it on the home; the v2 artboards don't draw it. It stays, in v2 type, between the promise band and the destinations, now with three questions (the seven-day and the VAT answers are gone, both by founder ruling 2026-10-04). **For the designer:** add it to the artboards, or record the difference in `docs/design/README.md`.
5. **No prices on Popular choices.** The artboard draws prices with equivalents, but spec 004 §3/§8 render no price on the home, and A21 says behaviour stays the owning spec's. **For the designer:** record this in the README.
6. **"my partner": answered 2026-10-04.** At first "my partner" was held back, because spec 004 §14 A5 bans "partner" (`src/config/voice.ts`). The founder then said "Allow \"my partner\"", and spec 004 §14 **A22** merged as PR 175 (0043ba5a). "my partner" ships. `voice.ts` gains `VOICE_EXCEPTIONS`, pinned to the key `home.sentence.who` and the exact phrase; its ICU select keyword counts as syntax under that key only. "our partner", "partner florist", "my partner florist", "my partners" and `partner {our partner}` still fail, and so does the same phrase under any other key. Three deliberate mutations went red: no exception, no florist guard, and the key scope dropped. The founder also said "Yes, count it": the ICU-coded `home.sentence.frame` and `home.sentence.who` count as his approval of the batch wording. `home.sentence.who` changed, so it is `reviewed: false` with its new hash and waits for his attestation tool. `home.sentence.frame` is untouched.

7. **The sentence's font swap shifts the home (CLS > 0), and the spec leaves no fix open (blocking).** CI run 37173654376 on b2acfd5d failed three CLS gates on the home. All three measure the whole page:
   - `tests/e2e/header.spec.ts` AC-7, `toBe(0)`, desktop: /en 0.00013, /de 0.00006, /pl 0.0030;
   - `tests/e2e/banner.spec.ts` AC-28, `toBe(0)`: /en 0.00013;
   - `tests/e2e/consent-banner.spec.ts` AC-17, `<= 0.001`: /pl 0.0030.

   Lighthouse CLS on the homes is /en 0.0004, /de 0.007 and /pl 0.00001, under its 0.05 budget; main reads 0.

   **Cause, measured locally with layout-shift attribution** (`next start`, build slot, 2026-10-04): about 95 ms after load, the Fraunces faces swap in (`font-display: swap`, not preloaded):
   - the 300 italic of the sentence's selects;
   - the roman of its frame text;
   - on `/pl`, the roman Latin-Ext for the "ł" in "wysyłka".

   Each `field-sizing: content` select changes width, so the words after it ("in", "for", ".") and its chevron move. Example, `/de` at 1280: the who select goes from 157.5 to 144.1 px. The selects are the only inline Fraunces on the page. The H1 is a block, so it does not shift.

   **Why the spec leaves no fix open:**
   - A21 clause 3 requires `font-display: swap`.
   - It forbids preloading the italic.
   - It allows the Fraunces roman preload only where the LCP element is display text. The home's LCP is the hero `<img>` (measured).
   - The matched fallback that TASK-175 added covers the roman only. Even a matched italic fallback only matches the average width, so the select widths, and with them CLS, would still move a little.

   **Options for the founder or spec-writer:**
   - (a) Amend A21 clause 3 so the home preloads Fraunces roman Latin and italic Latin. That is 13,352 + 16,848 B, plus Alegreya's 19,320 B, for 49,520 B against the 51,200 B preload budget. `/pl` still swaps the Latin-Ext roman.
   - (b) Add matched fallback metrics for the italic, which clause 3 already asks for "on every face". This reduces the shift but does not zero it.
   - (c) Scope the three CLS-0 assertions to shifts their own subject causes (`LayoutShift.sources`), and let Lighthouse's CLS < 0.05 govern the page.
   - (d) Set the selects in the preloaded Alegreya. This departs from the artboard.

   I have not chosen. Every other check on that run is green, including `visual` and `lighthouse`.

   **Orchestrator ruling, 2026-10-04 (technical; no spec text change): do (b) + (c).** The measured CLS is at most 0.0030, against Google's "good" threshold of 0.1 and our Lighthouse budget of 0.05. No preload change (clause 3 stands), no change to the artboard's fonts, no global relaxation.

   **Implemented:**
   - **(b) Matched italic fallbacks.** `src/app/globals.css` gains two faces:
     - the italic face of "Fraunces Fallback Liberation", over Liberation Serif Italic and Tinos Italic, for Linux and ChromeOS;
     - the italic face of next/font's own "displayFont Fallback", over Times New Roman Italic, for macOS and Windows. There the stack reaches next/font's roman TNR face first.
     - Both use `size-adjust` 85.31 %, `ascent-override` 114.64 %, `descent-override` 29.89 %. These are Next's formula over the committed italic file against Times New Roman Italic's a–z average (846.558 / 2048), in place of the roman's 95.19 %, which made italic text about 12 % too wide.
     - `tests/unit/fonts-italic-fallback.test.ts` recomputes the values, pins the family names and the `src` lists, and goes red on a changed override.
     - TASK-176's recompute test is not on main yet, so this is the equivalent in its own file.
     - The Latin-Ext roman needs no face: its characters fall through to the already-matched roman Liberation face.
   - **(c) Each assertion reads its own subject** (`tests/support/layout-shift.ts` records each entry with its `sources`).
     - Banner AC-28 and consent AC-17 sum the entries not wholly inside `[data-fo-sentence]`.
     - Header AC-7 uses the same exclusion, **not** "sources inside the header": when the header changes height, Chrome names `<main>` as the only source, so a header-only scope stayed green on the header-height mutation (measured: 0.0070, sources `[MAIN]`).
   - **New e2e** in `tests/e2e/home.spec.ts`: "the home sentence's font swap stays small", on every home at 1280 and 390. The bound is **0.001, not 0.005**: at 0.005 the "lose the fallback metrics" mutation stays green (see below).

   **Measured, `next start` on macOS:**

   | Fallbacks | Sentence-sourced shift per home |
   |---|---|
   | Before (main's: italic on the roman TNR face) | /en 0.00011 / 0.00097 · /en-gb 0.00011 / 0.00083 · /de 0.000097 / 0.00037 · /pl **0.0030** / 0.00040 |
   | After (matched italic) | 0 everywhere, except /de 1280 0.000037 and /pl 1280 0.000061 |

   Each pair is 1280 / 390. The before column matches CI's Linux before-values (0.00013, 0.00006, 0.0030). Linux after-values are printed by the new test in CI's e2e log (`sentence-shift …` lines).

   **CI on e424481f (run 37178656213): green.** The sentence-sourced shift on Linux is at most 0.00038: /en and /en-gb at 390 on the mobile project. All the others are 0.00018 or less (/pl 390 0.00018, /pl 1280 0.00010, /de 1280 0.000059, /de 390 0.000034), or 0. Lighthouse CLS on the homes went from /de 0.007 to /de 0.0002, with /en, /en-gb and /pl at 0. LCP was /en 1866, /en-gb 1834, /de 1941, /pl 1833. `visual` was green, so no baseline moved.

   **Mutations, each run against a fresh `next start` and reverted:**
   - **Header AC-7:** the utility strip grows by 12 px after load. Red at `header.spec.ts:174` (`headerShift`), 0.0070, desktop ×4.
   - **Banner AC-28:** the banner is moved into the flow at the top. Red at `banner.spec.ts:215` (`bannerShift … toBe(0)`), 0.157.
   - **Consent AC-17:** the sheet is moved into the flow at the top, with the heading-box check bypassed so the CLS line is what fails. Red at `consent-banner.spec.ts:200` (`sheetShift <= 0.001`), 0.157, desktop ×4.
   - **Sentence, select widened by 40 px after load:** red on 7 of 8 desktop homes (0.0014–0.0158).
   - **Sentence, selects set in an unmatched stack (Georgia):** red on 3 of 8 (up to 0.0033).
   - **Sentence, main's fallbacks (before the fix):** red on /pl 1280 (0.0030).
   - **Unit test:** an italic override edited, red in `fonts-italic-fallback.test.ts`.

## Progress

- 2026-10-04: v2 home, `SentencePicker` + `sentence-model.ts`, `GET /api/send/{locale}` and the finder retired (eeff9154). Fresh-on-arrival wording and v2 e2e/a11y/visual specs (2f6fdce7). Draft PR 174 against main, stacked on PR 168.
- 2026-10-04: honesty fixes. The proposition is in the future tense, the destinations line is stated as our rule, and a test pins the `#send` id the header links to.
- 2026-10-04: the founder's sentence with possessive occasion labels and `SentenceIsland`; the approved copy batch transcribed; every VAT/delivery inclusion sentence off the home.
- 2026-10-04: the proposition restored byte for byte to its reviewed present-tense text (founder: "dont say will just keep makes"). The local pseudo catalogues I generated are deleted; they are gitignored and broke `fonts`/`product-page` locally.
- 2026-10-04: "my partner" ships under spec 004 §14 A22 (voice exception scoped to `home.sentence.who`, mutation-tested). `home.sentence.who` is unreviewed pending the founder's attestation. This brief's escalations 4–5 and `## Progress` had been dropped by a bad edit in commit 1f8d0d6a; they are restored here.
- 2026-10-04: rebased onto main (`git rebase --onto origin/main 2a1d1489`) after PR 168 squash-merged as df5cab72. Conflicts in `messages/{en,de,pl}.json`, their `.meta.json` and `tests/unit/ui-home-gated.test.tsx` were all one thing: main still carried `home.trending.eyebrow` ("Trending now") and its test, which this branch retires; resolved to the branch's side. PR 167's "Popular choices" text is the same on both sides.
- 2026-10-04: date-driven layout. Every home shot below the occasion-dates band (`proof`, `occasions`, `how-it-works`, `faq`, `destinations`) and every home full-page shot (`en.png`, `de.png`, `home-{locale}-{mobile,desktop}.png`, `ar-XB.png`) now takes the band out of the layout with `tests/visual/home-dates.css`. The band reads no clock (it prints `src/config/occasions.ts` as data, which rolls forward by an edit), so today nothing moves by date alone; the sheet makes a calendar edit unable to move other sections' pixels. The band's own shot is taken as rendered. `footer.spec.ts` belongs to TASK-176 and is unchanged.
- 2026-10-04: baselines. Run 37171984787 showed two defects, both fixed in 97c1f91a with a test: the promise band drew four desktop columns for three facts, so a blank ink-muted cell showed at its inline end (`ProofRow` now `md:grid-cols-3`; a unit case ties the column count to `PROOF_FACTS`, red before the fix), and the `/dev/components` hero had no shop countries, so its country select drew blank. Run 37172887887 re-took them; its whole change list (51 changed, 2 added) plus its manifest is b9722592's content, and the retired `home-*-{finder,trust}` PNGs are deleted on both platforms.
- 2026-10-04: ci:full on b2acfd5d (run 37173654376). `visual` and `lighthouse` are green. e2e and a11y were red on stale counts (three promise facts, three FAQ answers) and on the crawl's depth-1 Poland check, all fixed in 35f9d5c2. They were also red on the CLS-0 gates, which is escalation 7.
- 2026-10-04: PR 174 round 1 (review FAIL plus breaker HOLES on f8546476).
  - Before anything else, the founder's attestation of `home.sentence.who` (09:54:22Z) was committed alone, byte for byte, and the key left `AWAITING_FOUNDER_REVIEW`. The `en` value is unchanged, so the attestation holds.
  - Then origin/main (b1ea7f03, TASK-178) was merged. Conflicting baselines were taken from this branch and then re-taken.
  - **R1, the "my partner" exception.** `VOICE_EXCEPTIONS` is now `{ locales: ["en", "en-gb"], messageKey: "home.sentence.who", token: "partner {my partner}" }`. The token must start the value or follow whitespace or a brace, and it ends at the case's closing brace. The scan passes each catalogue's locale. The T-17 case that allowed the phrase as prose is gone.
  - **R1, de and pl.** They no longer contain the letters "partner". Their partner option is the select's `other` case, and "someone I love" has its own `someoneILove` case:
    - de: `{who, select, mum {meine Mama} dad {meinen Papa} grandma {meine Oma} grandad {meinen Opa} friend {jemanden aus dem Freundeskreis} someoneILove {einen lieben Menschen} other {meinen Schatz}}`
    - pl: `{who, select, mum {mojej mamy} dad {mojego taty} grandma {mojej babci} grandad {mojego dziadka} friend {przyjaciela lub przyjaciółki} someoneILove {ukochanej osoby} other {mojej drugiej połówki}}`
    - Both are `reviewed: false` drafts.
  - **R2, the Poland chip.** Every destination chip links its guide. Only where a locale has no guide (/de, /pl) does Poland's chip link the shop root. The crawl test is main's again (one click for every guide), and `docs/design/README.md` has a differ row for the artboard's chip.
  - **R3:** recorded under escalation 1.
  - **H1:** the de and pl "(not yet)" labels are pinned.
  - **H3:** a per-locale price-talk denylist over the rendered home, plus a check that none of the price-claim messages (`nav.utility.pricesInclude`, `catalog.price.inclusive`, `catalog.price.allIn`) render on the home.
  - **H4:** `tests/support/day-count.ts`. A number (digits or spelled one to ten in three languages), at most two words, then a word with a day stem, or any week word; "24/7" passes. It is used by the chrome sweep (header and footer), the promise band in all four locales and the FAQ in all four locales. It does not require a freshness word nearby, so "7 full days" and "a week" go red on their own, as the ruling's list requires.
  - **Mutations, each run and reverted. Every one went red in the test named:**
    - R1, in `design-docs.test.ts` ("messages/{locale}.json uses no banned word" plus the A22 cases):
      - en who `partner {my partner's florist}`;
      - en who `partner {my partner, our florist}`;
      - en who `friend {my partner}`;
      - "Send flowers to my partner" as `home.sentence.heading`;
      - de who `+ partner {my partner}`;
      - pl who `+ partner {my partner  florist}`;
      - the old phrase-wide scanner restored, which also turned the T-17 case red.
    - R2: the chip back to shop-root-first. Red in `ui-home-gated.test.tsx` ("… to its guide, even when the page hands in a shop root").
    - H1: de and pl `notYet` = `{country}`. Red in `ui-home.test.tsx` (the H1 cases).
    - H3: "delivery and tax included" (en), "Lieferung und Steuern inklusive" (de) and "Cena obejmuje dostawę i podatek" (pl), each appended to `home.destinations.body`. Red in `ui-home.test.tsx` (the H3 denylist).
    - H4, on the home:
      - "seven full days" (en, no digit), "7 Kalendertage" (de), "Sieben Tage" (de) and "Tydzień świeżości" (pl) in `home.proof.local.body`. Red in `ui-home.test.tsx`.
      - "a week" in `faq.photo.answer`. Red in `ui-home-sections.test.tsx`.
    - H4, in the chrome: "seven full days" (en sign-off), "7 Kalendertage" (de sign-off), "Sieben Tage" (de notice lead), "Tydzień świeżości" (pl notice lead) and "a week" (en notice lead). Red in `ui-site-header.test.tsx`.
- 2026-10-04: PR 174 breaker round 2 (HOLES at bd715854; the round-2 review passed, and round-1 holes 1–4 were accepted). Five holes closed. Each breaker mutation was applied, run and reverted, and every one went red:
  1. **Who labels.** The full value → label map for all four catalogues, as one case per `SENTENCE_WHO` id plus "every id once, with distinct words" (now `SENTENCE_WHO.length`, not a hard-coded 7). In de/pl `other` carries the partner option, so it is pinned too.
     - pl mum ↔ dad swapped: red at "renders mum/dad with its own pinned words".
     - de grandad case removed, so it falls through to `other`: red at "renders grandad …" and "offers every id once".
  2. **Price talk.** New de stems: Abgabe, inbegriffen, enthalten, Endpreis, Gesamtpreis, Zustellung, Porto, Gebühr. New pl stems: w cenie, opłat, koszt.
     - "Endpreis: Zustellung und Abgaben inbegriffen." (de) and "Kurier i wszystkie opłaty w cenie." (pl), each in `home.destinations.body`: red at the H3 denylist.
  3. **Day counts.** The matcher (`tests/support/day-count.ts`) now catches fused counts (siebentägig, Siedmiodniowa, 14-dniowa), numbers to fourteen, fortnight and dób, with `week(?!end)` and `woche(?!nende)`.
     - In the promise band, "siebentägigen", "Siedmiodniowa", "a fortnight", "Vierzehn Tage", "fourteen days" and "7 dób": red at the promise-band and whole-home day-count cases.
     - "We answer 24/7 days and nights." exercises the slash guard. Dropping that guard, or the weekend or Wochenende guard: red at the matcher case in `ui-site-header.test.tsx`.
  4. **Whole-home sweep.** `dayCountIn` now runs over the whole home render in four locales, less the dates band, whose stamps print real dates.
     - A day count in de `home.destinations.body`, in the pl hero proposition, or in the de sentence heading: red at "promises no day count anywhere on the home".
  5. **A22 guards.** Cases for the token's lookbehind (`xpartner {my partner}`, `mypartner {…}`) and its case sensitivity (`Partner {My Partner}`, `PARTNER {MY PARTNER}`).
     - Dropping the lookbehind, or adding the `i` flag, in `src/config/voice.ts`: red at "matches the token only as a whole case".
- 2026-10-04: CI on f68fc774 (run 37195581138). Everything was green except one e2e case, `banner.spec.ts:662` ("the suggestion sits in the named z-scale"), on e2e-mobile. It is a race: the test read the consent sheet's layer as soon as the language banner showed, before the consent island had mounted, so the value was "". It had also failed once and passed on retry in run 37182787523. The case now waits for the consent sheet as well. Local `next start`: the four affected specs 292 passed; the case repeated 10 times on both projects, 20 passed.
- 2026-10-04: round 1 baselines, visual-baselines run 37194900542: the whole change list (15 PNGs, the listing and product shots on `/dev/components` plus the gallery itself) plus the manifest. `--verify` and `--check` exit 0. They had conflicted in the TASK-178 merge and had been taken from this branch. Their geometry now matches main's (the toolbar is 256 px, the mobile grid 727 px); against main they differ only by the sub-pixel offset of the gallery's home section. I looked at all 15, the 43,000 px gallery only as an overview.
- 2026-10-04: CI on 2a39015a (run 37182787523): green.
  - e2e: 1309 passed. One test was flaky and unrelated: `banner.spec.ts:662`, the overlay z-scale, which passed on retry.
  - Sentence-sourced shift on Linux: at most 0.00044 (/en and /en-gb at 390); the rest are at most 0.00022.
  - Lighthouse medians: /en 1916, /en-gb 2040, /de 1871, /pl 1762. The budget assertion, which uses the optimistic aggregation, passed.
  - /en-gb has read 1989, 1781, 1834 and 2040 on this branch's four runs, against 1832 and 1902 on main and PR 168. That is spread rather than a step, but it is the URL to watch.
- 2026-10-04: baselines after the TASK-176 merge, visual-baselines run 37182288206 (2bbc9390): the whole change list of 53 PNGs plus the manifest. `--verify` and `--check` exit 0. I looked at all 53.
  - The footer and the home shots change because TASK-176's chrome now sits on the v2 home.
  - The header utility strips (0.4 %), consent, suggestion banner and the `/dev/components` listing and product shots move by sub-pixel offsets; they look the same side by side.
- 2026-10-04: merged origin/main after PR 172 (TASK-176, ae661e5a).
  - Main's chrome code and tests win where the two overlap.
  - `fonts.test.ts` keys the roman fallback faces only; the italic faces have their own recompute test.
  - TASK-176's notice-bar CLS checks use the scoped header measurement.
  - Carry-forwards a–c are done. Locally, 520 e2e passed on `next start`, all four homes at 1280 and 390.
  - Every mutation was re-run on the merged build: header 0.0075 red, banner 0.081 red, consent 0.172 red.
- 2026-10-04: escalation 7 ruled (b) + (c). Matched italic fallbacks, the three CLS assertions scoped to their subjects, and the sentence-shift test with a 0.001 bound. All four specs and `fonts.spec.ts` are green on a local `next start` (318 passed), and every mutation is recorded in the escalation.
- 2026-10-04: rebased again onto main after PR 175 (spec 004 A22) merged. A22 clause 2 asks that `docs/design/README.md` §Voice record the exception, pinned by the test: a new case in `tests/unit/design-docs.test.ts` reads every `VOICE_EXCEPTIONS` entry from that section (red before the bullet was added).

## Result

**PR 174 round 1 fixes are in; see `## Progress`.** Everything else is done. The branch is rebased on main after PR 168 and PR 175, the Linux baselines come from run 37172887887, and `ci:full` is green except the three CLS-0 e2e assertions. The FAQ and promise-band counts, and the crawl, were fixed in 35f9d5c2.

**Lighthouse, CI run 37173654376 (b2acfd5d) against main 977990a4.** LCP: /en 1917 ms (main 1878), /en-gb 1989 (1832), /de 1896 (1891), /pl 1835 (1962). The LCP element is the preloaded hero `<img>`. The URLs that this PR does not change moved by the same amounts (/en/send-flowers-to 1253 against 1289, the Poland guide 1532 against 1534). Script is 127,940 B against main's 128,358 (the finder island is gone, the sentence island added). The /en-gb figure of 1989 ms is over 1950, but /pl moved 127 ms the other way, so it is run-to-run spread, not a cost the sentence adds.

**Baselines (run 37172887887).** 53 PNGs moved: the 18 `home-{desktop,mobile}-*` element shots (`sentence` new), the 8 `home-{locale}-{mobile,desktop}` artboard shots, `en.png`, `de.png`, `ar-XB.png`, and `dev-components-desktop.png`, all because the home is new. The rest move by a sub-pixel offset with no visible change, and each was compared with its old picture: `footer-{en,de}-desktop`, `footer-en-mobile` (the footer sits under a shorter home), `consent-*-desktop` and `suggestion-banner-*` (a few edge pixels where the new hero shows through the overlay's rounded corners), and `listing-*` and `product-*-gallery-placeholder` (photographed on `/dev/components`, where the home section above them changed). I looked at all 53 committed images. The 23 that the second run changed against the first are the promise band and what sits under it at desktop width, and I looked at those again.

**Date-driven layout.** Every home shot below the occasion-dates band, and every home full-page shot, takes the band out of the layout (`tests/visual/home-dates.css`). The band's own shot is taken as rendered. The band reads no clock: it prints `src/config/occasions.ts`, so All Saints' Day stays on it after 1 November until that file is rolled forward. The sheet makes such an edit unable to move other sections' pixels.

**The sentence (founder, 2026-10-04, option 2).** "Send flowers to [who] in [country] for [occasion].", headed "Start with who it's for". It is one ICU message with three tags (`home.sentence.frame`), so each locale orders the selects itself. "Who" (`home.sentence.who`, an ICU select over mum, dad, grandma, grandad, partner, friend, someone I love, in the batch's order; "my partner" per A22, escalation 6) has **no `name`** and takes its accessible name from the heading. Each occasion label is an ICU select on the person's pronoun (`home.sentence.occasion`: "her birthday", "his birthday", "their birthday"; "a loss", "no reason at all" and "a new baby" stay neutral).
- **JavaScript off:** the server renders the default person's form (my mum → "her birthday"), so the sentence reads right with no script.
- **The island:** `SentenceIsland.tsx`, the home's only island. It reads the `data-label-her|his|their` and `data-pronoun` attributes the server wrote and relabels the occasions when "who" changes. It renders nothing and imports only `react`: no copy, no storage, no network. I have not measured it in Brotli yet; CI's `budget:client-js` will report it. No `fo-who` storage and no `cookies.ts` row: A21 says "may", so it is left out.

**Copy approved by the founder and marked `reviewed: true` in `en.meta.json`** (cited "founder, 2026-10-04, in chat: 'ok from my end' (copy batch for TASK-176–179)"):
- item 2: `home.proof.guarantee.title` "Fresh-flower promise"
- item 3: `home.proof.guarantee.body` "If your flowers don't arrive fresh and in good condition, send us a photo within 72 hours of delivery and we'll replace them or refund you in full."
- item 6: **not applied.** The founder's later ruling (2026-10-04: "dont say will just keep makes bro.. put the old wording that doesnt use future tenses") overrides it. `home.hero.proposition` is restored byte for byte to the reviewed "Our florist in your recipient's town makes it and hands it over in person. We never ship a box.", and its en/de/pl meta records are identical to the base, so the 2026-09-09 attestation still matches.
- item 7: `home.destinations.body`
- item 8: `home.sentence.notYet` (plus `finder.submit` "Continue", already reviewed)
- item 13: `home.sentence.frame` and `home.sentence.heading`. `home.sentence.who` now carries all seven options and is `reviewed: false` until the founder attests the new value.
- Item 14: none of its strings appear on the home. "all in" sits beside card prices, and the home shows none.

**Still unreviewed, for the founder:** `home.sentence.who` (re-hashed when "my partner" was added; he attests it with the tool), and `home.sentence.occasion`, i.e. the possessive labels "her/his/their birthday", "her/his/their name day", "her/his/their anniversary", "a loss", "no reason at all", "a new baby". Only "her birthday" is in the approved sentence. `en` is at 523 keys, 22 unreviewed (4.21 %).

**de/pl** are written as natural sentences and stay `reviewed: false`:
- de: "Einen Strauß an [meine Mama] in [Polen] [zum Geburtstag] schicken.", heading "Für wen ist der Strauß?". "Blumen" trips AC-15's partner-name pattern, so the German says "Strauß".
- pl: "Kwiaty dla [mojej mamy] [na jej urodziny], wysyłka do kraju: [Polska].", heading "Zacznij od tego, dla kogo są kwiaty".

**No VAT/delivery sentence on the home** (founder, 2026-10-04: "dont write this on home"):
- removed: the picker's price line, the promise band's price fact (now three facts), and the FAQ's "Is the price really final?";
- keys deleted: `home.proof.price.*`, `faq.price.*`, `home.sentence.whoLabel`;
- tests: a unit test renders every home section in four locales, and an e2e test reads `main` in four locales.

**Other changes this round:**
- `src/modules/i18n/pseudo.ts` now copies rich-text tags byte for byte. The frame's `<who></who>` had its tag names accented in `en-XA`/`ar-XB`, which broke ICU parsing (`UNMATCHED_CLOSING_TAG`). A test is added in `i18n-pseudo.test.ts`.
- `tests/fixtures/seo/sitemap/*.xml` were regenerated (`UPDATE_SEO_FIXTURES=1`). Only `<lastmod>` moved, 2026-10-03 → 2026-10-04, because it is the newest `reviewedAt` in the catalogue, and the founder's approvals are dated 2026-10-04.

**Still not shipped (not on the approved list):** the postmark ring lettering, the margin note, the dates lede, the name-day stamp and the stamp link labels, the promise heading "Four things you will never have to ask for", "Poland first. Six more countries as we choose florists.", the "For Poland" eyebrow, "See every bouquet for Poland", "Show me the flowers", the reworded promise facts ("Made in their own town", "A photo from the door"), and the future-tense how-it-works steps 2 and 3.

**Keys removed** (no longer rendered): `home.hero.photoCaption*`, `home.trending.eyebrow`, `home.howItWorks.guarantee*`, `home.destinations.heading`, `home.destinations.elsewhere.*`, `home.proof.price.*`, `faq.lasting.*`, `faq.price.*`, and every `finder.*` key except `country.label` and `submit`.

**Found, not fixed (outside this task):** `trust.guarantee.name` and `nav.utility.guarantee` still read "7-day freshness guarantee" (TrustStrip on shop pages; the header belongs to TASK-176). The header's utility strip ("Prices include delivery and VAT", `nav.utility.pricesInclude`) still renders on the home, and the founder's ruling may want TASK-176 to hide it there. The URL-key registry (`src/config/url-keys.ts`) is listing-shaped, so the new `/api/send` query keys (`country`, `occasion`, neither PII) are not registered in it. Registering them would also route them as listing parameters.

**Found while inspecting the baselines (carry-forwards, not fixed here):**
- The sticky header covers the top of every home element shot that Playwright scrolls under it. On mobile, `home-mobile-how-it-works` loses its eyebrow and the first line of its heading under the header, and `home-desktop-hero` loses the eyebrow under the category row. The old baselines did the same. A `stylePath` sheet that makes the header static in element shots would fix it, but the header is TASK-176's.
- `HOME_STATES.proof` in `src/app/(dev)/dev/components/catalog.ts` still describes "the four claims … 4-up". It is dev-only text, and fixing it would move the gallery baseline again.
- On `/de` and `/pl` the home's headings ("Flowers for someone far away.", "Our promise", "What is the occasion?", "Questions people ask first") are English in the `de`/`pl` catalogues. That is the same as on main and waits for the locales' copy batch.
