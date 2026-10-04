# Runbook — Prices: setting, superseding, reading and purging

| Field         | Value                                                              |
| ------------- | ------------------------------------------------------------------ |
| Severity      | P2 (a wrong price is a consumer-law problem, not only a bug)        |
| Detect        | `pnpm catalogue:check`, the `warn` signals below, a founder request |
| Owner         | founder                                                             |
| Owning spec   | 005 (`specs/005-catalogue-pricing-module.md`)                       |
| Last tested   | — (fill at the Phase 1 gate)                                        |

Everything here is Phase 0's reality: **the catalogue is committed code**
(`src/config/catalogue/*.data.ts`), there is no database and no admin screen, so every price
change is a reviewed pull request. Spec 002's tables and spec 012's admin take the same actions
over rows later; the *rules* below do not change when they do, which is why they are written as
rules and not as clicks.

The one sentence that governs the rest: **the price shown is the price charged**, VAT and delivery
included, integer minor units, and the price in the `Offer` schema is the price on the page to the
cent (`CLAUDE.md`; `plan/07` §4; Price Indication Directive, CRD as amended by Omnibus, UK DMCC).

## 1. How a price is set

1. Find the destination's record in `src/config/catalogue/prices.data.ts` (`DESTINATION_PRICING`).
   It carries the currency, the VAT rate on flowers, the standard rate its add-ons take, the
   `plan/10` §2.3 bands, the authored tier ladder per band, the two surcharge amounts and the six
   add-on prices. A retail row is **expanded from the ladder**, never typed twice.
2. Amounts are integer minor units (`14_900` is 149 zł), VAT- and delivery-inclusive, and must land
   on the currency's psychological ending — EUR/GBP `x90`, PLN `x9`, HUF `x90` (spec 005 §13 Q1,
   `src/config/currencies.ts`). No float, anywhere, ever (`fo/no-float-money`).
3. Every tier of every product sits **inside its band** in every currency. The band is exact; the
   "~+30% / +60%" tier steps bend to fit it (spec 005 §14 A1).
4. Run `pnpm catalogue:check`. It refuses an out-of-band amount, a wrong ending, a float, a second
   active row, a missing row, a surcharge that disagrees with the destination's figure, a
   surcharge row whose VAT rate differs from the retail row's, an unknown facet, a missing message
   key and a projection whose columns have drifted from spec 002 §5.1.
5. Purge the cache tags of §6 (nothing to do in Phase 0 — no page renders a price yet).

## 2. How a price is superseded

**A price is never updated in place.** A correction is two edits in one commit:

- the outgoing row gets an `activeTo` (the first day the new price applies — the bound is
  exclusive);
- a new row is added with `activeFrom` on that same day and `activeTo: null`.

Two consequences make this non-negotiable rather than a style:

- **Omnibus Art. 6a.** The 30-day-lowest figure (§5) is derived from superseded rows. An in-place
  edit erases the history that makes a "was/now" claim lawful, and there is no way to reconstruct
  it.
- **A quote must stay refusable.** `PricePoint.priceVersion` is keyed on the row's natural key and
  its `activeFrom`, so an in-place amount edit leaves the version **unchanged** and a stale quote
  would still resolve (`/review 47`). The signed *amount* is what makes such a quote refusable —
  spec 010's checkout compares the amount, never the version alone.

Exactly one row per (product, country, tier, surcharge) may be open-ended; `catalogue:check`'s
`ambiguous-price` mode and spec 002's partial unique index both refuse a second one, and
`resolvePrice()` throws rather than picking.

## 3. How to read a `PricePoint`

`resolvePrice({ productId, tierKey, countryIso, deliveryDate? })` returns the whole price and there
is no variant of it that returns less (spec 005 AC-8):

