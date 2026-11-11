/**
 * Occasion reminders (spec 018 §14 A-founder-2026-10-22 C.7.4, C.11, C.12, C.17; AC-56, AC-57,
 * AC-58; TASK-353).
 *
 *  - **Consent is its own, explicit and separate** (C.7.4, C.16). The first reminder needs
 *    `consent: true` (the unticked box); it sets `customer.reminder_consent`, mints a fresh
 *    `reminder_unsubscribe_token` (16 CSPRNG bytes, base64url) and writes one `consent_log` row
 *    `{"occasion_reminders": true}`. `marketing_consent` is never read or written here, and
 *    nothing that writes it touches `reminder_consent` (AC-56).
 *  - **Withdrawal** (`setReminderConsent({ on: false })`, the account's "Turn off reminders", and
 *    the one-click stop of any T18 through `unsubscribeReminders`) clears the consent, writes the
 *    withdrawal to `consent_log` and **deletes every reminder of the customer** (AC-58). The token
 *    stays, so a second click finds the same customer and changes nothing.
 *  - **Who writes what.** The buyer's update guard (`0011`, widened by `0045`) pins the consent
 *    and token columns against a buyer session, and `consent_log` admits only staff and the
 *    system, so every consent change runs in the `system` context for the customer the server
 *    resolved from the session (or from a verified token): never an id the client sent. Reading,
 *    adding without a consent change and removing run under the buyer's `customer` context, so
 *    another customer's row reads and deletes nothing (RLS). A reminder's optional saved recipient
 *    must be the same customer's: the insert checks it explicitly, because a foreign key check
 *    ignores RLS.
 *  - **Sending** (`runOccasionReminders`, the `reminders.daily` job at 07:00 UTC): once per
 *    reminder whose next occurrence, on the UTC calendar, is exactly its lead time away; 29
 *    February fires for 28 February in a common year (`reminderTargets`); idempotent through
 *    `last_sent_for`, claimed in the same transaction as the send. Never to a customer without
 *    consent or a redacted one. With `account.reminders` off nothing is sent.
 *
 * Logs carry no email, name, token or id (C.10, C.17, AC-62): `account.reminder.created|removed`,
 * `reminders.sent {count}`, `reminders.unsubscribed {channel}`. Nothing here writes an order.
 */
import { randomBytes } from "node:crypto";

import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { isLocaleCode, type LocaleCode } from "@/config/locales";
import { CONSENT_POLICY_VERSION } from "@/lib/consent";
import { logger } from "@/lib/logger";
import { sign, type SignedLinkOptions, verify } from "@/lib/signed-link";

import type { AccountExecutor, AccountRunner } from "./buyer-account";

/** C.7.4: the occasions a reminder names (the migration's check agrees). */
export const OCCASION_KEYS = [
  "birthday",
  "anniversary",
  "name_day",
  "other",
] as const;
export type OccasionKey = (typeof OCCASION_KEYS)[number];

/** C.7.4: how many days before the date the email goes (the migration's check agrees). */
export const REMINDER_LEAD_DAYS = [3, 7, 14] as const;
export type ReminderLeadDays = (typeof REMINDER_LEAD_DAYS)[number];

/** C.11: at most this many reminders per customer (the migration's trigger agrees). */
export const OCCASION_REMINDER_LIMIT = 50;

/** C.11: the unsubscribe token, 16 bytes base64url (the migration's check agrees). */
const UnsubscribeTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/u);

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** A real calendar day of some year: 29 February counts, 30 February does not (C.11). */
export function isCalendarDay(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  const last = DAYS_IN_MONTH[month - 1];
  return last !== undefined && day >= 1 && day <= last;
}

/** C.12 `ReminderInput & { consent?: z.literal(true) }`: no year, no free text. */
export const ReminderInputSchema = z
  .object({
    occasionKey: z.enum(OCCASION_KEYS),
    day: z.number().int().min(1).max(31),
    month: z.number().int().min(1).max(12),
    leadDays: z.union([z.literal(3), z.literal(7), z.literal(14)]),
    savedRecipientId: z.uuid().nullable(),
    consent: z.literal(true).optional(),
  })
  .strict()
  .refine((input) => isCalendarDay(input.month, input.day), {
    error: "not a calendar day",
    path: ["day"],
  });
export type ReminderInput = z.input<typeof ReminderInputSchema>;

