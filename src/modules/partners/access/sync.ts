/**
 * `syncPartnerOwnerMember` (spec 026a §2 "The founder grants access in admin", §5.2; AC-7, AC-8,
 * AC-9; TASK-355): the partner's contact email is the one address that may sign in for it.
 *
 * Called by spec 012's `createPartner`, `updatePartner` and `convertApplication` inside their own
 * admin transaction (`withAdminContext`), after the partner row is written, so a failure here
 * rolls the partner write back too. In that transaction it:
 *
 *  1. reads the partner's contact email, normalised by `FloristSignInEmailSchema`;
 *  2. when an `owner` membership of that address already exists, changes nothing;
 *  3. otherwise upserts the `users` row of the address and inserts one `owner` `partner_member`
 *     row, under the audit action `partner.member.grant`. Its language is the previous owner's
 *     (a re-sync after an address change keeps the florist's choice), else `floristLanguageFor`
 *     of the application the partner was converted from and the partner's country;
 *  4. deletes every other `owner` membership of the partner, under `partner.member.revoke`, and
 *     deletes that user, with their sessions (`ON DELETE CASCADE`), when nothing else refers to
 *     them: no other membership, no `admin_profile`, no `user_role`, no `customer` row.
 *
 * `0034`'s `partner_member_audit` trigger writes one audit row per membership insert and delete,
 * `entity_id = '{userId}:{partnerId}'`; the action the caller's transaction carried is restored
 * before returning, so the partner write that follows is audited under its own action. No
 * address is logged: `florist_member_granted` and `florist_member_revoked` carry `partner_id`.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import type { DbTransaction } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { FloristLanguage } from "@/config/florists";

import { users } from "../../../../db/schema/auth";
import { country } from "../../../../db/schema/geo";
import {
  fulfillmentPartner,
  partnerMember,
} from "../../../../db/schema/partners";
import { listFloristApplications } from "../application/admin";
import {
  FloristSignInEmailSchema,
  asFloristLanguage,
  floristLanguageFor,
} from "./language";

/** The audit actions of a membership write (lowercase and dotted, `audit_log_action_check`). */
export const PARTNER_MEMBER_ACTIONS = Object.freeze({
  grant: "partner.member.grant",
  revoke: "partner.member.revoke",
} as const);

export const SyncOwnerResultSchema = z
  .object({
    userId: z.uuid(),
    created: z.boolean(),
    revokedUserId: z.uuid().nullable(),
    deletedUser: z.boolean(),
  })
  .strict();
export type SyncOwnerResult = z.infer<typeof SyncOwnerResultSchema>;

export interface SyncOwnerOptions {
  /**
   * The language of the application the partner is being converted from (`convertApplication`).
   * Absent: read from the converted application, if there is one.
   */
  readonly applicationLanguage?: FloristLanguage | null;
}

const PartnerIdSchema = z.uuid();

async function setAuditAction(
  db: DbTransaction,
  action: string,
): Promise<void> {
  await db.execute(sql`SELECT set_config('app.audit_action', ${action}, true)`);
}

async function currentAuditAction(db: DbTransaction): Promise<string> {
  const rows = await db.execute(
    sql`SELECT coalesce(current_setting('app.audit_action', true), '') AS action`,
  );
  const [row] = z.array(z.object({ action: z.string() })).parse(rows);
  return row?.action ?? "";
}

/**
 * The language of the application `partnerId` was converted from, through spec 011's own query
 * (spec 012 AC-17: no second query on that table). The read changes the transaction's audit
 * action; the caller restores it.
 */
async function convertedApplicationLanguage(
  db: DbTransaction,
  partnerId: string,
): Promise<FloristLanguage | null> {
  const rows = await listFloristApplications(
    {},
    { status: "converted" },
    async (context, fn) => {
      await setAuditAction(db, context.action);
      return fn(db);
    },
  );
  const application = rows.find((row) => row.convertedPartnerId === partnerId);
  return application === undefined
    ? null
    : asFloristLanguage(application.languageCode);
}

