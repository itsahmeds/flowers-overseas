/**
 * `sendBasketReminder` (spec 034 §5.2 "Jobs" `basket-reminders.send`; AC-3, AC-4, AC-6, AC-14,
 * AC-15; TASK-450).
 *
 * In the caller's one transaction: the reminder `FOR UPDATE`, then its draft `FOR UPDATE`; a
 * reminder that is no longer `scheduled` is left alone, so two concurrent jobs send once (AC-4).
 * Then the nine checks, in order, each ending `skipped` with its reason and no email. If the buyer
 * came back since it was scheduled the row is deleted (`basket_reminder.deferred`) and the next scan
 * reconsiders the draft. Otherwise the two tokens are minted and stored as SHA-256 only, R1 is
 * rendered in the reminder's locale and sent through `Mailer` with the `basket_reminder` tag, the
 * `marketing` stream, the two `List-Unsubscribe` headers and `idempotencyKey = basket_reminder:{id}`.
 * Resend's `409 invalid_idempotent_request` counts as sent with no provider id; any other error
 * throws, the transaction rolls back and pg-boss retries. **The draft is never modified here.**
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  ABANDON_AFTER_MS,
  PER_ADDRESS_GAP_MS,
  REMINDER_MAX_LINES,
  RESTORE_TTL_MS,
  SEND_LATEST_MS,
} from "@/config/basket-reminders";
import type { LocaleCode } from "@/config/locales";
import { contactHmacWith } from "@/lib/contact-hmac";
import { basketReminderEnv } from "@/lib/env.basket-reminders";
import type { EnvSource } from "@/lib/env.schema";
import type { Logger } from "@/lib/logger";
import {
  type BasketReminderEmailProps,
  type Mailer,
  MailerError,
  type ReminderEmailLine,
  type RenderedBasketReminderEmail,
} from "@/modules/notifications";
import type { OrderExecutor } from "@/modules/orders";

import { assessBasket } from "../basket";
import { type BasketLine, type Draft, loadDraftByIdForUpdate } from "../draft";
import {
  type DeliveryWindowFn,
  hasAvailableLine,
  reminderLineStates,
} from "./eligibility";
import type { ReminderFlagReader } from "./offer";
import { mintReminderToken, reminderTokenHash } from "./tokens";

export type SkipReason =
  | "flag_off"
  | "purchased"
  | "no_email"
  | "consent_withdrawn"
  | "too_late"
  | "suppressed"
  | "purchased_elsewhere"
  | "recent_reminder"
  | "no_available_line";

export type SendOutcome =
  | { readonly status: "not_scheduled" }
  | { readonly status: "skipped"; readonly reason: SkipReason }
  | { readonly status: "deferred" }
  | { readonly status: "sent"; readonly providerMessageId: string | null };

/** What a line shows in R1, resolved from the catalogue in the reminder's locale. */
export type ReminderLineView = Omit<ReminderEmailLine, "date">;

export interface SendDeps {
  readonly executor: OrderExecutor;
  readonly mailer: Mailer;
  /**
   * R1's renderer, `renderBasketReminderEmail` from `@/modules/notifications/emails`, handed in by
   * the job worker: the email copy stays off the module barrel, which pages reach (TASK-521).
   */
  readonly render: (
    props: BasketReminderEmailProps,
  ) => RenderedBasketReminderEmail;
  readonly readFlag: ReminderFlagReader;
  readonly env: EnvSource;
  readonly window: DeliveryWindowFn;
  /** Whether a line's product, tier and destination are still sold `live` (AC-6). */
  readonly isAvailable: (
    draft: Draft,
    locale: LocaleCode,
    now: Date,
  ) => Promise<readonly boolean[]>;
  readonly lineView: (
    line: BasketLine,
    locale: LocaleCode,
  ) => Promise<ReminderLineView>;
  /** `https://flowersoverseas.com`, no trailing slash. */
  readonly siteOrigin: string;
  readonly helpPath: (locale: LocaleCode) => string;
  readonly privacyPath: (locale: LocaleCode) => string;
  readonly log: Logger;
}

const ReminderRow = z.object({
  id: z.uuid(),
  draft_id: z.uuid().nullable(),
  locale_code: z.string(),
  status: z.string(),
});