| Field                                | Reading                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `amountMinor` + `currency`           | **what the buyer pays**, in the destination's own currency: VAT in, delivery in, the date's surcharges already added |
| `vatRateBp`                          | the destination's rate on flowers, integer basis points (PL 800 = 8%)                    |
| `netAmountMinor` + `vatAmountMinor`  | the split of `amountMinor`; the schema refuses a row where they do not sum to it         |
| `deliveryIncluded`                   | the literal `true` — the type cannot express a partial price                             |
| `surcharges[]`                       | the rows that were added, each with its amount, window and message key                   |
| `activeFrom` / `activeTo`            | the window the row is authoritative for; `activeTo: null` is the current row             |
| `priceVersion`                       | opaque outside `src/modules/catalog`. Never parse it; hand it back to `verifyQuote()`     |

A display price is a different question: `priceProjection(locale, …)` converts to the **locale's**
default currency (never a cookie, never a header — that is what keeps cached HTML identical for
everyone) and stamps `fxAsOf` and `ratePpm` on the result. `offerProjection()` reads that same
projection, which is why the JSON-LD and the HTML cannot disagree.

## 4. What happens when FX is stale

- The committed snapshot in `src/config/catalogue/fx.data.ts` is dated, euro-base and integer
  (`ratePpm`), and is the ECB's own publication for `FX_SNAPSHOT_AS_OF` (2026-09-08), pinned row by
  row to `tests/fixtures/fx/ecb-eurofxref-2026-09-08.xml` (spec 005 §14 A7 Corrected 1, AC-29).
  Conversion applies the 2.5% buffer (`FX_BUFFER_BP = 250`) and rounds **up** onto the target
  currency's ending.
- **Age counts Monday-to-Friday only** (A7 Corrected 5, AC-35): `MAX_FX_AGE_HOURS` (48) is still
  the bound, with Saturday and Sunday not counted. A rate dated D is stale at every
  instant after 00:00Z on the **second Monday-to-Friday day after D**: Mon → Wed, Tue → Thu,
  Wed → Fri, Thu → Mon, Fri → Tue, Sat/Sun → Tue. Friday's rate holds through the weekend. Weekday
  TARGET holidays (Good Friday, Easter Monday, 1 May, 25–26 Dec, 1 Jan) **count**, so a weekday
  with no publication fails closed visibly. The rule has one home, `fxRateStaleAfter()` in
  `fx.data.ts`; `isRateStale()` / `rateValidUntil()` in `pricing/fx.ts` and the
  `pnpm catalogue:check` report read it.
- Past that instant the module **fails closed**: `fxRateFor()` returns `null`, the projection
  falls back to the **destination's own currency**, carries `catalog.availability.fxUnavailable`,
  the equivalents line is hidden, and no converted amount appears anywhere in the output. The
  single `Offer` carries the same currency and the same figure (spec 005 §14 A3): the price
  identity is the invariant, the locale-default currency is only the preference.
- `Offer.priceValidUntil` is the price row's `active_to` or absent; it never comes from the rate
  (A7 Corrected 7, T-36).
- It is logged **once per process per stale `fx_as_of`** as a `warn` with a Sentry message
  (`catalog.fx_stale`; A7 Corrected 4, AC-32): one line per instance or build worker per stale
  date, none while the rate is fresh.
- **Recovery:** a successful build (§4.1: let the weekday job run, or run it by hand), then purge
  `catalog:{iso}` for every live destination (§6).

Expected fail-closed windows with the weekday rebuild job (§4.1) running:

| Situation | Rate served | Fails closed (destination currency, equivalents hidden) |
|---|---|---|
| Weekday D, 15:30Z run succeeds | D | never |
| Every weekend | Friday | never (fresh until Tue 00:00Z) |
| Both runs fail on weekday D (Mon–Thu) | the weekday before D | next weekday 00:00Z to ~15:45Z (~16 h) |
| Both Friday runs fail | Thursday | Mon 00:00Z to Mon ~15:45Z (~16 h) |
| Monday's runs fail | Friday | Tue 00:00Z to Tue ~15:45Z (~16 h) |
| One weekday TARGET holiday (1 May, 1 Jan, a lone 25 or 26 Dec) | the weekday before | the weekday after the holiday, 00:00Z to ~15:45Z (~16 h) |
| Easter (Good Friday and Easter Monday) | Thursday | Mon 00:00Z to Tue ~15:45Z (~40 h) |
| 25–26 Dec on Thursday–Friday | Wednesday | Fri 00:00Z to Mon ~15:45Z (~88 h) |
| A merge, promotion or scheduled rebuild whose fetch fails | committed (2026-09-08) | until the next scheduled run that sees it: that weekday's 15:30Z or 19:30Z, otherwise the next weekday's 15:30Z |
| Production during a rollback (spec 040 A3 change 4) | whatever the restored image carries | the job skips production until `release:rollback` has run; the restored image fails closed once its rate passes the bound |

