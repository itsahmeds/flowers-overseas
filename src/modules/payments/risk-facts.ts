/**
 * `riskFactsFor(orderId)` (spec 021 §5.2 "Inputs", §12 requirement (c) on spec 013; AC-7, AC-15;
 * TASK-494): Radar's facts for the payment that paid an order, read from the provider's intent
 * and its latest charge. The risk gate calls it through the job layer (the risk module never
 * imports payments) and retries it once.
 *
 * Liability shift: 3D Secure `authenticated` or `attempt_acknowledged` shifts it; any other
 * result, or none (a wallet payment Stripe reports no 3DS for), counts as not shifted (§8 "3DS
 * and SCA policy", S3). `efwReceived` is false until spec 021's early-fraud-warning handling
 * stores the warnings (TASK-495). The card fingerprint is returned only to be hashed by the
 * caller: it is never logged here.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { withExecutor } from "@/modules/orders";

import type { PaymentTransaction } from "./context.ts";
import { isProviderFailure, type PaymentProvider } from "./provider.ts";

/** The 3D Secure results that move fraud liability to the issuer. */
export const LIABILITY_SHIFT_RESULTS: ReadonlySet<string> = new Set([
  "authenticated",
  "attempt_acknowledged",
]);

const RISK_LEVELS = ["normal", "elevated", "highest"] as const;

/** Spec 021 §5.2's fields of `riskFactsFor`. */
export interface PaymentRiskFacts {
  readonly riskLevel: (typeof RISK_LEVELS)[number] | null;
  readonly riskScore: number | null;
  readonly outcomeType: string | null;
  readonly threeDsResult: string | null;
  readonly liabilityShift: boolean | null;
  readonly cardCountry: string | null;
  readonly cardFingerprint: string | null;
  readonly wallet: string | null;
  readonly efwReceived: boolean;
}

/** Thrown when the facts cannot be read (no captured payment, or the provider failed). */
export class RiskFactsUnavailable extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`RISK_FACTS_UNAVAILABLE: ${code}`);
    this.name = "RiskFactsUnavailable";
    this.code = code;
  }
}

export interface RiskFactsDeps {
  readonly provider: PaymentProvider;
  readonly transaction?: PaymentTransaction;
}

const PaymentRow = z.object({ provider_ref: z.string().min(1) });
const Iso2 = z
  .string()
  .regex(/^[A-Z]{2}$/u)
  .nullable()
  .catch(null);
const Level = z.enum(RISK_LEVELS).nullable().catch(null);

/** The facts of the captured payment of `orderId`'s purchase (the file header). */
export async function riskFactsFor(
  orderId: string,
  deps: RiskFactsDeps,
): Promise<PaymentRiskFacts> {
  const id = z.uuid().parse(orderId);
  const run: PaymentTransaction =
    deps.transaction ??
    ((fn) => withExecutor(undefined, "payments.risk_facts", fn));
  const [row] = await run((executor) =>
    executor.execute(sql`
      SELECT p.provider_ref FROM payment p
      JOIN "order" o ON o.purchase_id = p.purchase_id
      WHERE o.id = ${id} AND p.provider_ref IS NOT NULL AND p.captured_at IS NOT NULL
      ORDER BY p.captured_at DESC LIMIT 1`),
  );
  const payment = PaymentRow.safeParse(row);
  if (!payment.success) throw new RiskFactsUnavailable("no_captured_payment");
  const intent = await deps.provider.retrieveIntent(payment.data.provider_ref);
  if (isProviderFailure(intent)) throw new RiskFactsUnavailable(intent.failure);
  const threeDs = intent.threeDsOutcome ?? null;
  return {
    riskLevel: Level.parse(intent.riskLevel ?? null),
    riskScore: intent.riskScore ?? null,
    outcomeType: intent.outcomeType ?? null,
    threeDsResult: threeDs,
    liabilityShift: threeDs !== null && LIABILITY_SHIFT_RESULTS.has(threeDs),
    cardCountry: Iso2.parse(intent.cardCountry ?? null),
    cardFingerprint: intent.cardFingerprint ?? null,
    wallet: intent.wallet ?? null,
    efwReceived: false,
  };
}
