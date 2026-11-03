/**
 * The Resend webhook boundary against Resend's documented payloads (spec 016 §5.2 "Resend
 * webhooks"; AC-28, AC-29; T-28, T-29 contract half; TASK-335).
 *
 *  - Every fixture in `fixtures/resend/` parses with the schemas the code reads it with, and each
 *    status event maps to the status §5.2 names.
 *  - The Svix signature: Svix's published test vector verifies; a missing header, a bad signature,
 *    a tampered body and a timestamp 301 seconds off either way are refused; 300 seconds is not.
 *  - The endpoint's refusals touch no database: 503 without a secret, 413 over the cap, 401 with
 *    one counter line and one `webhook-signature:resend` report, 400 for a signed non-event.
 *  - Precedence is commutative and never moves a final status back.
 *  - The job throws on a `failed` run (pg-boss retries) and completes on `dead`.
 *
 * The database half (store before process, duplicates, the alert, `dead`) is
 * `tests/integration/resend-webhooks.test.ts`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createLogger } from "@/lib/logger";
import {
  FINAL_DELIVERY_STATUSES,
  RESEND_IGNORED_EVENTS,
  RESEND_STATUS_EVENTS,
  RESEND_STATUS_RANK,
  RESEND_WEBHOOK_MAX_BYTES,
  ResendEnvelopeSchema,
  ResendStatusEventSchema,
  ResendWebhookFailed,
  ingestResendWebhook,
  precedenceOf,
  runResendWebhookJob,
  svixSignature,
  verifySvixSignature,
  type ResendRejection,
  type ResendTransaction,
} from "@/modules/notifications";

const FIXTURES = join(import.meta.dirname, "fixtures/resend");
const SECRET = `whsec_${Buffer.from("resend-contract-signing-key-0001").toString("base64")}`;
const NOW = new Date("2026-11-04T03:00:00.000Z");
const NOW_S = Math.floor(NOW.getTime() / 1000);

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

function signed(
  body: string,
  options: { id?: string; at?: number; secret?: string } = {},
): Request {
  const id = options.id ?? "msg_contract_1";
  const timestamp = String(options.at ?? NOW_S);
  return new Request("https://flowersoverseas.com/api/webhooks/resend", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${svixSignature(options.secret ?? SECRET, id, timestamp, body)}`,
    },
  });
}

/** A transaction that fails the test if anything reaches the database. */
const noDatabase: ResendTransaction = () => {
  throw new Error("the database was reached");
};

describe("the recorded payloads parse (T-28, T-29)", () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith(".json"));

  it("has one fixture per documented email event", () => {
    expect(files.sort()).toEqual([
      "email-bounced.json",
      "email-clicked.json",
      "email-complained.json",
      "email-delivered.json",
      "email-delivery-delayed.json",
      "email-failed.json",
      "email-opened.json",
      "email-sent.json",
    ]);
  });

  it.each(files)(
    "%s passes the envelope, and a status event its schema",
    (file) => {
      const raw: unknown = JSON.parse(fixture(file));
      const envelope = ResendEnvelopeSchema.parse(raw);
      expect(envelope.data?.email_id).toBe(
        "56761188-7520-42d8-8898-ff6fc54ce618",
      );
      if (Object.hasOwn(RESEND_STATUS_EVENTS, envelope.type)) {
        expect(ResendStatusEventSchema.parse(raw).data.email_id).toBe(
          "56761188-7520-42d8-8898-ff6fc54ce618",
        );
      } else {
        expect(RESEND_IGNORED_EVENTS.has(envelope.type)).toBe(true);
      }
    },
  );

  it("maps each status event to the status §5.2 names", () => {
    expect(RESEND_STATUS_EVENTS).toEqual({
      "email.sent": "sent",
      "email.delivery_delayed": "delivery_delayed",
      "email.delivered": "delivered",
      "email.bounced": "bounced",
      "email.complained": "complained",
      "email.failed": "failed",
    });
    expect([...RESEND_IGNORED_EVENTS]).toEqual([
      "email.opened",
      "email.clicked",
    ]);
  });
});

