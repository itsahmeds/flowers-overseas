/**
 * The database seed plan (spec 002 §2 "Seed", AC-29, AC-32; `plan/10` §2, §4; TASK-026).
 *
 * Pure: config and the projected dataset in, an ordered list of table plans out. No database, no
 * clock, no environment — `seed/index.ts` is the writer. Every row is the projection a later spec
 * already pinned (ADR-0017: `src/config/catalogue/` is the single authored source and
 * `seed/data/` its projection), so this file adds no second copy of a product, a price or a
 * locale. What it does author is the little the dataset has no file for, each piece named:
 *
 *  - **country operational columns** (`DEMO_COUNTRY_ZONES`): `country.iana_zone` is `NOT NULL`,
 *    and only Poland has an authored operations block (spec 009 §13 Q3, founder 2026-09-16).
 *    The other six get their capital's tzdb zone and **no** cutoff: there is no global default
 *    cutoff, so `same_day_cutoff_local` stays null rather than copying `plan/10` §2.5's figures
 *    for countries with no florist (TASK-026 brief, Escalations E2);
 *  - **demo cities and partners** (`plan/10` §2.4): three `Demo Florist {City} {n}` per seeded
 *    country, `status = demo`, capacity 15/day, covering the capital, with a payout mapping for
 *    every tier of all 84 products at `plan/10` §2.3's payout share of the active retail price.
 *
 * **A country's status is `src/config/countries.ts`'s** (spec 012b §5.1 "Seed", AC-2; TASK-292):
 * the seed's country projection agrees with the registry the static providers read, so the
 * database and the static country registry give the same page for every URL (`pnpm
 * catalogue:parity`). Spec 002's "every seeded country is `demo`" (AC-32) held while the registry
 * said so; it is the registry's value now, whatever Poland's is at the cutover. `status` is
 * written **on insert only** (`insertOnlyColumns`): on an existing row it is the admin's data flip
 * (spec 012's `status_flip_guard()` refuses any other path), so a seed never moves it, and a row
 * that disagrees with the registry is what `catalogue:parity` reports.
 *
 * §6's thin-content rule: `de` and `pl` product translations are **absent** — the dataset's
 * machine drafts for those locales are never written to the database — and the seed writes no
 * `review`, `delivery_proof` or `media_asset` row (imagery is spec 006's).
 */
import {
  COUNTRIES,
  type CountryConfig,
  toCountryRow,
} from "../src/config/countries.ts";
import { CURRENCIES, toCurrencyRow } from "../src/config/currencies.ts";
import { destinationPricingFor } from "../src/config/catalogue/prices.data.ts";
import {
  launchLocales,
  localeConfig,
  toLocaleRow,
} from "../src/config/locales.ts";
import { toCountryHolidayRow } from "../src/modules/geo/delivery/projections.ts";

import type { SeedTree } from "./check.ts";
import { datasetRows } from "./diff.ts";
import { HolidaysFileSchema, ProductsFileSchema } from "./schema/index.ts";
import type { SeedRow } from "./target.ts";

/** The groups `--only` selects, in dependency order. */
export const SEED_GROUPS = ["reference", "geo", "catalog", "partners"] as const;
export type SeedGroup = (typeof SEED_GROUPS)[number];

/** A value resolved at write time from a parent table's natural key. */
export interface SeedRef {
  readonly ref:
    "country" | "product" | "addon" | "occasion" | "city" | "partner";
  readonly key: string;
}

export type SeedCell =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | Readonly<Record<string, unknown>>
  | SeedRef;

export type SeedDbRow = Readonly<Record<string, SeedCell>>;

/** One table's rows and the natural key they are upserted on. */
export interface SeedTablePlan {
  readonly group: SeedGroup;
  readonly table: string;
  /** The columns that identify a row (after refs resolve). */
  readonly key: readonly string[];
  /** True when the table has `source`: a `real` row is never updated. */
  readonly sourceGuarded: boolean;
  /**
   * Columns written when the row is inserted and never updated afterwards (spec 012b §5.1
   * "Seed"): `country.status`, which only admin changes once the row exists.
   */
  readonly insertOnlyColumns?: readonly string[];
  readonly rows: readonly SeedDbRow[];
}

