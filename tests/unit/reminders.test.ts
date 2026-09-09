/**
 * `POST /api/reminders` — the occasion-reminder stub (spec 004 design round 6; TASK-049).
 *
 * The failure cases are the point of this suite, not the happy path: an endpoint that accepts an
 * email address is the one place in Phase 0 where personal data enters the application, so what
 * is asserted is that it **leaves nothing behind** — no log line containing the address, no
 * store, no cookie — and that a hostile submission cannot steer the redirect or the body size.
 */
import { describe, expect, it, vi } from "vitest";

import type { Logger } from "../../src/lib/logger.ts";
import { createRateLimiter } from "../../src/lib/csp-report.ts";
import {
  acceptsFormPost,
  discardReminderSink,
  REMINDERS_MAX_BYTES,
  REMINDERS_RATE_LIMIT,
  REMINDERS_WINDOW_MS,
  ReminderSignupSchema,
  reminderResponse,
} from "../../src/lib/reminders.ts";

function testLogger(): { logger: Logger; lines: unknown[][] } {
  const lines: unknown[][] = [];
  const record =
    (level: string) =>
    (...args: unknown[]) => {
      lines.push([level, ...args]);
    };
  const logger = {
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    child: () => logger,
  } as unknown as Logger;
  return { logger, lines };
}

