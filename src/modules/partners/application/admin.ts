/**
 * The admin queries over florist applications, for spec 012 (spec 011 §5.2 "Admin queries for
 * spec 012"; TASK-213). The only application queries in the codebase: spec 012's admin pages use
 * these and define none of their own.
 *
 *  - `listFloristApplications(adminCtx, { status? })` — every application, newest first, or those
 *    with one status.
 *  - `setFloristApplicationStatus(adminCtx, id, status, options?)` — moves one application. It
 *    sets `decided_at` for `rejected` and `converted` and clears it otherwise; `converted` needs
 *    the partner the applicant became (`0005`'s `partner_application_converted_check` ties the two
 *    together), and every other status clears it. Spec 012 (TASK-221) adds two options: `from`,
 *    the status the row must still have (the update changes nothing otherwise, so two admins
 *    cannot both decide one application), and `statusReason`, the reason a rejection carries,
 *    written to `status_reason` (`0033`) in the same statement; every other status clears it.
 *
 * Both run inside spec 012's `withAdminContext`, whose `audit_row_change()` trigger writes the
 * `audit_log` row of a status change, so this module writes no audit row itself. The runner is a
 * parameter (the `AdminRunner` shape of `src/modules/admin/users.ts`) so the integration suite runs
 * them against a scratch database; the application passes nothing and gets `withAdminContext`,
 * imported at the first call.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { AdminContextInput, DbActor, DbTransaction } from "@/lib/db";

import { partnerApplication } from "../../../../db/schema/partners";

export const FLORIST_APPLICATION_STATUSES = [
  "new",
  "contacted",
  "rejected",
  "converted",
] as const;
export const FloristApplicationStatusSchema = z.enum(
  FLORIST_APPLICATION_STATUSES,
);
export type FloristApplicationStatus = z.infer<
  typeof FloristApplicationStatusSchema
>;

/** The statuses that are a decision and stamp `decided_at` (§5.2). */
const DECIDED: readonly FloristApplicationStatus[] = ["rejected", "converted"];

/** The audit actions these queries carry (lowercase and dotted, `audit_log_action_check`). */
export const APPLICATION_ACTIONS = Object.freeze({
  list: "applications.list",
  status: (status: FloristApplicationStatus) =>
    `applications.status.${status}` as const,
});

/** Runs `fn` in one admin transaction carrying `context.action`. */
export type ApplicationAdminRunner = <T>(
  context: AdminContextInput,
  fn: (db: DbTransaction) => Promise<T>,
) => Promise<T>;

export const applicationAdminRunner: ApplicationAdminRunner = async (
  context,
  fn,
) => {
  const { withAdminContext } = await import("@/lib/db");
  return withAdminContext(context, fn);
};

