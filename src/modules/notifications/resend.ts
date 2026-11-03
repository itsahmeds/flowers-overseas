/**
 * Resend an email from the admin order page (spec 020a §2.5, §5.2 "Resend" and request 2 on spec
 * 016's pipeline; AC-24 to AC-26; TASK-360).
 *
 *  - `RESEND_RULES` is §5.2's resend table as data: the templates an admin may resend and the
 *    condition each needs **now**. A template not in it (V2, V5, A1, W, spec 030a's F1 to F3 and
 *    the payout statement) is never resent.
 *  - `resendDecision(facts)` answers one delivery row: resendable, or the one cause it is not (the
 *    admin page's reason line, TASK-361). It reads facts only, so the unit suite runs every table
 *    row with its condition true and false.
 *  - `resendableDeliveries(executor, orderId, options)` lists every `notification_delivery` row of
 *    the order (its own rows and its purchase's B1) oldest first, with template, audience, status
 *    and time, the florist's name for a florist row, and the decision. Never an address: the row
 *    has none (`recipient_ref` is `buyer`, `ops` or a user id) and no address is read here.
 *  - `resendNotification(executor, input, deps)` runs inside `runOrderAction`'s transaction, under
 *    the order lock: it checks the decision again (a forged or stale form is `RESEND_NOT_ALLOWED`,
 *    a fourth resend of one template to one recipient on one order in 24 hours is
 *    `RESEND_RATE_LIMITED`; either writes nothing), then inserts one `queued` row with `source_key =
 *    admin:{actionId}`, the original's template, audience and recipient, and `resend_of` = the
 *    original's id. The caller enqueues `notifications.resend` after the commit.
 *  - `runResendNotificationJob(deliveryId, deps)` is the job: held (throws `NOTIFICATIONS_HELD`, the
 *    row stays `queued`) while `notifications.email` is off; otherwise it resolves the address and
 *    locale **now**, rebuilds the original's context (the event behind its outbox row, its
 *    purchase for B1, its job for B8) by following `resend_of` to the first row, and sends through
 *    spec 016's one path (`sendOne`): a freshly minted one-tap link for a florist template, the
 *    idempotency key `admin:{actionId}:{template_key}:{recipient_ref}`, the 409 rule.
 *
 * The rate limit counts `admin_order_action` rows of kind `resend` on this order whose resent row
 * has the same template and recipient, in the 24 hours before now. `runOrderAction` holds the
 * order lock, so two resends of one email count each other.
 *
 * Logs carry ids, the template key and the audience only: never an address, a link or a token.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  ORDER_MODES,
  type OrderExecutor,
  type OrderMode,
  withExecutor,
} from "@/modules/orders";

import {
  type Assignment,
  type NotificationDeps,
  NotificationRecipientMissing,
  NotificationsHeld,
  orderFacts,
  type Recipient,
  assignmentFor,
  resolveDeps,
  sendOne,
} from "./pipeline";
import {
  NOTIFICATION_JOBS,
  NOTIFICATION_RULES,
  type NotificationAudience,
  type NotificationRule,
  type NotificationTemplateKey,
  type NotificationTrigger,
} from "./rules";

/** What must hold now for a template to be resent (spec 020a §5.2's resend table). */
export const RESEND_CONDITIONS = [
  /** Always, once the row has left us. */
  "sent",
  /** The order's buyer projection is `being_made`. */
  "being_made",
  /** The buyer projection is `on_its_way`. */
  "on_its_way",
  /** The order is `cancelled` or `cancelled_refunded`. */
  "order_cancelled",
  /** The assignment is unanswered, not withdrawn, and its `sla_expires_at` is in the future. */
  "offer_open",
  /** The assignment is accepted, not withdrawn, and the order is not yet delivered. */
  "accepted_undelivered",
  /** The assignment is withdrawn or timed out and the delivery date has not passed there. */
  "withdrawn_before_date",
] as const;
export type ResendCondition = (typeof RESEND_CONDITIONS)[number];

export interface ResendRule {
  readonly code: string;
  readonly audience: Exclude<NotificationAudience, "ops">;
  readonly condition: ResendCondition;
}