function post(
  body: string,
  contentType = "application/x-www-form-urlencoded",
): Request {
  return new Request("https://example.test/api/reminders", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

const homePath = (locale: string): string | undefined =>
  ["en", "en-gb", "de", "pl"].includes(locale) ? `/${locale}` : undefined;

describe("ReminderSignupSchema", () => {
  it("accepts an address and a locale", () => {
    expect(
      ReminderSignupSchema.parse({ email: " a@b.test ", locale: "pl" }),
    ).toEqual({ email: "a@b.test", locale: "pl" });
  });

  it.each([
    ["not an email", { email: "nope", locale: "en" }],
    ["an empty address", { email: "", locale: "en" }],
    [
      "a 300-character address",
      { email: `${"a".repeat(290)}@b.test`, locale: "en" },
    ],
    ["a path as a locale", { email: "a@b.test", locale: "../../etc" }],
    ["an extra field", { email: "a@b.test", locale: "en", admin: "1" }],
  ])("rejects %s", (_case, input) => {
    expect(ReminderSignupSchema.safeParse(input).success).toBe(false);
  });
});

describe("the Phase-0 sink discards", () => {
  it("logs a counter and never the address", async () => {
    const { logger, lines } = testLogger();
    await discardReminderSink(logger).accept({
      email: "someone@example.test",
      locale: "en",
    });
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain("someone@example.test");
    expect(JSON.stringify(lines)).toContain("reminder_signup");
  });
});

describe("reminderResponse", () => {
  it("accepts a form post and redirects to the locale footer (303)", async () => {
    const { logger } = testLogger();
    const response = await reminderResponse(
      post("email=a%40b.test&locale=pl"),
      { homePath, logger },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/pl#footer-reminders");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("hands the parsed signup to the sink and stores nothing itself", async () => {
    const accept = vi.fn().mockResolvedValue(undefined);
    const response = await reminderResponse(
      post("email=a%40b.test&locale=en"),
      { homePath, sink: { accept } },
    );
    expect(response.status).toBe(303);
    expect(accept).toHaveBeenCalledWith({ email: "a@b.test", locale: "en" });
  });

  it("refuses a method other than POST", async () => {
    const request = new Request("https://example.test/api/reminders");
    const response = await reminderResponse(request, { homePath });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("refuses a body that is not a form post", async () => {
    const response = await reminderResponse(
      post('{"email":"a@b.test"}', "application/json"),
      { homePath },
    );
    expect(response.status).toBe(415);
  });

  it("refuses an oversized body", async () => {
    const response = await reminderResponse(
      post(`email=${"a".repeat(REMINDERS_MAX_BYTES)}%40b.test&locale=en`),
      { homePath },
    );
    expect(response.status).toBe(413);
  });

  it("answers 413 to a chunked body over the cap, without buffering it (`/review 30`)", async () => {
    // A chunked request declares no `Content-Length`, so the declaration guard cannot see it:
    // the read itself has to stop. The stream below would emit 256 KB if it were drained; the
    // assertion is that it is cancelled a chunk past the 4 KB cap, which is what proves the
    // handler is not calling `request.text()` first.
    const chunk = new TextEncoder().encode("x".repeat(1024));
    let emitted = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emitted >= 256) {
          controller.close();
          return;
        }
        emitted += 1;
        controller.enqueue(chunk);
      },
    });
    const accept = vi.fn().mockResolvedValue(undefined);

    const response = await reminderResponse(
      new Request("https://example.test/api/reminders", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        duplex: "half",
      } as RequestInit),
      { homePath, sink: { accept } },
    );

    expect(response.status).toBe(413);
    expect(accept).not.toHaveBeenCalled();
    // 4 KB cap, 1 KB chunks: five reads at most, so the 256 KB was never buffered.
    expect(emitted).toBeLessThanOrEqual(REMINDERS_MAX_BYTES / 1024 + 1);
  });

  it("drops signups past the per-instance allowance with a 429, not a 5xx", async () => {
    // The endpoint is an unauthenticated public POST, so the flood case is the ordinary case.
    // What is asserted: the limited response is a client error the browser can act on, carries a
    // `Retry-After`, reaches neither the sink nor the schema, logs a counter and no address, and
    // the next window is served again.
    let now = 0;
    const limiter = createRateLimiter(2, 1000, () => now);
    const { logger, lines } = testLogger();
    const accept = vi.fn().mockResolvedValue(undefined);
    const options = { homePath, logger, limiter, sink: { accept } };

    for (const expected of [303, 303, 429, 429]) {
      const response = await reminderResponse(
        post("email=flood%40example.test&locale=en"),
        options,
      );
      expect(response.status).toBe(expected);
      expect(response.status).toBeLessThan(500);
    }
    expect(accept).toHaveBeenCalledTimes(2);

    const limited = await reminderResponse(
      post("email=flood%40example.test&locale=en"),
      options,
    );
    // The hint is the real window, not the test limiter's: it is what a browser should honour.
    expect(limited.headers.get("retry-after")).toBe(
      String(REMINDERS_WINDOW_MS / 1000),
    );
    expect(limited.headers.get("cache-control")).toBe("no-store");

    expect(JSON.stringify(lines)).toContain("reminder_rate_limited");
    expect(JSON.stringify(lines)).not.toContain("flood@example.test");

    now = 1001;
    const next = await reminderResponse(
      post("email=flood%40example.test&locale=en"),
      options,
    );
    expect(next.status).toBe(303);
  });

  it("states its allowance in signups and minutes, not in magic numbers", () => {
    expect(REMINDERS_RATE_LIMIT).toBe(60);
    expect(REMINDERS_WINDOW_MS).toBe(60_000);
  });

  it("answers 400 for an unparsable submission, and logs no address", async () => {
    const { logger, lines } = testLogger();
    const response = await reminderResponse(
      post("email=not-an-email&locale=en"),
      { homePath, logger },
    );
    expect(response.status).toBe(400);
    expect(JSON.stringify(lines)).not.toContain("not-an-email");
    expect(JSON.stringify(lines)).toContain("reminder_invalid");
  });

  it("answers 400 for a locale we do not serve, so no `Location` is invented", async () => {
    const response = await reminderResponse(
      post("email=a%40b.test&locale=fr"),
      { homePath },
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });

  it("cannot be steered off-site by the submitted locale", async () => {
    for (const locale of [
      "//evil.test",
      "https://evil.test",
      "en/../../evil",
    ]) {
      const response = await reminderResponse(
        post(`email=a%40b.test&locale=${encodeURIComponent(locale)}`),
        { homePath },
      );
      expect(response.status, locale).toBe(400);
      expect(response.headers.get("location"), locale).toBeNull();
    }
  });

  it("answers 500 when the sink refuses, rather than pretending to have stored it", async () => {
    const { logger, lines } = testLogger();
    const response = await reminderResponse(
      post("email=a%40b.test&locale=en"),
      {
        homePath,
        logger,
        sink: { accept: () => Promise.reject(new Error("nope")) },
      },
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(lines)).toContain("reminder_sink_failed");
  });

  it("reads only `content-type` and `content-length` (no IP, UA or Referer)", async () => {
    const request = post("email=a%40b.test&locale=en");
    const read: string[] = [];
    const original = request.headers.get.bind(request.headers);
    request.headers.get = (name: string) => {
      read.push(name.toLowerCase());
      return original(name);
    };
    await reminderResponse(request, { homePath });
    expect([...new Set(read)].sort()).toEqual([
      "content-length",
      "content-type",
    ]);
  });
});

describe("acceptsFormPost", () => {
  it.each([
    ["application/x-www-form-urlencoded", true],
    ["application/x-www-form-urlencoded; charset=UTF-8", true],
    ["application/json", false],
    ["multipart/form-data; boundary=x", false],
    [null, false],
  ])("%s -> %s", (contentType, expected) => {
    expect(acceptsFormPost(contentType)).toBe(expected);
  });
});
