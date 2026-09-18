/**
 * The authored price dataset: `country_price` and `addon_country_price` rows for every destination
 * (spec 005 §2 "Pricing", §5.1, §13 Q1/Q3/Q7, AC-5/AC-6; `plan/10` §2.3; TASK-062).
 *
 * Five properties of this file are the compliance content of spec 005 §8, and each one is
 * structural rather than reviewed for:
 *
 *  - **Every amount is VAT- and delivery-inclusive integer minor units with a currency.** The
 *    price shown is the price charged (`CLAUDE.md`, `plan/07` §4, CRD Art. 6 as amended by
 *    Omnibus, the UK DMCC drip-pricing ban): there is no net column, no delivery column and no
 *    "from" amount in the dataset to accidentally display. `fo/no-float-money` is live, so a
 *    decimal literal in this file fails `pnpm lint`.
 *  - **Prices are keyed on the destination country only.** `DestinationPricing` has no buyer,
 *    IP, locale or visitor dimension, so "a French and a German buyer sending to Warsaw see the
 *    same price" is a property of the shape (EU 2018/302, `plan/07` §3, ADR-0006). Display
 *    currency is a presentation choice made from the locale's default (spec 005 §7) over these
 *    destination-currency rows, never a second price.
 *  - **Surcharges are dated rows, never a multiplier** (spec 005 §13 Q7): a Sunday row per
 *    (product, country) at +EUR 4 equivalent, open-ended, and one closed-window row per named
 *    peak day at +EUR 6 equivalent. An exact amount on a date chip *before* the date is chosen is
 *    what `plan/07` §4 requires, and a percentage could neither be shown nor superseded.
 *  - **History is superseded rows, never an update.** Every row carries `activeFrom`/`activeTo`
 *    and exactly one row per (product, country, tier, surcharge) is open-ended — the file-level
 *    mirror of spec 002 §5.1's partial unique index, which is what makes the Omnibus Art. 6a
 *    30-day-lowest figure derivable at all (`plan/07` §2.1, TASK-068).
 *  - **Add-ons carry their own VAT rate** (spec 002 §14 A1 (a), spec 005 §13 Q3): in Poland
 *    chocolates are 23% while flowers are 8% (`plan/06` §4 item 4), so the flower rate and the
 *    standard rate are two authored fields and a mixed basket invoices correctly on the first
 *    order rather than the fiftieth.
 *
 * ## What is authored here and what is derived
 *
 * The authored part is **one record per destination** (`DESTINATION_PRICING`): its currency, its
 * two VAT rates, the eight `plan/10` §2.3 bands transcribed, the authored tier ladder inside each
 * band, the two surcharge amounts and the six add-on prices. Everything below it is a mechanical
 * expansion of that record over the product and tier dataset — one retail row per (product,
 * tier, destination) and one surcharge row per (product, destination, surcharge window) — with
 * **no arithmetic on money anywhere**: a tier's amount is looked up from the ladder by its `sort`
 * index, never computed from a percentage (spec 005 §5.2: a percentage applied at render is a
 * float and a rounding bug, and a stepped amount that no row carries could not be superseded).
 *
 * Resolving these rows — which one is active on a date, the VAT decomposition, FX, rounding — is
 * `src/modules/catalog/pricing/*` and TASK-065…TASK-067's. This file loads and validates; it
 * prices nothing.
 *
 * ## Two authoring decisions this task had to make, and their basis
 *
 *  1. **The bands are exact; the tier steps are approximate** (spec 005 §14 A1). `plan/10` §2.3
 *     gives bands *and* describes the tier steps as "~+30% and +60% from the smallest", and a
 *     three-step ladder at those percentages cannot fit inside a band ~29% wide, so the two
 *     cannot both bind. Under the orchestrator's ruling the band is the founder's stated range
 *     and holds exactly — **every** tier of every product sits inside its band in every currency
 *     (a funeral piece never above 799 zł on PL or €180 elsewhere) — while the tilde on the
 *     steps bends: each ladder starts at the lowest amount in the band on the currency's ending,
 *     ends at the highest, and puts its middle step where the 1 : 1.3 : 1.6 shape lands once it
 *     is compressed to fit (so +12% / +23% in the narrowest band and +25% / +47% in the widest).
 *     `pnpm catalogue:check`'s `band` mode asserts the exact reading against every tier row, and
 *     raising a ceiling is a founder decision recorded in `plan/13`, never a data edit here.
 *  2. **VAT rates for the six `demo` destinations are provisional.** `plan/10` documents no VAT
 *     table and `plan/06` §4 item 4 puts "PL 8% flowers vs 23% add-ons" on the accountant's
 *     must-confirm list; PL — the only `live` destination — uses exactly those two documented
 *     rates. The other six carry the rate marked on each record, are listed in
 *     `docs/compliance/vat-rates.md` as "provisional — accountant to confirm" and are on that
 *     same confirm list: no order can be placed into a `demo` country (spec 005 §2
 *     "Availability"), so no invoice depends on them before they are signed off.
 *
 * ## Destinations
 *
 * The destination set is `src/config/countries.ts`'s `live` and `demo` countries, cross-checked at
 * module load: a destination with no pricing record is a **parse error** here, and a pricing
 * record for a country that is not a destination is too. `plan/10` §2.1 lists eight seeded
 * countries including the UK, while spec 004's registry carries seven destinations (the UK is the
 * first *buyer* market, ADR-0002, and is not a place we deliver to) — the seven are the authority,
 * because a price row for a country that cannot be chosen as a destination would price nothing.
 */
