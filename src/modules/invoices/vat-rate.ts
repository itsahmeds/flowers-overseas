/**
 * The `VatRateProvider` seam (spec 018 §5.2 "NBP adapter", AC-19; TASK-341).
 *
 * `issueInvoice` asks for a rate only when the profile names a `vat_currency_code` that differs
 * from the invoice currency, and asks **before** it locks the series row, so no network call is
 * made while a number is held. The NBP table A adapter is TASK-342's (spec 018 §12 task 3 part
 * b); until it is plugged in, the default provider throws, the issue is retried by the outbox, and
 * after the last retry `outbox.dead` alerts. With `invoice.issue` off until the accountant's
 * sign-off no live invoice reaches it, so the gap is closed before it can matter.
 */
import type { VatRateSnapshot } from "./snapshot";

export interface VatRateRequest {
  /** The invoice currency (ISO 4217). */
  readonly from: string;
  /** The profile's `vat_currency_code`. */
  readonly to: string;
  /** The tax point: the date of `payment.captured_at` in the destination's zone (`YYYY-MM-DD`). */
  readonly taxPointDate: string;
}

export interface VatRateProvider {
  rateFor(request: VatRateRequest): Promise<VatRateSnapshot>;
}

export class VatRateProviderNotConfigured extends Error {
  constructor() {
    super("VAT_RATE_PROVIDER_NOT_CONFIGURED: no VatRateProvider is plugged in");
    this.name = "VatRateProviderNotConfigured";
  }
}

let configured: VatRateProvider | undefined;

/** TASK-342 plugs the NBP adapter in here, once, at start. */
export function setVatRateProvider(provider: VatRateProvider): void {
  configured = provider;
}

/** The provider `issueInvoice` uses unless one is passed. */
export function vatRateProvider(): VatRateProvider {
  return (
    configured ?? {
      rateFor: () => Promise.reject(new VatRateProviderNotConfigured()),
    }
  );
}