### 4.1 Where the rate comes from, and how to refresh it

- **Every build fetches the day's rate** (spec 005 §14 A7 Corrected 2). `pnpm build`
  (`scripts/build.ts`) runs `scripts/fx-snapshot.ts` first: one `GET` of the ECB daily file, one
  retry, 10 s each, validated (date ≤ build date and ≤ 5 days old, every committed currency once,
  ≤ 6 decimals, within ±15% of the committed row). Pass: the build bundles it. Any failure: the
  build bundles the **whole** committed snapshot and still succeeds. Either way the build log
  carries one line: `{"msg":"fx.snapshot","source":…,"fx_as_of":…,"reason":…}`.
- **Read which rate is live** on `/api/health`: `fxAsOf` is the rate's date, `fxSource` is
  `ecb-build` (this build fetched it) or `committed` (the fetch failed, or the build was CI's;
  `reason` in the build log says why). `committed` on staging or production is a problem: the
  site is failing closed (destination currency only) until the next successful build.
- **The weekday job** `.github/workflows/fx-refresh.yml` runs Mon–Fri at 15:30 and 19:30 UTC. For
  `staging` and `production` it reads `/api/health` and, where `fxAsOf` is older than the ECB file,
  asks Railway for a new build of `web` **at the commit that environment already runs**, with the
  `Dockerfile`'s `FX_REFRESH_AT` build arg set to the run's timestamp so the build cannot be a
  layer-cache hit. Production is skipped while its commit is not the `release` tip (a promotion or
  rollback in flight). The 19:30 run exits red naming any environment still behind: that email is
  the signal to look at the build log's `fx.snapshot` line.
