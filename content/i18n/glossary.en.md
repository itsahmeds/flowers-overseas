# Glossary and style guide — `en` (and the rules every locale inherits)

Authority for every string on the site: `messages/en.json` is written to this file, and a native
reviewer of any locale reads this one plus their own (`glossary.<locale>.md`). Referenced by
`plan/03` §6.6, spec 003 §13 Q2 / Q11 and `docs/runbooks/i18n-translations.md`.

`en` is the source of truth, so a decision recorded here propagates by drafting rather than by
being re-decided per string.

## 1. Brand terms — never translated, never inflected, never abbreviated

| Term                    | Rule                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flowers Overseas**    | Always both words, always this capitalisation, in every locale and every case position. Never "FlowersOverseas", never "FO", never a translation ("Blumen Overseas", "Kwiaty Overseas" are wrong). In Polish and German it does not take a case ending. |
| **flowersoverseas.com** | Lower-case, no `www`, no trailing slash in prose.                                                                                                                                                                                                       |
| Product and tier names  | Not invented yet. When spec 005 names a bouquet tier, it lands in this table before it lands in a catalogue.                                                                                                                                            |

Everything else is translated, including words that look like brand words in English
("relay", "corridor", "local florist").

## 2. What we are, in words — the terms that carry the promise

The business is a **relay**: the buyer orders here, a vetted local florist in the destination
country makes and delivers. Getting this vocabulary wrong is a consumer-law problem, not a style
problem — a page that reads as if we ship flowers internationally misdescribes the service.

| Say                                                             | Not                                       | Why                                                                                            |
| --------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| a **local florist** makes and delivers                          | "we deliver", "our couriers", "our shop"  | We ship nothing; we never operate a vehicle or a shop.                                         |
| **delivered by a local florist** in the recipient's city        | "shipped", "posted", "sent by courier"    | Nothing crosses a border. Flowers never travel internationally.                                |
| **hand-made and hand-delivered**                                | "dispatched", "fulfilled"                 | The value is a person in the destination city.                                                 |
| the **recipient**                                               | "customer", "receiver", "addressee"       | The buyer and the recipient are two different people with different rights and different data. |
| the **buyer** / **you**                                         | "user", "client"                          | Second person for the buyer; "user" belongs in code.                                           |
| a **partner florist** / **florist partner**                     | "supplier", "vendor", "reseller", "agent" | They are independent businesses we vet, not our staff and not our suppliers.                   |
| **fresh, seasonal substitution** where a stem is unavailable    | "we may change your order"                | Substitution is a promise with rules, not an apology.                                          |
| **price shown is the price charged**, VAT and delivery included | "from €X", "+ delivery"                   | EU price-display law and `CLAUDE.md`'s rule. Never a price that grows at checkout.             |

## 3. Tone

Warm, plain, specific, adult. We are trusted with something emotional and often urgent (a funeral,
a birthday missed by a border) and the copy earns that by being concrete.

- **Short sentences.** One idea each. Prefer a full stop to a semicolon.
- **Say the thing.** "Your florist in Kraków will call the recipient before delivery" beats
  "recipient contact may be attempted".
- **No hype and no exclamation marks.** No "amazing", "stunning", "perfect gift", "just a click
  away". A superlative we cannot evidence is a liability, not a sales line.
