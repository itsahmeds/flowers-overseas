# TASK-140 — Two live honesty/trust defects found by the competitor benchmark and verified on production. (a) The home row is headed **"Most sent this week"** on a site with **zero orders** — a sales-ranking claim that contradicts its own disclaimer and the listing page's "not a ranking by sales, by popularity or by payment"; spec 008 AC-9 already deleted this language from the nav, so the heading is inconsistent with a shipped rule. (b) `src/config/company.ts` ships `phoneE164: "+12135925150"` / `phoneDisplay: "+1 (213) 592-5150"` — a **US number** on a European relay service quoting **CET** hours, rendered in the utility strip, in `tel:` and in a `wa.me` link, and read by the `Organization` JSON-LD.

Row: `TASKS.md` → TASK-140. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-140`; keep it current by editing this file, not the row.

## Binding

Both defects are **live on production** and both were verified there, not inferred.

### (a) "Most sent this week" — a sales ranking on a site with no sales

`messages/en.json:457` heads the home trending row **"Most sent this week"**. There are zero
orders. The claim is false, and it contradicts three things this project already decided: the
row's own disclaimer beneath it, the listing page's sentence *"not a ranking by sales, by
popularity or by payment"*, and spec 008 AC-9, which already deleted this language from the
navigation. The heading is the last place it survived.

Replace it with a heading that says what the row actually is — our own selection — in all four
locales, and keep the disclaimer. **Do not** reach for "popular", "trending", "bestselling",
"customer favourites" or any synonym: they carry the same false claim in softer words, and the
honesty rule is about what the visitor concludes, not which word we used.

### (b) A US phone number on a European service

`src/config/company.ts:154-155` ships `phoneE164: "+12135925150"` and
`phoneDisplay: "+1 (213) 592-5150"`. Verified live on `/en`: it renders in the utility strip
beside **CET** opening hours, and appears as `tel:+12135925150` and
`https://wa.me/12135925150`. It is also read by the `Organization` JSON-LD, so it is what we tell
Google our contact number is.

A Los Angeles number on a cross-border European flower service, next to "Mon–Sat 8–20 CET", is a
trust defect on a product whose entire proposition is trust.

**This half is founder-gated and you must not resolve it yourself.** Do not invent a number, do
not substitute a placeholder that looks real, and do not silently delete the contact affordance —
a relay service with no way to reach a human is its own trust problem. If the founder's number
has not arrived when you pick this up, do part (a), record part (b) in `## Escalations`, and say
in `## Result` that it is outstanding. A fabricated contact number is worse than a missing one.

### Both

Whatever changes, the `Organization` JSON-LD, the visible strip, the `tel:` link and the WhatsApp
link must agree with each other afterwards — three of the four are generated from the same config
object and the fourth must not drift.

What the spec binds this task to, in the spec's own words: the resolution notes that override
defaults, the AC ids owned, the rulings from earlier reviews that apply here, the gates that must
be green. One paragraph or a short list — no restatement of the spec.

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-03 — (a) the trending row's wording. Answered — founder.** The orchestrator proposed, in chat: heading
  "Popular choices" (replacing `home.trending.heading` "Most sent this week") and the basis line "Our picks until
  real orders start." (replacing `home.trending.basis`, which claimed "our florists' own picks" with no florist
  yet). Founder, 2026-10-03, in chat: "ok go with popular choices". Both strings are founder-reviewed `en`;
  `en-gb` follows `en`; `de`/`pl` get `reviewed: false` drafts. No other wording changes.
- **2026-10-03 — (b) the US phone number. Answered — founder: keep `+1 (213) 592-5150` for now** (decisions log).
  (b) is closed with no code change.
- **2026-10-03 — `visual` red on head `d5f0dacd` for files this diff does not touch. Open — orchestrator.** `ci:full`
  run 37141374143: 21 of 22 jobs green; `visual` fails 9 cases: `footer-{en,de}-{desktop,mobile}`, the home crops
  `home-desktop-how-it-works` and `home-mobile-dates`, `listing-desktop-toolbar`, `listing-mobile-card-placeholder`,
  `product-mobile-gallery-placeholder` (about 1 % of pixels each). The diff images show certain text lines in the footer,
  dates band and listing rasterised a fraction of a pixel differently. They do not show content changes. PR 148's
  `visual` passed the same baselines at 16:35 (run 37137399567) on code identical to `origin/main` outside docs, with
  the same runner image (ubuntu-24.04 20260927.320.1) and the same Chromium (v1243). The 14 baselines this task took
  from run 37140653882 pass on the failing runner. So the Linux render is not byte-stable from one runner to the next,
  and the work order fences me to the baselines my text causes. The question: take the remaining 22 files from run
  37140653882 here (they are runner bytes, and `--verify` would pass), refresh them in a separate PR, or look into the
  runner first? **Answered — orchestrator, 2026-10-04:** the re-run on `b330a868` (run 37144277592) failed the same
  pictures, so refresh the failing ones here after merging `origin/main`. Done: run 37147054906 on `25c3a747`
  reproduced the first run byte for byte, and only the 9 failing pictures were taken (`6a52ceaf`).

