/**
 * Spec 020a resend an email on a disposable PG16 (T-25, T-26, T-27; AC-24, AC-25, AC-26;
 * TASK-360).
 *
 * The originals are sent by spec 016's pipeline itself (`notificationsOutboxHandler` on a real
 * `outbox` row) or, for the per-template table, inserted as the pipeline writes them with their
 * outbox row and event. The admin action runs through `adminResendNotification` and
 * `runOrderAction` in an admin-context transaction as `app_web`; the job runs as `system`. The
 * mailer is the capturing mailer; the template is a stand-in that prints its template, locale and
 * link; the one-tap link is a stand-in minting a fresh token per call.
 *
 *  - T-25: for each template of §5.2's resend table, one order where its condition holds and one
 *    where it does not: "Resend" is offered exactly on the first; the list carries no `@`.
 *  - T-26: B1 (bounced) and V1 resent: one new row each with `admin:` and `resend_of`, the job
 *    sends once with `admin:{actionId}:{template}:{recipient}`, the buyer in `pl` for a `pl`
 *    order, the florist with a token that differs from the original's; a re-run sends nothing.
 *  - T-27: the fourth resend in 24 hours is refused and writes nothing (older ones do not count);
 *    a buyer resend on a `test` order is refused and writes nothing; with `notifications.email`
 *    off the row stays `queued` and the list says held, then sends once it is on.
 *  - Awkward: the same `actionId` twice is one resend (`replayed`); two resends that overlap list
 *    in lock order, not transaction-start order; an order already closed still resends B1, not B3.
 *  - Logs: no buyer address and no token in any pipeline log line of the suite.
 */
import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth/admin";
import { createLogger, type Logger } from "@/lib/logger";
import {
  type OrderActionTransaction,
  orderActionHistory,
} from "@/modules/admin/order-actions";
import {
  adminResendNotification,
  type AdminResendDeps,
  orderEmails,
} from "@/modules/admin/order-actions/resend";
import {
  capturingMailer,
  type Mailer,
  type NotificationDeps,
  type NotificationRenderer,
  notificationsOutboxHandler,
  runResendNotificationJob,
} from "@/modules/notifications";
import type { OrderEventType } from "@/modules/orders";

import { registerFixtureEventSchemas } from "../fixtures/order-engine.ts";
import {
  applyTransition,
  insertPlacedOrder,
  walkOrderTo,
} from "../fixtures/order-state.ts";
import * as make from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();
registerFixtureEventSchemas();

const ORIGIN = "https://staging.example.test";
const BUYER_EMAIL = "marker-buyer-3600@example.test";
const ADMIN = randomUUID();
const SESSION: AdminSession = {
  userId: ADMIN,
  displayName: "Resend Admin",
  roles: ["admin"],
  timeZone: "Europe/Warsaw",
};

const lines: string[] = [];
const log: Logger = createLogger({
  level: "debug",
  write: (line) => {
    lines.push(line);
  },
});

const tokens: string[] = [];
function signInLink(_userId: string, path: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  tokens.push(token);
  return Promise.resolve(
    `${ORIGIN}/vendor/sign-in/confirm?t=${token}&p=${path}`,
  );
}

const capture = capturingMailer("Flowers Overseas <orders@example.test>");
const attempts: { to: string; key: string | undefined; text: string }[] = [];
const mailer: Mailer = {
  send(message) {
    attempts.push({
      to: message.to,
      key: message.idempotencyKey,
      text: message.text,
    });
    return capture.send(message);
  },
};

/** The stand-in template: its key, the locale it was given, and the link. */
const renderer: NotificationRenderer = (input) =>
  Promise.resolve({
    subject: input.template,
    text: `template=${input.template} locale=${input.locale} link=${input.link ?? ""}`,
    html: `<p>${input.template}</p>`,
  });

let enabled = true;
function deps(over: Partial<NotificationDeps> = {}): NotificationDeps {
  return {
    mailer: () => mailer,
    provider: () => "capture",
    template: () => renderer,
    signInLink,
    opsAddress: () => "ops@example.test",
    siteOrigin: () => ORIGIN,
    emailEnabled: () => Promise.resolve(enabled),
    log,
    ...over,
  };
}

const scheduled: string[] = [];

/** The link token in a stand-in body. */
const tokenOf = (text: string): string =>
  /[?&]t=([A-Za-z0-9_-]+)/u.exec(text)?.[1] ?? "";

