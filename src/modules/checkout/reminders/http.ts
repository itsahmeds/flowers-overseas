/**
 * The two HTTP surfaces of spec 034's links (§5.2 "Restore", "Unsubscribe"; AC-16, AC-17, AC-19;
 * TASK-451), as functions of a `Request`, so the route files stay thin and the suites call them
 * directly.
 *
 *  - `restoreResponse`: `GET /{locale}/basket/restore/{token}`. Every answer is a 303 with
 *    `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy:
 *    no-referrer`; the `Location` never carries the token. An ended link answers the identical 303
 *    to `/{locale}/basket/link-ended` and writes nothing.
 *  - `oneClickUnsubscribeResponse`: RFC 8058's `POST`, body `List-Unsubscribe=One-Click` only (no
 *    cookie, session, CSRF token or Origin check: the mail provider posts it). The same 200 body
 *    for a known and an unknown token; any other body answers 400 and writes nothing.
 */
import { TRANSACTIONAL_ROBOTS_HEADERS } from "@/modules/seo";
import { z } from "zod";

import { logger } from "@/lib/logger";
import type { OrderExecutor, RawRow } from "@/modules/orders";

import {
  basketCookieHeader,
  checkoutCookieHeader,
  draftTokenFromCookieHeader,
} from "../cookie";
import { restoreBasket } from "./restore";
import { unsubscribeBasketReminders } from "./unsubscribe";

/** Runs `fn` in one `system` transaction (injected by the suites). */
export type ReminderTransaction = <T>(
  name: string,
  fn: (executor: OrderExecutor) => Promise<T>,
) => Promise<T>;

export const defaultReminderTransaction: ReminderTransaction = async (
  name,
  fn,
) => {
  const { withSystemContext } = await import("@/lib/db");
  return withSystemContext(name, (db) =>
    fn({
      async execute(query) {
        const rows: unknown = await db.execute(query);
        return rows as readonly RawRow[];
      },
    }),
  );
};

/** The headers every reminder link response carries (AC-16, AC-31). */
export const REMINDER_LINK_HEADERS: Readonly<Record<string, string>> = {
  "cache-control": "no-store, private",
  ...TRANSACTIONAL_ROBOTS_HEADERS,
  "referrer-policy": "no-referrer",
};

function seeOther(location: string, cookies: readonly string[] = []): Response {
  const headers = new Headers({ ...REMINDER_LINK_HEADERS, location });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

export async function restoreResponse(
  request: Request,
  input: {
    readonly locale: string;
    readonly token: string;
    readonly now?: Date;
    readonly transaction?: ReminderTransaction;
  },
): Promise<Response> {
  const now = input.now ?? new Date();
  const outcome = await (input.transaction ?? defaultReminderTransaction)(
    "basket-reminders.restore",
    (executor) =>
      restoreBasket({
        token: input.token,
        locale: input.locale,
        cookieToken: draftTokenFromCookieHeader(
          request.headers.get("cookie") ?? undefined,
        ),
        now,
        executor,
      }),
  );
  if (outcome.kind === "ended") {
    logger.info({}, "basket_reminder.link_ended");
    return seeOther(`/${input.locale}/basket/link-ended`);
  }
  logger.info(
    { same_browser: outcome.kind === "same" },
    "basket_reminder.restored",
  );
  const basket = `/${input.locale}/basket`;
  if (outcome.kind === "same") return seeOther(basket);
  return seeOther(basket, [
    checkoutCookieHeader(outcome.token),
    basketCookieHeader(outcome.lineCount),
  ]);
}

/** RFC 8058's body (§5.2 `OneClickUnsubscribeBodySchema`). */
export const OneClickUnsubscribeBodySchema = z
  .object({ "List-Unsubscribe": z.literal("One-Click") })
  .strict();

const ONE_CLICK_MAX_BYTES = 1_024;

export async function oneClickUnsubscribeResponse(
  request: Request,
  input: {
    readonly token: string;
    readonly now?: Date;
    readonly transaction?: ReminderTransaction;
  },
): Promise<Response> {
  const headers = { ...REMINDER_LINK_HEADERS, "content-type": "text/plain" };
  const type = request.headers.get("content-type") ?? "";
  const text = await request.text().catch(() => "");
  const fields = Object.fromEntries(new URLSearchParams(text));
  const body = OneClickUnsubscribeBodySchema.safeParse(fields);
  if (
    !type.toLowerCase().startsWith("application/x-www-form-urlencoded") ||
    text.length > ONE_CLICK_MAX_BYTES ||
    !body.success
  ) {
    return new Response("Bad Request", { status: 400, headers });
  }
  await (input.transaction ?? defaultReminderTransaction)(
    "basket-reminders.unsubscribe",
    (executor) =>
      unsubscribeBasketReminders({
        token: input.token,
        channel: "header",
        now: input.now ?? new Date(),
        executor,
      }),
  );
  logger.info({ channel: "header" }, "basket_reminder.unsubscribed");
  return new Response("OK", { status: 200, headers });
}

/** `GET` on the one-click endpoint (AC-19). */
export function oneClickMethodNotAllowed(): Response {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { ...REMINDER_LINK_HEADERS, allow: "POST" },
  });
}
