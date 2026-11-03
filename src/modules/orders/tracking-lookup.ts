/**
 * The tracking lookup (spec 018 §5.2 `lookupTracking`, "Rate limits", "Emails"; §5.3 `track`;
 * AC-8; TASK-339).
 *
 * A buyer who has lost the link types the order's reference (spec 010) and the email on
 * `/{locale}/track`; when the pair matches one order, T16 sends that order's tracking link to the
 * order's own address. **The answer is the same page whatever happened** (the route renders it
 * from nothing this function returns), so nobody learns from it whether an order exists or which
 * email placed it. This function only decides whether to send, and says why in its outcome for
 * the `tracking.lookup` log line:
 *
 *  - `silent`: the input does not parse, no order has the reference, the email is not the
 *    order's, the order is not `live` where only live orders are mailed (§5.2: none is sent for
 *    `mode <> 'live'` outside the test environments), or its link no longer opens (delivery date
 *    plus 90 days, or the cancellation plus 90 days), so T16 would carry a dead link;
 *  - `limited`: the typed address has had 3 lookups in the last hour (`claim`, spec 012's
 *    `auth_email_send` counter under its own `track` scope, keyed by the hashed address). Every
 *    parsed lookup claims one, matched or not, before the order is read. No IP is read or stored;
 *  - `sent`: T16 went to the order's address with a link that resolves.
 *
 * The reference is found through spec 010's `order_reference(uuid)` and its unique index
 * `order_reference_idx`, so one reference names at most one order. The two addresses are
 * compared as SHA-256 digests of their normalised forms with `timingSafeEqual`.
 *
 * Nothing here logs the reference, the address, the order id or the link (§11).
 */
import { createHash, timingSafeEqual } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import type { LocaleCode } from "@/config/locales";
import { normaliseEmail } from "@/lib/auth/tokens";
import { logger } from "@/lib/logger";

import { withExecutor } from "./service/executor";
import { ORDER_REFERENCE_PATTERN } from "./service/reference";
import { tracking, type TrackingOptions } from "./tracking";

/** Lookups per address per hour (spec 018 §5.2 "Rate limits"). */
export const TRACKING_LOOKUP_LIMIT = 3;
/** The `auth_email_send` counter the lookup claims under (`hashScopedIdentifier`). */
export const TRACKING_LOOKUP_SCOPE = "track";

/** The form's two fields (§5.2). The reference is read without spaces and in capitals. */
export const TrackingLookupInputSchema = z
  .object({
    reference: z
      .string()
      .max(64)
      .transform((value) => value.replace(/\s+/gu, "").toUpperCase())
      .pipe(z.string().regex(ORDER_REFERENCE_PATTERN)),
    email: z.string().trim().pipe(z.email().max(254)),
  })
  .strict();
export type TrackingLookupInput = z.infer<typeof TrackingLookupInputSchema>;

export type TrackingLookupOutcome = "sent" | "silent" | "limited";

/** T16 as the lookup hands it to the sender: the order's address, its reference, the link. */
export interface TrackingLinkMail {
  readonly to: string;
  readonly locale: LocaleCode;
  readonly reference: string;
  readonly link: string;
}

export interface TrackingLookupDeps extends TrackingOptions {
  /** Claims one lookup for the typed address; `false` when the address is over its limit. */
  readonly claim: (email: string) => Promise<boolean>;
  /** Renders and sends T16. */
  readonly send: (mail: TrackingLinkMail) => Promise<void>;
  /** Whether `demo` and `test` orders are mailed too (the test environments only). */
  readonly sendsNonLive: boolean;
  /** The site origin of the link; `NEXT_PUBLIC_SITE_URL` by default. */
  readonly origin?: string;
}

const OrderRow = z.object({
  id: z.uuid(),
  mode: z.enum(["demo", "test", "live"]),
  email: z.string().nullable(),
});

function digest(email: string): Buffer {
  return createHash("sha256").update(normaliseEmail(email)).digest();
}

function sameAddress(typed: string, stored: string | null): boolean {
  if (stored === null) return false;
  return timingSafeEqual(digest(typed), digest(stored));
}

/** One lookup: decides whether T16 goes out, and sends it. See the module note. */
export async function lookupTracking(
  input: unknown,
  locale: LocaleCode,
  deps: TrackingLookupDeps,
): Promise<TrackingLookupOutcome> {
  const outcome = await decide(input, locale, deps);
  logger.info({ outcome }, "tracking.lookup");
  return outcome;
}

async function decide(
  input: unknown,
  locale: LocaleCode,
  deps: TrackingLookupDeps,
): Promise<TrackingLookupOutcome> {
  const parsed = TrackingLookupInputSchema.safeParse(input);
  if (!parsed.success) return "silent";
  const { reference, email } = parsed.data;
  if (!(await deps.claim(email))) return "limited";

  const row = await withExecutor(
    deps,
    "orders.tracking_lookup",
    async (executor) => {
      const [found] = await executor.execute(sql`
        SELECT o.id, o.mode, o.buyer_snapshot ->> 'email' AS email
        FROM "order" o
        WHERE public.order_reference(o.id) = ${reference}`);
      return found;
    },
  );
  if (row === undefined) return "silent";
  const order = OrderRow.parse(row);
  if (!sameAddress(email, order.email) || order.email === null) {
    return "silent";
  }
  if (order.mode !== "live" && !deps.sendsNonLive) return "silent";

  const link = await tracking.linkFor(order.id, locale, deps);
  const token = link.split("/track/")[1] ?? "";
  const opens = await tracking.resolve(token, deps);
  if (!opens.ok || opens.orderId !== order.id) return "silent";

  await deps.send({ to: order.email, locale, reference, link });
  return "sent";
}
