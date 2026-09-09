# 05 — Occasion pages

Method as in `docs/design/homepage-v1/README.md`. Live fetches **2026-09-09**; fallbacks to `docs/research/competitors-*.md` (**2026-09-05**) marked.

Access log:
| Site | URL fetched 2026-09-09 | Result |
|---|---|---|
| Interflora UK | https://www.interflora.co.uk/category/birthday-flowers | 200, readable |
| Euroflorist PL | https://www.euroflorist.pl/kategoria/okazje/urodziny | 200, readable |
| Interflora PL | https://www.interflora.pl/ (nav: "Na okazje") | 200, partial |
| FloraQueen | occasion collections listed in sitemaps (2026-09-05) | partial |
| 1-800-Flowers | occasion taxonomy from `competitors-global-and-serp.md` §2 | 2026-09-05 |
| Teleflora | teleflora.com | **HTTP 403** |
| Bloom & Wild | — | **BLOCKED**; tag collections per 2026-09-05 |
| InternetFlorist | .net NXDOMAIN / .biz 403 | **has no occasion taxonomy at all** (2026-09-05) |
| Poczta Kwiatowa | all URLs | **404 to WebFetch** |

---

## 1. Per-competitor table

| | Interflora UK | Euroflorist PL | Interflora PL | FloraQueen | 1-800-Flowers | Bloom & Wild | Fleurop DE | Aquarelle FR | InternetFlorist |
|---|---|---|---|---|---|---|---|---|---|
| **Above the fold** | H1 "Birthday Flowers Delivery" → "It's their birthday, so it's time to spoil them rotten! Celebrate in style with a beautiful bouquet of birthday flowers hand-crafted by a local florist and delivered right to their door." → **delivery date + address controls** → grid | H1 "Kwiaty na urodziny" → "Bukiet urodzinowy to o wiele więcej niż tylko bukiet… Zobacz, jak niewiele kosztuje sprawienie komuś ogromnej radości w ich wyjątkowym dniu." → same-day CTA → grid | "Na okazje" nav; countdown + "Kup do 17:00 - dostawa dziś!" | `/collections/birthday` etc. — grid with a two-sentence intro | occasion landing with product/recipient/price cross-cuts | tag collection grid | `/anlaesse/…` grid | `/occasions/{slug}` grid | **none** |
| **Occasion taxonomy** | Anniversary, Apology, Baby, Birthday, Congratulations, Friendship, Get Well, Good Luck, Just Because, Romantic, Surprise, Thank You, Thinking of You, Wedding + funeral/sympathy tree + long-tail (`/18th-birthday`, `/50th-anniversary`, `/birthday-flowers-for-mum`) | Urodziny, **Imieniny (name day)**, Rocznica, Kocham Cię, Gratuluję, Dziękuję, Przepraszam, funeral (Wiązanki, Kondolencyjne) | Kwiaty / Prezenty / Na okazje / Wyślij do innego kraju / Stwórz produkt / Dla firm | Birthday, Anniversary, Funeral, Get Well, Sorry, Thank You, New Baby, Congratulations, Wedding + calendar (Easter, Father's/Mother's Day, Halloween, **Hanukkah, Passover, Rosh Hashanah**, St Patrick's, Thanksgiving, Labor Day) | **split into "Everyday Occasions" and "Seasonal Occasions" with the date printed** (e.g. "Labor Day (9/7)", "Grandparents Day (9/13)") | birthday, sympathy-gifts, thank-you-gifts, graduation, father's/mother's day, valentines, christmas, **rosh-hashanah**, uni-gifting, gifts-for-mother-in-laws, pet-friendly, under30, free-delivery | Geburtstag, Liebe, Dankeschön, Gute Besserung, Geburt, Hochzeitstag, Hochzeit, Jubiläum, Trauer tree | 26 occasions incl. **Muguet (1 May), Toussaint, Fête des grands-mères, Fête des belles-mères, Roch Hachana** | none — product types only |
| **Age / relationship splits** | `/18th-birthday`, `/50th-anniversary`, `/birthday-flowers-for-mum` | **18, 30, 40, 50, 60, 70, 80, 90**; "dla niej" / "dla niego" | not visible | none found | recipient cuts (Mom / Her / Him / Kids) under every occasion | gifts-for-mother-in-laws | none | none | none |
| **Date awareness / calendar** | none on the birthday page (evergreen) | "Urodziny są już dzisiaj?" link to same-day; yearly-reminder prompt ("Pamiętaj") | countdown to the daily 17:00 cutoff | seasonal collections without dates on the page | **dates printed in the mega-menu** | seasonal tags | none | seasonal occasion pages | none |
| **Cutoff messaging** | in the FAQ: "Same day delivery requires you to order by 3pm, so make sure you get your order in before!" | "kilka godzin" + same-day category link | "Kup do 17:00 - dostawa dziś!" | none | recipient-time-zone cutoffs live in the FAQ | "before 10pm for tracked next-day delivery" (UK) | "100-Minuten-Service" | granular per zone and slot (best in field, see `competitors-national.md` §7) | "DELIVERY TODAY/TOMORROW" badges |
| **Price / VAT wording** | none on the page | none visible | "Darmowa dostawa" on cards | none on the grid | price-band navigation ($30/$50/$75) | product price | "ab …" | TTC | destination currency |
| **Editorial below the grid** | **birth flowers by month (January carnations → December holly)** with links to guides | "Najpiękniejsze kwiaty na urodziny", gendered guidance, discount promo | not visible | delivery options + how-it-works + city links + 6-question FAQ | occasion gifting guides | blog links | none | occasion editorial | none |
| **FAQ** | 2 questions (flower selection, delivery timing) | **9 questions**: delivery timing, personalisation, anonymity, international orders, workplace delivery, combined orders, rose availability, gender-specific choices | not visible | 6 questions | linked, not inline | none | FAQPage on city pages | none | per-country FAQ |
| **Trust elements** | local-florist claim, "hand-tied and delivered straight to their door", "What our customers are saying" | FAQ, policy links, payment logos | eKomi / Trustpilot / Google strip | "4.8/5 (+18K reviews)" | "100% Smile Guarantee" | Trustpilot-style widget, per-product ratings | Trusted Shops | Trustpilot widget, "Bouquet 100% conforme", **photo at dispatch** | Trustpilot |
| **Urgency** | "Need flowers to arrive like, right now?!" | "Bez obaw, jeszcze zdążysz"; "10% taniej" newsletter | live countdown | "Send love today" | "Save Up to 30%" | "£10 off your first order" | "Noch heute lieferbar" | none observed | badges |
| **Internal links** | sibling occasions, seasonal alternatives, international (130+ countries) | age/style sub-collections, cakes, alcohol, local florists | occasions nav | trending cities/countries/occasions/flowers | occasion × product type × recipient × price | sibling tags | Anlässe tree | occasion index | — |
| **Occasion × destination pages?** | **no** (occasion and international are separate trees) | no | no | **no** (grep for birthday × germany returned nothing, 2026-09-05) | **yes** — `/international/englandsympathy-12617`, `/international/englandloveromance`, `/international/englandgetwell-12620` | no | no | no | no |

---

## 2. What we take

1. **Occasions split into "everyday" and "dated", with the date printed.** 1-800-Flowers' mega-menu prints "Labor Day (9/7)", "Grandparents Day (9/13)" (2026-09-05). For a cross-border buyer the date is the whole point — Mother's Day is a different day in the UK, Poland and Germany. This is the strongest structural idea in the field for us and maps to `plan/05` rows 8, 13, 14, 40.
2. **Name-day (imieniny) as a first-class occasion for Poland.** Euroflorist PL treats it as a top-level occasion and even publishes a `/kalendarz-imienin-polskich/{name}` set (13 URLs, 2026-09-05). Nobody targeting the Polish diaspora from the UK does this. Genuine, non-thin, high-intent, and free from a public name-day calendar.
3. **Age and relationship splits where they change the product.** Interflora UK's `/18th-birthday`, `/50th-anniversary`, `/birthday-flowers-for-mum` and Euroflorist's 18/30/…/90 are the field's proven long-tail pattern.
4. **A real reference table as the below-grid editorial.** Interflora UK's birth-flower-by-month table is the only occasion editorial in the set that a person would actually read. Our equivalent: what each occasion means and when it falls in each live destination.
5. **A substantial, honest FAQ.** Euroflorist PL's 9 questions cover the things buyers actually ask, including two we must answer: **anonymous sending** and **delivery to a workplace**. Neither is in `plan/04` yet.
6. **An occasion-reminder signup on the occasion page.** Euroflorist PL prompts a yearly birthday reminder; Fleurop sells "Erinnerungsservice" as an account benefit. Already added to our homepage (round 6, double opt-in) — it belongs on every occasion page too.
7. **Locale-specific occasions authored per market, not translated from English.** Aquarelle's Muguet (1 May), Toussaint, Fête des grands-mères / belles-mères, Roch Hachana; Euroflorist PL's Imieniny and Dzień Kobiet; Blume2000's Weltfrauentag and Omatag. Our occasion calendar is per locale market *and* per destination country.
8. **Funeral and sympathy as a deep tree, not one page.** Interflora UK (Casket Sprays, Hearts and Cushions, Letter Tributes, Wreaths, plus Condolence Etiquette), Flora Nordica (bårebuket, kistepynt, kranse, bånd) and Euroflorist PL (Wiązanki, Kondolencyjne) all do it. It is the highest-intent, highest-anxiety corridor category.
9. **Occasion × destination pages exist and rank** — 1-800-Flowers is the only site in the set doing it (`/international/englandsympathy`). `plan/05` row 8 already plans `/{loc}/{country}/occasions/{occasion}`; the field evidence is that the pattern is real but almost unoccupied.

## 3. What we drop and why

1. **Occasion pages with no dates on them.** Every European competitor except 1-800-Flowers leaves the buyer to know when the occasion is. Our occasion pages carry the date per destination country and the order-by cutoff.
2. **Occasion × destination generated combinatorially.** 1-800-Flowers has ~47 international collection URLs but also a typo slug frozen by an id (`/international/taiwain-12408`). We publish the combination only where the occasion is real for that country and the country is live (`plan/05` "per matrix").
3. **Generic emotional filler as the whole intro.** "spoil them rotten", "Bukiet urodzinowy to o wiele więcej niż tylko bukiet". Two sentences of this is the field norm and it is what makes these pages thin. Ours leads with the date, the cutoff and the destination.
4. **Manufactured urgency as the occasion hook.** "Urodziny są już dzisiaj? … Bez obaw, jeszcze zdążysz", "Need flowers to arrive like, right now?!", "Save Up to 30%". Countdown only from real cutoff data (`plan/07` §4).
5. **Newsletter discount as the occasion page's conversion device** (Euroflorist "10% taniej"). Ours is the occasion reminder, double opt-in, no discount bribe.
6. **Cross-selling cakes and alcohol off an occasion page** (Euroflorist PL links to cakes and alcohol gifts). Out of scope, and alcohol has per-country legal constraints GBO explicitly warns about ("Can you send alcohol to Germany?").
7. **"Plant Mood"/"pet-friendly"/"uni-gifting" style tags as indexable collections.** Cheap to generate, no search demand mapping, and they multiply facet pages.
8. **No occasion taxonomy at all** (InternetFlorist runs 14,750 sitemaps on product type alone). Occasion is the dominant query class in this market; the omission is a gift to us.

## 4. Open questions for the founder

1. **Occasion calendar scope.** How many locale markets × destination countries do we author occasion dates for at launch (`plan/05` row 40 is Phase 1)? Each one needs a verified date source per year, per country.
2. **Anonymous sending.** Euroflorist answers it as a standard question. Do we support it, and how does that interact with the recipient-to-sender loop and the printed card copy (`plan/04` §13)?
3. **Workplace and hospital delivery as occasion-page content.** Both are common and both need country rules. Are they Phase 1 for Poland?
4. **Funeral flowers in Phase 1.** Deep taxonomy, timed delivery, cemetery/crematorium access, and the highest reputational risk if a partner misses. In or out for the first corridor?
5. **Name-day pages.** A Polish name-day calendar page set is a strong asset but is only credible if the dates are correct and the pages are not thin. Do we build `/{loc}/occasions/name-days/{name}` in Phase 1, or a single calendar page first?
6. **Do we ever show a discount at all?** The whole field leads with sales and vouchers. The founding-customer offer (round 6 decision) is our only planned incentive — is that also the answer for occasion pages, or nothing?
