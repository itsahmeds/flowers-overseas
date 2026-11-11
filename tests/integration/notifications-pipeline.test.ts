/**
 * The notification pipeline against migrated tables (spec 016 §5.2 "Notifications"; T-14, T-19,
 * T-20, T-26, T-33, T-36, T-39, T-44, T-58; AC-14, AC-19, AC-20, AC-26, AC-33, AC-36, AC-39,
 * AC-44, AC-58; TASK-331).
 *
 * On a scratch PG16 (`support/scratch-db.ts`), every case in a rolled-back transaction, the
 * pipeline running as `app_web` in the `system` context (row-level security on). The mailer is
 * the capturing mailer (Resend's idempotency rule in memory) behind a fault switch; the templates
 * are a stand-in renderer that copies recipient markers into the body, so the log and row scans
 * have something to find; the one-tap link is a stand-in minting a fresh token per call (the real
 * core is `florist-auth.test.ts`'s T-23 cases).
 *
 *  - T-19: one outbox row handled twice and a job re-run send once per key, with the key
 *    `{source_key}:{template_key}:{recipient_ref}`; a row left `queued` by a crash is sent with
 *    that key; a send whose commit was lost is repeated with a fresh link and Resend's
 *    `409 invalid_idempotent_request` marks it `sent` with no retry; `409
 *    concurrent_idempotent_requests` and a 500 leave the delivery for the dispatcher's retry.
 *  - T-20: no address, name or subject column; no marker in any row.
 *  - T-26: `notifications.email` off holds three deliveries `pending`, untouched; on, three sends.
 *  - T-36: the W copy for a WhatsApp florist on V1 and V4, never on V2 or V5; never for an
 *    email-only florist; the florist's email in every case.
 *  - T-39 / T-14: a live cascade (two timeouts, a decline, an exhaustion, a reroute, an
 *    acceptance, the delivery-morning production start) gives the buyer B1 and B2 only; V3 goes to
 *    the florist on `order.captured` from `accepted`, and B2 only once row 16 exists.
 *  - T-44: three orders of one purchase meet one B1 row and one send, in any order, twice, and on
 *    two concurrent workers.
 *  - T-58: V1 to every member in the handler run, no job scheduled; a second offer a minute later
 *    gives two more.
 *  - T-33: no log line of the suite carries an address, a phone, a recipient name or a token.
 */
import { randomBytes, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLogger, type Logger } from "@/lib/logger";
import {
  capturingMailer,
  type Mailer,
  MailerError,
  type NotificationDeps,
  type NotificationRenderer,
  notificationsOutboxHandler,
  sendJobNotifications,
} from "@/modules/notifications";
import {
  appendEvent,
  dispatchOutbox,
  type DeliveryTransaction,
  type OrderEventType,
  type OrderExecutor,
  registerOutboxHold,
} from "@/modules/orders";

import { registerFixtureEventSchemas } from "../fixtures/order-engine.ts";
import { applyTransition, insertPlacedOrder } from "../fixtures/order-state.ts";
import * as make from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();
registerFixtureEventSchemas();

const ORIGIN = "https://staging.example.test";
const BASE = "/vendor";
const OPS = "founder-ops@example.test";

/** Marker values: none may reach a row or a log line. */
const BUYER_EMAIL = "marker-buyer-7731@example.test";
const BUYER_NAME = "Markerbuyer Quill";
const BUYER_PHONE = "+48500111222";
const RECIPIENT_NAME = "Markerrecipient Zebedee";
const RECIPIENT_STREET = "Markerstreet 9";
const RECIPIENT_PHONE = "+48500333444";
const MARKERS = [
  BUYER_EMAIL,
  BUYER_NAME,
  BUYER_PHONE,
  RECIPIENT_NAME,
  RECIPIENT_STREET,
  RECIPIENT_PHONE,
];

/** Every log line of the suite (T-33). */
const lines: string[] = [];
const log: Logger = createLogger({
  level: "debug",
  write: (line) => {
    lines.push(line);
  },
});

/** Every sign-in token the stand-in minted (T-33: none in a log line). */
const tokens: string[] = [];
const linkCalls: { userId: string; path: string }[] = [];
function signInLink(userId: string, path: string): Promise<string> {
  linkCalls.push({ userId, path });
  const token = randomBytes(32).toString("base64url");
  tokens.push(token);
  return Promise.resolve(`${ORIGIN}${BASE}/sign-in/confirm?t=${token}`);
}

/** The capturing mailer behind a fault switch, recording every attempt. */
const capture = capturingMailer("Flowers Overseas <orders@example.test>");
let fault: (() => Error) | null = null;
const attempts: { to: string; key: string | undefined; tag: string }[] = [];
const mailer: Mailer = {
  send(message) {
    attempts.push({
      to: message.to,
      key: message.idempotencyKey,
      tag: message.tag,
    });
    if (fault !== null) return Promise.reject(fault());
    return capture.send(message);
  },
};

