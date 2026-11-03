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
  capturingMailer,
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
    await expect(send).rejects.toThrow("request failed");
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

/**
 * Spec 016 §5.2 and §12's request on spec 012 (TASK-331, AC-19): an optional idempotency key, sent
 * as Resend's `Idempotency-Key`, and the two 409s told apart by `MailerError.code`.
 */
describe("resendMailer idempotency (spec 016 AC-19)", () => {
  const key =
    "outbox:2f1d1c38-0b44-4c55-9a43-6f6f0e1f2a11:offer:6a0d7e2b-3c1f-4f63-8d0e-8b1c5a9e7d21";

  it("sends the key as the Idempotency-Key header and keeps it out of the body", async () => {
    const fetchImpl = respond(200, fixture.response200);
    await resendMailer(config, fetchImpl).send({
      ...message,
      idempotencyKey: key,
    });
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get("idempotency-key")).toBe(key);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([...fixture.requestFields].sort());
  });

  it("sends no Idempotency-Key header without a key", async () => {
    const fetchImpl = respond(200, fixture.response200);
    await resendMailer(config, fetchImpl).send(message);
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).has("idempotency-key")).toBe(false);
  });

  it("names invalid_idempotent_request on its 409", async () => {
    const send = resendMailer(
      config,
      respond(409, fixture.response409Invalid),
    ).send({ ...message, idempotencyKey: key });
    await expect(send).rejects.toMatchObject({
      name: "MailerError",
      code: "invalid_idempotent_request",
    });
    await expect(send).rejects.not.toThrow(/founder@example\.test/u);
  });

  it("names concurrent_idempotent_requests on its 409", async () => {
    await expect(
      resendMailer(config, respond(409, fixture.response409Concurrent)).send({
        ...message,
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({ code: "concurrent_idempotent_requests" });
  });

  it("gives every other failure, a 409 without a known name included, no code", async () => {
    await expect(
      resendMailer(config, respond(409, { statusCode: 409 })).send(message),
    ).rejects.toMatchObject({ code: null });
    await expect(
      resendMailer(config, respond(500, {})).send(message),
    ).rejects.toMatchObject({ code: null });
    await expect(
      resendMailer(config, respond(422, fixture.response422)).send(message),
    ).rejects.toMatchObject({ code: null });
  });

  it("refuses a key longer than Resend's 256 characters before any request", async () => {
    const fetchImpl = respond(200, fixture.response200);
    await expect(
      resendMailer(config, fetchImpl).send({
        ...message,
        idempotencyKey: "k".repeat(257),
      }),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("resendMailer attachments (spec 016 §5.2 B1, B4; TASK-333)", () => {
  it("sends each file in Resend's documented fields: filename, content or path, content_type, content_id", async () => {
    const fetchImpl = respond(200, fixture.response200);
    await resendMailer(config, fetchImpl).send({
      ...message,
      tag: "order_buyer",
      attachments: [
        {
          filename: "delivery-FO-7K2M-9QXA.jpg",
          content: "/9j/4AAQ",
          contentType: "image/jpeg",
          contentId: "delivery-photo",
        },
        {
          filename: "terms-2026-10.pdf",
          path: "https://media.example.test/legal/terms-2026-10.pdf",
          contentType: "application/pdf",
        },
      ],
    });
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body["attachments"]).toEqual([
      {
        filename: "delivery-FO-7K2M-9QXA.jpg",
        content: "/9j/4AAQ",
        content_type: "image/jpeg",
        content_id: "delivery-photo",
      },
      {
        filename: "terms-2026-10.pdf",
        path: "https://media.example.test/legal/terms-2026-10.pdf",
        content_type: "application/pdf",
      },
    ]);
  });

  it("refuses a file with both or neither of content and path, an http URL, or a path in its name, before any request", async () => {
    const fetchImpl = respond(200, fixture.response200);
    for (const file of [
      { filename: "a.pdf" },
      {
        filename: "a.pdf",
        content: "JVBE",
        path: "https://example.test/a.pdf",
      },
      { filename: "a.pdf", path: "http://example.test/a.pdf" },
      { filename: "../a.pdf", content: "JVBE" },
      { filename: "a.pdf", content: "not base64!" },
    ]) {
      await expect(
        resendMailer(config, fetchImpl).send({
          ...message,
          attachments: [file],
        } as never),
      ).rejects.toThrow();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("capturingMailer idempotency, as Resend's (spec 016 AC-19)", () => {
  it("returns the first reference for the same key and body, captures once, and 409s another body", async () => {
    const mailer = capturingMailer("ops@example.test");
    mailer.clear();
    const keyed = {
      ...message,
      idempotencyKey: "job:assignment.remind:1:offer-reminder:x",
    };
    const first = await mailer.send(keyed);
    const again = await mailer.send(keyed);
    expect(again.providerRef).toBe(first.providerRef);
    expect(mailer.messages()).toHaveLength(1);
    await expect(
      mailer.send({ ...keyed, html: "<p>Another token</p>" }),
    ).rejects.toMatchObject({ code: "invalid_idempotent_request" });
    expect(mailer.messages()).toHaveLength(1);
    await mailer.send(message);
    await mailer.send(message);
    expect(mailer.messages()).toHaveLength(3);
    mailer.clear();
  });
});

describe("resendMailer attachments (spec 030a §5.2, AC-21; TASK-365)", () => {
  const pdf = Buffer.from("%PDF-1.7 statement").toString("base64");

  it("sends each file as Resend's attachments[] { filename, content (base64), content_type }", async () => {
    const fetchImpl = respond(200, fixture.response200);
    await resendMailer(config, fetchImpl).send({
      ...message,
      attachments: [
        {
          filename: "payout-statement-P-000127.pdf",
          contentType: "application/pdf",
          content: pdf,
        },
      ],
    });
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body["attachments"]).toEqual([
      {
        filename: "payout-statement-P-000127.pdf",
        content: pdf,
        content_type: "application/pdf",
      },
    ]);
  });

  it("sends no attachments field for a message without files", async () => {
    const fetchImpl = respond(200, fixture.response200);
    await resendMailer(config, fetchImpl).send(message);
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect("attachments" in body).toBe(false);
  });

  it("refuses, before any request, a file that is not base64, not a PDF, or named with a path", async () => {
    const fetchImpl = respond(200, fixture.response200);
    const mailer = resendMailer(config, fetchImpl);
    const file = {
      filename: "payout-statement-P-000127.pdf",
      contentType: "application/pdf",
      content: pdf,
    } as const;
    for (const bad of [
      { ...file, content: "not base64 at all!" },
      { ...file, contentType: "text/html" },
      { ...file, filename: "../etc/passwd" },
      { ...file, filename: "a/b.pdf" },
    ]) {
      await expect(
        mailer.send({ ...message, attachments: [bad] } as never),
      ).rejects.toThrow();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("the capturing mailer keeps the files with the message", async () => {
    const capture = capturingMailer("Flowers Overseas <orders@example.test>");
    const to = `attach-${String(Date.now())}@example.test`;
    await capture.send({
      ...message,
      to,
      attachments: [
        {
          filename: "payout-statement-P-000001.pdf",
          contentType: "application/pdf",
          content: pdf,
        },
      ],
    });
    expect(capture.messages(to)[0]?.attachments?.[0]?.content).toBe(pdf);
  });
});