- **Inputs the job needs, set by the founder** (Settings → Secrets and variables → Actions): the
  secrets `RAILWAY_TOKEN_STAGING` and `RAILWAY_TOKEN_PRODUCTION` (Railway project tokens, one per
  environment) and the variables `FX_REFRESH_STAGING_URL` and `FX_REFRESH_PRODUCTION_URL` (each
  environment's base URL, no trailing `/api/health`). A missing one fails the run and names it.
- **`FX_REFRESH_AT` on `web`**: the job sets it on staging and production before each rebuild.
  `pnpm railway:check` accepts it there as an optional key (it is not part of the env contract);
  leave it alone (`docs/runbooks/railway-cloudflare-setup.md`).
- **Manual trigger:** Actions → **fx-refresh** → *Run workflow* (tick `verify` to get the 19:30
  behaviour). This is not the CI workflow, so CLAUDE.md's ban on dispatching it does not apply.
- **CI's builds do not fetch**: `ci.yml` and `visual-baselines.yml` set `FX_SNAPSHOT_FETCH=off`, so
  the browser suites see one stable state (the committed snapshot's fallback) instead of a rate
  that moves every weekday. A Railway build cannot receive that switch (the `Dockerfile` has no
  `ARG` for it).
- **Exit:** TASK-071 deletes the build-time fetch and the workflow when the database FX provider
  goes live (A7 Corrected 6).

Two sibling signals, same shape and same reason — each silently produces a wrong price if nobody
looks: `catalog.price_missing` (a live page asked for a (product, country, tier) with no active
row) and `catalog.price_ambiguous` (more than one active row, which should be impossible under
spec 002's index and therefore means a migration or a seed defect).

Every one of those lines carries at most `{ sku, tier_key, country_iso, currency, fx_as_of,
duration_ms, request_id }` — no buyer, no recipient, no address, no basket, **no quote digest**
(spec 005 §8; asserted by `tests/unit/catalog-logging.test.ts`).

## 5. How the 30-day-lowest figure is produced

`lowestPriceInLast30Days(productId, tierKey, countryIso, asOf)` walks the price history for that
(product, tier, destination) and returns the lowest amount that was **active at any point** in the
30 days ending at `asOf`, the first day of the window included. With no cheaper superseded row it
returns today's price. It exists so that a reduction can be announced lawfully (Omnibus Art. 6a) —
**no "was/now" UI ships in Phase 0 and none may be added without this number on the page it
appears on.**

## 6. Mutation → cache tag map

`cacheTagsFor()` (`src/modules/catalog/cache.ts`) is the **only** builder of these names; nothing
else in `src/` may spell one (a unit test scans for it). Spec 005 calls `invalidate()` nowhere —
the callers are spec 012's admin edit, spec 007/008's pages and TASK-071's `fx.refresh`, and this
is the map they inherit rather than guess (`plan/01` §3):

| Mutation                                             | Call                                                       | Tags purged                         |
| ---------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------- |
| A product's data changed (name, facets, status, media) | `cacheTagsFor({ kind: "product", productId })`             | `product:{id}`                      |
| A price row superseded for one product in one country  | `cacheTagsFor({ kind: "price", productId, countryIso })`   | `catalog:{iso}`, `product:{id}`     |
| Everything priced in a country moved (FX refresh, VAT change, a peak-day row added) | `cacheTagsFor({ kind: "catalog", countryIso })` | `catalog:{iso}`                     |
| A destination's `status` flipped (`demo` → `live`)     | `cacheTagsFor({ kind: "country", countryIso })`            | `catalog:{iso}`, `country:{iso}`    |

Then `invalidate(tags)` through `src/lib/cache.ts` — the one hosting-portable seam (`revalidateTag`
on Vercel, purge-by-tag on Cloudflare; ADR-0012). A country flip also regenerates the sitemap
(ADR-0007).

## 7. Checklist for changing a band

A band is the founder's stated price range for a product class (`plan/10` §2.3). Widening one to
make a ladder fit is the failure mode this checklist exists to prevent.

1. **Is it a band change or a ladder change?** Moving a tier inside its band is §1. Only a change
   to the range itself is this section.
2. Raising or lowering a band ceiling or floor is a **founder decision**, recorded in `plan/13` and
   in spec 005 §14 — never a data edit made to turn a test green (spec 005 §14 A1).
3. Edit the band in `DESTINATION_PRICING` **and** the independent transcription of `plan/10` §2.3
   in `scripts/catalogue-check.ts` (`PLAN_10_BANDS`). They are two copies on purpose: the gate
   compares the dataset against a transcription of the plan, so editing only one of them fails.
4. Re-author every ladder in the band so all three tiers sit inside it, strictly increasing, on the
   currency's ending.
5. `pnpm catalogue:check` (modes `band`, `rounding-ending`, `float-money`), then `pnpm test`.
6. Supersede the affected retail rows per §2 — do not edit amounts in place.
7. Purge `catalog:{iso}` for the destination (§6).

## 8. Dated items

| When                       | What                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| By **1 Dec 2026**          | Add the **2027/28 peak-day rows**. `PEAK_DAYS` in `prices.data.ts` carries 2027 only (Valentine's 14 Feb, Women's Day 8 Mar); a peak day with no row is charged as an ordinary day and the date chip shows no surcharge (spec 005 §13 Q7's accepted cost). Add Mother's Days per country as their dates are confirmed. |
| Before the first live sale | Confirm the six provisional destination VAT rates with the accountant (`docs/compliance/vat-rates.md`) — PL is the only rate in use today. |
| When spec 010 ships        | `QUOTE_SIGNING_SECRET` moves from the development constant to the env store; a quote signed with the development secret must stop verifying. |
| When spec 002 unparks      | The dataset stops being the source: the projections in `src/config/catalogue/projections.ts` seed the tables, and this runbook's edits become admin actions with an audit-log row. |

## 9. Related

- `docs/runbooks/peak-day.md` — running a peak day (capacity, freeze window, on-call).
- `docs/compliance/vat-rates.md` — the rate per destination and its provenance.
- `specs/005-catalogue-pricing-module.md` §2, §5.2, §8, §11 — the rules above, with their sources.
