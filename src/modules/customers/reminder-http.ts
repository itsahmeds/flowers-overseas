/**
 * `POST /api/reminders/unsubscribe?t=` (spec 018 §14 A-founder-2026-10-22 C.7.4, C.12; RFC 8058;
 * AC-58; TASK-353), as a function of a `Request`, so the route file stays thin and the suites call
 * it directly.
 *
 * The mail client's one-click stop: body `List-Unsubscribe=One-Click` (form-encoded), no cookie,
 * session, CSRF token or Origin check (the mail provider posts it). A valid `t` withdraws the
 * consent and deletes the reminders (`unsubscribeReminders`); a forged, unknown or rotated one
 * changes nothing; **both answer the same 200 body**, the done sentence, so the response says
 * nothing about the token. Any other body answers 400 and writes nothing; `GET` answers 405 (the
 * confirm page is `/{locale}/account/reminders/unsubscribe`). The token is never logged.
 */
import { createTranslator } from "next-intl";
import { z } from "zod";

import { loadMessages } from "@/modules/i18n";

import type { AccountRunner } from "./buyer-account";
import { unsubscribeReminders } from "./reminders";

/** The headers of every answer: never cached, never indexed, no referrer. */
export const REMINDER_UNSUBSCRIBE_HEADERS: Readonly<Record<string, string>> = {
  "cache-control": "no-store, private",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
};

/** RFC 8058's body. */
const OneClickBodySchema = z
  .object({ "List-Unsubscribe": z.literal("One-Click") })
  .strict();

const ONE_CLICK_MAX_BYTES = 1_024;
const TOKEN_MAX_LENGTH = 512;

/** The production `system` runner, loaded on first use (nothing connects at import). */
const defaultSystemRunner: AccountRunner = async (fn) => {
  const { withSystemContext } = await import("@/lib/db");
  return withSystemContext("reminders.unsubscribe", (db) =>
    fn({
      async execute(query) {
        const rows: unknown = await db.execute(query);
        return rows as readonly Record<string, unknown>[];
      },
    }),
  );
};

/** The done sentence, in English: the request carries no locale (C.15 `unsubscribeDone`). */
function doneText(): string {
  const t = createTranslator({
    locale: "en",
    messages: loadMessages("en", ["account"]),
    namespace: "account",
  });
  return t("reminders.unsubscribeDone");
}

export async function reminderOneClickResponse(
  request: Request,
  input: { readonly now?: Date; readonly system?: AccountRunner } = {},
): Promise<Response> {
  const headers = {
    ...REMINDER_UNSUBSCRIBE_HEADERS,
    "content-type": "text/plain; charset=utf-8",
  };
  const type = request.headers.get("content-type") ?? "";
  const text = await request.text().catch(() => "");
  const body = OneClickBodySchema.safeParse(
    Object.fromEntries(new URLSearchParams(text)),
  );
  if (
    !type.toLowerCase().startsWith("application/x-www-form-urlencoded") ||
    text.length > ONE_CLICK_MAX_BYTES ||
    !body.success
  ) {
    return new Response("Bad Request", { status: 400, headers });
  }
  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (token !== "" && token.length <= TOKEN_MAX_LENGTH) {
    await unsubscribeReminders(
      input.system ?? defaultSystemRunner,
      token,
      input.now ?? new Date(),
    );
  }
  return new Response(doneText(), { status: 200, headers });
}

/** `GET` on the one-click endpoint: 405 (a link scanner's fetch changes nothing). */
export function reminderOneClickMethodNotAllowed(): Response {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { ...REMINDER_UNSUBSCRIBE_HEADERS, allow: "POST" },
  });
}
