/**
 * `pnpm catalogue:parity`, the catalogue and price half (spec 012b §2.2 "Parity before the switch",
 * AC-2's catalogue and price half, T-02; TASK-294).
 *
 * The URL fingerprint AC-2 names (status, robots, canonical, hreflang, sitemap membership, the
 * visible default price and currency, JSON-LD `Offer.price`) is a pure function of the rows the
 * catalogue providers hand over: the module resolves every one of them from the same rows under
 * either provider (`src/modules/catalog/providers.ts`). So two sources give every URL the same
 * fingerprint exactly when they hand over the same rows, and a differing row is reported with
 * every URL whose fingerprint it feeds:
 *
 *  - a product's `status`, or one of its sizes (`tier_key`, `label_key`, `stems`, `sort`,
 *    `is_default`): that product's page in every locale of every destination it is priced in;
 *  - a `country_price` row (amount, currency, VAT rate, dates), keyed by SKU, destination, size,
 *    surcharge kind and start date: that product's page in that destination in every locale, and
 *    the destination's shop root, whose grid prints the default price.
 *
 * Read-only against the target, node-runnable (no `@/` import), one `SELECT` per table in one
 * read-only transaction.
 */
import type postgres from "postgres";

import { COUNTRIES } from "../src/config/countries.ts";
import { COUNTRY_PRICES } from "../src/config/catalogue/prices.data.ts";
import { PRODUCTS } from "../src/config/catalogue/products.data.ts";
import { PRODUCT_TIERS } from "../src/config/catalogue/tiers.data.ts";
import { launchLocales } from "../src/config/locales.ts";
import { listingPath, productPath } from "../src/modules/i18n/routing.ts";

/** One row of either source, as comparable text: a natural key and its fields. */
export interface ParityRow {
  readonly table: "product" | "product_tier" | "country_price";
  readonly key: string;
  readonly sku: string;
  /** The destination of a price row; `undefined` for a product or a size. */
  readonly iso2?: string;
  readonly fields: Readonly<Record<string, string>>;
}

/** One difference: the row, the field, both values and every URL it feeds. */
export interface CatalogueParityDifference {
  readonly table: ParityRow["table"];
  readonly key: string;
  readonly field: string;
  readonly static: string | undefined;
  readonly database: string | undefined;
  readonly urls: readonly string[];
}

const text = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

/** The repository's rows: what the static providers hand over. */
export function staticCatalogueRows(): readonly ParityRow[] {
  return [
    ...PRODUCTS.map((product): ParityRow => ({
      table: "product",
      key: product.sku,
      sku: product.sku,
      fields: { status: product.status },
    })),
    ...PRODUCT_TIERS.map((tier): ParityRow => ({
      table: "product_tier",
      key: `${tier.sku}|${tier.tierKey}`,
      sku: tier.sku,
      fields: {
        label_key: tier.labelKey,
        stems: text(tier.stems),
        sort: text(tier.sort),
        is_default: text(tier.isDefault),
      },
    })),
    ...COUNTRY_PRICES.map((price): ParityRow => ({
      table: "country_price",
      key: [
        price.sku,
        price.countryIso2,
        text(price.tierKey),
        text(price.surchargeKind),
        price.activeFrom,
      ].join("|"),
      sku: price.sku,
      iso2: price.countryIso2,
      fields: {
        retail_minor: text(price.retailMinor),
        currency: price.currency,
        vat_rate_bp: text(price.vatRateBp),
        active_to: text(price.activeTo),
      },
    })),
  ];
}

/** The three reads, in the shape `staticCatalogueRows()` gives. */
export async function readCatalogueRows(
  tx: postgres.TransactionSql,
): Promise<readonly ParityRow[]> {
  const products = await tx.unsafe<{ sku: string; status: string }[]>(
    "SELECT sku, status FROM public.product ORDER BY sku",
  );
  const tiers = await tx.unsafe<
    {
      sku: string;
      tier_key: string;
      label_key: string;
      stems: number | null;
      sort: number;
      is_default: boolean;
    }[]
  >(
    `SELECT p.sku, t.tier_key, t.label_key, t.stems, t.sort, t.is_default
     FROM public.product_tier t JOIN public.product p ON p.id = t.product_id
     ORDER BY p.sku, t.tier_key`,
  );
  const prices = await tx.unsafe<
    {
      sku: string;
      iso2: string;
      tier_key: string | null;
      surcharge_kind: string | null;
      active_from: string;
      active_to: string | null;
      retail_minor: string;
      currency_code: string;
      vat_rate_bp: number;
    }[]
  >(
    `SELECT p.sku, c.iso2, cp.tier_key, cp.surcharge_kind,
            to_char(cp.active_from, 'YYYY-MM-DD') AS active_from,
            to_char(cp.active_to, 'YYYY-MM-DD') AS active_to,
            cp.retail_minor::text AS retail_minor, cp.currency_code, cp.vat_rate_bp
     FROM public.country_price cp
     JOIN public.product p ON p.id = cp.product_id
     JOIN public.country c ON c.id = cp.country_id
     ORDER BY 1, 2, 3, 4, 5`,
  );
  return [
    ...products.map((row): ParityRow => ({
      table: "product",
      key: row.sku,
      sku: row.sku,
      fields: { status: row.status },
    })),
    ...tiers.map((row): ParityRow => ({
      table: "product_tier",
      key: `${row.sku}|${row.tier_key}`,
      sku: row.sku,
      fields: {
        label_key: row.label_key,
        stems: text(row.stems),
        sort: text(row.sort),
        is_default: text(row.is_default),
      },
    })),
    ...prices.map((row): ParityRow => ({
      table: "country_price",
      key: [
        row.sku,
        row.iso2,
        text(row.tier_key),
        text(row.surcharge_kind),
        row.active_from,
      ].join("|"),
      sku: row.sku,
      iso2: row.iso2,
      fields: {
        retail_minor: row.retail_minor,
        currency: row.currency_code,
        vat_rate_bp: text(row.vat_rate_bp),
        active_to: text(row.active_to),
      },
    })),
  ];
}

