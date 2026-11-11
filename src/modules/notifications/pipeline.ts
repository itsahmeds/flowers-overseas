/**
 * The notification pipeline: the `notifications` outbox handler and the job entry for V2, V5 and
 * B8 (spec 016 §5.2 "Notifications", §8 "Minimisation", "Logs and PII"; AC-14, AC-18 to AC-20,
 * AC-23, AC-26, AC-33, AC-36, AC-39, AC-44, AC-58; TASK-331).
 *
 * For one trigger (an outbox delivery of an order event, or a job), in the caller's transaction:
 *
 *  1. `notificationsFor(trigger, fromStatus, mode)` names the rows (`rules.ts`). None: nothing.
 *  2. Each row's recipients are resolved **now**, never earlier and never stored: the buyer is
 *     `order.buyer_snapshot`'s email in `order.locale_code` (B1: the purchase's locale); a florist
 *     row goes to every `partner_member` of the assignment's florist, each at `users.email` in
 *     their own `partner_member.locale_code`; ops is `OPS_ALERT_EMAIL` in `en`. A W row exists only
 *     when the florist chose WhatsApp, in the language of the florist's earliest owner member.
 *  3. Per recipient, `notification_delivery` is inserted `queued` under its unique key
 *     `(source_key, template_key, recipient_ref)`, or the existing row is found and locked.
 *     `source_key` is `outbox:{outboxId}`, `job:{name}:{id}`, or for B1 `purchase:{purchaseId}`, so
 *     the row-2 deliveries of every order of one purchase meet one B1 row (AC-44). No address,
 *     name or subject is ever written (`recipient_ref` is `buyer`, `ops` or a user id; AC-20).
 *  4. A row already `sent` or later is skipped (a handler run twice, a job re-run). A `queued` row
 *     is rendered and sent with `idempotencyKey = {source_key}:{template_key}:{recipient_ref}`, so
 *     a crash between the insert and the send costs nothing: the repeat sends again with the same
 *     key and Resend deduplicates (AC-19). A florist email mints a fresh one-tap link per member
 *     (spec 012's core, the callback `{FLORIST_BASE_PATH}/orders/{assignmentId}` kept server-side;
 *     AC-23), so a repeat's body differs from the first: Resend then answers
 *     `409 invalid_idempotent_request`, which means the first send was accepted, and the row is
 *     marked `sent` with no provider id and nothing is retried. `409
 *     concurrent_idempotent_requests` and every other error throw, and the dispatcher's retry and
 *     `dead` rules apply (the savepoint takes the `queued` insert back with it).
 *
 * Every row of the trigger is handled in the same run: V1 leaves in the handler run of its
 * `assignment.offered` delivery, one email per member per offer, never batched and never deferred
 * to a job (AC-58). `notifications.email` off holds the outbox deliveries at the dispatcher (they
 * stay `pending`, `registerNotificationsOutbox`) and makes the job entry throw `NOTIFICATIONS_HELD`
 * so pg-boss retries it (AC-26).
 *
 * An admin resend (spec 020a §5.2 request 2, TASK-360) is a row created outside the outbox with
 * `source_key = admin:{actionId}` and `resend_of`; `resend.ts` renders it from its original's
 * context through `sendOne` below, the one send path (exported for it, not from the barrel).
 *
 * Logs carry ids, the template key, the audience and the source key only (spec 016 §11): never an
 * address, a name, a subject, a link or a token (AC-33).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { FLORIST_PATHS } from "@/config/florists";
import { mailerConfig } from "@/lib/env.auth";
import { opsAlertEmail } from "@/lib/env.notifications";
import { isEnabled } from "@/lib/flags";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import {
  ORDER_MODES,
  type OrderExecutor,
  type OrderMode,
  type OutboxHandler,
  registerOutboxHandler,
  registerOutboxHold,
} from "@/modules/orders";

import {
  type MailAttachment,
  type Mailer,
  MailerError,
  type MailTag,
  getMailer,
} from "./mailer";
import {
  type NotificationAudience,
  type NotificationJob,
  type NotificationRule,
  type NotificationTemplateKey,
  type NotificationTrigger,
  NOTIFICATION_TEMPLATE_KEYS,
  notificationsFor,
} from "./rules";
import {
  NotificationTemplateMissing,
  type NotificationRenderer,
  notificationTemplate,
  type ReviewInviteRenderInput,
} from "./templates";

/** The florist templates that carry a one-tap link (§5.2: offer, reminder, confirmed, photo). */
const LINKED_TEMPLATES: ReadonlySet<NotificationTemplateKey> = new Set([
  "offer",
  "offer-reminder",
  "order-confirmed",
  "photo-reminder",
]);

