/**
 * Spec 012b AC-1 (T-01's unit half; TASK-292): `db:seed --insert-only` is parsed, a plain seed is
 * refused in production and allowed everywhere else, and the real-parent columns are the three
 * the AC names. The database half is `tests/integration/seed-insert-only.test.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  PRODUCTION_REFUSAL,
  REAL_PARENT_COLUMNS,
  assertSeedModeAllowed,
  parseSeedArgs,
} from "../../seed/index.ts";

describe("db:seed --insert-only (spec 012b AC-1)", () => {
  it("parses --insert-only beside --dry-run and --only, and defaults it off", () => {
    expect(parseSeedArgs([])).toEqual({ dryRun: false, insertOnly: false });
    expect(parseSeedArgs(["--insert-only", "--dry-run", "--only=geo"])).toEqual(
      { dryRun: true, insertOnly: true, only: ["geo"] },
    );
    expect(() => parseSeedArgs(["--insert"])).toThrow(/unknown argument/u);
  });

  it("refuses a plain seed when APP_ENV=production, naming --insert-only", () => {
    expect(() =>
      assertSeedModeAllowed({ APP_ENV: "production" }, { insertOnly: false }),
    ).toThrow(PRODUCTION_REFUSAL);
    expect(() => assertSeedModeAllowed({ APP_ENV: "production" }, {})).toThrow(
      /--insert-only/u,
    );
    expect(PRODUCTION_REFUSAL).toContain("--insert-only");
  });

  it("allows --insert-only in production, and a plain seed in every other environment", () => {
    expect(() =>
      assertSeedModeAllowed({ APP_ENV: "production" }, { insertOnly: true }),
    ).not.toThrow();
    for (const environment of ["development", "test", "preview", "staging"]) {
      expect(() =>
        assertSeedModeAllowed({ APP_ENV: environment }, {}),
      ).not.toThrow();
    }
    expect(() => assertSeedModeAllowed({}, {})).not.toThrow();
  });

  it("guards the children of a real product, country and florist", () => {
    expect(REAL_PARENT_COLUMNS).toEqual({
      product_id: "product",
      country_id: "country",
      partner_id: "fulfillment_partner",
    });
  });
});
