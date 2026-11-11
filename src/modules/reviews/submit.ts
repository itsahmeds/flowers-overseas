/**
 * The review form's commands (spec 022a §2 "The review form", §5.2 "`ReviewSubmission`", §5.3,
 * §8; AC-12 to AC-15; TASK-371).
 *
 *  - `reviewFormState(executor, token, now)`: what `GET /{locale}/review/{token}` shows. A read:
 *    no row is written, so a mail scanner opening the link changes nothing (AC-12).
 *  - `submitReview(executor, token, input, now)`: one `review` (source `internal`,
 *    `verified_order`, `pending`) with the four denormalised columns filled here from the order,
 *    `used_at` on the invite, and `review.created` through `appendEvent` with actor `buyer`. The
 *    order's status does not change (status-preserving event). One review per order.
 *  - `optOutOfReviewInvites(executor, token, now)`: the buyer's objection on the customer, kept
 *    across orders; later invites are skipped as `opted_out` (AC-15).
 *
 * An unknown token and an expired one are the same answer (`gone`), so the page is no token
 * oracle (AC-14). Nothing here logs the token, the text or a name.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { defaultLocale } from "@/config/locales";
import {
  REVIEW_RATING_MAX,
  REVIEW_RATING_MIN,
  REVIEW_TEXT_MAX_GRAPHEMES,
} from "@/config/reviews";
import { countGraphemes } from "@/modules/i18n";
import {
  appendEvent,
  BUYER_ACTOR,
  OrderModeSchema,
  type OrderExecutor,
} from "@/modules/orders";

import "./events";
import { tokenHashOf } from "./token";

/**
 * Graphemes as a reader counts them: an emoji or "ż" is one. Counted by the formatter module's
 * `countGraphemes` (`fo/no-adhoc-intl`: `Intl.Segmenter` is constructed there and nowhere else);
 * grapheme boundaries do not depend on the locale, so the default locale's segmenter serves.
 */
export function graphemeCount(text: string): number {
  return countGraphemes(text, defaultLocale);
}

/** A form checkbox: present ("on", "true") is true, absent is false. */
const Checkbox = z
  .union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((value) => value === true || value === "on" || value === "true");

/** `ReviewSubmission` (§5.2): the form's one input, refused with a field error when out of range. */
export const ReviewSubmissionSchema = z
  .object({
    rating: z.coerce
      .number()
      .int()
      .min(REVIEW_RATING_MIN)
      .max(REVIEW_RATING_MAX),
    text: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = (value ?? "").trim();
        return trimmed === "" ? null : trimmed;
      })
      .refine(
        (value) =>
          value === null || graphemeCount(value) <= REVIEW_TEXT_MAX_GRAPHEMES,
        { error: "too_long" },
      ),
    showFirstName: Checkbox,
  })
  .strict();
export type ReviewSubmission = z.output<typeof ReviewSubmissionSchema>;
export type ReviewSubmissionInput = z.input<typeof ReviewSubmissionSchema>;

/** The order facts the form shows: no recipient name, no address beyond the city. */
export interface ReviewFormOrder {
  readonly orderId: string;
  readonly localeCode: string;
  readonly deliveryDate: string;
  readonly city: string | null;
  readonly countryIso2: string;
  readonly productSku: string | null;
  readonly tierKey: string | null;
}

export type ReviewFormState =
  | { readonly kind: "open"; readonly order: ReviewFormOrder }
  | { readonly kind: "used" }
  | { readonly kind: "gone" };

const InviteRow = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  customer_id: z.uuid(),
  expires_at: z.coerce.date(),
  used_at: z.coerce.date().nullable(),
  has_review: z.boolean(),
});
type Invite = z.infer<typeof InviteRow>;

async function inviteFor(
  executor: OrderExecutor,
  token: string,
  lock: boolean,
): Promise<Invite | null> {
  const hash = tokenHashOf(token);
  if (hash === null) return null;
  const [row] = await executor.execute(sql`
    SELECT i.id, i.order_id, i.customer_id, i.expires_at, i.used_at,
           EXISTS (SELECT 1 FROM review r WHERE r.order_id = i.order_id) AS has_review
    FROM review_invite i
    WHERE i.token_hash = ${hash}
    ${lock ? sql`FOR UPDATE OF i` : sql``}`);
  return row === undefined ? null : InviteRow.parse(row);
}

function stateOf(invite: Invite | null, now: Date): "open" | "used" | "gone" {
  if (invite === null) return "gone";
  if (invite.used_at !== null || invite.has_review) return "used";
  if (invite.expires_at.getTime() <= now.getTime()) return "gone";
  return "open";
}

const OrderRow = z.object({
  locale_code: z.string().min(1),
  delivery_date: z.coerce.date(),
  city: z.string().nullable(),
  country_iso2: z.string().regex(/^[A-Z]{2}$/u),
  sku: z.string().nullable(),
  tier_key: z.string().nullable(),
});

