/**
 * @purpose Rotate an order's tracking link (§5.2)
 * @spec 018
 *
 * `pnpm orders:rotate-tracking --order <uuid>` (spec 018 §5.2 `rotateTrackingToken`, AC-2;
 * TASK-338): the Phase 1 way to revoke a tracking link that was sent to the wrong person. It bumps
 * `"order".tracking_token_version`, so every link signed before stops resolving and the buyer's
 * next email carries a fresh one, and writes one `audit_log` row (`order.tracking_token_rotated`,
 * channel `cli`, actor `system:orders.rotate_tracking`) in the same transaction. Spec 020 adds the
 * admin button.
 *
 * The same two statements as `rotateTrackingToken` in `src/modules/orders/tracking.ts`, restated
 * here because a script runs on Node's type stripping and cannot resolve the `@/` alias (as
 * `scripts/admin-grant.ts` does); `tests/integration/tracking-page.test.ts` runs both on one order
 * and compares the audit rows. Over `DATABASE_URL_UNPOOLED`. Prints the versions, never a token.
 */
import { parseArgs } from "node:util";

import postgres from "postgres";
import { z } from "zod";

export const ROTATE_CLI_ACTOR = "system:orders.rotate_tracking";

const OrderIdSchema = z.uuid();

const RotateRow = z.object({
  before: z.coerce.number().int().positive(),
  after: z.coerce.number().int().positive(),
});

/** Parses `--order <uuid>`; throws on anything else. */
export function parseRotateArgs(argv: readonly string[]): { orderId: string } {
  const { values } = parseArgs({
    args: [...argv],
    options: { order: { type: "string" } },
    strict: true,
    allowPositionals: false,
  });
  return { orderId: OrderIdSchema.parse(values.order) };
}

/** The two statements, on a transaction the caller holds. `null` when no such order exists. */
export async function rotateTrackingIn(
  tx: postgres.TransactionSql,
  orderId: string,
): Promise<{ before: number; after: number } | null> {
  const id = OrderIdSchema.parse(orderId);
  const [row] = await tx`
    UPDATE "order" SET tracking_token_version = tracking_token_version + 1
    WHERE id = ${id}
    RETURNING tracking_token_version - 1 AS before, tracking_token_version AS after`;
  if (row === undefined) return null;
  const { before, after } = RotateRow.parse(row);
  await tx`
    INSERT INTO audit_log (actor_user_id, actor_label, action, entity_table, entity_id,
                           before, after, request_id, channel)
    VALUES (NULL, ${ROTATE_CLI_ACTOR}, 'order.tracking_token_rotated', 'order', ${id},
            jsonb_build_object('tracking_token_version', ${before}::int),
            jsonb_build_object('tracking_token_version', ${after}::int),
            coalesce(nullif(current_setting('app.request_id', true), ''), 'cli:orders.rotate_tracking'),
            'cli')`;
  return { before, after };
}

/** Rotates in one transaction of its own. */
export async function rotateTracking(
  sql: postgres.Sql,
  orderId: string,
): Promise<{ before: number; after: number } | null> {
  return sql.begin((tx) => rotateTrackingIn(tx, orderId));
}

async function main(): Promise<number> {
  let orderId: string;
  try {
    ({ orderId } = parseRotateArgs(process.argv.slice(2)));
  } catch {
    process.stderr.write(
      "usage: pnpm orders:rotate-tracking --order <order uuid>\n",
    );
    return 2;
  }
  const url = process.env["DATABASE_URL_UNPOOLED"];
  if (url === undefined || url === "") {
    process.stderr.write(
      "orders:rotate-tracking: DATABASE_URL_UNPOOLED is not set\n",
    );
    return 1;
  }
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const result = await rotateTracking(sql, orderId);
    if (result === null) {
      process.stderr.write("orders:rotate-tracking: no such order\n");
      return 1;
    }
    process.stdout.write(
      `orders:rotate-tracking: version ${String(result.before)} -> ${String(result.after)}; every earlier link is revoked\n`,
    );
    return 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  process.exitCode = await main();
}
