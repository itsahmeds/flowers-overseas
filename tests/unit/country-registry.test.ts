/**
 * Spec 012b AC-2's country half (T-02's unit half; TASK-292): the database country registry is the
 * file registry with the row's facts overlaid, the seed's country projection gives back exactly
 * the file registry, and `pnpm catalogue:parity` names every URL and field that differs. The
 * database half is `tests/integration/build-role.test.ts`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { readSeedTree } from "../../seed/check.ts";
import { buildSeedPlan } from "../../seed/plan.ts";
import {
  countryUrls,
  parityReport,
  parseParityArgs,
} from "../../scripts/catalogue-parity.ts";
import { COUNTRIES } from "../../src/config/countries.ts";
import {
  COUNTRY_PARITY_FIELDS,
  countryRegistryFromRows,
  countryRegistryParity,
  operationsFromRow,
  type CountryRegistryRow,
} from "../../src/modules/geo/registry.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

/** The `country` rows the seed writes, as the registry query returns them. */
async function seededRows(): Promise<CountryRegistryRow[]> {
  const plan = buildSeedPlan(await readSeedTree(REPO_ROOT));
  const country = plan.find((table) => table.table === "country");
  return (country?.rows ?? []).map((row) => ({
    iso2: String(row["iso2"]),
    status: row["status"] as CountryRegistryRow["status"],
    guide_published: row["guide_published"] === true,
    iana_zone: String(row["iana_zone"]),
    same_day_cutoff_local:
      row["same_day_cutoff_local"] === null
        ? null
        : String(row["same_day_cutoff_local"]),
    delivery_days: (row["delivery_days"] ?? []) as string[],
    sunday_delivery: row[
      "sunday_delivery"
    ] as CountryRegistryRow["sunday_delivery"],
  }));
}

describe("the seed's country projection agrees with countries.ts (AC-2, §5.1 'Seed')", () => {
  it("writes each destination's status, guide flag and operations exactly as the file has them", async () => {
    const rows = await seededRows();
    expect(rows.map((row) => row.iso2)).toEqual(COUNTRIES.map((c) => c.iso2));
    for (const country of COUNTRIES) {
      const row = rows.find((r) => r.iso2 === country.iso2);
      expect(row?.status, country.iso2).toBe(country.status);
      expect(row?.guide_published, country.iso2).toBe(country.guidePublished);
    }
  });

  it("gives back the file registry through the database registry, so parity is empty on a fresh seed", async () => {
    const database = countryRegistryFromRows(COUNTRIES, await seededRows());
    expect(database).toEqual(COUNTRIES);
    expect(countryRegistryParity(COUNTRIES, database, countryUrls)).toEqual([]);
    expect(parityReport(await seededRows()).lines).toEqual([
      "catalogue:parity: 7 countries agree on every registry field (country half; the catalogue and price half is TASK-294's)",
    ]);
  });
});

describe("countryRegistryFromRows", () => {
  const PL: CountryRegistryRow = {
    iso2: "PL",
    status: "demo",
    guide_published: false,
    iana_zone: "Europe/Warsaw",
    same_day_cutoff_local: "13:30",
    delivery_days: ["1", "2", "3"],
    sunday_delivery: "peak",
  };

  it("takes status, the guide flag and the operations block from the row, everything else from the file", async () => {
    const rows = (await seededRows()).map((row) =>
      row.iso2 === "PL" ? PL : row,
    );
    const pl = countryRegistryFromRows(COUNTRIES, rows).find(
      (c) => c.iso2 === "PL",
    );
    const file = COUNTRIES.find((c) => c.iso2 === "PL");
    expect(pl).toEqual({
      ...file,
      status: "demo",
      guidePublished: false,
      operations: {
        ianaZone: "Europe/Warsaw",
        sameDayCutoffLocal: "13:30",
        deliveryDays: [1, 2, 3],
        sundayDelivery: "peak",
      },
    });
    // No field of the file's shape is dropped or invented by the overlay.
    expect(Object.keys(pl ?? {}).sort()).toEqual(
      Object.keys(file ?? {}).sort(),
    );
  });

  it("reads no operations block from a row without a cutoff or without a delivery day", () => {
    expect(
      operationsFromRow({ ...PL, same_day_cutoff_local: null }),
    ).toBeUndefined();
    expect(operationsFromRow({ ...PL, delivery_days: [] })).toBeUndefined();
  });

  it("refuses a destination the database has no row for, and a malformed row", async () => {
    const rows = (await seededRows()).filter((row) => row.iso2 !== "NL");
    expect(() => countryRegistryFromRows(COUNTRIES, rows)).toThrow(
      /no row for NL/u,
    );
    expect(() =>
      countryRegistryFromRows(COUNTRIES, [{ ...PL, status: "open" }]),
    ).toThrow();
  });
});

describe("pnpm catalogue:parity, country half (AC-2 / T-02)", () => {
  it("names every URL and the field when one country's status differs, and nothing else", async () => {
    const rows = (await seededRows()).map((row) =>
      row.iso2 === "DE" ? { ...row, status: "live" as const } : row,
    );
    const { differences, lines } = parityReport(rows);
    expect(differences).toHaveLength(1);
    expect(differences[0]).toMatchObject({
      iso2: "DE",
      field: "status",
      static: "demo",
      database: "live",
    });
    expect(lines).toContain(
      '/en/send-flowers-to/germany DE.status: static "demo", database "live"',
    );
    expect(lines).toContain(
      '/de/deutschland/blumen DE.status: static "demo", database "live"',
    );
    expect(lines.at(-1)).toBe(
      "catalogue:parity: 1 differing field(s) across 8 URL(s)",
    );
  });

  it.each(COUNTRY_PARITY_FIELDS.filter((f) => f !== "corridorPagePublished"))(
    "reports a difference in %s",
    async (field) => {
      const change: Record<string, Partial<CountryRegistryRow>> = {
        status: { status: "disabled" },
        guidePublished: { guide_published: false },
        operations: { same_day_cutoff_local: "12:00" },
      };
      const rows = (await seededRows()).map((row) =>
        row.iso2 === "PL" ? { ...row, ...change[field] } : row,
      );
      expect(parityReport(rows).differences.map((d) => d.field)).toEqual([
        field,
      ]);
    },
  );

  it("covers the corridor page and the shop root of every launch locale", () => {
    const pl = COUNTRIES.find((c) => c.iso2 === "PL");
    expect(pl === undefined ? [] : countryUrls(pl)).toEqual([
      "/en/send-flowers-to/poland",
      "/en/poland/flowers",
      "/en-gb/send-flowers-to/poland",
      "/en-gb/poland/flowers",
      "/de/blumen-verschicken/polen",
      "/de/polen/blumen",
      "/pl/wyslij-kwiaty/polska",
      "/pl/polska/kwiaty",
    ]);
  });

  it("requires a postgres --target and never prints it", () => {
    expect(() => parseParityArgs([])).toThrow(/--target=<postgres url>/u);
    expect(() => parseParityArgs(["--target=https://x"])).toThrow();
    expect(
      parseParityArgs(["--target=postgres://app_build:s3cret@h:5432/fo"]),
    ).toEqual({ target: "postgres://app_build:s3cret@h:5432/fo" });
    const source = readFileSync(
      resolve(REPO_ROOT, "scripts/catalogue-parity.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/write\([^)]*target/u);
  });
});
