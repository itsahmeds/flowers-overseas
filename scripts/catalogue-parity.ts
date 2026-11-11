/**
 * @purpose Static vs database registry parity, read-only (AC-2)
 * @spec 012b
 *
 * `pnpm catalogue:parity --target=<postgres url>` — compares what the static providers and the
 * database providers give every URL, read-only, against a named database (spec 012b §2.2 "Parity
 * before the switch", AC-2, T-02; TASK-292).
 *
 * TASK-292 ships the **country half**: the `country` rows of the target, overlaid on
 * `src/config/countries.ts` exactly as `dbCountryRegistry` does, compared field by field with the
 * file (`countryRegistryParity`). A difference is printed once per affected URL and field, with
 * both values, and the exit code is 1; an empty comparison exits 0. The catalogue and price half
 * (product pages, listings, JSON-LD `Offer.price`) joins in TASK-294 with the database catalogue
 * providers.
 *
 * Read-only by construction: one `READ ONLY` transaction, one `SELECT`. It is the check the founder
 * runs against production before the cutover release (§12 founder action 6), and the CI `build`
 * job runs it as `app_build` against the freshly migrated and seeded service database. The target
 * URL is never printed (it carries a password).
 */
import { parseArgs } from "node:util";

import postgres from "postgres";
import { z } from "zod";

import { COUNTRIES, type CountryConfig } from "../src/config/countries.ts";
import {
  type ParityRow,
  catalogueParity,
  catalogueParityLines,
  readCatalogueRows,
  staticCatalogueRows,
} from "./catalogue-parity-catalogue.ts";
import { launchLocales } from "../src/config/locales.ts";
import { listingPath, localePath } from "../src/modules/i18n/routing.ts";
import {
  COUNTRY_REGISTRY_QUERY,
  type CountryParityDifference,
  countryRegistryFromRows,
  countryRegistryParity,
} from "../src/modules/geo/registry.ts";

export const CLI_NAME = "catalogue:parity";

const TargetSchema = z
  .string()
  .regex(
    /^postgres(?:ql)?:\/\/\S+$/u,
    "--target must be a postgres:// connection string",
  );

/** `--target=<url>`, required; anything else is refused. */
export function parseParityArgs(argv: readonly string[]): { target: string } {
  const { values } = parseArgs({
    args: [...argv],
    options: { target: { type: "string" } },
    strict: true,
    allowPositionals: false,
  });
  const parsed = TargetSchema.safeParse(values.target);
  if (!parsed.success) {
    throw new Error(
      `${CLI_NAME}: --target=<postgres url> is required and must be a postgres:// connection string`,
    );
  }
  return { target: parsed.data };
}

/**
 * The URLs a destination's registry facts reach, per launch locale: its corridor page and its shop
 * root, where status, robots, sitemap membership and the delivery promise are decided. Every
 * catalogue URL under the shop root carries the same country facts; TASK-294 extends the
 * comparison to the whole built URL set with the catalogue and price fingerprint.
 */
export function countryUrls(country: CountryConfig): readonly string[] {
  const slugs: Readonly<Record<string, string>> = country.slugs;
  return launchLocales.flatMap((locale) => {
    const slug = slugs[locale];
    if (slug === undefined) return [];
    return [
      localePath(locale, "destinations", slug),
      listingPath(locale, { pageType: "countryShopRoot", country: slug }),
    ];
  });
}

/** The comparison, given the target's rows: pure, so the gate's logic is unit-testable. */
export function parityReport(
  rows: readonly unknown[],
  staticCountries: readonly CountryConfig[] = COUNTRIES,
): { differences: readonly CountryParityDifference[]; lines: string[] } {
  const differences = countryRegistryParity(
    staticCountries,
    countryRegistryFromRows(staticCountries, rows),
    countryUrls,
  );
  const lines: string[] = [];
  for (const difference of differences) {
    for (const url of difference.urls) {
      lines.push(
        `${url} ${difference.iso2}.${difference.field}: static ${JSON.stringify(difference.static)}, database ${JSON.stringify(difference.database)}`,
      );
    }
  }
  const urls = new Set(differences.flatMap((d) => d.urls));
  lines.push(
    differences.length === 0
      ? `${CLI_NAME}: ${String(staticCountries.length)} countries agree on every registry field (country half)`
      : `${CLI_NAME}: ${String(differences.length)} differing field(s) across ${String(urls.size)} URL(s)`,
  );
  return { differences, lines };
}

/** Reads the target's `country` rows in one read-only transaction. */
export async function readCountryRows(target: string): Promise<unknown[]> {
  const sql = postgres(target, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    onnotice: () => undefined,
  });
  try {
    return await sql.begin("read only", async (tx) => [
      ...(await tx.unsafe(COUNTRY_REGISTRY_QUERY)),
    ]);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Both halves' reads, in one read-only transaction against the target. */
export async function readTarget(
  target: string,
): Promise<{ countryRows: unknown[]; catalogueRows: readonly ParityRow[] }> {
  const sql = postgres(target, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    onnotice: () => undefined,
  });
  try {
    return await sql.begin("read only", async (tx) => ({
      countryRows: [...(await tx.unsafe(COUNTRY_REGISTRY_QUERY))],
      catalogueRows: await readCatalogueRows(tx),
    }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** The whole report: the country half, then the catalogue and price half (TASK-294). */
export function fullParityReport(
  countryRows: readonly unknown[],
  catalogueRows: readonly ParityRow[],
  staticRows: readonly ParityRow[] = staticCatalogueRows(),
): { differing: number; lines: string[] } {
  const countries = parityReport(countryRows);
  const catalogue = catalogueParity(staticRows, catalogueRows);
  return {
    differing: countries.differences.length + catalogue.length,
    lines: [...countries.lines, ...catalogueParityLines(catalogue, CLI_NAME)],
  };
}

async function main(): Promise<number> {
  const { target } = parseParityArgs(process.argv.slice(2));
  const { countryRows, catalogueRows } = await readTarget(target);
  const { differing, lines } = fullParityReport(countryRows, catalogueRows);
  process.stdout.write(`${lines.join("\n")}\n`);
  return differing === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(
        `${CLI_NAME}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    },
  );
}
