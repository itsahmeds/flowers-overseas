/**
 * The one `Mailer` (spec 012 §2.2, §5.2, AC-2, AC-8; ADR-0013; TASK-217).
 *
 * Every email the application sends goes through `Mailer.send(message)`. Two implementations,
 * and no third anywhere in the repository (AC-8's scan):
 *
 *  - `resendMailer` — Resend's HTTP API (`POST https://api.resend.com/emails`), in `staging` and
 *    `production`. Called with `fetch`, so no SDK is added; this adapter is the only place that
 *    names Resend's endpoint. Errors carry the HTTP status and never the address or the body.
 *  - `capturingMailer` — keeps the last messages in process memory, in `development`, `test` and
 *    `preview`. The e2e suite reads them through `GET /api/internal/mail-capture`, which is behind
 *    `INTERNAL_CRON_SECRET` and refused in `production` and `staging`.
 *
 * Which one runs is `mailerConfig()` in `src/lib/env.auth.ts` (`MAILER`, else the environment's
 * default). `MailMessageSchema` carries a **tag** from a closed registry: `admin_sign_in` here;
 * spec 011 adds `florist_sign_in` and `florist_application_alert`; spec 016's pipeline adds one tag
 * per audience (`order_buyer`, `order_florist`, `ops_alert`); spec 018 adds `tracking_link` (T16).
 * A message may carry `attachments` (spec 030a's statement PDF, TASK-365), sent as Resend's
 * `attachments` array of base64 contents.
 *
 * **Idempotency (spec 016 §5.2, §12's request on spec 012; TASK-331).** A message may carry an
 * `idempotencyKey` (1 to 256 characters, Resend's limit), sent as the `Idempotency-Key` header.
 * Resend keeps a key 24 hours: the same key with the same body returns the first send's id; with a
 * different body it answers `409 invalid_idempotent_request`; while the first request is still in
 * flight, `409 concurrent_idempotent_requests`. `MailerError.code` names those two, so the
 * pipeline can tell "already accepted" from "try again". The capturing mailer keeps the same rule
 * in memory, so the suites see what Resend would do.
 *
 * No log line here carries an address, a subject or a body (`CLAUDE.md`: no PII in logs).
 */
import { z } from "zod";

import { type MailerConfig, mailerConfig } from "@/lib/env.auth";

/** The tag registry: every kind of message the application sends. */
export const mailTags = [
  "admin_sign_in",
  "florist_sign_in",
  "order_buyer",
  "order_florist",
  "ops_alert",
  // Spec 011 §5.2 (TASK-213): the founder's alert for each stored florist application.
  "florist_application_alert",
  // Spec 018 §5.2 (TASK-339): T16, the tracking lookup's answer.
  "tracking_link",
  // Spec 018 §14 A-founder-2026-10-22 C.3, C.7.4 (TASK-351): T14, the buyer's sign-in link, and
  // T18, the occasion reminder.
  "buyer_sign_in",
  "occasion_reminder",
  // Spec 025 §5.2 (TASK-489): the founder's daily alert summary (`ops_alert` covers each alert).
  "ops_daily_summary",
] as const;
export type MailTag = (typeof mailTags)[number];

/**
 * One attached file. The bytes travel as base64, the form Resend's `attachments[].content` takes,
 * or (spec 016 B1's terms PDF) as an `https` URL Resend fetches at send time (`attachments[].path`);
 * the name is a plain file name (no path, no address, no person). Spec 030a's payout statement
 * (TASK-365) and spec 016's B1 terms and invoice PDFs are PDFs; B4's delivery photo is a JPEG, sent
 * once inline (`contentId`, shown in the HTML part as `cid:{contentId}`,
 * https://resend.com/docs/dashboard/emails/embed-inline-images) and once as a file (TASK-333).
 */
