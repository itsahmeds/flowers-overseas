# TASK-068 — Availability, the date seams, price history and quotes: `availability.ts` (`availability()` data-derived, `CutoffEvaluator` + `CapacityProvider` declarations, `staticCutoffEvaluator`), `pricing/history.ts` (`lowestPriceInLast30Days`), `pricing/quote.ts` (`quote`, `verifyQuote`), and `isProductIndexable()`

Row: `TASKS.md` → TASK-068. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-068-availability-history-quote`. Spec 005 §13's 2026-09-09 resolution note is binding: Q1 EUR/GBP `x90`, PLN `x9`, HUF `x90`; Q2 ECB daily rates, 2.5% buffer, 48 h max age then destination currency; Q3 add-ons priced per country with their own VAT rate; Q4 plain stem-count / S-M-L / single tier names; Q5 30-minute signed quote, secret lands in spec 010; Q6 middle tier preselected via `product_tier.is_default`; Q7 surcharges as dated rows; Q8 all three schema amendments folded into spec 002's `0003` (spec 002 §14 A1); Q9 this spec owns the dataset in `src/config/catalogue/*.data.ts`; Q10 no money on destination-less hubs; Q11 EUR/GBP/PLN only behind `currency.{code}` flags. **AC-20 is the data-flip proof**: `country.status = 'demo'` gives `saleable: false` + `reasonKey = "country.demo"` and no `Offer`; flipping the fixture country to `live` with an active price and one covering partner gives `InStock` / `saleable: true` **with no code change** (`CLAUDE.md`: country go-live is a data flip). **AC-21 is the SEO keystone**: `isProductIndexable()` is `true` only when all six hold (live country, active product, active price row, non-null description in that locale, `reviewed` translation, `isLocaleIndexable(locale)`), and the sitemap-membership query and the robots decision **call the same function** — a single-call-site test, which is what makes "a `noindex` product can never appear in a sitemap" structural (`plan/02` §10). **005 owns no calendar**: `CutoffEvaluator` and `CapacityProvider` are declared with the types spec 009 and 024/031 implement, plus a test-grade static evaluator; no date arithmetic, no holiday evaluation and no occasion-date rule may land here (§3, `plan/03` §9/§10). `lowestPriceInLast30Days` is the Omnibus Art. 6a figure over superseded rows, inclusive of the window's first day — no "was/now" UI ships, and none may be added without this number (AC-14). `quote()` is stateless: HMAC over the quote fields, **no PII** (product ids, tier keys, integer amounts, currency, rate, expiry only — key-set equality test), 30-minute expiry per §13 Q5, and `QUOTE_SIGNING_SECRET` **lands in spec 010's env schema, not here** — Phase 0 uses a test secret and adds no `.env.example` key. `verifyQuote` is constant-time on the digest and returns `expired | tampered | ok`, never `ok` for an unresolvable `priceVersion`; on `expired` the caller re-derives and shows the new price for explicit re-confirmation — a silently higher charge is not reachable through this API. Gates: `lint`, `typecheck`, `test-unit`, `catalogue-check`, `check:no-db`. Tests: T-12, T-15, T-18, T-19.

## Read

- `specs/005-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `src/config/catalogue/*.data.ts`
- `plan/02`
- `plan/03`

## Carry-forwards

- **From `/review 52` (TASK-067):** in the stale-FX fallback `offerProjection().priceCurrency` is the destination currency, not the locale default — the price identity holds (right trade) but AC-11's literal wording does not; declare it (spec 005 §14 A3 records it) and test it with a stale snapshot fixture; `priceValidUntil` is always `activeTo` and ignores §6's "or the FX snapshot's validity where a conversion is involved" — converted offers must carry the earlier of the two; fill `PriceProjection.availability` through the `{ inStock }` seam TASK-067 left.

## Escalations

_None recorded._

## Result

Done. PR [#54](https://github.com/itsahmeds/flowers-overseas/pull/54); `/review` pass recorded in `TASKS.md`.