const DraftExtraRow = z.object({ created_at: z.coerce.date() });

async function skip(
  executor: OrderExecutor,
  log: Logger,
  id: string,
  reason: SkipReason,
): Promise<SendOutcome> {
  await executor.execute(sql`
    UPDATE basket_reminder SET status = 'skipped', skip_reason = ${reason}
     WHERE id = ${id}`);
  log.info({ reminder_id: id, reason }, "basket_reminder.skipped");
  return { status: "skipped", reason };
}

export async function sendBasketReminder(
  reminderId: string,
  now: Date,
  deps: SendDeps,
): Promise<SendOutcome> {
  const started = Date.now();
  const { executor, log } = deps;
  const [raw] = await executor.execute(sql`
    SELECT id, draft_id, locale_code, status FROM basket_reminder
     WHERE id = ${z.uuid().parse(reminderId)} FOR UPDATE`);
  if (raw === undefined) return { status: "not_scheduled" };
  const reminder = ReminderRow.parse(raw);
  if (reminder.status !== "scheduled") return { status: "not_scheduled" };
  const id = reminder.id;

  // 1. flag off (or the feature's env missing, which keeps it off: AC-28)
  let flag = false;
  try {
    flag = await deps.readFlag();
  } catch {
    flag = false;
  }
  const config = basketReminderEnv(deps.env);
  if (!flag || !config.configured) return skip(executor, log, id, "flag_off");

  // 2. draft deleted or placed
  const draft =
    reminder.draft_id === null
      ? null
      : await loadDraftByIdForUpdate(executor, reminder.draft_id);
  if (draft === null || draft.purchaseId !== null) {
    return skip(executor, log, id, "purchased");
  }
  // 3. no email
  const email = draft.buyer?.email.trim().toLowerCase() ?? "";
  if (email === "") return skip(executor, log, id, "no_email");
  // 4. consent cleared
  const consentAt = draft.reminderConsentAt ?? null;
  if (consentAt === null) return skip(executor, log, id, "consent_withdrawn");
  // 5. too late
  const idle = now.getTime() - draft.lastActivityAt.getTime();
  if (idle > SEND_LATEST_MS) return skip(executor, log, id, "too_late");
  // 6. suppressed
  const emailHmac = contactHmacWith(config.hmacSecret, email);
  const suppressed = await executor.execute(sql`
    SELECT 1 FROM email_suppression
     WHERE email_hmac = ${emailHmac} AND scope = 'basket_reminder'
       AND (reason IN ('complained', 'bounced')
            OR (reason = 'unsubscribed' AND updated_at > ${consentAt.toISOString()}::timestamptz))`);
  if (suppressed.length > 0) return skip(executor, log, id, "suppressed");
  // 7. bought elsewhere with the same email, after this basket started
  const [extra] = await executor.execute(
    sql`SELECT created_at FROM checkout_draft WHERE id = ${draft.id}`,
  );
  const createdAt = DraftExtraRow.parse(extra).created_at;
  const elsewhere = await executor.execute(sql`
    SELECT 1 FROM purchase p JOIN customer c ON c.id = p.customer_id
     WHERE p.mode = 'live' AND lower(c.email_normalised) = ${email}
       AND p.created_at > ${createdAt.toISOString()}::timestamptz
     LIMIT 1`);
  if (elsewhere.length > 0)
    return skip(executor, log, id, "purchased_elsewhere");
  // 8. another reminder to this address within the gap
  const gapStart = new Date(now.getTime() - PER_ADDRESS_GAP_MS).toISOString();
  const recent = await executor.execute(sql`
    SELECT 1 FROM basket_reminder
     WHERE email_hmac = ${emailHmac} AND status = 'sent' AND id <> ${id}
       AND sent_at >= ${gapStart}::timestamptz
     LIMIT 1`);
  if (recent.length > 0) return skip(executor, log, id, "recent_reminder");
  // 9. no line can still be shown
  const locale = reminder.locale_code as LocaleCode;
  const available = await deps.isAvailable(draft, locale, now);
  const states = reminderLineStates(
    draft.lines.map((line, index) => ({ ...line, index })),
    now,
    deps.window,
    (line) => available[line.index] === true,
  );
  if (!hasAvailableLine(states)) {
    return skip(executor, log, id, "no_available_line");
  }

  // The buyer came back since the scan: not abandoned any more.
  if (idle < ABANDON_AFTER_MS) {
    await executor.execute(sql`DELETE FROM basket_reminder WHERE id = ${id}`);
    log.info({ reminder_id: id }, "basket_reminder.deferred");
    return { status: "deferred" };
  }

  const shown = states
    .filter((state) => state.state !== "unavailable")
    .slice(0, REMINDER_MAX_LINES);
  const lines: ReminderEmailLine[] = [];
  for (const state of shown) {
    const view = await deps.lineView(state.line, locale);
    lines.push({
      ...view,
      date:
        state.state === "kept"
          ? { kind: "kept", isoDate: state.date }
          : state.state === "moved"
            ? { kind: "moved", nextIsoDate: state.nextDate }
            : { kind: "open" },
    });
  }

  const restoreToken = mintReminderToken();
  const unsubscribeToken = mintReminderToken();
  const origin = deps.siteOrigin.replace(/\/+$/u, "");
  const restoreUrl = `${origin}/${locale}/basket/restore/${restoreToken}`;
  const unsubscribeUrl = `${origin}/${locale}/basket/unsubscribe/${unsubscribeToken}`;
  const oneClick = `${origin}/api/basket-reminders/unsubscribe/${unsubscribeToken}`;
  await executor.execute(sql`
    UPDATE basket_reminder
       SET email_hmac = ${emailHmac}, line_count = ${lines.length},
           restore_token_sha256 = ${reminderTokenHash(restoreToken)},
           restore_expires_at = ${new Date(now.getTime() + RESTORE_TTL_MS).toISOString()}::timestamptz,
           unsubscribe_token_sha256 = ${reminderTokenHash(unsubscribeToken)}
     WHERE id = ${id}`);

  const rendered = deps.render({
    locale,
    lines,
    restoreUrl,
    unsubscribeUrl,
    helpUrl: `${origin}${deps.helpPath(locale)}`,
    privacyUrl: `${origin}${deps.privacyPath(locale)}`,
  });
  let providerMessageId: string | null = null;
  try {
    const result = await deps.mailer.send({
      tag: "basket_reminder",
      to: email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      stream: "marketing",
      idempotencyKey: `basket_reminder:${id}`,
      headers: {
        "List-Unsubscribe": `<${oneClick}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    providerMessageId = result.providerRef;
  } catch (error) {
    if (
      !(error instanceof MailerError) ||
      error.code !== "invalid_idempotent_request"
    ) {
      throw error;
    }
  }
  await executor.execute(sql`
    UPDATE basket_reminder
       SET status = 'sent', sent_at = ${now.toISOString()}::timestamptz,
           provider_message_id = ${providerMessageId}, delivery_status = 'sent'
     WHERE id = ${id}`);
  log.info(
    {
      reminder_id: id,
      line_count: lines.length,
      locale,
      duration_ms: Date.now() - started,
    },
    "basket_reminder.sent",
  );
  return { status: "sent", providerMessageId };
}

/** After the last retry: the row ends `failed` (AC-4); the caller raises the Sentry event. */
export async function markReminderFailed(
  executor: OrderExecutor,
  reminderId: string,
): Promise<boolean> {
  const rows = await executor.execute(sql`
    UPDATE basket_reminder SET status = 'failed'
     WHERE id = ${z.uuid().parse(reminderId)} AND status = 'scheduled'
    RETURNING id`);
  return rows.length === 1;
}

/**
 * The production `isAvailable`: a line is shown unless spec 010's basket assessment calls it
 * unavailable (product retired, tier unpriced, destination closed or no longer in the basket's
 * mode). A gone date is not unavailable: `reminderLineStates` moves it (AC-6).
 */
export async function availableLines(
  draft: Draft,
  locale: LocaleCode,
  now: Date,
): Promise<readonly boolean[]> {
  const assessed = await assessBasket(draft, { locale, now });
  return assessed.lines.map(
    (entry) => entry.availability.status !== "unavailable",
  );
}