export const MailAttachmentSchema = z
  .object({
    filename: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u),
    contentType: z.enum(["application/pdf", "image/jpeg"]),
    content: z.base64().min(1).optional(),
    path: z.url({ protocol: /^https$/u }).optional(),
    contentId: z
      .string()
      .regex(/^[A-Za-z0-9._-]{1,64}$/u)
      .optional(),
  })
  .strict()
  .refine(
    (file) => (file.content === undefined) !== (file.path === undefined),
    { error: "an attachment carries its content or its URL, exactly one" },
  );
export type MailAttachment = z.infer<typeof MailAttachmentSchema>;

/**
 * At most this many files per message: B1 of a five-order purchase carries the terms PDF of each
 * distinct terms version and up to five invoices (spec 016 §14 A-founder-2026-10-22).
 */
export const MAX_ATTACHMENTS = 10;

export const MailMessageSchema = z
  .object({
    tag: z.enum(mailTags),
    to: z.email(),
    subject: z.string().trim().min(1).max(200),
    text: z.string().min(1),
    html: z.string().min(1),
    /** Sent as `Idempotency-Key` (spec 016 §5.2): `{source_key}:{template_key}:{recipient_ref}`. */
    idempotencyKey: z.string().min(1).max(256).optional(),
    /** Files sent with the message (spec 030a's statement PDF; spec 016's B1, B4 and B8). */
    attachments: z
      .array(MailAttachmentSchema)
      .min(1)
      .max(MAX_ATTACHMENTS)
      .optional(),
  })
  .strict();
export type MailMessage = z.infer<typeof MailMessageSchema>;

export interface Mailer {
  send(message: MailMessage): Promise<{ providerRef: string }>;
}

/**
 * Resend's two idempotency refusals (https://resend.com/docs/dashboard/emails/idempotency-keys):
 * the key was used with another body (the first send was accepted), or a request with the key is
 * still in flight (retry later).
 */
export const idempotencyErrorCodes = [
  "invalid_idempotent_request",
  "concurrent_idempotent_requests",
] as const;
export type IdempotencyErrorCode = (typeof idempotencyErrorCodes)[number];

/**
 * A failed send. The message names the provider's status (and, for a 409, Resend's error name),
 * never the recipient or the content.
 */
export class MailerError extends Error {
  /** Set for Resend's two idempotency 409s; null for every other failure. */
  readonly code: IdempotencyErrorCode | null;

  constructor(detail: string, code: IdempotencyErrorCode | null = null) {
    super(`mail send failed: ${detail}`);
    this.name = "MailerError";
    this.code = code;
  }
}

const ResendErrorSchema = z.object({ name: z.enum(idempotencyErrorCodes) });

/** The idempotency code of a 409 body, or null (an unreadable body is an ordinary failure). */
async function idempotencyCodeOf(
  response: Response,
): Promise<IdempotencyErrorCode | null> {
  try {
    const parsed = ResendErrorSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.name : null;
  } catch {
    return null;
  }
}

/** Resend's endpoint (https://resend.com/docs/api-reference/emails/send-email). */
export const RESEND_ENDPOINT = "https://api.resend.com/emails";

const ResendResponseSchema = z.object({ id: z.string().min(1) });

/** Resend over `fetch`. `fetchImpl` is injectable so the contract test records the request. */
export function resendMailer(
  config: { readonly apiKey: string; readonly from: string },
  fetchImpl: typeof fetch = fetch,
): Mailer {
  return {
    async send(input) {
      const message = MailMessageSchema.parse(input);
      let response: Response;
      try {
        response = await fetchImpl(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
            ...(message.idempotencyKey === undefined
              ? {}
              : { "idempotency-key": message.idempotencyKey }),
          },
          body: JSON.stringify({
            from: config.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
            tags: [{ name: "tag", value: message.tag }],
            ...(message.attachments === undefined
              ? {}
              : {
                  attachments: message.attachments.map((file) => ({
                    filename: file.filename,
                    ...(file.content === undefined
                      ? {}
                      : { content: file.content }),
                    ...(file.path === undefined ? {} : { path: file.path }),
                    content_type: file.contentType,
                    ...(file.contentId === undefined
                      ? {}
                      : { content_id: file.contentId }),
                  })),
                }),
          }),
        });
      } catch {
        throw new MailerError("request failed");
      }
      if (response.status === 409) {
        const code = await idempotencyCodeOf(response);
        throw new MailerError(
          code === null ? "HTTP 409" : `HTTP 409 ${code}`,
          code,
        );
      }
      if (!response.ok) {
        throw new MailerError(`HTTP ${String(response.status)}`);
      }
      let parsed: ReturnType<typeof ResendResponseSchema.safeParse>;
      try {
        parsed = ResendResponseSchema.safeParse(await response.json());
      } catch {
        throw new MailerError("unexpected response body");
      }
      if (!parsed.success) throw new MailerError("unexpected response body");
      return { providerRef: parsed.data.id };
    },
  };
}

