/**
 * `pnpm payments:backfill-balance` (spec 030b §5.2 `scripts/`, §12; TASK-439): the arguments it
 * accepts and the exact body it posts. The route's work is covered by
 * `tests/integration/finance-balance-030b.test.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  backfillRequestBody,
  parseBackfillArgs,
} from "../../scripts/payments-backfill-balance.ts";
import { BalanceBackfillRequestSchema } from "../../src/modules/payments/balance.ts";

describe("payments:backfill-balance arguments (spec 030b §12)", () => {
  it("takes --since as an ISO instant, --dry-run and --base-url, and posts only since and dryRun", () => {
    const args = parseBackfillArgs([
      "--since",
      "2026-10-21T00:00:00Z",
      "--dry-run",
      "--base-url",
      "https://staging.flowersoverseas.com",
    ]);
    expect(args).toEqual({
      since: "2026-10-21T00:00:00Z",
      dryRun: true,
      baseUrl: "https://staging.flowersoverseas.com",
    });
    expect(backfillRequestBody(args)).toEqual({
      since: "2026-10-21T00:00:00Z",
      dryRun: true,
    });
    expect(
      BalanceBackfillRequestSchema.safeParse(backfillRequestBody(args)).success,
    ).toBe(true);
    expect(
      parseBackfillArgs(["--since", "2026-10-21T02:00:00+02:00"]).dryRun,
    ).toBe(false);
  });

  it("refuses a missing --since, a date without a time, and an unknown flag", () => {
    expect(() => parseBackfillArgs([])).toThrow();
    expect(() => parseBackfillArgs(["--since", "2026-10-21"])).toThrow();
    expect(() =>
      parseBackfillArgs(["--since", "2026-10-21T00:00:00Z", "--all"]),
    ).toThrow();
  });
});
