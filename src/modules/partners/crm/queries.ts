/**
 * The CRM reads (spec 030b §2.6 "Relationship", §2.7, §5.2; AC-27, AC-29; TASK-441):
 * `partnerRelationship(partnerId)`, `followUpsDue(viewerZone)` and the partners list's extra
 * columns (`partnerListCrm`: last accepted order and open follow-ups per florist).
 *
 * One admin transaction each (action `partner_crm.read`). No money is read here: ops read and
 * write the relationship record and see no money figure (AC-2). The last accepted order is the
 * newest accepted assignment of a `live` order (a `test` or `demo` order never counts). "Due" is
 * today or earlier in the viewer's zone, open (no `follow_up_done_at`).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { DbActor, DbTransaction } from "@/lib/db";

import {
  contactLogChannels,
  contactLogDirections,
  contactLogTopics,
  partnerStatuses,
} from "../../../../db/schema/partners";
import { type PartnerAdminRunner, partnerAdminRunner } from "../admin/commands";
import { CRM_ACTIONS } from "./commands";

const Instant = z
  .union([z.date(), z.string()])
  .transform((value) => (value instanceof Date ? value : new Date(value)));
const IsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const Zone = z.string().regex(/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/u);

/** A version as every form carries it (ISO, millisecond precision). */
function version(value: Date): string {
  return value.toISOString();
}

export interface CrmNote {
  readonly id: string;
  readonly body: string;
  readonly pinned: boolean;
  readonly author: string | null;
  readonly createdAt: Date;
  readonly updatedAt: string;
}

export interface CrmContactEntry {
  readonly id: string;
  readonly occurredAt: Date;
  readonly channel: (typeof contactLogChannels)[number];
  readonly direction: (typeof contactLogDirections)[number];
  readonly topic: (typeof contactLogTopics)[number];
  readonly summary: string;
  readonly followUpOn: string | null;
  readonly followUpDoneAt: Date | null;
  readonly updatedAt: string;
}

export interface PartnerRelationship {
  readonly id: string;
  readonly code: string;
  readonly status: (typeof partnerStatuses)[number];
  readonly contactName: string | null;
  readonly contactEmail: string;
  readonly contactPhone: string | null;
  readonly notificationChannel: string;
  /** The florist's language (its first member's), or `null` before anyone may sign in. */
  readonly localeCode: string | null;
  readonly termsSignedAt: string | null;
  readonly termsVersion: string | null;
  readonly rating90dBp: number | null;
  readonly acceptanceRateBp: number | null;
  readonly lastAcceptedAt: Date | null;
  /** The partner's version (the contact person form carries it). */
  readonly updatedAt: string;
  /** Pinned first, then newest first. */
  readonly notes: readonly CrmNote[];
  /** Newest first. */
  readonly contacts: readonly CrmContactEntry[];
}

const PartnerRow = z.object({
  id: z.uuid(),
  code: z.string(),
  status: z.enum(partnerStatuses),
  contact_name: z.string().nullable(),
  contact_email: z.string(),
  contact_phone: z.string().nullable(),
  notification_channel: z.string(),
  locale_code: z.string().nullable(),
  terms_signed_at: IsoDay.nullable(),
  terms_version: z.string().nullable(),
  rating_90d_bp: z.number().int().nullable(),
  acceptance_rate_bp: z.number().int().nullable(),
  last_accepted_at: Instant.nullable(),
  updated_at: Instant,
});

const NoteRow = z.object({
  id: z.uuid(),
  body: z.string(),
  pinned: z.boolean(),
  author: z.string().nullable(),
  created_at: Instant,
  updated_at: Instant,
});

const ContactRow = z.object({
  id: z.uuid(),
  occurred_at: Instant,
  channel: z.enum(contactLogChannels),
  direction: z.enum(contactLogDirections),
  topic: z.enum(contactLogTopics),
  summary: z.string(),
  follow_up_on: IsoDay.nullable(),
  follow_up_done_at: Instant.nullable(),
  updated_at: Instant,
});

/** Newest accepted assignment of a live order, per partner (a correlated sub-select). */
const LAST_ACCEPTED = sql.raw(`(SELECT max(a.responded_at)
    FROM public.order_assignment a
    JOIN public."order" o ON o.id = a.order_id
    WHERE a.partner_id = fp.id AND a.response = 'accept' AND o.mode = 'live')`);