/** Spec 020a §5.2's resend table. Every template not listed is never resent. */
export const RESEND_RULES: Readonly<
  Partial<Record<NotificationTemplateKey, ResendRule>>
> = Object.freeze({
  "order-received": { code: "B1", audience: "buyer", condition: "sent" },
  "being-made": { code: "B2", audience: "buyer", condition: "being_made" },
  "out-for-delivery": {
    code: "B3",
    audience: "buyer",
    condition: "on_its_way",
  },
  "delivered-photo": { code: "B4", audience: "buyer", condition: "sent" },
  cancelled: { code: "B5", audience: "buyer", condition: "order_cancelled" },
  refund: { code: "B6", audience: "buyer", condition: "sent" },
  "credit-note": { code: "B8", audience: "buyer", condition: "sent" },
  offer: { code: "V1", audience: "florist", condition: "offer_open" },
  "order-confirmed": {
    code: "V3",
    audience: "florist",
    condition: "accepted_undelivered",
  },
  "offer-withdrawn": {
    code: "V4",
    audience: "florist",
    condition: "withdrawn_before_date",
  },
});

/** The reminders (V2, V5): never resent. Every other unlisted template is the founder's own. */
const REMINDER_TEMPLATES: readonly string[] = [
  "offer-reminder",
  "photo-reminder",
];

/** At most this many resends of one template to one recipient on one order (§13 Q4)… */
export const RESEND_LIMIT = 3;
/** …within this many hours. */
export const RESEND_WINDOW_HOURS = 24;

/** Why a row offers no "Resend" now: one admin reason line each (TASK-361). */
export const RESEND_CAUSES = [
  "demo",
  "reminder",
  "own_alert",
  "test_order",
  "queued",
  "held",
  "context_missing",
  "not_being_made",
  "not_on_its_way",
  "not_cancelled",
  "answered",
  "timed_out",
  "withdrawn",
  "not_accepted",
  "delivered",
  "not_withdrawn",
  "date_passed",
  "recipient_gone",
  "rate_limited",
] as const;
export type ResendCause = (typeof RESEND_CAUSES)[number];

export type ResendVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly cause: ResendCause };

/** The assignment a florist row is about, as the decision needs it. */
export interface ResendAssignmentFacts {
  readonly response: "accept" | "decline" | "timeout" | null;
  readonly withdrawn: boolean;
  /** `sla_expires_at` is after now. */
  readonly slaOpen: boolean;
  /** The row's recipient is still a member of the assignment's florist. */
  readonly memberPresent: boolean;
}

/** Everything `resendDecision` reads about one row, its order and now. */
export interface ResendFacts {
  readonly template: string;
  readonly audience: string;
  /** The row's own status (`queued` until it has left us). */
  readonly rowStatus: string;
  readonly mode: OrderMode;
  /** Whether `notifications.email` is on. */
  readonly emailEnabled: boolean;
  /** `order_status.buyer_projection` of the order's status. */
  readonly projection: string;
  readonly orderStatus: string;
  /** Whether the original's context (its event, purchase or job) could be read. */
  readonly contextKnown: boolean;
  /** A florist row's assignment, or null (a buyer row, or none found). */
  readonly assignment: ResendAssignmentFacts | null;
  /** The delivery date is before today in the destination's zone. */
  readonly deliveryDatePassed: boolean;
  /** Resends of this template to this recipient on this order in the window. */
  readonly recentResends: number;
}

const NO = (cause: ResendCause): ResendVerdict => ({ allowed: false, cause });
const YES: ResendVerdict = { allowed: true };

/** Projections after the flowers arrived (`order_status.buyer_projection`). */
const DELIVERED_PROJECTIONS: readonly string[] = ["delivered", "closed"];
const CANCELLED_STATUSES: readonly string[] = [
  "cancelled",
  "cancelled_refunded",
];

