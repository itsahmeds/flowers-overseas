/**
 * `manualReroute(orderId, partnerId, actor)` — the founder offers an untaken order to a florist
 * of their choice (spec 016 §5.2 "`manualReroute`", "Transitions and events this spec writes"
 * rows 11 and 12; AC-13; spec 020a §12 request 2; TASK-329).
 *
 * Called by spec 020a's reroute action with `admin:{uuid}`. From `no_partner_available` only, in
 * one transaction (the caller's, when it passes `executor`, so its action row, audit row and these
 * writes commit together; else a `system` one of its own):
 *
 *  1. lock the order and read its routing facts; anything but a `test` or `live` order at
 *     `no_partner_available` is `ORDER_TRANSITION_ILLEGAL`, and nothing is written;
 *  2. the named florist must pass `eligibleCandidates` with **"already offered" relaxed** (the
 *     founder may have phoned a florist who declined earlier) and nothing else: the right status
 *     for the order's mode in the destination country, coverage, catalogue, no blackout, capacity
 *     (counted after its row is locked, as `order.route` counts), sign-in reachability. A florist
 *     failing one is `PARTNER_NOT_ELIGIBLE` with the rule, and nothing is written;
 *  3. the offer window of §5.2 for now; past the routing deadline the order can no longer arrive
 *     on its date and the reroute is `ROUTING_DEADLINE_PASSED` (the grace window ends at that
 *     deadline anyway);
 *  4. `order.manual_reroute` (row 11, `no_partner_available` → `manual_reroute`), then the
 *     first-offer steps of `order.route` with the founder as actor: `order.routed` (row 12), one
 *     `order_assignment`, `assignment.offered`, the reminder and the timeout.
 *
 * Status only through `transition`, events only through the engine (ADR-0009). A refusal by the
 * engine itself (an actor class the rows do not allow) is returned as its code; the engine
 * refuses before it writes, so nothing is written then either. Logs carry ids and the outcome.
 */
import { z } from "zod";

import { isOrderEngineError, type OrderErrorCode } from "../service/errors";
import type { OrderExecutor } from "../service/executor";
import { transition } from "../service/transition";

import {
  eligibleCandidates,
  type ExclusionRule,
  PARTNER_STATUS_FOR_MODE,
} from "./candidates";
import {
  lockAndRecount,
  lockRoutingFacts,
  readRoutingPartners,
  resolveRoutingDeps,
  type ResolvedRoutingDeps,
  type RoutingDeps,
  writeOffer,
} from "./route";
import { offerWindow } from "./windows";

export interface ManualRerouteOptions extends RoutingDeps {
  /** The caller's transaction (spec 020a's `runOrderAction`); default: a fresh one. */
  readonly executor?: OrderExecutor;
}

/** Why `manualReroute` wrote nothing. */
export type ManualRerouteRefusal =
  | "PARTNER_NOT_ELIGIBLE"
  | "ROUTING_DEADLINE_PASSED"
  | "NO_OPERATIONS"
  | Extract<
      OrderErrorCode,
      | "ORDER_NOT_FOUND"
      | "ORDER_TRANSITION_ILLEGAL"
      | "ORDER_ACTOR_NOT_ALLOWED"
      | "ORDER_ACTOR_INVALID"
    >;

export type ManualRerouteResult =
  | {
      readonly kind: "rerouted";
      /** The `order.manual_reroute` event (spec 020a's `result_ref`). */
      readonly eventId: string;
      readonly assignmentId: string;
      readonly partnerId: string;
      readonly attempt: number;
      readonly offeredAt: Date;
      readonly slaExpiresAt: Date;
    }
  | {
      readonly kind: "refused";
      readonly code: ManualRerouteRefusal;
      /** For `PARTNER_NOT_ELIGIBLE`: the rule it failed; null when it is not a florist of this destination and mode. */
      readonly rule?: ExclusionRule | null;
    };

const ENGINE_REFUSALS = [
  "ORDER_NOT_FOUND",
  "ORDER_TRANSITION_ILLEGAL",
  "ORDER_ACTOR_NOT_ALLOWED",
  "ORDER_ACTOR_INVALID",
] as const;