/** One reminder as the account lists it. */
export const OccasionReminderSchema = z
  .object({
    id: z.uuid(),
    occasionKey: z.enum(OCCASION_KEYS),
    day: z.number().int(),
    month: z.number().int(),
    leadDays: z.union([z.literal(3), z.literal(7), z.literal(14)]),
    recipientName: z.string().nullable(),
  })
  .strict();
export type OccasionReminder = z.infer<typeof OccasionReminderSchema>;

export interface ReminderState {
  readonly consent: boolean;
  readonly reminders: readonly OccasionReminder[];
}

/** The two contexts the reminder actions need (C.12). */
export interface ReminderRunners {
  /** The buyer's `customer` context: RLS scopes every read and the plain add and remove. */
  readonly run: AccountRunner;
  /** The `system` context, for the consent columns and `consent_log` only. */
  readonly system: AccountRunner;
}

export type CreateReminderOutcome =
  "created" | "consent_required" | "limit" | "invalid";

/** How a withdrawal reached us (C.17 `reminders.unsubscribed {channel}`). */
export type ReminderChannel = "email" | "account";

/** 16 CSPRNG bytes, base64url: 22 characters (C.11). */
export function mintUnsubscribeToken(): string {
  return randomBytes(16).toString("base64url");
}

const ReminderRow = z.object({
  id: z.uuid(),
  occasion_key: z.enum(OCCASION_KEYS),
  day: z.coerce.number().int(),
  month: z.coerce.number().int(),
  lead_days: z.coerce.number().int(),
  full_name: z.string().nullable(),
});

const ConsentRow = z.object({ reminder_consent: z.boolean() });

/** The customer's consent and reminders, by date (RLS: only theirs). `null`: no such customer. */
export async function readReminders(
  run: AccountRunner,
  customerId: string,
): Promise<ReminderState | null> {
  const id = z.uuid().parse(customerId);
  return run(async (db) => {
    const [consent] = await db.execute(sql`
      SELECT reminder_consent FROM customer WHERE id = ${id} AND redacted = false`);
    if (consent === undefined) return null;
    const rows = await db.execute(sql`
      SELECT r.id, r.occasion_key, r.day, r.month, r.lead_days, s.full_name
      FROM occasion_reminder r LEFT JOIN saved_recipient s ON s.id = r.saved_recipient_id
      WHERE r.customer_id = ${id}
      ORDER BY r.month, r.day, r.created_at, r.id`);
    return {
      consent: ConsentRow.parse(consent).reminder_consent,
      reminders: rows.map((raw) => {
        const row = ReminderRow.parse(raw);
        return OccasionReminderSchema.parse({
          id: row.id,
          occasionKey: row.occasion_key,
          day: row.day,
          month: row.month,
          leadDays: row.lead_days,
          recipientName: row.full_name,
        });
      }),
    };
  });
}

/** One `consent_log` row for the customer: `{"occasion_reminders": on}` (C.7.4, AC-56, AC-58). */
function consentRow(customerId: string, on: boolean, now: Date): SQL {
  return sql`
    INSERT INTO consent_log (subject_kind, subject_ref, choices, policy_version, occurred_at)
    VALUES ('customer', ${customerId},
            (${JSON.stringify({ occasion_reminders: on })}::text)::jsonb,
            ${CONSENT_POLICY_VERSION}, ${now.toISOString()}::timestamptz)`;
}

/**
 * Sets the customer's reminder consent in the `system` executor's transaction. A change writes one
 * `consent_log` row; turning on mints a fresh unsubscribe token (the old link stops working);
 * turning off deletes every reminder of the customer. The same state writes nothing. Answers
 * whether the consent changed.
 */
async function applyConsent(
  db: AccountExecutor,
  customerId: string,
  on: boolean,
  now: Date,
  newToken: () => string,
): Promise<boolean> {
  const token = on ? UnsubscribeTokenSchema.parse(newToken()) : null;
  const changed = await db.execute(sql`
    UPDATE customer
    SET reminder_consent = ${on},
        reminder_unsubscribe_token = CASE WHEN ${on}::boolean THEN ${token}::text
                                          ELSE reminder_unsubscribe_token END
    WHERE id = ${customerId} AND redacted = false AND reminder_consent IS DISTINCT FROM ${on}
    RETURNING id`);
  if (changed.length > 0) await db.execute(consentRow(customerId, on, now));
  if (!on) {
    await db.execute(
      sql`DELETE FROM occasion_reminder WHERE customer_id = ${customerId}`,
    );
  }
  return changed.length > 0;
}

/**
 * `setReminderConsent({ on })` (C.12): the account's consent switch for the session's customer.
 * Off is "Turn off reminders" (AC-58: the same effect as the one-click stop).
 */
