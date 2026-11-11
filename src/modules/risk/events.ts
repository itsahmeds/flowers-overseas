/**
 * The risk gate's two order events (spec 021 §5.2 "Events registered in spec 010's registry",
 * spec 002 §14 A11 (a); AC-7, AC-20; TASK-494): `order.risk_held` and `order.risk_released`,
 * both status-preserving, written only by `appendEvent`. Registered when this file loads, so
 * every module of `risk` that appends one imports it first. No notification row exists for
 * either (§5.3, AC-29): a held order reads to the buyer exactly as an unheld one.
 *
 * Payloads carry ids, a score and codes only; no personal data, no signal value.
 */
import { z } from "zod";

import { OrderModeSchema, registerEventSchema } from "@/modules/orders";

/** `order.risk_held` v1: the review the hold opened, and the score that held it. */
export const OrderRiskHeldV1 = z
  .object({
    version: z.literal(1),
    mode: OrderModeSchema,
    review_id: z.uuid(),
    score: z.number().int().min(0).max(100),
    rules_version: z.number().int().positive(),
  })
  .strict();
export type OrderRiskHeld = z.infer<typeof OrderRiskHeldV1>;

/** `order.risk_released` v1: an admin's approval, or the deadline default's release. */
export const OrderRiskReleasedV1 = z
  .object({
    version: z.literal(1),
    mode: OrderModeSchema,
    review_id: z.uuid(),
    outcome: z.enum(["approved", "auto_released"]),
  })
  .strict();
export type OrderRiskReleased = z.infer<typeof OrderRiskReleasedV1>;

let registered = false;

/** Registers both schemas once per process (a second call is a no-op). */
export function registerRiskEvents(): void {
  if (registered) return;
  registered = true;
  registerEventSchema("order.risk_held", 1, OrderRiskHeldV1);
  registerEventSchema("order.risk_released", 1, OrderRiskReleasedV1);
}

registerRiskEvents();