/** The mail tag of each audience (`mailer.ts`'s closed registry). */
const TAG_OF: Readonly<Record<NotificationAudience, MailTag>> = {
  buyer: "order_buyer",
  florist: "order_florist",
  ops: "ops_alert",
};

/** The flag that holds every message (spec 016 §12). */
export const NOTIFICATIONS_FLAG = "notifications.email" as const;

/** Thrown by the job entry while `notifications.email` is off: pg-boss retries the job. */
export class NotificationsHeld extends Error {
  readonly code = "NOTIFICATIONS_HELD";

  constructor() {
    super("NOTIFICATIONS_HELD: notifications.email is off");
    this.name = "NotificationsHeld";
  }
}

/** A message whose recipient cannot be resolved (no buyer address on the order). Retried. */
export class NotificationRecipientMissing extends Error {
  readonly code = "RECIPIENT_MISSING";

  constructor(what: string) {
    super(`RECIPIENT_MISSING: ${what}`);
    this.name = "NotificationRecipientMissing";
  }
}

/** The seams of the pipeline. Every one has the production default. */
export interface NotificationDeps {
  readonly mailer?: () => Mailer;
  /** `notification_delivery.provider`: which mailer sent. */
  readonly provider?: () => "resend" | "capture";
  readonly template?: (
    key: NotificationTemplateKey,
  ) => NotificationRenderer | undefined;
  /** spec 012's `createSignInLink` on the florist surface; null when no link can be minted. */
  readonly signInLink?: (
    userId: string,
    callbackPath: string,
  ) => Promise<string | null>;
  readonly opsAddress?: () => string;
  readonly siteOrigin?: () => string;
  /** Whether `notifications.email` is on (the job entry's hold). */
  readonly emailEnabled?: () => Promise<boolean>;
  /** The clock a template reads (B1's bounded wait for the invoice, TASK-334). */
  readonly now?: () => Date;
  readonly log?: Logger;
}

export interface ResolvedDeps {
  readonly mailer: () => Mailer;
  readonly provider: () => "resend" | "capture";
  readonly template: (
    key: NotificationTemplateKey,
  ) => NotificationRenderer | undefined;
  readonly signInLink: (
    userId: string,
    callbackPath: string,
  ) => Promise<string | null>;
  readonly opsAddress: () => string;
  readonly siteOrigin: () => string;
  readonly emailEnabled: () => Promise<boolean>;
  readonly now: () => Date;
  readonly log: Logger;
}

/**
 * The deps the process registered (`registerNotificationsOutbox`, in the worker): the florist
 * surface's `createSignInLink` among them. Kept out of this module's imports so no page that
 * reaches the notifications barrel pulls the florist sign-in surface in. Without a registered
 * minter a florist email carries the plain inbox address (no token).
 */
let processDeps: NotificationDeps = {};

const noLink = (): Promise<string | null> => Promise.resolve(null);