export async function setReminderConsent(
  system: AccountRunner,
  customerId: string,
  raw: { readonly on: boolean },
  now: Date,
  newToken: () => string = mintUnsubscribeToken,
): Promise<boolean> {
  const id = z.uuid().parse(customerId);
  const { on } = z.object({ on: z.boolean() }).strict().parse(raw);
  const changed = await system((db) => applyConsent(db, id, on, now, newToken));
  if (changed && !on) {
    logger.info({ channel: "account" }, "reminders.unsubscribed");
  }
  return changed;
}

/** Whether `error`, or an error it wraps, is the migration's 51st-row refusal. */
function isLimitError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (current.message.includes("OCCASION_REMINDER_LIMIT")) return true;
    current = current.cause;
  }
  return false;
}

/** Rolls the transaction back when the saved recipient is not the customer's. */
class ForeignRecipient extends Error {
  override name = "ForeignRecipient";
}

/**
 * Inserts one reminder for the customer, in `db`'s transaction: the saved recipient, when named,
 * must be the same customer's (checked here: a foreign key ignores RLS). `limit` at 50.
 */
async function insertReminder(
  db: AccountExecutor,
  customerId: string,
  input: z.output<typeof ReminderInputSchema>,
): Promise<"created" | "limit"> {
  const [counted] = await db.execute(sql`
    SELECT count(*)::int AS count FROM occasion_reminder WHERE customer_id = ${customerId}`);
  const count = z.object({ count: z.number().int() }).parse(counted).count;
  if (count >= OCCASION_REMINDER_LIMIT) return "limit";
  const recipient = input.savedRecipientId;
  const inserted = await db.execute(sql`
    INSERT INTO occasion_reminder (customer_id, saved_recipient_id, occasion_key, day, month,
                                   lead_days)
    SELECT ${customerId}, ${recipient}::uuid, ${input.occasionKey}, ${input.day}, ${input.month},
           ${input.leadDays}
    WHERE ${recipient}::uuid IS NULL
       OR EXISTS (SELECT 1 FROM saved_recipient
                  WHERE id = ${recipient}::uuid AND customer_id = ${customerId})
    RETURNING id`);
  if (inserted.length === 0) throw new ForeignRecipient();
  return "created";
}

/**
 * `createReminder(ReminderInput & { consent?: true })` (C.12, AC-56). Without consent on record,
 * `consent: true` is required: absent, nothing is written (`consent_required`); given, the consent,
 * its `consent_log` row and the reminder are written in one transaction. `invalid` writes nothing
 * (not a calendar day, another customer's saved recipient, no such customer); `limit` neither.
 */
export async function createReminder(
  runners: ReminderRunners,
  customerId: string,
  raw: unknown,
  now: Date,
  newToken: () => string = mintUnsubscribeToken,
): Promise<CreateReminderOutcome> {
  const id = z.uuid().parse(customerId);
  const parsed = ReminderInputSchema.safeParse(raw);
  if (!parsed.success) return "invalid";
  const input = parsed.data;
  const state = await runners.run(async (db) => {
    const [row] = await db.execute(sql`
      SELECT reminder_consent FROM customer WHERE id = ${id} AND redacted = false`);
    return row === undefined ? null : ConsentRow.parse(row).reminder_consent;
  });
  if (state === null) return "invalid";
  if (!state && input.consent !== true) return "consent_required";
  try {
    const outcome = state
      ? await runners.run((db) => insertReminder(db, id, input))
      : await runners.system(async (db) => {
          await applyConsent(db, id, true, now, newToken);
          return insertReminder(db, id, input);
        });
    if (outcome === "created") logger.info({}, "account.reminder.created");
    return outcome;
  } catch (error) {
    if (error instanceof ForeignRecipient) return "invalid";
    if (isLimitError(error)) return "limit";
    throw error;
  }
}

/** `removeReminder({ id })` (C.12): deletes one reminder of the customer; `false` when RLS admits none. */
export async function removeReminder(
  run: AccountRunner,
  customerId: string,
  reminderId: string,
): Promise<boolean> {
  const customer = z.uuid().parse(customerId);
  const id = z.uuid().safeParse(reminderId);
  if (!id.success) return false;
  const deleted = await run((db) =>
    db.execute(sql`
      DELETE FROM occasion_reminder WHERE id = ${id.data} AND customer_id = ${customer}
      RETURNING id`),
  );
  if (deleted.length === 0) return false;
  logger.info({}, "account.reminder.removed");
  return true;
}

