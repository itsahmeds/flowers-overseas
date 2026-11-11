/**
 * @purpose `pnpm build`'s country-registry step: the database's destination registry, read once through the build login, for `next build`'s workers (spec 012b AC-3, AC-4)
 *
 * Next runs no `instrumentation.ts` hook in the build's page-data and prerender workers, so the
 * synchronous `countryConfig()` reads there cannot wait for `primeCountryRegistry()`. Where the
 * deployment reads the database (`cmsSourceFor()`: `production`, `staging` or `preview` with the
 * build login), this step reads the `country` table once as `app_build` (the same query and
 * overlay as `dbCountryRegistry`), and `scripts/build.ts` hands the result to `next build` in
 * `COUNTRY_REGISTRY_BUILD_SNAPSHOT`; `src/config/countries.ts` installs it in each worker. A
 * failed read throws, so the build fails (AC-4: the database unreachable, the build exits
 * non-zero). Without the build login it answers the empty string and the build serves the file
 * (TASK-294's staging fallback). It prints one line naming the source and no value.
 */
import {
  COUNTRIES,
  cmsSourceFor,
  countryRegistryBuildFacts,
} from "../src/config/countries.ts";
import {
  BUILD_DATABASE_URL_KEY,
  buildDatabaseConfigured,
} from "../src/lib/build-login.ts";
import { countryRegistryFromRows } from "../src/modules/geo/registry.ts";
import { readCountryRows } from "./catalogue-parity.ts";

/** The registry rows' reader; the test seam. */
export type CountryRowReader = (target: string) => Promise<unknown[]>;

/** The snapshot for `environment`, or `""` where the deployment serves the file. */
export async function countryRegistryBuildStep(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  read: CountryRowReader = readCountryRows,
): Promise<string> {
  const source = cmsSourceFor(
    environment["APP_ENV"] ?? "",
    buildDatabaseConfigured(environment),
  );
  if (source === "static") {
    console.log(
      "country-registry: the repository file (no build database login for this environment)",
    );
    return "";
  }
  const target = environment[BUILD_DATABASE_URL_KEY] ?? "";
  const countries = countryRegistryFromRows(COUNTRIES, await read(target));
  console.log(
    `country-registry: the database, ${String(countries.length)} destinations read through the build login`,
  );
  return JSON.stringify(countryRegistryBuildFacts(countries));
}
