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
 * serialised and the sixth is refused. *
 * **Other purposes (spec 018 §5.2 "Rate limits"; TASK-339).** The email-sending actions of spec
 * 018 use this same counter with their own limit and a `scope`, which keys the count by
 * `hashScopedIdentifier(scope, email)`: the tracking lookup claims 3 per hour under `track`, and
 * those claims and the sign-in links never count against each other.
 */
import { and, count, eq, gt, sql } from "drizzle-orm";

import { authEmailSend } from "../../../db/schema/admin";

import { type AuthRunner, systemAuthRunner } from "./adapter";
import { hashIdentifier, hashScopedIdentifier } from "./tokens";

/** Links per address per window. */
export const SEND_LIMIT = 5;
/** The window, in milliseconds: one hour. */
export const SEND_WINDOW_MS = 60 * 60 * 1000;

export async function claimSend(
  email: string,
  options: {
    run?: AuthRunner;
    now?: () => Date;
    /** Sends per window for this purpose; the sign-in limit by default. */
    limit?: number;
    /** A counter of its own (`hashScopedIdentifier`); the sign-in counter by default. */
    scope?: string;
  } = {},
): Promise<boolean> {
  const run = options.run ?? systemAuthRunner;
  const now = (options.now ?? (() => new Date()))();
  const limit = options.limit ?? SEND_LIMIT;
  const identifierHash =
    options.scope === undefined
      ? hashIdentifier(email)
      : hashScopedIdentifier(options.scope, email);
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
    if ((row?.sent ?? 0) >= limit) return false;
    await db.insert(authEmailSend).values({ identifierHash, sentAt: now });
    return true;
  });
}
