/**
 * The tracking token: signing, resolving and rotating it (spec 018 §5.2 "`modules/orders`, read
 * projections", AC-2, T-02; §2 "Tracking", §13 Q7; TASK-337).
 *
 * A tracking token is `signed-link`'s `track` purpose over exactly `{ publicToken, version }`
 * (`TrackingToken`, `.strict()`): no order id, no reference, no date and nothing personal, so a
 * link pasted into a chat or a log says nothing about the order it opens. `"order".public_token`
 * is 16 CSPRNG bytes from the column default (`0021`), never written by application code, and
 * `"order".tracking_token_version` is what a rotation bumps.
 *
 * `resolve` answers `TRACKING_FAILURE` (one frozen value) for every cause: a bad MAC or another
 * purpose (`signed-link`), a payload that is not exactly the two keys, an unknown `publicToken`, a
 * stale version (the token was rotated away), and an expired order. The link works until the end
 * of the 90th day after the delivery date, in the destination's zone, or until 90 days after the
 * order first entered a status whose buyer projection is `cancelled`, whichever comes first
 * (§13 Q7). The status projection is read from `order_status`, never from a copy in code.
 *
 * `rotateTrackingToken` bumps the version and writes one `audit_log` row in the same transaction
 * (`order.tracking_token_rotated`, the versions before and after, never a token). Its Phase 1
 * caller is `pnpm orders:rotate-tracking --order <id>` (channel `cli`); spec 020 adds the admin
 * button.
 *
 * Nothing here logs a token, a public token or an order's data (spec 018 §8).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { isLocaleCode } from "@/config/locales";
import { type SignedLinkOptions, sign, verify } from "@/lib/signed-link";

import { type Actor, ActorSchema } from "./service/actor";
import {
  type EngineConnection,
  type OrderExecutor,
  withExecutor,
} from "./service/executor";

/** What a tracking token signs: exactly these two keys (AC-2). */
export const TrackingToken = z
  .object({
    publicToken: z.string().regex(/^[A-Za-z0-9_-]{22}$/u),
    version: z.number().int().positive(),
  })
  .strict();
export type TrackingToken = z.infer<typeof TrackingToken>;

/** How long a link works after the delivery date or the cancellation (§13 Q7). */
export const TRACKING_LINK_DAYS = 90;

/** The one failure value of `resolve`, for every cause. Compared by identity in the tests. */
export const TRACKING_FAILURE: { readonly ok: false } = Object.freeze({
  ok: false,
});

export type TrackingResolution =
  { readonly ok: true; readonly orderId: string } | typeof TRACKING_FAILURE;

/** Seams for the tests: the signing key and the clock. Production passes nothing. */
export interface TrackingOptions extends EngineConnection {
  readonly secret?: string;
  readonly now?: () => Date;
}

/** The audit channels `0016` allows. */
export const RotationChannelSchema = z.enum(["admin", "cli", "system"]);
export type RotationChannel = z.infer<typeof RotationChannelSchema>;

const OrderIdSchema = z.uuid();

const TokenRow = z.object({
  public_token: z.string(),
  tracking_token_version: z.coerce.number().int().positive(),
});

const ResolveRow = z.object({
  id: z.uuid(),
  tracking_token_version: z.coerce.number().int().positive(),
  expired: z.boolean(),
});

const RotateRow = z.object({
  before: z.coerce.number().int().positive(),
  after: z.coerce.number().int().positive(),
});

function linkOptions(options: TrackingOptions | undefined): SignedLinkOptions {
  return {
    ...(options?.secret === undefined ? {} : { secret: options.secret }),
    ...(options?.now === undefined ? {} : { now: options.now }),
  };
}

/** The token for an order's current version. Throws when the order does not exist. */
async function tokenFor(
  executor: OrderExecutor,
  orderId: string,
  options: TrackingOptions | undefined,
): Promise<string> {
  const [row] = await executor.execute(sql`
    SELECT public_token, tracking_token_version FROM "order"
    WHERE id = ${OrderIdSchema.parse(orderId)}`);
  if (row === undefined) throw new Error("tracking: no such order");
  const { public_token: publicToken, tracking_token_version: version } =
    TokenRow.parse(row);
  return sign(
    "track",
    TrackingToken.parse({ publicToken, version }),
    undefined,
    linkOptions(options),
  );
}

