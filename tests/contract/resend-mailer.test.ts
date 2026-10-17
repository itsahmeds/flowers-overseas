/**
 * The Resend adapter against Resend's documented send-email contract (spec 012 §2.2, §5.2, AC-2,
 * AC-8; ADR-0013; TASK-217). Fixture: `tests/fixtures/resend/send-email.json`.
 *
 * The adapter is the only code that names Resend's endpoint; this pins the request it builds (the
 * bearer key, the documented fields, the tag) and what it makes of a 200 and of a failure: the
 * provider reference, or a `MailerError` that names the status and never the recipient.
 */
import { describe, expect, it, vi } from "vitest";

import fixture from "../fixtures/resend/send-email.json" with { type: "json" };
import {
  MailerError,
  RESEND_ENDPOINT,
  resendMailer,
} from "../../src/modules/notifications/mailer.ts";

const message = {
  tag: "admin_sign_in",
  to: "founder@example.test",
  subject: "Sign in to Flowers Overseas admin",
  text: "Continue: https://example.test/admin/sign-in/confirm?t=abc",
  html: "<p>Continue</p>",
} as const;

const config = {
  apiKey: "re_test_key",
  from: "Flowers Overseas <sign-in@example.test>",
};

function respond(status: number, body: unknown) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

describe("resendMailer (Resend send-email contract)", () => {
  it("POSTs the documented fields with the bearer key and returns the provider id", async () => {
    const fetchImpl = respond(200, fixture.response200);
    const result = await resendMailer(config, fetchImpl).send(message);
    expect(result).toEqual({ providerRef: fixture.response200.id });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(RESEND_ENDPOINT);
    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer re_test_key",
    );
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([...fixture.requestFields].sort());
    expect(body).toEqual({
      from: config.from,
      to: ["founder@example.test"],
      subject: message.subject,
      text: message.text,
      html: message.html,
      tags: [{ name: "tag", value: "admin_sign_in" }],
    });
  });

  it("throws a MailerError naming the status, and not the address, on a 422", async () => {
    const send = resendMailer(config, respond(422, fixture.response422)).send(
      message,
    );
    await expect(send).rejects.toThrow(MailerError);
    await expect(send).rejects.toThrow("HTTP 422");
    await expect(send).rejects.not.toThrow(/founder@example\.test/u);
  });

  it("throws on a 200 without an id", async () => {
    await expect(
      resendMailer(config, respond(200, {})).send(message),
    ).rejects.toThrow(MailerError);
  });

  it("throws on a network failure without the address", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.reject(new Error("connect ECONNREFUSED founder@example.test")),
    );
    const send = resendMailer(config, fetchImpl).send(message);
    await expect(send).rejects.toThrow("network error");
    await expect(send).rejects.not.toThrow(/founder@example\.test/u);
  });

  it("refuses a message with an unregistered tag or a malformed address, before any request", async () => {
    const fetchImpl = respond(200, fixture.response200);
    const mailer = resendMailer(config, fetchImpl);
    await expect(
      mailer.send({ ...message, tag: "newsletter" } as never),
    ).rejects.toThrow();
    await expect(
      mailer.send({ ...message, to: "not-an-address" }),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