- **No fear or pressure.** No countdown language, no "only 2 left", no guilt ("don't forget
  Mother's Day again").
- **Never joke about the occasion.** Sympathy and funeral copy is quiet, factual and never
  euphemistic beyond what a bereaved reader expects in their own language.
- **Own a problem in the first sentence.** "The florist could not deliver today. Here is what
  happens next."
- **Address one person.** "you", not "our customers".
- **Sentence case** for headings and buttons, not Title Case, not ALL CAPS (an accessibility
  problem as well as a tone one).

## 4. Taboo — words and claims that never appear

| Never                                                                          | Why                                                                                                                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| "guaranteed", "guarantee" for delivery timing                                  | We promise a date, and a florist is a third party. A guarantee is a legal commitment we have not made.                                           |
| "same-day" without the cut-off in the same sentence                            | It is true only before the local cut-off.                                                                                                        |
| "cheap", "discount", "bargain", "sale" (unless a real, dated promotion exists) | Brand position and price-display law.                                                                                                            |
| "worldwide", "global", "any country"                                           | Europe, a fixed corridor list, and every claim must match `src/config/locales.ts` and the published countries.                                   |
| "free delivery"                                                                | Delivery is included in the shown price. "Included" is the honest word.                                                                          |
| "our florists", "our team of florists"                                         | They are partners. See §2.                                                                                                                       |
| "fresh from our farms", "our warehouse", "our fleet"                           | We have none of these.                                                                                                                           |
| "flowers", "roses" as a stand-in for a specific product                        | Say what the bouquet is.                                                                                                                         |
| Country flags to mean a language                                               | A flag is a country, not a language, and it insults half of every diaspora (`plan/03` §2). Language names, in the language: "Deutsch", "Polski". |
| "elderly", "handicapped", "the disabled"                                       | Plain, current, person-first language.                                                                                                           |
| Religious framing not asked for                                                | Sympathy copy stays secular unless the occasion is explicitly religious.                                                                         |
| Emoji in UI copy or email subjects                                             | Not in this brand; a screen reader reads them aloud.                                                                                             |

## 5. House style for English

- **`-ize`, not `-ise`, in `en`.** American-leaning spellings are the `en` default because `en` is
  the international English locale: `organize`, `personalize`, `apologize`, `recognize`. `en-gb`
  overrides exactly those keys with `-ise` (`organise`, `personalise`, `apologise`) — that is what
  the thin `en-gb` catalogue is _for_. See `glossary.en-gb.md` for the full British delta.
- **Oxford comma: yes**, in `en`; the list joiner in UI lists is `Intl.ListFormat`'s output, never
  a hand-typed comma.
- **Numbers, money, dates and lists are never typed into a string.** `{amount}`, `{date}`,
  `{count}` placeholders only; `src/modules/i18n/format.ts` renders them. A hand-built `£{x}` or
  `{x}%` is a lint error (`fo/no-adhoc-intl`).
- **No literal in a component.** Every string comes from `messages/*.json`
  (`fo/no-literal-strings`).
- **Placeholders are code.** `{recipientName}` keeps its exact name in every locale. Reorder the
  sentence around it as the language requires; never rename it, never translate the word inside
  the braces, never drop one (`i18n:check` fails an argument-set mismatch).
- **Plurals through ICU categories**, never `key_one` / `key_other` invented by hand, and never a
  parenthesised "(s)".
- **Accessible names (`a11y.*`) are copy too.** They are read aloud and never seen; they must be
  meaningful out of context ("Choose your language", not "Click here") and must not restate a
  visible label in a different language.

## 6. Notes for a reviewer, and one that has caught people out

- **`common.floristCount` counts different things per language.** In `en` and `de` it renders
  **people** ("120 florists", "120 Floristen"); in `pl` it renders **shops**
  ("120 kwiaciarni" — a _kwiaciarnia_ is a flower shop, the trade person is a _kwiaciarz_/
  _kwiaciarka_). That is deliberate: the Polish phrasing a buyer expects counts shops. A `pl`
  reviewer should not "fix" it to people, and a `de`/`en` reviewer should not switch to shops
  (`plan/13` B12 note, from `/review 20`).
- **The occasion vocabulary is not symmetric across cultures.** All Saints' Day
  (`Wszystkich Świętych`, 1 November) is the largest flower day in Poland and barely exists in the
  UK; Mother's Day falls on different dates. Never translate an occasion name literally without
  checking that the occasion exists in the target market — flag it instead.
- **Do not translate a URL segment.** Path segments are authored in
  `src/config/locales.ts` (`pathSegments`) and reviewed once, not per string.
- **Untranslated ≠ broken.** `de` and `pl` currently ship English echoes marked
  `reviewed: false`, which is why they are non-indexable and tagged `beta`. Reviewing them is what
  flips the switch, with no code change.

## 7. Per-locale files

| File                | Locale                                        | State                                                                 |
| ------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| `glossary.en.md`    | `en` — international English, source of truth | this file                                                             |
| `glossary.en-gb.md` | `en-gb` — British English, thin override      | the `-ise` / vocabulary / GBP delta                                   |
| `glossary.de.md`    | `de` — German                                 | stub, awaiting the first native review pass                           |
| `glossary.pl.md`    | `pl` — Polish                                 | stub; register already decided (informal `Ty` in UI, formal in legal) |
