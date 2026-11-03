/**
 * `rerouteCandidates(orderId)` and `noPartnerGrace(orderId)`: what spec 020a's reroute dialog and
 * action panel read (spec 020a §2.2, §5.2 "Reroute", AC-9, AC-12; spec 016 §5.2; TASK-358).
 *
 * Read only. `rerouteCandidates` lists the florists `manualReroute` would accept right now: every
 * florist of the order's mode in the destination country that passes `eligibleCandidates` with
 * **"already offered" relaxed** (the founder may phone a florist who declined earlier) and nothing
 * else, ranked by `rankCandidates` as `order.route` ranks them, each marked when it declined or
 * did not answer on this order before. A florist failing coverage, catalogue, blackout, capacity,
 * status for the mode or sign-in reachability is not listed. Anything but a `test` or `live` order
 * at `no_partner_available` has no candidate: the reroute control exists for that status only.
 *
 * `noPartnerGrace` is the instant spec 016 cancels the order if nobody acts (`graceEnd` of the
 * order's latest `order.no_partner_available`, the same reading `order.no_partner_expire` and the
 * founder's A1 email use) and the destination's zone, so the panel can show it in both zones.
 *
 * Reads ids, a florist's trading name and town, payouts and dates; never a buyer or recipient
 * field. The order row is read under `lockRoutingFacts`' lock inside a short read transaction of
 * its own, the same read `manualReroute` makes, so the list and the refusal cannot disagree.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { textArray, type OrderExecutor } from "../service/executor";

import {
  eligibleCandidates,
  PARTNER_STATUS_FOR_MODE,
  rankCandidates,
} from "./candidates";
import { graceEndOf, readExhaustion } from "./no-partner";
import {
  lockRoutingFacts,
  readRoutingPartners,
  resolveRoutingDeps,
  type RoutingDeps,
} from "./route";

/** What the order's earlier offer to a florist ended in, when it ended without an acceptance. */
export type EarlierAnswer = "declined" | "timed_out";

/** One row of the reroute dialog (spec 020a §5.2 "Reroute"). */
export interface RerouteCandidate {
  readonly partnerId: string;
  /** The florist's trading name, as admin's florists list shows it. */
  readonly displayName: string;
  readonly city: string;
  /** 1 for the florist automatic routing would offer first. */
  readonly rankPosition: number;
  /** What this florist is paid for this order, in its payout currency. */
  readonly payoutMinor: number;
  readonly payoutCurrency: string;
  readonly previously: EarlierAnswer | null;
}

export interface RerouteReadOptions extends Pick<
  RoutingDeps,
  "transaction" | "now" | "environment" | "signInStatuses"
> {
  /** The caller's transaction; default: a short one of its own. */
  readonly executor?: OrderExecutor;
}

/** The status the reroute control and `manualReroute` accept (spec 020a §5.2 availability). */
const REROUTABLE_STATUS = "no_partner_available";

const PartnerLabelRow = z.object({
  id: z.uuid(),
  legal_name: z.string().min(1),
  city_label: z.string(),
});

const EarlierRow = z.object({
  partner_id: z.uuid(),
  response: z.enum(["decline", "timeout"]),
});

async function candidatesWithin(
  executor: OrderExecutor,
  orderId: string,
  options: RerouteReadOptions,
): Promise<RerouteCandidate[]> {
  const resolved = resolveRoutingDeps(options, "routing.reroute_candidates");
  const facts = await lockRoutingFacts(executor, orderId);
  if (
    facts === undefined ||
    facts.mode === "demo" ||
    facts.status !== REROUTABLE_STATUS
  ) {
    return [];
  }
  const partners = await readRoutingPartners(executor, {
    countryId: facts.countryId,
    status: PARTNER_STATUS_FOR_MODE[facts.order.mode],
    deliveryDate: facts.deliveryDate,
    productIds: facts.order.lines.flatMap((line) =>
      line.kind === "product" ? [line.productId] : [],
    ),
    now: resolved.now(),
  });
  // "Already offered" relaxed, and nothing else (spec 020a §2.2).
  const verdict = eligibleCandidates(
    { ...facts.order, offeredPartnerIds: [] },
    partners,
    resolved.signIn,
  );
  const ranked = rankCandidates(verdict.candidates, null);
  if (ranked.length === 0) return [];

  const ids = ranked.map((candidate) => candidate.partnerId);
  const labels = new Map(
    (
      await executor.execute(sql`
        SELECT id, legal_name, city_label FROM fulfillment_partner
        WHERE id::text = ANY(${textArray(ids)})`)
    ).map((raw) => {
      const row = PartnerLabelRow.parse(raw);
      return [row.id, row] as const;
    }),
  );
  // The latest unaccepted answer of each florist on this order (attempt order).
  const earlier = new Map<string, EarlierAnswer>();
  for (const raw of await executor.execute(sql`
    SELECT partner_id, response FROM order_assignment
    WHERE order_id = ${orderId} AND response IN ('decline', 'timeout')
    ORDER BY attempt`)) {
    const row = EarlierRow.parse(raw);
    earlier.set(
      row.partner_id,
      row.response === "decline" ? "declined" : "timed_out",
    );
  }

  return ranked.map((candidate, index) => {
    const label = labels.get(candidate.partnerId);
    return {
      partnerId: candidate.partnerId,
      displayName: label?.legal_name ?? candidate.partnerId,
      city: label?.city_label ?? "",
      rankPosition: index + 1,
      payoutMinor: candidate.payout.minor,
      payoutCurrency: candidate.payout.currency,
      previously: earlier.get(candidate.partnerId) ?? null,
    };
  });
}

/**
 * **`rerouteCandidates(orderId)`** (spec 020a §5.2): the florists the order may be offered to now,
 * ranked, earlier declines and timeouts marked. Empty for any order the reroute control is not
 * for.
 */
export async function rerouteCandidates(
  orderId: string,
  options: RerouteReadOptions = {},
): Promise<readonly RerouteCandidate[]> {
  if (!z.uuid().safeParse(orderId).success) return [];
  const run = (executor: OrderExecutor) =>
    candidatesWithin(executor, orderId, options);
  if (options.executor !== undefined) return run(options.executor);
  return resolveRoutingDeps(options, "routing.reroute_candidates").transaction(
    run,
  );
}

/** When an untaken order is cancelled if nobody acts, and the zone its delivery lives in. */
export interface NoPartnerGrace {
  readonly graceEnd: Date;
  readonly destinationZone: string;
}

/**
 * **`noPartnerGrace(orderId)`** (spec 020a AC-12): `graceEnd` of the order's latest exhaustion
 * and the destination's zone; null when the order has no exhaustion or no agreed operations.
 */
export async function noPartnerGrace(
  orderId: string,
  options: Pick<RerouteReadOptions, "executor" | "transaction"> = {},
): Promise<NoPartnerGrace | null> {
  if (!z.uuid().safeParse(orderId).success) return null;
  const run = async (executor: OrderExecutor) => {
    const exhaustion = await readExhaustion(executor, orderId);
    if (exhaustion === undefined || exhaustion.destination === null) {
      return null;
    }
    const end = graceEndOf(exhaustion);
    return end === null
      ? null
      : { graceEnd: end, destinationZone: exhaustion.destination.ianaZone };
  };
  if (options.executor !== undefined) return run(options.executor);
  return resolveRoutingDeps(options, "routing.no_partner_grace").transaction(
    run,
  );
}
