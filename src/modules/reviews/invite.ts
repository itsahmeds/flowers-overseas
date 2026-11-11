/**
 * The review invitation (spec 022a §2 "The invitation", §5.2 "Jobs", §8 "No selective invitation";
 * AC-6 to AC-8, AC-10; TASK-370).
 *
 *  - **The `reviews` outbox handler.** On `order.photo_uploaded` for a `live` order it inserts one
 *    `review_invite`: `send_after` = the photo event's instant + 24 h, `expires_at` = the same
 *    instant + 30 days, both absolute (hours, never calendar days). A second run of the same
 *    delivery, or a second photo event, finds the order's invite (`UNIQUE (order_id)`) and writes
 *    nothing. The token's SHA-256 is stored, never the token.
 *  - **`review.request`.** Every minute: with `reviews.invite` off nothing is sent, and an invite
 *    whose `expires_at` has passed is marked `expired`; with it on, each due invite (oldest first,
 *    at most 50) is skipped with its reason (`opted_out`, `redacted`, `expired`) or sent as B9 and
 *    marked `sent_at`, each in its own transaction under `FOR UPDATE SKIP LOCKED`.
 *
 * **Eligibility reads no order status after the photo, no rating and no complaint** (§8): the
 * select below names the invite, the customer's opt-out and redaction, and the clock. Nothing on
 * this path reads `review.rating` (AC-10's construction): the send input type has no rating field.
 *
 * Logs carry the invite id and the outcome only, never the token, the address or a name.
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  REVIEW_INVITE_DELAY_HOURS,
  REVIEW_INVITE_LIFE_DAYS,
} from "@/config/reviews";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import type { OrderExecutor, OutboxHandler } from "@/modules/orders";

import { reviewToken, reviewTokenHash } from "./token";

/** At most this many invites per `review.request` run (§5.2). */
export const REVIEW_REQUEST_LIMIT = 50;

/** The `reviews.invite` flag key (spec 022a §12). */
export const REVIEWS_INVITE_FLAG = "reviews.invite" as const;
/** The `reviews.trustpilot` flag key (spec 022a §12, §13 Q2). */
export const REVIEWS_TRUSTPILOT_FLAG = "reviews.trustpilot" as const;

/** The closed reasons an invite is skipped for (`review_invite_skipped_reason_check`). */
export const INVITE_SKIP_REASONS = [
  "opted_out",
  "redacted",
  "expired",
] as const;
export type InviteSkipReason = (typeof INVITE_SKIP_REASONS)[number];

/** The invite delay and life as hours, so SQL adds absolute time (no DST arithmetic). */
const DELAY_HOURS = REVIEW_INVITE_DELAY_HOURS;
const LIFE_HOURS = REVIEW_INVITE_LIFE_DAYS * 24;

export interface InviteHandlerDeps {
  /** The review link's HMAC key (`reviewTokenSecret(process.env)`), read at the first invite. */
  readonly secret: () => string;
  /** The new invite's id; `randomUUID` unless a test pins it. */
  readonly newId?: () => string;
  readonly log?: Logger;
}

/**
 * Inserts the order's invite for one `order.photo_uploaded`, in the caller's transaction. Returns
 * whether a row was written (false: not a `live` photo event, or the order already has one).
 */
export async function createReviewInvite(
  executor: OrderExecutor,
  input: {
    readonly orderId: string;
    readonly eventId: string;
  },
  deps: InviteHandlerDeps,
): Promise<boolean> {
  const id = (deps.newId ?? randomUUID)();
  const tokenHash = reviewTokenHash(reviewToken(deps.secret(), id));
  const rows = await executor.execute(sql`
    INSERT INTO review_invite (id, order_id, customer_id, token_hash, send_after, expires_at)
    SELECT ${id}, o.id, o.customer_id, ${tokenHash},
           e.occurred_at + make_interval(hours => ${DELAY_HOURS}),
           e.occurred_at + make_interval(hours => ${LIFE_HOURS})
    FROM "order" o
    JOIN order_event e ON e.id = ${input.eventId} AND e.order_id = o.id
    WHERE o.id = ${input.orderId}
      AND o.mode = 'live'
      AND e.type = 'order.photo_uploaded'
    ON CONFLICT (order_id) DO NOTHING
    RETURNING id`);
  const written = rows.length > 0;
  (deps.log ?? defaultLogger).info(
    {
      order_id: input.orderId,
      outcome: written ? "created" : "exists",
    },
    "review.invite",
  );
  return written;
}

/** The `reviews` outbox handler: one invite per `live` photo event. */
export function reviewsOutboxHandler(deps: InviteHandlerDeps): OutboxHandler {
  return async (event, context) => {
    if (event.type !== "order.photo_uploaded" || event.mode !== "live") return;
    await createReviewInvite(
      context.executor,
      { orderId: event.orderId, eventId: event.eventId },
      deps,
    );
  };
}

/** What B9's send is handed: ids, the link and the BCC. No rating, no status (AC-10). */
export interface ReviewInviteSend {
  readonly inviteId: string;
  readonly orderId: string;
  /** The review link's token (deterministic, so a retry renders the same body). */
  readonly token: string;
  /** Trustpilot's AFS address when the flag is on and the address set; else absent. */
  readonly bcc?: string;
}