/** The site origin links are built on: `NEXT_PUBLIC_SITE_URL`, without a trailing slash. */
function siteOrigin(origin: string | undefined): string {
  const value =
    origin ?? process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";
  return z.url().parse(value).replace(/\/+$/u, "");
}

/**
 * `/{locale}/track/{token}` on the site origin, for spec 016's buyer emails and spec 018's lookup
 * email. The locale must be a registered locale code.
 */
async function linkFor(
  orderId: string,
  locale: string,
  options?: TrackingOptions & { readonly origin?: string },
): Promise<string> {
  if (!isLocaleCode(locale)) throw new Error("tracking: unknown locale");
  const token = await withExecutor(
    options,
    "orders.tracking_link",
    (executor) => tokenFor(executor, orderId, options),
  );
  return `${siteOrigin(options?.origin)}/${locale}/track/${token}`;
}

/** The order a tracking token opens, or `TRACKING_FAILURE`. */
async function resolve(
  token: string,
  options?: TrackingOptions,
): Promise<TrackingResolution> {
  const verified = verify("track", token, linkOptions(options));
  if (!verified.ok) return TRACKING_FAILURE;
  const parsed = TrackingToken.safeParse(verified.payload);
  if (!parsed.success) return TRACKING_FAILURE;
  const now = (options?.now ?? (() => new Date()))();
  const row = await withExecutor(
    options,
    "orders.tracking_resolve",
    async (executor) => {
      // The link's end: local midnight starting the 91st day after the delivery date in the
      // destination's zone, or 90 calendar days (in that zone) after the first entry into a
      // cancelled-projection status, whichever is earlier.
      const [found] = await executor.execute(sql`
        SELECT o.id, o.tracking_token_version,
               ${now.toISOString()}::timestamptz >= LEAST(
                 ((o.delivery_date + ${TRACKING_LINK_DAYS + 1}::int)::timestamp AT TIME ZONE c.iana_zone),
                 (SELECT ((min(e.occurred_at) AT TIME ZONE c.iana_zone)
                           + make_interval(days => ${TRACKING_LINK_DAYS}::int)) AT TIME ZONE c.iana_zone
                  FROM order_event e
                  JOIN order_status s ON s.key = e.to_status
                  WHERE e.order_id = o.id AND s.buyer_projection = 'cancelled')
               ) AS expired
        FROM "order" o
        JOIN country c ON c.id = o.destination_country_id
        WHERE o.public_token = ${parsed.data.publicToken}`);
      return found;
    },
  );
  if (row === undefined) return TRACKING_FAILURE;
  const resolved = ResolveRow.safeParse(row);
  if (!resolved.success) return TRACKING_FAILURE;
  if (resolved.data.tracking_token_version !== parsed.data.version) {
    return TRACKING_FAILURE;
  }
  if (resolved.data.expired) return TRACKING_FAILURE;
  return { ok: true, orderId: resolved.data.id };
}

export const tracking = { linkFor, resolve };

/**
 * Bumps the order's tracking-token version, so every token signed before stops resolving, and
 * records it in `audit_log` in the same transaction. Returns the new version.
 */
export async function rotateTrackingToken(
  orderId: string,
  actor: Actor,
  options?: EngineConnection & { readonly channel?: RotationChannel },
): Promise<{ readonly version: number }> {
  const id = OrderIdSchema.parse(orderId);
  const who = ActorSchema.parse(actor);
  const channel = RotationChannelSchema.parse(options?.channel ?? "cli");
  const adminId = who.startsWith("admin:") ? who.slice("admin:".length) : null;
  return withExecutor(options, "orders.rotate_tracking", async (executor) => {
    const [row] = await executor.execute(sql`
      UPDATE "order" SET tracking_token_version = tracking_token_version + 1
      WHERE id = ${id}
      RETURNING tracking_token_version - 1 AS before, tracking_token_version AS after`);
    if (row === undefined) throw new Error("tracking: no such order");
    const { before, after } = RotateRow.parse(row);
    await executor.execute(sql`
      INSERT INTO audit_log (actor_user_id, actor_label, action, entity_table, entity_id,
                             before, after, request_id, channel)
      VALUES (${adminId}::uuid, ${who}, 'order.tracking_token_rotated', 'order', ${id},
              jsonb_build_object('tracking_token_version', ${before}::int),
              jsonb_build_object('tracking_token_version', ${after}::int),
              coalesce(nullif(current_setting('app.request_id', true), ''), ${`${channel}:orders.rotate_tracking`}),
              ${channel})`);
    return { version: after };
  });
}
