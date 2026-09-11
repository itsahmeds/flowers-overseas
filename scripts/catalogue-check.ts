/**
 * `pnpm catalogue:check` (spec 005 §2 "Docs, fixtures, gates", §6 "Crawl efficiency and quality
 * gates", AC-5; TASK-062).
 *
 * The gate on the authored catalogue. Everything it checks is a **cross-file** property that no
 * per-file zod schema can see: `prices.data.ts` cannot know how many tiers `tiers.data.ts` gave a
 * product, `occasions.data.ts` cannot know whether `messages/en.json` has its label, and
 * `projections.ts` cannot know what spec 002 §5.1 says. Each of those is exactly where a wrong
 * *price* comes from, which is why this runs on every pull request rather than in a review:
 *
 *  - a product with no price in a live country is a page that renders a buy path with no amount;
 *  - two open-ended price rows for one key is the ambiguity spec 002's partial unique index
 *    forbids in Postgres and this file forbids in the dataset (spec 005 §5.2 — `resolvePrice()`
 *    throws on it rather than picking, so the dataset must never contain it);
 *  - a price outside its `plan/10` §2.3 band, or off the currency's psychological ending, is a
 *    price nobody authored on purpose;
 *  - a label key that `messages/en.json` does not have renders as a raw key to a buyer;
 *  - a projection key set that disagrees with spec 002 §5.1 breaks the seed the day the database
 *    is provisioned, silently, months from now.
 *
 * ```
 * pnpm catalogue:check [--summary]
 * ```
 *
 * Exit 0 on a clean tree, printing the per-destination coverage table; exit 1 with **one line per
 * problem**, each naming the file, the offender and the rule, so a red CI log is actionable
 * without opening an editor. `--summary` appends the same table to `$GITHUB_STEP_SUMMARY`.
 *
 * ## Shape, and why the checks take an input object
 *
 * `checkCatalogue()` is a pure function over a `CatalogueCheckInput` — the dataset, the message
 * catalogue and the projection column lists — and `catalogueCheckInput()` builds that input from
 * the committed tree. AC-5 requires a fixture per failure mode, and the dataset's own zod schemas
 * already refuse most of these faults at module load (which is the stronger guarantee and the
 * reason they are there): a temporary mutation of the *input* is therefore how each mode is
 * exercised, in-process, without shipping a broken dataset or a parallel fixture copy of 84
 * products. `tests/unit/catalogue-check.test.ts` does exactly that, once per mode.
 *
 * ## What this file deliberately does not do
 *
 * No arithmetic on money beyond the comparisons above: resolving a price, converting it, rounding
 * it and splitting its VAT are `src/modules/catalog/pricing/*`'s (TASK-065…TASK-067). No
 * database, no network, no `messages/de.json` — translation debt is `pnpm i18n:check`'s gate and
 * `de`/`pl` catalogue copy is deliberately absent from this dataset (spec 005 §7).
 */
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COUNTRIES } from "../src/config/countries.ts";
import { currencyConfig, isCurrencyCode } from "../src/config/currencies.ts";
import { ADDONS } from "../src/config/catalogue/addons.data.ts";
import { CATEGORIES } from "../src/config/catalogue/categories.data.ts";
import {
  FX_BASE_CURRENCY,
  FX_SNAPSHOT,
  FX_SNAPSHOT_AS_OF,
  fxSnapshotAgeHours,
  isFxSnapshotStale,
} from "../src/config/catalogue/fx.data.ts";
import { OCCASIONS } from "../src/config/catalogue/occasions.data.ts";
import {
  ADDON_COUNTRY_PRICES,
  COUNTRY_PRICES,
  DESTINATION_PRICING,
} from "../src/config/catalogue/prices.data.ts";
import { PRODUCTS } from "../src/config/catalogue/products.data.ts";
import {
  ADDON_COUNTRY_PRICE_ACTIVE_INDEX_COLUMNS,
  ADDON_COUNTRY_PRICE_ROW_COLUMNS,
  COUNTRY_PRICE_ACTIVE_INDEX_COLUMNS,
  COUNTRY_PRICE_ROW_COLUMNS,
  FX_RATE_ROW_COLUMNS,
  PRODUCT_TIER_DEFAULT_INDEX_COLUMNS,
  PROJECTION_ROW_COLUMNS,
  PROJECTION_UNIQUE_INDEX_COLUMNS,
  toAddonCountryPriceRow,
  toCountryPriceRow,
  toFxRateRow,
} from "../src/config/catalogue/projections.ts";
import {
  type AddonCountryPriceData,
  type AddonData,
  type CategoryData,
  type CountryPriceData,
  type DestinationPricing,
  type FacetName,
  type FxRateData,
  type OccasionData,
  type PriceBandKey,
  type ProductData,
  type ProductTierRecord,
  endsInRoundingStyle,
  facetLabelKey,
  facetNames,
  facetValues,
  priceBandKeyFor,
  priceBandKeys,
} from "../src/config/catalogue/schemas.ts";
import { PRODUCT_TIERS } from "../src/config/catalogue/tiers.data.ts";

export const CLI_NAME = "catalogue:check";

/**
 * The failure modes, each of which AC-5 requires a fixture for. The mode is printed with the
 * problem so a CI log can be read by kind, and `tests/unit/catalogue-check.test.ts` asserts that
 * every one of them is reachable — a mode nothing can trigger is a check that is not running.
 */
export const CHECK_MODES = [
  "no-tier",
  "default-tier",
  "missing-price",
  "ambiguous-price",
  "band",
  "rounding-ending",
  "float-money",
  "facet",
  "label-key",
  "addon-price",
  "surcharge-amount",
  "surcharge-vat-rate",
  "fx-snapshot",
  "projection-columns",
  "destination-drift",
  "addon-preselection",
] as const;

export type CheckMode = (typeof CHECK_MODES)[number];

/** One fault: the file to open, the offender to look for, and the rule that was broken. */
export interface Problem {
  readonly mode: CheckMode;
  /** Repo-relative path of the file to fix. */
  readonly file: string;
  /** SKU, destination, key or column set — whatever names the offender. */
  readonly subject: string;
  readonly reason: string;
}

/** Everything the checks read. Injected so a test can mutate one field and nothing else. */
export interface CatalogueCheckInput {
  readonly products: readonly ProductData[];
  readonly tiers: readonly ProductTierRecord[];
  readonly categories: readonly CategoryData[];
  readonly occasions: readonly OccasionData[];
  readonly addons: readonly AddonData[];
  readonly destinations: readonly DestinationPricing[];
  /** `live` + `demo` destinations of `src/config/countries.ts`: what must be priced. */
  readonly destinationIso2: readonly string[];
  readonly countryPrices: readonly CountryPriceData[];
  readonly addonCountryPrices: readonly AddonCountryPriceData[];
  readonly fxRates: readonly FxRateData[];
  /** Flattened `messages/en.json`: dotted key -> string. */
  readonly messageKeys: ReadonlySet<string>;
  /** `PROJECTION_ROW_COLUMNS`, injectable so the ninth mode can be exercised. */
  readonly projectionColumns: Readonly<Record<string, readonly string[]>>;
  readonly projectionIndexColumns: Readonly<Record<string, readonly string[]>>;
  /**
   * The sources that *declare* an add-on's fields — the dataset's schema and data file and the
   * catalogue module's read model and read schema — as `repo-relative path -> source text`.
   *
   * They are read as text rather than imported because what the `addon-preselection` mode checks
   * is whether a forbidden field has been **declared** at all (CRD Art. 22, AC-19), and a
   * declaration that TypeScript accepted is invisible to a value-level check. Injected, so the
   * mode has a one-field mutation fixture like every other (T-03).
   */
  readonly addonFieldSources: Readonly<Record<string, string>>;
}