/** The stand-in template: its key, the link, and the recipient's markers (read through the executor). */
const renderer: NotificationRenderer = async (input) => {
  const [row] = await input.executor.execute(
    sql`
      SELECT recipient_snapshot ->> 'fullName' AS name FROM "order"
      WHERE id = ${input.orderId ?? "00000000-0000-0000-0000-000000000000"}`,
  );
  const name = typeof row?.["name"] === "string" ? row["name"] : "";
  return {
    subject: `${input.template}`,
    text: `${input.template} ${input.link ?? ""} ${input.inboxUrl ?? ""} ${name}`,
    html: `<p>${input.template} ${name}</p>`,
  };
};

let enabled = true;
function deps(over: Partial<NotificationDeps> = {}): NotificationDeps {
  return {
    mailer: () => mailer,
    provider: () => "capture",
    template: () => renderer,
    signInLink,
    opsAddress: () => OPS,
    siteOrigin: () => ORIGIN,
    emailEnabled: () => Promise.resolve(enabled),
    log,
    ...over,
  };
}

/** Runs `fn` as `app_web` in the `system` context, then back to the fixture role. */
async function asSystem<T>(tx: Tx, fn: () => Promise<T>): Promise<T> {
  await asApp(tx, { role: "system" });
  try {
    return await fn();
  } finally {
    await tx.unsafe("RESET ROLE");
  }
}

interface Florist {
  readonly partnerId: string;
  readonly members: readonly string[];
}

/** A florist with `members` (each `[locale, role]`), on email or WhatsApp. */
async function florist(
  tx: Tx,
  countryId: string,
  status: "demo" | "active",
  channel: "email" | "whatsapp",
  members: readonly (readonly [string, "owner" | "staff"])[],
): Promise<Florist> {
  const partnerId = await make.partner(tx, countryId, status);
  if (channel === "whatsapp") {
    await tx`UPDATE fulfillment_partner SET notification_channel = 'whatsapp',
             contact_phone = '+48500999000' WHERE id = ${partnerId}`;
  }
  const ids: string[] = [];
  for (const [locale, role] of members) {
    const id = randomUUID();
    await tx`INSERT INTO users (id, email) VALUES (${id}, ${`member-${id.slice(0, 8)}@example.test`})`;
    await tx`INSERT INTO partner_member (user_id, partner_id, role, locale_code)
             VALUES (${id}, ${partnerId}, ${role}, ${locale})`;
    ids.push(id);
  }
  return { partnerId, members: ids };
}

/** A placed order with marker snapshots, in `locale`. */
async function order(
  tx: Tx,
  mode: "test" | "live",
  options: { purchaseId?: string; totalMinor?: number; locale?: string } = {},
): Promise<{ orderId: string; countryId: string }> {
  const parents = await make.orderParents(tx);
  const orderId = await insertPlacedOrder(tx, {
    ...parents,
    mode,
    ...(options.purchaseId === undefined
      ? {}
      : { purchaseId: options.purchaseId }),
    ...(options.totalMinor === undefined
      ? {}
      : { totalMinor: options.totalMinor }),
  });
  await tx`UPDATE "order" SET
    buyer_snapshot = ${tx.json({ name: BUYER_NAME, email: BUYER_EMAIL, phoneE164: BUYER_PHONE, countryIso2: "GB" })},
    recipient_snapshot = ${tx.json({ fullName: RECIPIENT_NAME, phoneE164: RECIPIENT_PHONE, addressLines: [RECIPIENT_STREET], city: "Kraków" })},
    locale_code = ${options.locale ?? "pl"}
    WHERE id = ${orderId}`;
  return { orderId, countryId: parents.countryId };
}

/** A transition written the way the engine writes it; the new event's id and from-status. */
async function step(
  tx: Tx,
  orderId: string,
  event: OrderEventType,
  to: string,
): Promise<{ eventId: string; from: string }> {
  await applyTransition(tx, orderId, event, to);
  const [row] = await tx<{ id: string; from_status: string }[]>`
    SELECT id, from_status FROM order_event WHERE order_id = ${orderId}
    ORDER BY seq DESC LIMIT 1`;
  return { eventId: row?.id ?? "", from: row?.from_status ?? "" };
}

