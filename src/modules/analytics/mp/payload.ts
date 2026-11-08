/**
 * `purchaseBody` and `refundBody` (spec 023 §5.2 "The outbox target", AC-20, AC-24, AC-26;
 * TASK-491): exactly the keys §5.2 lists, parsed by their strict schemas before they leave.
 * `debug_mode: 1` only outside production. `consent` is `GRANTED` for both signals only when the
 * buyer accepted marketing, else `DENIED`.
 */
import type { DeploymentEnvironment } from "@/lib/env.schema";
import type { Money } from "@/modules/i18n";

import {
  type CheckoutChannel,
  type MpPurchaseBody,
  MpPurchaseBodySchema,
  type MpRefundBody,
  MpRefundBodySchema,
} from "../events";
import type { Ga4Item } from "../items";
import { toGa4Value } from "../money";

interface BodyCommon {
  readonly clientId: string;
  readonly at: Date;
  readonly marketingConsent: boolean;
  readonly transactionId: string;
  readonly environment: DeploymentEnvironment;
}

function consentOf(marketing: boolean): MpPurchaseBody["consent"] {
  const signal = marketing ? "GRANTED" : "DENIED";
  return { ad_user_data: signal, ad_personalization: signal };
}

function debugOf(environment: DeploymentEnvironment): { debug_mode?: 1 } {
  return environment === "production" ? {} : { debug_mode: 1 };
}

/** Microseconds since the epoch, from an instant (integer: ms times 1000). */
export function timestampMicros(at: Date): number {
  return at.getTime() * 1000;
}

export function purchaseBody(
  input: BodyCommon & {
    readonly value: Money;
    readonly items: readonly Ga4Item[];
    readonly sessionId: string | null;
    readonly locale: string;
    readonly destinationCountry: string;
    readonly countryStatus: "live" | "demo" | "disabled";
    readonly paymentType: string;
    readonly checkoutChannel: CheckoutChannel;
  },
): MpPurchaseBody {
  return MpPurchaseBodySchema.parse({
    client_id: input.clientId,
    timestamp_micros: timestampMicros(input.at),
    consent: consentOf(input.marketingConsent),
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: input.transactionId,
          value: toGa4Value(input.value),
          currency: input.value.currency,
          items: input.items,
          ...(input.sessionId === null ? {} : { session_id: input.sessionId }),
          engagement_time_msec: 1,
          locale: input.locale,
          destination_country: input.destinationCountry,
          country_status: input.countryStatus,
          payment_type: input.paymentType,
          checkout_channel: input.checkoutChannel,
          ...debugOf(input.environment),
        },
      },
    ],
  });
}

export function refundBody(
  input: BodyCommon & { readonly value: Money },
): MpRefundBody {
  return MpRefundBodySchema.parse({
    client_id: input.clientId,
    timestamp_micros: timestampMicros(input.at),
    consent: consentOf(input.marketingConsent),
    events: [
      {
        name: "refund",
        params: {
          transaction_id: input.transactionId,
          value: toGa4Value(input.value),
          currency: input.value.currency,
          engagement_time_msec: 1,
          ...debugOf(input.environment),
        },
      },
    ],
  });
}
