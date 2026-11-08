/**
 * The partner reads admin renders (spec 012 §2.5, §5.3 `/admin/partners`, `/admin/partners/[code]`;
 * artboards `admin-partners-*` and `admin-partner-detail-*`; TASK-221).
 *
 *  - `listPartners(actor, filter)` — every partner, or one status and one country, with its zone
 *    count, its fulfillable product count, its terms, and the count per status for the tabs.
 *  - `partnerDetail(actor, code)` — one partner's record: profile, terms, zones, days off,
 *    products and payouts, the preflight of `→ active`, and the choices its forms offer (the
 *    countries and currencies of the reference tables, the cities and postcode zones of its own
 *    country, every product and size).
 *
 * Read in one admin transaction each, by code (the URL carries the code, never a name). Admin
 * only: nothing here is reachable from a public page, and a partner's name or contact never
 * reaches public HTML (AC-16, T-19).
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { DbActor } from "@/lib/db";

import { product, productTier } from "../../../../db/schema/catalog";
import { country, currency } from "../../../../db/schema/geo";
import {
  fulfillmentPartner,
  partnerBlackout,
  partnerCatalogMapping,
  partnerCoverage,
  partnerStatuses,
} from "../../../../db/schema/partners";
import {
  type PartnerAdminRunner,
  PARTNER_ACTIONS,
  partnerAdminRunner,
} from "./commands";
import {
  type PartnerStatus,
  type PreflightResult,
  PARTNER_STATUS_EDGES,
  activationPreflight,
} from "./schemas";

/**
 * A stored `bigint` of minor units as a safe integer: `partner_payout_minor` is `bigint` so the
 * column can never overflow, and a payout a person entered through `saveMapping` is a safe
 * integer by construction (`payoutMinorUnits`). A larger stored value fails the read loudly.
 */
const StoredMinorSchema = z
  .bigint()
  .nonnegative()
  .max(BigInt(Number.MAX_SAFE_INTEGER))
  .transform((value) => Number(value));

/** The admin list's language for names read from translation tables (admin is English, §13 Q9). */
const ADMIN_LOCALE = "en";

export const PartnerListFilterSchema = z
  .object({
    status: z.enum(partnerStatuses).optional().catch(undefined),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/u)
      .optional()
      .catch(undefined),
  })
  .strip();
export type PartnerListFilter = z.infer<typeof PartnerListFilterSchema>;

export interface PartnerListItem {
  readonly id: string;
  readonly code: string;
  readonly legalName: string;
  readonly cityLabel: string;
  readonly countryIso2: string;
  readonly countryName: string;
  readonly status: PartnerStatus;
  readonly termsSignedAt: string | null;
  readonly termsVersion: string | null;
  readonly zones: number;
  readonly products: number;
  /** The payout currency (spec 030b's "Owed now" reads 0.00 in it when nothing is owed). */
  readonly payoutCurrency: string;
}

export interface PartnerList {
  readonly items: readonly PartnerListItem[];
  /** Per status, within the country filter (the tabs' counts). */
  readonly counts: Readonly<Record<PartnerStatus, number>>;
  /** The countries partners are in, for the filter. */
  readonly countries: readonly {
    readonly iso2: string;
    readonly name: string;
  }[];
}

/** `country.iso2` and its English name, from the translation table when it has one. */
const countryName = sql<string>`coalesce((SELECT t.name FROM public.country_translation t
  WHERE t.country_id = ${sql.raw('"country"."id"')} AND t.locale_code = ${ADMIN_LOCALE}), ${sql.raw('"country"."iso2"')})`;