export function resolveDeps(input: NotificationDeps): ResolvedDeps {
  const deps: NotificationDeps = { ...processDeps, ...input };
  return {
    mailer: deps.mailer ?? getMailer,
    provider: deps.provider ?? (() => mailerConfig(process.env).kind),
    template: deps.template ?? notificationTemplate,
    signInLink: deps.signInLink ?? noLink,
    opsAddress: deps.opsAddress ?? (() => opsAlertEmail(process.env)),
    siteOrigin:
      deps.siteOrigin ??
      (() => process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000"),
    emailEnabled: deps.emailEnabled ?? (() => isEnabled(NOTIFICATIONS_FLAG)),
    now: deps.now ?? (() => new Date()),
    log: deps.log ?? defaultLogger,
  };
}

/** One trigger to handle. */
export interface NotificationRequest {
  readonly trigger: NotificationTrigger;
  readonly fromStatus: string | null;
  readonly mode: OrderMode;
  readonly orderId: string;
  /** `outbox:{id}` or `job:{name}:{id}`; B1 replaces it with `purchase:{id}`. */
  readonly sourceKey: string;
  /** The order event behind an outbox delivery (its payload and time name the assignment). */
  readonly eventId: string | null;
  /** A job's assignment (V2, V5). */
  readonly assignmentId: string | null;
  /** B8's document (TASK-334). */
  readonly invoiceId: string | null;
  /**
   * An outbox delivery's next due time if it throws now (`OutboxHandlerContext.retryDueAt`), for
   * B1's bounded wait; absent for a job.
   */
  readonly retryDueAt?: Date | null;
}

const OrderFactsRow = z.object({
  mode: z.enum(ORDER_MODES),
  locale_code: z.string().min(1),
  purchase_id: z.uuid().nullable(),
  purchase_locale: z.string().min(1).nullable(),
  buyer_email: z.string().nullable(),
});
export type OrderFacts = z.infer<typeof OrderFactsRow>;

const EventRow = z.object({
  payload: z.unknown(),
  occurred_at: z.coerce.date(),
});

const PayloadAssignment = z.object({ assignmentId: z.uuid() });

const AssignmentRow = z.object({
  id: z.uuid(),
  partner_id: z.uuid(),
  notification_channel: z.enum(["email", "whatsapp"]),
});
export type Assignment = z.infer<typeof AssignmentRow>;

const MemberRow = z.object({
  user_id: z.uuid(),
  email: z.email(),
  locale_code: z.string().min(1),
});

const DeliveryRow = z.object({ id: z.uuid(), status: z.string() });

/** One message to one recipient. */
export interface Recipient {
  readonly rule: NotificationRule;
  readonly ref: string;
  readonly address: string;
  readonly locale: string;
  readonly sourceKey: string;
  readonly orderId: string | null;
  readonly purchaseId: string | null;
  readonly assignment: Assignment | null;
}

export async function orderFacts(
  executor: OrderExecutor,
  orderId: string,
): Promise<OrderFacts> {
  const [row] = await executor.execute(sql`
    SELECT o.mode, o.locale_code, o.purchase_id, p.locale_code AS purchase_locale,
           o.buyer_snapshot ->> 'email' AS buyer_email
    FROM "order" o LEFT JOIN purchase p ON p.id = o.purchase_id
    WHERE o.id = ${orderId}`);
  if (row === undefined) {
    throw new NotificationRecipientMissing("the order does not exist");
  }
  return OrderFactsRow.parse(row);
}

const ASSIGNMENT_COLUMNS = sql`a.id, a.partner_id, p.notification_channel`;

/**
 * The assignment a florist or W row is about, read at send time:
 *  - `assignment.offered` and a job: the one its payload names;
 *  - `assignment.timed_out`: its payload's, else the latest timed-out assignment;
 *  - `order.captured` from `accepted` (V3): the accepted assignment;
 *  - a withdrawal event: the open or accepted assignment the event stopped, i.e. one not
 *    withdrawn before the event (the routing handler may set `withdrawn_at` before or after this
 *    delivery runs; an assignment withdrawn by an earlier event is not told twice).
 */
export async function assignmentFor(
  executor: OrderExecutor,
  request: NotificationRequest,
): Promise<Assignment | null> {
  const event =
    request.eventId === null
      ? undefined
      : EventRow.parse(
          (
            await executor.execute(sql`
              SELECT payload, occurred_at FROM order_event WHERE id = ${request.eventId}`)
          )[0],
        );
  const named =
    request.assignmentId ??
    (event === undefined
      ? null
      : (PayloadAssignment.safeParse(event.payload).data?.assignmentId ??
        null));
  let rows: readonly unknown[];
  if (named !== null) {
    rows = await executor.execute(sql`
      SELECT ${ASSIGNMENT_COLUMNS}
      FROM order_assignment a JOIN fulfillment_partner p ON p.id = a.partner_id
      WHERE a.id = ${named} AND a.order_id = ${request.orderId}`);
  } else if (request.trigger === "assignment.timed_out") {
    rows = await executor.execute(sql`
      SELECT ${ASSIGNMENT_COLUMNS}
      FROM order_assignment a JOIN fulfillment_partner p ON p.id = a.partner_id
      WHERE a.order_id = ${request.orderId} AND a.response = 'timeout'
      ORDER BY a.attempt DESC LIMIT 1`);
  } else if (request.trigger === "order.captured") {
    rows = await executor.execute(sql`
      SELECT ${ASSIGNMENT_COLUMNS}
      FROM order_assignment a JOIN fulfillment_partner p ON p.id = a.partner_id
      WHERE a.order_id = ${request.orderId} AND a.response = 'accept'
      ORDER BY a.attempt DESC LIMIT 1`);
  } else {
    const at = event?.occurred_at ?? null;
    rows = await executor.execute(sql`
      SELECT ${ASSIGNMENT_COLUMNS}
      FROM order_assignment a JOIN fulfillment_partner p ON p.id = a.partner_id
      WHERE a.order_id = ${request.orderId}
        AND (a.response IS NULL OR a.response = 'accept')
        AND (a.withdrawn_at IS NULL
             OR (${at?.toISOString() ?? null}::timestamptz IS NOT NULL
                 AND a.withdrawn_at >= ${at?.toISOString() ?? null}::timestamptz))
      ORDER BY a.attempt DESC LIMIT 1`);
  }
  const [row] = rows;
  return row === undefined ? null : AssignmentRow.parse(row);
}

async function membersOf(
  executor: OrderExecutor,
  partnerId: string,
): Promise<z.infer<typeof MemberRow>[]> {
  const rows = await executor.execute(sql`
    SELECT m.user_id, u.email, m.locale_code
    FROM partner_member m JOIN users u ON u.id = m.user_id
    WHERE m.partner_id = ${partnerId}
    ORDER BY m.created_at, m.user_id`);
  return rows.map((row) => MemberRow.parse(row));
}

/** The language of the florist's earliest owner member (W, §5.2), else `en`. */
async function ownerLanguage(
  executor: OrderExecutor,
  partnerId: string,
): Promise<string> {
  const [row] = await executor.execute(sql`
    SELECT locale_code FROM partner_member
    WHERE partner_id = ${partnerId} AND role = 'owner'
    ORDER BY created_at, user_id LIMIT 1`);
  return (
    z.object({ locale_code: z.string().min(1) }).safeParse(row).data
      ?.locale_code ?? "en"
  );
}

/** Every recipient of every row, resolved now. */
async function recipientsOf(
  executor: OrderExecutor,
  request: NotificationRequest,
  rules: readonly NotificationRule[],
  facts: OrderFacts,
  deps: ResolvedDeps,
): Promise<Recipient[]> {
  let assignment: Assignment | null | undefined;
  const assignmentOnce = async (): Promise<Assignment | null> =>
    (assignment ??= await assignmentFor(executor, request));
  const recipients: Recipient[] = [];
  for (const rule of rules) {
    const base = {
      rule,
      sourceKey: request.sourceKey,
      orderId: request.orderId,
      purchaseId: null,
      assignment: null,
    };
    if (rule.audience === "buyer") {
      const address = z.email().safeParse(facts.buyer_email);
      if (!address.success) {
        throw new NotificationRecipientMissing(
          "the order has no buyer address",
        );
      }
      if (rule.template === "order-received") {
        // One B1 per purchase (§14 A-founder-2026-10-22): the purchase is the source.
        if (facts.purchase_id === null) {
          throw new NotificationRecipientMissing("the order has no purchase");
        }
        recipients.push({
          ...base,
          ref: "buyer",
          address: address.data,
          locale: facts.purchase_locale ?? facts.locale_code,
          sourceKey: `purchase:${facts.purchase_id}`,
          orderId: null,
          purchaseId: facts.purchase_id,
        });
      } else {
        recipients.push({
          ...base,
          ref: "buyer",
          address: address.data,
          locale: facts.locale_code,
        });
      }
      continue;
    }
    if (rule.audience === "florist") {
      const found = await assignmentOnce();
      if (found === null) continue;
      for (const member of await membersOf(executor, found.partner_id)) {
        recipients.push({
          ...base,
          ref: member.user_id,
          address: member.email,
          locale: member.locale_code,
          assignment: found,
        });
      }
      continue;
    }
    if (rule.whatsappCopyOf !== undefined) {
      const found = await assignmentOnce();
      if (found === null || found.notification_channel !== "whatsapp") continue;
      recipients.push({
        ...base,
        ref: "ops",
        address: deps.opsAddress(),
        locale: await ownerLanguage(executor, found.partner_id),
        assignment: found,
      });
      continue;
    }
    recipients.push({
      ...base,
      ref: "ops",
      address: deps.opsAddress(),
      locale: "en",
    });
  }
  return recipients;
}

/** Inserts the row `queued`, or finds the existing one; either way locked. */
async function claimDelivery(
  executor: OrderExecutor,
  recipient: Recipient,
  provider: "resend" | "capture",
): Promise<z.infer<typeof DeliveryRow>> {
  await executor.execute(sql`
    INSERT INTO notification_delivery (source_key, order_id, purchase_id, template_key, audience,
                                       recipient_ref, locale_code, provider, status, status_at)
    VALUES (${recipient.sourceKey}, ${recipient.orderId}, ${recipient.purchaseId},
            ${recipient.rule.template}, ${recipient.rule.audience}, ${recipient.ref},
            ${recipient.locale}, ${provider}, 'queued', now())
    ON CONFLICT (source_key, template_key, recipient_ref) DO NOTHING`);
  const [row] = await executor.execute(sql`
    SELECT id, status FROM notification_delivery
    WHERE source_key = ${recipient.sourceKey} AND template_key = ${recipient.rule.template}
      AND recipient_ref = ${recipient.ref}
    FOR UPDATE`);
  return DeliveryRow.parse(row);
}

/** Sends one recipient's message under its idempotency key, and records the outcome. */
/** What one send needs of its trigger; F2 has no order, so `orderId` may be null here. */
export type SendRequest = Pick<
  NotificationRequest,
  "trigger" | "fromStatus" | "invoiceId" | "retryDueAt"
> & {
  readonly orderId: string | null;
  readonly jobId?: string | null;
  /** Spec 030a's statement: the payout the template reads. */
  readonly payoutId?: string | null;
  /**
   * The files to attach, made only when the row is `queued` (a skipped repeat makes none): spec
   * 030a's statement PDF, rendered and stored in the same transaction as the send.
   */
  readonly attachments?: () => Promise<readonly MailAttachment[]>;
  /** B9 (spec 022a, TASK-370): the review link and the snippet's switch, for the template. */
  readonly reviewInvite?: ReviewInviteRenderInput;
  /** B9 only: Trustpilot's AFS address from env; no other message carries a BCC. */
  readonly bcc?: string;
};

export async function sendOne(
  executor: OrderExecutor,
  request: SendRequest,
  recipient: Recipient,
  deps: ResolvedDeps,
): Promise<"sent" | "skipped"> {
  const { rule } = recipient;
  const delivery = await claimDelivery(executor, recipient, deps.provider());
  const fields = {
    order_id: request.orderId,
    template_key: rule.template,
    audience: rule.audience,
    source_key: recipient.sourceKey,
    delivery_id: delivery.id,
  };
  if (delivery.status !== "queued") {
    deps.log.info({ ...fields, outcome: "skipped" }, "notification.skipped");
    return "skipped";
  }
  const renderer = deps.template(rule.template);
  if (renderer === undefined)
    throw new NotificationTemplateMissing(rule.template);
  const assignment = recipient.assignment;
  const inboxPath =
    assignment === null ? null : FLORIST_PATHS.order(assignment.id);
  const inboxUrl =
    inboxPath === null
      ? null
      : new URL(inboxPath, deps.siteOrigin()).toString();
  let link: string | null = null;
  if (
    rule.audience === "florist" &&
    LINKED_TEMPLATES.has(rule.template) &&
    inboxPath !== null
  ) {
    link = (await deps.signInLink(recipient.ref, inboxPath)) ?? inboxUrl;
  }
  const rendered = await renderer({
    template: rule.template,
    audience: rule.audience,
    locale: recipient.locale,
    trigger: request.trigger,
    fromStatus: request.fromStatus,
    orderId: recipient.orderId,
    purchaseId: recipient.purchaseId,
    assignmentId: assignment?.id ?? null,
    partnerId: assignment?.partner_id ?? null,
    invoiceId: request.invoiceId,
    jobId: request.jobId ?? null,
    payoutId: request.payoutId ?? null,
    ...(request.reviewInvite === undefined
      ? {}
      : { reviewInvite: request.reviewInvite }),
    link,
    inboxUrl: rule.whatsappCopyOf === undefined ? null : inboxUrl,
    whatsappCopyOf: rule.whatsappCopyOf ?? null,
    executor,
    now: deps.now(),
    ...(request.retryDueAt === undefined
      ? {}
      : { retryDueAt: request.retryDueAt }),
  });
  // The template's own files (spec 016's B1, B4, B8; TASK-333), then the request's (spec 030a's
  // statement PDF, made only now that the row is `queued`).
  const attachments = [
    ...(rendered.attachments ?? []),
    ...(request.attachments === undefined ? [] : await request.attachments()),
  ];
  let providerRef: string | null;
  try {
    providerRef = (
      await deps.mailer().send({
        tag: TAG_OF[rule.audience],
        to: recipient.address,
        ...(request.bcc === undefined ? {} : { bcc: request.bcc }),
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        idempotencyKey: `${recipient.sourceKey}:${rule.template}:${recipient.ref}`,
        ...(attachments.length === 0 ? {} : { attachments: [...attachments] }),
      })
    ).providerRef;
  } catch (error) {
    if (
      error instanceof MailerError &&
      error.code === "invalid_idempotent_request"
    ) {
      // The key was used with another body inside Resend's window: the first send was accepted.
      providerRef = null;
    } else {
      deps.log.warn(
        {
          ...fields,
          outcome: "failed",
          error_class: error instanceof Error ? error.name : "Error",
          error_code:
            error instanceof MailerError ? (error.code ?? "none") : "none",
        },
        "notification.failed",
      );
      throw error;
    }
  }
  await executor.execute(sql`
    UPDATE notification_delivery
    SET status = 'sent', provider_message_id = ${providerRef}, status_at = now()
    WHERE id = ${delivery.id}`);
  // B1's invoices (TASK-334): one row per invoice this send carried, so B8 sends nothing for it.
  // Not on Resend's 409 `invalid_idempotent_request`: the accepted first send had another body,
  // which may not have carried them, so B8 sends them rather than the buyer never getting one.
  const carried = providerRef === null ? [] : (rendered.invoiceIds ?? []);
  for (const invoiceId of carried) {
    await executor.execute(sql`
      INSERT INTO notification_delivery_invoice (notification_delivery_id, invoice_id)
      VALUES (${delivery.id}, ${z.uuid().parse(invoiceId)})
      ON CONFLICT DO NOTHING`);
  }
  deps.log.info(
    {
      ...fields,
      outcome: providerRef === null ? "already_accepted" : "sent",
      provider_message_id: providerRef,
      ...(carried.length === 0 ? {} : { invoices: carried.length }),
    },
    "notification.sent",
  );
  return "sent";
}

/**
 * Handles one trigger: every row, every recipient, in `executor`'s transaction. Returns how many
 * messages were sent and skipped (counts only).
 */
export async function deliverNotifications(
  executor: OrderExecutor,
  request: NotificationRequest,
  deps: NotificationDeps = {},
): Promise<{ readonly sent: number; readonly skipped: number }> {
  const rules = notificationsFor(
    request.trigger,
    request.fromStatus,
    request.mode,
  );
  if (rules.length === 0) return { sent: 0, skipped: 0 };
  const resolved = resolveDeps(deps);
  const facts = await orderFacts(executor, request.orderId);
  if (facts.mode !== request.mode) {
    throw new Error(
      "NOTIFICATION_MODE_MISMATCH: the event's mode is not the order's",
    );
  }
  const recipients = await recipientsOf(
    executor,
    request,
    rules,
    facts,
    resolved,
  );
  let sent = 0;
  let skipped = 0;
  for (const recipient of recipients) {
    if ((await sendOne(executor, request, recipient, resolved)) === "sent") {
      sent += 1;
    } else {
      skipped += 1;
    }
  }
  return { sent, skipped };
}

/** The `notifications` outbox handler: the delivery's event, keyed by its outbox row. */
export function notificationsOutboxHandler(
  deps: NotificationDeps = {},
): OutboxHandler {
  return async (event, context) => {
    await deliverNotifications(
      context.executor,
      {
        trigger: event.type,
        fromStatus: event.fromStatus,
        mode: event.mode,
        orderId: event.orderId,
        sourceKey: `outbox:${context.outboxId}`,
        eventId: event.eventId,
        assignmentId: null,
        invoiceId: null,
        ...(context.retryDueAt === undefined
          ? {}
          : { retryDueAt: context.retryDueAt }),
      },
      deps,
    );
  };
}

/** What a job hands the pipeline (V2 and V5 from TASK-328's jobs, B8 from TASK-334's). */
export const NotificationJobInputSchema = z
  .object({
    job: z.enum([
      "assignment.remind",
      "assignment.photo_remind",
      "invoice.email",
      "payouts.prepaid_ready",
      "payouts.watch",
    ]),
    jobId: z.string().min(1).max(128),
    orderId: z.uuid(),
    assignmentId: z.uuid().nullable().default(null),
    invoiceId: z.uuid().nullable().default(null),
  })
  .strict();
export type NotificationJobInput = z.input<typeof NotificationJobInputSchema>;

/**
 * The job entry: `job:{name}:{jobId}` as the source key; held (throws `NOTIFICATIONS_HELD`, the
 * job retries) while `notifications.email` is off. Whether the job should send at all (still
 * unanswered, still delivered without a photo) is the job's question, asked before this call.
 */
export async function sendJobNotifications(
  executor: OrderExecutor,
  input: NotificationJobInput,
  deps: NotificationDeps = {},
): Promise<{ readonly sent: number; readonly skipped: number }> {
  const parsed = NotificationJobInputSchema.parse(input);
  const resolved = resolveDeps(deps);
  if (!(await resolved.emailEnabled())) throw new NotificationsHeld();
  const facts = await orderFacts(executor, parsed.orderId);
  const job: NotificationJob = parsed.job;
  return deliverNotifications(
    executor,
    {
      trigger: job,
      fromStatus: null,
      mode: facts.mode,
      orderId: parsed.orderId,
      sourceKey: `job:${parsed.job}:${parsed.jobId}`,
      eventId: null,
      assignmentId: parsed.assignmentId,
      invoiceId: parsed.invoiceId,
    },
    deps,
  );
}

/**
 * An ops message about no order (spec 030a's F2, TASK-364): `job:{name}:{jobId}` as the source
 * key, `order_id` null on the delivery row (`notification_delivery_owner_check` admits it), the
 * founder's address in `en`. Held (throws `NOTIFICATIONS_HELD`) while `notifications.email` is
 * off; a second call with the same key sends nothing.
 */
export const OpsJobNotificationInputSchema = z
  .object({
    job: z.enum(["payouts.close", "partners.contract_reminders"]),
    jobId: z.string().min(1).max(128),
    /**
     * The one ops template to send when the job has several (spec 030b's `partners.contract_reminders`
     * chooses `contract-review-due` or `contract-review-passed`); every ops row of the job when absent.
     */
    template: z.enum(NOTIFICATION_TEMPLATE_KEYS).optional(),
  })
  .strict();
export type OpsJobNotificationInput = z.input<
  typeof OpsJobNotificationInputSchema
>;

export async function sendOpsJobNotification(
  executor: OrderExecutor,
  input: OpsJobNotificationInput,
  deps: NotificationDeps = {},
): Promise<{ readonly sent: number; readonly skipped: number }> {
  const parsed = OpsJobNotificationInputSchema.parse(input);
  const resolved = resolveDeps(deps);
  if (!(await resolved.emailEnabled())) throw new NotificationsHeld();
  const job: NotificationJob = parsed.job;
  const rules = notificationsFor(job, null, "live").filter(
    (rule) =>
      rule.audience === "ops" &&
      (parsed.template === undefined || rule.template === parsed.template),
  );
  const sourceKey = `job:${parsed.job}:${parsed.jobId}`;
  let sent = 0;
  let skipped = 0;
  for (const rule of rules) {
    const outcome = await sendOne(
      executor,
      {
        trigger: job,
        fromStatus: null,
        invoiceId: null,
        orderId: null,
        jobId: parsed.jobId,
      },
      {
        rule,
        ref: "ops",
        address: resolved.opsAddress(),
        locale: "en",
        sourceKey,
        orderId: null,
        purchaseId: null,
        assignment: null,
      },
      resolved,
    );
    if (outcome === "sent") sent += 1;
    else skipped += 1;
  }
  return { sent, skipped };
}

/**
 * The florist's payout statement (spec 030a §5.2 `payouts.statement_email`, AC-21; TASK-365):
 * one message to the florist's business address (`fulfillment_partner.contact_email`, resolved by
 * the caller, never stored), keyed `job:payouts.statement_email:{payoutId}` with `recipient_ref` =
 * the florist's id and `order_id` null, so a re-run of the job finds the row `sent` and sends
 * nothing more. `attachments` runs only when the row is `queued`. Held (throws
 * `NOTIFICATIONS_HELD`) while `notifications.email` is off.
 */
export const PayoutStatementNotificationInputSchema = z
  .object({
    payoutId: z.uuid(),
    partnerId: z.uuid(),
    address: z.email(),
    locale: z.string().min(2).max(16),
  })
  .strict();
export type PayoutStatementNotificationInput = z.input<
  typeof PayoutStatementNotificationInputSchema
>;

export async function sendPayoutStatementNotification(
  executor: OrderExecutor,
  input: PayoutStatementNotificationInput,
  attachments: () => Promise<readonly MailAttachment[]>,
  deps: NotificationDeps = {},
): Promise<"sent" | "skipped"> {
  const parsed = PayoutStatementNotificationInputSchema.parse(input);
  const resolved = resolveDeps(deps);
  if (!(await resolved.emailEnabled())) throw new NotificationsHeld();
  const job: NotificationJob = "payouts.statement_email";
  const [rule] = notificationsFor(job, null, "live");
  if (rule === undefined) return "skipped";
  return sendOne(
    executor,
    {
      trigger: job,
      fromStatus: null,
      invoiceId: null,
      orderId: null,
      jobId: parsed.payoutId,
      payoutId: parsed.payoutId,
      attachments,
    },
    {
      rule,
      ref: parsed.partnerId,
      address: parsed.address,
      locale: parsed.locale,
      sourceKey: `job:${job}:${parsed.payoutId}`,
      orderId: null,
      purchaseId: null,
      assignment: null,
    },
    resolved,
  );
}

/**
 * B9 `review-invite` (spec 022a §5.2, AC-7, AC-10; TASK-370): one message to the order's buyer at
 * `order.buyer_snapshot`'s address (resolved now, never stored), in `order.locale_code`, keyed
 * `job:review.request:{inviteId}` with `recipient_ref` = `buyer`, so a re-run finds the row `sent`
 * and sends nothing more. `live` only (the rule's modes). The link is built from the token handed
 * in, which is deterministic, so a retried send renders a byte-identical body. `bcc` is
 * Trustpilot's address from env, or absent. Held (throws `NOTIFICATIONS_HELD`) while
 * `notifications.email` is off. The input has no rating field (AC-10).
 */
export const ReviewInviteNotificationInputSchema = z
  .object({
    inviteId: z.uuid(),
    orderId: z.uuid(),
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    bcc: z.email().optional(),
  })
  .strict();
export type ReviewInviteNotificationInput = z.input<
  typeof ReviewInviteNotificationInputSchema
>;

export async function sendReviewInviteNotification(
  executor: OrderExecutor,
  input: ReviewInviteNotificationInput,
  deps: NotificationDeps = {},
): Promise<"sent" | "skipped"> {
  const parsed = ReviewInviteNotificationInputSchema.parse(input);
  const resolved = resolveDeps(deps);
  if (!(await resolved.emailEnabled())) throw new NotificationsHeld();
  const facts = await orderFacts(executor, parsed.orderId);
  const job: NotificationJob = "review.request";
  const [rule] = notificationsFor(job, null, facts.mode);
  if (rule === undefined) return "skipped";
  if (facts.buyer_email === null) {
    throw new NotificationRecipientMissing("the order has no buyer address");
  }
  const reviewUrl = new URL(
    `/${facts.locale_code}/review/${parsed.token}`,
    resolved.siteOrigin(),
  ).toString();
  return sendOne(
    executor,
    {
      trigger: job,
      fromStatus: null,
      invoiceId: null,
      orderId: parsed.orderId,
      jobId: parsed.inviteId,
      reviewInvite: { reviewUrl, trustpilot: parsed.bcc !== undefined },
      ...(parsed.bcc === undefined ? {} : { bcc: parsed.bcc }),
    },
    {
      rule,
      ref: "buyer",
      address: facts.buyer_email,
      locale: facts.locale_code,
      sourceKey: `job:${job}:${parsed.inviteId}`,
      orderId: parsed.orderId,
      purchaseId: null,
      assignment: null,
    },
    resolved,
  );
}

/**
 * Registers the handler and its hold with the dispatcher, once per process (the worker's
 * `src/jobs/handlers.ts`, which passes the florist surface's link minter; the job entry uses the
 * same deps): while `notifications.email` is off every `notifications` delivery stays
 * `pending`, and the first dispatch after it is turned on sends them all, once each (AC-26).
 */
export function registerNotificationsOutbox(deps: NotificationDeps = {}): void {
  processDeps = deps;
  const resolved = resolveDeps(deps);
  registerOutboxHandler("notifications", notificationsOutboxHandler(deps));
  registerOutboxHold(
    "notifications",
    async () => !(await resolved.emailEnabled()),
  );
}
