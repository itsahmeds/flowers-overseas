# Competitor site structure and sitemaps: what page types they have, and which ones we should build

> **Status: awaiting the founder's decision.** The five recommended page types (Poland grave and cemetery flowers, card-message and wishes guides, a Polish name-day calendar, city pages for the big Polish cities pulled forward, flower-meaning guides later) are proposals only; none is in a spec or `plan/05` until the founder decides.

Research date: 2026-10-03. Method: robots.txt, then the sitemap index, then every child sitemap, fetched with curl (desktop Chrome UA) and counted by script. Where a site blocked curl (internetflorist.biz city and product sitemaps, ftd.com, teleflora.com, bloomandwild.com), Firecrawl fetched the same files. Single pages were checked for title, canonical, robots, hreflang, H1 and visible word count. Search results come from Firecrawl search with the location set as stated: one snapshot on one day, so positions will move. This builds on `docs/research/competitors-direct.md`, `competitors-global-and-serp.md` and `competitors-national.md` (all 2026-09-05) and does not repeat their checkout and UX findings.

Every count below is from a file fetched on 2026-10-03 unless it is marked **estimate**.

---

## 1. Summary for the founder (plain English)

1. The big sites look huge because they **multiply one template by every place name**. internetflorist.biz lists **25,756 Polish towns and villages** in its English sitemap alone. FloraQueen has **12,610** "flowers-{place}" pages. Most of these pages are the same text with the town name swapped.
2. Google is not rewarding that. internetflorist marks its village pages `noindex`. Interflora UK points many of its 977 town pages at the homepage or the county page. The sites themselves are hiding these pages.
3. What actually ranks for "send flowers to Poland" is **one strong country page**. The #1 site (myglobalflowers.com) has 89 country pages and only **3** Polish city pages. Our corridor page is exactly this type, and it is already in Phase 0.
4. Country × occasion pages ("Mother's Day flowers Poland") **do rank**. They are already in our Phase 0 plan, behind the six-product rule.
5. The big sites have five things we lack or have scheduled late: **funeral and grave flowers as a real section**, **card-message and wishes guides**, **name-day pages for Poland**, **city pages for the main Polish cities**, and **flower-meaning guides**.
6. **Add first:** (1) a Poland **grave and cemetery flowers** page, plus a guide to sending funeral flowers to Poland. The Polish diaspora orders these year-round, not only on 1 November.
7. (2) **Message and wishes guides**, for example "życzenia imieninowe" or "what to write on a sympathy card". Every UK leader has these, and Polish searchers look for "życzenia" in large numbers.
8. (3) A **Polish name-day calendar**, plus pages for about 20 popular names. Euroflorist PL already has 12 name pages.
9. (4) **City pages for 6 to 8 big Polish cities** once a florist covers each one. Bring the planned Phase 1 type forward, but never towns or villages. (5) **Flower-meaning guides** later, for authority.
10. Altogether that is roughly **100 to 140 new pages for Poland in 4 languages**, not thousands. That is the right size for us. Thin pages at scale are what Google punishes, and we cannot afford a site-wide penalty on our one domain.

---

## 2. Per-site findings

### 2.1 internetflorist.biz (global relay, 32 language prefixes)

**Sitemaps**
- `robots.txt` names one index: `https://www.internetflorist.biz/sitemap.xml`.
- The index has **14,750 child sitemaps**: 32 × `/{lang}/sitemap-pages.xml`, 7,359 × `/{lang}/sitemap-cities/{country}/`, and 7,359 × `/{lang}/sitemap-products/{country}/`.
- `/en/sitemap-pages.xml` holds **3,463 URLs**:
  - 230 country hubs
  - 230 per-country `faq.html`
  - 230 per-country `terms-conditions.html`
  - 2,760 country × category collections (12 categories × 230 countries)
  - 13 site pages
- `/en/sitemap-cities/poland/` (via Firecrawl) holds **25,756 URLs**: 16 province pages plus about 25,740 `send-flowers-{town}` pages, down to villages such as `send-flowers-zwierzynek`. It has no hreflang.
- `/en/sitemap-products/poland/` holds **907** Poland product URLs at country level (`/en/florist-poland/{product}-flower-delivery.html`).
- **Estimate:** if all 32 language sitemaps match English, there are about 824,000 Poland town URLs (25,756 × 32). I fetched only the English one.

**URL patterns and examples**

| Page type | Example | Count (en) |
|---|---|---|
| Country hub | `/en/florist-poland/` | 230 |
| Country × category (gift baskets, plants, wine, perfume…) | `/en/florist-poland/gift-baskets-poland-collection.html` | 2,760 |
| Province | `/en/florist-poland/lesser-poland-province.html` | 16 (Poland) |
| City / town / village | `/en/florist-poland/send-flowers-zwierzynek/` | ~25,740 (Poland) |
| Country FAQ | `/en/florist-poland/faq.html` | 230 |
| Country T&Cs | `/en/florist-poland/terms-conditions.html` | 230 |
| Product (country-scoped) | `/en/florist-poland/royal-choice-…-flower-delivery.html` | 907 (Poland) |

- It has **no occasion pages, no blog, no flower guides and no same-day pages**.

**Locales:** 32 language prefixes; some have translated slugs (`/pl/kwiaciarz-polska/wys-a-kwiaty-zwierzynek/`, with broken diacritics) and others keep English slugs (`/ja/`, `/ru/`, `/uk/`). Pages carry 33 hreflang links (earlier study); the sitemaps carry none.

**Thin or real content**
- The village page `/en/florist-poland/send-flowers-zwierzynek/` is pure boilerplate with the name swapped: "Our local Zwierzynek florists are ready…" and six templated FAQs.
- It carries **two robots meta tags, `index, follow` and `noindex`**, so Google treats it as noindex while the sitemap still submits it.
- This is the clearest doorway pattern in the set, and the site is now quietly switching it off.

**What carries traffic:** country hubs and a few large city pages, judging by the earlier SERP study. The village pages are noindexed.

### 2.2 1800flowers.com (US)

**Sitemaps** (8 children, **23,407 URLs** in total)

| Child sitemap | URLs |
|---|---|
| `sitemap-collection.xml` | 890 |
| `sitemap-products.xml` | 6,127 |
| `sitemap-marketplace-collections.xml` | 359 |
| `sitemap-marketplace-products.xml` | 15,749 |
| `sitemap-templates.xml` (articles and landing pages) | 116 |
| `local/sitemap.xml` | 43 |
| `sitemap-productsimage.xml` | 122 |
| `sitemap-static.xml` | 1 |

