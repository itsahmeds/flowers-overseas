/**
 * Florist applications in admin, **only through spec 011's queries** (spec 012 §2.5, §5.2; AC-17;
 * TASK-221): this file reads and moves `partner_application` rows through
 * `listFloristApplications` and `setFloristApplicationStatus` (`../application/admin.ts`) and
 * holds no query of its own on that table (`tests/unit/partners-admin-scan.test.ts`).
 *
 *  - `markApplicationContacted` — `new → contacted`.
 *  - `convertApplication` (`ApplicationConvertSchema`) — `contacted → converted`: one new
 *    `onboarding` partner, pre-filled from the application, and the application linked to it,
 *    in one admin transaction. The partner insert is audited as `application.convert`, the
 *    status change as spec 011's `applications.status.converted`.
 *  - `rejectApplication` (`ApplicationRejectSchema`) — `contacted → rejected` with a required
 *    reason, which spec 011's query writes to `status_reason` (`0035`) in the same statement as
 *    the status.
 *
 * Each move names the status the row must still have (`from`), so two admins cannot both decide
 * one application: the second finds nothing to change and the transaction rolls back.
 */
import { eq, sql } from "drizzle-orm";

import type { DbActor, DbTransaction } from "@/lib/db";

import { country } from "../../../../db/schema/geo";
import { fulfillmentPartner } from "../../../../db/schema/partners";
import {
  type FloristApplicationRow,
  type FloristApplicationStatus,
  listFloristApplications,
  setFloristApplicationStatus,
} from "../application/admin";
import {
  type PartnerAdminRunner,
  type PartnerRefusal,
  partnerAdminRunner,
} from "./commands";
import {
  ApplicationContactSchema,
  ApplicationConvertSchema,
  ApplicationRejectSchema,
  MAX_CAPACITY_PER_DAY,
  isApplicationEdge,
  partnerPhoneE164,
} from "./schemas";

/** The audit action of the partner a conversion creates. */
export const APPLICATION_CONVERT_ACTION = "application.convert";

export type ApplicationCommandResult =
  { readonly ok: true; readonly partnerCode?: string } | PartnerRefusal;

/** Thrown inside the transaction to roll it back; mapped to its refusal outside. */
class Rollback extends Error {
  readonly refusal: PartnerRefusal;
  constructor(refusal: PartnerRefusal) {
    super("rollback");
    this.refusal = refusal;
  }
}

/** Runs spec 011's queries inside the transaction `db` already holds, with their own action. */
function within(db: DbTransaction): PartnerAdminRunner {
  return async (context, fn) => {
    await setAction(db, context.action);
    return fn(db);
  };
}

async function setAction(db: DbTransaction, action: string): Promise<void> {
  await db.execute(sql`SELECT set_config('app.audit_action', ${action}, true)`);
}