/** Whether anything other than this partner's membership refers to `userId` (AC-7). */
async function isReferenced(
  db: DbTransaction,
  userId: string,
): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT (
      EXISTS (SELECT 1 FROM public.partner_member m WHERE m.user_id = ${userId}::uuid)
      OR EXISTS (SELECT 1 FROM public.admin_profile a WHERE a.user_id = ${userId}::uuid)
      OR EXISTS (SELECT 1 FROM public.user_role r WHERE r.user_id = ${userId}::uuid)
      OR EXISTS (SELECT 1 FROM public.customer c WHERE c.user_id = ${userId}::uuid)
    ) AS referenced`);
  const [row] = z.array(z.object({ referenced: z.boolean() })).parse(rows);
  return row?.referenced ?? true;
}

/** Whether `partnerId` has an `owner` membership at all. */
export async function hasOwnerMember(
  db: DbTransaction,
  partnerId: string,
): Promise<boolean> {
  const rows = await db
    .select({ userId: partnerMember.userId })
    .from(partnerMember)
    .where(
      and(
        eq(partnerMember.partnerId, partnerId),
        eq(partnerMember.role, "owner"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Keeps exactly one `owner` membership of `partnerId`, for its contact email (AC-7). */
export async function syncPartnerOwnerMember(
  db: DbTransaction,
  partnerId: string,
  options: SyncOwnerOptions = {},
): Promise<SyncOwnerResult> {
  const id = PartnerIdSchema.parse(partnerId);
  const [partner] = await db
    .select({
      contactEmail: fulfillmentPartner.contactEmail,
      countryIso2: country.iso2,
    })
    .from(fulfillmentPartner)
    .innerJoin(country, eq(country.id, fulfillmentPartner.countryId))
    .where(eq(fulfillmentPartner.id, id));
  if (partner === undefined) {
    throw new Error("OWNER_MEMBER_SYNC: no such florist");
  }
  const email = FloristSignInEmailSchema.parse(partner.contactEmail);

  const owners = await db
    .select({
      userId: partnerMember.userId,
      email: users.email,
      localeCode: partnerMember.localeCode,
    })
    .from(partnerMember)
    .innerJoin(users, eq(users.id, partnerMember.userId))
    .where(
      and(eq(partnerMember.partnerId, id), eq(partnerMember.role, "owner")),
    )
    .orderBy(partnerMember.createdAt);
  const current = owners.find((owner) => owner.email === email);
  const previous = owners.filter((owner) => owner.email !== email);
  if (current !== undefined && previous.length === 0) {
    return SyncOwnerResultSchema.parse({
      userId: current.userId,
      created: false,
      revokedUserId: null,
      deletedUser: false,
    });
  }

  const callerAction = await currentAuditAction(db);
  let userId = current?.userId;
  let created = false;
  if (userId === undefined) {
    const kept = asFloristLanguage(previous[0]?.localeCode);
    const applicationLanguage =
      options.applicationLanguage !== undefined
        ? options.applicationLanguage
        : await convertedApplicationLanguage(db, id);
    const localeCode =
      kept ??
      floristLanguageFor({
        applicationLanguage,
        countryIso2: partner.countryIso2,
      });
    // `DO UPDATE` to an unchanged value, so the existing row's id comes back too.
    const [user] = await db
      .insert(users)
      .values({ email })
      .onConflictDoUpdate({ target: users.email, set: { email } })
      .returning({ id: users.id });
    if (user === undefined) {
      throw new Error("OWNER_MEMBER_SYNC: the user upsert returned no row");
    }
    userId = user.id;
    await setAuditAction(db, PARTNER_MEMBER_ACTIONS.grant);
    await db
      .insert(partnerMember)
      .values({ userId, partnerId: id, role: "owner", localeCode })
      .onConflictDoUpdate({
        target: [partnerMember.userId, partnerMember.partnerId],
        set: { role: "owner" },
      });
    created = true;
    logger.info({ partner_id: id }, "florist_member_granted");
  }

  let revokedUserId: string | null = null;
  let deletedUser = false;
  if (previous.length > 0) {
    await setAuditAction(db, PARTNER_MEMBER_ACTIONS.revoke);
    for (const owner of previous) {
      await db
        .delete(partnerMember)
        .where(
          and(
            eq(partnerMember.partnerId, id),
            eq(partnerMember.userId, owner.userId),
          ),
        );
      revokedUserId ??= owner.userId;
      if (!(await isReferenced(db, owner.userId))) {
        // Sessions and accounts go with the user (`ON DELETE CASCADE`).
        await db
          .delete(users)
          .where(and(eq(users.id, owner.userId), ne(users.email, email)));
        if (owner.userId === revokedUserId) deletedUser = true;
      }
      logger.info({ partner_id: id }, "florist_member_revoked");
    }
  }
  await setAuditAction(db, callerAction);
  return SyncOwnerResultSchema.parse({
    userId,
    created,
    revokedUserId,
    deletedUser,
  });
}