**Page types**
- **International:** 136 URLs contain "international".
  - Country pages: `/international/poland-12111`.
  - Country × occasion exists only for big corridors: `/international/canadasympathy-12076`, `/international/englandbirthday-12615`, `/international/canada-mothers-day-12900`.
  - Country-scoped products: `/international/germany-funeral-arrangement-107457`, more than 20 for Germany.
  - Content: `/international-delivery-faq`, `/international-tips`, `/international-gift-giving`, `/international-fun-facts`.
- **Sympathy:** 359 URLs match sympathy or funeral. That includes about 40 advice articles in `sitemap-templates.xml`, for example `/sympathy-how-to-write-a-eulogy`, `/funeral-etiquette-by-service-type`, `/Post-Etiquette-Business-Sympathy`, `/how-to-send-funeral-flowers-tips`.
- **Price bands:** 29 `under-N` URLs, for example `/birthday-gifts-under-30`, `/babygifts/gifts-under-50`.
- **Same-day:** `/flowers-same-day-delivery`, `/get-well-same-day-flower-delivery`.
- **Business:** `/businessthankyou-12105`, `/businessfortheoffice-12108`.
- **Meaning:** `/flower-meanings`, `/color-meaning-roses-6027`, `/birth-flowers`.
- **Local:** 43 US city pages.

**Locales:** none; there is no hreflang anywhere.

**Search visibility:** `https://www.1800flowers.com/germany` ranked #2 for "flower delivery germany" from the UK, yet it is not in the sitemap; that is a newer country URL. `/international/poland-12111` was #10 for "funeral flowers poland delivery". The earlier study found the international pages render client-side with an empty `<title>` in server HTML.

### 2.3 FloraQueen (floraqueen.com, Shopify)

**Sitemaps** (10 children, **16,118 URLs**)
- products: 125
- pages: 47
- collections 1 to 6: **14,443**
- blogs: **1,502**, all under `/blogs/floral-guides/`
- `sitemap_agentic_discovery.xml`: 1 (`/agents.md`)

The product sitemap fell from 549 URLs in the earlier study to 125 now.

**Collections by type**

| Type | Count | Example |
|---|---|---|
| Country or city | **12,610** | `/collections/flowers-poland`, `/collections/flowers-warsaw` |
| Gift baskets by place | 627 | `/collections/gift-baskets-madrid` |
| `send-flowers-{city}` (mostly US) | 319 | `/collections/send-flowers-abilene-tx` |
| `flower-delivery-{city}` | 317 | |
| Occasions, recipients, milestones, colours, flower types and odd merchandising handles | ~570 | `birthday-gifts-dad`, `30th-birthday`, `funeral-wreaths`, `all-saints-flowers`, `navbar-campaign2` |

**Blog (1,502 posts):**
- about 102 flower-meaning posts, e.g. `anemone-flower-meaning-wild-but-fragile`
- 52 funeral and sympathy posts, e.g. `dos-and-donts-of-funeral-flowers`, `finding-the-perfect-sympathy-message`
- 42 Mother's Day posts, including `when-is-mothers-day-and-other-facts-about-the-day`
- about 30 birth-month posts
- sending-abroad guides, e.g. `a-quick-guide-on-how-to-send-flowers-internationally`

**Locales:** one ccTLD per language; the country page carries 16 hreflang values (pl-PL points to floraqueen.pl). Product pages carry no hreflang (earlier study).

**Thin or real content**
- The Poland page has 1,282 words and the Warsaw page 1,363.
- The earlier study found the 12.6k place pages share one 24-product grid and one block of copy, with a two-sentence local intro.
- It also has duplicate slugs for the same city (madrid / madrid-delivery / flower-delivery-madrid).

**Search visibility:** `/collections/flowers-poland` was #8 for "send flowers to poland" (UK).

### 2.4 Interflora UK (interflora.co.uk)

**Sitemaps** (`sitemap-index.xml`, 5 children, **1,876 URLs**)
- location: 1,081
- international: 143
- products: 235
- blog: 229
- main: 188

**Page types**

| Type | Count | Example |
|---|---|---|
| UK town | 977 | `/flower-delivery/east-sussex/eastbourne` |
| UK county | 103 | `/flower-delivery/aberdeenshire` |
| International country | **142** | `/category/international/poland` |
| Occasion categories | ~40 | `/category/occasion-flowers/international-womens-day`, `/category/occasion-flowers/sorry` |
| Milestone categories | 20 | `/category/18th-birthday`, `/category/50th-anniversary` |
| Funeral categories | 8 | `/category/funeral-flowers/wreaths`, `/category/funeral-flowers/casket-tributes` |
| Flower type, colour and style | ~25 | `/category/flower-arrangements/peonies`, `/category/flower-arrangements/white-flowers` |
| Same-day / next-day | 3 | `/category/same-day-flowers`, `/category/next-day-flowers`, `/category/gifts/same-day-gifts` |
| Price | 1 | `/category/best-value-flowers` |
| Blog: flower guides | 77 | `/blog/flower-guides/flower-meanings/red-flowers`, `/blog/flower-guides/birth-flowers/april-birth-flowers` |
| Blog: occasions | 58 | `/blog/occasions/fathers-day/fathers-day-messages` |
| Funeral and message content pages | ~8 | `/page/sympathy-messages`, `/page/funeral/poems-hymns`, `/page/funeral/flower-letters`, `/page/how-to-express-condolence`, `/page/messages` |
| Sending-abroad guide | 1 | `/page/sending-flowers-abroad` |
| Business | 1 | `/page/corporate-gifts` |
| Reviews / our florists | 1 each | `/reviews`, `/our-florists` |

**Locales:** hreflang is en-GB plus en-IE only.

**Canonicals on town pages:** I sampled six. Eastbourne and Epsom are self-canonical; Market Harborough points to `/flower-delivery/leicestershire`; Blackburn and Huntly point to **the homepage**. Interflora is consolidating weak town pages without removing them from the sitemap. This is the strongest evidence in the set that town pages at scale do not pay.

**Country page content:** the Poland page has 712 words with FAQPage schema.