/** Every application, newest first, or those with one status (spec 011's query). */
export async function listApplications(
  actor: DbActor,
  status?: FloristApplicationStatus,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<FloristApplicationRow[]> {
  return listFloristApplications(
    actor,
    status === undefined ? {} : { status },
    run,
  );
}

/** One application by id, through spec 011's list; `undefined` when there is none. */
export async function applicationById(
  actor: DbActor,
  id: string,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<FloristApplicationRow | undefined> {
  const rows = await listFloristApplications(actor, {}, run);
  return rows.find((row) => row.id === id);
}

/** The application, checked against the version and the edge `→ to`, or the refusal. */
function judge(
  row: FloristApplicationRow | undefined,
  updatedAt: string,
  to: FloristApplicationStatus,
): PartnerRefusal | undefined {
  if (row === undefined) return { ok: false, reason: "not_found" };
  if (row.updatedAt.getTime() !== new Date(updatedAt).getTime()) {
    return { ok: false, reason: "conflict" };
  }
  if (!isApplicationEdge(row.status, to)) {
    return { ok: false, reason: "illegal_edge" };
  }
  return undefined;
}

/** Runs `fn` in one admin transaction and maps a `Rollback` to its refusal. */
async function transaction(
  actor: DbActor,
  action: string,
  run: PartnerAdminRunner,
  fn: (db: DbTransaction) => Promise<ApplicationCommandResult>,
): Promise<ApplicationCommandResult> {
  try {
    return await run({ ...actor, action }, fn);
  } catch (error) {
    if (error instanceof Rollback) return error.refusal;
    throw error;
  }
}

/** `new → contacted`. */
export async function markApplicationContacted(
  actor: DbActor,
  input: unknown,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<ApplicationCommandResult> {
  const parsed = ApplicationContactSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      errors: { applicationId: "target" },
    };
  }
  const { applicationId, updatedAt } = parsed.data;
  return transaction(actor, "applications.read", run, async (db) => {
    const rows = await listFloristApplications(actor, {}, within(db));
    const refused = judge(
      rows.find((row) => row.id === applicationId),
      updatedAt,
      "contacted",
    );
    if (refused !== undefined) return refused;
    const moved = await setFloristApplicationStatus(
      actor,
      applicationId,
      "contacted",
      { from: "new" },
      within(db),
    );
    if (!moved.ok) throw new Rollback({ ok: false, reason: "conflict" });
    return { ok: true };
  });
}

/** `contacted → rejected`, the reason kept in `status_reason` (AC-17). */
export async function rejectApplication(
  actor: DbActor,
  input: unknown,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<ApplicationCommandResult> {
  const parsed = ApplicationRejectSchema.safeParse(input);
  if (!parsed.success) {
    const reasonMissing = parsed.error.issues.some(
      (issue) => issue.path[0] === "reason",
    );
    return {
      ok: false,
      reason: "invalid",
      errors: reasonMissing
        ? { reason: "reason" }
        : { applicationId: "target" },
    };
  }
  const { applicationId, updatedAt, reason } = parsed.data;
  return transaction(actor, "applications.read", run, async (db) => {
    const rows = await listFloristApplications(actor, {}, within(db));
    const refused = judge(
      rows.find((row) => row.id === applicationId),
      updatedAt,
      "rejected",
    );
    if (refused !== undefined) return refused;
    const moved = await setFloristApplicationStatus(
      actor,
      applicationId,
      "rejected",
      { from: "contacted", statusReason: reason },
      within(db),
    );
    if (!moved.ok) throw new Rollback({ ok: false, reason: "conflict" });
    return { ok: true };
  });
}

/** A partner code's stem from a business name: ASCII, lowercase, hyphenated, at most 40. */
export function codeStem(countryIso2: string, businessName: string): string {
  const ascii = businessName
    .replaceAll("ł", "l")
    .replaceAll("Ł", "L")
    .replaceAll("ß", "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 40)
    .replace(/-+$/u, "");
  const iso = countryIso2.toLowerCase();
  return ascii === "" ? `${iso}-florist` : `${iso}-${ascii}`;
}

/** The first free code `stem`, `stem-2`, `stem-3`, … */
async function freeCode(db: DbTransaction, stem: string): Promise<string> {
  const taken = new Set(
    (
      await db
        .select({ code: fulfillmentPartner.code })
        .from(fulfillmentPartner)
        .where(sql`starts_with(${fulfillmentPartner.code}, ${stem})`)
    ).map((row) => row.code),
  );
  if (!taken.has(stem)) return stem;
  let n = 2;
  while (taken.has(`${stem}-${String(n)}`)) n += 1;
  return `${stem}-${String(n)}`;
}

/**
 * `convertApplication`: `contacted → converted`, creating one `onboarding` partner pre-filled from
 * the application (business name, town, country and its currency, contact email, the phone as
 * E.164 for that country when it is one, WhatsApp when asked for and the phone allows it, orders
 * a day) and linking it. Terms, zones and products are entered on the partner page afterwards.
 */
export async function convertApplication(
  actor: DbActor,
  input: unknown,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<ApplicationCommandResult> {
  const parsed = ApplicationConvertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      errors: { applicationId: "target" },
    };
  }
  const { applicationId, updatedAt } = parsed.data;
  return transaction(actor, APPLICATION_CONVERT_ACTION, run, async (db) => {
    const rows = await listFloristApplications(actor, {}, within(db));
    const application = rows.find((row) => row.id === applicationId);
    const refused = judge(application, updatedAt, "converted");
    if (refused !== undefined || application === undefined) {
      return refused ?? { ok: false, reason: "not_found" };
    }
    const [place] = await db
      .select({ id: country.id, currencyCode: country.currencyCode })
      .from(country)
      .where(eq(country.iso2, application.countryIso2));
    if (place === undefined) return { ok: false, reason: "not_found" };
    const phone =
      partnerPhoneE164(application.contactPhone, application.countryIso2) ??
      null;
    const code = await freeCode(
      db,
      codeStem(application.countryIso2, application.businessName),
    );
    await setAction(db, APPLICATION_CONVERT_ACTION);
    const [partner] = await db
      .insert(fulfillmentPartner)
      .values({
        code,
        status: "onboarding",
        legalName: application.businessName,
        cityLabel: application.city,
        countryId: place.id,
        notificationChannel:
          application.preferredChannel === "whatsapp" && phone !== null
            ? "whatsapp"
            : "email",
        contactEmail: application.contactEmail.trim().toLowerCase(),
        contactPhone: phone,
        payoutCurrencyCode: place.currencyCode,
        // The form's own range (1 to 500); an application that left it blank starts at one
        // order a day, the cautious figure, until the founder enters theirs.
        capacityPerDay: Math.min(
          Math.max(application.capacityPerDay ?? 1, 1),
          MAX_CAPACITY_PER_DAY,
        ),
      })
      .returning({ id: fulfillmentPartner.id });
    if (partner === undefined)
      throw new Error("convertApplication: the insert returned no row");
    const moved = await setFloristApplicationStatus(
      actor,
      applicationId,
      "converted",
      { convertedPartnerId: partner.id, from: "contacted" },
      within(db),
    );
    if (!moved.ok) throw new Rollback({ ok: false, reason: "conflict" });
    return { ok: true, partnerCode: code };
  });
}