export async function listPartners(
  actor: DbActor,
  filter: PartnerListFilter = {},
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<PartnerList> {
  const { status, country: iso2 } = PartnerListFilterSchema.parse(filter);
  return run({ ...actor, action: PARTNER_ACTIONS.list }, async (db) => {
    const inCountry = iso2 === undefined ? undefined : eq(country.iso2, iso2);
    const rows = await db
      .select({
        id: fulfillmentPartner.id,
        code: fulfillmentPartner.code,
        legalName: fulfillmentPartner.legalName,
        cityLabel: fulfillmentPartner.cityLabel,
        countryIso2: country.iso2,
        countryName,
        status: fulfillmentPartner.status,
        termsSignedAt: fulfillmentPartner.termsSignedAt,
        termsVersion: fulfillmentPartner.termsVersion,
        payoutCurrency: fulfillmentPartner.payoutCurrencyCode,
        zones: sql<number>`(SELECT count(*)::int FROM public.partner_coverage c WHERE c.partner_id = ${sql.raw('"fulfillment_partner"."id"')})`,
        products: sql<number>`(SELECT count(*)::int FROM public.partner_catalog_mapping m WHERE m.partner_id = ${sql.raw('"fulfillment_partner"."id"')} AND m.can_fulfil AND m.partner_payout_minor > 0)`,
      })
      .from(fulfillmentPartner)
      .innerJoin(country, eq(country.id, fulfillmentPartner.countryId))
      .where(inCountry)
      .orderBy(asc(fulfillmentPartner.legalName), asc(fulfillmentPartner.code));
    const counts = Object.fromEntries(
      partnerStatuses.map((value) => [
        value,
        rows.filter((row) => row.status === value).length,
      ]),
    ) as Record<PartnerStatus, number>;
    const countries = await db
      .selectDistinct({ iso2: country.iso2, name: countryName })
      .from(country)
      .innerJoin(
        fulfillmentPartner,
        eq(fulfillmentPartner.countryId, country.id),
      )
      .orderBy(asc(country.iso2));
    return {
      items: rows
        .filter((row) => status === undefined || row.status === status)
        .map((row) => ({
          ...row,
          status: z.enum(partnerStatuses).parse(row.status),
          zones: Number(row.zones),
          products: Number(row.products),
        })),
      counts,
      countries,
    };
  });
}

export interface PartnerZone {
  readonly id: string;
  readonly cityName: string;
  /** The postcode prefix, or `null` for a whole city. */
  readonly prefix: string | null;
  readonly capacityPerDay: number | null;
}

export interface PartnerDayOff {
  readonly date: string;
  readonly reason: string | null;
}

export interface PartnerMappingRow {
  readonly id: string;
  readonly productName: string;
  readonly tierKey: string | null;
  readonly stems: number | null;
  readonly canFulfil: boolean;
  readonly payoutMinor: number;
  readonly currency: string;
}

export interface PartnerOption {
  readonly value: string;
  readonly label: string;
}

export interface CoverageOption {
  readonly value: string;
  readonly kind: "city" | "zone";
  readonly cityName: string;
  readonly prefix: string | null;
}

export interface SizeOption {
  readonly tierKey: string;
  /** The stem count every product's tier of this key shares, or `null`. */
  readonly stems: number | null;
}

export interface PartnerDetail {
  readonly id: string;
  readonly code: string;
  readonly status: PartnerStatus;
  readonly legalName: string;
  readonly cityLabel: string;
  readonly countryIso2: string;
  readonly countryName: string;
  readonly notificationChannel: string;
  readonly contactEmail: string;
  readonly contactPhone: string | null;
  readonly payoutCurrency: string;
  readonly capacityPerDay: number;
  readonly termsSignedAt: string | null;
  readonly termsVersion: string | null;
  /** The version every form on the page carries. */
  readonly updatedAt: string;
  readonly updatedAtInstant: Date;
  readonly zones: readonly PartnerZone[];
  readonly daysOff: readonly PartnerDayOff[];
  readonly mappings: readonly PartnerMappingRow[];
  readonly preflight: PreflightResult;
  /** The moves the graph allows from this status, in graph order. */
  readonly moves: readonly PartnerStatus[];
  readonly options: {
    readonly countries: readonly PartnerOption[];
    readonly currencies: readonly string[];
    readonly coverage: readonly CoverageOption[];
    readonly products: readonly PartnerOption[];
    readonly sizes: readonly SizeOption[];
  };
}

/** Every country and currency, for the profile form (create and edit). */
export async function partnerFormOptions(
  actor: DbActor,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<{
  readonly countries: readonly PartnerOption[];
  readonly currencies: readonly string[];
}> {
  return run({ ...actor, action: PARTNER_ACTIONS.read }, async (db) => {
    const countries = await db
      .select({ value: country.iso2, label: countryName })
      .from(country)
      .orderBy(asc(country.iso2));
    const currencies = await db
      .select({ code: currency.code })
      .from(currency)
      .orderBy(asc(currency.code));
    return { countries, currencies: currencies.map((row) => row.code) };
  });
}

export async function partnerDetail(
  actor: DbActor,
  code: string,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<PartnerDetail | undefined> {
  const parsedCode = z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    .max(60)
    .safeParse(code);
  if (!parsedCode.success) return undefined;
  return run({ ...actor, action: PARTNER_ACTIONS.read }, async (db) => {
    const [row] = await db
      .select({
        id: fulfillmentPartner.id,
        code: fulfillmentPartner.code,
        status: fulfillmentPartner.status,
        legalName: fulfillmentPartner.legalName,
        cityLabel: fulfillmentPartner.cityLabel,
        countryId: fulfillmentPartner.countryId,
        countryIso2: country.iso2,
        countryName,
        notificationChannel: fulfillmentPartner.notificationChannel,
        contactEmail: fulfillmentPartner.contactEmail,
        contactPhone: fulfillmentPartner.contactPhone,
        payoutCurrency: fulfillmentPartner.payoutCurrencyCode,
        capacityPerDay: fulfillmentPartner.capacityPerDay,
        termsSignedAt: fulfillmentPartner.termsSignedAt,
        termsVersion: fulfillmentPartner.termsVersion,
        updatedAt: fulfillmentPartner.updatedAt,
      })
      .from(fulfillmentPartner)
      .innerJoin(country, eq(country.id, fulfillmentPartner.countryId))
      .where(eq(fulfillmentPartner.code, parsedCode.data));
    if (row === undefined) return undefined;

    const cityName = (cityColumn: unknown) =>
      sql<string>`coalesce((SELECT t.name FROM public.city_translation t
        WHERE t.city_id = ${cityColumn} AND t.locale_code = ${ADMIN_LOCALE}),
        (SELECT t.name FROM public.city_translation t WHERE t.city_id = ${cityColumn}
         ORDER BY t.locale_code LIMIT 1), '')`;

    const zones = await db
      .select({
        id: partnerCoverage.id,
        cityName:
          cityName(sql`coalesce(${sql.raw('"partner_coverage"."city_id"')},
          (SELECT z.city_id FROM public.postcode_zone z WHERE z.id = ${sql.raw('"partner_coverage"."postcode_zone_id"')}))`),
        prefix: sql<
          string | null
        >`(SELECT z.prefix FROM public.postcode_zone z WHERE z.id = ${sql.raw('"partner_coverage"."postcode_zone_id"')})`,
        capacityPerDay: partnerCoverage.capacityPerDay,
      })
      .from(partnerCoverage)
      .where(eq(partnerCoverage.partnerId, row.id))
      .orderBy(asc(partnerCoverage.createdAt), asc(partnerCoverage.id));

    const daysOff = await db
      .select({ date: partnerBlackout.date, reason: partnerBlackout.reason })
      .from(partnerBlackout)
      .where(eq(partnerBlackout.partnerId, row.id))
      .orderBy(asc(partnerBlackout.date));

    const productName = sql<string>`coalesce((SELECT t.name FROM public.product_translation t
      WHERE t.product_id = ${sql.raw('"product"."id"')} AND t.locale_code = ${ADMIN_LOCALE}), ${sql.raw('"product"."sku"')})`;

    const mappings = await db
      .select({
        id: partnerCatalogMapping.id,
        productName,
        tierKey: partnerCatalogMapping.tierKey,
        stems: productTier.stems,
        canFulfil: partnerCatalogMapping.canFulfil,
        payoutMinor: partnerCatalogMapping.partnerPayoutMinor,
        currency: partnerCatalogMapping.currencyCode,
      })
      .from(partnerCatalogMapping)
      .innerJoin(product, eq(product.id, partnerCatalogMapping.productId))
      .leftJoin(
        productTier,
        and(
          eq(productTier.productId, partnerCatalogMapping.productId),
          eq(productTier.tierKey, partnerCatalogMapping.tierKey),
        ),
      )
      .where(eq(partnerCatalogMapping.partnerId, row.id))
      .orderBy(asc(productName), asc(productTier.sort));

    const coverageCities = await db.execute(sql`
      SELECT 'city:' || c.id AS value, 'city' AS kind, ${cityName(sql`c.id`)} AS city_name,
             NULL::text AS prefix
      FROM public.city c WHERE c.country_id = ${row.countryId}
      UNION ALL
      SELECT 'zone:' || z.id, 'zone', ${cityName(sql`z.city_id`)}, z.prefix
      FROM public.postcode_zone z WHERE z.country_id = ${row.countryId}
      ORDER BY 3, 4 NULLS FIRST`);
    const CoverageRowSchema = z.object({
      value: z.string(),
      kind: z.enum(["city", "zone"]),
      city_name: z.string(),
      prefix: z.string().nullable(),
    });

    const products = await db
      .select({ value: product.id, label: productName })
      .from(product)
      .orderBy(asc(productName), asc(product.id));
    // The sizes the catalogue names, each with its stem count when every product agrees on it.
    const sizes = await db
      .select({
        tierKey: productTier.tierKey,
        stems: sql<
          number | null
        >`CASE WHEN min(${productTier.stems}) = max(${productTier.stems}) THEN min(${productTier.stems}) END`,
      })
      .from(productTier)
      .groupBy(productTier.tierKey)
      .orderBy(asc(productTier.tierKey));

    const preflight = activationPreflight({
      termsSignedAt: row.termsSignedAt,
      termsVersion: row.termsVersion,
      coverageRows: zones.length,
      fulfillableMappings: mappings.filter(
        (mapping) => mapping.canFulfil && mapping.payoutMinor > BigInt(0),
      ).length,
      notificationChannel: row.notificationChannel,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
    });
    const status = z.enum(partnerStatuses).parse(row.status);
    const options = await partnerFormOptions(actor, async (_context, fn) =>
      fn(db),
    );
    return {
      id: row.id,
      code: row.code,
      status,
      legalName: row.legalName,
      cityLabel: row.cityLabel,
      countryIso2: row.countryIso2,
      countryName: row.countryName,
      notificationChannel: row.notificationChannel,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      payoutCurrency: row.payoutCurrency,
      capacityPerDay: row.capacityPerDay,
      termsSignedAt: row.termsSignedAt,
      termsVersion: row.termsVersion,
      updatedAt: row.updatedAt.toISOString(),
      updatedAtInstant: row.updatedAt,
      zones: zones.map((zone) => ({
        ...zone,
        cityName: String(zone.cityName),
      })),
      daysOff,
      mappings: mappings.map((mapping) => ({
        id: mapping.id,
        productName: String(mapping.productName),
        tierKey: mapping.tierKey,
        stems: mapping.stems,
        canFulfil: mapping.canFulfil,
        payoutMinor: StoredMinorSchema.parse(mapping.payoutMinor),
        currency: mapping.currency,
      })),
      preflight,
      moves: PARTNER_STATUS_EDGES[status],
      options: {
        countries: options.countries,
        currencies: options.currencies,
        coverage: Array.from(
          coverageCities as unknown as Iterable<unknown>,
        ).map((entry) => {
          const parsed = CoverageRowSchema.parse(entry);
          return {
            value: parsed.value,
            kind: parsed.kind,
            cityName: parsed.city_name,
            prefix: parsed.prefix,
          };
        }),
        products: products.map((entry) => ({
          value: entry.value,
          label: String(entry.label),
        })),
        sizes: sizes.map((entry) => ({
          tierKey: entry.tierKey,
          stems: entry.stems === null ? null : Number(entry.stems),
        })),
      },
    };
  });
}

/** A partner's code by its id (a converted application links to its florist); `undefined` if none. */
export async function partnerCodeById(
  actor: DbActor,
  partnerId: string,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<string | undefined> {
  const id = z.uuid().safeParse(partnerId);
  if (!id.success) return undefined;
  return run({ ...actor, action: PARTNER_ACTIONS.read }, async (db) => {
    const [row] = await db
      .select({ code: fulfillmentPartner.code })
      .from(fulfillmentPartner)
      .where(eq(fulfillmentPartner.id, id.data));
    return row?.code;
  });
}

/** What every florist tab shows above its tab bar (spec 030b §5.3): name, code, place, status. */
export interface PartnerHead {
  readonly id: string;
  readonly code: string;
  readonly legalName: string;
  readonly cityLabel: string;
  readonly countryName: string;
  readonly status: PartnerStatus;
}

/** One florist's head by code (the URL's), or `undefined` when no florist has it. */
export async function partnerHead(
  actor: DbActor,
  code: string,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<PartnerHead | undefined> {
  const parsed = z
    .string()
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    .safeParse(code);
  if (!parsed.success) return undefined;
  return run({ ...actor, action: PARTNER_ACTIONS.read }, async (db) => {
    const [row] = await db
      .select({
        id: fulfillmentPartner.id,
        code: fulfillmentPartner.code,
        legalName: fulfillmentPartner.legalName,
        cityLabel: fulfillmentPartner.cityLabel,
        countryName,
        status: fulfillmentPartner.status,
      })
      .from(fulfillmentPartner)
      .innerJoin(country, eq(country.id, fulfillmentPartner.countryId))
      .where(eq(fulfillmentPartner.code, parsed.data));
    return row === undefined
      ? undefined
      : { ...row, status: z.enum(partnerStatuses).parse(row.status) };
  });
}
