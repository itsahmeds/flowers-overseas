/**
 * The identity rows and the velocity counts over them (spec 021 §5.2 "Signals" S7 to S11, §13
 * Q11; AC-14; TASK-494). Every count is over keyed hashes in `risk_identity`, never a raw value:
 * two spellings of one address that normalise the same, or `a.b+x@gmail.com` and `ab@gmail.com`,
 * are one hash and count once.
 *
 *  - S7: orders paid within 24 hours (their `placed` to `paid_unrouted` or `authorised` event)
 *    that carry this email hash, this order included;
 *  - S8: distinct recipient-address hashes on orders with this email hash, 7 days;
 *  - S9: distinct card hashes on orders with this email hash, 7 days;
 *  - S10: distinct email hashes on orders with this card hash, 7 days;
 *  - S11: distinct email hashes on orders with this recipient-address hash, 7 days.
 *
 * A 7-day count reads identity rows written inside the window (`created_at`), this order's
 * included. The peak-day relaxation is the score's (`PEAK_DAY_EXTRA`), not the query's.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { OrderExecutor } from "@/modules/orders";
import { IDENTITY_RETENTION_DAYS, VELOCITY } from "@/config/risk";

import type { IdentityKind } from "./normalise.ts";
import type { RiskInputV1 } from "./score.ts";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The order's three hashes; `null` where the value is missing or no key is configured. */
export interface IdentityHashes {
  readonly email: string | null;
  readonly card: string | null;
  readonly recipient_address: string | null;
}

/** Writes the order's identity rows (idempotent on `(order_id, kind, hash)`). */
export async function recordIdentities(
  executor: OrderExecutor,
  orderId: string,
  hashes: IdentityHashes,
  now: Date,
): Promise<void> {
  for (const kind of ["email", "card", "recipient_address"] as const) {
    const hash = hashes[kind];
    if (hash === null) continue;
    const expires = new Date(
      now.getTime() + IDENTITY_RETENTION_DAYS[kind] * DAY_MS,
    );
    await executor.execute(sql`
      INSERT INTO risk_identity (order_id, kind, hash, created_at, expires_at)
      VALUES (${orderId}, ${kind}, ${hash}, ${now.toISOString()}::timestamptz,
              ${expires.toISOString()}::timestamptz)
      ON CONFLICT (order_id, kind, hash) DO NOTHING`);
  }
}

const Count = z.object({ n: z.number().int().nonnegative() });

async function count(
  executor: OrderExecutor,
  query: ReturnType<typeof sql>,
): Promise<number> {
  const [row] = await executor.execute(query);
  return Count.parse(row ?? { n: 0 }).n;
}

/** Distinct `other` hashes on orders sharing `kind = hash`, both rows inside the window. */
function distinctAcross(
  kind: IdentityKind,
  hash: string,
  other: IdentityKind,
  since: Date,
): ReturnType<typeof sql> {
  return sql`
    SELECT count(DISTINCT b.hash)::int AS n
    FROM risk_identity a
    JOIN risk_identity b ON b.order_id = a.order_id AND b.kind = ${other}
    WHERE a.kind = ${kind} AND a.hash = ${hash}
      AND a.created_at >= ${since.toISOString()}::timestamptz
      AND b.created_at >= ${since.toISOString()}::timestamptz`;
}

/** The five velocity counts of `RiskInputV1` at `now` (the file header). */
export async function velocityCounts(
  executor: OrderExecutor,
  hashes: IdentityHashes,
  now: Date,
): Promise<RiskInputV1["velocity"]> {
  const week = (hours: number) => new Date(now.getTime() - hours * HOUR_MS);
  const day = new Date(now.getTime() - VELOCITY.S7.windowHours * HOUR_MS);
  const { email, card, recipient_address: address } = hashes;
  return {
    paidOrdersByEmail24h:
      email === null
        ? 0
        : await count(
            executor,
            sql`
              SELECT count(DISTINCT i.order_id)::int AS n
              FROM risk_identity i
              WHERE i.kind = 'email' AND i.hash = ${email}
                AND EXISTS (
                  SELECT 1 FROM order_event e
                  WHERE e.order_id = i.order_id AND e.from_status = 'placed'
                    AND e.to_status IN ('authorised', 'paid_unrouted')
                    AND e.occurred_at >= ${day.toISOString()}::timestamptz
                    AND e.occurred_at <= ${now.toISOString()}::timestamptz)`,
          ),
    recipientAddressesByEmail7d:
      email === null
        ? 0
        : await count(
            executor,
            distinctAcross(
              "email",
              email,
              "recipient_address",
              week(VELOCITY.S8.windowHours),
            ),
          ),
    cardsByEmail7d:
      email === null
        ? 0
        : await count(
            executor,
            distinctAcross(
              "email",
              email,
              "card",
              week(VELOCITY.S9.windowHours),
            ),
          ),
    emailsByCard7d:
      card === null
        ? 0
        : await count(
            executor,
            distinctAcross(
              "card",
              card,
              "email",
              week(VELOCITY.S10.windowHours),
            ),
          ),
    buyersByRecipientAddress7d:
      address === null
        ? 0
        : await count(
            executor,
            distinctAcross(
              "recipient_address",
              address,
              "email",
              week(VELOCITY.S11.windowHours),
            ),
          ),
  };
}