**Search visibility:** `/category/sympathy-flowers` was #3 for "sympathy flowers delivery uk".

### 2.5 Euroflorist (euroflorist.pl; euroflorist.de is blocked)

euroflorist.de returned a Cloudflare challenge to curl, so I used euroflorist.pl, the Polish market and the most relevant site for Poland.

**Sitemap:** a single urlset of **2,715 URLs** with hreflang inside the sitemap (pl-PL / en-PL / uk-UA). That is 982 Polish URLs plus English and Ukrainian copies.

**Polish page types**

| Type | Count | Example |
|---|---|---|
| Product | 493 | `/produkt/10-roz-czerwonych` |
| Blog | 148 | `/blog/horoskop-kwiatowy/baran-kwiat` |
| Categories | ~118 | see the breakdown below |
| City | 73 | `/lokalne-kwiaciarnie/krakow` (1,131 words), `/lokalne-kwiaciarnie/augustow` (1,164 words) |
| International country | 55 | `/kwiaty-za-granice/argentyna`; EN `/en/international/germany` (262 words) |
| Flower encyclopedia | 49 | `/encyklopedia-kwiatow/alstromeria` |
| Name day | 12 | `/kalendarz-imienin-polskich/imieniny-andrzeja` plus the calendar root |
| Grave care in Poland (comparison) | 1 | `/opieka-nad-grobami-w-polsce` |
| Business flowers | 1 | `/kwiaty-dla-firm` |
| How to send flowers online | 1 | `/jak-wyslac-kwiaty-przez-internet` |
| Is delivery anonymous? | 1 | `/czy-dostawa-kwiatow-jest-anonimowa` |
| Authors | 2 | `/autorzy/david-denyer` |

**Category breakdown** (the most relevant market taxonomy for us):
- **Occasions (okazje):** dzień kobiet, dzień matki, dzień ojca, dzień babci i dziadka, **dzień chłopaka**, dzień dziecka, **imieniny**, **komunia**, **dla nauczyciela**, **wszystkich świętych**, kondolencje, przeprosiny, walentynki, wielkanoc, boże narodzenie, adwent, plus milestone birthdays (18 to 90).
- **Funeral (kwiaty na pogrzeb):** wiązanki pogrzebowe, **chryzantemy na cmentarz**, **kompozycje na cmentarz**, dekoracje urny.
- **Colours:** 9.
- **Price bands:** `bukiety-do-200`, `tanie-kwiaty`, `upominki/do-120-zl`.
- **Same-day:** `ekspres-kwiatowy-kwiaty-z-dostawa-na-dzis`.
- **Gifts:** `upominki/firmowe` (business), alcohol, balloons, sweets.

**Search visibility**
- euroflorist.pl/en was #4 for "send flowers to poland" (UK).
- `/en/category/occasions/all-saints-day-flowers` ranked #4 for a query about grave flowers on All Saints.
- euroflorist.de/internationaler-blumenversand/polen was #4 for "Blumen nach Polen schicken Muttertag".

### 2.6 Fleurop (fleurop.de, fleurop.de/fleurop-international, fleurop.com)

**fleurop.de, domestic** (7 child sitemaps, **4,748 URLs**)
- partner florists: **3,413**, for example `/partnerfloristen/fleurop-filialen/76689-karlsdorf-neuthard/gaertnerei-geissler-kirchstr-86`. These are real, individual shop pages: self-canonical, `index,follow`, about 483 words.
- categories: 265
- products: 367
- blog: 118, including `/blog/blumenarten/*` flower encyclopedia, `/blog/geburtsblumen`, `/blog/bluehkalender`
- occasions: 56, e.g. `/anlaesse/trauerkranz`, `/anlaesse/blumen-frauentag`
- German city pages: only **10**, e.g. `/blumenversand-deutschland/blumen-verschicken-berlin` (1,714 words)

**fleurop.de/fleurop-international** (its own sitemap index, **5,940 unique URLs**)
- **139 country pages**, e.g. `/fleurop-international/blumen-nach-polen-schicken`
- about **5,520 country-scoped products**: generic product types per country code, e.g. `/12-roses-long-stemmed/pl-12rl`, `/wreath/pl-wr`
- Poland has **223** product URLs

This is the closest structural match to our plan: a country page plus country-scoped products.

**Template defect still live:** the Poland page intro still reads "Sie möchten Blumen an einen Empfänger in **Frankreich** verschicken?" It has been there since the 2026-09-05 study, and the page still ranks #3 for "Blumen nach Polen schicken Muttertag".

**fleurop.com** (5 language sitemaps: en, de, fr, it, es; about 40,200 URLs each)
- English: 194 country pages, e.g. `/en/country/europe/more-in-europe/delivery-to-pl` (542 words, no hreflang)
- **25,270** product-to-country pages, e.g. `/en/12-roses-long-stemmed-to-poland-12rl`; 249 for Poland
- **16,301 URLs of the form `/en/delete-1-…`**: retired products still in the sitemap, `INDEX,FOLLOW` and self-canonical (`/en/delete-1-1000007117`, titled "Arrangement of Plants-Mid")
- `/en/meaning-of-flowers`, `/en/color-symbolic`, `/en/new-florist-registration`

This is sitemap hygiene to avoid. `fleurop.com/en/country/europe/delivery-to-de` was #5 for "flower delivery germany" (UK).

**Shared catalogue:** FTD's Polish product codes (4404, 4405, 4406 funeral wreaths) are the same as Fleurop International's (`funeral-wreath-farewell/pl-4404`). The incumbents resell **one shared network catalogue** across brands, so their Poland pages are near-duplicates of each other across domains. Our own photography and copy is a real point of difference.

### 2.7 Bloom & Wild (bloomandwild.com UK pages; curl blocked, fetched via Firecrawl)

**`en-gb-pages.xml`: 724 URLs**
- blog: 198, including about 20 flower-meaning posts (`/the-blog/daffodil-flower-meaning`) and birth-month posts
- `/send-flowers/tag|tagonly|type/*` collections: 175
- UK county and town pages: about 100 (`/greater-london/battersea`, `/berkshire/reading-flower-delivery`)
- brand pages: 17
- international: only 7 (`/international-flower-delivery`, `/flower-delivery-to-germany`, `/flower-delivery-to-austria`, `/flower-delivery-to-vienna`, `/ireland-flower-delivery`, `/northern-ireland-flower-delivery`, `/international-womens-day-2025`)
- business: `/business`

