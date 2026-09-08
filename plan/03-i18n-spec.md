# 03 — Internationalisation Specification

Europe is multilingual from day one. This document separates the three concepts that sites conflate (UI language, destination country, display currency), defines how each is set and overridden, fixes the launch locale set with the method behind it, and gives a solo founder a translation workflow that does not index machine-translated stubs. Related: `02-seo-spec.md` §3 and §8, ADR-0003, ADR-0006.

---

## 1. Three independent dimensions

| Dimension | What it controls | Where it lives | How it is set | How the user overrides | Bots |
|---|---|---|---|---|---|
| **UI locale** (`en`, `en-gb`, `de`, `pl`) | Language of every string, slugs, number/date formats, default currency, legal regime, occasion hub copy | **URL prefix** (authoritative). Mirrored in `fo_locale` cookie only to power the suggestion banner. | By the URL the visitor lands on. First visit: banner may *suggest* another locale from `Accept-Language` + coarse IP country. | Header switcher (links to the same entity in the other locale). Choice persists in `fo_locale` for 365 days and silences the banner. | See the URL, get the URL. No variation, no redirect. |
| **Destination country** (where flowers go) | Catalogue, prices (supply currency), cutoffs, holidays, occasion calendar, address form, partner network, VAT wording | **URL path** on indexable shop pages (`/en-gb/poland/...`); **order draft** (server session) inside the funnel | Homepage country picker (one action), corridor page, or the country segment in the URL | Change country on any shop page (goes to the same category/product in the new country if it exists, else the country shop root) | Path is explicit; no guessing. |
| **Display currency** (what the buyer sees) | Presentation of prices on shop pages; **the charged currency** at checkout | `fo_currency` cookie; defaults from locale (`en`→EUR, `en-gb`→GBP, `de`→EUR, `pl`→PLN) | Locale default | Currency menu in header and on PDP price block; limited to the supported settlement currencies (EUR, GBP, PLN, CZK, RON, SEK, NOK, DKK, CHF, TRY, USD) | HTML always renders the locale default; the override is a client-side repaint from an embedded price table, so cached HTML is identical for everyone. |

