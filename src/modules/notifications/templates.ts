/**
 * The template registry of the notification pipeline (spec 016 §5.2; TASK-331).
 *
 * The pipeline (`pipeline.ts`) decides **who** gets **which** template and records the send; a
 * template decides **what it says**. Templates are other tasks' (TASK-332: the layout, V1 to V5,
 * A1 and W; TASK-333: B1 to B6 and B8), each registered here by its key with
 * `registerNotificationTemplate`. A renderer is handed ids, the locale and the link, never an
 * address, and reads the order facts it shows through the executor of the delivery's transaction.
 *
 * A template that is not registered yet is `TEMPLATE_NOT_BUILT`: the delivery throws, the
 * dispatcher retries it with backoff and, at the 8th attempt, marks it `dead` with `outbox.dead`.
 * A message is never dropped silently and never sent half-built; while templates are missing in
 * an environment, `notifications.email` off holds every message instead (spec 016 §12).
 */
import type { OrderExecutor } from "@/modules/orders";

import type { MailAttachment } from "./mailer";

import type {
  NotificationAudience,
  NotificationTemplateKey,
  NotificationTrigger,
} from "./rules";

/** What a template is given. Ids and choices only: no address, name or subject. */
export interface NotificationRenderInput {
  readonly template: NotificationTemplateKey;
  readonly audience: NotificationAudience;
  /** `order.locale_code` (B1: `purchase.locale_code`), the member's language, or `en` for ops. */
  readonly locale: string;
  readonly trigger: NotificationTrigger;
  readonly fromStatus: string | null;
  /** The order the message is about; null for B1 (a purchase) and for F2 (no order at all). */
  readonly orderId: string | null;
  readonly purchaseId: string | null;
  /** Florist and W messages: the assignment, and its florist. */
  readonly assignmentId: string | null;
  readonly partnerId: string | null;
  /** B8: the invoice or credit note (TASK-334). */
  readonly invoiceId: string | null;
  /**
   * A job's own id behind a `job:{name}:{id}` source (spec 030a's F2: the instant its run closed
   * the payouts at); absent or null for an outbox delivery.
   */
  readonly jobId?: string | null;
  /** Spec 030a's payout statement (TASK-365): the payout it states; absent or null otherwise. */
  readonly payoutId?: string | null;
  /**
   * V1, V2, V3 and V5: the one-tap link minted for this member (a fresh single-use token through
   * spec 012's core), or the plain inbox address when the member cannot be sent a link now.
   */
  readonly link: string | null;
  /** W: the order's inbox address, with no token (§5.2). */
  readonly inboxUrl: string | null;
  /** W: which florist message it copies. */
  readonly whatsappCopyOf: "offer" | "offer-withdrawn" | null;
  /** The delivery's own transaction, for the facts the template shows. */
  readonly executor: OrderExecutor;
  /** The pipeline's clock (B1's bounded wait for the invoice, TASK-334); the wall clock when absent. */
  readonly now?: Date;
  /**
   * An outbox delivery's next due time if this send throws (`OutboxHandlerContext.retryDueAt`);
   * null on its last attempt; absent for a job.
   */
  readonly retryDueAt?: Date | null;
}

/** A rendered message: both parts, and a subject with no name, address or phone in it. */
export interface RenderedNotification {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /** Files sent with it: B1's terms and invoices, B4's photo, B8's document (TASK-333). */
  readonly attachments?: readonly MailAttachment[];
  /**
   * B1: the invoices among `attachments` (TASK-334). Once the send is accepted, the pipeline writes
   * one `notification_delivery_invoice` row per id on the delivery, which is how B8 knows B1
   * carried it.
   */
  readonly invoiceIds?: readonly string[];
}

export type NotificationRenderer = (
  input: NotificationRenderInput,
) => Promise<RenderedNotification>;

/** A template the pipeline needs and nobody has registered. Retried, then `dead`. */
export class NotificationTemplateMissing extends Error {
  readonly code = "TEMPLATE_NOT_BUILT";

  constructor(template: NotificationTemplateKey) {
    super(`TEMPLATE_NOT_BUILT: no renderer is registered for ${template}`);
    this.name = "NotificationTemplateMissing";
  }
}

const renderers = new Map<NotificationTemplateKey, NotificationRenderer>();

/** Registers the one renderer of `template`. A second registration throws. */
export function registerNotificationTemplate(
  template: NotificationTemplateKey,
  renderer: NotificationRenderer,
): void {
  if (renderers.has(template)) {
    throw new Error(`notification template already registered: ${template}`);
  }
  renderers.set(template, renderer);
}

/** The registered renderer of `template`, or undefined. */
export function notificationTemplate(
  template: NotificationTemplateKey,
): NotificationRenderer | undefined {
  return renderers.get(template);
}