/** One transaction: the caller's savepoint in tests, a fresh `system` transaction otherwise. */
export type InviteTransaction = <T>(
  fn: (executor: OrderExecutor) => Promise<T>,
) => Promise<T>;

export interface ReviewRequestDeps {
  readonly transaction: InviteTransaction;
  /** `reviews.invite`. */
  readonly inviteEnabled: () => Promise<boolean>;
  /** `reviews.trustpilot`. */
  readonly trustpilotEnabled: () => Promise<boolean>;
  /** `TRUSTPILOT_AFS_ADDRESS`, from env only (§12's request on spec 012). */
  readonly trustpilotAddress: () => string | undefined;
  readonly secret: () => string;
  /** B9 through spec 016's pipeline, in the invite's transaction. */
  readonly send: (
    executor: OrderExecutor,
    input: ReviewInviteSend,
  ) => Promise<"sent" | "skipped">;
  readonly now?: () => Date;
  readonly limit?: number;
  readonly log?: Logger;
}

/** What one run did. Counts only. */
export interface ReviewRequestCounts {
  readonly sent: number;
  readonly skipped: Readonly<Record<InviteSkipReason, number>>;
  readonly expired: number;
}

const DueRow = z.object({ id: z.uuid() });
const LockedInvite = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  expires_at: z.coerce.date(),
  sent_at: z.coerce.date().nullable(),
  skipped_reason: z.string().nullable(),
  opted_out: z.boolean(),
  redacted: z.boolean(),
});

/** Marks every unsent, unskipped invite past `expires_at` as `expired`. Returns the count. */
export async function expireInvites(
  executor: OrderExecutor,
  now: Date,
): Promise<number> {
  const rows = await executor.execute(sql`
    UPDATE review_invite SET skipped_reason = 'expired'
    WHERE sent_at IS NULL AND skipped_reason IS NULL
      AND expires_at <= ${now.toISOString()}::timestamptz
    RETURNING id`);
  return rows.length;
}

/** The reason to skip a locked invite, or null to send it. Pure. */
export function inviteSkipReason(
  invite: {
    readonly optedOut: boolean;
    readonly redacted: boolean;
    readonly expiresAt: Date;
  },
  now: Date,
): InviteSkipReason | null {
  if (invite.optedOut) return "opted_out";
  if (invite.redacted) return "redacted";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  return null;
}

/** One `review.request` run. */
export async function runReviewRequest(
  deps: ReviewRequestDeps,
): Promise<ReviewRequestCounts> {
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? defaultLogger;
  const skipped: Record<InviteSkipReason, number> = {
    opted_out: 0,
    redacted: 0,
    expired: 0,
  };
  let sent = 0;
  if (!(await deps.inviteEnabled())) {
    const expired = await deps.transaction((executor) =>
      expireInvites(executor, now),
    );
    return { sent, skipped, expired };
  }
  const due = await deps.transaction(async (executor) =>
    (
      await executor.execute(sql`
        SELECT id FROM review_invite
        WHERE sent_at IS NULL AND skipped_reason IS NULL
          AND send_after <= ${now.toISOString()}::timestamptz
        ORDER BY send_after, id
        LIMIT ${deps.limit ?? REVIEW_REQUEST_LIMIT}`)
    ).map((row) => DueRow.parse(row).id),
  );
  const bccAddress = (await deps.trustpilotEnabled())
    ? deps.trustpilotAddress()
    : undefined;
  for (const inviteId of due) {
    const outcome = await deps.transaction(async (executor) => {
      const [row] = await executor.execute(sql`
        SELECT i.id, i.order_id, i.expires_at, i.sent_at, i.skipped_reason,
               (c.review_invite_opt_out_at IS NOT NULL) AS opted_out,
               c.redacted
        FROM review_invite i JOIN customer c ON c.id = i.customer_id
        WHERE i.id = ${inviteId}
        FOR UPDATE OF i SKIP LOCKED`);
      if (row === undefined) return null;
      const invite = LockedInvite.parse(row);
      if (invite.sent_at !== null || invite.skipped_reason !== null)
        return null;
      const reason = inviteSkipReason(
        {
          optedOut: invite.opted_out,
          redacted: invite.redacted,
          expiresAt: invite.expires_at,
        },
        now,
      );
      if (reason !== null) {
        await executor.execute(sql`
          UPDATE review_invite SET skipped_reason = ${reason} WHERE id = ${invite.id}`);
        return reason;
      }
      await deps.send(executor, {
        inviteId: invite.id,
        orderId: invite.order_id,
        token: reviewToken(deps.secret(), invite.id),
        ...(bccAddress === undefined ? {} : { bcc: bccAddress }),
      });
      await executor.execute(sql`
        UPDATE review_invite
        SET sent_at = ${now.toISOString()}::timestamptz,
            trustpilot_bcc = ${bccAddress !== undefined}
        WHERE id = ${invite.id}`);
      return "sent" as const;
    });
    if (outcome === null) continue;
    if (outcome === "sent") sent += 1;
    else skipped[outcome] += 1;
    log.info({ invite_id: inviteId, outcome }, "review.invite");
  }
  return { sent, skipped, expired: 0 };
}
