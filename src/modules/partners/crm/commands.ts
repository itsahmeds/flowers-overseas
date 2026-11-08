/**
 * The CRM writes (spec 030b §2.7, §5.2 `src/modules/partners/crm/`; AC-28, AC-29, AC-30;
 * TASK-441): `addNote`, `editNote` (pin and unpin too), `deleteNote`, `logContact`, `editContact`,
 * `markFollowUpDone` and `saveContactName`.
 *
 * Each runs in one admin transaction carrying its audit action, so spec 012's
 * `audit_row_change()` writes one `audit_log` row per changed row with the text masked
 * (`audit_mask_columns()`: `partner_note.body`, `partner_contact_log.summary`,
 * `fulfillment_partner.contact_name`). An edit or a delete locks its row and compares the
 * `updated_at` the form was rendered from: a stale one is `conflict` and changes nothing. A refused
 * parse writes nothing and names the field. No event, no outbox row, no order transition
 * (ADR-0009). Nothing here logs: the text never reaches a log line (§8).
 *
 * The runner is a parameter (spec 012's shape) so the integration suite drives the commands on a
 * scratch database; the application passes nothing and gets `withAdminContext`, loaded lazily.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { DbActor, DbTransaction } from "@/lib/db";

import {
  fulfillmentPartner,
  partnerContactLog,
  partnerNote,
} from "../../../../db/schema/partners";
import { type PartnerAdminRunner, partnerAdminRunner } from "../admin/commands";
import {
  type CrmFieldErrors,
  FollowUpDoneSchema,
  PartnerNoteDeleteSchema,
  parseContactCreate,
  parseContactEdit,
  parseContactNameEdit,
  parseNoteCreate,
  parseNoteEdit,
} from "./schemas";

/** The audit actions of the CRM (lowercase and dotted, `audit_log_action_check`). */
export const CRM_ACTIONS = Object.freeze({
  noteAdd: "partner_crm.note.add",
  noteEdit: "partner_crm.note.edit",
  noteDelete: "partner_crm.note.delete",
  contactAdd: "partner_crm.contact.add",
  contactEdit: "partner_crm.contact.edit",
  followUpDone: "partner_crm.follow_up.done",
  contactName: "partner_crm.contact_name",
  read: "partner_crm.read",
});

export type CrmCommandResult =
  | { readonly ok: true; readonly code: string }
  | {
      readonly ok: false;
      readonly reason: "invalid";
      readonly errors: CrmFieldErrors;
    }
  | {
      readonly ok: false;
      readonly reason: "conflict" | "not_found" | "no_follow_up";
    };

const invalid = (errors: CrmFieldErrors): CrmCommandResult => ({
  ok: false,
  reason: "invalid",
  errors,
});
const notFound: CrmCommandResult = { ok: false, reason: "not_found" };
const conflict: CrmCommandResult = { ok: false, reason: "conflict" };

/** The signed-in author of a note or a log entry; an admin action always has one. */
function authorOf(actor: DbActor): string {
  return z.uuid().parse(actor.userId);
}

/** Whether the row's version is the one the form carried (millisecond precision, as rendered). */
function sameVersion(stored: Date, carried: string): boolean {
  return stored.getTime() === new Date(carried).getTime();
}

async function partnerCode(
  db: DbTransaction,
  partnerId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ code: fulfillmentPartner.code })
    .from(fulfillmentPartner)
    .where(eq(fulfillmentPartner.id, partnerId));
  return row?.code;
}

/* -------------------------------------------------------------------------- */
/* notes                                                                      */
/* -------------------------------------------------------------------------- */

