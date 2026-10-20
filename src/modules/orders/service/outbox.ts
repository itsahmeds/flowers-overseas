/**
 * The outbox writer and `outboxTargets` (spec 010 §2, §5.2; AC-22, AC-24; `plan/11` §2;
 * TASK-202).
 *
 * The outbox is the order machine's only integration point: a later consumer (spec 017's
 * notifications, a CRM sync) reads it, never the order tables. An `outbox` row is written in the
 * event's transaction **only when `outboxTargets(event, mode)` returns at least one target**
 * (the table's `CHECK` refuses an empty `targets` array anyway).
 *
 * Phase 0: every list in `OUTBOX_ROUTES` is empty. Spec 013 (TASK-254) adds its `payments` and
 * `routing` rows, per mode, in `../outbox/routes.ts`; `outboxTargets` reads both tables, one
 * target name once. Specs 016 and 023 add theirs the same way. Whatever they add,
 * `resolveOutboxTargets` drops every target whose audience is a **buyer or a recipient** for a
 * `demo` or `test` order (AC-24): spec 017 must never email a stranger about a demo, and the rule
 * is here, in one function, rather than in each consumer.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { paymentOutboxTargets } from "../outbox/routes";

import type { OrderEventType, OrderMode } from "./events";
import { jsonb, textArray, type OrderExecutor } from "./executor";

/** Who a target ends up messaging. `buyer` and `recipient` are people outside the business. */
export const OUTBOX_AUDIENCES = [
  "buyer",
  "recipient",
  "partner",
  "staff",
  "system",
] as const;

export const OutboxTargetSchema = z
  .object({
    /** The consumer's name, stored in `outbox.targets` (`notify.buyer_email`, `crm.sync`, …). */
    name: z.string().regex(/^[a-z][a-z_]*(\.[a-z][a-z_]*)*$/),
    audience: z.enum(OUTBOX_AUDIENCES),
  })
  .strict();

export type OutboxTarget = z.infer<typeof OutboxTargetSchema>;

/** Event → targets. Every list is empty in Phase 0 (spec 015 and spec 017 fill them). */
export type OutboxRoutes = Readonly<
  Partial<Record<OrderEventType, readonly OutboxTarget[]>>
>;

export const OUTBOX_ROUTES: OutboxRoutes = {};

/** Audiences a `demo` or `test` order may never reach (AC-24). */
const PEOPLE: ReadonlySet<OutboxTarget["audience"]> = new Set([
  "buyer",
  "recipient",
]);

/** AC-24's rule, on any list of targets: no buyer or recipient for a `demo` or `test` order. */
export function withoutPeopleUnlessLive(
  targets: readonly OutboxTarget[],
  mode: OrderMode,
): readonly OutboxTarget[] {
  if (mode === "live") return targets;
  return targets.filter((target) => !PEOPLE.has(target.audience));
}

/** The targets of `event` for an order in `mode`, under `routes`. Pure. */
export function resolveOutboxTargets(
  routes: OutboxRoutes,
  event: OrderEventType,
  mode: OrderMode,
): readonly OutboxTarget[] {
  return withoutPeopleUnlessLive(routes[event] ?? [], mode);
}

/**
 * `outboxTargets(event, mode)` of §5.2: this spec's (empty) routes plus spec 013's rows
 * (`../outbox/routes.ts`), each target name once (the `AFTER INSERT ON outbox` trigger of `0016`
 * makes one delivery per element, and refuses a name twice), people filtered for `demo`/`test`.
 */
export function outboxTargets(
  event: OrderEventType,
  mode: OrderMode,
): readonly OutboxTarget[] {
  const seen = new Set<string>();
  const targets: OutboxTarget[] = [];
  for (const target of [
    ...resolveOutboxTargets(OUTBOX_ROUTES, event, mode),
    ...withoutPeopleUnlessLive(paymentOutboxTargets(event, mode), mode),
  ]) {
    if (seen.has(target.name)) continue;
    seen.add(target.name);
    targets.push(target);
  }
  return targets;
}

/** The resolver signature, injectable so T-22 can drive "one target → one row". */
export type OutboxTargetResolver = (
  event: OrderEventType,
  mode: OrderMode,
) => readonly OutboxTarget[];

export interface OutboxWrite {
  readonly eventId: string;
  readonly orderId: string;
  readonly type: OrderEventType;
  readonly seq: number;
  readonly mode: OrderMode;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly payloadVersion: number;
}

/**
 * Writes the outbox row for one event when it has targets, in the caller's transaction.
 * Returns the row id, or null when no target was resolved (no row).
 */
export async function writeOutbox(
  executor: OrderExecutor,
  write: OutboxWrite,
  resolver: OutboxTargetResolver = outboxTargets,
): Promise<string | null> {
  // The filter runs again here, after whatever resolver was injected, so no resolver can route
  // a demo or test event to a buyer or a recipient (AC-24).
  const targets = withoutPeopleUnlessLive(
    resolver(write.type, write.mode).map((target) =>
      OutboxTargetSchema.parse(target),
    ),
    write.mode,
  );
  if (targets.length === 0) return null;
  const rows = await executor.execute(sql`
    INSERT INTO outbox (event_id, order_id, targets, payload, payload_version)
    VALUES (${write.eventId}, ${write.orderId}, ${textArray(targets.map((target) => target.name))},
            ${jsonb({ type: write.type, orderId: write.orderId, seq: write.seq, data: write.payload })},
            ${write.payloadVersion})
    RETURNING id`);
  return z.object({ id: z.uuid() }).parse(rows[0]).id;
}