/** What `GET /{locale}/review/{token}` shows. Reads only. */
export async function reviewFormState(
  executor: OrderExecutor,
  token: string,
  now: Date,
): Promise<ReviewFormState> {
  const invite = await inviteFor(executor, token, false);
  const state = stateOf(invite, now);
  if (state !== "open" || invite === null)
    return { kind: state === "used" ? "used" : "gone" };
  const [row] = await executor.execute(sql`
    SELECT o.locale_code, o.delivery_date, o.recipient_snapshot ->> 'city' AS city,
           c.iso2 AS country_iso2, line.sku, line.tier_key
    FROM "order" o
    JOIN country c ON c.id = o.destination_country_id
    LEFT JOIN LATERAL (
      SELECT p.sku, l.tier_key FROM order_line l JOIN product p ON p.id = l.product_id
      WHERE l.order_id = o.id AND l.kind = 'product'
      ORDER BY l.created_at, l.id
      LIMIT 1
    ) line ON true
    WHERE o.id = ${invite.order_id}`);
  if (row === undefined) return { kind: "gone" };
  const order = OrderRow.parse(row);
  return {
    kind: "open",
    order: {
      orderId: invite.order_id,
      localeCode: order.locale_code,
      deliveryDate: order.delivery_date.toISOString().slice(0, 10),
      city: order.city,
      countryIso2: order.country_iso2,
      productSku: order.sku,
      tierKey: order.tier_key,
    },
  };
}

export type SubmitOutcome =
  | {
      readonly kind: "thanks";
      readonly reviewId: string;
      /** The florist whose rating the submission touches, for `partners.rating_refresh`. */
      readonly partnerId: string | null;
    }
  | { readonly kind: "used" }
  | { readonly kind: "gone" };

const FactsRow = z.object({
  mode: OrderModeSchema,
  locale_code: z.string().min(1),
  destination_country_id: z.uuid(),
  delivery_date: z.coerce.date(),
  buyer_name: z.string().nullable(),
  product_id: z.uuid().nullable(),
  partner_id: z.uuid().nullable(),
});

/**
 * The first name a buyer chose to show: the first word of the name they typed after any title
 * ending in a dot, so "Dr. Anna Nowak" shows "Anna", never "Dr." and never "Nowak". When that word
 * has fewer than two letters (an initial, "J Smith") there is no first name to show, never the
 * surname: null, and the card reads "Verified buyer".
 */
export function displayFirstName(fullName: string | null): string | null {
  const words = (fullName ?? "").trim().split(/\s+/u);
  const first = words.find((word) => word !== "" && !word.endsWith("."));
  if (first === undefined) return null;
  if ((first.match(/\p{L}/gu)?.length ?? 0) < 2) return null;
  return first.slice(0, 60);
}

/** `submitReview(token, ReviewSubmission)`, in the caller's transaction. */
export async function submitReview(
  executor: OrderExecutor,
  token: string,
  input: ReviewSubmission,
  now: Date,
): Promise<SubmitOutcome> {
  const invite = await inviteFor(executor, token, true);
  const state = stateOf(invite, now);
  if (state !== "open" || invite === null)
    return { kind: state === "used" ? "used" : "gone" };
  const [row] = await executor.execute(sql`
    SELECT o.mode, o.locale_code, o.destination_country_id, o.delivery_date,
           o.buyer_snapshot ->> 'name' AS buyer_name,
           (SELECT l.product_id FROM order_line l
            WHERE l.order_id = o.id AND l.kind = 'product' AND l.product_id IS NOT NULL
            ORDER BY l.created_at, l.id LIMIT 1) AS product_id,
           (SELECT a.partner_id FROM order_assignment a
            WHERE a.order_id = o.id AND a.response = 'accept' AND a.withdrawn_at IS NULL
            ORDER BY a.responded_at DESC LIMIT 1) AS partner_id
    FROM "order" o WHERE o.id = ${invite.order_id}`);
  if (row === undefined) return { kind: "gone" };
  const facts = FactsRow.parse(row);
  const displayName = input.showFirstName
    ? displayFirstName(facts.buyer_name)
    : null;
  const [inserted] = await executor.execute(sql`
    INSERT INTO review (order_id, source, rating, text, verified_order, moderation_status,
                        locale_code, display_name, destination_country_id, product_id,
                        partner_id, delivered_on)
    VALUES (${invite.order_id}, 'internal', ${input.rating}, ${input.text}, true, 'pending',
            ${facts.locale_code}, ${displayName}, ${facts.destination_country_id},
            ${facts.product_id}, ${facts.partner_id},
            ${facts.delivery_date.toISOString().slice(0, 10)}::date)
    ON CONFLICT (order_id) DO NOTHING
    RETURNING id`);
  if (inserted === undefined) return { kind: "used" };
  const reviewId = z.object({ id: z.uuid() }).parse(inserted).id;
  await executor.execute(sql`
    UPDATE review_invite SET used_at = ${now.toISOString()}::timestamptz WHERE id = ${invite.id}`);
  await appendEvent(
    invite.order_id,
    "review.created",
    BUYER_ACTOR,
    { mode: facts.mode, reviewId, rating: input.rating },
    { executor },
  );
  return { kind: "thanks", reviewId, partnerId: facts.partner_id };
}

/**
 * `optOutOfReviewInvites(token)`: sets `customer.review_invite_opt_out_at` (kept if already set).
 * Answers `done` for a known token, expired or used too (stopping emails is always allowed), and
 * `gone` for an unknown one; the page shows the same done text either way.
 */
export async function optOutOfReviewInvites(
  executor: OrderExecutor,
  token: string,
  now: Date,
): Promise<"done" | "gone"> {
  const invite = await inviteFor(executor, token, false);
  if (invite === null) return "gone";
  await executor.execute(sql`
    UPDATE customer
    SET review_invite_opt_out_at = coalesce(review_invite_opt_out_at, ${now.toISOString()}::timestamptz)
    WHERE id = ${invite.customer_id}`);
  return "done";
}
