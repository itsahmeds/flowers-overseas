/**
 * Projections and the price identity (spec 005 §5.2 `pricing/project.ts`, §6, §7, AC-9, AC-10,
 * AC-11, AC-22; TASK-067).
 *
 * The seam between *what a price is* — `resolvePrice()`'s whole `PricePoint` in the destination
 * country's own currency — and *what a buyer sees*, which is the same amount presented in the
 * locale's currency. Everything a price-bearing page renders and everything spec 007 publishes as
 * structured data comes from the one view model built here, and that is not a convenience: it is
 * how `plan/02` §15's "structured data ≠ visible content" manual-action risk is discharged by
 * construction rather than by a validator run after the fact.
 *
 * Five properties, each of which is a rule rather than a preference:
 *
 *  1. **The display currency is the locale's, never the cookie's** (§7, AC-9). `priceProjection()`
 *     takes a `LocaleCode` and reads its `currencyDefault`. No exported function here accepts a
 *     display-currency override except `priceTable()`, which does not *choose* a currency at all —
 *     it enumerates every one we may display. That is what lets a price-bearing page be cached
 *     once per (locale, destination) with no `Vary`: the `fo_currency` cookie is read by spec
 *     008's repaint island, on the client, over identical HTML (`plan/02` §3, `plan/03` §1). This
 *     file reads no cookie, no header and no environment variable, and a test asserts that the
 *     same (product, country, locale) yields a **byte-identical** projection whatever
 *     `fo_currency` is set to in the environment.
 *  2. **The offer is derived from the projection, not from a second read** (AC-11).
 *     `offerProjection()` takes the `PriceProjection` the page rendered and turns its
 *     `displayPrice` into `Offer.price` at the currency's exponent, through the same
 *     digit-shifting `formatMoney` uses (`moneyDecimalString`). There is no path by which the
 *     JSON-LD and the HTML can carry different numbers, because there is only one number.
 *  3. **Exactly one offer, and none for a country that is not live** (ADR-0007, AC-11).
 *     `offerProjection()` returns `null` for a `demo` or `disabled` destination — an `Offer`
 *     describing a purchase nobody can make is the misleading structured data `plan/02` §9 warns
 *     about — and a caller has one projection per PDP to build one offer from.
 *  4. **A conversion carries its provenance, or does not happen** (§5.4, §13 Q2, AC-15). The
 *     `converted` variant stamps `fxAsOf` and `ratePpm` into the projection; the `unavailable`
 *     variant makes the projection fall back to the **destination country's own currency** and
 *     say so with `catalog.availability.fxUnavailable`. There is no state in which a converted
 *     amount appears without the rate that produced it, and no stale rate ever becomes a price.
 *  5. **No `Intl` object is constructed here** (§7, `fo/no-adhoc-intl`). The VAT rate goes through
 *     `formatPercentFromBasisPoints` and money through `formatMoney` / `moneyDecimalString`, all
 *     of them spec 003's; nothing in this file concatenates a price, a percentage or a count, and
 *     every label is a `catalog.*` message key that `messages/en.json` has (AC-22).
 *
 * **Zero client JavaScript** (AC-3, AC-22): this module is server-only, nothing under `app/` and
 * no client component imports it, and `pnpm budget:client-js` measures ±0 B against the committed
 * baseline. The currency-repaint island that consumes `priceTable()` is spec 008's and is paid
 * from spec 008's budget (spec 005 §3).
 */
import { type CountryIso2, countryConfig } from "@/config/countries";
import {
  CURRENCIES,
  type CurrencyCode,
  isCurrencyCode,
} from "@/config/currencies";
import { type LocaleCode, localeConfig } from "@/config/locales";
import {
  formatPercentFromBasisPoints,
  moneyDecimalString,
} from "@/modules/i18n";

import { availability } from "../availability";
import { isFlagEnabled } from "../flags";
import {
  FromPriceProjectionQuerySchema,
  OfferProjectionSchema,
  PriceProjectionQuerySchema,
  PriceProjectionSchema,
  PriceTableQuerySchema,
  PriceTableSchema,
  currencyFlagKey,
} from "../schemas";
import {
  type CatalogAvailabilityKey,
  type IntegerMoney,
  type IsoDate,
  type OfferAvailability,
  type PriceProjection,
  type PricePoint,
  type PriceTable,
  type OfferProjection,
  catalogAvailabilityKeys,
} from "../types";

import { convertForDisplay, rateValidUntil } from "./fx";
import { fromPrice, resolvePrice, tierPrices } from "./resolve";