## Progress

- 2026-10-03 — copy, review records and the unit/e2e pins committed (`ab7bd362`), draft PR #167 open, `pnpm gates:cheap` PASS. Next: Linux visual baselines via the `visual:baselines` label, then ready + `ci:full`.
- 2026-10-03 — 14 Linux baselines from run 37140653882 committed (`bb18fe12`), each opened and looked at; the run's other 22 changed files were sub-pixel noise from outside this diff and are not taken. Next: ready + `ci:full`.
- 2026-10-03 — PR ready, `ci:full` run 37141374143 on `d5f0dacd`: everything green except `visual` (9 cases, none touched by this diff); escalated, row `blocked`. Next: the orchestrator's answer in `## Escalations`.
- 2026-10-04 — `origin/main` merged (`25c3a747`, TASK-100 + design docs); fresh baselines run 37147054906; the 9 failing pictures taken and opened (`6a52ceaf`), `--verify` 104 matched; row back to `in_review`. Next: `ci:full` on the new head.

## Result

(a) shipped in PR #167; (b) closed with no code change (founder keeps the US number).

- **Copy.** `en` `home.trending.heading` "Most sent this week" -> **"Popular choices"**; `home.trending.basis` -> **"Our picks until real orders start."** (the "our florists' own picks" claim is gone). Both founder-reviewed; `en.meta.json` records the founder's 2026-10-03 decision as the reviewer (transcribed, not reviewed, by TASK-140; `docs/decisions-log.md` row 2026-10-03 "The trending row reads Popular choices"). The orchestrator confirmed `reviewed: true` is right here (2026-10-04). `en-gb` has no override for these keys, so it inherits `en` exactly. `home.trending.eyebrow` ("Trending now") is unchanged, as ordered.
- **For the founder to review (`de`/`pl`, `source: human`, `reviewed: false`):**
  - de heading "Beliebte Auswahl"; de basis "Von uns ausgewählt, bis die ersten echten Bestellungen eingehen."
  - pl heading "Popularne wybory"; pl basis "Nasz wybór, dopóki nie pojawią się prawdziwe zamówienia."
- **Tests.** Unit (`tests/unit/ui-home-gated.test.tsx`): one exact heading and one exact basis value per locale (en, en-gb, de, pl), read from the rendered `<h2>` and basis `<p>`; the ranked-row case asserts no basis line. Mutations: en heading "Popular choice", basis without its full stop, pl heading back to "Most sent this week" -> each red. E2e (`tests/e2e/home.spec.ts`): the row's `h2` text and basis line per locale path. `pnpm gates:cheap` PASS (3233 unit tests).
- **Visual.** 14 Linux baselines from `visual-baselines` run 37140653882, each looked at: `home-{en,en-gb,de,pl}-{desktop,mobile}`, `home-{desktop,mobile}-trending`, `en`, `de` (consent), `pseudo-rtl/ar-XB`, `dev-components-desktop`. Every one shows the new heading and basis line and the row 16 px (desktop) / 32 px (mobile) shorter. The run changed 22 more files (footer, listing, product, other home crops) that this diff does not touch. No local build or browser run. Of those 22, the 9 that CI's `visual` job fails (`footer-{en,de}-{desktop,mobile}`, `home-desktop-how-it-works`, `home-mobile-dates`, `listing-desktop-toolbar`, `listing-mobile-card-placeholder`, `product-mobile-gallery-placeholder`) were taken from run 37147054906 after the merge with `origin/main`, on the orchestrator's instruction. I opened each one alongside its diff: same words, same layout, text drawn a sub-pixel differently. Each is byte-identical to the actual image the failing CI job recorded. The other 13 pass at the 0.1 % threshold and keep their committed bytes. The manifest moves only the 23 entries this task took.
- **Not changed (outside the fence):** code comments in `src/modules/ui/home/*`, `src/config/trending.ts`, `src/modules/ui/media/slots.ts`, `scripts/check-layout.ts`, and the dev gallery's caption still name the old heading or "the florists' picks"; TASK-177 rebuilds the home.