/** `addNote(PartnerNoteCreateSchema)`. */
export async function addNote(
  actor: DbActor,
  input: unknown,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<CrmCommandResult> {
  const parsed = parseNoteCreate(input);
  if (!parsed.ok) return invalid(parsed.errors);
  return run({ ...actor, action: CRM_ACTIONS.noteAdd }, async (db) => {
    const code = await partnerCode(db, parsed.value.partnerId);
    if (code === undefined) return notFound;
    await db.insert(partnerNote).values({
      partnerId: parsed.value.partnerId,
      body: parsed.value.body,
      pinned: parsed.value.pinned,
      authorUserId: authorOf(actor),
    });
    return { ok: true as const, code };
  });
}

interface LockedNote {
  readonly id: string;
  readonly partnerId: string;
  readonly updatedAt: Date;
}

async function lockNote(
  db: DbTransaction,
  noteId: string,
): Promise<LockedNote | undefined> {
  const [row] = await db
    .select({
      id: partnerNote.id,
      partnerId: partnerNote.partnerId,
      updatedAt: partnerNote.updatedAt,
    })
    .from(partnerNote)
    .where(eq(partnerNote.id, noteId))
    .for("update");
  return row;
}

/** `editNote(PartnerNoteEditSchema)`: the text and the pin, against the version shown. */
export async function editNote(
  actor: DbActor,
  input: unknown,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<CrmCommandResult> {
  const parsed = parseNoteEdit(input);
  if (!parsed.ok) return invalid(parsed.errors);
  return run({ ...actor, action: CRM_ACTIONS.noteEdit }, async (db) => {
    const note = await lockNote(db, parsed.value.noteId);
    if (note === undefined) return notFound;
    if (!sameVersion(note.updatedAt, parsed.value.updatedAt)) return conflict;
    await db
      .update(partnerNote)
      .set({ body: parsed.value.body, pinned: parsed.value.pinned })
      .where(eq(partnerNote.id, note.id));
    const code = await partnerCode(db, note.partnerId);
    return code === undefined ? notFound : { ok: true as const, code };
  });
}

/** `deleteNote(PartnerNoteDeleteSchema)`: removed for good; the audit row keeps no text. */
export async function deleteNote(
  actor: DbActor,
  input: unknown,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<CrmCommandResult> {
  const parsed = PartnerNoteDeleteSchema.safeParse(input);
  if (!parsed.success) return invalid({ noteId: "target" });
  return run({ ...actor, action: CRM_ACTIONS.noteDelete }, async (db) => {
    const note = await lockNote(db, parsed.data.noteId);
    if (note === undefined) return notFound;
    if (!sameVersion(note.updatedAt, parsed.data.updatedAt)) return conflict;
    const code = await partnerCode(db, note.partnerId);
    await db.delete(partnerNote).where(eq(partnerNote.id, note.id));
    return code === undefined ? notFound : { ok: true as const, code };
  });
}

/* -------------------------------------------------------------------------- */
/* contact log                                                                */
/* -------------------------------------------------------------------------- */

/** `logContact(ContactLogCreateSchema)`; `now` and the wall-clock reader are injectable. */
export async function logContact(
  actor: DbActor,
  input: unknown,
  now: Date = new Date(),
  toInstant?: (wallClock: string) => Date | undefined,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<CrmCommandResult> {
  const parsed = parseContactCreate(input, now, toInstant);
  if (!parsed.ok) return invalid(parsed.errors);
  return run({ ...actor, action: CRM_ACTIONS.contactAdd }, async (db) => {
    const code = await partnerCode(db, parsed.value.partnerId);
    if (code === undefined) return notFound;
    await db.insert(partnerContactLog).values({
      partnerId: parsed.value.partnerId,
      occurredAt: parsed.value.occurredAt,
      channel: parsed.value.channel,
      direction: parsed.value.direction,
      topic: parsed.value.topic,
      summary: parsed.value.summary,
      followUpOn: parsed.value.followUpOn,
      authorUserId: authorOf(actor),
    });
    return { ok: true as const, code };
  });
}

async function lockEntry(db: DbTransaction, entryId: string) {
  const [row] = await db
    .select({
      id: partnerContactLog.id,
      partnerId: partnerContactLog.partnerId,
      updatedAt: partnerContactLog.updatedAt,
      followUpOn: partnerContactLog.followUpOn,
      followUpDoneAt: partnerContactLog.followUpDoneAt,
    })
    .from(partnerContactLog)
    .where(eq(partnerContactLog.id, entryId))
    .for("update");
  return row;
}

/** `editContact(ContactLogEditSchema)`; a removed follow-up date clears its done mark too. */
export async function editContact(
  actor: DbActor,
  input: unknown,
  now: Date = new Date(),
  toInstant?: (wallClock: string) => Date | undefined,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<CrmCommandResult> {
  const parsed = parseContactEdit(input, now, toInstant);
  if (!parsed.ok) return invalid(parsed.errors);
  return run({ ...actor, action: CRM_ACTIONS.contactEdit }, async (db) => {
    const entry = await lockEntry(db, parsed.value.entryId);
    if (entry === undefined) return notFound;
    if (!sameVersion(entry.updatedAt, parsed.value.updatedAt)) return conflict;
    const followUpChanged = entry.followUpOn !== parsed.value.followUpOn;
    await db
      .update(partnerContactLog)
      .set({
        occurredAt: parsed.value.occurredAt,
        channel: parsed.value.channel,
        direction: parsed.value.direction,
        topic: parsed.value.topic,
        summary: parsed.value.summary,
        followUpOn: parsed.value.followUpOn,
        ...(followUpChanged ? { followUpDoneAt: null } : {}),
      })
      .where(eq(partnerContactLog.id, entry.id));
    const code = await partnerCode(db, entry.partnerId);
    return code === undefined ? notFound : { ok: true as const, code };
  });
}

/** `markFollowUpDone(FollowUpDoneSchema)`: sets `follow_up_done_at` once. */
export async function markFollowUpDone(
  actor: DbActor,
  input: unknown,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<CrmCommandResult> {
  const parsed = FollowUpDoneSchema.safeParse(input);
  if (!parsed.success) return invalid({ entryId: "target" });
  return run({ ...actor, action: CRM_ACTIONS.followUpDone }, async (db) => {
    const entry = await lockEntry(db, parsed.data.entryId);
    if (entry === undefined) return notFound;
    if (entry.followUpOn === null) {
      return { ok: false as const, reason: "no_follow_up" as const };
    }
    await db
      .update(partnerContactLog)
      .set({ followUpDoneAt: sql`now()` })
      .where(
        and(
          eq(partnerContactLog.id, entry.id),
          isNull(partnerContactLog.followUpDoneAt),
        ),
      );
    const code = await partnerCode(db, entry.partnerId);
    return code === undefined ? notFound : { ok: true as const, code };
  });
}

/* -------------------------------------------------------------------------- */
/* contact person                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The contact person, against the partner's version (spec 012's one version per florist page):
 * a save moves `updated_at` on, so a profile form opened before it is a conflict too.
 */
export async function saveContactName(
  actor: DbActor,
  input: unknown,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<CrmCommandResult> {
  const parsed = parseContactNameEdit(input);
  if (!parsed.ok) return invalid(parsed.errors);
  return run({ ...actor, action: CRM_ACTIONS.contactName }, async (db) => {
    const [row] = await db
      .select({
        id: fulfillmentPartner.id,
        code: fulfillmentPartner.code,
        updatedAt: fulfillmentPartner.updatedAt,
      })
      .from(fulfillmentPartner)
      .where(eq(fulfillmentPartner.id, parsed.value.partnerId))
      .for("update");
    if (row === undefined) return notFound;
    if (!sameVersion(row.updatedAt, parsed.value.updatedAt)) return conflict;
    await db
      .update(fulfillmentPartner)
      .set({ contactName: parsed.value.contactName, updatedAt: sql`now()` })
      .where(eq(fulfillmentPartner.id, row.id));
    return { ok: true as const, code: row.code };
  });
}
