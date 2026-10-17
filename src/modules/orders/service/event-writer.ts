/**
 * The one writer of `order_event` rows and their outbox rows (spec 010 §5.2: "status-preserving
 * events through the same writer, so `seq` stays monotonic and the outbox rule is the same";
 * TASK-202).
 *
 * Callers hold the order row's lock (`SELECT … FOR UPDATE`) before they call it, so two writers
 * of one order cannot read the same `max(seq)`. The `(order_id, seq)` unique key of `0007` is the
 * second line.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "./actor";
import type { OrderEventType, OrderMode } from "./events";
import { jsonb, type OrderExecutor } from "./executor";
import { writeOutbox, type OutboxTargetResolver } from "./outbox";

export interface EventWrite {
  readonly orderId: string;
  readonly type: OrderEventType;
  /** Both null (seq 1 of `place`) or both set (a transition or a status-preserving event). */
  readonly status: { readonly from: string; readonly to: string } | null;
  readonly actor: Actor;
  readonly mode: OrderMode;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly payloadVersion: number;
}

export interface EventWritten {
  readonly eventId: string;
  readonly seq: number;
  readonly outboxId: string | null;
}

const NextSeqRow = z.object({ seq: z.coerce.number().int().positive() });
const IdRow = z.object({ id: z.uuid() });

export async function writeEvent(
  executor: OrderExecutor,
  write: EventWrite,
  resolver?: OutboxTargetResolver,
): Promise<EventWritten> {
  const [next] = await executor.execute(sql`
    SELECT coalesce(max(seq), 0) + 1 AS seq FROM order_event WHERE order_id = ${write.orderId}`);
  const { seq } = NextSeqRow.parse(next);
  const [inserted] = await executor.execute(sql`
    INSERT INTO order_event (order_id, seq, type, from_status, to_status, actor, payload,
                             payload_version)
    VALUES (${write.orderId}, ${seq}, ${write.type}, ${write.status?.from ?? null},
            ${write.status?.to ?? null}, ${write.actor}, ${jsonb(write.payload)},
            ${write.payloadVersion})
    RETURNING id`);
  const eventId = IdRow.parse(inserted).id;
  const outboxId = await writeOutbox(
    executor,
    {
      eventId,
      orderId: write.orderId,
      type: write.type,
      seq,
      mode: write.mode,
      payload: write.payload,
      payloadVersion: write.payloadVersion,
    },
    resolver,
  );
  return { eventId, seq, outboxId };
}
