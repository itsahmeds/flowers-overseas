/**
 * Resend webhooks against migrated tables (spec 016 §5.2 "Resend webhooks"; AC-28 to AC-30;
 * T-28, T-29 database half, T-30; TASK-335).
 *
 * On a scratch PG16 (`support/scratch-db.ts`). Every request is signed the way Svix signs, with
 * the suite's own secret; the payloads are Resend's documented examples
 * (`tests/contract/fixtures/resend/`) with the `email_id` and type set per case.
 *
 *  - T-28: signed → 200 and one inbox row (`provider = 'resend'`, `event_id = svix-id`) before any
 *    processing; bad signature, unsigned, 5 min + 1 s old → 401 and no row; 4 min 59 s → 200;
 *    over the cap → 413 and no row; the same `svix-id` again → 200, one row, no second enqueue
 *    and no second processing run.
 *  - T-29: `delivered` before `sent` ends `delivered`; `bounced` after `delivered` ends `bounced`;
 *    a florist bounce raises one `notifications.florist_bounce` with the order; a buyer bounce
 *    raises none; opened is `not_tracked`; an unknown type `unknown_type`; a sign-in email (no
 *    delivery row) `unknown_object`.
 *  - T-30: a row whose processing always throws is `failed` seven times and `dead` on the eighth
 *    attempt with one `webhook.dead` (`provider=resend`); a ninth run is skipped, still one.
 *  - A unicode address in the body verifies, stores and is never logged; no log line of the suite
 *    carries an address or the signature.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLogger } from "@/lib/logger";
import {
  RESEND_WEBHOOK_MAX_BYTES,
  ingestResendWebhook,
  processResendWebhook,
  svixSignature,
  type ResendIngestDeps,
  type ResendProcessDeps,
  type ResendTransaction,
} from "@/modules/notifications";
import type { OrderExecutor } from "@/modules/orders";

import { insertPlacedOrder } from "../fixtures/order-state.ts";
import { base, country, customer, recipient } from "./support/rows.ts";
import {
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const SECRET = `whsec_${Buffer.from("resend-integration-signing-key-01").toString("base64")}`;
const NOW = new Date("2026-11-04T03:00:00.000Z");
const NOW_S = Math.floor(NOW.getTime() / 1000);
const FIXTURES = join(import.meta.dirname, "../contract/fixtures/resend");

interface Alert {
  readonly alert: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

let ids = 0;
function nextId(prefix: string): string {
  ids += 1;
  return `${prefix}_${String(ids)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** A documented payload of `type` about `emailId`. */
function payload(
  type: string,
  emailId: string | undefined,
  createdAt = "2026-11-04T02:58:00.000Z",
): string {
  const file =
    type === "email.bounced"
      ? "email-bounced.json"
      : type === "email.failed"
        ? "email-failed.json"
        : "email-delivered.json";
  const body = JSON.parse(readFileSync(join(FIXTURES, file), "utf8")) as {
    type: string;
    created_at: string;
    data: Record<string, unknown>;
  };
  body.type = type;
  body.created_at = createdAt;
  if (emailId === undefined) delete body.data["email_id"];
  else body.data["email_id"] = emailId;
  return JSON.stringify(body);
}

function signedRequest(
  body: string,
  options: {
    id?: string;
    at?: number;
    secret?: string;
    signature?: string;
  } = {},
): Request {
  const id = options.id ?? nextId("msg");
  const timestamp = String(options.at ?? NOW_S);
  return new Request("https://flowersoverseas.com/api/webhooks/resend", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature":
        options.signature ??
        `v1,${svixSignature(options.secret ?? SECRET, id, timestamp, body)}`,
    },
  });
}

