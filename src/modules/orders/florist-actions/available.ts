/**
 * Which actions an order page offers (spec 011 §2 "Actions": "Each action is legal only in the
 * states `order_transition` allows; the page offers only those"; AC-29; TASK-215).
 *
 * `floristActionsFor(facts, partnerEvents, now)` is pure: given the assignment's answer, whether
 * it was withdrawn, the photo, the answer-by instant and **the events `order_transition` lets a
 * `partner` write from the order's current status**, it returns the actions to draw. The table
 * is the source of truth: no status is named here, so an arrow added to or removed from the
 * machine changes the page with no code change. `floristActions(ctx, assignmentId)` reads the
 * facts and the table under the member's partner context.
 *
 * Spec 026a AC-6 (TASK-354): Accept is offered only when `canAcceptFor(mode, partnerStatus)`
 * holds for the order's mode and the shop's status read on this request, so a paused shop's open
 * offer shows Decline alone. Decline is not gated.
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { FLORIST_PARTNER_STATUSES } from "@/config/florists";
import type { FloristPartnerStatus } from "@/config/florists";
import { withDbContext } from "@/lib/db";

import { type OrderMode, OrderModeSchema } from "../service/events";
import { drizzleExecutor, type OrderExecutor } from "../service/executor";

import { canAcceptFor } from "./can-accept";
import type { FloristCommandContext } from "./commands";

export const FLORIST_ACTIONS = [
  "accept",
  "decline",
  "outForDelivery",
  "delivered",
  "addPhoto",
] as const;
export type FloristAction = (typeof FLORIST_ACTIONS)[number];

export interface ActionFacts {
  readonly response: "accept" | "decline" | "timeout" | null;
  readonly withdrawn: boolean;
  readonly hasPhoto: boolean;
  readonly slaExpiresAt: Date;
  /** The order's mode and the shop's status now: Accept needs `canAcceptFor` (spec 026a AC-6). */
  readonly mode: OrderMode;
  readonly partnerStatus: FloristPartnerStatus;
}

/** The actions to offer, in the order the dock draws them. */
export function floristActionsFor(
  facts: ActionFacts,
  partnerEvents: ReadonlySet<string>,
  now: Date,
): FloristAction[] {
  if (facts.withdrawn) return [];
  if (facts.response === null) {
    if (now.getTime() >= facts.slaExpiresAt.getTime()) return [];
    const accepting = canAcceptFor(facts.mode, facts.partnerStatus);
    return (
      [
        ["decline", "assignment.declined"],
        ["accept", "assignment.accepted"],
      ] as const
    )
      .filter(([, event]) => partnerEvents.has(event))
      .filter(([action]) => action !== "accept" || accepting)
      .map(([action]) => action);
  }
  if (facts.response !== "accept") return [];
  const actions: FloristAction[] = [];
  if (partnerEvents.has("order.out_for_delivery"))
    actions.push("outForDelivery");
  if (partnerEvents.has("order.delivered") && !facts.hasPhoto) {
    actions.push("delivered");
  }
  if (partnerEvents.has("order.photo_uploaded") && !facts.hasPhoto) {
    actions.push("addPhoto");
  }
  return actions;
}

const Instant = z
  .union([z.date(), z.string()])
  .transform((value) => (value instanceof Date ? value : new Date(value)));

const FactsRow = z.object({
  response: z.enum(["accept", "decline", "timeout"]).nullable(),
  withdrawn: z.boolean(),
  has_photo: z.boolean(),
  sla_expires_at: Instant,
  mode: OrderModeSchema,
  partner_status: z.enum(FLORIST_PARTNER_STATUSES),
  partner_events: z.array(z.string()).nullable(),
});

/** The actions for one assignment, inside a partner-context transaction; `[]` when hidden. */
export async function selectFloristActions(
  executor: OrderExecutor,
  assignmentId: string,
  now: Date,
): Promise<FloristAction[]> {
  if (!z.uuid().safeParse(assignmentId).success) return [];
  const [row] = await executor.execute(sql`
    SELECT a.response, a.withdrawn_at IS NOT NULL AS withdrawn, a.sla_expires_at,
           o.mode, p.status AS partner_status,
           EXISTS (SELECT 1 FROM delivery_proof d WHERE d.order_id = o.id) AS has_photo,
           (SELECT array_agg(t.event ORDER BY t.event) FROM order_transition t
             WHERE t.from_status = o.status AND 'partner' = ANY (t.allowed_actors))
             AS partner_events
    FROM order_assignment a JOIN partner_order o ON o.id = a.order_id
    JOIN fulfillment_partner p ON p.id = a.partner_id
    WHERE a.id = ${assignmentId}`);
  if (row === undefined) return [];
  const facts = FactsRow.parse(row);
  return floristActionsFor(
    {
      response: facts.response,
      withdrawn: facts.withdrawn,
      hasPhoto: facts.has_photo,
      slaExpiresAt: facts.sla_expires_at,
      mode: facts.mode,
      partnerStatus: facts.partner_status,
    },
    new Set(facts.partner_events ?? []),
    now,
  );
}

/** `floristActions(ctx, assignmentId)`: what the order page may offer now. */
export function floristActions(
  ctx: FloristCommandContext,
  assignmentId: string,
  options: { readonly now?: Date } = {},
): Promise<FloristAction[]> {
  return withDbContext(
    {
      role: "partner",
      userId: ctx.userId,
      partnerIds: [...ctx.partnerIds],
      requestId: ctx.requestId ?? randomUUID(),
    },
    (db) =>
      selectFloristActions(
        drizzleExecutor(db),
        assignmentId,
        options.now ?? new Date(),
      ),
  );
}
