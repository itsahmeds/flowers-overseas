/**
 * The first florist sign-in, stamped (spec 026a §2 "The founder can see the florist got in", §5.2;
 * AC-10; TASK-355). `recordFirstFloristSignIn(userId)` is called by the florist instance once a
 * sign-in succeeds, under the system context: it sets `partner_member.accepted_at` where it is
 * still null, on that user's memberships whose partner the sign-in policy allows in this
 * environment. A second sign-in finds nothing null and changes nothing. The system context is not
 * audited (`0035`'s trigger returns early outside `app.role = 'admin'`). No address is logged:
 * `florist_first_sign_in` carries `partner_id`.
 *
 * Kept apart from the admin reads so the florist instance's import graph gains no admin command.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { DbTransaction } from "@/lib/db";
import { appEnvironment } from "@/lib/env.schema";
import { logger } from "@/lib/logger";
import { signInPolicy } from "@/config/florists";

import {
  fulfillmentPartner,
  partnerMember,
} from "../../../../db/schema/partners";

/** Runs `fn` in one system-context transaction (the florist instance passes its own). */
export type SystemRunner = <T>(
  fn: (db: DbTransaction) => Promise<T>,
) => Promise<T>;

const systemRunner: SystemRunner = async (fn) => {
  const { withSystemContext } = await import("@/lib/db");
  return withSystemContext("florist.first_sign_in", fn);
};

/** Stamps the first successful sign-in on `userId`'s allowed memberships, once (AC-10). */
export async function recordFirstFloristSignIn(
  userId: string,
  options: { readonly run?: SystemRunner; readonly environment?: string } = {},
): Promise<void> {
  const id = z.uuid().parse(userId);
  const statuses = [
    ...signInPolicy(options.environment ?? appEnvironment(process.env)),
  ];
  if (statuses.length === 0) return;
  const run = options.run ?? systemRunner;
  const stamped = await run((db) =>
    db
      .update(partnerMember)
      .set({
        acceptedAt: sql`greatest(now(), ${partnerMember.invitedAt})`,
      })
      .where(
        and(
          eq(partnerMember.userId, id),
          isNull(partnerMember.acceptedAt),
          inArray(
            partnerMember.partnerId,
            db
              .select({ id: fulfillmentPartner.id })
              .from(fulfillmentPartner)
              .where(inArray(fulfillmentPartner.status, statuses)),
          ),
        ),
      )
      .returning({ partnerId: partnerMember.partnerId }),
  );
  for (const row of stamped) {
    logger.info({ partner_id: row.partnerId }, "florist_first_sign_in");
  }
}