async function rerouteWithin(
  executor: OrderExecutor,
  orderId: string,
  partnerId: string,
  actor: string,
  deps: ResolvedRoutingDeps,
): Promise<ManualRerouteResult> {
  const facts = await lockRoutingFacts(executor, orderId);
  if (facts === undefined) return { kind: "refused", code: "ORDER_NOT_FOUND" };
  if (facts.mode === "demo" || facts.status !== "no_partner_available") {
    return { kind: "refused", code: "ORDER_TRANSITION_ILLEGAL" };
  }
  if (facts.destination === null) {
    return { kind: "refused", code: "NO_OPERATIONS" };
  }
  const now = deps.now();
  const window = offerWindow(now, facts.deliveryDate, facts.destination);
  if (window.kind === "deadline_passed") {
    return { kind: "refused", code: "ROUTING_DEADLINE_PASSED" };
  }

  const partners = await readRoutingPartners(executor, {
    countryId: facts.countryId,
    status: PARTNER_STATUS_FOR_MODE[facts.order.mode],
    deliveryDate: facts.deliveryDate,
    productIds: facts.order.lines.flatMap((line) =>
      line.kind === "product" ? [line.productId] : [],
    ),
    now,
  });
  const snapshot = partners.find((partner) => partner.partnerId === partnerId);
  if (snapshot === undefined) {
    return { kind: "refused", code: "PARTNER_NOT_ELIGIBLE", rule: null };
  }
  // "Already offered" relaxed, and nothing else.
  const relaxed = {
    ...facts.order,
    offeredPartnerIds: facts.order.offeredPartnerIds.filter(
      (offered) => offered !== partnerId,
    ),
  };
  const fresh = await lockAndRecount(executor, facts.deliveryDate, snapshot);
  const verdict = eligibleCandidates(relaxed, [fresh], deps.signIn);
  const [excluded] = verdict.excluded;
  if (verdict.candidates.length !== 1) {
    return {
      kind: "refused",
      code: "PARTNER_NOT_ELIGIBLE",
      rule: excluded?.rule ?? null,
    };
  }

  let eventId: string;
  try {
    eventId = (
      await transition(
        orderId,
        "order.manual_reroute",
        actor,
        { mode: facts.mode, partnerId },
        { executor },
      )
    ).eventId;
  } catch (error) {
    for (const code of ENGINE_REFUSALS) {
      if (isOrderEngineError(error, code)) return { kind: "refused", code };
    }
    throw error;
  }
  const offered = await writeOffer(executor, {
    facts,
    partnerId,
    window,
    actor,
    firstOffer: true,
    schedule: deps.schedule,
  });
  return {
    kind: "rerouted",
    eventId,
    assignmentId: offered.assignmentId,
    partnerId,
    attempt: offered.attempt,
    offeredAt: offered.offeredAt,
    slaExpiresAt: offered.slaExpiresAt,
  };
}

/** **`manualReroute`** (§5.2). Writes nothing on any refusal. */
export async function manualReroute(
  orderId: string,
  partnerId: string,
  actor: string,
  options: ManualRerouteOptions = {},
): Promise<ManualRerouteResult> {
  if (!z.uuid().safeParse(orderId).success) {
    return { kind: "refused", code: "ORDER_NOT_FOUND" };
  }
  if (!z.uuid().safeParse(partnerId).success) {
    return { kind: "refused", code: "PARTNER_NOT_ELIGIBLE", rule: null };
  }
  const resolved = resolveRoutingDeps(options, "routing.manual_reroute");
  const run = (executor: OrderExecutor) =>
    rerouteWithin(executor, orderId, partnerId, actor, resolved);
  const result =
    options.executor === undefined
      ? await resolved.transaction(run)
      : await run(options.executor);
  resolved.log.info(
    {
      order_id: orderId,
      partner_id: partnerId,
      job: "routing.manual_reroute",
      outcome: result.kind,
      ...(result.kind === "refused" ? { reason: result.code } : {}),
    },
    "routing.manual_reroute",
  );
  return result;
}