/**
 * The invoice profiles (spec 018 §5.1, §7 "Invoice wording", AC-18; TASK-337). One **active**
 * `principal/PL` profile: a VAT invoice labelled in Polish plus the order's locale (`{buyer}`),
 * VAT on products, add-ons and surcharges, and a PLN VAT line at the NBP rate of the previous
 * business day (§13 Q5). One **inactive** `agent/PL` fixture with no issuer statement, which only
 * an SQL flip activates, and only after the founder's decision (§13 Q18). The numbering series
 * they name are `0021_post_purchase`'s rows; the profiles are seeded here because they reference
 * the seeded `currency` table. `active` is written on insert only.
 */
export const INVOICE_PROFILES: readonly SeedDbRow[] = [
  {
    key: "principal-pl",
    supply_model: "principal",
    destination_iso2: "PL",
    document_kind: "vat_invoice",
    title_key: "invoice.title.vatInvoice",
    issuer_statement_key: null,
    label_locales: ["pl", "{buyer}"],
    vat_bearing_line_kinds: ["product", "addon", "surcharge"],
    series_key: "fo-pl-2026",
    credit_series_key: "fok-pl-2026",
    vat_currency_code: "PLN",
    vat_rate_source: "nbp_previous_business_day",
    active: true,
  },
  {
    key: "agent-pl",
    supply_model: "agent",
    destination_iso2: "PL",
    document_kind: "receipt_on_behalf",
    title_key: "invoice.title.receiptOnBehalf",
    issuer_statement_key: null,
    label_locales: ["pl", "{buyer}"],
    vat_bearing_line_kinds: ["surcharge"],
    series_key: "fo-pl-2026",
    credit_series_key: "fok-pl-2026",
    vat_currency_code: "PLN",
    vat_rate_source: "nbp_previous_business_day",
    active: false,
  },
];

/** Locales whose product translations the seed writes; `de`/`pl` stay absent (§6). */
export const SEEDED_TRANSLATION_LOCALES = ["en", "en-gb"] as const;

/** `product_translation`'s review columns: written on insert only, and always unreviewed. */
export const REVIEW_COLUMNS = [
  "reviewed",
  "reviewed_by",
  "reviewed_at",
] as const;

/** The seeded partners per country (`plan/10` §2.4: 3–5). */
export const DEMO_PARTNERS_PER_COUNTRY = 3;
/** `plan/10` §2.4. */
export const DEMO_PARTNER_CAPACITY_PER_DAY = 15;

/**
 * The demo city of each seeded country — its capital, where the demo partners sit — and the
 * country's tzdb zone where no operations block is authored (see the header).
 */
export const DEMO_COUNTRY_ZONES: Readonly<
  Record<
    string,
    {
      readonly ianaZone: string;
      readonly city: { readonly slug: string; readonly name: string };
    }
  >
> = {
  PL: {
    ianaZone: "Europe/Warsaw",
    city: { slug: "warsaw", name: "Warszawa" },
  },
  DE: { ianaZone: "Europe/Berlin", city: { slug: "berlin", name: "Berlin" } },
  FR: { ianaZone: "Europe/Paris", city: { slug: "paris", name: "Paris" } },
  ES: { ianaZone: "Europe/Madrid", city: { slug: "madrid", name: "Madrid" } },
  IT: { ianaZone: "Europe/Rome", city: { slug: "rome", name: "Roma" } },
  RO: {
    ianaZone: "Europe/Bucharest",
    city: { slug: "bucharest", name: "București" },
  },
  NL: {
    ianaZone: "Europe/Amsterdam",
    city: { slug: "amsterdam", name: "Amsterdam" },
  },
};

/** `plan/10` §2.3 "Florist payout share", in basis points, by price band. */
export const PAYOUT_SHARE_BP: Readonly<Record<string, number>> = {
  essential: 5500,
  classic: 5800,
  premium: 6000,
  luxury: 6200,
  funeral: 6000,
};

/** The payout for a retail price at a share, rounded down to a whole minor unit. */
export function payoutMinor(retailMinor: number, shareBp: number): number {
  return Math.floor((retailMinor * shareBp) / 10_000);
}

/** A demo partner's natural key: `demo-pl-1`. */
export function demoPartnerCode(iso2: string, n: number): string {
  return `demo-${iso2.toLowerCase()}-${String(n)}`;
}

/** A city's natural key across tables: `PL/warsaw` (country + its `en` slug). */
export function cityKey(iso2: string, slug: string): string {
  return `${iso2}/${slug}`;
}