Bloom & Wild ships boxes and is not a relay. Its international pages are editorial hand-offs to its own .de and /de-at/ sites. `/send-flowers/tagonly/sympathy-flowers` was #2 for "sympathy flowers delivery uk".

### 2.8 FTD (ftd.com; curl blocked, fetched via Firecrawl)

- `robots.txt` disallows `/category` and `/landing` and points to `sitemap.xml`, which has three children: `sitemap-main.xml`, `sitemap-international.xml` and `blog/sitemap-blogs.xml`.
- `sitemap-international.xml` holds **3,522 URLs**:
  - **86 country collections**, e.g. `/collection/poland-pl`, `/collection/germany-de`
  - **3,436 country-scoped products**, e.g. `/product/funeral-wreath-farewell-prd-4404pl`; 157 for Poland, 117 France, 104 Germany
- Hreflang: not verified.
- **Search visibility:** `/collection/poland-pl` was #3 for "send flowers to poland" (UK) and **#1 for "funeral flowers poland delivery"** (UK). That is one country page ranking for the funeral query through its funeral sub-navigation; there is no dedicated funeral page.

### 2.9 Teleflora (teleflora.com plus international.teleflora.com)

- The main sitemap is one urlset of **1,834 URLs**:
  - bouquets: 653
  - sympathy arrangements: 98
  - `/local-flower-delivery/*`: 50
  - **`/meaning-of-flowers/*`: 33**
  - `/floral-facts/*`: 32
  - `/gift-giving-ideas/*`: 63
- It has **no international pages**. Those live on `international.teleflora.com/{country}?catID=…`, which I did not crawl (it was blocked in the earlier study too).
- **Search visibility:** `international.teleflora.com/poland?catID=cat1190143` was #2 for "send flowers to poland" and "funeral flowers poland delivery" (UK); the Germany page was #1 for "flower delivery germany" (UK).

### 2.10 International relays that rank for Poland (found by search)

**myglobalflowers.com**
- Ranking: **#1** for "send flowers to poland" (UK), #1 for "same day flower delivery poland", #3 for "flower delivery germany".
- Sitemap: 2 children, **3,106 URLs**.
  - 89 country pages: `/international-flower-delivery/poland` (**2,097 words**, 10 hreflang across sender-market ccTLDs: de-AT, de-CH, de-DE, en-AE, en-GB, en-US, es-ES, fr-FR, it-IT, x-default)
  - 733 city pages in total, but **only 3 for Poland**: warsaw, krakow (2,955 words), gdansk-flower-delivery
  - 821 products
  - 346 blog posts, including `/blog/lifestyle/gifs-and-traditions-in-poland`, which ranked #5 for "mother's day flowers poland"
  - about 400 indexable filter combinations: `/flowers/birthday/for-mom`, `/flowers/alstroemerias/pink`, `/flowers/birthday/blue/orange/purple`, `/flowers/big-bouquets/birthday/for-aunt`
- **Lesson:** a long, specific country page beats thousands of place pages. Its facet-combination pages are a thin-page risk we should not copy.