/** The relationship record of one florist, read in `db` (three statements). */
export async function readRelationship(
  db: DbTransaction,
  partnerId: string,
): Promise<PartnerRelationship | undefined> {
  const id = z.uuid().parse(partnerId);
  const [partner] = await db.execute(sql`
    SELECT fp.id, fp.code, fp.status, fp.contact_name, fp.contact_email, fp.contact_phone,
           fp.notification_channel, fp.terms_signed_at::text AS terms_signed_at,
           fp.terms_version, fp.rating_90d_bp, fp.acceptance_rate_bp, fp.updated_at,
           (SELECT m.locale_code FROM public.partner_member m
             WHERE m.partner_id = fp.id ORDER BY m.created_at LIMIT 1) AS locale_code,
           ${LAST_ACCEPTED} AS last_accepted_at
    FROM public.fulfillment_partner fp
    WHERE fp.id = ${id}`);
  if (partner === undefined) return undefined;
  const row = PartnerRow.parse(partner);
  const notes = await db.execute(sql`
    SELECT n.id, n.body, n.pinned, u.name AS author, n.created_at, n.updated_at
    FROM public.partner_note n
    LEFT JOIN public.users u ON u.id = n.author_user_id
    WHERE n.partner_id = ${id}
    ORDER BY n.pinned DESC, n.created_at DESC, n.id`);
  const contacts = await db.execute(sql`
    SELECT c.id, c.occurred_at, c.channel, c.direction, c.topic, c.summary,
           c.follow_up_on::text AS follow_up_on, c.follow_up_done_at, c.updated_at
    FROM public.partner_contact_log c
    WHERE c.partner_id = ${id}
    ORDER BY c.occurred_at DESC, c.id`);
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    notificationChannel: row.notification_channel,
    localeCode: row.locale_code,
    termsSignedAt: row.terms_signed_at,
    termsVersion: row.terms_version,
    rating90dBp: row.rating_90d_bp,
    acceptanceRateBp: row.acceptance_rate_bp,
    lastAcceptedAt: row.last_accepted_at,
    updatedAt: version(row.updated_at),
    notes: notes.map((raw) => {
      const note = NoteRow.parse(raw);
      return {
        id: note.id,
        body: note.body,
        pinned: note.pinned,
        author: note.author,
        createdAt: note.created_at,
        updatedAt: version(note.updated_at),
      };
    }),
    contacts: contacts.map((raw) => {
      const entry = ContactRow.parse(raw);
      return {
        id: entry.id,
        occurredAt: entry.occurred_at,
        channel: entry.channel,
        direction: entry.direction,
        topic: entry.topic,
        summary: entry.summary,
        followUpOn: entry.follow_up_on,
        followUpDoneAt: entry.follow_up_done_at,
        updatedAt: version(entry.updated_at),
      };
    }),
  };
}

/** `partnerRelationship(partnerId)` in its own admin transaction. */
export async function partnerRelationship(
  actor: DbActor,
  partnerId: string,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<PartnerRelationship | undefined> {
  return run({ ...actor, action: CRM_ACTIONS.read }, (db) =>
    readRelationship(db, partnerId),
  );
}

export interface FollowUpDue {
  readonly entryId: string;
  readonly partnerId: string;
  readonly partnerCode: string;
  readonly partnerName: string;
  readonly topic: (typeof contactLogTopics)[number];
  readonly summary: string;
  readonly followUpOn: string;
}

const DueRow = z.object({
  id: z.uuid(),
  partner_id: z.uuid(),
  code: z.string(),
  legal_name: z.string(),
  topic: z.enum(contactLogTopics),
  summary: z.string(),
  follow_up_on: IsoDay,
});

/**
 * The open follow-ups due today or earlier in `zone` at `now`, oldest first; one partner's when
 * `partnerId` is given.
 */
export async function readFollowUpsDue(
  db: DbTransaction,
  zone: string,
  now: Date,
  partnerId?: string,
): Promise<FollowUpDue[]> {
  const viewerZone = Zone.parse(zone);
  const one =
    partnerId === undefined
      ? sql`true`
      : sql`c.partner_id = ${z.uuid().parse(partnerId)}`;
  const rows = await db.execute(sql`
    SELECT c.id, c.partner_id, fp.code, fp.legal_name, c.topic, c.summary,
           c.follow_up_on::text AS follow_up_on
    FROM public.partner_contact_log c
    JOIN public.fulfillment_partner fp ON fp.id = c.partner_id
    WHERE c.follow_up_on IS NOT NULL AND c.follow_up_done_at IS NULL
      AND c.follow_up_on <= (${now.toISOString()}::timestamptz AT TIME ZONE ${viewerZone})::date
      AND ${one}
    ORDER BY c.follow_up_on, fp.code, c.id`);
  return rows.map((raw) => {
    const row = DueRow.parse(raw);
    return {
      entryId: row.id,
      partnerId: row.partner_id,
      partnerCode: row.code,
      partnerName: row.legal_name,
      topic: row.topic,
      summary: row.summary,
      followUpOn: row.follow_up_on,
    };
  });
}

/** `followUpsDue(viewerZone)` in its own admin transaction. */
export async function followUpsDue(
  actor: DbActor,
  zone: string,
  now: Date = new Date(),
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<FollowUpDue[]> {
  return run({ ...actor, action: CRM_ACTIONS.read }, (db) =>
    readFollowUpsDue(db, zone, now),
  );
}

/** The partners list's CRM columns of one florist. */
export interface PartnerCrmColumns {
  readonly lastAcceptedAt: Date | null;
  readonly rating90dBp: number | null;
  /** Open follow-ups due today or earlier in the viewer's zone. */
  readonly followUps: number;
}

const ColumnsRow = z.object({
  id: z.uuid(),
  last_accepted_at: Instant.nullable(),
  rating_90d_bp: z.number().int().nullable(),
  follow_ups: z.coerce.number().int(),
});

/** Every florist's CRM columns, keyed by partner id (one statement). */
export async function partnerListCrm(
  actor: DbActor,
  zone: string,
  now: Date = new Date(),
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<ReadonlyMap<string, PartnerCrmColumns>> {
  const viewerZone = Zone.parse(zone);
  return run({ ...actor, action: CRM_ACTIONS.read }, async (db) => {
    const rows = await db.execute(sql`
      SELECT fp.id, fp.rating_90d_bp, ${LAST_ACCEPTED} AS last_accepted_at,
             (SELECT count(*) FROM public.partner_contact_log c
               WHERE c.partner_id = fp.id AND c.follow_up_on IS NOT NULL
                 AND c.follow_up_done_at IS NULL
                 AND c.follow_up_on <= (${now.toISOString()}::timestamptz AT TIME ZONE ${viewerZone})::date
             ) AS follow_ups
      FROM public.fulfillment_partner fp`);
    return new Map(
      rows.map((raw) => {
        const row = ColumnsRow.parse(raw);
        return [
          row.id,
          {
            lastAcceptedAt: row.last_accepted_at,
            rating90dBp: row.rating_90d_bp,
            followUps: row.follow_ups,
          },
        ];
      }),
    );
  });
}