/* -------------------------------------------------------------------------- */
/* The unsubscribe link (C.11, AC-58)                                         */
/* -------------------------------------------------------------------------- */

/** The signed `t` of the stop links: purpose `unsubscribe`, payload `{ t }`, no expiry (C.11). */
export function reminderUnsubscribeLinkToken(
  unsubscribeToken: string,
  options?: SignedLinkOptions,
): string {
  return sign(
    "unsubscribe",
    { t: UnsubscribeTokenSchema.parse(unsubscribeToken) },
    undefined,
    options,
  );
}

const LinkPayloadSchema = z.object({ t: UnsubscribeTokenSchema }).strict();

/**
 * The one-click stop (C.7.4, AC-58): a valid signed `t` whose token belongs to a customer
 * withdraws their consent and deletes their reminders, exactly as "Turn off reminders". A forged,
 * unknown or rotated token changes nothing; the caller answers the same either way, so nothing
 * here says which it was.
 */
export async function unsubscribeReminders(
  system: AccountRunner,
  linkToken: string,
  now: Date,
  options?: SignedLinkOptions,
): Promise<void> {
  const verified = verify("unsubscribe", linkToken, options);
  if (!verified.ok) return;
  const payload = LinkPayloadSchema.safeParse(verified.payload);
  if (!payload.success) return;
  const changed = await system(async (db) => {
    const [row] = await db.execute(sql`
      SELECT id FROM customer WHERE reminder_unsubscribe_token = ${payload.data.t}`);
    if (row === undefined) return false;
    const { id } = z.object({ id: z.uuid() }).parse(row);
    return applyConsent(db, id, false, now, mintUnsubscribeToken);
  });
  if (changed) logger.info({ channel: "email" }, "reminders.unsubscribed");
}

/* -------------------------------------------------------------------------- */
/* Sending (C.7.4, AC-57)                                                     */
/* -------------------------------------------------------------------------- */