import { COUNTRIES, countryConfig, isCountryIso2 } from "../countries.ts";

import { ADDONS } from "./addons.data.ts";
import { PRODUCTS } from "./products.data.ts";
import {
  type AddonCountryPriceData,
  AddonCountryPriceDataSchema,
  type CountryPriceData,
  CountryPriceDataSchema,
  type DestinationPricing,
  DestinationPricingRegistrySchema,
  type PriceBand,
  type PriceBandKey,
  priceBandKeyFor,
} from "./schemas.ts";
import { PRODUCT_TIER_GROUPS } from "./tiers.data.ts";

/**
 * The day the Phase 0 dataset's prices took effect. One date for every row, because the dataset
 * is authored in one commit: a real price change supersedes a row (a new `activeFrom` and an
 * `activeTo` on the old one), which is what TASK-068's 30-day-lowest figure reads.
 */
export const PRICE_ACTIVE_FROM = "2026-09-01";

/**
 * The named peak days of `plan/10` §2.3, as **closed windows**: the surcharge row is active for
 * the delivery day it names and is not open-ended, so `dateSurcharges()` (TASK-065) returns it
 * only for that date and the one open-ended row per key stays the Sunday one.
 *
 * The dates are spec 002 §2's own 2027 occasion dates (Valentine's 14 Feb 2027, Women's Day
 * 8 Mar 2027). Adding next year's rows is a `docs/runbooks/pricing.md` task and a data change
 * (spec 005 §13 Q7's accepted cost), never a code change.
 */
export const PEAK_DAYS = [
  { occasionKey: "valentines", date: "2027-02-14", endsBefore: "2027-02-15" },
  { occasionKey: "womens_day", date: "2027-03-08", endsBefore: "2027-03-09" },
] as const;

/** Message keys for the two surcharge kinds (spec 005 §7; the date chip of `plan/07` §4). */
export const SURCHARGE_LABEL_KEYS = {
  sunday: "catalog.surcharge.sunday",
  peak_day: "catalog.surcharge.peakDay",
} as const;

/* -------------------------------------------------------------------------- */
/* The authored bands and ladders (`plan/10` §2.3).                           */
/* -------------------------------------------------------------------------- */

/**
 * `plan/10` §2.3's "EUR base" column, transcribed: essential 35–45, classic 46–60, premium 61–80,
 * luxury 81–120, funeral pieces 60–180 split into four adjacent, non-overlapping sub-bands that
 * span its own bounds — the funeral floor is the first sub-band's floor and the funeral ceiling
 * the last one's ceiling, and each sub-band starts one price point above the previous ceiling
 * rather than sharing it (see `priceBandKeyFor`). Used by the four euro destinations that have no
 * country override.
 */
const EUR_BASE_BANDS = {
  essential: { fromMinor: 3500, toMinor: 4500 },
  classic: { fromMinor: 4600, toMinor: 6000 },
  premium: { fromMinor: 6100, toMinor: 8000 },
  luxury: { fromMinor: 8100, toMinor: 12_000 },
  funeral_essential: { fromMinor: 6000, toMinor: 8000 },
  funeral_classic: { fromMinor: 8100, toMinor: 11_000 },
  funeral_premium: { fromMinor: 11_100, toMinor: 14_500 },
  funeral_luxury: { fromMinor: 14_600, toMinor: 18_000 },
} as const;

