/** Re-exports for `finance-margin.test.ts`, plus the AC-12 effective-rate case. */
import { effectiveRatePpm } from "@/modules/payments/balance";

export * from "@/modules/admin/finance";

export function effectiveRateFixture(): bigint | null {
  return effectiveRatePpm(
    { amountMinor: 4590n, currency: "GBP" },
    { amountMinor: 5302n, currency: "EUR" },
  );
}