const DATA_FILE = "src/config/catalogue/prices.data.ts";
const FX_FILE = "src/config/catalogue/fx.data.ts";
const TIERS_FILE = "src/config/catalogue/tiers.data.ts";
const PRODUCTS_FILE = "src/config/catalogue/products.data.ts";
const PROJECTIONS_FILE = "src/config/catalogue/projections.ts";
const MESSAGES_FILE = "messages/en.json";
const ADDONS_FILE = "src/config/catalogue/addons.data.ts";
const DATASET_SCHEMAS_FILE = "src/config/catalogue/schemas.ts";
const READ_MODEL_FILE = "src/modules/catalog/types.ts";
const READ_SCHEMAS_FILE = "src/modules/catalog/schemas.ts";

/** Every file that declares what an add-on carries; the `addon-preselection` mode scans each. */
export const ADDON_FIELD_SOURCE_FILES: readonly string[] = [
  ADDONS_FILE,
  DATASET_SCHEMAS_FILE,
  READ_MODEL_FILE,
  READ_SCHEMAS_FILE,
];

/* -------------------------------------------------------------------------- */
/* Spec 002 §5.1, transcribed.                                                */
/* -------------------------------------------------------------------------- */

/**
 * The column sets of spec 002 §5.1, transcribed **here** rather than imported from
 * `projections.ts` — that is the whole point of the ninth failure mode. `tests/unit/
 * catalogue-projections.test.ts` (TASK-061) pins the same lists from the test side; a gate that
 * imported the constants it is checking would agree with anything.
 *
 * Order is declaration order in spec 002 §5.1, minus generated `id` columns, and includes the
 * three §14 A1 amendments (`addon_country_price.vat_rate_bp`, `product_tier.is_default`, and the
 * key columns of the two partial unique indexes).
 */
export const SPEC_002_ROW_COLUMNS: Readonly<Record<string, readonly string[]>> =
  {
    product: [
      "sku",
      "product_type",
      "primary_flower",
      "colour_primary",
      "style",
      "price_tier",
      "substitution_class",
      "vase_included",
      "stem_count",
      "freshness_days",
      "partner_only",
      "status",
      "retired_at",
      "source",
    ],
    product_translation: [
      "product_id",
      "locale_code",
      "name",
      "slug",
      "description_md",
      "seo_title",
      "seo_description",
      "translation_status",
      "reviewed",
      "reviewed_by",
      "reviewed_at",
      "source_hash",
    ],
    product_tier: [
      "product_id",
      "tier_key",
      "label_key",
      "stems",
      "sort",
      "is_default",
    ],
    category: ["key", "kind"],
    occasion: ["key", "kind"],
    addon: ["key", "kind", "allergen_note_required"],
    addon_country_price: [
      "addon_id",
      "country_id",
      "retail_minor",
      "currency_code",
      "vat_rate_bp",
      "active_from",
      "active_to",
    ],
    country_price: [
      "product_id",
      "country_id",
      "tier_key",
      "retail_minor",
      "currency_code",
      "vat_rate_bp",
      "surcharge_kind",
      "active_from",
      "active_to",
      "source",
    ],
    fx_rate: ["base_code", "quote_code", "rate_ppm", "as_of", "source"],
  };

/** The partial unique indexes of spec 002 §5.1 and §14 A1, transcribed. */
export const SPEC_002_UNIQUE_INDEX_COLUMNS: Readonly<
  Record<string, readonly string[]>
> = {
  // "a one-per-product partial unique index" (spec 002 §14 A1 (b)): the key is the product, and
  // `WHERE is_default` is the predicate, not a key column.
  product_tier: ["product_id"],
  addon_country_price: ["addon_id", "country_id"],
  country_price: ["product_id", "country_id", "tier_key", "surcharge_kind"],
};

/* -------------------------------------------------------------------------- */
/* Input assembly.                                                            */
/* -------------------------------------------------------------------------- */

const repoRoot = resolve(fileURLToPath(import.meta.url), "../..");

/** Flatten a message tree into dotted keys, the way `next-intl` addresses it. */
export function flattenMessages(
  tree: unknown,
  prefix = "",
  into: Set<string> = new Set(),
): Set<string> {
  if (typeof tree !== "object" || tree === null) return into;
  for (const [key, value] of Object.entries(tree as Record<string, unknown>)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") into.add(path);
    else flattenMessages(value, path, into);
  }
  return into;
}

