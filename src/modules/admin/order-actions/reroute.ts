/**
 * Offer an untaken order to a florist the admin chose (spec 020a §2.2, §5.2 "Reroute", AC-10,
 * AC-11; TASK-358, over spec 016's `manualReroute` and its transaction handle, §12 request 2).
 *
 * `adminReroute(input)` is the server action's body: `requirePermission('orders.reroute')` is its
 * first statement (admin and ops), then the input is parsed with `AdminRerouteSchema`, then the
 * action runs through `runOrderAction` (lock, replay, `expectedSeq`, the `admin_order_action` row
 * and its audit row in the reroute's transaction). Under the lock:
 *
 *  - the availability table decides first: any status but `no_partner_available` is
 *    `ORDER_TRANSITION_ILLEGAL` (an order cancelled by `order.no_partner_expire` after the dialog
 *    rendered is refused here, and `expectedSeq` has already caught it);
 *  - then `manualReroute(orderId, partnerId, admin:{userId})` (`deps.reroute`) on this
 *    transaction's handle. It
 *    re-checks the florist with "already offered" relaxed and the capacity counted under the
 *    florist's row lock; a florist no longer eligible (blacked out, full, unreachable since the
 *    dialog rendered) is `PARTNER_NOT_ELIGIBLE`, past the routing deadline
 *    `ROUTING_DEADLINE_PASSED`, and nothing is written. On success it writes `order.manual_reroute`,
 *    `order.routed` and `assignment.offered` with the admin as actor, and the outbox sends V1 to
 *    the florist. The buyer is sent nothing.
 *
 * `result_ref` is the `order.manual_reroute` event id; the action row carries the partner id.
 *
 * Lives here rather than beside `manualReroute` (spec 020a §5.2 "Where things live" names
 * `src/modules/orders/routing`): `runOrderAction` is admin's (`plan/01` §5: "admin queries and
 * actions"), and no file under `orders` imports `admin`; refunds made the same choice (TASK-359).
 * The read half, `rerouteCandidates`, is in `orders/routing` as the spec says.
 * It loads neither the router nor the payments barrel, so `./index.ts` re-exports it.
 */
import type { AdminSession } from "@/lib/auth/admin";
import type { OrderExecutor } from "@/modules/orders";

import type { AdminPermission } from "../permissions.ts";
import { availableActions, type UnavailableCause } from "./availability.ts";
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

/**
 * Spec 016's `manualReroute`, as this action calls it: on the action's transaction handle. The
 * server action passes `manualReroute` from `@/modules/orders/routing/jobs` (only `src/app` and
 * `src/jobs` may import a module's internals, and the routing jobs barrel is not in `orders`'s
 * public one, so a module never loads the router by accident).
 */
export type RerouteCommand = (
  orderId: string,
  partnerId: string,
  actor: string,
  options: { readonly executor: OrderExecutor },
) => Promise<
  | {
      readonly kind: "rerouted";
      readonly eventId: string;
      readonly partnerId: string;
    }
  | { readonly kind: "refused"; readonly code: string }
>;

export interface AdminRerouteDeps extends RunOrderActionDeps {
  /** Spec 012's `requirePermission`; tests pass their own. */
  readonly guard?: (permission: AdminPermission) => Promise<AdminSession>;
  /** `manualReroute`, with its clock, scheduler and sign-in policy bound by the caller. */
  readonly reroute: RerouteCommand;
  readonly requestId?: string;
}

/** Spec 016's refusals in spec 020a's codes. An actor refusal cannot happen for `admin:`. */
const REFUSAL_CODE: Readonly<Record<string, AdminOrderActionCode>> =
  Object.freeze({
    PARTNER_NOT_ELIGIBLE: "PARTNER_NOT_ELIGIBLE",
    ROUTING_DEADLINE_PASSED: "ROUTING_DEADLINE_PASSED",
    NO_OPERATIONS: "NO_OPERATIONS",
    ORDER_TRANSITION_ILLEGAL: "ORDER_TRANSITION_ILLEGAL",
    ORDER_NOT_FOUND: "INPUT_INVALID",
  });

/** Why the reroute control is absent, as the code a forged submission gets. */
function unavailableCode(cause: UnavailableCause): AdminOrderActionCode {
  if (cause === "permission") return "FORBIDDEN";
  if (cause === "demo") return "DEMO_ORDER";
  return "ORDER_TRANSITION_ILLEGAL";
}

function rerouteEffect(
  input: AdminRerouteInput,
  session: AdminSession,
  deps: AdminRerouteDeps,
): (context: EffectContext) => Promise<EffectOutcome> {
  return async ({ executor, order, actor }) => {
    const control = availableActions(
      {
        status: order.status,
        mode: order.mode,
        // The money facts only decide the refund controls; a reroute never reads them.
        capturedMinor: 0n,
        remainingMinor: 0n,
        refundInFlight: false,
      },
      { roles: session.roles },
    ).reroute;
    if (!control.available) {
      return { ok: false, code: unavailableCode(control.cause) };
    }
    const result = await deps.reroute(order.id, input.partnerId, actor, {
      executor,
    });
    if (result.kind === "refused") {
      const code = REFUSAL_CODE[result.code];
      if (code === undefined) {
        throw new Error(`ADMIN_REROUTE_UNEXPECTED_REFUSAL: ${result.code}`);
      }
      return { ok: false, code };
    }
    return {
      ok: true,
      resultRef: result.eventId,
      record: { partnerId: result.partnerId },
    };
  };
}

/**
 * Offers one `no_partner_available` order to one florist, as the signed-in admin (spec 020a
 * §2.2). Returns spec 020a's result: `ok` with the `order.manual_reroute` event id as
 * `resultRef`, or a refusal code.
 */
export async function adminReroute(
  input: unknown,
  deps: AdminRerouteDeps,
): Promise<AdminOrderActionResult> {
  const session = await (deps.guard ?? defaultGuard)("orders.reroute");
  const parsed = AdminRerouteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INPUT_INVALID" };
  const data = parsed.data;
  return runOrderAction(
    {
      kind: "reroute",
      input: data,
      userId: session.userId,
      ...(deps.requestId === undefined ? {} : { requestId: deps.requestId }),
    },
    rerouteEffect(data, session, deps),
    deps,
  );
}

async function defaultGuard(
  permission: AdminPermission,
): Promise<AdminSession> {
  const { requirePermission } = await import("../guard.ts");
  return requirePermission(permission);
}
