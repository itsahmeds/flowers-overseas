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

## Escalations

1. **Which destinations the sentence opens (A21 clause 4).** The clause says that an unpublished destination is a disabled "not yet" option and that flipping `corridorPagePublished` enables it. TASK-092 already set `corridorPagePublished: true` on all seven countries, and all seven have a shop root, while the artboards (and "Poland first") draw six as "not yet". Implemented default: open = `corridorPagePublished` **and** `status: "live"` **and** the shop root exists (`isSentenceDestination()`, one predicate in `src/modules/ui/home/sentence-model.ts`). The route uses the same rule, so `?country=DE` → destinations hub. **Question for the orchestrator/founder:** keep this, or open all seven, sending Germany and the rest to their demo shops?
2. **"The occasion page" for evergreen occasions.** Spec 008's `countryOccasion` exists only for seasonal occasions (Poland: Mother's Day). Birthday, anniversary, sympathy, new baby and just because are country *categories* with the same key. The route tries `countryOccasion`, then `countryCategory` with the same key, then the shop root. That is what makes T-12's "PL + birthday → the PL occasion page" true (`/pl/polska/kwiaty/kwiaty-na-urodziny`).
3. ~~The 5 % copy gate decides how the sentence looks.~~ **Resolved 2026-10-04.** The founder chose the sentence ("go ahead with it. 2") and approved the copy batch ("ok from my end"), so the letter now ships as the sentence with its "who it's for" select. See `## Result

**Partial.** The code and the unit/route tests are done. Visual baselines and a browser CI run wait for PR 168.

**The sentence (founder, 2026-10-04, option 2).** "Send flowers to [who] in [country] for [occasion].", headed "Start with who it's for". It is one ICU message with three tags (`home.sentence.frame`), so each locale orders the selects itself. "Who" (`home.sentence.who`, an ICU select over mum, dad, grandma, grandad, friend, someone I love; "my partner" waits for escalation 6) has **no `name`** and takes its accessible name from the heading. Each occasion label is an ICU select on the person's pronoun (`home.sentence.occasion`: "her birthday", "his birthday", "their birthday"; "a loss", "no reason at all" and "a new baby" stay neutral).
- **JavaScript off:** the server renders the default person's form (my mum → "her birthday"), so the sentence reads right with no script.
- **The island:** `SentenceIsland.tsx`, the home's only island. It reads the `data-label-her|his|their` and `data-pronoun` attributes the server wrote and relabels the occasions when "who" changes. It renders nothing and imports only `react`: no copy, no storage, no network. I have not measured it in Brotli yet; CI's `budget:client-js` will report it. No `fo-who` storage and no `cookies.ts` row: A21 says "may", so it is left out.

**Copy approved by the founder and marked `reviewed: true` in `en.meta.json`** (cited "founder, 2026-10-04, in chat: 'ok from my end' (copy batch for TASK-176–179)"):
- item 2: `home.proof.guarantee.title` "Fresh-flower promise"
- item 3: `home.proof.guarantee.body` "If your flowers don't arrive fresh and in good condition, send us a photo within 72 hours of delivery and we'll replace them or refund you in full."
- item 6: `home.hero.proposition`
- item 7: `home.destinations.body`
- item 8: `home.sentence.notYet` (plus `finder.submit` "Continue", already reviewed)
- item 13: `home.sentence.frame`, `home.sentence.heading`, `home.sentence.who` (six of the seven options; see escalation 6)
- Item 14: none of its strings appear on the home. "all in" sits beside card prices, and the home shows none.

**Still unreviewed, for the founder:** `home.sentence.occasion`, i.e. the possessive labels "her/his/their birthday", "her/his/their name day", "her/his/their anniversary", "a loss", "no reason at all", "a new baby". Only "her birthday" is in the approved sentence. `en` is at 523 keys, 21 unreviewed (4.02 %).

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
