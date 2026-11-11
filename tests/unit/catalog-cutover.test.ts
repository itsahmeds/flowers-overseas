/**
 * T-03 (spec 012b AC-3; TASK-294): the cutover's composition roots and the source scan.
 *
 *  - the catalogue and price providers are the database's in `production`, `staging` and
 *    `preview` while the deployment carries `DATABASE_BUILD_URL`, the repository's in
 *    `development` and `test`; FX and flags stay the committed ones until TASK-071 and spec 012's
 *    admin own them;
 *  - the staging fallback (TASK-294, ordered by the orchestrator 2026-11-11): without
 *    `DATABASE_BUILD_URL` every composition root serves the files, boot installs the file's
 *    registry and logs one warning, and no saleability term is composed;
 *  - the saleability term (AC-39) is composed in `production` and `staging` only;
 *  - the country registry follows the same rule: an installed database registry answers every
 *    `countryConfig()` read, and in a database environment an absent one throws, never the file;
 *  - a `country:*` invalidation re-reads the registry before anything is revalidated;
 *  - the scan: outside the file registry itself, the dataset, the static providers and the
 *    registry overlay, no source file imports the file registry `COUNTRIES` (whose rows carry
 *    `status`, `guidePublished`, `corridorPagePublished` and `operations`) or the authored
 *    `products`, `tiers` or `prices` dataset; a fixture import under `src/app` is caught.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COUNTRIES,
  type CountryConfig,
  activeCountries,
  countryConfig,
  installCountryRegistry,
  isGuidePublished,
  uninstallCountryRegistry,
} from "../../src/config/countries.ts";
import { invalidate, noopCache } from "../../src/lib/cache.ts";
import { logger } from "../../src/lib/logger.ts";
import {
  dbCatalogueProvider,
  dbPriceProvider,
  dbSaleabilityProvider,
} from "../../src/modules/catalog/db/index.ts";
import {
  catalogSourceFor,
  providersFor,
  saleabilityFor,
} from "../../src/modules/catalog/providers.ts";
import {
  staticCatalogueProvider,
  staticFlagProvider,
  staticFxRateProvider,
  staticPriceProvider,
} from "../../src/modules/catalog/static/index.ts";
import {
  primeCountryRegistry,
  unprimeCountryRegistry,
} from "../../src/modules/geo/db/runtime.ts";
import {
  type CountryRegistryProvider,
  countryRegistrySourceFor,
} from "../../src/modules/geo/registry.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

const DATABASE_ENVIRONMENTS = ["production", "staging", "preview"] as const;

/** A build login of the shape `src/lib/db.ts` accepts (never connected to here). */
const BUILD_LOGIN = "postgres://app_build:secret@db.example.test:5432/fo";
const FILE_ENVIRONMENTS = ["development", "test"] as const;

afterEach(() => {
  unprimeCountryRegistry();
  uninstallCountryRegistry();
  vi.unstubAllEnvs();
});

/** The file registry with Poland's status and guide flag turned around: a visible difference. */
function flipped(): readonly CountryConfig[] {
  return COUNTRIES.map((country) =>
    country.iso2 === "PL"
      ? {
          ...country,
          status: country.status === "live" ? "demo" : "live",
          guidePublished: !country.guidePublished,
        }
      : country,
  );
}

describe("T-03: the catalogue composition root", () => {
  it.each(DATABASE_ENVIRONMENTS)(
    "%s reads products, tiers and prices from the database",
    (environment) => {
      expect(catalogSourceFor(environment, true)).toBe("database");
      const providers = providersFor(environment, true);
      expect(providers.catalogue).toBe(dbCatalogueProvider);
      expect(providers.price).toBe(dbPriceProvider);
      expect(providers.fx).toBe(staticFxRateProvider);
      expect(providers.flags).toBe(staticFlagProvider);
    },
  );

  it.each(FILE_ENVIRONMENTS)(
    "%s reads the repository's providers",
    (environment) => {
      expect(catalogSourceFor(environment, true)).toBe("static");
      const providers = providersFor(environment, true);
      expect(providers.catalogue).toBe(staticCatalogueProvider);
      expect(providers.price).toBe(staticPriceProvider);
    },
  );

  it.each(DATABASE_ENVIRONMENTS)(
    "%s without DATABASE_BUILD_URL falls back to the repository's providers (the staging fallback)",
    (environment) => {
      expect(catalogSourceFor(environment, false)).toBe("static");
      const providers = providersFor(environment, false);
      expect(providers.catalogue).toBe(staticCatalogueProvider);
      expect(providers.price).toBe(staticPriceProvider);
    },
  );

  it("decides on DATABASE_BUILD_URL as the process carries it, valid connection strings only", () => {
    vi.stubEnv("DATABASE_BUILD_URL", BUILD_LOGIN);
    expect(catalogSourceFor("staging")).toBe("database");
    vi.stubEnv("DATABASE_BUILD_URL", "https://db.example.test");
    expect(catalogSourceFor("staging")).toBe("static");
    vi.stubEnv("DATABASE_BUILD_URL", "");
    expect(catalogSourceFor("staging")).toBe("static");
  });

  it("AC-39: the saleability term is composed in production and staging only", () => {
    expect(saleabilityFor("production", true)).toBe(dbSaleabilityProvider);
    expect(saleabilityFor("staging", true)).toBe(dbSaleabilityProvider);
    for (const environment of ["preview", "development", "test"]) {
      expect(saleabilityFor(environment, true), environment).toBeUndefined();
    }
  });

  it("composes no saleability term on the file catalogue (no DATABASE_BUILD_URL)", () => {
    expect(saleabilityFor("production", false)).toBeUndefined();
    expect(saleabilityFor("staging", false)).toBeUndefined();
  });
});

