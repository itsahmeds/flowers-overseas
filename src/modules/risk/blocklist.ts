/**
 * Writing `risk_blocklist` (spec 021 §5.1 item 4, §5.2 "cancel", "cancel_block"; AC-21; TASK-494):
 * the order's email and card hashes, for `BLOCKLIST_RETENTION_DAYS`. Only this module writes the
 * list (admin context for an admin's block, system for the gate's). A hash already listed keeps
 * its source and gets the later expiry. Hashes only: nothing raw reaches the list.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { OrderExecutor } from "@/modules/orders";
import { BLOCKLIST_RETENTION_DAYS } from "@/config/risk";

import type { IdentityHashes } from "./velocity.ts";

const DAY_MS = 86_400_000;

export type BlocklistSource = "dispute" | "admin" | "efw";

/** Lists the email and card hashes present in `hashes`. Returns how many were written. */
export async function addToBlocklist(
  executor: OrderExecutor,
  hashes: Pick<IdentityHashes, "email" | "card">,
  source: BlocklistSource,
  now: Date,
): Promise<number> {
  const expires = new Date(now.getTime() + BLOCKLIST_RETENTION_DAYS * DAY_MS);
  let written = 0;
  for (const kind of ["email", "card"] as const) {
    const hash = hashes[kind];
    if (hash === null) continue;
    await executor.execute(sql`
      INSERT INTO risk_blocklist (kind, hash, source, created_at, expires_at)
      VALUES (${kind}, ${hash}, ${source}, ${now.toISOString()}::timestamptz,
              ${expires.toISOString()}::timestamptz)
      ON CONFLICT (kind, hash) DO UPDATE
        SET expires_at = greatest(risk_blocklist.expires_at, EXCLUDED.expires_at)`);
    written += 1;
  }
  return written;
}

const IdentityRow = z.object({
  kind: z.enum(["email", "card", "recipient_address"]),
  hash: z.string(),
});

/** The email and card hashes recorded for `orderId` (the latest of each kind). */
export async function orderHashes(
  executor: OrderExecutor,
  orderId: string,
): Promise<Pick<IdentityHashes, "email" | "card">> {
  const rows = (
    await executor.execute(sql`
      SELECT kind, hash FROM risk_identity
      WHERE order_id = ${orderId} AND kind IN ('email', 'card')
      ORDER BY created_at DESC, id DESC`)
  ).map((row) => IdentityRow.parse(row));
  return {
    email: rows.find((row) => row.kind === "email")?.hash ?? null,
    card: rows.find((row) => row.kind === "card")?.hash ?? null,
  };
}
