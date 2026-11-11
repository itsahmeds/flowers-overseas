/**
 * The cutover's build path for the country registry (spec 012b AC-3, AC-4; TASK-294).
 *
 * Next runs no `instrumentation.ts` hook in `next build`'s workers, so `pnpm build` reads the
 * registry once through the build login (`countryRegistryBuildStep()`) and the workers install
 * it from `COUNTRY_REGISTRY_BUILD_SNAPSHOT` (`src/config/countries.ts`):
 *
 *  - without the build login the step reads nothing and answers `""` (the staging fallback);
 *  - with it the step reads the rows through the login, overlays them on the file and answers
 *    the registry; a failed read rejects, so the build fails before `next build` starts;
 *  - in a build worker the snapshot answers `countryConfig()`; outside the build phase it is
 *    ignored, and a snapshot naming a destination the file lacks throws.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { countryRegistryBuildStep } from "../../scripts/country-registry-build-step.ts";
import {
  COUNTRIES,
  COUNTRY_REGISTRY_BUILD_SNAPSHOT_ENV,
  type CountryConfig,
  activeCountries,
  countryConfig,
  countryRegistryBuildFacts,
  uninstallCountryRegistry,
} from "../../src/config/countries.ts";

const BUILD_LOGIN = "postgres://app_build:secret@db.example.test:5432/fo";

afterEach(() => {
  uninstallCountryRegistry();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The `country` rows the file describes, with Poland's status turned around. */
function rows(): unknown[] {
  return COUNTRIES.map((country) => ({
    iso2: country.iso2,
    status:
      country.iso2 === "PL"
        ? country.status === "live"
          ? "demo"
          : "live"
        : country.status,
    guide_published: country.guidePublished,
    iana_zone: country.operations?.ianaZone ?? "Europe/Warsaw",
    same_day_cutoff_local: country.operations?.sameDayCutoffLocal ?? null,
    delivery_days: (country.operations?.deliveryDays ?? []).map(String),
    sunday_delivery: country.operations?.sundayDelivery ?? "none",
  }));
}

const filePoland = COUNTRIES.find((c) => c.iso2 === "PL") as CountryConfig;

describe("countryRegistryBuildStep", () => {
  it("reads nothing and answers the empty string without the build login", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const read = vi.fn(() => Promise.resolve(rows()));
    expect(await countryRegistryBuildStep({ APP_ENV: "staging" }, read)).toBe(
      "",
    );
    expect(read).not.toHaveBeenCalled();
  });

  it("reads nothing in development, login or not", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const read = vi.fn(() => Promise.resolve(rows()));
    expect(
      await countryRegistryBuildStep(
        { APP_ENV: "development", DATABASE_BUILD_URL: BUILD_LOGIN },
        read,
      ),
    ).toBe("");
    expect(read).not.toHaveBeenCalled();
  });

  it("reads the rows through the login and answers the overlaid registry", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const read = vi.fn(() => Promise.resolve(rows()));
    const snapshot = await countryRegistryBuildStep(
      { APP_ENV: "production", DATABASE_BUILD_URL: BUILD_LOGIN },
      read,
    );
    expect(read).toHaveBeenCalledWith(BUILD_LOGIN);
    const parsed = JSON.parse(snapshot) as { iso2: string; status: string }[];
    expect(parsed.map((c) => c.iso2)).toEqual(COUNTRIES.map((c) => c.iso2));
    expect(parsed.find((c) => c.iso2 === "PL")?.status).not.toBe(
      filePoland.status,
    );
    // One line, naming the source, never the login.
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).not.toContain("secret");
  });

  it("rejects when the database cannot be read, so the build fails (AC-4)", async () => {
    const read = vi.fn(() => Promise.reject(new Error("connect ECONNREFUSED")));
    await expect(
      countryRegistryBuildStep(
        { APP_ENV: "staging", DATABASE_BUILD_URL: BUILD_LOGIN },
        read,
      ),
    ).rejects.toThrow(/ECONNREFUSED/u);
  });
});

describe("the build snapshot in a next build worker", () => {
  async function snapshot(): Promise<string> {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    return countryRegistryBuildStep(
      { APP_ENV: "staging", DATABASE_BUILD_URL: BUILD_LOGIN },
      () => Promise.resolve(rows()),
    );
  }

  it("answers countryConfig() and activeCountries() from the snapshot", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("DATABASE_BUILD_URL", BUILD_LOGIN);
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv(COUNTRY_REGISTRY_BUILD_SNAPSHOT_ENV, await snapshot());
    expect(countryConfig("PL").status).not.toBe(filePoland.status);
    expect(activeCountries()).toHaveLength(COUNTRIES.length);
  });

  it("is ignored outside the build phase: the server must install its own", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("DATABASE_BUILD_URL", BUILD_LOGIN);
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    vi.stubEnv(COUNTRY_REGISTRY_BUILD_SNAPSHOT_ENV, await snapshot());
    expect(() => countryConfig("PL")).toThrow(/^COUNTRY_REGISTRY_NOT_LOADED/u);
  });

  it("throws on a snapshot that is not exactly the file's destinations", () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("DATABASE_BUILD_URL", BUILD_LOGIN);
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv(
      COUNTRY_REGISTRY_BUILD_SNAPSHOT_ENV,
      JSON.stringify(countryRegistryBuildFacts(COUNTRIES.slice(1))),
    );
    expect(() => countryConfig("PL")).toThrow();
  });
});