/** One (lead, month, day) a run looks for, and the occurrence date it stands for. */
export interface ReminderTarget {
  readonly leadDays: ReminderLeadDays;
  readonly month: number;
  readonly day: number;
  /** The occurrence on the UTC calendar, `YYYY-MM-DD`: what `last_sent_for` records. */
  readonly occurrence: string;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * What a run on `today` (a UTC calendar date) sends for: for each lead time, the date that far
 * ahead; when that date is 28 February of a common year, 29 February reminders too (C.7.4).
 */
export function reminderTargets(today: string): readonly ReminderTarget[] {
  const base = Date.parse(`${z.iso.date().parse(today)}T00:00:00Z`);
  const targets: ReminderTarget[] = [];
  for (const leadDays of REMINDER_LEAD_DAYS) {
    const at = new Date(base + leadDays * 86_400_000);
    const month = at.getUTCMonth() + 1;
    const day = at.getUTCDate();
    const occurrence = at.toISOString().slice(0, 10);
    targets.push({ leadDays, month, day, occurrence });
    if (month === 2 && day === 28 && !isLeapYear(at.getUTCFullYear())) {
      targets.push({ leadDays, month: 2, day: 29, occurrence });
    }
  }
  return targets;
}

/** One reminder due today, with what its email needs. */
export interface DueReminder {
  readonly id: string;
  readonly email: string;
  readonly occasionKey: OccasionKey;
  readonly occurrence: string;
  readonly locale: LocaleCode;
  /** The saved recipient's country, else the latest live order's destination, else `null`. */
  readonly countryIso2: string | null;
  readonly recipientName: string | null;
  readonly unsubscribeToken: string;
}

const DueRow = z.object({
  id: z.uuid(),
  email_normalised: z.string().min(1),
  occasion_key: z.enum(OCCASION_KEYS),
  occurrence: z.union([z.string(), z.date()]),
  locale: z.string().nullable(),
  country_iso2: z.string().nullable(),
  full_name: z.string().nullable(),
  token: UnsubscribeTokenSchema,
});

function isoDateOf(value: string | Date): string {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}

/** The reminders due on `today` and not yet sent for that occurrence (consent on, not redacted). */
export async function dueReminders(
  system: AccountRunner,
  today: string,
): Promise<DueReminder[]> {
  const targets = reminderTargets(today);
  const values = sql.join(
    targets.map(
      (target) =>
        sql`(${target.leadDays}::smallint, ${target.month}::smallint, ${target.day}::smallint, ${target.occurrence}::date)`,
    ),
    sql`, `,
  );
  const rows = await system((db) =>
    db.execute(sql`
      WITH target (lead_days, month, day, occurrence) AS (VALUES ${values})
      SELECT r.id, c.email_normalised, r.occasion_key, t.occurrence::text AS occurrence,
             COALESCE(c.preferred_locale,
                      (SELECT o.locale_code FROM "order" o
                       WHERE o.customer_id = c.id AND o.mode = 'live'
                       ORDER BY o.created_at DESC, o.id LIMIT 1)) AS locale,
             COALESCE(sc.iso2,
                      (SELECT dc.iso2 FROM "order" o JOIN country dc ON dc.id = o.destination_country_id
                       WHERE o.customer_id = c.id AND o.mode = 'live'
                       ORDER BY o.created_at DESC, o.id LIMIT 1)) AS country_iso2,
             s.full_name, c.reminder_unsubscribe_token AS token
      FROM occasion_reminder r
      JOIN target t ON t.lead_days = r.lead_days AND t.month = r.month AND t.day = r.day
      JOIN customer c ON c.id = r.customer_id
      LEFT JOIN saved_recipient s ON s.id = r.saved_recipient_id
      LEFT JOIN country sc ON sc.id = s.country_id
      WHERE c.reminder_consent AND NOT c.redacted
        AND c.reminder_unsubscribe_token IS NOT NULL
        AND r.last_sent_for IS DISTINCT FROM t.occurrence
      ORDER BY r.id`),
  );
  return rows.map((raw) => {
    const row = DueRow.parse(raw);
    const locale =
      row.locale !== null && isLocaleCode(row.locale) ? row.locale : "en";
    return {
      id: row.id,
      email: row.email_normalised,
      occasionKey: row.occasion_key,
      occurrence: isoDateOf(row.occurrence),
      locale,
      countryIso2: row.country_iso2,
      recipientName: row.full_name,
      unsubscribeToken: row.token,
    };
  });
}

/**
 * Marks `reminderId` sent for `occurrence`, in `db`'s transaction, only while it is not yet and
 * its customer still consents and is not redacted. Answers whether this call claimed it.
 */
async function claimReminder(
  db: AccountExecutor,
  reminderId: string,
  occurrence: string,
): Promise<boolean> {
  const claimed = await db.execute(sql`
    UPDATE occasion_reminder r SET last_sent_for = ${occurrence}::date
    FROM customer c
    WHERE r.id = ${reminderId} AND c.id = r.customer_id
      AND c.reminder_consent AND NOT c.redacted
      AND r.last_sent_for IS DISTINCT FROM ${occurrence}::date
    RETURNING r.id`);
  return claimed.length > 0;
}

/** What `runOccasionReminders` needs from outside (the job wires production; the suites inject). */
export interface OccasionReminderJobDeps {
  readonly system: AccountRunner;
  /** `account.reminders`: off sends nothing. */
  readonly flagOn: () => Promise<boolean>;
  /** Builds and sends T18 for one due reminder; throws on failure (the claim rolls back). */
  readonly send: (reminder: DueReminder) => Promise<void>;
}

export interface OccasionReminderRun {
  readonly sent: number;
  readonly failed: number;
}

/**
 * `reminders.daily` (C.7.4, AC-57): every reminder due on `now`'s UTC date, each claimed and sent
 * in its own `system` transaction, so a send that fails leaves it unclaimed for the retry and a
 * second run that day finds nothing. A failure does not stop the others; the run throws at the end
 * when any failed, so the job is retried and alerts.
 */
export async function runOccasionReminders(
  now: Date,
  deps: OccasionReminderJobDeps,
): Promise<OccasionReminderRun> {
  if (!(await deps.flagOn())) {
    logger.info({ count: 0, flag: "off" }, "reminders.sent");
    return { sent: 0, failed: 0 };
  }
  const today = now.toISOString().slice(0, 10);
  const due = await dueReminders(deps.system, today);
  let sent = 0;
  let failed = 0;
  for (const reminder of due) {
    try {
      const claimed = await deps.system(async (db) => {
        if (!(await claimReminder(db, reminder.id, reminder.occurrence))) {
          return false;
        }
        await deps.send(reminder);
        return true;
      });
      if (claimed) sent += 1;
    } catch (error) {
      failed += 1;
      logger.warn(
        { error_name: error instanceof Error ? error.name : "unknown" },
        "reminders.send_failed",
      );
    }
  }
  logger.info({ count: sent }, "reminders.sent");
  if (failed > 0) {
    throw new Error(`reminders.daily: ${String(failed)} reminder(s) not sent`);
  }
  return { sent, failed };
}
