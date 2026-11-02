/**
 * Spec 016's `afterDecline` on spec 011's `AcceptedOrderEffect` (spec 016 §5.2 "Contracts
 * consumed", §12 request on spec 011; AC-8; TASK-328).
 *
 * After a florist declines a `test` or `live` order, the next offer is the router's: this effect
 * enqueues `order.route` for the order (keyed by it, so a decline and a timeout landing together
 * queue one run). It writes no event and sends nothing: the declining florist gets no V4.
 *
 * The enqueue happens inside the command's transaction, before its commit (see `./schedule.ts`):
 * a failed enqueue rolls the decline back, and a job that runs for a decline that then failed to
 * commit finds the offer still open and does nothing.
 */
import { pgBossRoutingScheduler, type RoutingScheduler } from "./schedule";

/** The context the seam passes (spec 011's `EffectContext`, structurally). */
export interface DeclineContext {
  readonly orderId: string;
  readonly mode: "demo" | "test" | "live";
}

export interface RoutingDeclineEffect {
  afterDecline(context: DeclineContext): Promise<void>;
}

/** `afterDecline` over `schedule` (pg-boss by default). */
export function createRoutingDeclineEffect(
  schedule: RoutingScheduler = pgBossRoutingScheduler,
): RoutingDeclineEffect {
  return {
    async afterDecline(context) {
      if (context.mode === "demo") return;
      await schedule([{ name: "order.route", orderId: context.orderId }]);
    },
  };
}

export const routingDeclineEffect: RoutingDeclineEffect =
  createRoutingDeclineEffect();