describe.skipIf(server.url === undefined)(
  `spec 020a resend on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let countryId = "";

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "admin_resend");
      await scratch.sql.begin(async (tx) => {
        await make.base(tx);
        await tx`INSERT INTO users (id, email) VALUES (${ADMIN}, 'resend-admin@example.test')`;
        await tx`INSERT INTO admin_profile (user_id, display_name) VALUES (${ADMIN}, 'Resend Admin')`;
        countryId = await make.country(tx, "PL");
      });
    }, 600_000);
    afterAll(async () => {
      await scratch.drop();
    });

    /** `withAdminContext` as the database sees it, on the scratch database. */
    const adminTransaction: OrderActionTransaction = (context, fn) =>
      scratch.sql.begin(async (tx) => {
        await tx`SELECT set_config('app.audit_action', ${context.action}, true)`;
        await tx`SELECT set_config('app.audit_reason', ${context.reason ?? ""}, true)`;
        await asApp(tx, {
          role: "admin",
          ...(context.userId === undefined ? {} : { userId: context.userId }),
        });
        return fn(runnerOf(tx));
      }) as never;

    /** As the worker: `app_web` in the `system` context. */
    function asSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      return scratch.sql.begin(async (tx) => {
        await asApp(tx, { role: "system" });
        return fn(tx);
      }) as Promise<T>;
    }

    async function seqOf(orderId: string): Promise<number> {
      const [row] = await scratch.sql<{ seq: number }[]>`
        SELECT coalesce(max(seq), 0)::int AS seq FROM order_event WHERE order_id = ${orderId}`;
      return row?.seq ?? 0;
    }

    async function totals() {
      const [row] = await scratch.sql<
        { deliveries: number; actions: number; audits: number }[]
      >`
        SELECT (SELECT count(*)::int FROM notification_delivery) AS deliveries,
               (SELECT count(*)::int FROM admin_order_action) AS actions,
               (SELECT count(*)::int FROM audit_log) AS audits`;
      return row;
    }

    interface Order {
      readonly orderId: string;
      readonly purchaseId: string;
    }

    /** A placed order with a marker buyer address, in `locale`, walked to `status`. */
    async function orderAt(
      status: string,
      options: { mode?: "live" | "test"; locale?: string } = {},
    ): Promise<Order> {
      return (await scratch.sql.begin(async (tx) => {
        const customerId = await make.customer(tx);
        const recipientId = await make.recipient(tx, customerId);
        const orderId = await insertPlacedOrder(tx, {
          customerId,
          recipientId,
          countryId,
          mode: options.mode ?? "live",
        });
        const locale = options.locale ?? "en";
        await tx`UPDATE "order" SET
          buyer_snapshot = ${tx.json({ name: "Marker Buyer", email: BUYER_EMAIL, countryIso2: "GB" })},
          locale_code = ${locale}
          WHERE id = ${orderId}`;
        const [p] = await tx<{ purchase_id: string }[]>`
          UPDATE purchase SET locale_code = ${locale}
          WHERE id = (SELECT purchase_id FROM "order" WHERE id = ${orderId})
          RETURNING id AS purchase_id`;
        if (status !== "placed") await walkOrderTo(tx, orderId, status);
        return { orderId, purchaseId: p?.purchase_id ?? "" };
      })) as Order;
    }

    /** A florist with one member per locale; returns the florist and its members. */
    async function florist(
      locales: readonly string[],
      status: "active" | "demo" = "active",
    ): Promise<{ partnerId: string; members: string[] }> {
      return (await scratch.sql.begin(async (tx) => {
        const partnerId = await make.partner(tx, countryId, status);
        await tx`UPDATE fulfillment_partner SET legal_name = 'Kwiaty Resend Fixture'
                 WHERE id = ${partnerId}`;
        const members: string[] = [];
        for (const [index, locale] of locales.entries()) {
          const id = randomUUID();
          await tx`INSERT INTO users (id, email)
                   VALUES (${id}, ${`member-${id.slice(0, 8)}@example.test`})`;
          await tx`INSERT INTO partner_member (user_id, partner_id, role, locale_code)
                   VALUES (${id}, ${partnerId}, ${index === 0 ? "owner" : "staff"}, ${locale})`;
          members.push(id);
        }
        return { partnerId, members };
      })) as { partnerId: string; members: string[] };
    }

    /** The outbox row of `eventId` (one per event), created when missing. */
    async function outboxOf(tx: Tx, eventId: string, orderId: string) {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO outbox (event_id, order_id, targets, payload, payload_version)
        VALUES (${eventId}, ${orderId}, ARRAY['notifications'], '{}'::jsonb, 1)
        ON CONFLICT (event_id) DO UPDATE SET payload_version = 1
        RETURNING id`;
      return row?.id ?? "";
    }

    /** The latest event of `type` on the order. */
    async function eventOf(tx: Tx, orderId: string, type: string) {
      const [row] = await tx<{ id: string; from_status: string | null }[]>`
        SELECT id, from_status FROM order_event
        WHERE order_id = ${orderId} AND type = ${type} ORDER BY seq DESC LIMIT 1`;
      if (row === undefined) throw new Error(`no ${type} on ${orderId}`);
      return row;
    }

    /** An open offer to `partnerId` with its `assignment.offered` event. */
    async function offer(tx: Tx, orderId: string, partnerId: string) {
      const [count] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM order_assignment WHERE order_id = ${orderId}`;
      const attempt = (count?.n ?? 0) + 1;
      const [assignment] = await tx<{ id: string }[]>`
        INSERT INTO order_assignment (order_id, partner_id, sla_expires_at, attempt)
        VALUES (${orderId}, ${partnerId}, now() + interval '1 hour', ${attempt}) RETURNING id`;
      const assignmentId = assignment?.id ?? "";
      const [current] = await tx<
        { status: string; seq: number; mode: string }[]
      >`
        SELECT o.status, o.mode, (SELECT max(seq) FROM order_event WHERE order_id = o.id)::int AS seq
        FROM "order" o WHERE o.id = ${orderId}`;
      const [event] = await tx<{ id: string }[]>`
        INSERT INTO order_event (order_id, seq, type, from_status, to_status, actor, payload,
                                 payload_version)
        VALUES (${orderId}, ${(current?.seq ?? 0) + 1}, 'assignment.offered',
                ${current?.status ?? ""}, ${current?.status ?? ""}, 'system:order.route',
                ${tx.json({ mode: current?.mode ?? "live", assignmentId, partnerId, attempt, answerWindowMinutes: 60 })},
                1)
        RETURNING id`;
      return { assignmentId, eventId: event?.id ?? "" };
    }

    /** Hands one event's `notifications` delivery to spec 016's handler, as the dispatcher does. */
    async function deliver(
      orderId: string,
      eventId: string,
      type: OrderEventType,
      from: string,
      mode: "live" | "test",
    ): Promise<void> {
      const outboxId = await scratch.sql.begin((tx) =>
        outboxOf(tx, eventId, orderId),
      );
      await asSystem((tx) =>
        notificationsOutboxHandler(deps())(
          {
            eventId,
            orderId,
            type,
            seq: 1,
            fromStatus: from,
            toStatus: null,
            mode,
          },
          {
            deliveryId: randomUUID(),
            outboxId: outboxId as string,
            target: "notifications",
            attempt: 1,
            executor: runnerOf(tx),
          },
        ),
      );
    }

    /** A delivery row as the pipeline writes it, for the table's fixtures. */
    async function original(input: {
      orderId: string | null;
      purchaseId?: string;
      sourceKey: string;
      template: string;
      audience: "buyer" | "florist";
      ref: string;
      status?: string;
    }): Promise<string> {
      const [row] = await scratch.sql<{ id: string }[]>`
        INSERT INTO notification_delivery (source_key, order_id, purchase_id, template_key,
                                           audience, recipient_ref, locale_code, provider, status,
                                           status_at)
        VALUES (${input.sourceKey}, ${input.orderId}, ${input.purchaseId ?? null},
                ${input.template}, ${input.audience}, ${input.ref}, 'en', 'capture',
                ${input.status ?? "delivered"}, now())
        RETURNING id`;
      return row?.id ?? "";
    }

    function resend(
      orderId: string,
      deliveryId: string,
      expectedSeq: number,
      over: { actionId?: string; transaction?: OrderActionTransaction } = {},
    ) {
      const options: AdminResendDeps = {
        guard: () => Promise.resolve(SESSION),
        transaction: over.transaction ?? adminTransaction,
        schedule: (id) => {
          scheduled.push(id);
          return Promise.resolve();
        },
        notifications: deps(),
      };
      return adminResendNotification(
        {
          orderId,
          actionId: over.actionId ?? randomUUID(),
          expectedSeq,
          deliveryId,
        },
        options,
      );
    }

    const runJob = (deliveryId: string) =>
      asSystem((tx) =>
        runResendNotificationJob(deliveryId, {
          ...deps(),
          executor: runnerOf(tx),
        }),
      );

    const emails = (orderId: string, now?: Date) =>
      orderEmails(
        orderId,
        { userId: ADMIN, roles: ["admin"] },
        {
          transaction: adminTransaction,
          emailEnabled: () => Promise.resolve(enabled),
          ...(now === undefined ? {} : { now: () => now }),
        },
      );

    async function row(id: string) {
      const [found] = await scratch.sql<
        {
          source_key: string;
          template_key: string;
          audience: string;
          recipient_ref: string;
          status: string;
          resend_of: string | null;
          order_id: string | null;
          purchase_id: string | null;
          locale_code: string;
        }[]
      >`
        SELECT source_key, template_key, audience, recipient_ref, status, resend_of, order_id,
               purchase_id, locale_code
        FROM notification_delivery WHERE id = ${id}`;
      if (found === undefined) throw new Error(`no delivery ${id}`);
      return found;
    }

    /* ---------------------------------------------------------------------- */
    /* T-25: the resend table, each row true and false                        */
    /* ---------------------------------------------------------------------- */

    type Fixture = {
      readonly orderId: string;
      readonly deliveryId: string;
      readonly now?: Date;
    };

    /** A buyer row on an order at `status`, its context the outbox row of `contextEvent`. */
    async function buyerRow(
      template: string,
      status: string,
      contextEvent: string,
      rowStatus = "delivered",
    ): Promise<Fixture> {
      const { orderId } = await orderAt(status);
      const sourceKey = await scratch.sql.begin(async (tx) => {
        const event = await eventOf(tx, orderId, contextEvent);
        return `outbox:${await outboxOf(tx, event.id, orderId)}`;
      });
      const deliveryId = await original({
        orderId,
        sourceKey: sourceKey as string,
        template,
        audience: "buyer",
        ref: "buyer",
        status: rowStatus,
      });
      return { orderId, deliveryId };
    }

    /** A florist row on an order at `status`, about one offer shaped by `shape`. */
    async function floristRow(
      template: string,
      status: string,
      shape: string,
      now?: Date,
    ): Promise<Fixture> {
      const { orderId } = await orderAt(status);
      const shop = await florist(["pl"]);
      const member = shop.members[0] ?? "";
      const sourceKey = await scratch.sql.begin(async (tx) => {
        const offered = await offer(tx, orderId, shop.partnerId);
        if (shape !== "") {
          await tx.unsafe(
            `UPDATE order_assignment SET ${shape} WHERE id = '${offered.assignmentId}'`,
          );
        }
        return `outbox:${await outboxOf(tx, offered.eventId, orderId)}`;
      });
      const deliveryId = await original({
        orderId,
        sourceKey: sourceKey as string,
        template,
        audience: "florist",
        ref: member,
      });
      return { orderId, deliveryId, ...(now === undefined ? {} : { now }) };
    }

    const ACCEPTED = "response = 'accept', responded_at = now()";
    const WITHDRAWN =
      "withdrawn_at = now(), withdrawn_reason = 'order_cancelled'";
    const AFTER_DELIVERY_DATE = new Date("2027-02-15T12:00:00Z");

    /** Spec 020a §5.2's table, transcribed: [template, holds, does not hold]. */
    const TABLE: readonly (readonly [
      string,
      () => Promise<Fixture>,
      () => Promise<Fixture>,
    ])[] = [
      [
        "B1 order-received: always, once sent",
        async () => {
          const o = await orderAt("paid_unrouted");
          return {
            orderId: o.orderId,
            deliveryId: await original({
              orderId: null,
              purchaseId: o.purchaseId,
              sourceKey: `purchase:${o.purchaseId}`,
              template: "order-received",
              audience: "buyer",
              ref: "buyer",
            }),
          };
        },
        async () => {
          const o = await orderAt("paid_unrouted");
          return {
            orderId: o.orderId,
            deliveryId: await original({
              orderId: null,
              purchaseId: o.purchaseId,
              sourceKey: `purchase:${o.purchaseId}`,
              template: "order-received",
              audience: "buyer",
              ref: "buyer",
              status: "queued",
            }),
          };
        },
      ],
      [
        "B2 being-made: while the buyer sees being made",
        () => buyerRow("being-made", "in_production", "order.in_production"),
        () => buyerRow("being-made", "out_for_delivery", "order.in_production"),
      ],
      [
        "B3 out-for-delivery: while on its way",
        () =>
          buyerRow(
            "out-for-delivery",
            "out_for_delivery",
            "order.out_for_delivery",
          ),
        () =>
          buyerRow("out-for-delivery", "delivered", "order.out_for_delivery"),
      ],
      [
        "B4 delivered-photo: always, once sent",
        () => buyerRow("delivered-photo", "photo_uploaded", "order.captured"),
        () =>
          buyerRow(
            "delivered-photo",
            "photo_uploaded",
            "order.captured",
            "queued",
          ),
      ],
      [
        "B5 cancelled: while cancelled or cancelled_refunded",
        () => buyerRow("cancelled", "cancelled", "order.cancelled"),
        () => buyerRow("cancelled", "delivered", "order.captured"),
      ],
      [
        "B6 refund: always, once sent",
        () => buyerRow("refund", "delivered", "order.captured"),
        () => buyerRow("refund", "delivered", "order.captured", "queued"),
      ],
      [
        "B8 credit-note: always, once sent",
        async () => {
          const { orderId } = await orderAt("delivered");
          return {
            orderId,
            deliveryId: await original({
              orderId,
              sourceKey: `job:invoice.email:${randomUUID()}`,
              template: "credit-note",
              audience: "buyer",
              ref: "buyer",
            }),
          };
        },
        async () => {
          const { orderId } = await orderAt("delivered");
          return {
            orderId,
            deliveryId: await original({
              orderId,
              sourceKey: `job:invoice.email:${randomUUID()}`,
              template: "credit-note",
              audience: "buyer",
              ref: "buyer",
              status: "queued",
            }),
          };
        },
      ],
      [
        "V1 offer: unanswered, not withdrawn, before its answer window ends",
        () => floristRow("offer", "routed", ""),
        () => floristRow("offer", "routed", ACCEPTED),
      ],
      [
        "V3 order-confirmed: accepted, not withdrawn, not yet delivered",
        () => floristRow("order-confirmed", "accepted", ACCEPTED),
        () => floristRow("order-confirmed", "delivered", ACCEPTED),
      ],
      [
        "V4 offer-withdrawn: withdrawn or timed out, before the delivery date passes there",
        () => floristRow("offer-withdrawn", "cancelled", WITHDRAWN),
        () =>
          floristRow(
            "offer-withdrawn",
            "cancelled",
            WITHDRAWN,
            AFTER_DELIVERY_DATE,
          ),
      ],
    ];

    for (const [name, holds, fails] of TABLE) {
      it(`T-25 (AC-24): ${name}: Resend on the order where it holds, not where it does not`, async () => {
        const yes = await holds();
        const no = await fails();
        const listYes = await emails(yes.orderId, yes.now);
        const listNo = await emails(no.orderId, no.now);
        expect(listYes?.map((r) => [r.deliveryId, r.resend.allowed])).toEqual([
          [yes.deliveryId, true],
        ]);
        expect(listNo?.map((r) => [r.deliveryId, r.resend.allowed])).toEqual([
          [no.deliveryId, false],
        ]);
        // AC-24: template, audience and status are listed; no address anywhere.
        expect(listYes?.[0]).toMatchObject({
          templateKey: expect.any(String),
          audience: expect.any(String),
          status: "delivered",
        });
        expect(JSON.stringify([listYes, listNo])).not.toContain("@");
      }, 120_000);
    }

    it("T-25 (AC-24): V2, V5, A1 and W rows list with no Resend; the florist row names its florist", async () => {
      const { orderId } = await orderAt("routed");
      const shop = await florist(["pl"]);
      const member = shop.members[0] ?? "";
      const sourceKey = await scratch.sql.begin(async (tx) => {
        const offered = await offer(tx, orderId, shop.partnerId);
        return `outbox:${await outboxOf(tx, offered.eventId, orderId)}`;
      });
      for (const [template, audience, ref] of [
        ["offer-reminder", "florist", member],
        ["photo-reminder", "florist", member],
        ["alert-no-partner", "ops", "ops"],
        ["whatsapp-copy", "ops", "ops"],
      ] as const) {
        await scratch.sql`
          INSERT INTO notification_delivery (source_key, order_id, template_key, audience,
                                             recipient_ref, locale_code, provider, status, status_at)
          VALUES (${sourceKey as string}, ${orderId}, ${template}, ${audience}, ${ref}, 'en',
                  'capture', 'sent', now())`;
      }
      const offerRow = await original({
        orderId,
        sourceKey: sourceKey as string,
        template: "offer",
        audience: "florist",
        ref: member,
      });
      const list = await emails(orderId);
      expect(
        list?.map((r) => [
          r.templateKey,
          r.code,
          r.resend.allowed ? "Resend" : r.resend.cause,
        ]),
      ).toEqual([
        ["offer-reminder", "V2", "reminder"],
        ["photo-reminder", "V5", "reminder"],
        ["alert-no-partner", "A1", "own_alert"],
        ["whatsapp-copy", "W", "own_alert"],
        ["offer", "V1", "Resend"],
      ]);
      expect(list?.find((r) => r.deliveryId === offerRow)?.partnerName).toBe(
        "Kwiaty Resend Fixture",
      );
      // A viewer without `orders.resend` sees no Resend at all.
      const finance = await orderEmails(
        orderId,
        { userId: ADMIN, roles: ["finance"] },
        {
          transaction: adminTransaction,
          emailEnabled: () => Promise.resolve(true),
        },
      );
      expect(finance?.find((r) => r.deliveryId === offerRow)?.resend).toEqual({
        allowed: false,
        cause: "permission",
      });
    }, 120_000);

    /* ---------------------------------------------------------------------- */
    /* T-26: B1 and V1 through the pipeline                                    */
    /* ---------------------------------------------------------------------- */

    it("T-26 (AC-25): B1 (bounced) and V1 resent: one admin row each with resend_of, one send with the admin key, the buyer in pl, a fresh florist token; a re-run sends nothing", async () => {
      const { orderId, purchaseId } = await orderAt("placed", { locale: "pl" });
      const shop = await florist(["pl", "en"]);
      const owner = shop.members[0] ?? "";
      // The originals, by spec 016's pipeline: B1 on capture, V1 on the offer.
      const captured = await scratch.sql.begin(async (tx) => {
        await applyTransition(tx, orderId, "order.captured", "paid_unrouted");
        await applyTransition(tx, orderId, "order.routed", "routed");
        const event = await eventOf(tx, orderId, "order.captured");
        const offered = await offer(tx, orderId, shop.partnerId);
        return { capturedId: event.id, offeredId: offered.eventId };
      });
      const { capturedId, offeredId } = captured as {
        capturedId: string;
        offeredId: string;
      };
      await deliver(orderId, capturedId, "order.captured", "placed", "live");
      await deliver(orderId, offeredId, "assignment.offered", "routed", "live");
      const [b1] = await scratch.sql<{ id: string }[]>`
        SELECT id FROM notification_delivery
        WHERE purchase_id = ${purchaseId} AND template_key = 'order-received'`;
      const [v1] = await scratch.sql<{ id: string }[]>`
        SELECT id FROM notification_delivery
        WHERE order_id = ${orderId} AND template_key = 'offer' AND recipient_ref = ${owner}`;
      const originalV1 = attempts.find(
        (a) => a.key?.endsWith(`:offer:${owner}`) === true,
      );
      expect(b1?.id).toBeDefined();
      expect(v1?.id).toBeDefined();
      expect(originalV1).toBeDefined();
      // The buyer's mailbox bounced; the address on the order is read again at send time.
      await scratch.sql`UPDATE notification_delivery SET status = 'bounced' WHERE id = ${b1?.id ?? ""}`;

      const sentBefore = attempts.length;
      const b1Action = randomUUID();
      const b1Result = await resend(
        orderId,
        b1?.id ?? "",
        await seqOf(orderId),
        {
          actionId: b1Action,
        },
      );
      expect(b1Result).toMatchObject({
        ok: true,
        kind: "resend",
        replayed: false,
      });
      const b1New = b1Result.ok ? b1Result.resultRef : "";
      expect(await row(b1New)).toEqual({
        source_key: `admin:${b1Action}`,
        template_key: "order-received",
        audience: "buyer",
        recipient_ref: "buyer",
        status: "queued",
        resend_of: b1?.id,
        order_id: null,
        purchase_id: purchaseId,
        locale_code: "pl",
      });
      expect(scheduled.at(-1)).toBe(b1New);
      expect(attempts).toHaveLength(sentBefore);

      expect(await runJob(b1New)).toBe("sent");
      expect(attempts.slice(sentBefore)).toEqual([
        {
          to: BUYER_EMAIL,
          key: `admin:${b1Action}:order-received:buyer`,
          text: "template=order-received locale=pl link=",
        },
      ]);
      expect((await row(b1New)).status).toBe("sent");

      const v1Action = randomUUID();
      const v1Result = await resend(
        orderId,
        v1?.id ?? "",
        await seqOf(orderId),
        {
          actionId: v1Action,
        },
      );
      expect(v1Result).toMatchObject({ ok: true, kind: "resend" });
      const v1New = v1Result.ok ? v1Result.resultRef : "";
      expect(await row(v1New)).toMatchObject({
        source_key: `admin:${v1Action}`,
        template_key: "offer",
        audience: "florist",
        recipient_ref: owner,
        resend_of: v1?.id,
        order_id: orderId,
        status: "queued",
      });
      expect(await runJob(v1New)).toBe("sent");
      const v1Send = attempts.at(-1);
      expect(v1Send?.key).toBe(`admin:${v1Action}:offer:${owner}`);
      expect(v1Send?.to).toMatch(/^member-/u);
      expect(v1Send?.text).toContain("locale=pl");
      const fresh = tokenOf(v1Send?.text ?? "");
      expect(fresh).not.toBe("");
      expect(fresh).not.toBe(tokenOf(originalV1?.text ?? ""));

      // A job re-run finds the row sent: nothing more.
      const count = attempts.length;
      expect(await runJob(v1New)).toBe("skipped");
      expect(await runJob(b1New)).toBe("skipped");
      expect(attempts).toHaveLength(count);

      // The history names the resent template and audience.
      const history = await orderActionHistory(
        orderId,
        { userId: ADMIN },
        { transaction: adminTransaction },
      );
      expect(history?.map((h) => [h.kind, h.id])).toEqual([
        ["resend", b1Action],
        ["resend", v1Action],
      ]);
    }, 180_000);

    /* ---------------------------------------------------------------------- */
    /* T-27: the limit, test orders, the hold                                  */
    /* ---------------------------------------------------------------------- */

    it("T-27 (AC-26): three resends of one email in 24 hours pass, the fourth is RESEND_RATE_LIMITED and writes nothing; older ones and other emails do not count", async () => {
      const { orderId } = await orderAt("delivered");
      const refund = await buyerRow("refund", "delivered", "order.captured");
      // Two emails on one order: the refund (three times) and B4 (once more after).
      const orderRefund = await scratch.sql.begin(async (tx) => {
        const event = await eventOf(tx, orderId, "order.captured");
        return `outbox:${await outboxOf(tx, event.id, orderId)}`;
      });
      const refundRow = await original({
        orderId,
        sourceKey: orderRefund as string,
        template: "refund",
        audience: "buyer",
        ref: "buyer",
      });
      const photoRow = await original({
        orderId,
        sourceKey: orderRefund as string,
        template: "delivered-photo",
        audience: "buyer",
        ref: "buyer",
      });
      // Three resends 25 hours ago: outside the window.
      await scratch.sql.begin(async (tx) => {
        await tx`SELECT set_config('app.audit_action', 'order.action.resend', true)`;
        for (let i = 0; i < 3; i += 1) {
          await tx`
            INSERT INTO admin_order_action (id, order_id, kind, actor_user_id,
                                            notification_delivery_id, result_ref, created_at)
            VALUES (${randomUUID()}, ${orderId}, 'resend', ${ADMIN}, ${refundRow},
                    ${randomUUID()}, now() - interval '25 hours')`;
        }
      });
      const seq = await seqOf(orderId);
      for (let i = 0; i < 3; i += 1) {
        expect(await resend(orderId, refundRow, seq)).toMatchObject({
          ok: true,
        });
      }
      const before = await totals();
      expect(await resend(orderId, refundRow, seq)).toEqual({
        ok: false,
        code: "RESEND_RATE_LIMITED",
      });
      expect(await totals()).toEqual(before);
      // Another email of the same order is not limited by the refund's count.
      expect(await resend(orderId, photoRow, seq)).toMatchObject({ ok: true });
      // The list shows the limit on the refund row only.
      const list = await emails(orderId);
      expect(list?.find((r) => r.deliveryId === refundRow)?.resend).toEqual({
        allowed: false,
        cause: "rate_limited",
      });
      expect(list?.find((r) => r.deliveryId === photoRow)?.resend).toEqual({
        allowed: true,
      });
      // Another order's limit is its own.
      expect(
        await resend(
          refund.orderId,
          refund.deliveryId,
          await seqOf(refund.orderId),
        ),
      ).toMatchObject({ ok: true });
    }, 180_000);

    it("T-27 (AC-26): a buyer resend on a test order is RESEND_NOT_ALLOWED and writes nothing; its florist row may be resent", async () => {
      const { orderId, purchaseId } = await orderAt("routed", { mode: "test" });
      const forged = await original({
        orderId: null,
        purchaseId,
        sourceKey: `purchase:${purchaseId}`,
        template: "order-received",
        audience: "buyer",
        ref: "buyer",
      });
      const before = await totals();
      expect(await resend(orderId, forged, await seqOf(orderId))).toEqual({
        ok: false,
        code: "RESEND_NOT_ALLOWED",
      });
      expect(await totals()).toEqual(before);
      const list = await emails(orderId);
      expect(list?.[0]?.resend).toEqual({
        allowed: false,
        cause: "test_order",
      });

      // A test order is offered to a florist in `demo` status (spec 016 §5.2).
      const shop = await florist(["en"], "demo");
      const sourceKey = await scratch.sql.begin(async (tx) => {
        const offered = await offer(tx, orderId, shop.partnerId);
        return `outbox:${await outboxOf(tx, offered.eventId, orderId)}`;
      });
      const v1 = await original({
        orderId,
        sourceKey: sourceKey as string,
        template: "offer",
        audience: "florist",
        ref: shop.members[0] ?? "",
      });
      expect(await resend(orderId, v1, await seqOf(orderId))).toMatchObject({
        ok: true,
      });
      // A delivery of another order is not this order's to resend.
      const other = await orderAt("delivered");
      expect(
        await resend(other.orderId, v1, await seqOf(other.orderId)),
      ).toEqual({
        ok: false,
        code: "RESEND_NOT_ALLOWED",
      });
    }, 180_000);

    it("T-27 (AC-26): with notifications.email off the new row stays queued and the list says held; turned on, it sends once", async () => {
      const b6 = await buyerRow("refund", "delivered", "order.captured");
      enabled = false;
      try {
        const result = await resend(
          b6.orderId,
          b6.deliveryId,
          await seqOf(b6.orderId),
        );
        expect(result).toMatchObject({ ok: true });
        const id = result.ok ? result.resultRef : "";
        const count = attempts.length;
        await expect(runJob(id)).rejects.toMatchObject({
          code: "NOTIFICATIONS_HELD",
        });
        expect((await row(id)).status).toBe("queued");
        expect(attempts).toHaveLength(count);
        const list = await emails(b6.orderId);
        expect(list?.find((r) => r.deliveryId === id)).toMatchObject({
          status: "queued",
          held: true,
          resendOf: b6.deliveryId,
          resend: { allowed: false, cause: "held" },
        });
        enabled = true;
        expect(await runJob(id)).toBe("sent");
        expect(attempts).toHaveLength(count + 1);
        expect(
          (await emails(b6.orderId))?.find((r) => r.deliveryId === id),
        ).toMatchObject({
          status: "sent",
          held: false,
        });
      } finally {
        enabled = true;
      }
    }, 180_000);

    /* ---------------------------------------------------------------------- */
    /* Awkward cases                                                           */
    /* ---------------------------------------------------------------------- */

    it("one actionId twice is one resend: the second is replayed with the same row and schedules nothing", async () => {
      const b6 = await buyerRow("refund", "delivered", "order.captured");
      const actionId = randomUUID();
      const seq = await seqOf(b6.orderId);
      const first = await resend(b6.orderId, b6.deliveryId, seq, { actionId });
      const queued = scheduled.length;
      const second = await resend(b6.orderId, b6.deliveryId, seq, { actionId });
      expect(first).toMatchObject({ ok: true, replayed: false });
      expect(second).toEqual({
        ok: true,
        kind: "resend",
        resultRef: first.ok ? first.resultRef : "",
        replayed: true,
      });
      expect(scheduled).toHaveLength(queued);
      const [n] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM notification_delivery WHERE resend_of = ${b6.deliveryId}`;
      expect(n?.n).toBe(1);
    }, 120_000);

    it("two resends that overlap list in the order they took the lock, not the order their transactions began", async () => {
      const b6 = await buyerRow("refund", "delivered", "order.captured");
      const seq = await seqOf(b6.orderId);
      let release = (): void => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let begun = (): void => undefined;
      const started = new Promise<void>((resolve) => {
        begun = resolve;
      });
      // A begins first, then waits before it reaches the order lock.
      const slow: OrderActionTransaction = (context, fn) =>
        scratch.sql.begin(async (tx) => {
          await tx`SELECT now()`;
          begun();
          await gate;
          await tx`SELECT set_config('app.audit_action', ${context.action}, true)`;
          await tx`SELECT set_config('app.audit_reason', '', true)`;
          await asApp(tx, { role: "admin", userId: ADMIN });
          return fn(runnerOf(tx));
        }) as never;
      const actionA = randomUUID();
      const actionB = randomUUID();
      const a = resend(b6.orderId, b6.deliveryId, seq, {
        actionId: actionA,
        transaction: slow,
      });
      await started;
      // B begins later, takes the lock first and commits.
      expect(
        await resend(b6.orderId, b6.deliveryId, seq, { actionId: actionB }),
      ).toMatchObject({ ok: true });
      release();
      expect(await a).toMatchObject({ ok: true });
      const history = await orderActionHistory(
        b6.orderId,
        { userId: ADMIN },
        { transaction: adminTransaction },
      );
      expect(history?.map((h) => h.id)).toEqual([actionB, actionA]);
    }, 120_000);

    it("an order already closed still resends B1, never B3", async () => {
      const { orderId, purchaseId } = await orderAt("closed");
      const b1 = await original({
        orderId: null,
        purchaseId,
        sourceKey: `purchase:${purchaseId}`,
        template: "order-received",
        audience: "buyer",
        ref: "buyer",
      });
      const b3Key = await scratch.sql.begin(async (tx) => {
        const event = await eventOf(tx, orderId, "order.captured");
        return `outbox:${await outboxOf(tx, event.id, orderId)}`;
      });
      const b3 = await original({
        orderId,
        sourceKey: b3Key as string,
        template: "out-for-delivery",
        audience: "buyer",
        ref: "buyer",
      });
      const seq = await seqOf(orderId);
      const before = await totals();
      expect(await resend(orderId, b3, seq)).toEqual({
        ok: false,
        code: "RESEND_NOT_ALLOWED",
      });
      expect(await totals()).toEqual(before);
      const result = await resend(orderId, b1, seq);
      expect(result).toMatchObject({ ok: true });
      expect(await runJob(result.ok ? result.resultRef : "")).toBe("sent");
    }, 120_000);

    it("no pipeline log line of the suite carries the buyer's address or a sign-in token", () => {
      expect(lines.length).toBeGreaterThan(0);
      const all = lines.join("\n");
      expect(all).not.toContain(BUYER_EMAIL);
      expect(all).not.toContain("@example.test");
      for (const token of tokens) expect(all).not.toContain(token);
    });
  },
);