/**
 * The VAT-and-delivery wording key (`plan/07` §4, `plan/02` §13, spec 005 §7).
 *
 * A **legal formula per locale**, not a translation: "incl. VAT and delivery", "inkl. MwSt. und
 * Versand", "w tym VAT i dostawa" are authored per language because the phrasing is prescribed in
 * DE and PL, which is why the `de` and `pl` values are hand-authored rather than machine-drafted.
 * Every projection carries the key, so a price can never be printed without the formula beside
 * it.
 */
const PRICE_INCLUSIVE_KEY = "catalog.price.inclusive" as const;

/**
 * The "from £34" wording key, with `{price}` interpolated — never concatenated (spec 005 §7).
 *
 * Exported because the only caller that may use it is the one rendering a `fromPriceProjection()`
 * on a country-scoped category card, and it should read the key from the projection's own module
 * rather than retype the string (a from-price is visible text and emits **no** `Offer`, §6).
 */
export const FROM_PRICE_LABEL_KEY = "catalog.price.from" as const;

/**
 * Schema.org's availability URLs, paired with the message key for the **visible** line, so the
 * words a buyer reads and the value Google reads are chosen in one place (spec 005 §6, §7).
 */
const AVAILABILITY: Readonly<
  Record<
    "inStock" | "outOfStock",
    {
      readonly url: OfferAvailability;
      readonly key: CatalogAvailabilityKey;
    }
  >
> = {
  inStock: {
    url: "https://schema.org/InStock",
    key: catalogAvailabilityKeys.inStock,
  },
  outOfStock: {
    url: "https://schema.org/OutOfStock",
    key: catalogAvailabilityKeys.outOfStock,
  },
};

/**
 * The perishable-goods return position, as the value spec 007's `MerchantReturnPolicy` node
 * carries (CRD Art. 16(d), UK CCRs reg. 28(1)(c), `plan/07` §2.1).
 *
 * Cut flowers are exempt from the right of withdrawal, the PDP and the pay page disclose that in
 * words (specs 009/010), and this constant is how the structured data agrees with the disclosure
 * instead of contradicting it.
 */
const RETURN_POLICY =
  "https://schema.org/MerchantReturnNotPermitted" as const satisfies OfferProjection["hasMerchantReturnPolicy"];

/* -------------------------------------------------------------------------- */
/* The display currency: the locale's default, and nothing else.              */
/* -------------------------------------------------------------------------- */

/**
 * The currency a locale displays prices in — `en-gb` → `GBP`, `pl` → `PLN`, everything else `EUR`
 * (spec 005 §7, AC-9).
 *
 * The single reader of `LocaleConfig.currencyDefault` in this module, and deliberately **not**
 * exported: a caller that could ask for "the display currency of locale X" would be one step from
 * asking for "the display currency of cookie Y". Callers ask for a projection and are given one
 * in the right currency.
 */
function displayCurrencyFor(locale: LocaleCode): CurrencyCode {
  const { currencyDefault } = localeConfig(locale);
  if (!isCurrencyCode(currencyDefault)) {
    throw new Error(
      `locale \`${locale}\` names \`${currencyDefault}\` as its default currency, which \`src/config/currencies.ts\` does not configure`,
    );
  }
  return currencyDefault;
}

/**
 * The earlier of two validity dates, treating `null` as "no end at all" (spec 005 §6, §14 A3).
 *
 * A current price row has `activeTo === null` and never expires on its own; an FX snapshot always
 * does. So `null` loses to any date, and two dates resolve to the smaller — `YYYY-MM-DD` strings
 * sort chronologically, so this is a comparison and not date arithmetic.
 */
function earlierDay(
  left: IsoDate | null,
  right: IsoDate | null,
): IsoDate | null {
  if (left === null) return right;
  if (right === null) return left;
  return left < right ? left : right;
}

/* -------------------------------------------------------------------------- */
/* The view model.                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Turn a whole destination-currency price into the one view model a page renders and spec 007
 * publishes (spec 005 §5.2 `PriceProjectionSchema`).
 *
 * Internal, because every exported entry point below funnels through it: one projection shape,
 * built one way, from one `PricePoint`.
 */
