# TASK-453 — Spec 046 Google feed: `seo/merchant` serializer and schemas, `catalog/merchantFeed.ts` (`eligibleFeedKeys`, `buildGoogleFeed`, `previewGoogleFeed`, the eleven-term predicate, the attribute mapping), `GET /feeds/google/{feedKey}.xml`, cache tags, flag `merchant.google_feed`, robots allowance for Googlebot and Storebot-Google, `srsltid` and `utm_*` parity

Row: `TASKS.md` → TASK-453. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-453`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 046 approved by the founder 2026-10-24 ("specs ok", every open-question default: destination-country targeting only, native-currency locales only, real photographs only, default size only, public feed URL).
- **Owns** AC-1 to AC-17, AC-19, AC-20, AC-25 (tests per §10's table).
- **One projection:** `buildGoogleFeed` calls `productView()` and `productOfferNode()` for each product priced in the country (the pattern of `src/modules/catalog/productSchema.ts`), so feed price = `Offer.price` = visible price = charged price; nothing typed by hand. `eligibleFeedKeys()` returns only live countries times launch locales whose default currency is the destination's (Poland: `pl-pl` only).
- **The predicate** in §5.2's order, first failing term is the reason code; terms 1 to 3 (flag, `isIndexingEnvironment`, real checkout) empty the whole feed; term 4 uses spec 012b's `existsNow` (TASK-295). `previewGoogleFeed` is reachable from admin only (no parameter or header on the public route).
- **Route** `src/app/feeds/google/[feedKey]/route.ts`: thin; 404 on a malformed or ineligible key; `application/xml; charset=utf-8`, `X-Robots-Tag: noindex`, `Cache-Control: public, s-maxage=3600`. `googleFeedXml` escapes every text node, no CDATA. `src/lib/cache.ts` `urlsForTag('catalog:{iso2}')` and `urlsForTag('sitemap')` include the feed URLs. Flag `merchant.google_feed` in `src/config/feature-flags.ts` (country scope, `dirties: ["catalog"]`), seeded off.
- **Crawlers:** in the indexing environment `robots.txt` allows `Googlebot` and `Storebot-Google` on product paths, with `?srsltid=`, and on `/feeds/google/`; a product URL with `srsltid` or `utm_*` renders the same canonical, robots, visible price and JSON-LD (AC-19). `src/config/url-keys.ts` stays unchanged. No sitemap lists `/feeds/`.
- **Images:** real photographs only (`photo` or `partner`, approved, both sides at least 800 px); AI images exclude the item (§13 Q3). No public message key is added. If the buy section has no stable price hook, add `data-price` only (no visible change).
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/046-google-merchant-feed.md`: `## 0. Index` first, then §2, §5 and the owned ACs
- `src/modules/catalog/product.ts`, `productSchema.ts`, `src/modules/seo/indexability.ts`, `src/lib/cache.ts`, `src/app/robots.ts`, `src/config/feature-flags.ts`
- `docs/codebase-map.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
