/**
 * The send limit of the sign-in core (spec 012 §2.2, AC-2; TASK-217): at most **5 links per
 * address per hour**, for both surfaces, counted in `auth_email_send` and keyed by the SHA-256 of
 * the normalised address. No IP is read or stored.
 *
 * `claimSend()` counts the sends of the last hour and records one more only when the count is
 * under the limit, in one transaction; it answers whether the caller may send. The caller sends
 * **after** a successful claim, so a refused claim sends nothing.
 *
 * Two concurrent requests for one address could both read four and both record: the transaction
 * takes a transaction-scoped advisory lock on the hash first, so claims for one address are
 * serialised and the sixth is refused.
 */
import { and, count, eq, gt, sql } from "drizzle-orm";

import { authEmailSend } from "../../../db/schema/admin";

import { type AuthRunner, systemAuthRunner } from "./adapter";
import { hashIdentifier } from "./tokens";

/** Links per address per window. */
export const SEND_LIMIT = 5;
/** The window, in milliseconds: one hour. */
export const SEND_WINDOW_MS = 60 * 60 * 1000;

export async function claimSend(
  email: string,
  options: { run?: AuthRunner; now?: () => Date } = {},
): Promise<boolean> {
  const run = options.run ?? systemAuthRunner;
  const now = (options.now ?? (() => new Date()))();
  const identifierHash = hashIdentifier(email);
  const since = new Date(now.getTime() - SEND_WINDOW_MS);
  return run(async (db) => {
    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${identifierHash}, 0))`,
    );
    const [row] = await db
      .select({ sent: count() })
      .from(authEmailSend)
      .where(
        and(
          eq(authEmailSend.identifierHash, identifierHash),
          gt(authEmailSend.sentAt, since),
        ),
      );
    if ((row?.sent ?? 0) >= SEND_LIMIT) return false;
    await db.insert(authEmailSend).values({ identifierHash, sentAt: now });
    return true;
  });
}
