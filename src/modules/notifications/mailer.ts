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
 * spec 011 adds `florist_sign_in` and `florist_application_alert`.
 *
 * No log line here carries an address, a subject or a body (`CLAUDE.md`: no PII in logs).
 */
import { z } from "zod";

import { type MailerConfig, mailerConfig } from "@/lib/env.auth";

/** The tag registry: every kind of message the application sends. */
export const mailTags = ["admin_sign_in"] as const;
export type MailTag = (typeof mailTags)[number];

export const MailMessageSchema = z
  .object({
    tag: z.enum(mailTags),
    to: z.email(),
    subject: z.string().trim().min(1).max(200),
    text: z.string().min(1),
    html: z.string().min(1),
  })
  .strict();
export type MailMessage = z.infer<typeof MailMessageSchema>;

export interface Mailer {
  send(message: MailMessage): Promise<{ providerRef: string }>;
}

/** A failed send. The message names the provider's status, never the recipient or the content. */
export class MailerError extends Error {
  constructor(detail: string) {
    super(`mail send failed: ${detail}`);
    this.name = "MailerError";
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
          },
          body: JSON.stringify({
            from: config.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
            tags: [{ name: "tag", value: message.tag }],
          }),
        });
      } catch {
        throw new MailerError("request failed");
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
      const providerRef = `captured-${crypto.randomUUID()}`;
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