/**
 * The authored `x90` ladders, smallest tier first — every step inside `EUR_BASE_BANDS` (spec 005
 * §14 A1: the band is exact, the "~+30% / +60%" steps bend to fit it).
 */
const EUR_BASE_LADDERS = {
  essential: [3590, 4090, 4490],
  classic: [4690, 5390, 5990],
  premium: [6190, 7090, 7990],
  luxury: [8190, 10_090, 11_990],
  funeral_essential: [6090, 7090, 7990],
  funeral_classic: [8190, 9690, 10_990],
  funeral_premium: [11_190, 12_890, 14_490],
  funeral_luxury: [14_690, 16_490, 17_990],
} as const;

/** `plan/10` §2.3's add-on row, EUR column: chocolates 6 · vase 8 · balloon 4 · plush 9 · wine 14 · card 0. */
const EUR_ADDONS = {
  chocolates: 600,
  vase: 800,
  balloon: 400,
  plush: 900,
  wine: 1400,
  card: 0,
} as const;

/**
 * Every destination's authored pricing.
 *
 * Germany has `plan/10` §2.3's own DE column; France, Spain, Italy and the Netherlands use the
 * EUR base list, which is what that section means by "base list in EUR; country overrides".
 * Poland and Romania have their own currency columns. Romania's funeral band and its add-on and
 * surcharge amounts are the EUR figures at the same ×5 factor that section's own RON columns
 * exhibit (175/35, 230/46, 305/61, 405/81) rather than a new invention.
 */