describe.skipIf(server.url === undefined)(
  `spec 016 Resend webhooks${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    const lines: string[] = [];
    const log = createLogger({
      level: "info",
      write: (line) => lines.push(line),
    });

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "resend_webhooks");
      await scratch.sql.begin((tx) => base(tx));
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    const transaction: ResendTransaction = <T>(
      fn: (executor: OrderExecutor) => Promise<T>,
    ) => scratch.sql.begin((tx) => fn(runnerOf(tx))) as Promise<T>;

    function ingestDeps(enqueued: string[] = []): ResendIngestDeps {
      return {
        secret: SECRET,
        transaction,
        now: () => NOW,
        log,
        signatureRejected: () => undefined,
        enqueue: (inboxId) => {
          enqueued.push(inboxId);
          return Promise.resolve();
        },
      };
    }

    function processDeps(alerts: Alert[] = []): ResendProcessDeps {
      return {
        transaction,
        now: () => NOW,
        log,
        alert: (alert, fields) => {
          alerts.push({ alert, fields });
        },
      };
    }

    async function inboxRows(eventId?: string): Promise<number> {
      const [row] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM webhook_inbox
        WHERE provider = 'resend' ${eventId === undefined ? scratch.sql`` : scratch.sql`AND event_id = ${eventId}`}`;
      return row?.n ?? 0;
    }

    async function inbox(inboxId: string) {
      const [row] = await scratch.sql<
        {
          status: string;
          attempts: number;
          ignore_reason: string | null;
          event_type: string;
          object_ref: string | null;
          last_error: string | null;
        }[]
      >`SELECT status, attempts, ignore_reason, event_type, object_ref, last_error
        FROM webhook_inbox WHERE id = ${inboxId}`;
      if (row === undefined) throw new Error("no inbox row");
      return row;
    }

    /** A sent delivery row with Resend id `emailId`; a florist one belongs to a placed order. */
    async function delivery(
      audience: "buyer" | "florist" | "ops",
      status = "sent",
    ): Promise<{
      emailId: string;
      deliveryId: string;
      orderId: string | null;
    }> {
      const emailId = crypto.randomUUID();
      return scratch.sql.begin(async (tx) => {
        let orderId: string | null = null;
        if (audience !== "ops") {
          const customerId = await customer(tx);
          orderId = await insertPlacedOrder(tx, {
            customerId,
            recipientId: await recipient(tx, customerId),
            countryId: await country(tx, "PL"),
            mode: "test",
          });
        }
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO notification_delivery (source_key, order_id, template_key, audience,
                                             recipient_ref, locale_code, provider,
                                             provider_message_id, status, status_at)
          VALUES (${`outbox:${crypto.randomUUID()}`}, ${orderId}, 'offer', ${audience},
                  ${audience === "florist" ? crypto.randomUUID() : audience}, 'en', 'resend',
                  ${emailId}, ${status}, ${NOW.toISOString()}::timestamptz)
          RETURNING id`;
        return { emailId, deliveryId: row?.id ?? "", orderId };
      });
    }

    async function statusOf(deliveryId: string): Promise<string> {
      const [row] = await scratch.sql<{ status: string }[]>`
        SELECT status FROM notification_delivery WHERE id = ${deliveryId}`;
      return row?.status ?? "missing";
    }

    /** Ingests one signed event and processes it; returns the inbox id. */
    async function deliver(
      body: string,
      alerts: Alert[] = [],
    ): Promise<string> {
      const enqueued: string[] = [];
      const response = await ingestResendWebhook(
        signedRequest(body),
        ingestDeps(enqueued),
      );
      expect(response.status).toBe(200);
      expect(enqueued).toHaveLength(1);
      const inboxId = enqueued[0] ?? "";
      await processResendWebhook(inboxId, processDeps(alerts));
      return inboxId;
    }

    // ---------------------------------------------------------------- T-28 (AC-28)

    it("T-28: a signed event is stored received, with its svix-id, before any processing", async () => {
      const { emailId, deliveryId } = await delivery("buyer");
      const enqueued: string[] = [];
      const id = nextId("msg");
      const response = await ingestResendWebhook(
        signedRequest(payload("email.delivered", emailId), { id }),
        ingestDeps(enqueued),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await inboxRows(id)).toBe(1);
      expect(enqueued).toHaveLength(1);
      const row = await inbox(enqueued[0] ?? "");
      expect(row).toMatchObject({
        status: "received",
        attempts: 0,
        event_type: "email.delivered",
        object_ref: emailId,
      });
      // Nothing was processed inside the request.
      expect(await statusOf(deliveryId)).toBe("sent");
    });

    it("T-28: bad signature, unsigned, and 5 min + 1 s old answer 401 and store nothing", async () => {
      const before = await inboxRows();
      const body = payload("email.delivered", crypto.randomUUID());
      const other = `whsec_${Buffer.from("someone-else").toString("base64")}`;
      const unsigned = new Request(
        "https://flowersoverseas.com/api/webhooks/resend",
        { method: "POST", body },
      );
      const enqueued: string[] = [];
      const statuses = [
        (
          await ingestResendWebhook(
            signedRequest(body, { secret: other }),
            ingestDeps(enqueued),
          )
        ).status,
        (await ingestResendWebhook(unsigned, ingestDeps(enqueued))).status,
        (
          await ingestResendWebhook(
            signedRequest(body, { at: NOW_S - 301 }),
            ingestDeps(enqueued),
          )
        ).status,
        (
          await ingestResendWebhook(
            signedRequest(body, { at: NOW_S + 301 }),
            ingestDeps(enqueued),
          )
        ).status,
      ];
      expect(statuses).toEqual([401, 401, 401, 401]);
      expect(await inboxRows()).toBe(before);
      expect(enqueued).toEqual([]);
    });

    it("T-28: 4 min 59 s off is accepted either way", async () => {
      const early = nextId("msg");
      const late = nextId("msg");
      const body = payload("email.opened", crypto.randomUUID());
      expect(
        (
          await ingestResendWebhook(
            signedRequest(body, { id: early, at: NOW_S - 299 }),
            ingestDeps(),
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await ingestResendWebhook(
            signedRequest(body, { id: late, at: NOW_S + 299 }),
            ingestDeps(),
          )
        ).status,
      ).toBe(200);
      expect(await inboxRows(early)).toBe(1);
      expect(await inboxRows(late)).toBe(1);
    });

    it("T-28: a body one byte over the cap answers 413 and stores nothing", async () => {
      const before = await inboxRows();
      const big = payload("email.sent", crypto.randomUUID()).replace(
        "Sending this example",
        "x".repeat(RESEND_WEBHOOK_MAX_BYTES),
      );
      const response = await ingestResendWebhook(
        signedRequest(big),
        ingestDeps(),
      );
      expect(response.status).toBe(413);
      expect(await inboxRows()).toBe(before);
    });

    it("T-28: a replayed svix-id answers 200, keeps one row and runs processing once", async () => {
      const { emailId, deliveryId } = await delivery("florist", "delivered");
      const id = nextId("msg");
      const body = payload("email.bounced", emailId);
      const alerts: Alert[] = [];
      const enqueued: string[] = [];
      const first = await ingestResendWebhook(
        signedRequest(body, { id }),
        ingestDeps(enqueued),
      );
      expect(first.status).toBe(200);
      const outcome = await processResendWebhook(
        enqueued[0] ?? "",
        processDeps(alerts),
      );
      expect(outcome).toEqual({ kind: "processed", status: "bounced" });
      const again = await ingestResendWebhook(
        signedRequest(body, { id }),
        ingestDeps(enqueued),
      );
      expect(again.status).toBe(200);
      expect(await inboxRows(id)).toBe(1);
      expect(enqueued).toHaveLength(1);
      // A stray second job for the same row does nothing.
      expect(
        await processResendWebhook(enqueued[0] ?? "", processDeps(alerts)),
      ).toEqual({
        kind: "skipped",
        status: "processed",
      });
      expect(await statusOf(deliveryId)).toBe("bounced");
      expect(
        alerts.filter((a) => a.alert === "notifications.florist_bounce"),
      ).toHaveLength(1);
      expect((await inbox(enqueued[0] ?? "")).attempts).toBe(1);
    });

    it("T-28: a duplicate of a row whose enqueue failed asks for it again, once it is still received", async () => {
      const id = nextId("msg");
      const body = payload("email.sent", crypto.randomUUID());
      const failing: ResendIngestDeps = {
        ...ingestDeps(),
        enqueue: () => Promise.reject(new Error("queue down")),
      };
      expect(
        (await ingestResendWebhook(signedRequest(body, { id }), failing))
          .status,
      ).toBe(500);
      expect(await inboxRows(id)).toBe(1);
      const enqueued: string[] = [];
      expect(
        (
          await ingestResendWebhook(
            signedRequest(body, { id }),
            ingestDeps(enqueued),
          )
        ).status,
      ).toBe(200);
      expect(enqueued).toHaveLength(1);
      expect(await inboxRows(id)).toBe(1);
    });

    // ---------------------------------------------------------------- T-29 (AC-29)

    it("T-29: delivered before sent ends delivered; the late sent is stale", async () => {
      const { emailId, deliveryId } = await delivery("buyer", "queued");
      await deliver(
        payload("email.delivered", emailId, "2026-11-04T02:58:30.000Z"),
      );
      const late = await deliver(
        payload("email.sent", emailId, "2026-11-04T02:58:00.000Z"),
      );
      expect(await statusOf(deliveryId)).toBe("delivered");
      expect(await inbox(late)).toMatchObject({
        status: "ignored",
        ignore_reason: "stale",
      });
    });

    it("T-29: bounced after delivered ends bounced, and delivery_delayed after it changes nothing", async () => {
      const { emailId, deliveryId } = await delivery("buyer");
      await deliver(payload("email.delivered", emailId));
      await deliver(payload("email.bounced", emailId));
      await deliver(payload("email.delivery_delayed", emailId));
      await deliver(payload("email.delivered", emailId));
      expect(await statusOf(deliveryId)).toBe("bounced");
    });

    it("T-29: every order of the same events ends at the same status", async () => {
      const events = [
        "email.sent",
        "email.delivery_delayed",
        "email.delivered",
        "email.complained",
      ];
      const orders = [
        events,
        [...events].reverse(),
        [events[2], events[0], events[3], events[1]],
      ];
      const finals: string[] = [];
      for (const order of orders) {
        const { emailId, deliveryId } = await delivery("buyer", "queued");
        for (const type of order) await deliver(payload(type ?? "", emailId));
        finals.push(await statusOf(deliveryId));
      }
      expect(finals).toEqual(["complained", "complained", "complained"]);
    });

    it("T-29: a florist bounce raises notifications.florist_bounce once, with the order", async () => {
      const { emailId, deliveryId, orderId } = await delivery(
        "florist",
        "delivered",
      );
      const alerts: Alert[] = [];
      await deliver(payload("email.bounced", emailId), alerts);
      expect(alerts).toEqual([
        {
          alert: "notifications.florist_bounce",
          fields: {
            delivery_id: deliveryId,
            template_key: "offer",
            order_id: orderId,
          },
        },
      ]);
      // A second bounce event (another svix-id) moves nothing and raises nothing.
      await deliver(payload("email.bounced", emailId), alerts);
      expect(alerts).toHaveLength(1);
    });

    it("T-29: a buyer bounce raises no florist alert", async () => {
      const { emailId, deliveryId } = await delivery("buyer");
      const alerts: Alert[] = [];
      await deliver(payload("email.bounced", emailId), alerts);
      expect(await statusOf(deliveryId)).toBe("bounced");
      expect(alerts).toEqual([]);
    });

    it("T-29: opened is not tracked, an unknown type is ignored, a sign-in email is unknown", async () => {
      const { emailId, deliveryId } = await delivery("buyer");
      const opened = await deliver(payload("email.opened", emailId));
      const clicked = await deliver(payload("email.clicked", emailId));
      const unknown = await deliver(payload("domain.updated", undefined));
      const signIn = await deliver(
        payload("email.delivered", crypto.randomUUID()),
      );
      expect(await inbox(opened)).toMatchObject({
        status: "ignored",
        ignore_reason: "not_tracked",
      });
      expect(await inbox(clicked)).toMatchObject({
        status: "ignored",
        ignore_reason: "not_tracked",
      });
      expect(await inbox(unknown)).toMatchObject({
        status: "ignored",
        ignore_reason: "unknown_type",
      });
      expect(await inbox(signIn)).toMatchObject({
        status: "ignored",
        ignore_reason: "unknown_object",
      });
      expect(await statusOf(deliveryId)).toBe("sent");
    });

    // ---------------------------------------------------------------- T-30 (AC-30)

    it("T-30: a row that always throws is dead on its eighth attempt with one webhook.dead", async () => {
      // A delivered event with no email_id: signed and stored, but every run fails the schema.
      const enqueued: string[] = [];
      await ingestResendWebhook(
        signedRequest(payload("email.delivered", undefined)),
        ingestDeps(enqueued),
      );
      const inboxId = enqueued[0] ?? "";
      const alerts: Alert[] = [];
      const outcomes: string[] = [];
      for (let attempt = 1; attempt <= 9; attempt += 1) {
        outcomes.push(
          (await processResendWebhook(inboxId, processDeps(alerts))).kind,
        );
      }
      expect(outcomes).toEqual([
        "failed",
        "failed",
        "failed",
        "failed",
        "failed",
        "failed",
        "failed",
        "dead",
        "skipped",
      ]);
      expect(await inbox(inboxId)).toMatchObject({
        status: "dead",
        attempts: 8,
        last_error: "schema_invalid",
      });
      expect(alerts).toEqual([
        {
          alert: "webhook.dead",
          fields: { inbox_id: inboxId, provider: "resend" },
        },
      ]);
    });

    // ---------------------------------------------------------------- awkward cases

    it("a unicode address verifies by its bytes, is stored, and is never logged", async () => {
      const { emailId, deliveryId } = await delivery("buyer");
      const body = JSON.stringify({
        type: "email.delivered",
        created_at: "2026-11-04T02:59:00.000Z",
        data: {
          email_id: emailId,
          to: ["zoë.ñandú@exämple.test"],
          subject: "Zamówienie 🌷 العربية",
        },
      });
      await deliver(body);
      expect(await statusOf(deliveryId)).toBe("delivered");
    });

    it("no log line of the suite carries an address, a subject or a signature", () => {
      const text = lines.join("\n");
      expect(lines.length).toBeGreaterThan(10);
      for (const needle of [
        "delivered@resend.dev",
        "onboarding@resend.dev",
        "exämple",
        "Sending this example",
        "Zamówienie",
        "v1,",
        "whsec_",
      ]) {
        expect(text, needle).not.toContain(needle);
      }
    });
  },
);