/** An open offer to `partnerId` and its `assignment.offered` event (status-preserving). */
async function offer(
  tx: Tx,
  orderId: string,
  partnerId: string,
  mode: "test" | "live",
): Promise<{ assignmentId: string; eventId: string }> {
  const [count] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM order_assignment WHERE order_id = ${orderId}`;
  const attempt = (count?.n ?? 0) + 1;
  const [assignment] = await tx<{ id: string }[]>`
    INSERT INTO order_assignment (order_id, partner_id, sla_expires_at, attempt)
    VALUES (${orderId}, ${partnerId}, now() + interval '1 hour', ${attempt}) RETURNING id`;
  const assignmentId = assignment?.id ?? "";
  const [current] = await tx<{ status: string; seq: number }[]>`
    SELECT o.status, (SELECT max(seq) FROM order_event WHERE order_id = o.id)::int AS seq
    FROM "order" o WHERE o.id = ${orderId}`;
  const [event] = await tx<{ id: string }[]>`
    INSERT INTO order_event (order_id, seq, type, from_status, to_status, actor, payload, payload_version)
    VALUES (${orderId}, ${(current?.seq ?? 0) + 1}, 'assignment.offered', ${current?.status ?? ""},
            ${current?.status ?? ""}, 'system:order.route',
            ${tx.json({ mode, assignmentId, partnerId, attempt, answerWindowMinutes: 60 })}, 1)
    RETURNING id`;
  return { assignmentId, eventId: event?.id ?? "" };
}

/** Delivers one event's `notifications` row the way the dispatcher would. */
async function handle(
  tx: Tx,
  input: {
    orderId: string;
    eventId: string;
    type: OrderEventType;
    from: string;
    mode: "test" | "live";
    outboxId?: string;
  },
  over: Partial<NotificationDeps> = {},
): Promise<void> {
  await asSystem(tx, () =>
    notificationsOutboxHandler(deps(over))(
      {
        eventId: input.eventId,
        orderId: input.orderId,
        type: input.type,
        seq: 1,
        fromStatus: input.from,
        toStatus: null,
        mode: input.mode,
      },
      {
        deliveryId: randomUUID(),
        outboxId: input.outboxId ?? randomUUID(),
        target: "notifications",
        attempt: 1,
        executor: runnerOf(tx),
      },
    ),
  );
}

async function deliveries(
  tx: Tx,
  where: { orderId?: string; sourceKey?: string } = {},
) {
  return tx<
    {
      source_key: string;
      template_key: string;
      audience: string;
      recipient_ref: string;
      locale_code: string;
      status: string;
      provider_message_id: string | null;
      order_id: string | null;
      purchase_id: string | null;
    }[]
  >`
    SELECT source_key, template_key, audience, recipient_ref, locale_code, status,
           provider_message_id, order_id, purchase_id
    FROM notification_delivery
    WHERE (${where.orderId ?? null}::uuid IS NULL OR order_id = ${where.orderId ?? null}::uuid)
      AND (${where.sourceKey ?? null}::text IS NULL OR source_key = ${where.sourceKey ?? null}::text)
    ORDER BY template_key, recipient_ref`;
}

const sent = () => capture.messages();
function reset(): void {
  capture.clear();
  attempts.length = 0;
  linkCalls.length = 0;
  fault = null;
  enabled = true;
}

describe.skipIf(server.url === undefined)(
  `the notification pipeline${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "notify");
      await scratch.sql`INSERT INTO locale (code, bcp47, name) VALUES ('de', 'de-DE', 'Deutsch')
                        ON CONFLICT DO NOTHING`;
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("T-19, T-58: one offer row handled twice sends V1 once per member, in the run, with a stable key; no job is scheduled", async () => {
      reset();
      await rolledBack(scratch.sql, async (tx) => {
        const { orderId, countryId } = await order(tx, "test");
        const shop = await florist(tx, countryId, "demo", "email", [
          ["pl", "owner"],
          ["en", "staff"],
        ]);
        await step(tx, orderId, "order.captured", "paid_unrouted");
        await step(tx, orderId, "order.routed", "routed");
        const offered = await offer(tx, orderId, shop.partnerId, "test");
        const [jobsBefore] = await tx<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM pgboss.job`;
        const outboxId = randomUUID();
        const input = {
          orderId,
          eventId: offered.eventId,
          type: "assignment.offered" as const,
          from: "routed",
          mode: "test" as const,
          outboxId,
        };
        await handle(tx, input);
        // AC-58: sent in this run, one per member.
        expect(
          sent()
            .map((m) => m.to)
            .sort(),
        ).toHaveLength(2);
        const rows = await deliveries(tx, { orderId });
        expect(
          rows.map((r) => [
            r.template_key,
            r.recipient_ref,
            r.status,
            r.locale_code,
            r.audience,
          ]),
        ).toEqual(
          [...shop.members]
            .sort()
            .map((member) => [
              "offer",
              member,
              "sent",
              member === shop.members[0] ? "pl" : "en",
              "florist",
            ]),
        );
        expect(attempts.map((a) => a.key).sort()).toEqual(
          [...shop.members]
            .sort()
            .map((member) => `outbox:${outboxId}:offer:${member}`),
        );
        expect(attempts.every((a) => a.tag === "order_florist")).toBe(true);
        // The link's callback is the order of this assignment; nothing else.
        expect(linkCalls.map((c) => c.path)).toEqual([
          `${BASE}/orders/${offered.assignmentId}`,
          `${BASE}/orders/${offered.assignmentId}`,
        ]);
        for (const mail of sent()) {
          const link = /https:\/\/\S+/u.exec(mail.text)?.[0] ?? "";
          expect(link).not.toContain("@");
          expect([...new URL(link).searchParams.keys()]).toEqual(["t"]);
        }

        // The same outbox row again: skipped, nothing sent.
        await handle(tx, input);
        expect(sent()).toHaveLength(2);
        expect(attempts).toHaveLength(2);

        // A second offer to the same florist for another order a minute later: two more V1.
        const other = await order(tx, "test");
        await step(tx, other.orderId, "order.captured", "paid_unrouted");
        await step(tx, other.orderId, "order.routed", "routed");
        const second = await offer(tx, other.orderId, shop.partnerId, "test");
        await handle(tx, {
          orderId: other.orderId,
          eventId: second.eventId,
          type: "assignment.offered",
          from: "routed",
          mode: "test",
        });
        expect(sent()).toHaveLength(4);
        const [jobsAfter] = await tx<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM pgboss.job`;
        expect(jobsAfter?.n).toBe(jobsBefore?.n);
      });
    });

    it("T-19: a job re-run after success sends nothing more; the same job id is the same key", async () => {
      reset();
      await rolledBack(scratch.sql, async (tx) => {
        const { orderId, countryId } = await order(tx, "live");
        const shop = await florist(tx, countryId, "active", "email", [
          ["pl", "owner"],
        ]);
        await step(tx, orderId, "order.captured", "paid_unrouted");
        await step(tx, orderId, "order.routed", "routed");
        const offered = await offer(tx, orderId, shop.partnerId, "live");
        const job = {
          job: "assignment.remind" as const,
          jobId: "remind-1",
          orderId,
          assignmentId: offered.assignmentId,
        };
        const run = () =>
          asSystem(tx, () => sendJobNotifications(runnerOf(tx), job, deps()));
        expect(await run()).toEqual({ sent: 1, skipped: 0 });
        expect(await run()).toEqual({ sent: 0, skipped: 1 });
        expect(attempts.map((a) => a.key)).toEqual([
          `job:assignment.remind:remind-1:offer-reminder:${shop.members[0]}`,
        ]);
        // An active florist cannot be sent a link in staging's policy: the stand-in is asked, and
        // a null answer falls back to the plain inbox address (no token).
        reset();
        await asSystem(tx, () =>
          sendJobNotifications(
            runnerOf(tx),
            { ...job, jobId: "remind-2" },
            deps({ signInLink: () => Promise.resolve(null) }),
          ),
        );
        expect(sent()[0]?.text).toContain(
          `${ORIGIN}${BASE}/orders/${offered.assignmentId}`,
        );
        expect(sent()[0]?.text).not.toContain("?t=");
      });
    });

    it("hands a template's attachments to the mailer, and sends none when it has none (TASK-333)", async () => {
      reset();
      await rolledBack(scratch.sql, async (tx) => {
        const { orderId, countryId } = await order(tx, "live");
        const shop = await florist(tx, countryId, "active", "email", [
          ["pl", "owner"],
        ]);
        await step(tx, orderId, "order.captured", "paid_unrouted");
        await step(tx, orderId, "order.routed", "routed");
        const offered = await offer(tx, orderId, shop.partnerId, "live");
        const job = {
          job: "assignment.remind" as const,
          orderId,
          assignmentId: offered.assignmentId,
        };
        const file = {
          filename: "terms-2026-10.pdf",
          path: "https://media.example.test/legal/terms-2026-10.pdf",
          contentType: "application/pdf" as const,
        };
        await asSystem(tx, () =>
          sendJobNotifications(
            runnerOf(tx),
            { ...job, jobId: "attach-1" },
            deps({
              template: () => async (input) => ({
                ...(await renderer(input)),
                attachments: [file],
              }),
            }),
          ),
        );
        await asSystem(tx, () =>
          sendJobNotifications(
            runnerOf(tx),
            { ...job, jobId: "attach-2" },
            deps(),
          ),
        );
        expect(sent()[0]?.attachments).toEqual([file]);
        expect(sent()[1]?.attachments).toBeUndefined();
      });
    });

    it("T-19: a row left queued by a crash is sent with the same key; a lost commit is repeated and Resend's 409 invalid marks it sent", async () => {
      reset();
      await rolledBack(scratch.sql, async (tx) => {
        const { orderId, countryId } = await order(tx, "live");
        const shop = await florist(tx, countryId, "active", "email", [
          ["en", "owner"],
        ]);
        await walk(tx, orderId);
        const { eventId } = await step(
          tx,
          orderId,
          "order.out_for_delivery",
          "out_for_delivery",
        );
        const outboxId = randomUUID();
        const sourceKey = `outbox:${outboxId}`;
        // The crash: the row was inserted `queued` and the process died before the send.
        await tx`INSERT INTO notification_delivery (source_key, order_id, template_key, audience,
                   recipient_ref, locale_code, provider, status, status_at)
                 VALUES (${sourceKey}, ${orderId}, 'out-for-delivery', 'buyer', 'buyer', 'pl',
                         'capture', 'queued', now())`;
        await handle(tx, {
          orderId,
          eventId,
          type: "order.out_for_delivery",
          from: "in_production",
          mode: "live",
          outboxId,
        });
        expect(attempts.map((a) => [a.to, a.key])).toEqual([
          [BUYER_EMAIL, `${sourceKey}:out-for-delivery:buyer`],
        ]);
        const [row] = await deliveries(tx, { sourceKey });
        expect(row?.status).toBe("sent");
        expect(row?.provider_message_id).toMatch(/^captured-/u);

        // The lost commit: V3 is sent inside a savepoint that is then rolled back, so the row is
        // gone but Resend has the key. The repeat mints a fresh link (another body): 409 invalid.
        reset();
        await tx`UPDATE order_assignment SET response = 'accept', responded_at = now()
                 WHERE order_id = ${orderId}`;
        const accepted = await offer(tx, orderId, shop.partnerId, "live");
        await tx`UPDATE order_assignment SET response = 'accept', responded_at = now()
                 WHERE id = ${accepted.assignmentId}`;
        const confirmedKey = randomUUID();
        const v3 = {
          orderId,
          eventId: accepted.eventId,
          type: "order.captured" as const,
          from: "accepted",
          mode: "live" as const,
          outboxId: confirmedKey,
        };
        await tx
          .savepoint(async (sp) => {
            await handle(sp as unknown as Tx, v3);
            throw new Error("commit lost");
          })
          .catch(() => undefined);
        expect(
          await deliveries(tx, { sourceKey: `outbox:${confirmedKey}` }),
        ).toEqual([]);
        expect(sent()).toHaveLength(1);
        await handle(tx, v3);
        expect(attempts).toHaveLength(2);
        expect(attempts[0]?.key).toBe(attempts[1]?.key);
        expect(sent()).toHaveLength(1);
        const [again] = await deliveries(tx, {
          sourceKey: `outbox:${confirmedKey}`,
        });
        expect(again?.status).toBe("sent");
        expect(again?.provider_message_id).toBeNull();
        // And it is not retried: a third run skips.
        await handle(tx, v3);
        expect(attempts).toHaveLength(2);
      });
    });

    it("T-19: 409 concurrent and a 500 throw, and the dispatcher keeps the delivery for its retry", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        for (const failure of [
          () =>
            new MailerError(
              "HTTP 409 concurrent_idempotent_requests",
              "concurrent_idempotent_requests",
            ),
          () => new MailerError("HTTP 500"),
        ]) {
          reset();
          const { orderId } = await order(tx, "live");
          await walk(tx, orderId);
          const { eventId } = await step(
            tx,
            orderId,
            "order.out_for_delivery",
            "out_for_delivery",
          );
          const [outbox] = await tx<{ id: string }[]>`
            INSERT INTO outbox (event_id, order_id, targets, payload, payload_version)
            VALUES (${eventId}, ${orderId}, '{notifications}', '{}', 1) RETURNING id`;
          fault = failure;
          const counts = await dispatch(tx, { orderId, batchSize: 1 });
          expect(counts).toMatchObject({ claimed: 1, failed: 1, sent: 0 });
          const [delivery] = await tx<
            { status: string; attempts: number; last_error: string }[]
          >`
            SELECT status, attempts, last_error FROM outbox_delivery WHERE outbox_id = ${outbox?.id ?? ""}`;
          expect(delivery?.status).toBe("pending");
          expect(delivery?.attempts).toBe(1);
          expect(delivery?.last_error).toContain("MailerError");
          expect(delivery?.last_error).not.toContain(BUYER_EMAIL);
          // The savepoint took the `queued` row back with it.
          expect(await deliveries(tx, { orderId })).toEqual([]);
          fault = null;
          expect(await dispatch(tx, { orderId })).toMatchObject({ sent: 1 });
          expect((await deliveries(tx, { orderId }))[0]?.status).toBe("sent");
        }
      });
    });

    it("T-20: no address, name or subject column, and no marker in any row", async () => {
      const columns = await scratch.sql<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'notification_delivery'`;
      const names = columns.map((c) => c.column_name);
      expect(names).toContain("recipient_ref");
      for (const name of names) {
        expect(name).not.toMatch(
          /email|address|name|subject|phone|street|body|text|html/u,
        );
      }
      reset();
      await rolledBack(scratch.sql, async (tx) => {
        const { orderId, countryId } = await order(tx, "live");
        const shop = await florist(tx, countryId, "active", "whatsapp", [
          ["pl", "owner"],
        ]);
        const captured = await step(
          tx,
          orderId,
          "order.captured",
          "paid_unrouted",
        );
        await handle(tx, {
          orderId,
          eventId: captured.eventId,
          type: "order.captured",
          from: "placed",
          mode: "live",
        });
        await step(tx, orderId, "order.routed", "routed");
        const offered = await offer(tx, orderId, shop.partnerId, "live");
        await handle(tx, {
          orderId,
          eventId: offered.eventId,
          type: "assignment.offered",
          from: "routed",
          mode: "live",
        });
        const cancelled = await step(
          tx,
          orderId,
          "order.cancelled",
          "cancelled",
        );
        await handle(tx, {
          orderId,
          eventId: cancelled.eventId,
          type: "order.cancelled",
          from: "routed",
          mode: "live",
        });
        const all = await tx<{ row: string }[]>`
          SELECT row_to_json(d)::text AS row FROM notification_delivery d`;
        expect(all.length).toBeGreaterThanOrEqual(5);
        for (const { row } of all) {
          for (const marker of [...MARKERS, OPS])
            expect(row).not.toContain(marker);
          for (const token of tokens) expect(row).not.toContain(token);
        }
        // B1, V1, W, B5, V4, W: each audience to its resolved address, none stored.
        const sentTo = sent().map((m) => [m.subject, m.to]);
        expect(sentTo).toEqual(
          expect.arrayContaining([
            ["order-received", BUYER_EMAIL],
            ["cancelled", BUYER_EMAIL],
            ["whatsapp-copy", OPS],
          ]),
        );
      });
    });

    it("T-26: notifications.email off holds three deliveries pending and untouched; on, three sends, once", async () => {
      reset();
      let held = true;
      registerOutboxHold("notifications", () => Promise.resolve(held));
      await rolledBack(scratch.sql, async (tx) => {
        const { orderId, countryId } = await order(tx, "test");
        const shop = await florist(tx, countryId, "demo", "email", [
          ["pl", "owner"],
        ]);
        await step(tx, orderId, "order.captured", "paid_unrouted");
        await step(tx, orderId, "order.routed", "routed");
        // Three offers through the engine: the routes write the outbox rows (spec 016 targets).
        for (let index = 0; index < 3; index += 1) {
          const [assignment] = await tx<{ id: string }[]>`
            INSERT INTO order_assignment (order_id, partner_id, sla_expires_at, attempt)
            VALUES (${orderId}, ${shop.partnerId}, now() + interval '1 hour', ${index + 1})
            RETURNING id`;
          await appendEvent(
            orderId,
            "assignment.offered",
            "system:order.route",
            {
              mode: "test",
              assignmentId: assignment?.id ?? "",
              partnerId: shop.partnerId,
              attempt: index + 1,
              answerWindowMinutes: 60,
            },
            { executor: runnerOf(tx) },
          );
        }
        const pending = () => tx<{ status: string; attempts: number }[]>`
          SELECT d.status, d.attempts FROM outbox_delivery d JOIN outbox x ON x.id = d.outbox_id
          WHERE x.order_id = ${orderId} AND d.target = 'notifications'`;
        expect(await pending()).toHaveLength(3);
        // The default hold (no `heldTargets` passed): nothing claimed.
        expect(await dispatch(tx, { orderId, useHold: true })).toMatchObject({
          claimed: 0,
        });
        expect(sent()).toHaveLength(0);
        expect(await pending()).toEqual([
          { status: "pending", attempts: 0 },
          { status: "pending", attempts: 0 },
          { status: "pending", attempts: 0 },
        ]);
        held = false;
        expect(await dispatch(tx, { orderId, useHold: true })).toMatchObject({
          sent: 3,
        });
        expect(sent()).toHaveLength(3);
        expect(await dispatch(tx, { orderId, useHold: true })).toMatchObject({
          claimed: 0,
        });
        expect(sent()).toHaveLength(3);
      });
      // The job entry is held too: it throws so pg-boss retries, and writes nothing.
      reset();
      enabled = false;
      await rolledBack(scratch.sql, async (tx) => {
        const { orderId } = await order(tx, "live");
        await expect(
          asSystem(tx, () =>
            sendJobNotifications(
              runnerOf(tx),
              { job: "assignment.photo_remind", jobId: "p1", orderId },
              deps(),
            ),
          ),
        ).rejects.toThrow("NOTIFICATIONS_HELD");
        expect(await deliveries(tx, { orderId })).toEqual([]);
      });
      enabled = true;
    });

    it("T-36: a WhatsApp florist gets a W copy on V1 and V4 only; an email-only florist never; the florist's email always", async () => {
      for (const channel of ["whatsapp", "email"] as const) {
        reset();
        await rolledBack(scratch.sql, async (tx) => {
          const { orderId, countryId } = await order(tx, "live");
          const shop = await florist(tx, countryId, "active", channel, [
            ["de", "staff"],
            ["pl", "owner"],
          ]);
          await step(tx, orderId, "order.captured", "paid_unrouted");
          await step(tx, orderId, "order.routed", "routed");
          const first = await offer(tx, orderId, shop.partnerId, "live");
          const count = async (template: string) =>
            (await deliveries(tx, { orderId })).filter(
              (r) => r.template_key === template,
            );
          // V1
          await handle(tx, {
            orderId,
            eventId: first.eventId,
            type: "assignment.offered",
            from: "routed",
            mode: "live",
          });
          // V2
          await asSystem(tx, () =>
            sendJobNotifications(
              runnerOf(tx),
              {
                job: "assignment.remind",
                jobId: "r",
                orderId,
                assignmentId: first.assignmentId,
              },
              deps(),
            ),
          );
          // V4 on the timeout
          await tx`UPDATE order_assignment SET response = 'timeout', responded_at = now() WHERE id = ${first.assignmentId}`;
          const timedOut = await step(
            tx,
            orderId,
            "assignment.timed_out",
            "routed",
          );
          await handle(tx, {
            orderId,
            eventId: timedOut.eventId,
            type: "assignment.timed_out",
            from: "routed",
            mode: "live",
          });
          // V4 on a withdrawal (cancelled while a second offer is open)
          const second = await offer(tx, orderId, shop.partnerId, "live");
          await handle(tx, {
            orderId,
            eventId: second.eventId,
            type: "assignment.offered",
            from: "routed",
            mode: "live",
          });
          const cancelled = await step(
            tx,
            orderId,
            "order.cancelled",
            "cancelled",
          );
          await handle(tx, {
            orderId,
            eventId: cancelled.eventId,
            type: "order.cancelled",
            from: "routed",
            mode: "live",
          });
          // V5
          await asSystem(tx, () =>
            sendJobNotifications(
              runnerOf(tx),
              {
                job: "assignment.photo_remind",
                jobId: "p",
                orderId,
                assignmentId: second.assignmentId,
              },
              deps(),
            ),
          );
          expect((await count("offer")).length).toBe(4);
          expect((await count("offer-reminder")).length).toBe(2);
          expect((await count("offer-withdrawn")).length).toBe(4);
          expect((await count("photo-reminder")).length).toBe(2);
          const copies = await count("whatsapp-copy");
          if (channel === "email") {
            expect(copies).toEqual([]);
          } else {
            // Two V1 and two V4: four copies, each to ops, in the owner's language (pl).
            expect(copies).toHaveLength(4);
            expect(
              copies.every(
                (c) => c.recipient_ref === "ops" && c.locale_code === "pl",
              ),
            ).toBe(true);
            const wMail = sent().filter((m) => m.subject === "whatsapp-copy");
            expect(wMail).toHaveLength(4);
            for (const mail of wMail) {
              expect(mail.to).toBe(OPS);
              expect(mail.text).not.toContain("?t=");
              expect(mail.text).toContain(`${ORIGIN}${BASE}/orders/`);
            }
          }
        });
      }
    });

    it("T-39, T-14: a live cascade gives the buyer B1 and B2 only; V3 on the capture after acceptance; B2 once row 16 exists", async () => {
      reset();
      await rolledBack(scratch.sql, async (tx) => {
        const { orderId, countryId } = await order(tx, "live");
        const shops = [
          await florist(tx, countryId, "active", "email", [["pl", "owner"]]),
          await florist(tx, countryId, "active", "email", [["pl", "owner"]]),
          await florist(tx, countryId, "active", "email", [["pl", "owner"]]),
          await florist(tx, countryId, "active", "email", [["pl", "owner"]]),
        ];
        const go = async (type: OrderEventType, to: string) => {
          const s = await step(tx, orderId, type, to);
          await handle(tx, {
            orderId,
            eventId: s.eventId,
            type,
            from: s.from,
            mode: "live",
          });
        };
        const offerTo = async (index: number) => {
          const o = await offer(
            tx,
            orderId,
            shops[index]?.partnerId ?? "",
            "live",
          );
          await handle(tx, {
            orderId,
            eventId: o.eventId,
            type: "assignment.offered",
            from: "routed",
            mode: "live",
          });
          return o.assignmentId;
        };
        await go("order.captured", "paid_unrouted");
        await go("order.routed", "routed");
        for (const index of [0, 1]) {
          const id = await offerTo(index);
          await tx`UPDATE order_assignment SET response = 'timeout', responded_at = now() WHERE id = ${id}`;
          await go("assignment.timed_out", "routed");
        }
        const declined = await offerTo(2);
        await tx`UPDATE order_assignment SET response = 'decline', responded_at = now() WHERE id = ${declined}`;
        await go("assignment.declined", "routed");
        await go("order.no_partner_available", "no_partner_available");
        await go("order.manual_reroute", "manual_reroute");
        await go("order.routed", "routed");
        const accepted = await offerTo(3);
        await tx`UPDATE order_assignment SET response = 'accept', responded_at = now() WHERE id = ${accepted}`;
        await go("assignment.accepted", "accepted");
        await go("order.captured", "paid");
        const buyerSoFar = sent()
          .filter((m) => m.to === BUYER_EMAIL)
          .map((m) => m.subject);
        expect(buyerSoFar).toEqual(["order-received"]);
        // V3 to the accepting florist after row 14, and no B2 until row 16.
        const v3 = (await deliveries(tx, { orderId })).filter(
          (r) => r.template_key === "order-confirmed",
        );
        expect(v3).toHaveLength(1);
        expect(v3[0]?.recipient_ref).toBe(shops[3]?.members[0]);
        await go("order.in_production", "in_production");
        const buyer = sent()
          .filter((m) => m.to === BUYER_EMAIL)
          .map((m) => m.subject);
        expect(buyer).toEqual(["order-received", "being-made"]);
        expect(sent().filter((m) => m.tag === "order_buyer")).toHaveLength(2);
        // The founder had the no-partner alert; the florists their own messages.
        expect(
          sent()
            .filter((m) => m.to === OPS)
            .map((m) => m.subject),
        ).toEqual(["alert-no-partner"]);
      });
    });

    it("T-44: three orders of one purchase meet one B1 row and one send, in any order and twice; a test purchase none", async () => {
      reset();
      await rolledBack(scratch.sql, async (tx) => {
        const parents = await make.orderParents(tx);
        const [purchase] = await tx<{ id: string }[]>`
          INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
          VALUES ('live', 'PLN', 30000, 'en', ${parents.customerId}) RETURNING id`;
        const purchaseId = purchase?.id ?? "";
        const events: { orderId: string; eventId: string }[] = [];
        for (const total of [10000, 10000, 10000]) {
          const { orderId } = await order(tx, "live", {
            purchaseId,
            totalMinor: total,
            locale: "pl",
          });
          const s = await step(tx, orderId, "order.captured", "paid_unrouted");
          events.push({ orderId, eventId: s.eventId });
        }
        for (const e of [events[2], events[0], events[0], events[1]]) {
          await handle(tx, {
            orderId: e?.orderId ?? "",
            eventId: e?.eventId ?? "",
            type: "order.captured",
            from: "placed",
            mode: "live",
          });
        }
        const rows = await tx<
          {
            source_key: string;
            purchase_id: string;
            order_id: string | null;
            locale_code: string;
          }[]
        >`
          SELECT source_key, purchase_id, order_id, locale_code FROM notification_delivery
          WHERE template_key = 'order-received'`;
        expect(rows).toEqual([
          {
            source_key: `purchase:${purchaseId}`,
            purchase_id: purchaseId,
            order_id: null,
            locale_code: "en",
          },
        ]);
        expect(
          sent().filter((m) => m.subject === "order-received"),
        ).toHaveLength(1);
        expect(
          attempts.filter((a) => a.key?.includes(":order-received:")),
        ).toHaveLength(1);
      });
      reset();
      await rolledBack(scratch.sql, async (tx) => {
        const { orderId } = await order(tx, "test");
        const s = await step(tx, orderId, "order.captured", "paid_unrouted");
        await handle(tx, {
          orderId,
          eventId: s.eventId,
          type: "order.captured",
          from: "placed",
          mode: "test",
        });
        expect(await deliveries(tx)).toEqual([]);
        expect(sent()).toHaveLength(0);
      });
    });

    it("T-44: two workers delivering two orders of one purchase at once send one B1", async () => {
      reset();
      const setup = await scratch.sql.begin(async (tx) => {
        const parents = await make.orderParents(tx);
        const [purchase] = await tx<{ id: string }[]>`
          INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
          VALUES ('live', 'PLN', 20000, 'en', ${parents.customerId}) RETURNING id`;
        const out: { orderId: string; eventId: string }[] = [];
        for (let i = 0; i < 2; i += 1) {
          const { orderId } = await order(tx as unknown as Tx, "live", {
            purchaseId: purchase?.id ?? "",
            totalMinor: 10000,
          });
          const s = await step(
            tx as unknown as Tx,
            orderId,
            "order.captured",
            "paid_unrouted",
          );
          out.push({ orderId, eventId: s.eventId });
        }
        return { purchaseId: purchase?.id ?? "", out };
      });
      // Two transactions racing on the unique key: the second waits for the first's commit, then
      // finds the row `sent` and skips.
      await Promise.all(
        setup.out.map((e) =>
          scratch.sql.begin((tx) =>
            handle(tx as unknown as Tx, {
              orderId: e.orderId,
              eventId: e.eventId,
              type: "order.captured",
              from: "placed",
              mode: "live",
            }),
          ),
        ),
      );
      const rows = await scratch.sql<{ status: string }[]>`
        SELECT status FROM notification_delivery WHERE source_key = ${`purchase:${setup.purchaseId}`}`;
      expect(rows).toEqual([{ status: "sent" }]);
      expect(sent().filter((m) => m.subject === "order-received")).toHaveLength(
        1,
      );
    });

    it("T-33: no log line of the suite carries an address, a phone, a recipient name or a token", () => {
      expect(lines.some((line) => line.includes("notification.sent"))).toBe(
        true,
      );
      expect(lines.some((line) => line.includes("notification.failed"))).toBe(
        true,
      );
      const out = lines.join("\n");
      for (const marker of [...MARKERS, OPS, "@example.test"]) {
        expect(out).not.toContain(marker);
      }
      for (const token of tokens) expect(out).not.toContain(token);
      expect(out).not.toContain("?t=");
    });

    /** Walks a live order to `in_production` with no notification run (setup only). */
    async function walk(tx: Tx, orderId: string): Promise<void> {
      for (const [event, to] of [
        ["order.captured", "paid_unrouted"],
        ["order.routed", "routed"],
        ["assignment.accepted", "accepted"],
        ["order.captured", "paid"],
        ["order.in_production", "in_production"],
      ] as const) {
        await applyTransition(tx, orderId, event, to);
      }
    }

    /** One dispatch run over `orderId`'s deliveries, each in a savepoint of `tx`. */
    async function dispatch(
      tx: Tx,
      options: { orderId: string; useHold?: boolean; batchSize?: number },
    ) {
      const savepoints: DeliveryTransaction = <T>(
        fn: (executor: OrderExecutor) => Promise<T>,
      ) =>
        tx.savepoint(async (sp) => {
          await asApp(sp as unknown as Tx, { role: "system" });
          try {
            return await fn(runnerOf(sp as unknown as Tx));
          } finally {
            await sp.unsafe("RESET ROLE");
          }
        }) as Promise<T>;
      const noop = () => Promise.resolve();
      return dispatchOutbox({
        handlers: {
          invoices: noop,
          payments: noop,
          routing: noop,
          notifications: notificationsOutboxHandler(deps()),
          payouts: noop,
          "analytics.ga4": noop,
          risk: noop,
        },
        transaction: savepoints,
        orderId: options.orderId,
        retryBaseSeconds: 0,
        alert: () => undefined,
        log,
        ...(options.useHold === true ? {} : { heldTargets: [] }),
        ...(options.batchSize === undefined
          ? {}
          : { batchSize: options.batchSize }),
      });
    }
  },
);
