/**
 * What the admin reroute dialog lists, and the auto-cancel time beside it (spec 020a §2.2, §5.2
 * "Reroute", AC-9, AC-12; TASK-358).
 *
 * **`rerouteCandidates(orderId)`**, read only: for a `test` or `live` order at
 * `no_partner_available`, every florist spec 016's `eligibleCandidates` admits with **"already
 * offered" relaxed** and nothing else (the same relaxation `manualReroute` applies at submit time,
 * so the list and the command agree), in `rankCandidates` order, each marked when it declined or
 * did not answer an earlier offer of this order. A florist failing the status for the order's
 * mode, coverage, catalogue, blackout, capacity or sign-in reachability is not listed. Any other
 * order lists nobody. The order row is read without a lock: the list is a page render, and the
 * command re-checks everything under the locks when the admin submits.
 *
 * **`rerouteGraceEnd(orderId, viewerZone)`**: `graceEndDisplay` of the order's latest
 * exhaustion, the instant the expiry job is scheduled at (`./no-partner`), or null when the order
 * is not `no_partner_available` or has no destination cutoff.
 *
 * Reads ids, a trading name and town, payouts and responses: no buyer or recipient data.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { textArray, type OrderExecutor } from "../service/executor";

import {
  eligibleCandidates,
  PARTNER_STATUS_FOR_MODE,
  rankCandidates,
} from "./candidates";
import { graceEndDisplay, type GraceEndDisplay } from "./grace-display";
import { readExhaustion } from "./no-partner";
import {
  lockRoutingFacts,
  readRoutingPartners,
  resolveRoutingDeps,
  type RoutingDeps,
} from "./route";

/** What an earlier offer of this order to the florist came to. */
export type EarlierResponse = "declined" | "timed_out";

/** One row of the reroute dialog (spec 020a §5.2 "Reroute"). */
export interface RerouteCandidate {
  readonly partnerId: string;
  /** The florist's trading name as admin knows it (`fulfillment_partner.legal_name`). */
  readonly displayName: string;
  /** `fulfillment_partner.city_label`. */
  readonly city: string;
  /** 1 for the first in `rankCandidates` order. */
  readonly rankPosition: number;
  /** What the florist is paid for this order, integer minor units of `payoutCurrency`. */
  readonly payoutMinor: number;
  readonly payoutCurrency: string;
  readonly previously: EarlierResponse | null;
}

export interface RerouteReadOptions extends Pick<
  RoutingDeps,
  "now" | "environment" | "signInStatuses"
> {
  /** The caller's transaction (the admin page's read); default: a fresh one. */
  readonly executor?: OrderExecutor;
}

const NameRow = z.object({
  id: z.uuid(),
  legal_name: z.string(),
  city_label: z.string(),
});

const ResponseRow = z.object({
  partner_id: z.uuid(),
  response: z.enum(["accept", "decline", "timeout"]).nullable(),
});

const EARLIER: Readonly<Record<string, EarlierResponse>> = Object.freeze({
  decline: "declined",
  timeout: "timed_out",
});

async function candidatesWithin(
  executor: OrderExecutor,
  orderId: string,
  options: RerouteReadOptions,
): Promise<RerouteCandidate[]> {
  const resolved = resolveRoutingDeps(options, "admin.reroute_candidates");
  const facts = await lockRoutingFacts(executor, orderId, { lock: false });
  if (
    facts === undefined ||
    facts.mode === "demo" ||
    facts.status !== "no_partner_available"
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
  // "Already offered" relaxed, and nothing else: the rule `manualReroute` checks on submit.
  const relaxed = { ...facts.order, offeredPartnerIds: [] };
  const ranked = rankCandidates(
    eligibleCandidates(relaxed, partners, resolved.signIn).candidates,
    null,
  );
  if (ranked.length === 0) return [];

  const ids = ranked.map((candidate) => candidate.partnerId);
  const names = new Map(
    (
      await executor.execute(sql`
        SELECT id, legal_name, city_label FROM fulfillment_partner
        WHERE id::text = ANY(${textArray(ids)})`)
    ).map((raw) => {
      const row = NameRow.parse(raw);
      return [row.id, row] as const;
    }),
  );
  // The latest answer of each florist to an offer of this order.
  const earlier = new Map<string, EarlierResponse | null>();
  for (const raw of await executor.execute(sql`
      SELECT partner_id, response FROM order_assignment
      WHERE order_id = ${orderId} ORDER BY attempt`)) {
    const row = ResponseRow.parse(raw);
    earlier.set(
      row.partner_id,
      row.response === null ? null : (EARLIER[row.response] ?? null),
    );
  }
  return ranked.map((candidate, index) => {
    const name = names.get(candidate.partnerId);
    return {
      partnerId: candidate.partnerId,
      displayName: name?.legal_name ?? "",
      city: name?.city_label ?? "",
      rankPosition: index + 1,
      payoutMinor: candidate.payout.minor,
      payoutCurrency: candidate.payout.currency,
      previously: earlier.get(candidate.partnerId) ?? null,
    };
  });
}

/** **`rerouteCandidates(orderId)`** (spec 020a §5.2). Writes nothing. */
export async function rerouteCandidates(
  orderId: string,
  options: RerouteReadOptions = {},
): Promise<RerouteCandidate[]> {
  if (!z.uuid().safeParse(orderId).success) return [];
  const run = (executor: OrderExecutor) =>
    candidatesWithin(executor, orderId, options);
  if (options.executor !== undefined) return run(options.executor);
  return resolveRoutingDeps(options, "admin.reroute_candidates").transaction(
    run,
  );
}

const StatusRow = z.object({ status: z.string() });

/**
 * **`rerouteGraceEnd(orderId, viewerZone)`**: when the `no_partner_available` order is cancelled
 * unless rerouted, in its destination's zone and in `viewerZone`; null for any other order.
 */
export async function rerouteGraceEnd(
  executor: OrderExecutor,
  orderId: string,
  viewerZone: string,
): Promise<GraceEndDisplay | null> {
  if (!z.uuid().safeParse(orderId).success) return null;
  const [raw] = await executor.execute(sql`
    SELECT status FROM "order" WHERE id = ${orderId}`);
  if (raw === undefined) return null;
  if (StatusRow.parse(raw).status !== "no_partner_available") return null;
  const exhaustion = await readExhaustion(executor, orderId);
  if (
    exhaustion === undefined ||
    exhaustion.exhaustedAt === null ||
    exhaustion.destination === null
  ) {
    return null;
  }
  return graceEndDisplay(
    {
      exhaustedAt: exhaustion.exhaustedAt,
      deliveryDate: exhaustion.deliveryDate,
      destination: exhaustion.destination,
    },
    viewerZone,
  );
}