const destinationPricing = [
  {
    // PL — the one `live` destination. `plan/10` §2.3's PLN column: 149–189 / 199–259 / 269–349 /
    // 359–529 zł, whole złoty ending in nine (spec 005 §13 Q1's `x9`), funeral 259–799 zł.
    // VAT: 8% on flowers and 23% standard, both documented in `plan/06` §4 item 4.
    countryIso2: "PL",
    currency: "PLN",
    flowersVatRateBp: 800,
    standardVatRateBp: 2300,
    bands: {
      essential: { fromMinor: 14_900, toMinor: 18_900 },
      classic: { fromMinor: 19_900, toMinor: 25_900 },
      premium: { fromMinor: 26_900, toMinor: 34_900 },
      luxury: { fromMinor: 35_900, toMinor: 52_900 },
      funeral_essential: { fromMinor: 25_900, toMinor: 34_900 },
      funeral_classic: { fromMinor: 35_900, toMinor: 47_900 },
      funeral_premium: { fromMinor: 48_900, toMinor: 63_900 },
      funeral_luxury: { fromMinor: 64_900, toMinor: 79_900 },
    },
    ladders: {
      essential: [14_900, 16_900, 18_900],
      classic: [19_900, 22_900, 25_900],
      premium: [26_900, 30_900, 34_900],
      luxury: [35_900, 44_900, 52_900],
      funeral_essential: [25_900, 30_900, 34_900],
      funeral_classic: [35_900, 41_900, 47_900],
      funeral_premium: [48_900, 56_900, 63_900],
      funeral_luxury: [64_900, 72_900, 79_900],
    },
    // +EUR 4 / +EUR 6 at `plan/10` §2.3's own EUR→PLN add-on parity (balloon 4 EUR = 18 zł,
    // chocolates 6 EUR = 25 zł), so the surcharge and the add-on column cannot disagree.
    // `catalogue:check`'s `surcharge-amount` mode transcribes both figures independently.
    sundaySurchargeMinor: 1800,
    peakDaySurchargeMinor: 2500,
    addonsMinor: {
      chocolates: 2500,
      vase: 3500,
      balloon: 1800,
      plush: 3900,
      wine: 5900,
      card: 0,
    },
  },
  {
    // DE — `plan/10` §2.3's DE column: 39–49 / 50–65 / 66–89 / 90–130 EUR. Funeral pieces have no
    // DE column, so they use the EUR base funeral band rather than an invented one.
    // VAT: 7% reduced on cut flowers, 19% standard — provisional, `plan/06` §4 item 4.
    countryIso2: "DE",
    currency: "EUR",
    flowersVatRateBp: 700,
    standardVatRateBp: 1900,
    bands: {
      essential: { fromMinor: 3900, toMinor: 4900 },
      classic: { fromMinor: 5000, toMinor: 6500 },
      premium: { fromMinor: 6600, toMinor: 8900 },
      luxury: { fromMinor: 9000, toMinor: 13_000 },
      funeral_essential: EUR_BASE_BANDS.funeral_essential,
      funeral_classic: EUR_BASE_BANDS.funeral_classic,
      funeral_premium: EUR_BASE_BANDS.funeral_premium,
      funeral_luxury: EUR_BASE_BANDS.funeral_luxury,
    },
    ladders: {
      essential: [3990, 4490, 4890],
      classic: [5090, 5790, 6490],
      premium: [6690, 7890, 8890],
      luxury: [9090, 11_090, 12_990],
      funeral_essential: EUR_BASE_LADDERS.funeral_essential,
      funeral_classic: EUR_BASE_LADDERS.funeral_classic,
      funeral_premium: EUR_BASE_LADDERS.funeral_premium,
      funeral_luxury: EUR_BASE_LADDERS.funeral_luxury,
    },
    sundaySurchargeMinor: 400,
    peakDaySurchargeMinor: 600,
    addonsMinor: EUR_ADDONS,
  },
  {
    // FR — EUR base list. VAT: cut flowers at the 20% standard rate — provisional, `plan/06` §4.
    countryIso2: "FR",
    currency: "EUR",
    flowersVatRateBp: 2000,
    standardVatRateBp: 2000,
    bands: EUR_BASE_BANDS,
    ladders: EUR_BASE_LADDERS,
    sundaySurchargeMinor: 400,
    peakDaySurchargeMinor: 600,
    addonsMinor: EUR_ADDONS,
  },
  {
    // ES — EUR base list. VAT: 10% reduced on cut flowers, 21% standard — provisional.
    countryIso2: "ES",
    currency: "EUR",
    flowersVatRateBp: 1000,
    standardVatRateBp: 2100,
    bands: EUR_BASE_BANDS,
    ladders: EUR_BASE_LADDERS,
    sundaySurchargeMinor: 400,
    peakDaySurchargeMinor: 600,
    addonsMinor: EUR_ADDONS,
  },
  {
    // IT — EUR base list. VAT: 10% reduced on cut flowers, 22% standard — provisional.
    countryIso2: "IT",
    currency: "EUR",
    flowersVatRateBp: 1000,
    standardVatRateBp: 2200,
    bands: EUR_BASE_BANDS,
    ladders: EUR_BASE_LADDERS,
    sundaySurchargeMinor: 400,
    peakDaySurchargeMinor: 600,
    addonsMinor: EUR_ADDONS,
  },
  {
    // RO — `plan/10` §2.3's RON column: 175–225 / 230–300 / 305–400 / 405–600 lei; the funeral
    // band, the add-ons and the surcharges follow that column's own ×5 factor against the EUR
    // base. VAT: 19% standard on flowers and add-ons — provisional, `plan/06` §4 item 4.
    countryIso2: "RO",
    currency: "RON",
    flowersVatRateBp: 1900,
    standardVatRateBp: 1900,
    bands: {
      essential: { fromMinor: 17_500, toMinor: 22_500 },
      classic: { fromMinor: 23_000, toMinor: 30_000 },
      premium: { fromMinor: 30_500, toMinor: 40_000 },
      luxury: { fromMinor: 40_500, toMinor: 60_000 },
      funeral_essential: { fromMinor: 30_000, toMinor: 40_000 },
      funeral_classic: { fromMinor: 40_500, toMinor: 55_000 },
      funeral_premium: { fromMinor: 55_500, toMinor: 72_000 },
      funeral_luxury: { fromMinor: 73_000, toMinor: 90_000 },
    },
    ladders: {
      essential: [17_590, 20_190, 22_490],
      classic: [23_090, 26_690, 29_990],
      premium: [30_590, 35_490, 39_990],
      luxury: [40_590, 50_490, 59_990],
      funeral_essential: [30_090, 35_290, 39_990],
      funeral_classic: [40_590, 48_090, 54_990],
      funeral_premium: [55_590, 64_190, 71_990],
      funeral_luxury: [73_090, 82_090, 89_990],
    },
    sundaySurchargeMinor: 2000,
    peakDaySurchargeMinor: 3000,
    addonsMinor: {
      chocolates: 3000,
      vase: 4000,
      balloon: 2000,
      plush: 4500,
      wine: 7000,
      card: 0,
    },
  },
  {
    // NL — EUR base list. VAT: 9% reduced on cut flowers, 21% standard — provisional.
    countryIso2: "NL",
    currency: "EUR",
    flowersVatRateBp: 900,
    standardVatRateBp: 2100,
    bands: EUR_BASE_BANDS,
    ladders: EUR_BASE_LADDERS,
    sundaySurchargeMinor: 400,
    peakDaySurchargeMinor: 600,
    addonsMinor: EUR_ADDONS,
  },
] as const;