describe("T-03: the country registry composition root", () => {
  it.each(DATABASE_ENVIRONMENTS)(
    "%s serves the database's registry",
    (environment) => {
      expect(countryRegistrySourceFor(environment, true)).toBe("database");
      expect(countryRegistrySourceFor(environment, false)).toBe("static");
    },
  );

  it.each(FILE_ENVIRONMENTS)("%s serves the file's registry", (environment) => {
    expect(countryRegistrySourceFor(environment, true)).toBe("static");
    vi.stubEnv("APP_ENV", environment);
    expect(activeCountries()).toBe(COUNTRIES);
  });

  it("an installed registry answers countryConfig(), activeCountries() and the predicates", () => {
    const registry = flipped();
    const file = countryConfig("PL");
    installCountryRegistry(registry);
    expect(activeCountries()).toBe(registry);
    expect(countryConfig("PL").status).not.toBe(file.status);
    expect(countryConfig("PL")).toBe(registry.find((c) => c.iso2 === "PL"));
    expect(isGuidePublished("PL")).toBe(!file.guidePublished);
  });

  it.each(DATABASE_ENVIRONMENTS)(
    "%s with no registry installed throws rather than answering from the file",
    (environment) => {
      vi.stubEnv("APP_ENV", environment);
      expect(() => countryConfig("PL")).toThrow(
        /^COUNTRY_REGISTRY_NOT_LOADED/u,
      );
      expect(() => activeCountries()).toThrow(/^COUNTRY_REGISTRY_NOT_LOADED/u);
    },
  );

  it("refuses a registry that is not exactly the file's destinations", () => {
    expect(() => installCountryRegistry(COUNTRIES.slice(1))).toThrow();
    expect(() =>
      installCountryRegistry([
        ...COUNTRIES.slice(1),
        COUNTRIES[1] as CountryConfig,
      ]),
    ).toThrow();
  });

  it("boot installs the database registry in production and nothing in development", async () => {
    const reads = vi.fn(() => Promise.resolve(flipped()));
    const provider: CountryRegistryProvider = { countries: reads };
    expect(
      await primeCountryRegistry({ APP_ENV: "development" }, provider),
    ).toBe("static");
    expect(reads).not.toHaveBeenCalled();
    expect(countryConfig("PL")).toBe(COUNTRIES.find((c) => c.iso2 === "PL"));

    expect(
      await primeCountryRegistry(
        { APP_ENV: "production", DATABASE_BUILD_URL: BUILD_LOGIN },
        provider,
      ),
    ).toBe("database");
    expect(reads).toHaveBeenCalledTimes(1);
    expect(countryConfig("PL").status).not.toBe(
      COUNTRIES.find((c) => c.iso2 === "PL")?.status,
    );
  });

  it.each(["production", "staging"])(
    "%s without DATABASE_BUILD_URL installs the file's registry, reads no database and logs one warning",
    async (environment) => {
      const reads = vi.fn(() => Promise.resolve(flipped()));
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
      expect(
        await primeCountryRegistry(
          { APP_ENV: environment },
          { countries: reads },
        ),
      ).toBe("static");
      expect(reads).not.toHaveBeenCalled();
      vi.stubEnv("APP_ENV", environment);
      expect(activeCountries()).toBe(COUNTRIES);
      expect(countryConfig("PL")).toBe(COUNTRIES.find((c) => c.iso2 === "PL"));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toEqual({
        event: "catalogue.source_fallback",
        environment,
        missingVariable: "DATABASE_BUILD_URL",
      });
      warn.mockRestore();
    },
  );

  it("a country: invalidation re-reads the registry before revalidating; other tags do not", async () => {
    let answer = flipped();
    const reads = vi.fn(() => Promise.resolve(answer));
    await primeCountryRegistry(
      { APP_ENV: "production", DATABASE_BUILD_URL: BUILD_LOGIN },
      { countries: reads },
    );
    expect(reads).toHaveBeenCalledTimes(1);

    const seenAtRevalidate: string[] = [];
    const deps = {
      revalidate: () => {
        seenAtRevalidate.push(countryConfig("PL").status);
      },
      edge: noopCache,
      log: { info: vi.fn(), warn: vi.fn() } as never,
      report: vi.fn(),
    };
    await invalidate(["home:en"], deps);
    expect(reads).toHaveBeenCalledTimes(1);

    answer = COUNTRIES;
    await invalidate(["country:PL", "home:en"], deps);
    expect(reads).toHaveBeenCalledTimes(2);
    // Every revalidation of that call saw the re-read registry.
    expect(seenAtRevalidate.at(-1)).toBe(
      COUNTRIES.find((c) => c.iso2 === "PL")?.status,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The scan.                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Where the file registry and the moved datasets may be imported (AC-3: "outside the static
 * providers, the seed projections and their tests"): the registry itself, the dataset directory
 * (the seed's projections), the catalogue's static providers, the registry overlay (whose static
 * provider and database overlay both start from the file), and spec 004's static trending
 * provider, which names its five picks from the authored dataset.
 */
export const CUTOVER_ALLOWED = [
  "src/config/countries.ts",
  "src/config/catalogue/",
  "src/modules/catalog/static/",
  "src/modules/geo/registry.ts",
  "src/modules/geo/db/registry.ts",
  "src/modules/ui/home/trending-provider.ts",
] as const;

/** An import of `COUNTRIES` from the registry, or any import of the moved datasets. */
const FORBIDDEN_IMPORTS: readonly { label: string; pattern: RegExp }[] = [
  {
    label: "COUNTRIES from src/config/countries.ts",
    pattern:
      /import\s*\{[^}]*\bCOUNTRIES\b[^}]*\}\s*from\s*["'][^"']*config\/countries(?:\.ts)?["']/su,
  },
  {
    label: "the products, tiers or prices dataset",
    pattern:
      /from\s*["'][^"']*config\/catalogue\/(?:products|tiers|prices)\.data(?:\.ts)?["']/u,
  },
];

/** Every violation in `files` (path relative to the repository → source). */
export function cutoverViolations(
  files: ReadonlyMap<string, string>,
): readonly string[] {
  const hits: string[] = [];
  for (const [path, source] of files) {
    if (CUTOVER_ALLOWED.some((allowed) => path.startsWith(allowed))) continue;
    for (const { label, pattern } of FORBIDDEN_IMPORTS) {
      if (pattern.test(source)) hits.push(`${path}: ${label}`);
    }
  }
  return hits;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(?:ts|tsx|mts)$/u.test(entry)) out.push(full);
  }
  return out;
}

describe("T-03: the source scan", () => {
  it("finds no runtime read of the file registry or the moved datasets under src/", () => {
    const files = new Map(
      sourceFiles(join(REPO_ROOT, "src")).map((file) => [
        relative(REPO_ROOT, file),
        readFileSync(file, "utf8"),
      ]),
    );
    expect(files.size).toBeGreaterThan(500);
    expect(cutoverViolations(files)).toEqual([]);
  });

  it("catches a fixture import under src/app, in both shapes", () => {
    expect(
      cutoverViolations(
        new Map([
          [
            "src/app/[locale]/fixture.ts",
            'import {\n  countryConfig,\n  COUNTRIES,\n} from "@/config/countries";\n',
          ],
          [
            "src/app/[locale]/fixture2.ts",
            'import { PRICES } from "@/config/catalogue/prices.data";\n',
          ],
          [
            "src/modules/catalog/static/index.ts",
            'import { COUNTRIES } from "@/config/countries";\n',
          ],
        ]),
      ),
    ).toEqual([
      "src/app/[locale]/fixture.ts: COUNTRIES from src/config/countries.ts",
      "src/app/[locale]/fixture2.ts: the products, tiers or prices dataset",
    ]);
  });
});
