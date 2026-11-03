/**
 * The admin partner page's "Florist sign-in" block (spec 026a §2, §5.2 `floristSignInStatus`;
 * AC-10; TASK-355): the address that may sign in (the contact email, normalised) and the instant
 * its `owner` membership was first used (`accepted_at`, set by `recordFirstFloristSignIn`), or
 * `null`. Read under the admin context.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { DbActor } from "@/lib/db";

import { users } from "../../../../db/schema/auth";
import {
  fulfillmentPartner,
  partnerMember,
} from "../../../../db/schema/partners";
import {
  PARTNER_ACTIONS,
  type PartnerAdminRunner,
  partnerAdminRunner,
} from "../admin/commands";
import { FloristSignInEmailSchema } from "./language";

export const FloristSignInStatusSchema = z
  .object({
    email: z.string(),
    firstSignedInAt: z.iso.datetime().nullable(),
  })
  .strict();
export type FloristSignInStatus = z.infer<typeof FloristSignInStatusSchema>;

/** The admin block's facts for one partner; `undefined` for an unknown id (AC-10). */
export async function floristSignInStatus(
  adminCtx: DbActor,
  partnerId: string,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<FloristSignInStatus | undefined> {
  const id = z.uuid().parse(partnerId);
  return run({ ...adminCtx, action: PARTNER_ACTIONS.read }, async (db) => {
    const [partner] = await db
      .select({ contactEmail: fulfillmentPartner.contactEmail })
      .from(fulfillmentPartner)
      .where(eq(fulfillmentPartner.id, id));
    if (partner === undefined) return undefined;
    const parsed = FloristSignInEmailSchema.safeParse(partner.contactEmail);
    const email = parsed.success
      ? parsed.data
      : partner.contactEmail.trim().toLowerCase();
    const [member] = await db
      .select({ acceptedAt: partnerMember.acceptedAt })
      .from(partnerMember)
      .innerJoin(users, eq(users.id, partnerMember.userId))
      .where(
        and(
          eq(partnerMember.partnerId, id),
          eq(partnerMember.role, "owner"),
          eq(users.email, email),
        ),
      );
    return FloristSignInStatusSchema.parse({
      email,
      firstSignedInAt: member?.acceptedAt?.toISOString() ?? null,
    });
  });
}
