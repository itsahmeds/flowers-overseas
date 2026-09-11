# TASK-084 — Brand-voice copy pass on shipped message keys (spec §14 A5): rewrite `nav.*`, `footer.*`, `company.*`, `destinations.*`, `consent.*` and the header/footer trust sentences in the first person ("we", "our florist in …", "our team"), remove "relay"/"corridor"/"partner"/"third party" from customer copy, cap geographic claims at live coverage ("across Europe"), prefer specific over superlative; `de`/`pl` re-drafted deterministically; a `no-literal-strings`-style lint or unit scan that fails on the banned words in `messages/*.json` and `src/`

Row: `TASKS.md` → TASK-084. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-084-brand-voice-copy`. Founder, 2026-09-09. Copy only — no component, layout or behaviour change; `en.meta.json` attestations reset to `reviewed: false` for rewritten keys until the founder skims them; the honesty guardrails in A5 are binding (no "anywhere in the world", no "own shops"). Runs after the header and footer merge so it edits keys that exist. **Started 2026-09-09 by the orchestrator on main:** `company.description` rewritten to the round-2 colophon sentence ("We send flowers across Europe. You order from us; our florist in the recipient's town makes the bouquet and hands it over in person.") because TASK-059 round 2 changed the artboard the `company-config` test pins; `de`/`pl` re-drafted; footer test pin updated. The rest of the pass remains.

## Read

- `specs/004-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

- **From `/review 40`:** two phrasings of the 14:00 Warsaw cutoff one screen apart (utility strip vs `finder.cutoff`); `finder.help`, `finder.destinations.heading/onboarding` are implementer copy marked `reviewedBy: founder` — put them in front of the founder.
- **From `/review 53`:** 11 implementer-attested strings from TASK-053 incl. `trust.guarantee.name`, `home.howItWorks.*`, `faq.*`, `occasions.*` subtitles need the founder's copy pass and `reviewedBy: founder`.

## Escalations

**E1 — Resetting the carry-forward attestations would take English out of the index. Founder/orchestrator call needed.**
Deliverable 2 asks for two things that cannot both hold. `unreviewedShare()` counts every `reviewed: false` key of `messages/en.meta.json` over 322 keys, and `isLocaleIndexable()`/`localeBetaTag()` flip at 5 % (`src/modules/i18n/review.ts`, `UNREVIEWED_SHARE_THRESHOLD`). Resetting the seven keys this pass reworded costs 2.2 % — inside the gate, no answer changes. Adding the 15 carry-forward keys (`/review 40`: `finder.help`, `finder.destinations.heading`, `finder.destinations.onboarding`; `/review 53`: the 12 `frontend-implementer`-attested TASK-053 keys) takes it to 22/322 = 6.8 %, which makes `en` **and** `en-gb` `noindex`, and prints the "Beta" tag beside English in `LocaleSwitcher` on every page — a rendered change, in a task whose binding clause is "copy only — no component, layout or behaviour change".
Chosen, pending a ruling: reset only the reworded seven; leave the 15 attested as they are and put them in front of the founder as the PR's **Founder copy review queue** (name, current text, why it is queued), which is what both reviews actually asked for. The reset is one `node` edit the moment the founder skims them or the threshold question is answered.

**E2 — One cutoff sentence, three artboard wordings (resolved, recorded).**
`/review 40` asks for one cutoff sentence. The artboards carry three: the utility strip's "Order by 14:00 Warsaw time for same-day delivery" (on ~40 `.dc.html` files), the finder's "Order by 14:00 in Warsaw — the recipient's own time, not yours — and it arrives today", and the FAQ answer's "Order by 14:00 in Warsaw, the recipient's own time, for delivery today."
Measured before choosing: the `e2e-desktop` project runs at 1280 px, where the utility strip prints the long claim, and the strip wraps to 65 px the moment that claim passes ~69 characters — `tests/e2e/header.spec.ts` pins it at 45 px and `plan/01`'s CLS reservation depends on it. The finder's wording (86 chars) and the FAQ's (71) both break it, with two characters of slack at best. So the shared sentence is the short, specific one — **"Order by 14:00 in Warsaw for delivery today"** (42 chars, ~25 characters of slack, no full stop so it reads as one of the strip's four claims) — used verbatim by `nav.utility.cutoff` and `finder.cutoff` and pinned equal by `tests/unit/ui-home.test.tsx`. Nothing is lost: that the clock is the recipient's and not the buyer's is stated in full, in the founder's own artboard words, by `home.howItWorks.choose.body` ("The cutoff is shown in the recipient's time, not yours") and `faq.whoDelivers.answer`, both further down the same page, where a sentence has room to explain itself. `faq.whoDelivers.answer` is now the FAQ artboard's text verbatim, which it was not before.
**The artboards' utility strip now trails the catalogue**: the `.dc.html` files still print "Order by 14:00 Warsaw time for same-day delivery" and were not edited — artboards are the founder's, and this task is a copy pass on message keys. A design round should catch them up.

## Result

Seven `en` keys reworded, all seven reset to `reviewed: false` with `reviewedBy` removed; `de`/`pl` re-drafted by `pnpm i18n:draft` (echo provider, so both stay `machine`/unreviewed at 100 %, `pl` register unaffected); `en`/`en-gb` unreviewed share 0 % → 2.2 %, `isLocaleIndexable()` and `localeBetaTag()` answers unchanged for all four locales. `nav.*`, `footer.link/group/reminders/cookieSettings`, `company.*`, `destinations.*`, `consent.*` and `trust.*` were audited word by word and were already first person and free of every A5 banned word — `company.description` was rewritten on main before this branch — so the pass changed only what was actually wrong: the two SERP descriptions ("a vetted local florist makes and delivers them", the sentence `docs/design/README.md` §Voice cites as the counter-example), the passive `footer.payment.methods`, and the three cutoff phrasings collapsed to one.

The mechanical half is in `tests/unit/design-docs.test.ts` §5b: the nine banned words (`network` added, so the list finally matches the README's "nine") scanned over every `messages/*.json` **value** and every prose string literal under `src/`, with key names and identifiers exempt by the no-whitespace rule, `src/modules/admin/` exempt by path per A5, and two controls — one proving the word list bites on a plausible sentence, one proving the extractor flags JSX text while sparing `noPartner`, `third-party-script` and a Tailwind class list.

