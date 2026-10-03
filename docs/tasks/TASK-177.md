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
3. **The 5 % copy gate decides how the sentence looks.** The artboard's prose sentence and its "who it's for" select are new English (about 20 strings), and `en` was at 4.26 %. The letter ships as labelled selects in reviewed words ("Where we can send flowers", "Country", "Occasion", "Continue", "Prices include delivery and VAT"). There is no "who" select, so there is no `fo-who` island and no `cookies.ts` row. The prose and the select come back when the founder approves the batch below.
4. **FAQ.** Spec 004 A9 keeps it on the home; the v2 artboards don't draw it. It stays, in v2 type, between the promise band and the destinations. **For the designer:** add it to the artboards, or record the difference in `docs/design/README.md`.
5. **No prices on Popular choices.** The artboard draws prices with equivalents, but spec 004 §3/§8 render no price on the home, and A21 says behaviour stays the owning spec's. **For the designer:** record this in the README.

## Progress

- 2026-10-04: v2 home, `SentencePicker` + `sentence-model.ts`, `GET /api/send/{locale}` and the finder retired (eeff9154). Fresh-on-arrival wording and v2 e2e/a11y/visual specs (2f6fdce7). Draft PR 174 against main, stacked on PR 168.
- 2026-10-04: honesty fixes. The proposition is in the future tense, the destinations line is stated as our rule, and a test pins the `#send` id the header links to.
- Next: re-take the home visual baselines through the `visual:baselines` label flow (every `home-*` shot changes: hero, sentence, proof, dates, occasions, how-it-works, faq, trending, destinations; `home-*-finder` and `home-*-trust` are retired), then run `ci:full`. After PR 168 merges: `git rebase --onto origin/main 2a1d1489`. For PR 167, resolve its message and test hunks to identical text.

## Result

**Partial.** The code and the unit/route tests are done. Visual baselines and a browser CI run are still to do.

Copy for the founder's batch (en; de/pl are machine echoes, `reviewed: false`):
- **Ships now, unreviewed:**
  - `home.proof.guarantee.title`: "Fresh-on-arrival guarantee" (founder ruling 2026-10-04, replacing "7-day freshness guarantee").
  - `home.sentence.notYet`: "{country} (not yet)".
  - `home.hero.proposition`: "A local florist in your recipient's town will make it and hand it over in person. We never ship a box." (coordinator honesty fix, 2026-10-04: we have no florists yet, so the future tense).
  - `home.destinations.body`: "We open each country only once we have local florists there we can stand behind." (replaces "We open a country only when we have met enough florists there to stand behind every order — across Europe, and only where we really are.", which Poland, open as a demo, does not meet).
- **Drawn but not shipped (waiting for approval):** the sentence "I'd like to send flowers to {who} in {country} for {occasion}."; its heading "Start with who it's for"; the "who" options (my mum, my dad, my grandma, my grandad, my sister, my brother, a friend, someone I love); the occasion wordings (a birthday, a name day, an anniversary, a loss, no reason at all, a new baby); "Show me the flowers"; "Every price includes VAT and delivery."; the postmark ring "FROM WHERE YOU ARE · TO WHERE THEY ARE ·"; how-it-works "A florist a few streets away will make it." / "A picture will arrive when the flowers do…"; the margin note "Nothing crosses a border, so no customs and no box."; the dates lede "Poland keeps its own days…"; the name-day stamp ("Every day of the year", "Name days", "Every day is somebody's…"); the stamp links ("What we make for it", "Christmas flowers", …); the promise heading "Four things you will never have to ask for"; the destinations heading "Poland first. Six more countries as we choose florists." (today the home shows the reviewed "Where we can send flowers"); the eyebrow "For Poland" (today: "Poland"); the "See every bouquet for Poland" link (today: "Our selection"); "Made in their own town" / "By independent shops we are choosing ourselves, one by one."; "A photo from the door" / "We will email you the picture…".
- **Keys removed** (no longer rendered): `home.hero.photoCaption*`, `home.trending.eyebrow`, `home.howItWorks.guarantee*`, `home.destinations.heading`, `home.destinations.elsewhere.*`, `faq.lasting.*` (the seven-day answer), and every `finder.*` key except `country.label` and `submit`. `en`: 523 keys, 24 unreviewed (4.59 %).

**Found, not fixed (outside this task):** `trust.guarantee.name` and `nav.utility.guarantee` still read "7-day freshness guarantee" (TrustStrip on shop pages; the header belongs to TASK-176). The URL-key registry (`src/config/url-keys.ts`) is listing-shaped, so the new `/api/send` query keys (`country`, `occasion`, neither PII) are not registered in it. Registering them would also route them as listing parameters.
