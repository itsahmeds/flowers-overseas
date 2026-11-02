/**
 * `order.no_partner_expire` — the end of the grace window (spec 016 §5.2 "Jobs"; §13 16-2 and
 * the O-3 ruling; AC-11, AC-12; TASK-329).
 *
 * Scheduled at `graceEnd` by every write of `order.no_partner_available` (`./no-partner`). One run,
 * in one transaction (a `system` one of its own unless the caller passes one):
 *
 *  1. lock the order and read it. Not `test` or `live`, or not at `no_partner_available` (the
 *     founder rerouted it, or the buyer or an admin cancelled it, or a florist has it): nothing;
 *  2. recompute `graceEnd` from the order's **latest** `order.no_partner_available` event, its
 *     delivery date and its destination. Before it (the job fetched early, or an earlier
 *     exhaustion's job finding a later one after a reroute): enqueue the job again for that
 *     instant and write nothing;
 *  3. at or after it: `cancelOrder(orderId, system:routing.no_partner_expiry, 'no_partner')`,
 *     spec 013's one cancel command, which writes `order.cancelled` through the engine. This job
 *     never calls `transition('order.cancelled')` itself. Spec 013's `payments` handler refunds
 *     the full charged amount; the `notifications` target sends B5.
 *
 * `routing.auto` off changes nothing here (O-3): such an order got the same `graceEnd` from the
 * moment it entered `no_partner_available`. A second run after the cancel finds the order
 * `cancelled` and writes nothing. Logs: ids and the outcome only.
 */
import type { Logger } from "@/lib/logger";
import { cancelOrder, type CancelOrderRefusal } from "@/modules/payments";

import { ActorSchema } from "../service/actor";
import type { OrderExecutor } from "../service/executor";

import { graceEndOf, readExhaustion } from "./no-partner";
import {
  lockRoutingFacts,
  resolveRoutingDeps,
  type ResolvedRoutingDeps,
  type RoutingDeps,
} from "./route";

/** The expiry's actor (§5.2): `order.cancelled` with reason `no_partner`. */
export const NO_PARTNER_EXPIRY_ACTOR = ActorSchema.parse(
  "system:routing.no_partner_expiry",
);

/** Spec 013's cancel command, as the job calls it (a seam for the unit suite). */
export type NoPartnerCancel = (
  orderId: string,
  actor: string,
  reason: "no_partner",
  options: { readonly executor: OrderExecutor },
) => ReturnType<typeof cancelOrder>;

export interface NoPartnerExpireDeps extends RoutingDeps {
  /** Default: spec 013's `cancelOrder`. */
  readonly cancel?: NoPartnerCancel;
  /** Run inside this transaction instead of a fresh one. */
  readonly executor?: OrderExecutor;
}

export type NoPartnerExpireOutcome =
  | { readonly kind: "cancelled"; readonly eventId: string }
  | { readonly kind: "not_due"; readonly graceEnd: Date }
  | {
      readonly kind: "skipped";
      readonly reason: "not_found" | "demo" | "status" | "no_operations";
    }
  | { readonly kind: "refused"; readonly code: CancelOrderRefusal };

async function expireWithin(
  executor: OrderExecutor,
  orderId: string,
  deps: ResolvedRoutingDeps,
  cancel: NoPartnerCancel,
): Promise<NoPartnerExpireOutcome> {
  const facts = await lockRoutingFacts(executor, orderId);
  if (facts === undefined) return { kind: "skipped", reason: "not_found" };
  if (facts.mode === "demo") return { kind: "skipped", reason: "demo" };
  if (facts.status !== "no_partner_available") {
    return { kind: "skipped", reason: "status" };
  }
  const exhaustion = await readExhaustion(executor, orderId);
  const end = exhaustion === undefined ? null : graceEndOf(exhaustion);
  if (end === null) return { kind: "skipped", reason: "no_operations" };
  if (deps.now().getTime() < end.getTime()) {
    await deps.schedule([
      { name: "order.no_partner_expire", orderId, startAfter: end },
    ]);
    return { kind: "not_due", graceEnd: end };
  }
  const result = await cancel(orderId, NO_PARTNER_EXPIRY_ACTOR, "no_partner", {
    executor,
  });
  return result.kind === "cancelled"
    ? { kind: "cancelled", eventId: result.eventId }
    : { kind: "refused", code: result.code };
}

function report(
  log: Logger,
  orderId: string,
  outcome: NoPartnerExpireOutcome,
): void {
  const fields = {
    order_id: orderId,
    job: "order.no_partner_expire",
    outcome: outcome.kind,
    ...(outcome.kind === "skipped" ? { reason: outcome.reason } : {}),
    ...(outcome.kind === "refused" ? { reason: outcome.code } : {}),
  };
  const warn =
    outcome.kind === "refused" ||
    (outcome.kind === "skipped" && outcome.reason === "no_operations");
  if (warn) log.warn(fields, "routing.no_partner_expire");
  else log.info(fields, "routing.no_partner_expire");
}

/** **`order.no_partner_expire`** for one order (§5.2). */
export async function expireNoPartner(
  orderId: string,
  deps: NoPartnerExpireDeps = {},
): Promise<NoPartnerExpireOutcome> {
  const resolved = resolveRoutingDeps(deps, "order.no_partner_expire");
  const cancel: NoPartnerCancel = deps.cancel ?? cancelOrder;
  const run = (executor: OrderExecutor) =>
    expireWithin(executor, orderId, resolved, cancel);
  const outcome =
    deps.executor === undefined
      ? await resolved.transaction(run)
      : await run(deps.executor);
  report(resolved.log, orderId, outcome);
  return outcome;
}
