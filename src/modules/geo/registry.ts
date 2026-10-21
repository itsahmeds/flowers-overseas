/**
 * The destination-country registry as two interchangeable sources (spec 012b §2.2 "the swap is
 * one composition root per family", §5.2 `src/modules/geo`, AC-2's country half; TASK-292).
 *
 * `src/config/countries.ts` is the static registry every page reads today. Once the database is
 * the master copy (ADR-0021, proposed), the per-country facts an admin may change come from the
 * `country` row instead: `status`, `guidePublished` and the operations block. Everything that is
 * a code change by spec 003 and 007 (the ISO set, the slugs, the region, the message keys) stays
 * the static registry's, so the database registry is the static one with those facts overlaid —
 * which is also why parity is checkable field by field.
 *
 * This file is pure and database-free: the row shape the query returns (`CountryRegistryRowSchema`,
 * parsed at the boundary), the overlay (`countryRegistryFromRows`), and the comparison
 * `pnpm catalogue:parity` runs (`countryRegistryParity`). The reader that runs the query in the
 * application is `db/registry.ts` (`dbCountryRegistry`); the composition root that picks one by
 * environment is TASK-294's (AC-3).
 *
 * **`corridorPagePublished` has no column** (`country` in `0002` carries `guide_published` only),
 * so both registries take it from the file and parity cannot differ on it. TASK-292's brief
 * records the question for TASK-294's cutover (spec 012b §2.2 lists it among the facts the
 * database owns, and §5.1 adds no column for it).
 */
import { z } from "zod";

import {
  COUNTRIES,
  type CountryConfig,
  type CountryOperations,
  countryStatuses,
} from "../../config/countries.ts";

/** A source of the destination registry. Both answer the same shape (`CountryConfig`). */
export interface CountryRegistryProvider {
  countries(): Promise<readonly CountryConfig[]>;
}

/** The file registry, as a provider. */
export const staticCountryRegistry: CountryRegistryProvider = {
  countries: () => Promise.resolve(COUNTRIES),
};

/**
 * The one query both readers run (the application's `dbCountryRegistry` and the read-only
 * `pnpm catalogue:parity`), so they cannot read different columns. Public reference data only:
 * readable by `app_web` in the public context and by `app_build` (`0011`, `0018`).
 */
export const COUNTRY_REGISTRY_QUERY = `
  SELECT iso2,
         status,
         guide_published,
         iana_zone,
         to_char(same_day_cutoff_local, 'HH24:MI') AS same_day_cutoff_local,
         delivery_days,
         sunday_delivery
  FROM public.country
  ORDER BY iso2`;

/** One `country` row as the query returns it, validated at the boundary. */
export const CountryRegistryRowSchema = z
  .object({
    iso2: z.string().regex(/^[A-Z]{2}$/u),
    status: z.enum(countryStatuses),
    guide_published: z.boolean(),
    iana_zone: z.string().min(1),
    same_day_cutoff_local: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u)
      .nullable(),
    delivery_days: z.array(z.string().regex(/^[1-7]$/u)),
    sunday_delivery: z.enum(["none", "peak", "always"]),
  })
  .strict();
export type CountryRegistryRow = z.infer<typeof CountryRegistryRowSchema>;

/**
 * The operations block a row describes, or `undefined` when none was agreed: the seed writes a
 * country without one as its capital's zone, no cutoff and no delivery day (`seed/plan.ts`), and
 * that is spec 009's `unavailable` state, never a guessed cutoff.
 */
export function operationsFromRow(
  row: CountryRegistryRow,
): CountryOperations | undefined {
  if (row.same_day_cutoff_local === null || row.delivery_days.length === 0) {
    return undefined;
  }
  return {
    ianaZone: row.iana_zone,
    sameDayCutoffLocal: row.same_day_cutoff_local,
    deliveryDays: row.delivery_days.map(Number),
    sundayDelivery: row.sunday_delivery,
  };
}

/**
 * The database registry: each static destination with its row's facts overlaid. A destination
 * with no row is refused (a page for it would have no country behind it), and a row for a code
 * the file does not know is ignored, because a new destination is a code change (slugs, region).
 */
export function countryRegistryFromRows(
  staticCountries: readonly CountryConfig[],
  rows: readonly unknown[],
): readonly CountryConfig[] {
  const byIso2 = new Map(
    rows
      .map((row) => CountryRegistryRowSchema.parse(row))
      .map((row) => [row.iso2, row] as const),
  );
  return staticCountries.map((country) => {
    const row = byIso2.get(country.iso2);
    if (row === undefined) {
      throw new Error(
        `country registry: the database has no row for ${country.iso2}`,
      );
    }
    const operations = operationsFromRow(row);
    const overlaid: CountryConfig = {
      iso2: country.iso2,
      status: row.status,
      region: country.region,
      nameKey: country.nameKey,
      slugs: country.slugs,
      corridorPagePublished: country.corridorPagePublished,
      guidePublished: row.guide_published,
      ...(country.citiesKey === undefined
        ? {}
        : { citiesKey: country.citiesKey }),
      ...(operations === undefined ? {} : { operations }),
    };
    return overlaid;
  });
}

/** The fields of a destination parity compares: every one the database may own. */
export const COUNTRY_PARITY_FIELDS = [
  "status",
  "guidePublished",
  "corridorPagePublished",
  "operations",
] as const;
export type CountryParityField = (typeof COUNTRY_PARITY_FIELDS)[number];

/** One difference: the field, both values, and every URL whose fingerprint it feeds. */
export interface CountryParityDifference {
  readonly iso2: string;
  readonly field: CountryParityField;
  readonly static: unknown;
  readonly database: unknown;
  readonly urls: readonly string[];
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Field-by-field comparison of the static and the database registry (AC-2's country half). Empty
 * means every page they feed fingerprints the same under both; otherwise one entry per differing
 * (country, field), carrying the URLs `urlsOf` says that country's facts reach (the caller owns the
 * URL builder: `pnpm catalogue:parity` passes the corridor page and shop root of every locale).
 */
export function countryRegistryParity(
  staticCountries: readonly CountryConfig[],
  databaseCountries: readonly CountryConfig[],
  urlsOf: (country: CountryConfig) => readonly string[],
): readonly CountryParityDifference[] {
  const database = new Map(databaseCountries.map((c) => [c.iso2, c]));
  const differences: CountryParityDifference[] = [];
  for (const country of staticCountries) {
    const other = database.get(country.iso2);
    for (const field of COUNTRY_PARITY_FIELDS) {
      const left = country[field];
      const right = other?.[field];
      if (other !== undefined && same(left, right)) continue;
      differences.push({
        iso2: country.iso2,
        field,
        static: left ?? null,
        database: right ?? null,
        urls: urlsOf(country),
      });
      // A destination with no row differs once, not once per field.
      if (other === undefined) break;
    }
  }
  return differences;
}
