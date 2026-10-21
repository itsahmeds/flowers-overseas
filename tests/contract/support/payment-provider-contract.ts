/**
 * Runs `PAYMENT_PROVIDER_CONTRACT` (spec 013 AC-8, T-08; TASK-255) under Vitest.
 *
 * The cases live in `src/modules/payments/provider.ts`, written without a test runner, so spec
 * 014's Mollie adapter imports the same list; this wrapper gives each case its own `it()` and a
 * fresh harness. A case fails by throwing `ContractViolation`.
 */
import { describe, it } from "vitest";

import {
  PAYMENT_PROVIDER_CONTRACT,
  type PaymentProviderHarness,
} from "../../../src/modules/payments/provider.ts";

export function describePaymentProviderContract(
  name: string,
  makeHarness: () => PaymentProviderHarness,
): void {
  describe(`PaymentProvider contract: ${name} (spec 013 §5.2, AC-8)`, () => {
    for (const contractCase of PAYMENT_PROVIDER_CONTRACT) {
      it(contractCase.name, async () => {
        await contractCase.run(makeHarness());
      });
    }
  });
}