describe("the Svix signature (AC-28)", () => {
  it("verifies Svix's published test vector", () => {
    // docs.svix.com "Verifying payloads manually": the documented secret, id, timestamp, body
    // and signature. Checked at the vector's own instant.
    const result = verifySvixSignature(
      '{"test": 2432232314}',
      {
        id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
        timestamp: "1614265330",
        signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
      },
      "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
      new Date(1_614_265_330_000),
    );
    expect(result).toEqual({ ok: true, id: "msg_p5jXN8AQM9LWM0D4loKWxJek" });
  });

  const body = fixture("email-delivered.json");
  const headersAt = (at: number, sig?: string) => {
    const timestamp = String(at);
    return {
      id: "msg_1",
      timestamp,
      signature: sig ?? `v1,${svixSignature(SECRET, "msg_1", timestamp, body)}`,
    };
  };

  it("accepts 299 and 300 seconds either way, refuses 301 either way", () => {
    for (const offset of [-300, -299, 0, 299, 300]) {
      expect(
        verifySvixSignature(body, headersAt(NOW_S + offset), SECRET, NOW),
        String(offset),
      ).toEqual({ ok: true, id: "msg_1" });
    }
    for (const offset of [-301, 301]) {
      expect(
        verifySvixSignature(body, headersAt(NOW_S + offset), SECRET, NOW),
        String(offset),
      ).toEqual({ ok: false, reason: "stale_timestamp" });
    }
  });

  it("refuses missing headers, a bad signature, a tampered body and another secret", () => {
    const good = headersAt(NOW_S);
    expect(
      verifySvixSignature(body, { ...good, signature: undefined }, SECRET, NOW),
    ).toEqual({ ok: false, reason: "missing_header" });
    expect(verifySvixSignature(body, { ...good, id: "" }, SECRET, NOW)).toEqual(
      { ok: false, reason: "missing_header" },
    );
    expect(
      verifySvixSignature(body, { ...good, timestamp: "12a" }, SECRET, NOW),
    ).toEqual({ ok: false, reason: "malformed_header" });
    expect(
      verifySvixSignature(body, headersAt(NOW_S, "v1,AAAA"), SECRET, NOW),
    ).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifySvixSignature(`${body} `, good, SECRET, NOW)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    const other = `whsec_${Buffer.from("another-key").toString("base64")}`;
    expect(verifySvixSignature(body, good, other, NOW)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    // A v2 entry with the right bytes is not a v1 signature.
    const v2 = good.signature.replace("v1,", "v2,");
    expect(
      verifySvixSignature(body, { ...good, signature: v2 }, SECRET, NOW),
    ).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("accepts the valid one among several (key rotation), and a unicode body by its bytes", () => {
    const unicode = JSON.stringify({
      type: "email.delivered",
      created_at: "2026-11-04T02:59:00.000Z",
      data: {
        email_id: "e-1",
        to: ["zoë.ñandú@exämple.test"],
        subject: "Zamówienie 🌷",
      },
    });
    const timestamp = String(NOW_S);
    const signature = `v1,AAAA v1,${svixSignature(SECRET, "msg_u", timestamp, unicode)}`;
    expect(
      verifySvixSignature(
        unicode,
        { id: "msg_u", timestamp, signature },
        SECRET,
        NOW,
      ),
    ).toEqual({ ok: true, id: "msg_u" });
  });
});

describe("the endpoint's refusals store nothing (AC-28)", () => {
  function deps(lines: string[], reports: ResendRejection[]) {
    return {
      secret: SECRET as string | undefined,
      enqueue: () => Promise.reject(new Error("nothing may be enqueued")),
      transaction: noDatabase,
      now: () => NOW,
      log: createLogger({ level: "info", write: (line) => lines.push(line) }),
      signatureRejected: (reason: ResendRejection) => {
        reports.push(reason);
      },
    };
  }

  it("answers 503 without a secret", async () => {
    const response = await ingestResendWebhook(
      signed(fixture("email-sent.json")),
      { ...deps([], []), secret: undefined },
    );
    expect(response.status).toBe(503);
  });

  it("answers 401 unsigned, badly signed and 5 min + 1 s old, with a counter and one report each", async () => {
    const lines: string[] = [];
    const reports: ResendRejection[] = [];
    const body = fixture("email-delivered.json");
    const unsigned = new Request(
      "https://flowersoverseas.com/api/webhooks/resend",
      {
        method: "POST",
        body,
      },
    );
    const other = `whsec_${Buffer.from("not-our-key").toString("base64")}`;
    const statuses = [
      (await ingestResendWebhook(unsigned, deps(lines, reports))).status,
      (
        await ingestResendWebhook(
          signed(body, { secret: other }),
          deps(lines, reports),
        )
      ).status,
      (
        await ingestResendWebhook(
          signed(body, { at: NOW_S - 301 }),
          deps(lines, reports),
        )
      ).status,
    ];
    expect(statuses).toEqual([401, 401, 401]);
    expect(reports).toEqual([
      "missing_header",
      "bad_signature",
      "stale_timestamp",
    ]);
    const rejected = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((line) => line["msg"] === "webhook.rejected");
    expect(rejected.map((line) => line["counter"])).toEqual([
      "webhook_signature_rejected",
      "webhook_signature_rejected",
      "webhook_signature_rejected",
    ]);
    expect(lines.join("\n")).not.toContain("delivered@resend.dev");
  });

  it("answers 413 one byte over the cap, before verifying", async () => {
    const reports: ResendRejection[] = [];
    const big = "x".repeat(RESEND_WEBHOOK_MAX_BYTES + 1);
    const response = await ingestResendWebhook(signed(big), deps([], reports));
    expect(response.status).toBe(413);
    expect(reports).toEqual([]);
  });

  it("answers 400 for a signed body that is not an event", async () => {
    const response = await ingestResendWebhook(
      signed('{"hello":"world"}'),
      deps([], []),
    );
    expect(response.status).toBe(400);
    const notJson = await ingestResendWebhook(signed("not json"), deps([], []));
    expect(notJson.status).toBe(400);
  });
});

describe("status precedence (AC-29)", () => {
  it("is the order §5.2 names, finals last", () => {
    expect(RESEND_STATUS_RANK).toEqual([
      "queued",
      "sent",
      "delivery_delayed",
      "delivered",
      "failed",
      "bounced",
      "complained",
    ]);
    expect([...FINAL_DELIVERY_STATUSES]).toEqual([
      "failed",
      "bounced",
      "complained",
    ]);
  });

  it("is commutative over every pair, and never leaves a final status for a non-final one", () => {
    for (const a of RESEND_STATUS_RANK) {
      for (const b of RESEND_STATUS_RANK) {
        expect(precedenceOf(a, b), `${a},${b}`).toBe(precedenceOf(b, a));
        if (FINAL_DELIVERY_STATUSES.has(a) && !FINAL_DELIVERY_STATUSES.has(b)) {
          expect(precedenceOf(a, b), `${a},${b}`).toBe(a);
        }
      }
    }
  });

  it("delivered before sent stays delivered; bounced after delivered is bounced", () => {
    expect(precedenceOf(precedenceOf("queued", "delivered"), "sent")).toBe(
      "delivered",
    );
    expect(precedenceOf("delivered", "bounced")).toBe("bounced");
    expect(precedenceOf("delivered", "delivery_delayed")).toBe("delivered");
  });
});

describe("the job (AC-30)", () => {
  it("throws on a failed run so pg-boss retries, completes on dead", async () => {
    await expect(
      runResendWebhookJob("x", () =>
        Promise.resolve({ kind: "failed", attempts: 3 }),
      ),
    ).rejects.toBeInstanceOf(ResendWebhookFailed);
    await expect(
      runResendWebhookJob("x", () => Promise.resolve({ kind: "dead" })),
    ).resolves.toEqual({ kind: "dead" });
  });
});