function conditionVerdict(
  condition: ResendCondition,
  facts: ResendFacts,
): ResendVerdict {
  const a = facts.assignment;
  switch (condition) {
    case "sent":
      return YES;
    case "being_made":
      return facts.projection === "being_made" ? YES : NO("not_being_made");
    case "on_its_way":
      return facts.projection === "on_its_way" ? YES : NO("not_on_its_way");
    case "order_cancelled":
      return CANCELLED_STATUSES.includes(facts.orderStatus)
        ? YES
        : NO("not_cancelled");
    case "offer_open":
      if (a === null) return NO("context_missing");
      if (a.response === "accept" || a.response === "decline") {
        return NO("answered");
      }
      if (a.response === "timeout") return NO("timed_out");
      if (a.withdrawn) return NO("withdrawn");
      return a.slaOpen ? YES : NO("timed_out");
    case "accepted_undelivered":
      if (a === null) return NO("context_missing");
      if (a.response !== "accept") return NO("not_accepted");
      if (a.withdrawn) return NO("withdrawn");
      return DELIVERED_PROJECTIONS.includes(facts.projection)
        ? NO("delivered")
        : YES;
    case "withdrawn_before_date":
      if (a === null) return NO("context_missing");
      if (!a.withdrawn && a.response !== "timeout") return NO("not_withdrawn");
      return facts.deliveryDatePassed ? NO("date_passed") : YES;
  }
}

/**
 * Whether one delivery row may be resent now, or the first cause it may not, checked in this
 * order: a demo order; a template the table never resends; a buyer row of a `test` order; a row
 * still `queued` (held while `notifications.email` is off); an unreadable context; the table's
 * condition; a florist recipient no longer a member; the rate limit.
 */
export function resendDecision(facts: ResendFacts): ResendVerdict {
  if (facts.mode === "demo") return NO("demo");
  const rule = Object.hasOwn(RESEND_RULES, facts.template)
    ? RESEND_RULES[facts.template as NotificationTemplateKey]
    : undefined;
  if (rule === undefined || rule.audience !== facts.audience) {
    return NO(
      REMINDER_TEMPLATES.includes(facts.template) ? "reminder" : "own_alert",
    );
  }
  if (rule.audience === "buyer" && facts.mode !== "live") {
    return NO("test_order");
  }
  if (facts.rowStatus === "queued") {
    return NO(facts.emailEnabled ? "queued" : "held");
  }
  if (!facts.contextKnown) return NO("context_missing");
  const verdict = conditionVerdict(rule.condition, facts);
  if (!verdict.allowed) return verdict;
  if (rule.audience === "florist" && facts.assignment?.memberPresent !== true) {
    return NO("recipient_gone");
  }
  if (facts.recentResends >= RESEND_LIMIT) return NO("rate_limited");
  return YES;
}

/* -------------------------------------------------------------------------- */
/* Reading a row, its original's context and its facts                         */
/* -------------------------------------------------------------------------- */

const DeliveryRow = z.object({
  id: z.uuid(),
  source_key: z.string().min(1),
  template_key: z.string().min(1),
  audience: z.enum(["buyer", "florist", "ops"]),
  recipient_ref: z.string().min(1),
  status: z.string().min(1),
  status_at: z.date(),
  created_at: z.date(),
  resend_of: z.uuid().nullable(),
  order_id: z.uuid().nullable(),
  purchase_id: z.uuid().nullable(),
});
type DeliveryRow = z.infer<typeof DeliveryRow>;

const DELIVERY_COLUMNS = sql`d.id, d.source_key, d.template_key, d.audience, d.recipient_ref,
  d.status, d.status_at, d.created_at, d.resend_of, d.order_id, d.purchase_id`;

/** Timestamps arrive as `Date` from one driver and as text from another. */
function parseDeliveryRow(raw: unknown): DeliveryRow {
  const record = z.record(z.string(), z.unknown()).parse(raw);
  return DeliveryRow.parse({
    ...record,
    status_at: new Date(String(record["status_at"])),
    created_at: new Date(String(record["created_at"])),
  });
}

/** What the original send was rendered from, rebuilt from its first row's source key. */
export interface OriginalContext {
  readonly trigger: NotificationTrigger;
  readonly fromStatus: string | null;
  readonly eventId: string | null;
  readonly assignmentId: string | null;
  readonly invoiceId: string | null;
  readonly jobId: string | null;
}

const UUID = z.uuid();
const KNOWN_TRIGGERS: readonly NotificationTrigger[] = NOTIFICATION_RULES.map(
  (rule) => rule.trigger,
);

function triggerOf(value: string): NotificationTrigger | null {
  return KNOWN_TRIGGERS.find((trigger) => trigger === value) ?? null;
}