/** The committed tree as an input. `overrides` is how a test builds a one-field mutation. */
export function catalogueCheckInput(
  overrides: Partial<CatalogueCheckInput> = {},
  root = repoRoot,
): CatalogueCheckInput {
  const messages: unknown = JSON.parse(
    readFileSync(resolve(root, MESSAGES_FILE), "utf8"),
  );
  return {
    products: PRODUCTS,
    tiers: PRODUCT_TIERS,
    categories: CATEGORIES,
    occasions: OCCASIONS,
    addons: ADDONS,
    destinations: DESTINATION_PRICING,
    destinationIso2: COUNTRIES.filter(
      (country) => country.status === "live" || country.status === "demo",
    ).map((country) => country.iso2),
    countryPrices: COUNTRY_PRICES,
    addonCountryPrices: ADDON_COUNTRY_PRICES,
    fxRates: FX_SNAPSHOT,
    messageKeys: flattenMessages(messages),
    projectionColumns: PROJECTION_ROW_COLUMNS,
    projectionIndexColumns: PROJECTION_UNIQUE_INDEX_COLUMNS,
    addonFieldSources: Object.fromEntries(
      ADDON_FIELD_SOURCE_FILES.map((file) => [
        file,
        readFileSync(resolve(root, file), "utf8"),
      ]),
    ),
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* The checks.                                                               */
/* -------------------------------------------------------------------------- */

const isActive = (row: { readonly activeTo: string | null }): boolean =>
  row.activeTo === null;

const key = (parts: readonly (string | null)[]): string =>
  parts.map((part) => part ?? "-").join("|");

/** Every product has at least one tier, and exactly one of them is the default (spec 005 §13 Q6). */
function checkTiers(input: CatalogueCheckInput): Problem[] {
  const problems: Problem[] = [];
  for (const product of input.products) {
    const tiers = input.tiers.filter((tier) => tier.sku === product.sku);
    if (tiers.length === 0) {
      problems.push({
        mode: "no-tier",
        file: TIERS_FILE,
        subject: product.sku,
        reason:
          "has no `product_tier` row: a product with no tier has no price and cannot be bought (spec 005 AC-5)",
      });
      continue;
    }
    const defaults = tiers.filter((tier) => tier.isDefault);
    if (defaults.length !== 1) {
      problems.push({
        mode: "default-tier",
        file: TIERS_FILE,
        subject: product.sku,
        reason: `has ${String(defaults.length)} default tiers; exactly one is required (spec 002 §14 A1 (b)'s one-per-product partial unique index, spec 005 §13 Q6)`,
      });
    }
  }
  return problems;
}

/**
 * Exactly one active retail row per (product, tier, destination), at most one active row per
 * (product, country, tier, surcharge) — the dataset mirror of spec 002 §5.1's partial unique
 * index — and no two closed windows for one key that overlap. All three directions matter: a
 * missing row is a page with no price, a second open-ended one is the ambiguity `resolvePrice()`
 * throws on, and two overlapping windows are two surcharges on one delivery date.
 */
function checkPriceCoverage(input: CatalogueCheckInput): Problem[] {
  const problems: Problem[] = [];
  const active = input.countryPrices.filter(isActive);

  const activeByKey = new Map<string, number>();
  for (const row of input.countryPrices.filter(isActive)) {
    const rowKey = key([
      row.sku,
      row.countryIso2,
      row.tierKey,
      row.surchargeKind,
    ]);
    activeByKey.set(rowKey, (activeByKey.get(rowKey) ?? 0) + 1);
  }
  for (const [rowKey, count] of activeByKey) {
    if (count > 1) {
      problems.push({
        mode: "ambiguous-price",
        file: DATA_FILE,
        subject: rowKey,
        reason: `has ${String(count)} open-ended rows for one (product, country, tier, surcharge); spec 002 §5.1's partial unique index allows exactly one, and \`resolvePrice()\` throws on ambiguity rather than picking (spec 005 §5.2)`,
      });
    }
  }

  // Two closed windows for one key are not caught by the open-ended rule above, and two
  // surcharge rows live on the same delivery date would both apply — a doubled surcharge is the
  // drip price `plan/07` §4 forbids. Windows are half-open [activeFrom, activeTo).
  const windows = new Map<
    string,
    { readonly from: string; readonly to: string }[]
  >();
  for (const row of input.countryPrices) {
    if (row.activeTo === null) continue;
    const rowKey = key([
      row.sku,
      row.countryIso2,
      row.tierKey,
      row.surchargeKind,
    ]);
    const list = windows.get(rowKey) ?? [];
    list.push({ from: row.activeFrom, to: row.activeTo });
    windows.set(rowKey, list);
  }
  for (const [rowKey, list] of windows) {
    const ordered = [...list].sort((a, b) => a.from.localeCompare(b.from));
    for (const [index, window] of ordered.entries()) {
      const previous = ordered[index - 1];
      if (previous !== undefined && window.from < previous.to) {
        problems.push({
          mode: "ambiguous-price",
          file: DATA_FILE,
          subject: rowKey,
          reason: `has overlapping closed windows ${previous.from}…${previous.to} and ${window.from}…${window.to}; two surcharge rows live on one delivery date would both apply (spec 005 §13 Q7, plan/07 §4)`,
        });
      }
    }
  }

  const retail = new Set(
    active
      .filter((row) => row.surchargeKind === null)
      .map((row) => key([row.sku, row.countryIso2, row.tierKey])),
  );
  for (const iso2 of input.destinationIso2) {
    for (const tier of input.tiers) {
      if (!retail.has(key([tier.sku, iso2, tier.tierKey]))) {
        problems.push({
          mode: "missing-price",
          file: DATA_FILE,
          subject: `${tier.sku} ${tier.tierKey} ${iso2}`,
          reason: `has no active \`country_price\` row: every tier of every product is priced in every destination that is \`live\` or \`demo\` (spec 005 AC-6, plan/10 §2.3)`,
        });
      }
    }
  }
  return problems;
}

/**
 * Every active retail amount is an integer in a configured currency, on that currency's
 * psychological ending, inside its `plan/10` §2.3 band — **every** tier, not only the smallest
 * (spec 005 §14 A1: the band is exact and the "~+30% / +60%" steps bend) — and increasing with
 * `sort`.
 */
function checkAmounts(input: CatalogueCheckInput): Problem[] {
  const problems: Problem[] = [];
  const destinations = new Map(
    input.destinations.map((destination) => [
      destination.countryIso2,
      destination,
    ]),
  );
  const bandKeys = new Map<string, PriceBandKey>(
    input.products.map((product) => [product.sku, priceBandKeyFor(product)]),
  );
  const sortOf = new Map<string, number>(
    input.tiers.map((tier) => [key([tier.sku, tier.tierKey]), tier.sort]),
  );

  for (const row of input.countryPrices) {
    if (!Number.isInteger(row.retailMinor)) {
      problems.push({
        mode: "float-money",
        file: DATA_FILE,
        subject: `${row.sku} ${row.tierKey ?? row.surchargeKind ?? "-"} ${row.countryIso2}`,
        reason: `is priced ${String(row.retailMinor)}: money is integer minor units, never a float (\`CLAUDE.md\`, plan/12 §2, spec 005 AC-4)`,
      });
    }
    if (!isCurrencyCode(row.currency)) {
      problems.push({
        mode: "float-money",
        file: DATA_FILE,
        subject: `${row.sku} ${row.countryIso2}`,
        reason: `is priced in \`${row.currency}\`, which is not configured in src/config/currencies.ts`,
      });
      continue;
    }
    if (
      row.surchargeKind === null &&
      isActive(row) &&
      !endsInRoundingStyle(row.retailMinor, row.currency)
    ) {
      problems.push({
        mode: "rounding-ending",
        file: DATA_FILE,
        subject: `${row.sku} ${row.tierKey ?? "-"} ${row.countryIso2}`,
        reason: `is priced ${String(row.retailMinor)}, which is not on \`${row.currency}\`'s \`${currencyConfig(row.currency).roundingStyle}\` ending (spec 005 §13 Q1, plan/10 §2.3)`,
      });
    }
  }

  for (const row of input.countryPrices) {
    if (row.surchargeKind !== null || !isActive(row)) continue;
    const destination = destinations.get(row.countryIso2);
    const bandKey = bandKeys.get(row.sku);
    if (destination === undefined || bandKey === undefined) continue;
    const sort = sortOf.get(key([row.sku, row.tierKey]));
    if (sort === undefined) continue;
    const band = destination.bands[bandKey];
    if (band === undefined) continue;
    if (row.retailMinor < band.fromMinor || row.retailMinor > band.toMinor) {
      problems.push({
        mode: "band",
        file: DATA_FILE,
        subject: `${row.sku} ${row.tierKey ?? "-"} ${row.countryIso2}`,
        reason: `prices tier ${String(sort)} at ${String(row.retailMinor)}, outside the plan/10 §2.3 \`${bandKey}\` band ${String(band.fromMinor)}…${String(band.toMinor)} for ${row.countryIso2}: the band is exact and holds for every tier, the "~+30% / +60%" steps bend to fit it (spec 005 §14 A1)`,
      });
    }
  }

  const ladders = new Map<string, { sort: number; minor: number }[]>();
  for (const row of input.countryPrices) {
    if (row.surchargeKind !== null || !isActive(row)) continue;
    const sort = sortOf.get(key([row.sku, row.tierKey]));
    if (sort === undefined) continue;
    const rows = ladders.get(key([row.sku, row.countryIso2])) ?? [];
    rows.push({ sort, minor: row.retailMinor });
    ladders.set(key([row.sku, row.countryIso2]), rows);
  }
  for (const [ladderKey, rows] of ladders) {
    const ordered = [...rows].sort((a, b) => a.sort - b.sort);
    for (const [index, step] of ordered.entries()) {
      const previous = ordered[index - 1];
      if (previous !== undefined && step.minor <= previous.minor) {
        problems.push({
          mode: "band",
          file: DATA_FILE,
          subject: ladderKey,
          reason: `prices tier ${String(step.sort)} at ${String(step.minor)}, not above tier ${String(previous.sort)} at ${String(previous.minor)}: plan/10 §2.3's tier steps are authored rows that increase with \`sort\``,
        });
      }
    }
  }
  return problems;
}

/**
 * Every add-on is priced exactly once, actively, in every destination, and carries the
 * destination's **standard** VAT rate rather than its flower rate.
 *
 * The rate is the point of the row (spec 002 §14 A1 (a), spec 005 §13 Q3): in Poland chocolates
 * are 23% while flowers are 8% (`plan/06` §4 item 4), so an add-on row that copied
 * `flowersVatRateBp` would invoice a mixed basket wrong on the first order and nothing else in
 * the tree would notice.
 */
function checkAddonPrices(input: CatalogueCheckInput): Problem[] {
  const problems: Problem[] = [];
  const destinations = new Map(
    input.destinations.map((destination) => [
      destination.countryIso2,
      destination,
    ]),
  );
  const counts = new Map<string, number>();
  for (const row of input.addonCountryPrices.filter(isActive)) {
    const rowKey = key([row.addonKey, row.countryIso2]);
    counts.set(rowKey, (counts.get(rowKey) ?? 0) + 1);
    if (!Number.isInteger(row.retailMinor)) {
      problems.push({
        mode: "float-money",
        file: DATA_FILE,
        subject: rowKey,
        reason: `is priced ${String(row.retailMinor)}: money is integer minor units, never a float`,
      });
    }
    const destination = destinations.get(row.countryIso2);
    if (destination === undefined) continue;
    if (row.vatRateBp !== destination.standardVatRateBp) {
      problems.push({
        mode: "addon-price",
        file: DATA_FILE,
        subject: rowKey,
        reason: `carries \`vatRateBp\` ${String(row.vatRateBp)}, not ${row.countryIso2}'s standard rate ${String(destination.standardVatRateBp)}${
          destination.flowersVatRateBp === row.vatRateBp
            ? ` — that is the flower rate, and an add-on is not a flower (spec 002 §14 A1 (a), spec 005 §13 Q3, plan/06 §4 item 4)`
            : ` (spec 002 §14 A1 (a), spec 005 §13 Q3)`
        }`,
      });
    }
  }
  for (const iso2 of input.destinationIso2) {
    for (const addon of input.addons) {
      const count = counts.get(key([addon.key, iso2])) ?? 0;
      if (count !== 1) {
        problems.push({
          mode: "addon-price",
          file: DATA_FILE,
          subject: `${addon.key} ${iso2}`,
          reason: `has ${String(count)} active \`addon_country_price\` rows; exactly one is required (spec 002 §14 A1 (a)'s partial unique index, spec 005 §13 Q3 — every add-on is priced per destination with its own \`vatRateBp\`)`,
        });
      }
    }
  }
  return problems;
}

/* -------------------------------------------------------------------------- */
/* plan/10 §2.3's bands, transcribed.                                         */
/* -------------------------------------------------------------------------- */

/**
 * `plan/10` §2.3's band table, transcribed in **major** units: `[floor, ceiling]` per band per
 * currency column.
 *
 * It lives in the gate rather than in a unit test (`/review 37` re-check, TASK-069). The `band`
 * mode below reads each destination's authored `bands` out of `prices.data.ts` and compares a tier
 * amount against it; without this second, independent copy the gate would be checking the dataset
 * against itself, and the way spec 005 §14 A1 actually gets broken is a *band widened to make a
 * ladder fit*. That edit passes every amount check and fails only here.
 *
 * `DE` and `RO` have their own columns in `plan/10` §2.3; `FR`/`ES`/`IT`/`NL` take the EUR base.
 * The RON funeral figure is not in the section: the RON column's own ×5 factor against the EUR
 * base (175/35, 230/46, 305/61, 405/81) applied to 60–180 EUR gives 300–900 lei.
 */
export const PLAN_10_BANDS = {
  EUR_BASE: {
    essential: [35, 45],
    classic: [46, 60],
    premium: [61, 80],
    luxury: [81, 120],
    funeral: [60, 180],
  },
  DE: {
    essential: [39, 49],
    classic: [50, 65],
    premium: [66, 89],
    luxury: [90, 130],
    funeral: [60, 180],
  },
  PL: {
    essential: [149, 189],
    classic: [199, 259],
    premium: [269, 349],
    luxury: [359, 529],
    funeral: [259, 799],
  },
  RO: {
    essential: [175, 225],
    classic: [230, 300],
    premium: [305, 400],
    luxury: [405, 600],
    funeral: [300, 900],
  },
} as const satisfies Readonly<
  Record<string, Readonly<Record<string, readonly [number, number]>>>
>;

/** Which `PLAN_10_BANDS` column a destination is priced from. */
export const PLAN_10_COLUMN: Readonly<
  Record<string, keyof typeof PLAN_10_BANDS>
> = {
  PL: "PL",
  DE: "DE",
  RO: "RO",
  FR: "EUR_BASE",
  ES: "EUR_BASE",
  IT: "EUR_BASE",
  NL: "EUR_BASE",
};

/** The four sub-bands the funeral row is split into, in ascending order. */
const FUNERAL_SUB_BANDS = priceBandKeys.filter((bandKey) =>
  bandKey.startsWith("funeral_"),
);

/**
 * Every destination's authored `bands` are `plan/10` §2.3's, to the cent.
 *
 * The four non-funeral bands are compared outright. The funeral row is one band in `plan/10` and
 * four contiguous sub-bands in the dataset (spec 005 §14 A1's reading), so what is checked is that
 * the sub-bands start at the row's floor, end at its ceiling and step upward without a gap — the
 * property that makes "a funeral piece is never priced below the funeral floor" true.
 */
function checkBandTranscription(input: CatalogueCheckInput): Problem[] {
  const problems: Problem[] = [];
  const major = (minor: number): number => minor / 100;

  for (const destination of input.destinations) {
    const column = PLAN_10_COLUMN[destination.countryIso2];
    if (column === undefined) {
      problems.push({
        mode: "band",
        file: DATA_FILE,
        subject: destination.countryIso2,
        reason: `has no transcribed plan/10 §2.3 band column in \`PLAN_10_COLUMN\`: a new destination states its bands here as well as in the dataset, and the two must agree (spec 005 §14 A1)`,
      });
      continue;
    }
    const table: Readonly<Record<string, readonly [number, number]>> =
      PLAN_10_BANDS[column];

    const plainBands: readonly PriceBandKey[] = [
      "essential",
      "classic",
      "premium",
      "luxury",
    ];
    for (const bandKey of plainBands) {
      const expected = table[bandKey];
      const authored = destination.bands[bandKey];
      if (expected === undefined || authored === undefined) continue;
      if (
        major(authored.fromMinor) !== expected[0] ||
        major(authored.toMinor) !== expected[1]
      ) {
        problems.push({
          mode: "band",
          file: DATA_FILE,
          subject: `${destination.countryIso2} ${bandKey}`,
          reason: `authors the band ${String(major(authored.fromMinor))}…${String(major(authored.toMinor))} while plan/10 §2.3's \`${column}\` column says ${String(expected[0])}…${String(expected[1])}: the band is the founder's stated range and is exact — a ladder that does not fit bends, the band does not (spec 005 §14 A1)`,
        });
      }
    }

    const funeral = table.funeral;
    if (funeral === undefined) continue;
    const subBands = FUNERAL_SUB_BANDS.map(
      (bandKey) => destination.bands[bandKey],
    );
    const first = subBands[0];
    const last = subBands[subBands.length - 1];
    if (first === undefined || last === undefined) continue;
    if (major(first.fromMinor) !== funeral[0]) {
      problems.push({
        mode: "band",
        file: DATA_FILE,
        subject: `${destination.countryIso2} funeral_essential`,
        reason: `starts the funeral ladder at ${String(major(first.fromMinor))} while plan/10 §2.3's funeral row starts at ${String(funeral[0])}`,
      });
    }
    if (major(last.toMinor) !== funeral[1]) {
      problems.push({
        mode: "band",
        file: DATA_FILE,
        subject: `${destination.countryIso2} funeral_luxury`,
        reason: `ends the funeral ladder at ${String(major(last.toMinor))} while plan/10 §2.3's funeral row ends at ${String(funeral[1])}`,
      });
    }
    for (const [index, band] of subBands.entries()) {
      const previous = subBands[index - 1];
      if (band === undefined || previous === undefined) continue;
      if (band.fromMinor <= previous.toMinor) {
        problems.push({
          mode: "band",
          file: DATA_FILE,
          subject: `${destination.countryIso2} ${FUNERAL_SUB_BANDS[index] ?? "-"}`,
          reason: `starts at ${String(band.fromMinor)}, not above the previous sub-band's ceiling ${String(previous.toMinor)}: the four sub-bands partition plan/10 §2.3's single funeral row without a gap or an overlap`,
        });
      }
    }
  }
  return problems;
}

/**
 * `plan/10` §2.3's two surcharge amounts, transcribed **here** rather than read from the dataset:
 * "Sunday surcharge +€4 equivalent; Valentine's/Women's Day surcharge +€6 equivalent".
 *
 * The euro destinations carry the euro figures unchanged. PL takes them at that section's own
 * EUR→PLN add-on parity (balloon €4 = 18 zł, chocolates €6 = 25 zł) and RO at the ×5 factor its
 * own RON band column exhibits (175/35, 230/46, 305/61, 405/81). A gate that read the amounts it
 * is checking would agree with anything, which is why they are typed out again.
 */
export const PLAN_10_SURCHARGES: Readonly<
  Record<string, { readonly sunday: number; readonly peakDay: number }>
> = {
  PL: { sunday: 1800, peakDay: 2500 },
  DE: { sunday: 400, peakDay: 600 },
  FR: { sunday: 400, peakDay: 600 },
  ES: { sunday: 400, peakDay: 600 },
  IT: { sunday: 400, peakDay: 600 },
  RO: { sunday: 2000, peakDay: 3000 },
  NL: { sunday: 400, peakDay: 600 },
};

/**
 * A surcharge row carries the **same** VAT rate as the retail rows it is added to.
 *
 * `/review 47` found the rule documented in `pricing/resolve.ts` and implemented nowhere. It is
 * implemented in both places now, and the split is deliberate: `surchargesOn()` guards the rows a
 * *provider* hands over (a database, from TASK-070), this guards the rows a human **authors**, and
 * only the second one can name the file to fix. A `PricePoint` states one `vatRateBp` over one
 * gross amount (spec 005 §5.2), so a Sunday surcharge at the standard rate added to a bouquet at
 * 8% could only be represented by taxing one of the two wrong — a wrong invoice on a real order
 * (`plan/06` §4), not a rendering bug.
 */
function checkSurchargeVatRates(input: CatalogueCheckInput): Problem[] {
  const problems: Problem[] = [];
  const retailRates = new Map<string, number>();
  for (const row of input.countryPrices) {
    if (row.surchargeKind !== null) continue;
    retailRates.set(key([row.sku, row.countryIso2]), row.vatRateBp);
  }

  for (const row of input.countryPrices) {
    if (row.surchargeKind === null) continue;
    const retail = retailRates.get(key([row.sku, row.countryIso2]));
    if (retail === undefined) continue;
    if (row.vatRateBp !== retail) {
      problems.push({
        mode: "surcharge-vat-rate",
        file: DATA_FILE,
        subject: `${row.sku} ${row.countryIso2} ${row.surchargeKind}`,
        reason: `carries VAT rate ${String(row.vatRateBp)} bp while the retail rows of the same product in ${row.countryIso2} carry ${String(retail)} bp: a surcharge is added to the price it surcharges and is taxed at the same rate, and a \`PricePoint\` can state only one (spec 005 §5.2, plan/06 §4; \`resolvePrice()\` throws on the same pair)`,
      });
    }
  }
  return problems;
}

/**
 * Every destination's authored surcharge amounts are `plan/10` §2.3's +€4 / +€6 equivalents, and
 * every surcharge row carries its destination's authored amount.
 *
 * An exact amount on the date chip *before* the date is chosen is what `plan/07` §4 requires, so
 * the amount is the compliance content of the row: a Sunday row at €40 instead of €4 would be a
 * drip-priced surprise at checkout and every other check here would pass it.
 */
function checkSurchargeAmounts(input: CatalogueCheckInput): Problem[] {
  const problems: Problem[] = [];
  for (const destination of input.destinations) {
    const authored = PLAN_10_SURCHARGES[destination.countryIso2];
    if (authored === undefined) {
      problems.push({
        mode: "surcharge-amount",
        file: DATA_FILE,
        subject: destination.countryIso2,
        reason: `has no transcribed plan/10 §2.3 surcharge equivalent in \`PLAN_10_SURCHARGES\`: a new destination states its +EUR 4 / +EUR 6 equivalents here and in the dataset, and the two must agree`,
      });
      continue;
    }
    if (destination.sundaySurchargeMinor !== authored.sunday) {
      problems.push({
        mode: "surcharge-amount",
        file: DATA_FILE,
        subject: `${destination.countryIso2} sunday`,
        reason: `charges ${String(destination.sundaySurchargeMinor)} ${destination.currency} on a Sunday, not plan/10 §2.3's +EUR 4 equivalent ${String(authored.sunday)}`,
      });
    }
    if (destination.peakDaySurchargeMinor !== authored.peakDay) {
      problems.push({
        mode: "surcharge-amount",
        file: DATA_FILE,
        subject: `${destination.countryIso2} peak_day`,
        reason: `charges ${String(destination.peakDaySurchargeMinor)} ${destination.currency} on a peak day, not plan/10 §2.3's +EUR 6 equivalent ${String(authored.peakDay)}`,
      });
    }
  }

  const destinations = new Map(
    input.destinations.map((destination) => [
      destination.countryIso2,
      destination,
    ]),
  );
  for (const row of input.countryPrices) {
    if (row.surchargeKind === null) continue;
    const destination = destinations.get(row.countryIso2);
    if (destination === undefined) continue;
    const expected =
      row.surchargeKind === "sunday"
        ? destination.sundaySurchargeMinor
        : destination.peakDaySurchargeMinor;
    if (row.retailMinor !== expected) {
      problems.push({
        mode: "surcharge-amount",
        file: DATA_FILE,
        subject: `${row.sku} ${row.countryIso2} ${row.surchargeKind}`,
        reason: `is priced ${String(row.retailMinor)}, not ${row.countryIso2}'s authored \`${row.surchargeKind}\` amount ${String(expected)}: the surcharge is one amount per destination, shown on the date chip (spec 005 §13 Q7, plan/07 §4)`,
      });
    }
  }
  return problems;
}

/** Every facet value on every authored record is a `plan/10` §1.1 taxonomy key. */
function checkFacets(input: CatalogueCheckInput): Problem[] {
  const problems: Problem[] = [];
  const known = (facet: FacetName, value: string): boolean =>
    facetValues[facet].includes(value);
  const report = (subject: string, facet: FacetName, value: string): void => {
    problems.push({
      mode: "facet",
      file: PRODUCTS_FILE,
      subject,
      reason: `carries \`${value}\`, which is not a \`${facet}\` value of plan/10 §1.1 (a facet value is a key from a closed set, never a label — spec 005 §2)`,
    });
  };
  for (const product of input.products) {
    if (!known("productType", product.productType))
      report(product.sku, "productType", product.productType);
    if (!known("style", product.style))
      report(product.sku, "style", product.style);
    if (!known("priceTier", product.priceTier))
      report(product.sku, "priceTier", product.priceTier);
    for (const flower of product.flowerTypes)
      if (!known("flowerType", flower))
        report(product.sku, "flowerType", flower);
    for (const colour of product.colours)
      if (!known("colour", colour)) report(product.sku, "colour", colour);
    for (const occasion of product.occasions)
      if (!known("occasion", occasion))
        report(product.sku, "occasion", occasion);
  }
  for (const category of input.categories) {
    if (!known(category.kind, category.key))
      report(`category ${category.key}`, category.kind, category.key);
  }
  for (const occasion of input.occasions) {
    if (!known("occasion", occasion.key))
      report(`occasion ${occasion.key}`, "occasion", occasion.key);
  }
  return problems;
}

/**
 * Every label key the dataset can emit exists in `messages/en.json` and is spellable there.
 *
 * The second half matters as much as the first: spec 003 closed the message-key alphabet to
 * camelCase identifier segments, so a key like `catalog.facet.occasion.17Mai` could never be
 * authored in the catalogue nor carry a review record — it would render as a raw key forever. The
 * `catalog.*` keys are seeded `retained: true` in `messages/en.meta.json` until TASK-067 renders
 * them (spec 005 AC-22 is that task's).
 */
function checkLabelKeys(input: CatalogueCheckInput): Problem[] {
  const problems: Problem[] = [];
  // Deduplicated by key, not by referrer: `catalog.tier.stems` is referred to by 156 tiers and a
  // missing label is one problem to fix, not 156 lines of log. The first referrer is named so the
  // line still says where the key comes from.
  const seen = new Set<string>();
  const require_ = (subject: string, labelKey: string): void => {
    if (seen.has(labelKey)) return;
    seen.add(labelKey);
    const spellable = labelKey
      .split(".")
      .every((segment) => /^[A-Za-z][A-Za-z0-9]*$/.test(segment));
    if (!spellable) {
      problems.push({
        mode: "label-key",
        file: MESSAGES_FILE,
        subject,
        reason: `refers to \`${labelKey}\`, which spec 003's message-key alphabet cannot spell (every segment must match /^[A-Za-z][A-Za-z0-9]*$/), so no catalogue could ever hold it`,
      });
      return;
    }
    if (!input.messageKeys.has(labelKey)) {
      problems.push({
        mode: "label-key",
        file: MESSAGES_FILE,
        subject,
        reason: `refers to \`${labelKey}\`, which messages/en.json does not have: a missing label renders as a raw key (spec 005 §7)`,
      });
    }
  };

  for (const tier of input.tiers)
    require_(`${tier.sku} ${tier.tierKey}`, tier.labelKey);
  for (const category of input.categories)
    require_(`category ${category.key}`, category.labelKey);
  for (const occasion of input.occasions)
    require_(`occasion ${occasion.key}`, occasion.labelKey);
  for (const addon of input.addons) {
    require_(`addon ${addon.key}`, addon.nameKey);
    require_(`addon ${addon.key}`, addon.descriptionKey);
  }
  for (const kind of ["sunday", "peakDay"]) {
    require_(`surcharge ${kind}`, `catalog.surcharge.${kind}`);
  }
  for (const facet of facetNames) {
    for (const value of usedFacetValues(input, facet)) {
      require_(`facet ${facet}.${value}`, facetLabelKey(facet, value));
    }
  }
  return problems;
}

/**
 * The facet values the seeded dataset actually uses. Phase 4 values that no product carries
 * (`hamper`, `voucher`) need no label yet, and demanding one would be copy nobody reads.
 */
function usedFacetValues(
  input: CatalogueCheckInput,
  facet: FacetName,
): readonly string[] {
  const used = new Set<string>();
  for (const product of input.products) {
    if (facet === "productType") used.add(product.productType);
    if (facet === "style") used.add(product.style);
    if (facet === "priceTier") used.add(product.priceTier);
    if (facet === "flowerType")
      for (const value of product.flowerTypes) used.add(value);
    if (facet === "colour")
      for (const value of product.colours) used.add(value);
    if (facet === "occasion")
      for (const value of product.occasions) used.add(value);
  }
  if (facet === "occasion")
    for (const occasion of input.occasions) used.add(occasion.key);
  return [...used];
}

/** The committed FX snapshot is euro-base, integer, one-dated and covers every currency. */
function checkFxSnapshot(input: CatalogueCheckInput): Problem[] {
  const problems: Problem[] = [];
  for (const rate of input.fxRates) {
    if (rate.base !== FX_BASE_CURRENCY) {
      problems.push({
        mode: "fx-snapshot",
        file: FX_FILE,
        subject: `${rate.base}/${rate.quote}`,
        reason: `is not a euro-base row: the ECB publishes euro reference rates and a cross rate is derived, never authored (spec 005 §13 Q2)`,
      });
    }
    if (rate.base === rate.quote) {
      problems.push({
        mode: "fx-snapshot",
        file: FX_FILE,
        subject: `${rate.base}/${rate.quote}`,
        reason: "is a rate from a currency to itself, which is not a rate",
      });
    }
    if (!Number.isInteger(rate.ratePpm) || rate.ratePpm <= 0) {
      problems.push({
        mode: "fx-snapshot",
        file: FX_FILE,
        subject: `${rate.base}/${rate.quote}`,
        reason: `has \`ratePpm\` ${String(rate.ratePpm)}: a rate is a positive parts-per-million integer, so no float touches the price it converts (spec 005 AC-12)`,
      });
    }
    if (rate.asOf !== FX_SNAPSHOT_AS_OF) {
      problems.push({
        mode: "fx-snapshot",
        file: FX_FILE,
        subject: `${rate.base}/${rate.quote}`,
        reason: `is dated ${rate.asOf} while the snapshot is ${FX_SNAPSHOT_AS_OF}: one snapshot is one publication, or a conversion could mix two days' rates`,
      });
    }
  }
  const quotes = new Set(input.fxRates.map((rate) => rate.quote));
  for (const destination of input.destinations) {
    if (
      destination.currency !== FX_BASE_CURRENCY &&
      !quotes.has(destination.currency)
    ) {
      problems.push({
        mode: "fx-snapshot",
        file: FX_FILE,
        subject: destination.currency,
        reason: `is a destination currency (${destination.countryIso2}) with no rate in the snapshot: its prices could not be displayed in any other currency`,
      });
    }
  }
  return problems;
}

/**
 * Every projection's key set equals spec 002 §5.1's column list, transcribed above — including the
 * three §14 A1 amendments and the key columns of the partial unique indexes. This is the mode that
 * makes the seed's future safe: a column renamed on one side alone fails here today rather than on
 * the day spec 002 is provisioned.
 */
function checkProjections(input: CatalogueCheckInput): Problem[] {
  const problems: Problem[] = [];
  const compare = (
    table: string,
    what: string,
    actual: readonly string[] | undefined,
    expected: readonly string[],
  ): void => {
    if (
      actual === undefined ||
      actual.length !== expected.length ||
      actual.some((column, index) => column !== expected[index])
    ) {
      problems.push({
        mode: "projection-columns",
        file: PROJECTIONS_FILE,
        subject: `${table} ${what}`,
        reason: `is ${JSON.stringify(actual ?? null)} but spec 002 §5.1 says ${JSON.stringify(expected)} (spec 005 AC-5, AC-7)`,
      });
    }
  };

  for (const [table, expected] of Object.entries(SPEC_002_ROW_COLUMNS)) {
    compare(table, "columns", input.projectionColumns[table], expected);
  }
  for (const table of Object.keys(input.projectionColumns)) {
    if (SPEC_002_ROW_COLUMNS[table] === undefined) {
      problems.push({
        mode: "projection-columns",
        file: PROJECTIONS_FILE,
        subject: `${table} columns`,
        reason:
          "is projected but is not a table this check transcribes from spec 002 §5.1: add it to `SPEC_002_ROW_COLUMNS` in the same PR as the projection",
      });
    }
  }
  for (const [table, expected] of Object.entries(
    SPEC_002_UNIQUE_INDEX_COLUMNS,
  )) {
    compare(
      table,
      "unique index",
      input.projectionIndexColumns[table],
      expected,
    );
  }

  // The three projections this task owns, exercised on a real row: a projection whose *output*
  // keys drift from its declared column list would otherwise pass the comparison above.
  const price = input.countryPrices[0];
  if (price !== undefined) {
    compare(
      "country_price",
      "projected row",
      Object.keys(toCountryPriceRow(price, { productId: "p", countryId: "c" })),
      COUNTRY_PRICE_ROW_COLUMNS,
    );
  }
  const addonPrice = input.addonCountryPrices[0];
  if (addonPrice !== undefined) {
    compare(
      "addon_country_price",
      "projected row",
      Object.keys(
        toAddonCountryPriceRow(addonPrice, { addonId: "a", countryId: "c" }),
      ),
      ADDON_COUNTRY_PRICE_ROW_COLUMNS,
    );
  }
  const rate = input.fxRates[0];
  if (rate !== undefined) {
    compare(
      "fx_rate",
      "projected row",
      Object.keys(toFxRateRow(rate)),
      FX_RATE_ROW_COLUMNS,
    );
  }
  compare(
    "country_price",
    "active index",
    COUNTRY_PRICE_ACTIVE_INDEX_COLUMNS,
    SPEC_002_UNIQUE_INDEX_COLUMNS.country_price ?? [],
  );
  compare(
    "addon_country_price",
    "active index",
    ADDON_COUNTRY_PRICE_ACTIVE_INDEX_COLUMNS,
    SPEC_002_UNIQUE_INDEX_COLUMNS.addon_country_price ?? [],
  );
  compare(
    "product_tier",
    "default index",
    PRODUCT_TIER_DEFAULT_INDEX_COLUMNS,
    SPEC_002_UNIQUE_INDEX_COLUMNS.product_tier ?? [],
  );
  return problems;
}

/**
 * The priced destinations and `src/config/countries.ts`'s `live`/`demo` destinations are the same
 * set. A country flip is a data change (`CLAUDE.md`), and this is what makes the *price* half of
 * that flip impossible to forget.
 */
function checkDestinations(input: CatalogueCheckInput): Problem[] {
  const problems: Problem[] = [];
  const priced = new Set(
    input.destinations.map((destination) => destination.countryIso2),
  );
  for (const iso2 of input.destinationIso2) {
    if (!priced.has(iso2)) {
      problems.push({
        mode: "destination-drift",
        file: DATA_FILE,
        subject: iso2,
        reason:
          "is a `live` or `demo` destination in src/config/countries.ts with no authored pricing: a destination that can be chosen must have a currency, VAT rates, bands and add-on prices",
      });
    }
  }
  for (const iso2 of priced) {
    if (!input.destinationIso2.includes(iso2)) {
      problems.push({
        mode: "destination-drift",
        file: DATA_FILE,
        subject: iso2,
        reason:
          "is priced but is not a `live` or `demo` destination in src/config/countries.ts: a price for a country nobody can send to prices nothing",
      });
    }
  }
  return problems;
}

/* -------------------------------------------------------------------------- */
/* CRD Art. 22: an add-on cannot default to selected (spec 005 §8, AC-19).     */
/* -------------------------------------------------------------------------- */

/**
 * The field names an add-on may never carry, transcribed **here** rather than imported from
 * `src/modules/catalog/schemas.ts` — the same reason spec 002 §5.1's column sets are transcribed
 * above: a gate that imported the list it is checking would agree with anything. `tests/unit/
 * catalogue-check.test.ts` pins the module's list against this one, so neither can be edited
 * alone.
 *
 * CRD Art. 22 forbids a pre-ticked extra (`plan/07` §2.1), and spec 005 discharges it **by
 * absence**: there is no field to set. This mode is the half of AC-19 that makes the absence
 * enforced rather than observed — declaring one of these on an add-on, or authoring one on a row,
 * fails `pnpm catalogue:check`.
 */
export const FORBIDDEN_ADDON_FIELD_NAMES: readonly string[] = [
  "defaultSelected",
  "preselected",
  "defaultOn",
  "selected",
  "checked",
];

/** `readonly foo:`, `foo?:`, `foo:` — a field *declaration*, not a mention in prose or a string. */
function declaresField(source: string, field: string): boolean {
  return new RegExp(
    `^[\\t ]*(?:readonly[\\t ]+)?${field}[\\t ]*\\??[:]`,
    "m",
  ).test(source);
}

/**
 * No add-on can default to selected, and every add-on price carries its own VAT rate (AC-19).
 *
 * Three things are checked, and they are the three halves AC-19 names:
 *
 *  1. **No authored add-on row carries a preselection field.** The dataset's `AddonDataSchema` is
 *     `.strict()`, so this is already a parse error at module load — which is the stronger
 *     guarantee and the reason it is there. This check exists because a `.strict()` schema can be
 *     loosened in the same commit that adds the field, and then nothing else would notice.
 *  2. **No source that declares an add-on's fields declares one either** — the dataset schema and
 *     data file, and the catalogue module's `Addon` read model and `AddonSchema`. A field that
 *     TypeScript accepts is invisible to a value-level check, so the declaration is read as text.
 *  3. **Every add-on price row carries a `vatRateBp`** (spec 002 §14 A1 (a), spec 005 §13 Q3): an
 *     add-on with no rate of its own would inherit the country's flower rate and invoice the
 *     first mixed PL basket at 8% instead of 23% (`plan/06` §4 item 4).
 */
function checkAddonPreselection(input: CatalogueCheckInput): Problem[] {
  const problems: Problem[] = [];

  for (const addon of input.addons) {
    for (const field of Object.keys(addon)) {
      if (!FORBIDDEN_ADDON_FIELD_NAMES.includes(field)) continue;
      problems.push({
        mode: "addon-preselection",
        file: ADDONS_FILE,
        subject: `${addon.key}.${field}`,
        reason:
          "carries a preselection field: an add-on has no such field to set, because CRD Art. 22 forbids a pre-ticked extra (`plan/07` §2.1, spec 005 §8, AC-19)",
      });
    }
  }

  for (const [file, source] of Object.entries(input.addonFieldSources)) {
    for (const field of FORBIDDEN_ADDON_FIELD_NAMES) {
      if (!declaresField(source, field)) continue;
      problems.push({
        mode: "addon-preselection",
        file,
        subject: field,
        reason:
          "is declared on an add-on shape: CRD Art. 22 is discharged by absence, so the field may not exist at all (spec 005 §8, AC-19)",
      });
    }
  }

  for (const row of input.addonCountryPrices) {
    if (typeof row.vatRateBp === "number") continue;
    problems.push({
      mode: "addon-preselection",
      file: DATA_FILE,
      subject: key([row.addonKey, row.countryIso2]),
      reason:
        "carries no `vatRateBp`: every add-on is priced with its own VAT rate (spec 002 §14 A1 (a), spec 005 §13 Q3, AC-19)",
    });
  }

  return problems;
}

/** Every check, in reporting order. */
export function checkCatalogue(input: CatalogueCheckInput): Problem[] {
  return [
    ...checkTiers(input),
    ...checkDestinations(input),
    ...checkPriceCoverage(input),
    ...checkAmounts(input),
    ...checkAddonPrices(input),
    ...checkBandTranscription(input),
    ...checkSurchargeAmounts(input),
    ...checkSurchargeVatRates(input),
    ...checkFacets(input),
    ...checkLabelKeys(input),
    ...checkFxSnapshot(input),
    ...checkProjections(input),
    ...checkAddonPreselection(input),
  ];
}

/* -------------------------------------------------------------------------- */
/* Reporting.                                                                 */
/* -------------------------------------------------------------------------- */

export function formatProblems(problems: readonly Problem[]): string {
  return problems
    .map(
      (problem) =>
        `${problem.file}: [${problem.mode}] \`${problem.subject}\` ${problem.reason}`,
    )
    .join("\n");
}

/**
 * The per-destination coverage table AC-5 requires in the step summary: the cheapest early
 * warning that a country flip would produce pages with no price (spec 005 §11).
 */
export function coverageTable(
  input: CatalogueCheckInput,
  now = new Date(),
): string {
  const lines: string[] = [
    "| destination | status | currency | VAT flowers / standard | products | tier rows | surcharge rows | add-ons |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const iso2 of input.destinationIso2) {
    const destination = input.destinations.find(
      (candidate) => candidate.countryIso2 === iso2,
    );
    const rows = input.countryPrices.filter(
      (row) => row.countryIso2 === iso2 && isActive(row),
    );
    const retail = rows.filter((row) => row.surchargeKind === null);
    const status =
      COUNTRIES.find((country) => country.iso2 === iso2)?.status ?? "unknown";
    const addons = input.addonCountryPrices.filter(
      (row) => row.countryIso2 === iso2 && isActive(row),
    );
    lines.push(
      `| ${iso2} | ${status} | ${destination?.currency ?? "—"} | ${
        destination === undefined
          ? "—"
          : `${String(destination.flowersVatRateBp)} / ${String(destination.standardVatRateBp)} bp`
      } | ${String(new Set(retail.map((row) => row.sku)).size)} | ${String(retail.length)} | ${String(
        input.countryPrices.filter(
          (row) => row.countryIso2 === iso2 && row.surchargeKind !== null,
        ).length,
      )} | ${String(addons.length)} |`,
    );
  }
  const age = fxSnapshotAgeHours(now);
  lines.push(
    "",
    `FX snapshot: ${FX_SNAPSHOT_AS_OF} (${String(input.fxRates.length)} euro-base rates, ${String(age)} h old)${
      isFxSnapshotStale(now)
        ? " — **stale**: past `MAX_FX_AGE_HOURS`, so `fxRateFor()` fails closed and prices display in the destination's own currency (spec 005 AC-15). Refresh the snapshot or land TASK-071."
        : ""
    }`,
  );
  return lines.join("\n");
}

function main(argv: readonly string[]): number {
  const input = catalogueCheckInput();
  const problems = checkCatalogue(input);
  const table = coverageTable(input);

  if (problems.length > 0) {
    console.error(
      `${CLI_NAME} failed with ${String(problems.length)} problem(s):`,
    );
    console.error(formatProblems(problems));
  } else {
    console.log(
      `${CLI_NAME}: ${String(input.products.length)} products, ${String(input.countryPrices.length)} country_price rows, ${String(input.addonCountryPrices.length)} addon_country_price rows, ${String(input.fxRates.length)} fx rates — clean.`,
    );
    console.log(table);
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (argv.includes("--summary") && summaryPath !== undefined) {
    const verdict =
      problems.length === 0 ? "clean" : `${String(problems.length)} problem(s)`;
    appendFileSync(
      summaryPath,
      [
        "",
        `#### \`${CLI_NAME}\` — ${verdict}`,
        "",
        table,
        "",
        ...(problems.length > 0
          ? ["```", formatProblems(problems), "```", ""]
          : []),
      ].join("\n"),
    );
  }
  return problems.length === 0 ? 0 : 1;
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  process.exitCode = main(process.argv.slice(2));
}
