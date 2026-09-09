/**
 * The occasion-reminder signup, its sink and the `POST /api/reminders` contract (spec 004 §2's
 * design-round-6 addition, recorded in `docs/design/homepage-v1/README.md`; TASK-049).
 *
 * Shaped exactly like `src/lib/consent.ts` — no `server-only`, no Next import — so the whole
 * response is unit-testable and the route file under `src/app/` stays thin (`plan/01` §5).
 *
 * ## What this endpoint does in Phase 0: nothing durable
 *
 * The footer's signup is real UI on a **stub**: the handler validates the submission, hands it to
 * a `ReminderSink`, and Phase 0's sink is `discardReminderSink`, which stores nothing, sends
 * nothing and logs **no email address**. That is not laziness, it is the only lawful shape
 * available today. Double opt-in (`plan/07`) means the address may only be stored *after* the
 * subscriber confirms it from an email we sent, and spec 004 ships no mail transport, no
 * `subscriber` table and no unsubscribe endpoint. Storing an address now would create a marketing
 * list with no consent record, no confirmation and no way out of it — three GDPR problems in
 * exchange for a demo. The footer says so in plain words (`footer.reminders.consent`: "Consent is
 * asked in the email we send first; nothing is stored until you confirm"), and here the code says
 * the same thing.
 *
 * The seam is the deliverable: spec 017 (Resend) plus the `subscriber` table implement
 * `ReminderSink` a second time — send the confirmation, store the pending record — with no change
 * to the route, the footer or the form.
 *
 * ## PII
 *
 * The address is read, validated and dropped. It is **never logged** (`CLAUDE.md`: no PII in
 * logs), never put in a URL, never set in a cookie: the only observability is a counter
 * (`reminder_signup: 1`), which is what `tests/unit/reminders.test.ts` asserts by spying on the
 * logger. `plan/07`'s data-minimisation rule applied to a form that currently keeps nothing.
 *
 * ## Why a redirect and not JSON
 *
 * The form is a plain `<form method="post">` with **no client JavaScript** (§14 A1's budget
 * guardrail), so the browser navigates to the response. A JSON body would render as JSON text in
 * the viewport. The handler therefore answers `303 See Other` to the locale home the form
 * submitted, anchored at the signup, which is the classic POST/redirect/GET for a scripting-free
 * form. The target is built from the submitted **locale code, validated against the locale
 * registry** by the caller's `homePath` resolver — never from `Referer` and never from a
 * user-supplied path — so an open redirect is not reachable. No confirmation state is rendered in
 * Phase 0: the footer lives in cached layout HTML that cannot read a query string, and the
 * confirmation channel is the double-opt-in email that spec 017 sends.
 */
import { z } from "zod";

import { logger as defaultLogger, type Logger } from "./logger";

/** A signup is ~100 bytes. Anything that declares more than this is refused unread. */
export const REMINDERS_MAX_BYTES = 4 * 1024;

/** The only content type a plain HTML form posts. */
export const REMINDERS_CONTENT_TYPE = "application/x-www-form-urlencoded";

export const REMINDERS_HEADERS: Readonly<Record<string, string>> =
  Object.freeze({
    "cache-control": "no-store",
    "x-robots-tag": "noindex",
  });

/**
 * The submitted form. `.strict()` is deliberate: a field this schema does not know is a field the
 * form did not render, which is either a bot or a change nobody reviewed.
 *
 * `email` is bounded (RFC 5321's 254-character limit) and trimmed; `locale` is a shape check only
 * — whether it is a locale we serve is the route's question, because that answer lives in the
 * locale registry and this file imports no module.
 */
export const ReminderSignupSchema = z
  .object({
    email: z.string().trim().min(3).max(254).pipe(z.email()),
    locale: z
      .string()
      .regex(/^[a-z]{2}(?:-[a-zA-Z]{2,8})?$/, "must be a locale code"),
  })
  .strict();

export type ReminderSignup = z.infer<typeof ReminderSignupSchema>;

/**
 * Where a signup goes. One method, so spec 017's "send the confirmation and store the pending
 * subscriber" is a drop-in behind the same interface.
 */
export interface ReminderSink {
  accept(signup: ReminderSignup): Promise<void>;
}

/**
 * Phase 0's sink: **discard**. One counter line, no address, no locale-plus-address pair (which
 * together are more identifying than either alone), and no email sent.
 */
export function discardReminderSink(
  logger: Logger = defaultLogger,
): ReminderSink {
  return {
    accept() {
      logger.info({ reminder_signup: 1 }, "reminder signup discarded");
      return Promise.resolve();
    },
  };
}

/** True when the request's `Content-Type` is a form post, parameters allowed. */
export function acceptsFormPost(contentType: string | null): boolean {
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return type === REMINDERS_CONTENT_TYPE;
}

export interface ReminderResponseOptions {
  /**
   * Maps a **validated** locale code to the path the visitor is sent back to, or `undefined` when
   * the code is not a locale we serve. The route passes `localePath()`, so no URL is concatenated
   * here and no unvalidated path can reach a `Location` header.
   */
  readonly homePath: (locale: string) => string | undefined;
  readonly sink?: ReminderSink;
  readonly logger?: Logger;
}

function empty(status: number, extra: Record<string, string> = {}): Response {
  return new Response(null, {
    status,
    headers: { ...REMINDERS_HEADERS, ...extra },
  });
}

/**
 * Handle one signup. Reads `content-type` and `content-length` and no other header: no IP, no
 * user agent, no `Referer` (§8's rule for `/api/consent`, applied to the second form in the app).
 *
 * `405` for a method other than `POST`, `415` for a body that is not a form post, `413` for one
 * that declares more than `REMINDERS_MAX_BYTES`, `400` for anything that fails
 * `ReminderSignupSchema` or names a locale we do not serve — counted, never quoted, because the
 * body contains an email address — `500` when the sink refuses, and `303` to the locale footer on
 * success.
 */
export async function reminderResponse(
  request: Request,
  options: ReminderResponseOptions,
): Promise<Response> {
  const log = options.logger ?? defaultLogger;
  const sink = options.sink ?? discardReminderSink(log);

  if (request.method !== "POST") return empty(405, { allow: "POST" });
  if (!acceptsFormPost(request.headers.get("content-type"))) return empty(415);

  const declared = Number((request.headers.get("content-length") ?? "").trim());
  if (Number.isFinite(declared) && declared > REMINDERS_MAX_BYTES) {
    return empty(413);
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > REMINDERS_MAX_BYTES) {
    return empty(413);
  }

  let signup: ReminderSignup;
  try {
    signup = ReminderSignupSchema.parse(
      Object.fromEntries(new URLSearchParams(raw)),
    );
  } catch {
    // A count, not the body and not the zod message: both quote the address (`plan/07` §8).
    log.warn({ reminder_invalid: 1 }, "reminder signup unparsable");
    return empty(400);
  }

  const home = options.homePath(signup.locale);
  if (home === undefined) {
    log.warn({ reminder_invalid: 1 }, "reminder signup for an unknown locale");
    return empty(400);
  }

  try {
    await sink.accept(signup);
  } catch {
    log.error({ reminder_sink_failed: 1 }, "reminder signup not accepted");
    return empty(500);
  }

  // POST/redirect/GET, back to the form the visitor submitted. `303`, not `302`: the follow-up
  // must be a GET even on the browsers that keep the method on a 302.
  return empty(303, { location: `${home}#footer-reminders` });
}