Worked example (the brief's): a German buyer in Berlin sending to Warsaw opens `/de/blumen-verschicken/polen` → German UI, Polish delivery rules and occasion calendar, prices from `country_price[PL]` shown in EUR (locale default) converted at today's ECB rate and rounded to €x.90, charged in EUR. If they flip the currency menu to PLN they see and are charged the PLN list price.

Invariants:
1. Destination never changes UI locale. Picking Poland on `/de/` keeps German.
2. UI locale never changes destination. Switching `/de/` → `/pl/` on a product page keeps Poland.
3. The amount displayed on the PDP in the chosen currency is the amount charged, to the cent (see 06 for FX policy).
4. Nothing above is ever inferred from IP for a bot, and nothing redirects (ADR-0006).

**Recommendation:** URL for locale and destination, cookie for currency, server-side order draft for funnel state.
**Rationale:** anything that affects indexable HTML must be in the URL; anything that is a presentation preference must not fragment the cache.

## 2. Locale detection and the suggestion banner

```
request → (bot UA? → render URL as-is, no banner)
        → fo_locale cookie present? → render URL as-is; banner off
        → else compute hint = best match of Accept-Language (weighted) then IP country (edge header) against supported locales
        → hint == URL locale? → no banner
        → else render URL as-is + small dismissible banner: "Looks like you're in Germany. Switch to Deutsch / EUR?" [Switch] [Stay]
          Switch → sets fo_locale + fo_currency, navigates to the equivalent URL. Stay → sets fo_locale = current, banner never returns.
```

- Banner is a client island rendered after hydration, so it never affects LCP or the cached HTML. Reserve zero layout space (it slides over, not in) to avoid CLS.
- Never auto-redirect, even for return visitors. The cookie changes which link the logo points to and which locale the site-wide switcher pre-selects, nothing more. (A "soft redirect on return visit" was considered and rejected: it fails the Geo-blocking Regulation's consent bar when the persisted choice was made on another device, and it invites a Googlebot-with-cookie edge case for zero gain.)
- Locale chooser at `/` is a plain list of locales with native names and flags **of language, not country** (Deutsch, not 🇩🇪; flags for languages are wrong for AT/CH and a well-known i18n smell).

## 3. Launch locale selection: the method and the result

Method: score each candidate locale on (a) estimated monthly search demand for corridor + occasion + generic delivery queries in that language across the EU/UK, (b) corridor volume proxy = diaspora population able to buy in that language × propensity to gift, (c) payment-method readiness under Stripe/Mollie, (d) translation and QA cost for ~1,400 UI strings + 60 pages of copy + legal, (e) whether a live corridor exists in Phase 1. Demand numbers are estimate-grade until Ahrefs is authorised; the ranking is robust to ±50% error on any single cell.

| Locale | Demand (est.) | Corridor proxy | Payment readiness | Translation cost | Live corridor Phase 1 | Verdict |
|---|---|---|---|---|---|---|
| en / en-gb | very high (UK + IE + Nordics + NL English use + x-default) | UK→PL, UK→RO, UK→everywhere | cards, wallets, PayPal, Klarna | authored, zero | **yes** | Phase 0 |
| pl | high (diaspora in UK/DE/NL/NO + domestic) | UK/DE→PL | BLIK/P24 via Stripe or Mollie | native speaker needed | **yes** | Phase 0 |
| de | very high (DE+AT+CH) | DE→PL, DE→TR, DE→everywhere; largest gifting market | Klarna, PayPal, Sofort→Klarna, giropay retired | high-quality German required | demo only | Phase 0 (pitch to German florists, second corridor) |
| fr | high | FR→everywhere, BE, CH | cards, PayPal, Apple Pay | medium | no | Phase 4 |
| es | high | ES→LatAm later; domestic | Bizum via Mollie | medium | no | Phase 4 |
| it | medium-high | domestic; IT diaspora in DE/CH | PayPal, cards | medium | no | Phase 4 |
| nl | medium | NL/BE; iDEAL | iDEAL/Bancontact via Mollie | medium | no | Phase 4 |
| ro | medium | UK/DE/IT/ES→RO diaspora (large) | cards | medium | no | Phase 4, ahead of nl/it |
| tr | medium | DE/NL→TR diaspora (largest in DE) | cards, TRY volatility | medium | no | Phase 4 |
| sv | low-medium | domestic; Swish | Swish, Klarna | medium | no | Phase 4 last; Nordics served in English first |
| uk (Ukrainian) | growing (diaspora everywhere) | PL/DE→UA when destinations open | cards | medium | no | Phase 5; Cyrillic subset planned |
| ar, ur | low in Europe now | UK/Nordics South Asian + MENA diaspora | cards | RTL QA | no | Phase 5+; architecture-ready now |

**Recommendation:** en, en-gb, de, pl at Phase 0. Phase 4 order: ro, fr, tr, es, nl, it, sv.
**Rationale:** the two live-or-pitch corridors plus the x-default cover >60% of estimated reachable demand at roughly a third of the QA cost of eight locales.

## 4. RTL readiness without RTL launch

- All layout CSS uses logical properties (`margin-inline-start`, `padding-inline`, `inset-inline-end`, `text-align: start`). Tailwind config enables logical utilities; a lint rule bans `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left/right` in app code.
- `<html lang dir>` set from locale config; `dir="rtl"` flips icons that carry direction (arrows, chevrons) via a `[dir=rtl]` transform utility; icons that must not flip (logos, clocks) are tagged.
- Fonts: one variable Latin font with Latin-Ext subset (pl/ro/tr diacritics) at launch; Arabic and Urdu (Nastaliq is heavy; a Naskh face is acceptable for UI) declared in the font stack config but not loaded until the locale exists.
- Numbers in ar/ur: Western digits by default (e-commerce norm), `numberingSystem` configurable per locale.
- Bidi safety: user-generated text (card messages, names) wrapped in `<bdi>`; currency and dates rendered by `Intl`, never string-concatenated.
- Playwright visual tests include an `ar` pseudo-locale (mirrored, longer strings) from Phase 1 so regressions are caught before any RTL launch.

## 5. Where copy lives

| Kind | Storage | Localised how | Indexed? |
|---|---|---|---|
| UI strings (buttons, labels, errors, emails) | `messages/{locale}.json` in repo, ICU MessageFormat, namespaced (`checkout.address.postcode`), typed keys via `next-intl` | Translation files with a sidecar `messages/{locale}.meta.json` per key: `source: human|machine`, `reviewed_by`, `reviewed_at`, `source_hash` | n/a |
| Product names, descriptions, slugs | `product_translation` table | Authored per locale; slug generated from name with transliteration then human-checked | yes when country live |
| Category, occasion names + slugs + intro copy | `*_translation` tables | Same | yes |
| Corridor guides, country FAQ, local flowers/taboos | `country_locale_content` table (markdown + structured FAQ) | Human-written per locale; version + reviewed flag | yes (gated) |
| Blog / guides | MDX in repo under `content/{locale}/` with frontmatter (`author`, `reviewed`, `translation_of`) | Written per locale, not translated 1:1 | yes if `reviewed` |
| Legal (terms, privacy, withdrawal notice, Impressum) | MDX per locale, versioned, with `effective_from` | Lawyer-reviewed or reviewed against a lawyer-approved source; never machine-only | yes |
| Emails / WhatsApp templates | React Email components using the same message catalog | Same as UI strings | n/a |
| Localised path segments | `config/locales.ts` (`sendFlowersTo: {en:'send-flowers-to', de:'blumen-verschicken', pl:'wyslij-kwiaty'}`) | Hand-authored once per locale | yes |
| Country/city names | `country_translation`, `city_translation` (endonym + exonym per locale: Warschau/Warsaw/Warszawa) | Seeded from CLDR/GeoNames, human-checked for slugs | yes |

Rule: **no literal user-facing string in a component.** ESLint (`no-literal-strings` for JSX text and `aria-*`/`alt`/`title` attributes) fails the build. The `reviewer` agent checks it too.

## 6. Translation workflow for a solo founder

```
1. Author in English (source of truth). Every new key/entity starts as en.
2. Machine draft: a script (`pnpm i18n:draft --locale pl`) sends untranslated keys + glossary + context comments to an LLM,
   writes them with meta.source = "machine", reviewed = false. Same for product descriptions and category intros (DB rows get translation_status = 'machine').
3. Review queue: `/admin/translations` lists machine or stale entries (source_hash changed) per locale, side-by-side, with glossary highlights.
   Reviewer = founder for en/en-gb; a paid native reviewer for de and pl (freelance marketplace, hourly, ~2–4 h per release; budgeted in 06).
   Approving sets source = human-reviewed, records reviewer and date.
4. Gates:
   - UI strings: machine-drafted strings may ship (they are not indexable) but the locale switcher shows a subtle "beta" tag on a locale while >5% of its strings are unreviewed.
   - Indexable content (products, categories, corridors, occasions, blog, legal): page is `noindex` and excluded from sitemaps while any of its required fields is machine-unreviewed. Corridor guides and legal never ship machine-only, even noindexed.
5. Drift control: changing an English source string bumps source_hash; dependent locales flip to stale and back into the queue. Stale indexable content stays indexable (last approved version is served) but is flagged in /admin.
6. Glossary + style guide per locale in `content/i18n/glossary.{locale}.md`: brand terms never translated (Flowers Overseas), tone (pl: formal "Państwo" in legal, informal "Ty" in UI? — decided per locale by the native reviewer and recorded), formality, taboo words.
7. Pseudo-locale `en-XA` (accented, +40% length, bracketed) in dev to catch truncation and concatenation.
```

Volumes: ~1,400 UI strings, ~90 catalogue entities × 3 fields, ~8 corridor guides, ~6 legal documents, ~15 emails per locale at launch. Machine draft + 6–10 reviewer hours per locale per release is realistic; a full translation team is not needed until Phase 4.

**Recommendation:** LLM draft, human review, hard `noindex` gate on unreviewed indexable content, one admin queue.
**Rationale:** it lets one founder run four locales honestly and makes "reviewed" a data fact the auditor can check instead of a promise.

## 7. Locale-correct formatting (all via `Intl` / `next-intl`, never hand-built)

| Concern | en-gb | de | pl | Notes |
|---|---|---|---|---|
| Date (short) | 14/02/2027 | 14.02.2027 | 14.02.2027 | Delivery dates always shown with weekday and month name to avoid ambiguity: "Sun 14 Feb", "So., 14. Feb.", "niedz., 14 lut" |
| Time | 14:00 | 14:00 | 14:00 | Cutoffs shown in **recipient's local time** with explicit zone ("14:00 Warsaw time") on corridor and PDP |
| Decimal / thousands | 1,234.50 | 1.234,50 | 1 234,50 | |
| Currency | £45.00 | 45,00 € | 45,00 zł | Symbol position and spacing per locale via `Intl.NumberFormat(locale,{style:'currency'})`; ISO code shown on hover/aria for clarity across currencies |
| Percent (VAT) | 20% | 19 % | 23% | |
| Phone | +44 7… | +49 30 … | +48 … | `libphonenumber-js`: E.164 stored, national format shown, validated for the **recipient's country**, not the buyer's |
| Postcode | Outward/inward, `SW1A 1AA`, uppercase | 5 digits `10115` | `00-001` with hyphen | Per-country regex + normaliser; position in the address form per country (§8) |
| Name order | Given Family | Given Family | Given Family (formal correspondence may prefer Family Given; we keep Given Family with a single free-text `full_name` for recipients) | Single `full_name` field for recipients (florists need what to say at the door); split fields only for the buyer's card/billing where processors need it |
| Plurals | 1 florist / 2 florists | 1 Florist / 2 Floristen | 1 kwiaciarnia / 2 kwiaciarnie / 5 kwiaciarni | ICU plural rules; Polish has few/many/other and is the acid test |
| Diacritics | — | ä ö ü ß | ą ć ę ł ń ó ś ź ż | Stored as UTF-8 NFC; slugs transliterated; search uses `unaccent` |
| Lists | a, b and c | a, b und c | a, b i c | `Intl.ListFormat` |
| Relative time | "Delivered 2 hours ago" | | | `Intl.RelativeTimeFormat` on tracking page |
| Week start | Monday | Monday | Monday | Date picker uses locale week start; US later |
| Sorting | | | | `Intl.Collator` for city lists (ł sorts after l in Polish) |

## 8. Address formats per destination country (data-driven)

`config/address-formats.ts` defines per country: field order, required fields, labels key, postcode regex, whether apartment/floor is a separate field, and example placeholder.

| Country | Order | Notes |
|---|---|---|
| PL | full_name · street + number/apartment (`ul. Marszałkowska 10/5`) · postcode `00-001` · city · phone | "/" apartment convention; `ul.`/`al.` prefixes accepted; voivodeship not needed |
| DE / AT | full_name · street + house number · optional c/o / floor · postcode 5 (AT 4) · city · phone | House number after street |
| UK | full_name · address line 1 · line 2 · town · postcode `SW1A 1AA` · phone | Postcode after town; county optional |
| FR | full_name · number + street · complément (apartment, étage, code porte) · postcode 5 · city · phone | Door codes matter for Paris deliveries |
| NL | full_name · street + number + addition · postcode `1234 AB` · city · phone | Postcode + number uniquely identifies the address; lookup later |
| ES / IT | full_name · street + number · piso/puerta (ES) / scala/interno (IT) · postcode 5 · city · province · phone | Province field required |
| NO / SE / DK / FI | full_name · street + number · postcode 4 (SE 5 `123 45`) · city · phone | Entrance/floor codes common in SE |
| RO | full_name · street + number · bloc/scara/etaj/apartament · postcode 6 · city · județ · phone | Block/staircase/floor/apartment fields common |
| TR | full_name · mahalle + street + number · daire · postcode 5 · ilçe · il · phone | District (ilçe) required |

Recipient phone is required for every country (florists call ahead); the field validates against the destination country's numbering plan and accepts a non-local number with a warning ("this doesn't look like a Polish number; the florist may not be able to call").

## 9. Occasion calendar as data

`occasion_country(occasion_id, country_id, rule, observed, indexable_override, promo_start_offset_days)` with rule types: `fixed(MM-DD)`, `nth_weekday(month, weekday, n)`, `last_weekday(month, weekday)`, `easter_offset(days)`, `lent_sunday(n)` (UK Mothering Sunday), `none`. A pure function `occasionDate(rule, year)` is unit-tested against a fixture of 2026–2030 dates for every launch country (Mothering Sunday 2027 = 14 Mar; DE Muttertag 2027 = 9 May; PL Dzień Matki = 26 May; NO Morsdag 2027 = 14 Feb; SE Mors dag 2027 = 30 May).

## 10. Time zones and cutoffs

- Every country (and city where it differs; none at launch in Europe except none, but Portugal/Azores and Spain/Canaries later) carries an IANA zone. Cutoffs are stored as local time + zone and evaluated on the server in that zone; the buyer sees "order in the next 2 h 15 min for delivery today in Warsaw" computed from `now` in the destination zone.
- Delivery date picker shows dates in the destination zone; DST transitions handled by `Temporal`/`date-fns-tz`, tested with fixtures around the last Sunday of March/October.

## 11. Testing i18n

| Test | Layer | Fixture |
|---|---|---|
| Message catalog completeness (every key in every locale or a documented fallback) | unit, CI | all locales |
| ICU plural/select correctness for pl | unit | few/many/other cases |
| Currency and number formatting snapshot per locale | unit | 0, 0.5, 45, 1234.5, 1e6 |
| Occasion date rules 2026–2030 | unit | fixture table |
| Address validation per country | unit | valid/invalid postcodes, phones |
| hreflang reciprocity + sitemap agreement | integration | sample 200 URLs |
| Locale switcher preserves entity and destination | e2e | product page in en-gb → pl |
| Banner: no redirect for Googlebot UA; suggestion for `Accept-Language: de` on `/en/`; persisted "Stay" | e2e | |
| RTL pseudo-locale visual regression | visual | key templates |
| No literal strings | lint | |

## 12. Things that would force a rewrite (flagged)

| Risk | Guard |
|---|---|
| Locale inferred from cookie/IP into cached HTML | Locale is URL-only; middleware never rewrites based on cookie |
| Currency in URL or in server HTML variation | Cookie + client repaint from embedded price table |
| Physical CSS properties | Lint ban; logical properties only |
| Strings concatenated with numbers/dates | `Intl` everywhere; lint on template literals with `{count}` patterns |
| Per-locale forks of components | One component, data-driven address/format configs |
| Translation state as a promise, not data | `meta.json` + DB `translation_status` gating `noindex` |

**Recommendation:** adopt §1 as the i18n contract every spec must honour and §6 as the operating procedure from the first seed import.
**Rationale:** the three-dimension model is what lets a German buyer send to Warsaw in EUR without the site lying to Google or to the buyer.
