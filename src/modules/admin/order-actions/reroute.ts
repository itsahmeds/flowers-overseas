/**
 * Reroute from the admin order page (spec 020a §2.2, §5.2 "Reroute", AC-9 to AC-11; TASK-358).
 *
 * `adminOrderReroute(input, deps)` is the server action's body: `requirePermission('orders.reroute')`
 * is its first statement (admin and ops, §13 Q2), then the input is parsed with
 * `AdminRerouteSchema`, then the action runs through `runOrderAction` (lock, replay,
 * `expectedSeq`, the `admin_order_action` row and its audit row). The effect hands the locked
 * transaction to spec 016's `manualReroute(orderId, partnerId, admin:{userId})`, which re-checks
 * the florist with "already offered" relaxed under its own row lock and writes
 * `order.manual_reroute`, `order.routed` and `assignment.offered` through the engine; V1 rides
 * the outbox. A refusal (`PARTNER_NOT_ELIGIBLE`, the order no longer at `no_partner_available`, the
 * routing deadline passed) rolls the whole transaction back, so nothing is written.
 *
 * `manualReroute` is passed in (`deps.reroute`) rather than imported: it lives in the routing jobs
 * of `orders`, outside that module's barrel (importing it registers the router's event schemas),
 * and `admin` reaches other modules through their barrels only (`plan/01` §5). The server action
 * in `src/app/admin` composes the two. The buyer is sent nothing (AC-28).
 */
import type { AdminSession } from "@/lib/auth/admin";
import type { OrderExecutor } from "@/modules/orders";

import type { AdminPermission } from "../permissions.ts";
import { ORDER_ACTION_AVAILABILITY } from "./availability.ts";
import {
  type EffectContext,
  type EffectOutcome,
  type RunOrderActionDeps,
  runOrderAction,
} from "./run.ts";
import {
  type AdminOrderActionCode,
  type AdminOrderActionResult,
  type AdminRerouteInput,
  AdminRerouteSchema,
} from "./schemas.ts";

/** What `manualReroute` answers, as far as this action reads it. */
export type RerouteCommandResult =
  | { readonly kind: "rerouted"; readonly eventId: string }
  | { readonly kind: "refused"; readonly code: string };

/** Spec 016's `manualReroute`, on the caller's transaction. */
export type RerouteCommand = (
  orderId: string,
  partnerId: string,
  actor: string,
  options: { readonly executor: OrderExecutor },
) => Promise<RerouteCommandResult>;

export interface AdminOrderRerouteDeps extends RunOrderActionDeps {
  /** Spec 012's `requirePermission`; tests pass their own. */
  readonly guard?: (permission: AdminPermission) => Promise<AdminSession>;
  readonly reroute: RerouteCommand;
  readonly requestId?: string;
}

/** `manualReroute`'s refusals in spec 020a's codes (§5.2 "Result"). */
const REFUSAL_CODE: Readonly<Record<string, AdminOrderActionCode>> =
  Object.freeze({
    PARTNER_NOT_ELIGIBLE: "PARTNER_NOT_ELIGIBLE",
    // A destination with no agreed operations has no florist to offer.
    NO_OPERATIONS: "PARTNER_NOT_ELIGIBLE",
    ROUTING_DEADLINE_PASSED: "ROUTING_DEADLINE_PASSED",
    ORDER_TRANSITION_ILLEGAL: "ORDER_TRANSITION_ILLEGAL",
    ORDER_ACTOR_NOT_ALLOWED: "FORBIDDEN",
    ORDER_ACTOR_INVALID: "FORBIDDEN",
    ORDER_NOT_FOUND: "INPUT_INVALID",
  });

function rerouteEffect(
  input: AdminRerouteInput,
  deps: AdminOrderRerouteDeps,
): (context: EffectContext) => Promise<EffectOutcome> {
  return async ({ executor, order, actor }) => {
    if (!ORDER_ACTION_AVAILABILITY[order.status].reroute) {
      return { ok: false, code: "ORDER_TRANSITION_ILLEGAL" };
    }
    const result = await deps.reroute(order.id, input.partnerId, actor, {
      executor,
    });
    if (result.kind === "refused") {
      return {
        ok: false,
        code: REFUSAL_CODE[result.code] ?? "ORDER_TRANSITION_ILLEGAL",
      };
    }
    return {
      ok: true,
      resultRef: result.eventId,
      record: { partnerId: input.partnerId },
    };
  };
}

/**
 * Offers a `no_partner_available` order to the florist the admin chose (spec 020a §2.2). Returns
 * `ok` with the `order.manual_reroute` event id as `resultRef`, or a refusal code.
 */
export async function adminOrderReroute(
  input: unknown,
  deps: AdminOrderRerouteDeps,
): Promise<AdminOrderActionResult> {
  const session = await (deps.guard ?? defaultGuard)("orders.reroute");
  const parsed = AdminRerouteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INPUT_INVALID" };
  return runOrderAction(
    {
      kind: "reroute",
      input: parsed.data,
      userId: session.userId,
      ...(deps.requestId === undefined ? {} : { requestId: deps.requestId }),
    },
    rerouteEffect(parsed.data, deps),
    deps,
  );
}

async function defaultGuard(
  permission: AdminPermission,
): Promise<AdminSession> {
  const { requirePermission } = await import("../guard.ts");
  return requirePermission(permission);
}