function ref(kind: SeedRef["ref"], key: string): SeedRef {
  return { ref: kind, key };
}

function countryRow(country: CountryConfig): SeedDbRow {
  const pricing = destinationPricingFor(country.iso2);
  const ops = country.operations;
  const fallback = DEMO_COUNTRY_ZONES[country.iso2];
  const ianaZone = ops?.ianaZone ?? fallback?.ianaZone;
  if (ianaZone === undefined) {
    throw new Error(
      `seed: country ${country.iso2} has no IANA zone (no operations block, no DEMO_COUNTRY_ZONES entry)`,
    );
  }
  const projected = toCountryRow(country);
  return {
    iso2: projected.iso2,
    status: projected.status,
    currency_code: pricing.currency,
    vat_rate_bp: pricing.flowersVatRateBp,
    iana_zone: ianaZone,
    same_day_cutoff_local: ops?.sameDayCutoffLocal ?? null,
    delivery_days: (ops?.deliveryDays ?? []).map(String),
    sunday_delivery: ops?.sundayDelivery ?? "none",
    guide_published: projected.guide_published,
    source: "seed",
  };
}

/** Rows of `datasetRows()` for one table, with the surrogate refs put back. */
function datasetTable(
  rows: readonly SeedRow[],
  table: string,
  toRow: (row: SeedRow) => SeedDbRow | undefined,
): SeedDbRow[] {
  return rows
    .filter((row) => row.table === table)
    .map(toRow)
    .filter((row): row is SeedDbRow => row !== undefined);
}

function values(row: SeedRow): Record<string, SeedCell> {
  return { ...(row.values as Record<string, SeedCell>) };
}

/**
 * The whole plan, in dependency order. `tree` is `readSeedTree(root)`.
 */
