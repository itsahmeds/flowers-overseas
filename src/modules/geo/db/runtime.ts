/**
 * The country registry's composition root at runtime (spec 012b §2.2 "the swap is one composition
 * root per family", AC-3; TASK-294).
 *
 * Every reader of a destination's `status`, `guidePublished`, `corridorPagePublished` or
 * `operations` asks `countryConfig()` / `activeCountries()` (`src/config/countries.ts`), which are
 * synchronous and used from hundreds of render paths. So the database registry is read once into
 * a process-wide snapshot, installed before the first render, and re-read whenever a `country:*`
 * tag is invalidated:
 *
 *  - **boot**: `instrumentation.ts` calls `primeCountryRegistry()` in every Node process: the
 *    server, and `next build`'s workers (where `src/lib/db.ts` connects as `app_build`). In
 *    `production`, `staging` and `preview` it reads `dbCountryRegistry` and installs it; a failed
 *    read throws, and with no registry installed every `countryConfig()` read throws too, so a
 *    build or a server never serves the file's registry by accident (§2.0 item 2: no fallback);
 *  - **change**: a `before-invalidate` hook (`src/lib/cache.ts`) re-reads and re-installs the
 *    registry before `invalidate()` revalidates any page, whenever its tags include a
 *    `country:{iso2}` tag (spec 012b §5.4: a status flip and the fiscal fields carry one), so the
 *    page Next regenerates next is rendered from the new row. Single replica (spec 040), so the
 *    process that saved the change is the process that serves it.
 *
 * In `development` and `test` nothing is installed and the file registry answers, as before.
 */
import { appEnvironment } from "@/lib/env.schema";
import { onBeforeInvalidate } from "@/lib/cache";
import {
  type CountryConfig,
  installCountryRegistry,
  uninstallCountryRegistry,
} from "@/config/countries";

import {
  type CountryRegistryProvider,
  type CountryRegistrySource,
  countryRegistrySourceFor,
} from "../registry";
import { dbCountryRegistry } from "./registry";

/** The tag prefix whose invalidation re-reads the registry (`country:{iso2}`, spec 012b §5.4). */
export const COUNTRY_TAG_PREFIX = "country:";

let unhook: (() => void) | undefined;

/** Read `provider` and install what it answers. */
export async function refreshCountryRegistry(
  provider: CountryRegistryProvider = dbCountryRegistry,
): Promise<readonly CountryConfig[]> {
  const countries = await provider.countries();
  installCountryRegistry(countries);
  return countries;
}

/**
 * Install the registry this environment serves, once per process, and keep it current. Returns
 * the source it chose. `provider` is the test seam; the application passes nothing.
 */
export async function primeCountryRegistry(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  provider: CountryRegistryProvider = dbCountryRegistry,
): Promise<CountryRegistrySource> {
  const source = countryRegistrySourceFor(appEnvironment(environment));
  if (source === "static") return source;
  await refreshCountryRegistry(provider);
  unhook?.();
  unhook = onBeforeInvalidate(async (tags) => {
    if (tags.some((tag) => tag.startsWith(COUNTRY_TAG_PREFIX))) {
      await refreshCountryRegistry(provider);
    }
  });
  return source;
}

/** Undo `primeCountryRegistry()`: drop the hook and the installed registry (tests only). */
export function unprimeCountryRegistry(): void {
  unhook?.();
  unhook = undefined;
  uninstallCountryRegistry();
}