/** The first row of a resend chain (`resend_of` followed to its end). */
async function rootSourceKey(
  executor: OrderExecutor,
  deliveryId: string,
): Promise<{ id: string; sourceKey: string } | null> {
  const [row] = await executor.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT id, source_key, resend_of, 0 AS depth
      FROM notification_delivery WHERE id = ${deliveryId}
      UNION ALL
      SELECT d.id, d.source_key, d.resend_of, c.depth + 1
      FROM notification_delivery d JOIN chain c ON d.id = c.resend_of
      WHERE c.depth < 100
    )
    SELECT id, source_key FROM chain WHERE resend_of IS NULL LIMIT 1`);
  const parsed = z
    .object({ id: z.uuid(), source_key: z.string().min(1) })
    .safeParse(row);
  return parsed.success
    ? { id: parsed.data.id, sourceKey: parsed.data.source_key }
    : null;
}

/**
 * The original's context: `outbox:{id}` is the event behind that outbox row; `purchase:{id}` is
 * B1, written for `order.captured` from `placed`; `job:{name}:{id}` is that job (B8's document is
 * the invoice its row carried, else the job's own id when that is an invoice). Null when it cannot
 * be read: the row is then not resendable.
 */
export async function originalContext(
  executor: OrderExecutor,
  deliveryId: string,
): Promise<OriginalContext | null> {
  const root = await rootSourceKey(executor, deliveryId);
  if (root === null) return null;
  const [kind, first, ...rest] = root.sourceKey.split(":");
  if (kind === "outbox" && UUID.safeParse(first).success) {
    const [row] = await executor.execute(sql`
      SELECT e.id, e.type, e.from_status
      FROM outbox x JOIN order_event e ON e.id = x.event_id
      WHERE x.id = ${first ?? ""}`);
    const parsed = z
      .object({
        id: z.uuid(),
        type: z.string(),
        from_status: z.string().nullable(),
      })
      .safeParse(row);
    if (!parsed.success) return null;
    const trigger = triggerOf(parsed.data.type);
    if (trigger === null) return null;
    return {
      trigger,
      fromStatus: parsed.data.from_status,
      eventId: parsed.data.id,
      assignmentId: null,
      invoiceId: null,
      jobId: null,
    };
  }
  if (kind === "purchase" && UUID.safeParse(first).success) {
    return {
      trigger: "order.captured",
      fromStatus: "placed",
      eventId: null,
      assignmentId: null,
      invoiceId: null,
      jobId: null,
    };
  }
  const job = NOTIFICATION_JOBS.find((name) => name === first);
  if (kind === "job" && job !== undefined && rest.length > 0) {
    const jobId = rest.join(":");
    const [carried] = await executor.execute(sql`
      SELECT invoice_id FROM notification_delivery_invoice
      WHERE notification_delivery_id = ${root.id}
      ORDER BY created_at, invoice_id LIMIT 1`);
    const invoiceId =
      z.object({ invoice_id: z.uuid() }).safeParse(carried).data?.invoice_id ??
      (UUID.safeParse(jobId).success ? jobId : null);
    return {
      trigger: job,
      fromStatus: null,
      eventId: null,
      assignmentId: null,
      invoiceId: job === "invoice.email" ? invoiceId : null,
      jobId,
    };
  }
  return null;
}

const OrderRow = z.object({
  id: z.uuid(),
  mode: z.enum(ORDER_MODES),
  status: z.string().min(1),
  purchase_id: z.uuid().nullable(),
  buyer_projection: z.string().min(1),
  date_passed: z.boolean(),
});
type OrderRow = z.infer<typeof OrderRow>;

async function orderRow(
  executor: OrderExecutor,
  orderId: string,
  now: Date,
): Promise<OrderRow | null> {
  const [row] = await executor.execute(sql`
    SELECT o.id, o.mode, o.status, o.purchase_id, s.buyer_projection,
           (o.delivery_date <
              (${now.toISOString()}::timestamptz AT TIME ZONE coalesce(ci.iana_zone, c.iana_zone))::date
           ) AS date_passed
    FROM "order" o
    JOIN order_status s ON s.key = o.status
    JOIN country c ON c.id = o.destination_country_id
    LEFT JOIN city ci ON ci.id = o.destination_city_id
    WHERE o.id = ${orderId}`);
  return row === undefined ? null : OrderRow.parse(row);
}

const AssignmentFactsRow = z.object({
  response: z.enum(["accept", "decline", "timeout"]).nullable(),
  withdrawn: z.boolean(),
  sla_open: z.boolean(),
  member_present: z.boolean(),
  partner_name: z.string().nullable(),
});

/** The florist row's assignment, from the original's context, read now. */
async function floristAssignment(
  executor: OrderExecutor,
  order: OrderRow,
  row: DeliveryRow,
  context: OriginalContext,
  now: Date,
): Promise<{
  readonly assignment: Assignment;
  readonly facts: ResendAssignmentFacts;
  readonly partnerName: string | null;
} | null> {
  const assignment = await assignmentFor(executor, {
    trigger: context.trigger,
    fromStatus: context.fromStatus,
    mode: order.mode,
    orderId: order.id,
    sourceKey: row.source_key,
    eventId: context.eventId,
    assignmentId: context.assignmentId,
    invoiceId: context.invoiceId,
  });
  if (assignment === null) return null;
  const [raw] = await executor.execute(sql`
    SELECT a.response, a.withdrawn_at IS NOT NULL AS withdrawn,
           a.sla_expires_at > ${now.toISOString()}::timestamptz AS sla_open,
           EXISTS (SELECT 1 FROM partner_member m
                   WHERE m.partner_id = a.partner_id AND m.user_id::text = ${row.recipient_ref})
             AS member_present,
           fp.legal_name AS partner_name
    FROM order_assignment a JOIN fulfillment_partner fp ON fp.id = a.partner_id
    WHERE a.id = ${assignment.id}`);
  const parsed = AssignmentFactsRow.parse(raw);
  return {
    assignment,
    facts: {
      response: parsed.response,
      withdrawn: parsed.withdrawn,
      slaOpen: parsed.sla_open,
      memberPresent: parsed.member_present,
    },
    partnerName: parsed.partner_name,
  };
}

async function recentResends(
  executor: OrderExecutor,
  orderId: string,
  row: DeliveryRow,
  now: Date,
): Promise<number> {
  const [raw] = await executor.execute(sql`
    SELECT count(*)::int AS n
    FROM admin_order_action a
    JOIN notification_delivery d ON d.id = a.notification_delivery_id
    WHERE a.order_id = ${orderId} AND a.kind = 'resend'
      AND d.template_key = ${row.template_key} AND d.recipient_ref = ${row.recipient_ref}
      AND a.created_at > ${now.toISOString()}::timestamptz
                         - make_interval(hours => ${RESEND_WINDOW_HOURS})`);
  return z.object({ n: z.number().int().nonnegative() }).parse(raw).n;
}

interface Assessed {
  readonly row: DeliveryRow;
  readonly verdict: ResendVerdict;
  readonly partnerName: string | null;
}

async function assess(
  executor: OrderExecutor,
  order: OrderRow,
  row: DeliveryRow,
  options: { readonly now: Date; readonly emailEnabled: boolean },
): Promise<Assessed> {
  const context = await originalContext(executor, row.id);
  const florist =
    row.audience === "florist" && context !== null
      ? await floristAssignment(executor, order, row, context, options.now)
      : null;
  const facts: ResendFacts = {
    template: row.template_key,
    audience: row.audience,
    rowStatus: row.status,
    mode: order.mode,
    emailEnabled: options.emailEnabled,
    projection: order.buyer_projection,
    orderStatus: order.status,
    contextKnown: context !== null,
    assignment: florist?.facts ?? null,
    deliveryDatePassed: order.date_passed,
    recentResends: await recentResends(executor, order.id, row, options.now),
  };
  return {
    row,
    verdict: resendDecision(facts),
    partnerName: florist?.partnerName ?? null,
  };
}

/** The template's code in spec 016's table (B1 … V5, A1, W, F1 …), or null. */
function codeOf(template: string): string | null {
  return (
    NOTIFICATION_RULES.find((rule) => rule.template === template)?.code ?? null
  );
}

/** One row of the admin emails list. Codes, ids and times only: never an address. */
export interface ResendableDelivery {
  readonly deliveryId: string;
  readonly templateKey: string;
  /** Spec 016's code (B1 … V5, A1, W), or null for a template outside that table. */
  readonly code: string | null;
  readonly audience: NotificationAudience;
  /** The florist's name for a florist row (the "To" column); null otherwise. */
  readonly partnerName: string | null;
  readonly status: string;
  /** `queued` while `notifications.email` is off. */
  readonly held: boolean;
  readonly createdAt: Date;
  readonly statusAt: Date;
  /** The row this one resent, or null for an original. */
  readonly resendOf: string | null;
  readonly resend: ResendVerdict;
}

export interface ResendListOptions {
  readonly now: Date;
  readonly emailEnabled: boolean;
}

/**
 * Every delivery row of one order (its own and its purchase's B1), oldest first, each with
 * `resendDecision` applied now; null when there is no such order. Reads only.
 */
export async function resendableDeliveries(
  executor: OrderExecutor,
  orderId: string,
  options: ResendListOptions,
): Promise<ResendableDelivery[] | null> {
  const id = UUID.parse(orderId);
  const order = await orderRow(executor, id, options.now);
  if (order === null) return null;
  const rows = (
    await executor.execute(sql`
      SELECT ${DELIVERY_COLUMNS}
      FROM notification_delivery d
      WHERE d.order_id = ${id}
         OR (d.order_id IS NULL AND d.purchase_id = ${order.purchase_id}::uuid)
      ORDER BY d.created_at, d.id`)
  ).map(parseDeliveryRow);
  const list: ResendableDelivery[] = [];
  for (const row of rows) {
    const assessed = await assess(executor, order, row, options);
    list.push({
      deliveryId: row.id,
      templateKey: row.template_key,
      code: codeOf(row.template_key),
      audience: row.audience,
      partnerName: assessed.partnerName,
      status: row.status,
      held: row.status === "queued" && !options.emailEnabled,
      createdAt: row.created_at,
      statusAt: row.status_at,
      resendOf: row.resend_of,
      resend: assessed.verdict,
    });
  }
  return list;
}

/* -------------------------------------------------------------------------- */
/* The resend itself                                                          */
/* -------------------------------------------------------------------------- */

export const ResendNotificationInputSchema = z
  .object({
    orderId: z.uuid(),
    deliveryId: z.uuid(),
    actionId: z.uuid(),
  })
  .strict();
export type ResendNotificationInput = z.infer<
  typeof ResendNotificationInputSchema
>;

export type ResendNotificationResult =
  | { readonly ok: true; readonly deliveryId: string }
  | {
      readonly ok: false;
      readonly code: "RESEND_NOT_ALLOWED" | "RESEND_RATE_LIMITED";
      readonly cause: ResendCause | "not_this_order";
    };

export interface ResendNotificationDeps extends NotificationDeps {
  readonly now?: () => Date;
}

/**
 * Creates the resend row for `input.deliveryId` on `input.orderId`, on the caller's transaction
 * (spec 020a §5.2: `runOrderAction`'s, under the order lock). Refused, it writes nothing.
 */
export async function resendNotification(
  executor: OrderExecutor,
  input: ResendNotificationInput,
  deps: ResendNotificationDeps = {},
): Promise<ResendNotificationResult> {
  const parsed = ResendNotificationInputSchema.parse(input);
  const resolved = resolveDeps(deps);
  const now = (deps.now ?? (() => new Date()))();
  const order = await orderRow(executor, parsed.orderId, now);
  const [raw] = await executor.execute(sql`
    SELECT ${DELIVERY_COLUMNS} FROM notification_delivery d
    WHERE d.id = ${parsed.deliveryId}
      AND (d.order_id = ${parsed.orderId}
           OR (d.order_id IS NULL AND d.purchase_id = ${order?.purchase_id ?? null}::uuid))`);
  if (order === null || raw === undefined) {
    return { ok: false, code: "RESEND_NOT_ALLOWED", cause: "not_this_order" };
  }
  const original = parseDeliveryRow(raw);
  // A `queued` original is refused either way (held or not), so the flag is not read here.
  const { verdict } = await assess(executor, order, original, {
    now,
    emailEnabled: true,
  });
  if (!verdict.allowed) {
    return {
      ok: false,
      code:
        verdict.cause === "rate_limited"
          ? "RESEND_RATE_LIMITED"
          : "RESEND_NOT_ALLOWED",
      cause: verdict.cause,
    };
  }
  const locale = await sendTimeLocale(executor, original, order.id);
  const [inserted] = await executor.execute(sql`
    INSERT INTO notification_delivery (source_key, order_id, purchase_id, template_key, audience,
                                       recipient_ref, locale_code, provider, status, status_at,
                                       resend_of)
    VALUES (${`admin:${parsed.actionId}`}, ${original.order_id}, ${original.purchase_id},
            ${original.template_key}, ${original.audience}, ${original.recipient_ref},
            ${locale}, ${resolved.provider()}, 'queued', now(), ${original.id})
    RETURNING id`);
  const deliveryId = z.object({ id: z.uuid() }).parse(inserted).id;
  resolved.log.info(
    {
      order_id: order.id,
      delivery_id: deliveryId,
      resend_of: original.id,
      template_key: original.template_key,
      audience: original.audience,
      outcome: "queued",
    },
    "notification.resend_queued",
  );
  return { ok: true, deliveryId };
}

/** The audience's language now: the buyer's order (B1: the purchase), or the member's own. */
async function sendTimeLocale(
  executor: OrderExecutor,
  row: DeliveryRow,
  orderId: string,
): Promise<string> {
  if (row.audience === "florist") {
    const [member] = await executor.execute(sql`
      SELECT locale_code FROM partner_member WHERE user_id::text = ${row.recipient_ref}
      ORDER BY created_at LIMIT 1`);
    const parsed = z
      .object({ locale_code: z.string().min(1) })
      .safeParse(member);
    if (!parsed.success) {
      throw new NotificationRecipientMissing("the florist member is gone");
    }
    return parsed.data.locale_code;
  }
  const facts = await orderFacts(executor, orderId);
  return row.template_key === "order-received"
    ? (facts.purchase_locale ?? facts.locale_code)
    : facts.locale_code;
}

/* -------------------------------------------------------------------------- */
/* The job                                                                    */
/* -------------------------------------------------------------------------- */

/** Enqueues `notifications.resend` for a new row. */
export type ResendScheduler = (
  deliveryId: string,
  requestId: string,
) => Promise<void>;

/** The production scheduler: pg-boss, keyed by the new row's id. */
export const pgBossResendScheduler: ResendScheduler = async (
  deliveryId,
  requestId,
) => {
  const { enqueue, ensureQueue, withBoss } = await import("@/jobs/runtime");
  await withBoss(async (boss) => {
    await ensureQueue(boss, "notifications.resend");
    await enqueue(
      boss,
      "notifications.resend",
      { deliveryId },
      { requestId, singletonKey: deliveryId },
    );
  });
};

export type ResendJobOutcome =
  "sent" | "skipped" | "missing" | "not_a_resend" | "refused";

export interface ResendJobDeps extends NotificationDeps {
  /** The suites' transaction; production opens a `system` one. */
  readonly executor?: OrderExecutor;
}

const ActionOrderRow = z.object({ order_id: z.uuid() });

/**
 * The `notifications.resend` job for one resend row. Idempotent: a row already `sent` or later is
 * skipped, and the send's idempotency key is the row's own.
 */
export async function runResendNotificationJob(
  deliveryId: string,
  deps: ResendJobDeps = {},
): Promise<ResendJobOutcome> {
  const id = UUID.parse(deliveryId);
  const resolved = resolveDeps(deps);
  const log = resolved.log;
  if (!(await resolved.emailEnabled())) throw new NotificationsHeld();
  return withExecutor(
    deps.executor === undefined ? undefined : { executor: deps.executor },
    "notifications.resend",
    async (executor): Promise<ResendJobOutcome> => {
      const [raw] = await executor.execute(sql`
        SELECT ${DELIVERY_COLUMNS} FROM notification_delivery d WHERE d.id = ${id}
        FOR UPDATE`);
      if (raw === undefined) {
        log.warn(
          { delivery_id: id, outcome: "missing" },
          "notification.resend",
        );
        return "missing";
      }
      const row = parseDeliveryRow(raw);
      const actionId = /^admin:(.+)$/u.exec(row.source_key)?.[1];
      if (row.resend_of === null || actionId === undefined) {
        log.warn(
          { delivery_id: id, outcome: "not_a_resend" },
          "notification.resend",
        );
        return "not_a_resend";
      }
      const fields = {
        delivery_id: id,
        template_key: row.template_key,
        audience: row.audience,
      };
      if (row.status !== "queued") {
        log.info({ ...fields, outcome: "skipped" }, "notification.resend");
        return "skipped";
      }
      const orderId =
        row.order_id ??
        ActionOrderRow.parse(
          (
            await executor.execute(sql`
              SELECT order_id FROM admin_order_action WHERE id = ${actionId}::uuid`)
          )[0],
        ).order_id;
      const context = await originalContext(executor, row.resend_of);
      const facts = await orderFacts(executor, orderId);
      const template =
        RESEND_RULES[row.template_key as NotificationTemplateKey];
      if (
        context === null ||
        template === undefined ||
        facts.mode === "demo" ||
        (row.audience === "buyer" && facts.mode !== "live")
      ) {
        log.warn({ ...fields, outcome: "refused" }, "notification.resend");
        return "refused";
      }
      const rule: NotificationRule = {
        code: template.code,
        template: row.template_key as NotificationTemplateKey,
        audience: template.audience,
        trigger: context.trigger,
        from: { kind: "any" },
        modes: ["test", "live"],
      };
      const recipient = await resendRecipient(executor, {
        row,
        rule,
        orderId,
        context,
        mode: facts.mode,
        buyerEmail: facts.buyer_email,
        buyerLocale:
          row.template_key === "order-received"
            ? (facts.purchase_locale ?? facts.locale_code)
            : facts.locale_code,
      });
      await executor.execute(sql`
        UPDATE notification_delivery SET locale_code = ${recipient.locale}
        WHERE id = ${row.id} AND locale_code <> ${recipient.locale}`);
      return sendOne(
        executor,
        {
          trigger: context.trigger,
          fromStatus: context.fromStatus,
          invoiceId: context.invoiceId,
          orderId: row.order_id,
          jobId: context.jobId,
        },
        recipient,
        resolved,
      );
    },
  );
}

/** The recipient of a resend, resolved now: the order's buyer, or the member on the row. */
async function resendRecipient(
  executor: OrderExecutor,
  input: {
    readonly row: DeliveryRow;
    readonly rule: NotificationRule;
    readonly orderId: string;
    readonly context: OriginalContext;
    readonly mode: OrderMode;
    readonly buyerEmail: string | null;
    readonly buyerLocale: string;
  },
): Promise<Recipient> {
  const { row, rule } = input;
  const base = {
    rule,
    ref: row.recipient_ref,
    sourceKey: row.source_key,
    orderId: row.order_id,
    purchaseId: row.purchase_id,
  };
  if (row.audience === "buyer") {
    const address = z.email().safeParse(input.buyerEmail);
    if (!address.success) {
      throw new NotificationRecipientMissing("the order has no buyer address");
    }
    return {
      ...base,
      address: address.data,
      locale: input.buyerLocale,
      assignment: null,
    };
  }
  const assignment = await assignmentFor(executor, {
    trigger: input.context.trigger,
    fromStatus: input.context.fromStatus,
    mode: input.mode,
    orderId: input.orderId,
    sourceKey: row.source_key,
    eventId: input.context.eventId,
    assignmentId: input.context.assignmentId,
    invoiceId: input.context.invoiceId,
  });
  if (assignment === null) {
    throw new NotificationRecipientMissing("the assignment is gone");
  }
  const [member] = await executor.execute(sql`
    SELECT u.email, m.locale_code
    FROM partner_member m JOIN users u ON u.id = m.user_id
    WHERE m.partner_id = ${assignment.partner_id} AND m.user_id::text = ${row.recipient_ref}`);
  const parsed = z
    .object({ email: z.email(), locale_code: z.string().min(1) })
    .safeParse(member);
  if (!parsed.success) {
    throw new NotificationRecipientMissing("the florist member is gone");
  }
  return {
    ...base,
    address: parsed.data.email,
    locale: parsed.data.locale_code,
    assignment,
  };
}