/** The product page of `sku` in `iso2`, in every launch locale with a slug for both. */
function productUrls(sku: string, iso2: string): string[] {
  const product = PRODUCTS.find((candidate) => candidate.sku === sku);
  const country = COUNTRIES.find((candidate) => candidate.iso2 === iso2);
  if (product === undefined || country === undefined) return [];
  const slugs: Readonly<Record<string, string>> = country.slugs;
  return launchLocales.flatMap((locale) => {
    const countrySlug = slugs[locale];
    return countrySlug === undefined
      ? []
      : [productPath(locale, countrySlug, product.slug)];
  });
}

/** The shop root of `iso2` in every launch locale. */
function shopRootUrls(iso2: string): string[] {
  const country = COUNTRIES.find((candidate) => candidate.iso2 === iso2);
  if (country === undefined) return [];
  const slugs: Readonly<Record<string, string>> = country.slugs;
  return launchLocales.flatMap((locale) => {
    const countrySlug = slugs[locale];
    return countrySlug === undefined
      ? []
      : [
          listingPath(locale, {
            pageType: "countryShopRoot",
            country: countrySlug,
          }),
        ];
  });
}

/** Every URL the row's fingerprint feeds (see the header). */
function urlsOf(
  row: ParityRow,
  pricedIn: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  if (row.table === "country_price" && row.iso2 !== undefined) {
    return [...productUrls(row.sku, row.iso2), ...shopRootUrls(row.iso2)];
  }
  return [...(pricedIn.get(row.sku) ?? [])].flatMap((iso2) =>
    productUrls(row.sku, iso2),
  );
}

/** Compare two row sets; an absent row is a difference on its every field. */
export function catalogueParity(
  staticRows: readonly ParityRow[],
  databaseRows: readonly ParityRow[],
): readonly CatalogueParityDifference[] {
  const pricedIn = new Map<string, Set<string>>();
  for (const row of [...staticRows, ...databaseRows]) {
    if (row.table !== "country_price" || row.iso2 === undefined) continue;
    const set = pricedIn.get(row.sku) ?? new Set<string>();
    set.add(row.iso2);
    pricedIn.set(row.sku, set);
  }
  const index = (rows: readonly ParityRow[]) =>
    new Map(rows.map((row) => [`${row.table}|${row.key}`, row] as const));
  const left = index(staticRows);
  const right = index(databaseRows);
  const differences: CatalogueParityDifference[] = [];
  for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const a = left.get(id);
    const b = right.get(id);
    const row = (a ?? b) as ParityRow;
    const fields = [
      ...new Set([
        ...Object.keys(a?.fields ?? {}),
        ...Object.keys(b?.fields ?? {}),
      ]),
    ].sort();
    for (const field of fields) {
      const before = a === undefined ? undefined : a.fields[field];
      const after = b === undefined ? undefined : b.fields[field];
      if (before === after) continue;
      differences.push({
        table: row.table,
        key: row.key,
        field,
        static: before,
        database: after,
        urls: urlsOf(row, pricedIn),
      });
    }
  }
  return differences;
}

/** The report lines: one per (URL, field), then the summary. */
export function catalogueParityLines(
  differences: readonly CatalogueParityDifference[],
  cli: string,
): string[] {
  const lines: string[] = [];
  for (const difference of differences) {
    const where = `${difference.table} ${difference.key}.${difference.field}: static ${JSON.stringify(difference.static ?? null)}, database ${JSON.stringify(difference.database ?? null)}`;
    if (difference.urls.length === 0) lines.push(`(no URL) ${where}`);
    for (const url of difference.urls) lines.push(`${url} ${where}`);
  }
  const urls = new Set(differences.flatMap((d) => d.urls));
  lines.push(
    differences.length === 0
      ? `${cli}: products, sizes and prices agree on every row (catalogue and price half)`
      : `${cli}: ${String(differences.length)} differing catalogue field(s) across ${String(urls.size)} URL(s)`,
  );
  return lines;
}