async function projectionOf(
  price: PricePoint,
  productId: string,
  locale: LocaleCode,
  countryIso: CountryIso2,
  now: Date,
): Promise<PriceProjection> {
  const destinationCurrencyPrice: IntegerMoney = {
    amountMinor: price.amountMinor,
    currency: price.currency,
  };
  const conversion = await convertForDisplay(
    destinationCurrencyPrice,
    displayCurrencyFor(locale),
    now,
  );

  const base = {
    displayLocale: locale,
    destinationCountry: countryIso,
    destinationCurrencyPrice,
    vatRateBp: price.vatRateBp,
    vatRateText: formatPercentFromBasisPoints(price.vatRateBp, locale),
    vatLabelKey: PRICE_INCLUSIVE_KEY,
    deliveryIncluded: true,
    surcharges: price.surcharges,
    priceVersion: price.priceVersion,
    availability: await availability({ productId, countryIso }),
  } as const;

  // The three FX outcomes, each producing exactly the fields §5.4 allows it to: a native amount
  // has no rate to state, a converted one states both halves of its provenance, and a stale one
  // states the destination currency and the reason it is doing so (§13 Q2, AC-15).
  const projection =
    conversion.status === "native"
      ? {
          ...base,
          displayPrice: conversion.price,
          priceValidUntil: price.activeTo,
        }
      : conversion.status === "converted"
        ? {
            ...base,
            displayPrice: conversion.price,
            fxAsOf: conversion.rate.asOf,
            ratePpm: conversion.rate.ratePpm,
            // §6, §14 A3: a converted price is only the price for as long as its rate is usable,
            // so the offer's validity is the **earlier** of the row's `active_to` and the
            // snapshot's own last usable day. `null` (a current row) never wins over a date.
            priceValidUntil: earlierDay(
              price.activeTo,
              rateValidUntil(conversion.rate.asOf),
            ),
          }
        : {
            ...base,
            displayPrice: destinationCurrencyPrice,
            fxReasonKey: conversion.reasonKey,
            // Nothing was converted: the fallback shows the destination's own authored price, so
            // no FX validity bounds it (§14 A3 — the destination currency and the same figure).
            priceValidUntil: price.activeTo,
          };

  return PriceProjectionSchema.parse(projection);
}

/**
 * The price of one tier of one product, to one destination, on one date, as the buyer's locale
 * displays it (spec 005 §5.2, §7, AC-9, AC-10).
 *
 * The locale decides the currency and nothing else does. `deliveryDate` selects the dated
 * surcharge rows, exactly as `resolvePrice()` does — the amount projected is the whole all-in
 * price, VAT and delivery included, surcharges inside it, because a projection of a partial price
 * is not representable (AC-8).
 *
 * Throws, rather than returning a fake amount, when the (product, tier, destination) has no
 * active price or more than one: a page with no resolvable price must not render a buy path
 * (§5.3).
 */
export async function priceProjection(
  locale: LocaleCode,
  query: {
    readonly productId: string;
    readonly tierKey: string;
    readonly countryIso: CountryIso2;
    readonly deliveryDate?: IsoDate;
    readonly now?: Date;
  },
): Promise<PriceProjection> {
  const { productId, tierKey, countryIso, deliveryDate, now } =
    PriceProjectionQuerySchema.parse(query);
  const price = await resolvePrice({
    productId,
    tierKey,
    countryIso,
    ...(deliveryDate === undefined ? {} : { deliveryDate }),
  });
  return projectionOf(price, productId, locale, countryIso, now ?? new Date());
}

/**
 * The cheapest tier's price for a destination, projected into the locale's currency — the "from"
 * figure of a country-scoped category or collection card (spec 005 §6, §13 Q10).
 *
 * The **destination-currency** half of this is `pricing/resolve.ts`'s `fromPrice()`, which
 * TASK-065 shipped and which this wraps; the name differs because the two coexist and mean
 * different things (a `PricePoint` in the destination's currency versus a `PriceProjection` in
 * the locale's). A from-price is rendered as visible text through `catalog.price.from` and emits
 * **no `Offer`**: it is not the price of any purchasable configuration, so publishing it as one
 * would break the price identity (§6). There is no destination-less variant, because a hub with
 * no destination shows no money at all in Phase 0 (§13 Q10).
 */
export async function fromPriceProjection(
  locale: LocaleCode,
  query: {
    readonly productId: string;
    readonly countryIso: CountryIso2;
    readonly now?: Date;
  },
): Promise<PriceProjection> {
  const { productId, countryIso, now } =
    FromPriceProjectionQuerySchema.parse(query);
  const price = await fromPrice({ productId, countryIso });
  return projectionOf(price, productId, locale, countryIso, now ?? new Date());
}

/* -------------------------------------------------------------------------- */
/* The price table: the one place currencies are enumerated (AC-9).           */
/* -------------------------------------------------------------------------- */

/**
 * Every display currency we may show, in `src/config/currencies.ts` order (spec 005 §12, §13 Q11).
 *
 * A currency is displayable when its `currency.{code}` flag is on — EUR, GBP and PLN in Phase 0,
 * the other seven configured and off, because a currency we display and cannot charge breaks the
 * one invariant this spec exists to protect. Turning one on is a flag row, never a code change.
 */
async function enabledDisplayCurrencies(): Promise<readonly CurrencyCode[]> {
  const enabled: CurrencyCode[] = [];
  for (const { code } of CURRENCIES) {
    if (!isCurrencyCode(code)) continue;
    if (await isFlagEnabled(currencyFlagKey(code))) enabled.push(code);
  }
  return enabled;
}