/**
 * Parsed at module load, and cross-checked against `src/config/countries.ts`: the destinations
 * that can be chosen (`live` or `demo`) and the destinations that are priced are the same set, or
 * this module throws on first import rather than at request time.
 */
export const DESTINATION_PRICING: readonly DestinationPricing[] =
  DestinationPricingRegistrySchema.parse(destinationPricing);

/** The destinations a price may be authored for: `plan/10` §2.1's seeded set, minus the UK. */
export const PRICED_DESTINATIONS: readonly string[] = COUNTRIES.filter(
  (country) => country.status === "live" || country.status === "demo",
).map((country) => country.iso2);

{
  const priced = new Set(
    DESTINATION_PRICING.map((destination) => destination.countryIso2),
  );
  const missing = PRICED_DESTINATIONS.filter((iso2) => !priced.has(iso2));
  const unknown = [...priced].filter(
    (iso2) => !PRICED_DESTINATIONS.includes(iso2),
  );
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `src/config/catalogue/prices.data.ts and src/config/countries.ts disagree about the destination set: ${
        missing.length > 0 ? `unpriced destinations ${missing.join(", ")}` : ""
      }${missing.length > 0 && unknown.length > 0 ? "; " : ""}${
        unknown.length > 0
          ? `priced non-destinations ${unknown.join(", ")}`
          : ""
      }`,
    );
  }
}

const byIso2 = new Map<string, DestinationPricing>(
  DESTINATION_PRICING.map((destination) => [
    destination.countryIso2,
    destination,
  ]),
);

/** The authored pricing of one destination. Throws on a non-destination: the set is closed data. */
export function destinationPricingFor(iso2: string): DestinationPricing {
  const destination = byIso2.get(iso2);
  if (destination === undefined) {
    throw new Error(`no authored pricing for destination: ${iso2}`);
  }
  return destination;
}

/** The `plan/10` §2.3 band one destination prices one band key in (`catalogue:check` reads it). */
export function priceBandFor(iso2: string, bandKey: PriceBandKey): PriceBand {
  const band = destinationPricingFor(iso2).bands[bandKey];
  if (band === undefined) {
    throw new Error(`no \`${bandKey}\` band for destination: ${iso2}`);
  }
  return band;
}

/* -------------------------------------------------------------------------- */
/* The expansion: one row per (product, tier, destination) and per surcharge. */
/* -------------------------------------------------------------------------- */

const productBySku = new Map(PRODUCTS.map((product) => [product.sku, product]));

function bandKeyForSku(sku: string): PriceBandKey {
  const product = productBySku.get(sku);
  if (product === undefined) {
    throw new Error(`no product for tier group: ${sku}`);
  }
  return priceBandKeyFor(product);
}

function retailRows(): CountryPriceData[] {
  const rows: CountryPriceData[] = [];
  for (const group of PRODUCT_TIER_GROUPS) {
    const bandKey = bandKeyForSku(group.sku);
    for (const destination of DESTINATION_PRICING) {
      const ladder = destination.ladders[bandKey];
      if (ladder === undefined) {
        throw new Error(
          `no \`${bandKey}\` ladder for destination ${destination.countryIso2}`,
        );
      }
      for (const tier of group.tiers) {
        const step = ladder[tier.sort];
        if (step === undefined) {
          throw new Error(
            `\`${group.sku}\` has more tiers than the \`${bandKey}\` ladder of ${destination.countryIso2} has steps`,
          );
        }
        rows.push({
          sku: group.sku,
          countryIso2: destination.countryIso2,
          tierKey: tier.tierKey,
          retailMinor: step,
          currency: destination.currency,
          vatRateBp: destination.flowersVatRateBp,
          surchargeKind: null,
          activeFrom: PRICE_ACTIVE_FROM,
          activeTo: null,
        });
      }
    }
  }
  return rows;
}