export function buildSeedPlan(tree: SeedTree): readonly SeedTablePlan[] {
  const dataset = datasetRows(tree);
  const countries = COUNTRIES;
  const seededIso2 = new Set<string>(countries.map((country) => country.iso2));

  const reference: SeedTablePlan[] = [
    {
      group: "reference",
      table: "locale",
      key: ["code"],
      sourceGuarded: false,
      rows: launchLocales.map((code) => {
        const row = toLocaleRow(localeConfig(code));
        return {
          code: row.code,
          bcp47: row.bcp47,
          name: row.name,
          is_launch: row.is_launch,
          rtl: row.rtl,
          fallback_code: row.fallback_code,
        };
      }),
    },
    {
      group: "reference",
      table: "currency",
      key: ["code"],
      sourceGuarded: false,
      rows: CURRENCIES.map((currency) => {
        const row = toCurrencyRow(currency);
        return {
          code: row.code,
          minor_unit_exponent: row.minor_unit_exponent,
          rounding_style: row.rounding_style,
        };
      }),
    },
    {
      group: "reference",
      table: "invoice_profile",
      key: ["key"],
      sourceGuarded: false,
      // Which profile is active is a data flip (spec 018 AC-18, §13 Q18), never undone by a seed.
      insertOnlyColumns: ["active"],
      rows: INVOICE_PROFILES,
    },
  ];

  const holidaysRaw = tree.raw.get("holidays.json");
  const holidays =
    holidaysRaw === undefined
      ? { rows: [] }
      : HolidaysFileSchema.parse(holidaysRaw);
  const geo: SeedTablePlan[] = [
    {
      group: "geo",
      table: "country",
      key: ["iso2"],
      sourceGuarded: true,
      insertOnlyColumns: ["status"],
      rows: countries.map(countryRow),
    },
    {
      group: "geo",
      table: "country_holiday",
      key: ["country_id", "date"],
      sourceGuarded: false,
      rows: holidays.rows
        .filter((holiday) => seededIso2.has(holiday.iso2))
        .map((holiday) => {
          const row = toCountryHolidayRow(holiday);
          return {
            country_id: ref("country", row.iso2),
            date: row.date,
            name: row.name,
            closed: row.closed,
          };
        }),
    },
    {
      group: "geo",
      table: "occasion",
      key: ["key"],
      sourceGuarded: false,
      rows: datasetTable(dataset, "occasion", values),
    },
    {
      group: "geo",
      table: "occasion_country",
      key: ["occasion_id", "country_id"],
      sourceGuarded: false,
      rows: datasetTable(dataset, "occasion_country", (row) =>
        seededIso2.has(row.key["country"] ?? "")
          ? {
              occasion_id: ref("occasion", row.key["occasion"] ?? ""),
              country_id: ref("country", row.key["country"] ?? ""),
              ...values(row),
              // The projection writes `null` for a `none` rule; the column is `NOT NULL DEFAULT
              // '{}'` (`0002`), whose empty object is the same "no rule".
              rule: (values(row)["rule"] ?? {}) as SeedCell,
            }
          : undefined,
      ),
    },
    {
      group: "geo",
      table: "city",
      key: ["country_id", "slug"],
      sourceGuarded: false,
      rows: countries.map((country) => ({
        country_id: ref("country", country.iso2),
        slug: DEMO_COUNTRY_ZONES[country.iso2]?.city.slug ?? "",
        name: DEMO_COUNTRY_ZONES[country.iso2]?.city.name ?? "",
      })),
    },
  ];

  // The facets spec 002 §5.1's `product` row has no column for (TASK-070): the flower types and
  // colours after the primary and the allergen attribute (`0026_product_facets`), and the occasion
  // set, which is `product_occasion`. Read from the authored products file the projection reads.
  const productsRaw = tree.raw.get("products.json");
  const authoredProducts =
    productsRaw === undefined ? [] : ProductsFileSchema.parse(productsRaw).rows;
  const facetsBySku = new Map(
    authoredProducts.map((product) => [product.sku, product]),
  );

  const catalog: SeedTablePlan[] = [
    {
      group: "catalog",
      table: "category",
      key: ["key"],
      sourceGuarded: false,
      rows: datasetTable(dataset, "category", values),
    },
    {
      group: "catalog",
      table: "product",
      key: ["sku"],
      sourceGuarded: true,
      rows: datasetTable(dataset, "product", (row) => {
        const product = facetsBySku.get(row.key["sku"] ?? "");
        if (product === undefined) {
          throw new Error(
            `seed: product ${row.key["sku"] ?? ""} is projected but absent from products.json`,
          );
        }
        return {
          ...values(row),
          other_flowers: product.flowerTypes.slice(1),
          other_colours: product.colours.slice(1),
          allergen_note: product.allergenNote,
        };
      }),
    },
    {
      group: "catalog",
      table: "product_occasion",
      key: ["product_id", "occasion_id"],
      sourceGuarded: false,
      rows: authoredProducts.flatMap((product) =>
        product.occasions.map((occasion, sort) => ({
          product_id: ref("product", product.sku),
          occasion_id: ref("occasion", occasion),
          sort,
        })),
      ),
    },
    {
      group: "catalog",
      table: "product_translation",
      key: ["product_id", "locale_code"],
      sourceGuarded: false,
      // The review columns belong to the ledger (spec 012b §2.4; TASK-293): a translation goes in
      // unreviewed and `attest()` — the replay of `seed/data/attestations.json` at the end of the
      // run — is what may mark it reviewed. They are never updated here, so a rerun cannot
      // un-review an attested row (`review_write_guard()` would refuse it anyway).
      insertOnlyColumns: [...REVIEW_COLUMNS],
      rows: datasetTable(dataset, "product_translation", (row) =>
        (SEEDED_TRANSLATION_LOCALES as readonly string[]).includes(
          row.key["locale"] ?? "",
        )
          ? {
              product_id: ref("product", row.key["sku"] ?? ""),
              ...values(row),
              reviewed: false,
              reviewed_by: null,
              reviewed_at: null,
            }
          : undefined,
      ),
    },
    {
      group: "catalog",
      table: "product_tier",
      key: ["product_id", "tier_key"],
      sourceGuarded: false,
      rows: datasetTable(dataset, "product_tier", (row) => ({
        product_id: ref("product", row.key["sku"] ?? ""),
        ...values(row),
      })),
    },
    {
      group: "catalog",
      table: "addon",
      key: ["key"],
      sourceGuarded: false,
      rows: datasetTable(dataset, "addon", values),
    },
    {
      group: "catalog",
      table: "country_price",
      key: [
        "product_id",
        "country_id",
        "tier_key",
        "surcharge_kind",
        "active_from",
      ],
      sourceGuarded: true,
      rows: datasetTable(dataset, "country_price", (row) =>
        seededIso2.has(row.key["country"] ?? "")
          ? {
              product_id: ref("product", row.key["sku"] ?? ""),
              country_id: ref("country", row.key["country"] ?? ""),
              ...values(row),
            }
          : undefined,
      ),
    },
    {
      group: "catalog",
      table: "addon_country_price",
      key: ["addon_id", "country_id", "active_from"],
      sourceGuarded: false,
      rows: datasetTable(dataset, "addon_country_price", (row) =>
        seededIso2.has(row.key["country"] ?? "")
          ? {
              addon_id: ref("addon", row.key["addon"] ?? ""),
              country_id: ref("country", row.key["country"] ?? ""),
              ...values(row),
            }
          : undefined,
      ),
    },
  ];

  // Partners: three per country, the capital, a mapping per (product, tier) at the share of the
  // active retail price in the country's currency.
  const bandOf = new Map<string, string>();
  for (const row of dataset) {
    if (row.table !== "product") continue;
    const productType = row.values["product_type"];
    const band =
      productType === "funeral" ? "funeral" : row.values["price_tier"];
    bandOf.set(row.key["sku"] ?? "", String(band));
  }
  const retail = new Map<string, number>();
  for (const row of dataset) {
    if (
      row.table !== "country_price" ||
      row.values["surcharge_kind"] !== null ||
      row.values["active_to"] !== null
    ) {
      continue;
    }
    retail.set(
      `${row.key["country"] ?? ""}|${row.key["sku"] ?? ""}|${row.key["tier"] ?? ""}`,
      Number(row.values["retail_minor"]),
    );
  }
  const tiersBySku = new Map<string, string[]>();
  for (const row of dataset) {
    if (row.table !== "product_tier") continue;
    const sku = row.key["sku"] ?? "";
    tiersBySku.set(sku, [
      ...(tiersBySku.get(sku) ?? []),
      row.key["tier"] ?? "",
    ]);
  }

  const partners: SeedDbRow[] = [];
  const coverage: SeedDbRow[] = [];
  const mappings: SeedDbRow[] = [];
  for (const country of countries) {
    const demo = DEMO_COUNTRY_ZONES[country.iso2];
    if (demo === undefined) continue;
    const currency = destinationPricingFor(country.iso2).currency;
    for (let n = 1; n <= DEMO_PARTNERS_PER_COUNTRY; n += 1) {
      const code = demoPartnerCode(country.iso2, n);
      partners.push({
        code,
        legal_name: `Demo Florist ${demo.city.name} ${String(n)}`,
        city_label: demo.city.name,
        country_id: ref("country", country.iso2),
        status: "demo",
        contact_email: `${code}@demo.flowersoverseas.invalid`,
        payout_currency_code: currency,
        capacity_per_day: DEMO_PARTNER_CAPACITY_PER_DAY,
        source: "seed",
      });
      coverage.push({
        partner_id: ref("partner", code),
        city_id: ref("city", cityKey(country.iso2, demo.city.slug)),
        postcode_zone_id: null,
        capacity_per_day: DEMO_PARTNER_CAPACITY_PER_DAY,
      });
      for (const [sku, tiers] of tiersBySku) {
        const share = PAYOUT_SHARE_BP[bandOf.get(sku) ?? ""];
        if (share === undefined) {
          throw new Error(`seed: product ${sku} has no payout share band`);
        }
        for (const tier of tiers) {
          const price = retail.get(`${country.iso2}|${sku}|${tier}`);
          if (price === undefined) continue;
          mappings.push({
            partner_id: ref("partner", code),
            product_id: ref("product", sku),
            tier_key: tier,
            can_fulfil: true,
            partner_payout_minor: payoutMinor(price, share),
            currency_code: currency,
            source: "seed",
          });
        }
      }
    }
  }

  const partnerPlans: SeedTablePlan[] = [
    {
      group: "partners",
      table: "fulfillment_partner",
      key: ["code"],
      sourceGuarded: true,
      rows: partners,
    },
    {
      group: "partners",
      table: "partner_coverage",
      key: ["partner_id", "city_id", "postcode_zone_id"],
      sourceGuarded: false,
      rows: coverage,
    },
    {
      group: "partners",
      table: "partner_catalog_mapping",
      key: ["partner_id", "product_id", "tier_key"],
      sourceGuarded: true,
      rows: mappings,
    },
  ];

  return [...reference, ...geo, ...catalog, ...partnerPlans];
}