/**
 * The embedded per-tier price table spec 008's currency-repaint island reads (spec 005 §5.2, §6).
 *
 * **The one exception to AC-9**, and the reason it is not a hole in it: this function does not
 * take a currency and does not choose one — it lists the amount in *every* currency we may
 * display, so the HTML is the same for every visitor and a currency switch needs no fetch, no
 * `Vary` and no second render. The rendered price stays `priceProjection()`'s; the table is the
 * repaint's data.
 *
 * One entry per tier, each carrying the destination's own currency plus every enabled display
 * currency for which a usable rate exists. A currency whose rate is too old is **absent** rather
 * than present with a stale number (AC-15), and the size refinement (≤6 currencies, ≤512 B
 * serialised) is enforced by `PriceTableSchema` rather than trusted.
 */
export async function priceTable(query: {
  readonly productId: string;
  readonly countryIso: CountryIso2;
  readonly now?: Date;
}): Promise<readonly PriceTable[]> {
  const { productId, countryIso, now } = PriceTableQuerySchema.parse(query);
  const asOf = now ?? new Date();
  const currencies = await enabledDisplayCurrencies();
  const prices = await tierPrices({ productId, countryIso });

  const tables: PriceTable[] = [];
  for (const tier of prices) {
    const destination: IntegerMoney = {
      amountMinor: tier.price.amountMinor,
      currency: tier.price.currency,
    };
    const entries: Partial<Record<CurrencyCode, number>> = {
      [destination.currency]: destination.amountMinor,
    };
    const rateDates: IsoDate[] = [];

    for (const currency of currencies) {
      const conversion = await convertForDisplay(destination, currency, asOf);
      if (conversion.status === "unavailable") continue;
      entries[currency] = conversion.price.amountMinor;
      if (conversion.status === "converted")
        rateDates.push(conversion.rate.asOf);
    }

    // A table is only as current as its stalest rate, so the oldest publication date is the
    // honest stamp; `null` means nothing in it was converted at all (§5.4).
    const fxAsOf: IsoDate | null =
      rateDates.slice().sort((left, right) => (left < right ? -1 : 1))[0] ??
      null;

    tables.push(
      PriceTableSchema.parse({
        productId,
        tierKey: tier.tierKey,
        fxAsOf,
        entries,
      }),
    );
  }
  return tables;
}

/* -------------------------------------------------------------------------- */
/* The offer: the price identity, and the manual-action guard.                */
/* -------------------------------------------------------------------------- */

/**
 * The typed `Offer` input for one PDP, or `null` for a destination that is not live
 * (spec 005 §6, AC-11; ADR-0007).
 *
 * It takes the **projection the page rendered**, so `Offer.price` is `displayPrice` and cannot be
 * anything else: `moneyDecimalString()` shifts the same integer by the same currency exponent
 * that `formatMoney()` hands to `Intl`, which is the identity AC-11 asserts across the fixture
 * matrix and which spec 001's `validate-schema` CLI checks as `Offer.price == visiblePrice`.
 *
 * `null` — no `Offer` node at all — is returned when the destination's `country.status` is not
 * `live`. That is a **data flip**, not a code branch per country (`CLAUDE.md`, `plan/10` §4): a
 * demo destination shows a "from" estimate and no purchasable offer, and flipping the country to
 * `live` in the dataset publishes the offer with no code change. `availability` is `InStock` for a
 * live destination with a resolvable price; TASK-068's `availability()` — which adds the cutoff
 * and coverage terms this task owns none of — passes `inStock: false` for the states it decides,
 * and both the URL and the visible message key move together when it does.
 */
export function offerProjection(
  projection: PriceProjection,
  options: { readonly inStock?: boolean } = {},
): OfferProjection | null {
  const parsed = PriceProjectionSchema.parse(projection);
  if (countryConfig(parsed.destinationCountry).status !== "live") return null;

  // The projection's own verdict decides, so the visible availability line and the schema.org
  // value are one fact (AC-20); `inStock: false` remains an explicit override for a caller that
  // knows something the data does not (a date beyond the cut-off, spec 009's seam).
  const inStock =
    options.inStock ?? parsed.availability.schemaAvailability === "InStock";
  const state = inStock ? AVAILABILITY.inStock : AVAILABILITY.outOfStock;

  return OfferProjectionSchema.parse({
    price: moneyDecimalString(parsed.displayPrice),
    priceCurrency: parsed.displayPrice.currency,
    priceValidUntil: parsed.priceValidUntil,
    availability: state.url,
    availabilityKey: state.key,
    eligibleRegion: parsed.destinationCountry,
    shippingRate: { amountMinor: 0, currency: parsed.displayPrice.currency },
    hasMerchantReturnPolicy: RETURN_POLICY,
    priceVersion: parsed.priceVersion,
  });
}