/**
 * May this destination carry a `sunday` surcharge row? (Spec 004 §14 A19 / TASK-120.)
 *
 * A Sunday surcharge is the price of a delivery on a day nobody has agreed to work. For a
 * **`live`** destination — one whose prices are a real offer — that agreement is spec 002 §5.1's
 * `country.sunday_delivery`, carried by the `operations` block of `src/config/countries.ts`.
 * Poland is `live` and has no `operations` at all, so its Sunday rows priced a Sunday delivery
 * that no florist has accepted: the same fabrication as the 14:00 Warsaw cutoff A19 removed, in
 * money instead of copy. They are therefore not emitted while the fact is absent.
 *
 * The six `demo` destinations keep theirs: their whole price column is `plan/10` §2.3's authored
 * demo data for a country we do not serve, spec 005's `dateSurcharges`/`resolvePrice` contract is
 * exercised against it, and suppressing it would delete the dataset's only open-ended surcharge
 * window rather than remove a claim. The amounts stay authored in `DESTINATION_PRICING` either
 * way — `catalogue:check --mode surcharge-amount` still transcribes them — and PL's rows return
 * with no edit here the day a florist's operations land.
 */
function emitsSundaySurcharge(iso2: string): boolean {
  if (!isCountryIso2(iso2)) return true;
  const country = countryConfig(iso2);
  if (country.status !== "live") return true;
  return (
    country.operations !== undefined &&
    country.operations.sundayDelivery !== "none"
  );
}

function surchargeRows(): CountryPriceData[] {
  const rows: CountryPriceData[] = [];
  for (const group of PRODUCT_TIER_GROUPS) {
    for (const destination of DESTINATION_PRICING) {
      // `tierKey: null` — the surcharge is the same amount whichever tier is chosen, which is
      // what spec 002 §5.1's nullable `tier_key` on `country_price` is for. One row per
      // (product, country, surcharge window) instead of one per tier keeps the dataset
      // legible and keeps "exactly one open-ended row per key" checkable.
      if (emitsSundaySurcharge(destination.countryIso2)) {
        rows.push({
          sku: group.sku,
          countryIso2: destination.countryIso2,
          tierKey: null,
          retailMinor: destination.sundaySurchargeMinor,
          currency: destination.currency,
          vatRateBp: destination.flowersVatRateBp,
          surchargeKind: "sunday",
          activeFrom: PRICE_ACTIVE_FROM,
          activeTo: null,
        });
      }
      for (const peakDay of PEAK_DAYS) {
        rows.push({
          sku: group.sku,
          countryIso2: destination.countryIso2,
          tierKey: null,
          retailMinor: destination.peakDaySurchargeMinor,
          currency: destination.currency,
          vatRateBp: destination.flowersVatRateBp,
          surchargeKind: "peak_day",
          activeFrom: peakDay.date,
          activeTo: peakDay.endsBefore,
        });
      }
    }
  }
  return rows;
}

/**
 * Every `country_price` row: the retail rows and the dated surcharge rows, each parsed under
 * `CountryPriceDataSchema`. `toCountryPriceRow()` projects them onto spec 002 §5.1's column set,
 * which is what spec 002's seed and spec 006's `seed/data/prices/{ISO2}.json` read (ADR-0017).
 */
export const COUNTRY_PRICES: readonly CountryPriceData[] = [
  ...retailRows(),
  ...surchargeRows(),
].map((row) => CountryPriceDataSchema.parse(row));

/** Every `addon_country_price` row: one active row per (add-on, destination), own VAT rate. */
export const ADDON_COUNTRY_PRICES: readonly AddonCountryPriceData[] =
  DESTINATION_PRICING.flatMap((destination) =>
    ADDONS.map((addon) => {
      const authored = destination.addonsMinor[addon.key];
      if (authored === undefined) {
        throw new Error(
          `add-on \`${addon.key}\` is not priced in ${destination.countryIso2}`,
        );
      }
      return AddonCountryPriceDataSchema.parse({
        addonKey: addon.key,
        countryIso2: destination.countryIso2,
        retailMinor: authored,
        currency: destination.currency,
        vatRateBp: destination.standardVatRateBp,
        activeFrom: PRICE_ACTIVE_FROM,
        activeTo: null,
      });
    }),
  );

/** The rows of one destination, in authored order. Throws on a non-destination. */
export function countryPricesFor(iso2: string): readonly CountryPriceData[] {
  destinationPricingFor(iso2);
  return COUNTRY_PRICES.filter((row) => row.countryIso2 === iso2);
}
