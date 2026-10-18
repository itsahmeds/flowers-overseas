/**
 * No sign-in token reaches a log line or a Sentry event (spec 012 §8 "Logs and PII"; TASK-217).
 *
 * The emailed link is `{confirm}?t={token}` and Auth.js's email callback is `…?token={token}`
 * (built in process by `src/lib/auth/surface.ts`). Whatever carries them — a field named `token`
 * or `*_token`, a URL in any field, the message, an error's stack, percent-encoded — the token's
 * value is replaced by a marker. The `isRedactedKey` predicate of spec 001 AC-55 is unchanged: a
 * credential is not personal data, so URLs that carry one by spec 012's design stay legal.
 */
import { describe, expect, it } from "vitest";

import {
  REDACTED,
  REDACTED_TOKEN,
  createLogger,
  isRedactedKey,
  isRedactedLogKey,
} from "../../src/lib/logger.ts";
import { scrubEvent } from "../../src/lib/sentry.ts";

const TOKEN = "Xq3vB7_kLm9-Pq2rSt4uVw8xYz0aBcDeFgHiJkLmNoP";
const CONFIRM = `https://flowersoverseas.com/admin/sign-in/confirm?t=${TOKEN}`;
const CALLBACK = `https://flowersoverseas.com/admin/api/auth/callback/email?token=${TOKEN}&callbackUrl=%2Fadmin`;

function capture(): { lines: string[]; log: ReturnType<typeof createLogger> } {
  const lines: string[] = [];
  return {
    lines,
    log: createLogger({
      level: "trace",
      pretty: false,
      write: (line: string) => {
        lines.push(line);
      },
    }),
  };
}

describe("a sign-in token never reaches a log line", () => {
  it.each([
    ["a field named token", { token: TOKEN }],
    ["a *_token field", { sign_in_token: TOKEN, csrfToken: TOKEN }],
    ["the confirm link in any field", { url: CONFIRM }],
    ["the callback URL in any field", { href: CALLBACK }],
    ["a nested array", { attempts: [{ link: CONFIRM }] }],
    ["a percent-encoded link", { next: encodeURIComponent(CONFIRM) }],
    [
      "an error whose stack names the link",
      { error: new Error(`failed ${CALLBACK}`) },
    ],
  ])("%s", (_label, fields) => {
    const { lines, log } = capture();
    log.info(fields as Record<string, unknown>, "auth.event");
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("in the message itself", () => {
    const { lines, log } = capture();
    log.warn({}, `could not open ${CONFIRM} or ${CALLBACK}`);
    const out = lines.join("\n");
    expect(out).not.toContain(TOKEN);
    expect(out).toContain(REDACTED_TOKEN);
  });

  it("keys a token field to the redaction marker", () => {
    const { lines, log } = capture();
    log.info({ token: TOKEN }, "auth.event");
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ token: REDACTED });
  });

  it("keeps the send log's hash readable", () => {
    expect(isRedactedLogKey("identifier_hash")).toBe(false);
    expect(isRedactedLogKey("identifier")).toBe(true);
    expect(isRedactedLogKey("display_name")).toBe(true);
  });

  it("leaves AC-55's PII predicate alone: a credential is not personal data", () => {
    expect(isRedactedLogKey("token")).toBe(true);
    expect(isRedactedKey("token")).toBe(false);
  });
});

describe("a sign-in token never reaches a Sentry event", () => {
  it("scrubs the field, the URL and the message", () => {
    const event = scrubEvent({
      message: `failed ${CONFIRM}`,
      request: { url: CALLBACK },
      extra: { token: TOKEN, link: CONFIRM },
    } as never);
    expect(JSON.stringify(event)).not.toContain(TOKEN);
  });
});