**direct2florist.co.uk** (#1 for "send flowers to Poland from UK" in the 2026-09-05 study)
- Sitemap: 5 children, **1,644 URLs**:
  - 605 UK town pages
  - **700 florist profile pages** (`/florists/{shop}-f327487/`)
  - 154 pages, of which only **18 are country pages** (`/poland/`, 1,448 words, title "Send Flowers to Poland from UK", 12 hreflang)
  - 94 blog posts
  - 91 products
  - 14 milestone-birthday, 7 milestone-anniversary, 21 funeral sub-category and 13 recipient pages (`/flowers-for-mum/`, `/flowers-for-him/`)
  - `/corporate-gift-flowers/`, `/same-day-flowers/`, `/next-day-flowers/`
- `pl.direct2florist.com` is a **sender-market** copy for people in Poland (hreflang en-pl), not a page about Poland.
- Its `/mothers-day-flowers/` page ranked **#1 for "mother's day flowers poland"** with a snippet promising delivery "across Poland, including Dublin, Galway, Limerick", a template bug that ranks anyway.

**Also seen in results** (not crawled): floweradvisor.com (`/poland/mothers-day` #3, `/poland/funeral-flowers` #8: dedicated country × occasion URLs), flowers4poland.com (single-country domain, 403 to curl), poland.cyber-florist.com, sendflowerstopoland.com, wineflowers.com, flower-delivery.aquarelle/poland.

### 2.11 What ranks: SERP snapshot, 2026-10-03

| Query (location) | Top results, by page type |
|---|---|
| send flowers to poland (UK) | myglobalflowers country page · Teleflora country · FTD country · euroflorist.pl/en home · **Reddit and Facebook threads at #5, #6, #9** · pl.direct2florist home · FloraQueen country |
| flower delivery germany (UK) | Teleflora, 1800flowers, myglobalflowers, euroflorist.de/en, fleurop.com, FTD country pages · a Reddit thread at #6 |
| mother's day flowers poland (UK) | d2f Mother's Day page · floraldaily article · **floweradvisor `/poland/mothers-day`** · Facebook · **myglobalflowers blog "traditions in Poland"** · Reddit · euroflorist.pl/en · sendflowerstopoland `/mothers-day/` |
| when is mother's day in poland (UK) | timeanddate, blogs, Wikipedia; **no florist in the top 8** |
| sympathy flowers delivery uk (UK) | sympathy category pages: fromyouflowers, Bloom & Wild, Interflora, eFlorist, M&S… |
| funeral flowers poland delivery (UK) | FTD, Teleflora, myglobalflowers country pages · euroflorist.pl/en · wineflowers, floweradvisor, aquarelle **country funeral pages** · a Polish forum |
| same day flower delivery poland (UK) | myglobalflowers, FTD, euroflorist.pl/en, cyber-florist, d2f, flowers4poland (all country pages or homes) · Wolt |
| flower delivery warsaw (UK) | **florists in Warsaw, Indiana, Kentucky and New York**; one Warsaw shop; myglobalflowers at #8 |
| kwiaty do polski z anglii wysyłka (UK) | Polish-language "flowers to Poland from abroad" pages: euroflorist.pl, pocztakwiatowa `/zagranica`, **laflora `/kwiaty-do-polski`**, eurokwiat, domashipping |
| kwiaty na grób … z zagranicy … cmentarz (PL) | **e-kwiaty `/kwiaty-na-cmentarz`** (its FAQ answers "can I order from abroad?"), kwiatynacmentarz.pl, polamerusa, wieniec24 `/kwiaty-na-groby`… |
| Blumen nach Polen schicken Muttertag (DE) | country pages from floraprima, myglobalflowers.de (FAQ answers the Mother's Day question), fleurop, euroflorist; a dedicated country × occasion page from russianflora only at #8 |

**What the snapshot shows**
1. **Country pages carry the traffic.** Every corridor query is won by a single country page or a home page. No town page appears.
2. Forums rank in the top 10 for "send flowers to poland". Google is not satisfied with the existing country pages, so a page that is honest, specific and backed by real florists has room.
3. **Country × occasion pages rank** for occasion + country queries, both as dedicated URLs (floweradvisor, d2f) and as FAQ answers on the country page (myglobalflowers.de).
4. **Date questions go to information sites.** A florist's holiday-date page is unlikely to win "when is …" queries. Our occasion hub with a date table is enough.
5. **English city pages for Poland bring little:** "flower delivery warsaw" from the UK returns US Warsaw towns. Polish-language city pages compete with local kwiaciarnie and Wolt.
6. **Grave flowers are a real Polish search category**, and pages that answer "can I order from abroad?" rank for it.
7. Template bugs (Fleurop's "Frankreich" on its Poland page, d2f's "Dublin, Galway" on a Poland page) still rank today. Good copy is not what holds incumbents up; domain age is. For a new domain, quality is the only lever we have.

---

## 3. Gap table: competitor page types against plan/05

Status key:
- **P0**: in Phase 0.
- **Later**: planned for a later phase (phase given).
- **Missing**: not in plan/05.

Plan references are plan/05 row numbers unless stated.

| # | Page type | Who has it (fetched counts) | Our status |
|---|---|---|---|
| 1 | Country page (corridor) | everyone: IF 230, FQ 12,610 incl. cities, Interflora 142, Fleurop Int 139, fleurop.com 194, FTD 86, myglobal 89, EF.pl 55, d2f 18, B&W 7 | **P0** (#4) |
| 2 | All-destinations hub | Interflora `/category/international`, fleurop.com `/en/country`, 1800 `/international-flower-delivery` | **P0** (#3) |
| 3 | City page (destination country) | IF 25,740 (PL), FQ thousands, myglobal 733 (3 PL), EF.pl 73, Fleurop 10 (DE) | **Later**, Phase 1 (#5), gated |
| 4 | Province / region page | IF 16 (PL); Interflora 103 counties (UK domestic) | **Missing** |
| 5 | Country × product category | IF 2,760; Fleurop Int and FTD via products | **P0** (#7), ≥6 rule |
| 6 | Country × occasion | 1800 (Canada, England only), floweradvisor, d2f (sender market), russianflora | **P0** (#8), per matrix |
| 7 | Country-scoped product | IF 907 PL, Fleurop Int 223 PL, fleurop.com 249 PL, FTD 157 PL | **P0** (#9) |
| 8 | Occasion hub / occasions index | all | **P0** (#13, #14) |
| 9 | Category hub (country-less) | all | **P0** (#10) |
| 10 | Flower-type pages | Interflora ~10, EF.pl ~15, d2f 5, myglobal many | **P0** as categories (#7, #10); separate flower-type hub **Later**, Phase 4 (#11) |
| 11 | Colour pages | EF.pl 9, Interflora ~4, FQ, myglobal | **Later**, Phase 4 (#12), curated only |
| 12 | **Funeral / sympathy section** with sub-types (wreaths, sprays, casket) | Interflora 8, d2f 21, EF.pl 5, FQ ~10, 1800 359 URLs | **Partly P0**: funeral product type and country root (plan/10 §1); sympathy occasion. Sub-type pages: **Missing** |
| 13 | **Grave / cemetery flowers (Poland)** | EF.pl `chryzantemy-na-cmentarz`, `kompozycje-na-cmentarz`; e-kwiaty `/kwiaty-na-cmentarz` ranks; FQ `all-saints-flowers` | **Partly**: All Saints is a PL occasion (plan/02 §6), seed has one grave bouquet. A year-round cemetery page: **Missing** |
| 14 | Sympathy and funeral advice content (etiquette, condolence messages, poems) | 1800 ~40, FQ 52, Interflora ~8 | **Missing** as a planned cluster; plan/02 §12 names "flowers for a Polish funeral" as one blog idea |
| 15 | **Card message / wishes guides** | Interflora `/page/messages` + occasion messages, B&W, FQ, myglobal `/blog/celebrating/*-wishes` | **Missing** |
| 16 | **Name-day pages** | EF.pl 12 names + calendar (×3 languages) | **Partly**: name_day occasion (plan/10) and "name-day calendar content in /pl/blog" (plan/02 §6). No page type defined |
| 17 | Holiday-date page ("when is Mother's Day in X") | FQ 1 post; information sites own the SERP | **P0** via occasion hub date table (#13); calendar **Later**, Phase 1 (#40) |
| 18 | **Flower meanings / encyclopedia / birth flowers** | FQ ~102, Interflora 77, EF.pl 49, Teleflora 33, Fleurop ~50, B&W ~20 | **Missing** (only care guide #39, Phase 1) |
| 19 | Same-day / next-day landing | Interflora 3, d2f 2, 1800 several, EF.pl 1, FQ 2 | **Deliberately folded** into corridor and delivery pages (#29, plan/05 §9) |
| 20 | Price-band pages ("under £40", "do 200 zł", "tanie kwiaty") | 1800 29, EF.pl 3, Interflora 1, d2f none | **Missing** as indexable; filter only (plan/10 §1, 008 §2 non-goal) |
| 21 | Milestone birthday / anniversary (18th, 50th…) | Interflora 20, d2f 21, EF.pl 8, myglobal 8, FQ ~10 | **Missing** |
| 22 | Recipient pages (for mum, for him) | d2f 13, myglobal many, FQ many, 1800 menus | **Missing** by design ("audience tag, not a category", plan/10) |
| 23 | Seasonal collections (spring, autumn) | Interflora, EF.pl, Fleurop | **Deliberately** a rotating collection, not a permanent URL (plan/05 §9) |
| 24 | Gifts / add-ons pages | IF 12 categories, EF.pl ~25, Interflora ~15 | **Later**, Phase 1 (#15) |
| 25 | Gift baskets / hampers | FQ 627, IF, Interflora | **Later**, Phase 4 (plan/10) |
| 26 | Florist directory / florist profiles | Fleurop 3,413, d2f 700, Interflora `/our-florists` | **Later**: "Our florists" Phase 1 (#26), profiles Phase 2 (#27) |
| 27 | Per-country FAQ page (separate URL) | IF 230 | **Folded** into the corridor FAQ (plan/02 §5.2) |
| 28 | Per-country terms page | IF 230 | **Not needed** (one T&C per legal regime) |
| 29 | Delivery information | Interflora `/page/delivery-information`, everyone | **P0** (#29) |
| 30 | Sending-abroad guide / how it works | Interflora `/page/sending-flowers-abroad`, 1800 `/international-tips`, FQ posts, EF.pl `/jak-wyslac-kwiaty-przez-internet` | **P0** (#25 How it works, #36 blog) |
| 31 | Business / corporate gifting | Interflora, B&W, d2f, EF.pl `/kwiaty-dla-firm`, 1800, FQ | **Missing** from plan/05; "corporate deferred" to Phase 4 (plan/10) |
| 32 | Reviews page | Interflora, d2f, 1800 | **Later**, Phase 1 (#30) |
| 33 | Blog / authors | most | **P0** (#35, #36); authors **Later**, Phase 1 (#38) |
| 34 | For-florists / recruitment | Fleurop `/partnerfloristen/fleurop-partner`, fleurop.com `/en/new-florist-registration` | **P0** (#41–#43) |
| 35 | Subscription pages | Interflora, B&W, 1800 | **Missing**; skip (relay model) |
| 36 | Grave-care service page (cleaning and tending graves) | EF.pl `/opieka-nad-grobami-w-polsce` (comparison article) | **Missing** |
| 37 | Sender-origin variants ("…from UK", "…from USA") | d2f title "Send Flowers to Poland from UK"; myglobal "Send Flowers to Germany from USA" | Handled by locale: `/en-gb/` is the UK sender page. No new URL type |
| 38 | Paginated HTML sitemap pages | FQ `/pages/html-sitemap-collections-1…10` | **Missing**; all-destinations hub plays this role |
| 39 | `/agents.md` (LLM-agent discovery) | FQ | **Later**, Phase 1 (#67) |

---

## 4. Recommendations with page counts

**How to read the counts**
- Our scope is 4 locales (`en`, `en-gb`, `de`, `pl`) × 7 destinations: Poland live, plus guides for DE, FR, ES, IT, RO and NL.
- "Poland first" means Poland only, in all four locales.
- Editorial pages are **written per locale, not translated** (plan/02 §12), so their count is per locale, not × destinations.
- All counts are **estimates** of what we would create. They are not competitor figures.

### 4.1 Build: the five to add first

**1. Grave and cemetery flowers for Poland, plus a "funeral flowers to Poland" guide.** Build in Phase 1, with the first florist who will deliver to cemeteries. The demo version stays noindexed.
- **Why:** Polish families order flowers and candles for graves year-round, not only on All Saints (1 Nov) and Zaduszki (2 Nov): death anniversaries, Easter, Christmas. A Polish site's grave page ranks with an FAQ answering "can I order from abroad?". FTD, Teleflora and myglobalflowers rank for "funeral flowers poland delivery" with nothing more than a country page that lists funeral pieces. Euroflorist PL gives this its own categories.
- **Pages:**
  - a country category `/{loc}/poland/flowers/grave-flowers` (slug per locale; `pl`: `kwiaty-na-cmentarz`), only once ≥6 grave products exist (the seed has 1)
  - one editorial guide per locale covering church, funeral home and cemetery delivery, ribbon wording, the chrysanthemum custom, and timing
  - sub-type pages for the funeral root (wreaths, sprays) are **build later**, when ≥6 products of each type exist
- **Count, Poland first:** 4 category + 4 guide = **8**.
- **All 7 destinations:** add grave pages only where cemetery customs are strong (estimate: RO, IT, FR around All Saints), so at most +12 category pages. Sub-type pages: estimate 2 × live countries × 4.
- **Risk:** low. The page has a distinct product set and a distinct buyer need, so it is not a doorway.

**2. Message and wishes guides.** Build in Phase 1, as editorial pages in the blog.
- **Why:** every UK leader has them (Interflora `/page/sympathy-messages`, `/blog/occasions/*/…-messages`; FloraQueen "finding-the-perfect-sympathy-message"; myglobalflowers `/blog/celebrating/*-wishes`; Bloom & Wild `18th-birthday-message-ideas`). For a relay the card message is part of the product. Polish "życzenia" searches (name day, Mother's Day, Women's Day, condolences) are a large informational stream that links naturally to an order. **Estimate:** search volume not measured; I had no keyword tool in this session.
- **Pages:** about 5 per locale, chosen per locale.
  - `pl`: życzenia imieninowe, na Dzień Matki, na Dzień Kobiet, kondolencje, na urodziny
  - `en-gb`: what to write on a sympathy card for a Polish family, Polish phrases for a card
  - `de`: Glückwünsche auf Polnisch, Beileidssprüche
- **Count:** about **20**. They are not multiplied by destination.
- **Risk:** low, if each guide is written by hand and links to one corridor page and one occasion page (plan/02 §12).

**3. Polish name-day calendar.** Build in Phase 1.
- **Why:** name days (`imieniny`) are a Polish gifting occasion competitors in other countries do not cover. Euroflorist PL keeps a calendar plus 12 name pages in three languages. Our plan names `name_day` as an occasion but defines no page.
- **Pages:**
  - one calendar page per locale (`/pl/…/kalendarz-imienin`, `/en-gb/…/polish-name-days`, and so on)
  - about 20 single-name pages in `pl` only, each with real content: date(s), diminutives, a suggested bouquet and wishes
  - **never** 365 or more programmatic name pages
- **Count:** 4 + 20 = **24**. Poland only.
- **Risk:** medium if it grows past the names we can write properly. Cap it at names with real search demand.

**4. City pages for the main Polish cities.** This type is already planned for Phase 1 (#5). Bring it forward to the moment Poland goes live, and keep the cap.
- **Why:**
  - Euroflorist PL has 73 city pages of about 1,100 words.
  - myglobalflowers ranks #1 nationally with only 3 Polish cities.
  - The mass versions are the clearest doorway evidence in this study: internetflorist's 25,756 Polish places noindexed, Interflora pointing town canonicals at its homepage, FloraQueen's 12.6k identical grids.
  - English "flower delivery warsaw" queries from the UK return US towns, so the value is mostly in `pl` and `de` and in links from the corridor page.
- **Pages:** Warsaw, Kraków, Wrocław, Gdańsk, Poznań, Łódź, plus up to 2 more, each only with a covering florist and city-specific facts (plan/02 §5.1).
- **Count, Poland first:** 8 × 4 = **32**.
- **All 7 destinations, later:** about 5 cities × 6 more countries × 4 = about 120 (estimate). Never provinces, towns or villages.

**5. Flower-meaning and flower guides.** Build later, in Phase 2.
- **Why:**
  - Every large florist builds this cluster: FloraQueen about 102 meaning posts, Interflora 77 flower guides, Euroflorist PL 49 encyclopedia entries, Fleurop about 50, Teleflora 33, Bloom & Wild about 20.
  - It builds topical authority and earns links, but its buying intent is low.
  - Our angle: Polish and Central European customs, such as odd stem counts, chrysanthemums for graves, and carnations on Women's Day. That makes our guides different from the generic ones.
- **Count:** about 10 per locale to start = **40**.
- **Risk:** low as long as each guide is original and written by a named author (plan/02 §12).

### 4.2 Build later

| Page type | When | Count (Poland first → 7 destinations) | Reason |
|---|---|---|---|
| Funeral sub-type pages (wreaths, sprays) | when ≥6 products per sub-type in a live country | 2 × 4 = 8 → 2 × 7 × 4 = 56 (estimate) | Real buyer distinction; Interflora, d2f and EF.pl all split it. Gate it by the six-product rule like every country category |
| Price-band page ("flowers under £40 to Poland" / `tanie-kwiaty`) | Phase 1, after real PL partner prices | 1 × 4 = 4 → 1 × 7 × 4 = 28 | EF.pl and 1800 make these indexable. Build one curated band per live country, as a category with its own copy, not a filter; ranking value not measured |
| Business / corporate gifting page | Phase 2–3 (plan/10 says Phase 4) | 4 (one per locale) | Interflora, B&W, d2f, EF.pl and FQ all have one. Low search volume, but "send flowers to a client in Poland" is a real, higher-value order. Country-less, so no multiplication |
| Florist profiles / directory | Phase 2 as planned (#27) | opted-in partners × 4 (e.g. 5 → 20) | Fleurop's 3,413 and d2f's 700 work because they are national networks with real shops. Ours must be real partners who opted in, and is never a fabricated `LocalBusiness` (plan/02 §9) |
| Sympathy and funeral advice cluster beyond the guide in 4.1 | Phase 2 | about 4 per locale = 16 | 1800 has about 40 articles and FQ 52. Diaspora angle: Polish funeral customs, condolences in Polish, sending flowers to a funeral in Poland from abroad |
| Milestone birthday pages (18th, 50th…) | only as blog posts, Phase 2+ | a few posts, no country pages | Competitors have 8–21 each. As country pages they would fail the six-product rule and be thin; as content they can work |

### 4.3 Skip

| Page type | Why skip |
|---|---|
| Town, village and province pages | The doorway pattern itself. internetflorist noindexes its own; Interflora is canonicalising them away; none appeared in any corridor SERP. Province pages add one more template with nothing unique to say |
| Separate same-day / next-day landing pages | "same day flower delivery poland" is won by country pages. Keep same-day in the corridor title, H2 and delivery facts as plan/05 §9 already decides. A separate page would duplicate the corridor |
| Recipient pages (for mum, for him) and colour × occasion × recipient combinations | myglobalflowers indexes about 400 such combinations; they are near-duplicate grids. Keep them as filters (noindex), as plan/10 already says |
| Per-country FAQ and terms URLs | internetflorist's 230 + 230 are boilerplate. Keep the FAQ on the corridor page and one T&C per legal regime |
| "From country X to country Y" URL matrix | Our locale prefix already is the sender market. Put "from the UK" in the `en-gb` corridor title (as direct2florist does) instead of new URLs; a from × to matrix is a doorway generator |
| Product-to-country pages for every country (fleurop.com 25,270; FTD 3,436) | Our country-scoped products are already gated to live countries (plan/02 §4.2). Never publish them for demo countries; never leave retired products indexable (fleurop.com's 16,301 `delete-` URLs) |
| Holiday-date pages as their own type | Information sites own "when is …". Our occasion hub date table and the Phase 1 calendar (#40) already answer it |
| Subscriptions, HTML sitemap pages | Do not fit a relay at launch; the all-destinations hub already gives crawlers a path |
| Grave-care service page | Only if we sell a tending service with a partner; otherwise it would describe something we do not do |

### 4.4 Totals

**Poland first, 4 locales:** about **128 new indexable pages**.

| Item | Pages |
|---|---|
| Grave and funeral (4.1.1) | 8 |
| Messages and wishes | 20 |
| Name days | 24 |
| Cities (already planned; brought forward) | 32 |
| Flower guides | 40 |
| Price band | 4 |

**Phase 2 additions:** corporate 4, sympathy cluster 16, florist profiles about 20.

**For comparison:** plan/05 §7 estimates about 680 indexable URLs in Phase 0, so this adds roughly 20%. internetflorist lists 25,756 URLs for Polish towns in English alone. Our edge is not volume: each page should be the best answer on the results page for its query, on a domain Google can trust.

### 4.5 Two smaller lessons for existing specs

- **Sitemap hygiene** (plan/02 §10 already requires it; this shows why):
  - fleurop.com submits 16,301 retired `delete-` products.
  - internetflorist submits pages it marks `noindex`.
  - Interflora submits towns it canonicalises elsewhere.
  - Fleurop International's 139 country pages are absent from the main fleurop.de sitemap and live in a second index.
  - The auditor checks in plan/02 ("nothing noindex in a sitemap", "canonical = self") are the right gates.
- **Template variable leaks still happen at the top:** Fleurop's Poland page says "Frankreich", and d2f's Poland Mother's Day snippet lists Irish towns. plan/02 §5.3 already greps for other countries' names in corridor copy. Extend the same grep to country × occasion and city pages.

---

## 5. Sources (fetched 2026-10-03)

Our side: `plan/05-page-inventory.md`, `plan/02-seo-spec.md` §3–§12, `plan/10-seed-data-and-taxonomy.md` §1, `specs/008-country-shop-category-occasion-pages.md` §2, `docs/research/competitors-direct.md`, `docs/research/competitors-global-and-serp.md`, `docs/research/competitors-national.md`, `docs/research/abc-flowers-page-inventory.csv`.

**internetflorist.biz**
- https://www.internetflorist.biz/robots.txt
- https://www.internetflorist.biz/sitemap.xml
- https://www.internetflorist.biz/en/sitemap-pages.xml
- https://www.internetflorist.biz/en/sitemap-cities/poland/ (Firecrawl)
- https://www.internetflorist.biz/en/sitemap-products/poland/ (Firecrawl)
- https://www.internetflorist.biz/en/florist-poland/send-flowers-zwierzynek/ (Firecrawl)
- Blocked to curl: `/en/sitemap-cities/*`, `/en/sitemap-products/*`, `sitemap-cities/germany` (Bunny Shield)

**1800flowers.com**
- https://www.1800flowers.com/robots.txt
- https://www.1800flowers.com/sitemap.xml and its 8 children (sitemap-static, -collection, -products, -marketplace-collections, -marketplace-products, -productsimage, -templates, local/sitemap.xml)

**floraqueen.com**
- https://www.floraqueen.com/robots.txt
- https://www.floraqueen.com/sitemap.xml and its 10 children
- https://www.floraqueen.com/collections/flowers-poland
- https://www.floraqueen.com/collections/flowers-warsaw

**interflora.co.uk**
- https://www.interflora.co.uk/robots.txt
- https://www.interflora.co.uk/sitemap-index.xml and its 5 children (product-, blog-, location-, international-sitemap.xml, sitemap.xml)
- https://www.interflora.co.uk/category/international/poland
- https://www.interflora.co.uk/flower-delivery/aberdeenshire
- https://www.interflora.co.uk/flower-delivery/aberdeenshire/blackburn
- https://www.interflora.co.uk/flower-delivery/aberdeenshire/huntly
- https://www.interflora.co.uk/flower-delivery/east-sussex/eastbourne
- https://www.interflora.co.uk/flower-delivery/leicestershire/market-harborough
- https://www.interflora.co.uk/flower-delivery/surrey/epsom
- https://www.interflora.co.uk/flower-delivery/greater-london (404, not in sitemap)

**Euroflorist**
- https://www.euroflorist.de/robots.txt
- https://www.euroflorist.de/sitemap.xml (Cloudflare challenge, blocked)
- https://www.euroflorist.pl/sitemap.xml
- https://www.euroflorist.pl/lokalne-kwiaciarnie/krakow
- https://www.euroflorist.pl/lokalne-kwiaciarnie/augustow
- https://www.euroflorist.pl/opieka-nad-grobami-w-polsce
- https://www.euroflorist.pl/en/international/germany

**Fleurop**
- https://www.fleurop.de/robots.txt
- https://www.fleurop.de/sitemap.xml and its 7 children under /seo/sitemaps/
- https://www.fleurop.de/fleurop-international/sitemap.xml and its 4 children
- https://www.fleurop.de/fleurop-international/blumen-nach-polen-schicken
- https://www.fleurop.de/fleurop-international
- https://www.fleurop.de/blumenversand-deutschland/blumen-verschicken-berlin
- https://www.fleurop.de/partnerfloristen/fleurop-filialen/76689-karlsdorf-neuthard/gaertnerei-geissler-kirchstr-86
- https://fleurop.com/robots.txt
- https://fleurop.com/sitemap/en_sitemap.xml and its children
- https://fleurop.com/sitemap/de_sitemap.xml and its children
- https://fleurop.com/en/country/europe/more-in-europe/delivery-to-pl
- https://fleurop.com/en/country/europe/delivery-to-pl (404)
- https://fleurop.com/en/12-roses-long-stemmed-to-poland-12rl
- https://fleurop.com/en/delete-1-1000007117

**Bloom & Wild**
- https://www.bloomandwild.com/robots.txt (403 to curl)
- https://www.bloomandwild.com/en-gb-pages.xml (Firecrawl)

**FTD**
- https://www.ftd.com/robots.txt
- https://www.ftd.com/sitemap.xml
- https://www.ftd.com/sitemap-international.xml (all via Firecrawl; curl failed)

**Teleflora**
- https://www.teleflora.com/robots.txt
- https://www.teleflora.com/sitemap.xml (Firecrawl; curl 403)

**direct2florist**
- https://www.direct2florist.co.uk/robots.txt
- https://www.direct2florist.co.uk/sitemap_index.xml and its 5 children
- https://www.direct2florist.co.uk/poland/
- https://pl.direct2florist.com/robots.txt
- https://pl.direct2florist.com/sitemap_index.xml and its 5 children
- https://pl.direct2florist.com/anniversary-flowers/1st-anniversary/

**myglobalflowers**
- https://myglobalflowers.com/robots.txt
- https://myglobalflowers.com/sitemap.xml
- https://myglobalflowers.com/sitemap_general.xml
- https://myglobalflowers.com/sitemap_products.xml
- https://myglobalflowers.com/international-flower-delivery/poland
- https://myglobalflowers.com/international-flower-delivery/poland/krakow

**Not fetched**
- https://www.flowers4poland.com/robots.txt (403)
- floweradvisor.com (connection failed)

**Searches** (Firecrawl search, 2026-10-03)
- Location United Kingdom:
  - "send flowers to poland"
  - "flower delivery germany"
  - "mother's day flowers poland"
  - "sympathy flowers delivery uk"
  - "funeral flowers poland delivery"
  - "flower delivery warsaw"
  - "kwiaty do polski z anglii wysyłka"
  - "flowers on a grave in poland all saints day order from abroad"
  - "when is mother's day in poland"
  - "same day flower delivery poland"
- Location Poland: "kwiaty na grób zamów online z zagranicy znicze dostawa na cmentarz"
- Location Germany: "Blumen nach Polen schicken Muttertag"

The raw sitemap extracts and the counting scripts were kept outside the repository and are not committed.