/** A captured message, as the e2e suite reads it. */
export interface CapturedMail extends MailMessage {
  readonly from: string;
  readonly providerRef: string;
  readonly capturedAt: string;
}

/** How many messages the capturing mailer keeps; older ones are dropped first. */
export const CAPTURE_LIMIT = 50;

const captured: CapturedMail[] = [];

/** How many keys the capturing mailer remembers. */
const KEY_LIMIT = 1_000;

/** Resend's idempotency window: a key is remembered 24 hours. */
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The capturing mailer's memory of keys: the body it was first used with, and its reference. */
const keys = new Map<
  string,
  { readonly body: string; readonly providerRef: string; readonly at: number }
>();

/** The fields Resend compares for a repeated key. */
function bodyOf(message: MailMessage): string {
  return JSON.stringify([
    message.tag,
    message.to,
    message.subject,
    message.text,
    message.html,
    message.attachments ?? null,
  ]);
}

export interface CapturingMailer extends Mailer {
  /** The kept messages, newest last; only those addressed to `to` when it is given. */
  messages(to?: string): readonly CapturedMail[];
  clear(): void;
}

/** The in-process mailer. Every instance shares one store, so the route reads what a send wrote. */
export function capturingMailer(from: string): CapturingMailer {
  return {
    send(input) {
      const message = MailMessageSchema.parse(input);
      const key = message.idempotencyKey;
      const seen = key === undefined ? undefined : keys.get(key);
      if (seen !== undefined && Date.now() - seen.at < IDEMPOTENCY_WINDOW_MS) {
        // Resend's rule, kept in memory: the same body is the first send again; another body is
        // the 409 that says the first one was accepted.
        if (seen.body === bodyOf(message)) {
          return Promise.resolve({ providerRef: seen.providerRef });
        }
        return Promise.reject(
          new MailerError(
            "HTTP 409 invalid_idempotent_request",
            "invalid_idempotent_request",
          ),
        );
      }
      const providerRef = `captured-${crypto.randomUUID()}`;
      if (key !== undefined) {
        keys.set(key, { body: bodyOf(message), providerRef, at: Date.now() });
        // Bounded like the messages: the oldest key goes first.
        for (const oldest of keys.keys()) {
          if (keys.size <= KEY_LIMIT) break;
          keys.delete(oldest);
        }
      }
      captured.push({
        ...message,
        from,
        providerRef,
        capturedAt: new Date().toISOString(),
      });
      captured.splice(0, Math.max(0, captured.length - CAPTURE_LIMIT));
      return Promise.resolve({ providerRef });
    },
    messages(to) {
      const wanted = to?.trim().toLowerCase();
      return captured.filter(
        (mail) => wanted === undefined || mail.to.toLowerCase() === wanted,
      );
    },
    clear() {
      captured.length = 0;
      keys.clear();
    },
  };
}

/** The mailer a resolved configuration names. */
export function mailerFor(
  config: MailerConfig,
  fetchImpl: typeof fetch = fetch,
): Mailer {
  return config.kind === "resend"
    ? resendMailer(config, fetchImpl)
    : capturingMailer(config.from);
}

/** The mailer of this environment, resolved from `process.env` at the first send. */
export function getMailer(): Mailer {
  return mailerFor(mailerConfig(process.env));
}