/** One application as the admin list shows it. */
export const FloristApplicationRowSchema = z
  .object({
    id: z.uuid(),
    status: FloristApplicationStatusSchema,
    businessName: z.string(),
    contactName: z.string(),
    contactEmail: z.string(),
    contactPhone: z.string(),
    countryIso2: z.string().length(2),
    city: z.string(),
    coverageNote: z.string().nullable(),
    capacityPerDay: z.number().int().nullable(),
    weekendDelivery: z.enum(["yes", "sometimes", "no"]).nullable(),
    registrationNumber: z.string().nullable(),
    instagramUrl: z.string().nullable(),
    websiteUrl: z.string().nullable(),
    preferredChannel: z.enum(["email", "whatsapp", "phone"]).nullable(),
    languageCode: z.string(),
    privacyNoticeVersion: z.string(),
    convertedPartnerId: z.uuid().nullable(),
    decidedAt: z.date().nullable(),
    statusReason: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();
export type FloristApplicationRow = z.infer<typeof FloristApplicationRowSchema>;

const ListFilterSchema = z
  .object({ status: FloristApplicationStatusSchema.optional() })
  .strict();

export async function listFloristApplications(
  adminCtx: DbActor,
  filter: { readonly status?: FloristApplicationStatus } = {},
  run: ApplicationAdminRunner = applicationAdminRunner,
): Promise<FloristApplicationRow[]> {
  const { status } = ListFilterSchema.parse(filter);
  return run({ ...adminCtx, action: APPLICATION_ACTIONS.list }, async (db) => {
    const rows = await db
      .select({
        id: partnerApplication.id,
        status: partnerApplication.status,
        businessName: partnerApplication.businessName,
        contactName: partnerApplication.contactName,
        contactEmail: partnerApplication.contactEmail,
        contactPhone: partnerApplication.contactPhone,
        countryIso2: sql<string>`(SELECT c.iso2 FROM public.country c WHERE c.id = ${partnerApplication.countryId})`,
        city: partnerApplication.city,
        coverageNote: partnerApplication.coverageNote,
        capacityPerDay: partnerApplication.capacityPerDay,
        weekendDelivery: partnerApplication.weekendDelivery,
        registrationNumber: partnerApplication.registrationNumber,
        instagramUrl: partnerApplication.instagramUrl,
        websiteUrl: partnerApplication.websiteUrl,
        preferredChannel: partnerApplication.preferredChannel,
        languageCode: partnerApplication.languageCode,
        privacyNoticeVersion: partnerApplication.privacyNoticeVersion,
        convertedPartnerId: partnerApplication.convertedPartnerId,
        decidedAt: partnerApplication.decidedAt,
        statusReason: partnerApplication.statusReason,
        createdAt: partnerApplication.createdAt,
        updatedAt: partnerApplication.updatedAt,
      })
      .from(partnerApplication)
      .where(
        status === undefined
          ? undefined
          : eq(partnerApplication.status, status),
      )
      .orderBy(desc(partnerApplication.createdAt), desc(partnerApplication.id));
    return rows.map((row) => FloristApplicationRowSchema.parse(row));
  });
}

const SetStatusSchema = z
  .object({
    id: z.uuid(),
    status: FloristApplicationStatusSchema,
    convertedPartnerId: z.uuid().optional(),
    from: FloristApplicationStatusSchema.optional(),
    statusReason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine(
    (input) =>
      (input.status === "converted") ===
      (input.convertedPartnerId !== undefined),
    { path: ["convertedPartnerId"] },
  )
  .refine(
    (input) => input.statusReason === undefined || input.status === "rejected",
    { path: ["statusReason"] },
  );

export type SetApplicationStatusResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "invalid" | "not_found" };

export async function setFloristApplicationStatus(
  adminCtx: DbActor,
  id: string,
  status: FloristApplicationStatus,
  options: {
    readonly convertedPartnerId?: string;
    readonly from?: FloristApplicationStatus;
    readonly statusReason?: string;
  } = {},
  run: ApplicationAdminRunner = applicationAdminRunner,
): Promise<SetApplicationStatusResult> {
  const parsed = SetStatusSchema.safeParse({
    id,
    status,
    ...(options.convertedPartnerId === undefined
      ? {}
      : { convertedPartnerId: options.convertedPartnerId }),
    ...(options.from === undefined ? {} : { from: options.from }),
    ...(options.statusReason === undefined
      ? {}
      : { statusReason: options.statusReason }),
  });
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const input = parsed.data;
  return run(
    { ...adminCtx, action: APPLICATION_ACTIONS.status(input.status) },
    async (db) => {
      const updated = await db
        .update(partnerApplication)
        .set({
          status: input.status,
          convertedPartnerId: input.convertedPartnerId ?? null,
          decidedAt: DECIDED.includes(input.status) ? sql`now()` : null,
          statusReason: input.statusReason ?? null,
        })
        .where(
          input.from === undefined
            ? eq(partnerApplication.id, input.id)
            : and(
                eq(partnerApplication.id, input.id),
                eq(partnerApplication.status, input.from),
              ),
        )
        .returning({ id: partnerApplication.id });
      return updated.length === 1
        ? { ok: true as const }
        : { ok: false as const, reason: "not_found" as const };
    },
  );
}
