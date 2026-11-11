/**
 * The review invitation on a database (spec 022a §10 T-06, T-07, T-08, T-10 connected half,
 * T-15 job half; AC-6 to AC-8, AC-10, AC-15; TASK-370).
 *
 * On a migrated PG16 scratch database (`support/scratch-db.ts`), every case in a transaction that
 * is rolled back, each job transaction a savepoint of it:
 *
 *  - T-06: `order.photo_uploaded` on a `live` order makes exactly one invite, `send_after` = photo
 *    + 24 h and `expires_at` = photo + 30 × 24 h, also when the outbox row is handled twice;
 *    `test` and `demo` orders make none; the stored hash is the token's SHA-256, never the token;
 *  - T-07: with `reviews.invite` on, one run sends one B9 in `order.locale_code` and sets
 *    `sent_at`; a second run sends nothing; a retried send renders a byte-identical body; with the
 *    flag off nothing is sent until `expires_at`, then the invite is `expired`;
 *  - T-08: data-driven over every status reachable after `photo_uploaded`, the invite is sent;
 *    an opted-out buyer, a redacted customer and an expired invite are skipped with their reason;
 *  - T-10: the BCC and the snippet only with the flag on and the address set; `trustpilot_bcc`
 *    stored.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLogger } from "@/lib/logger";
import "@/modules/payments/events";
import {
  type CapturedMail,
  capturingMailer,
  type Mailer,
  type NotificationDeps,
  sendReviewInviteNotification,
} from "@/modules/notifications";
import { registerReviewInviteTemplate } from "@/modules/notifications/emails";
import { outboxTargets } from "@/modules/orders";
import {
  createReviewInvite,
  type InviteTransaction,
  reviewToken,
  reviewTokenHash,
  runReviewRequest,
  type ReviewRequestDeps,
} from "@/modules/reviews";

import { registerFixtureEventSchemas } from "../fixtures/order-engine.ts";
import {
  applyTransition,
  insertPlacedOrder,
  walkOrderTo,
} from "../fixtures/order-state.ts";
import { orderParents } from "./support/rows.ts";
import {
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();
registerFixtureEventSchemas();

const HOUR = 3_600_000;
const SECRET = "integration-review-secret-0123456789abcdef";
const ORIGIN = "https://flowersoverseas.test";
const AFS = "afs-123@invite.trustpilot.example";
const BUYER_EMAIL = "ada.buyer@example.test";
const PHOTO_AT = new Date("2027-03-27T09:00:00.000Z");
const silent = createLogger({ level: "fatal", write: () => undefined });

registerReviewInviteTemplate({
  policyUrl: (locale) => `${ORIGIN}/${locale}/legal/reviews`,
});

const capture = capturingMailer("Flowers Overseas <orders@example.test>");
const sends: { to: string; bcc: string | undefined; html: string }[] = [];
const mailer: Mailer = {
  send(message) {
    sends.push({ to: message.to, bcc: message.bcc, html: message.html });
    return capture.send(message);
  },
};
const notificationDeps: NotificationDeps = {
  mailer: () => mailer,
  provider: () => "capture",
  siteOrigin: () => ORIGIN,
  emailEnabled: () => Promise.resolve(true),
  log: silent,
};

function savepoints(tx: Tx): InviteTransaction {
  return <T>(fn: (executor: ReturnType<typeof runnerOf>) => Promise<T>) =>
    tx.savepoint((sp) => fn(runnerOf(sp))) as Promise<T>;
}

function requestDeps(
  tx: Tx,
  over: Partial<ReviewRequestDeps> & { at: Date },
): ReviewRequestDeps {
  const { at, ...rest } = over;
  return {
    transaction: savepoints(tx),
    inviteEnabled: () => Promise.resolve(true),
    trustpilotEnabled: () => Promise.resolve(false),
    trustpilotAddress: () => AFS,
    secret: () => SECRET,
    send: (executor, input) =>
      sendReviewInviteNotification(executor, input, notificationDeps),
    now: () => at,
    log: silent,
    ...rest,
  };
}

interface PhotoOrder {
  readonly orderId: string;
  readonly eventId: string;
  readonly customerId: string;
}

/** An order of `mode` walked to `photo_uploaded`, the photo event at `photoAt`. */
async function photoOrder(
  tx: Tx,
  mode: "live" | "test" | "demo",
  photoAt: Date = PHOTO_AT,
  locale = "pl",
): Promise<PhotoOrder> {
  const parents = await orderParents(tx);
  await tx`INSERT INTO locale (code, bcp47, name) VALUES ('de', 'de-DE', 'Deutsch')
           ON CONFLICT DO NOTHING`;
  const orderId = await insertPlacedOrder(tx, { ...parents, mode });
  await tx`UPDATE "order" SET
    buyer_snapshot = ${tx.json({ name: "Ada Lovelace", email: BUYER_EMAIL, countryIso2: "GB" })},
    locale_code = ${locale}
    WHERE id = ${orderId}`;
  await walkOrderTo(tx, orderId, "delivered");
  await applyTransition(
    tx,
    orderId,
    "order.photo_uploaded",
    "photo_uploaded",
    photoAt,
  );
  const [event] = await tx<{ id: string }[]>`
    SELECT id FROM order_event WHERE order_id = ${orderId} AND type = 'order.photo_uploaded'`;
  return {
    orderId,
    eventId: event?.id ?? "",
    customerId: parents.customerId,
  };
}

async function invite(tx: Tx, order: PhotoOrder): Promise<boolean> {
  return createReviewInvite(
    runnerOf(tx),
    { orderId: order.orderId, eventId: order.eventId },
    { secret: () => SECRET, log: silent },
  );
}

interface InviteRow {
  id: string;
  token_hash: string;
  send_after: Date;
  expires_at: Date;
  sent_at: Date | null;
  skipped_reason: string | null;
  trustpilot_bcc: boolean;
}

async function invitesOf(tx: Tx, orderId: string): Promise<InviteRow[]> {
  return tx<InviteRow[]>`
    SELECT id, token_hash, send_after, expires_at, sent_at, skipped_reason, trustpilot_bcc
    FROM review_invite WHERE order_id = ${orderId}`;
}

async function deliveries(tx: Tx, orderId: string): Promise<number> {
  const [row] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM notification_delivery
    WHERE order_id = ${orderId} AND template_key = 'review-invite'`;
  return row?.n ?? 0;
}

describe.skipIf(server.url === undefined)(
  `spec 022a: the review invitation${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "reviews_invite");
    }, 240_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("T-06: the route is `live` only", () => {
      const names = (mode: "live" | "test" | "demo") =>
        outboxTargets("order.photo_uploaded", mode).map(
          (target) => target.name,
        );
      expect(names("live")).toContain("reviews");
      expect(names("test")).not.toContain("reviews");
      expect(names("demo")).not.toContain("reviews");
    });

    it("T-06: one invite per live photo, the two instants exact, none for test and demo", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const live = await photoOrder(tx, "live");
        expect(await invite(tx, live)).toBe(true);
        // The outbox row handled a second time: nothing more.
        expect(await invite(tx, live)).toBe(false);
        const rows = await invitesOf(tx, live.orderId);
        expect(rows).toHaveLength(1);
        const [row] = rows;
        expect(row?.send_after.toISOString()).toBe(
          new Date(PHOTO_AT.getTime() + 24 * HOUR).toISOString(),
        );
        // 30 × 24 absolute hours: across the 28 March DST change in Europe/Warsaw too.
        expect(row?.expires_at.toISOString()).toBe(
          new Date(PHOTO_AT.getTime() + 30 * 24 * HOUR).toISOString(),
        );
        const token = reviewToken(SECRET, row?.id ?? "");
        expect(row?.token_hash).toBe(reviewTokenHash(token));
        expect(row?.token_hash).not.toContain(token);

        for (const mode of ["test", "demo"] as const) {
          const other = await photoOrder(tx, mode);
          expect(await invite(tx, other)).toBe(false);
          expect(await invitesOf(tx, other.orderId)).toHaveLength(0);
        }
      });
    });

    it("T-07: flag on sends one B9 once; a retry renders the same bytes; flag off waits, then expires", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const order = await photoOrder(tx, "live", PHOTO_AT, "de");
        await invite(tx, order);
        const before = sends.length;

        // Not due yet (23 h 59 min): nothing.
        const early = await runReviewRequest(
          requestDeps(tx, {
            at: new Date(PHOTO_AT.getTime() + 24 * HOUR - 60_000),
          }),
        );
        expect(early.sent).toBe(0);

        const at = new Date(PHOTO_AT.getTime() + 25 * HOUR);
        const first = await runReviewRequest(requestDeps(tx, { at }));
        expect(first.sent).toBe(1);
        const second = await runReviewRequest(requestDeps(tx, { at }));
        expect(second.sent).toBe(0);
        expect(sends.length - before).toBe(1);
        expect(await deliveries(tx, order.orderId)).toBe(1);
        const [row] = await invitesOf(tx, order.orderId);
        expect(row?.sent_at?.toISOString()).toBe(at.toISOString());
        const sent = sends.at(-1);
        expect(sent?.to).toBe(BUYER_EMAIL);
        expect(sent?.html).toContain('lang="de"');
        const token = reviewToken(SECRET, row?.id ?? "");
        expect(sent?.html).toContain(`${ORIGIN}/de/review/${token}?r=4`);

        // A retry of the same send (the row reset to queued, as after a crash before the commit):
        // the same key and the same bytes, so the capturing mailer answers as Resend would.
        await tx`UPDATE notification_delivery SET status = 'queued'
                 WHERE order_id = ${order.orderId} AND template_key = 'review-invite'`;
        await sendReviewInviteNotification(
          runnerOf(tx),
          { inviteId: row?.id ?? "", orderId: order.orderId, token },
          notificationDeps,
        );
        expect(sends.at(-1)?.html).toBe(sent?.html);
        const captured: readonly CapturedMail[] = capture.messages(BUYER_EMAIL);
        expect(captured.at(-1)?.html).toBe(sent?.html);
      });

      await rolledBack(scratch.sql, async (tx) => {
        const order = await photoOrder(tx, "live");
        await invite(tx, order);
        const off = { inviteEnabled: () => Promise.resolve(false) };
        const before = sends.length;
        const waiting = await runReviewRequest(
          requestDeps(tx, {
            ...off,
            at: new Date(PHOTO_AT.getTime() + 29 * 24 * HOUR),
          }),
        );
        expect(waiting).toMatchObject({ sent: 0, expired: 0 });
        expect(
          (await invitesOf(tx, order.orderId))[0]?.skipped_reason,
        ).toBeNull();
        const past = await runReviewRequest(
          requestDeps(tx, {
            ...off,
            at: new Date(PHOTO_AT.getTime() + 30 * 24 * HOUR),
          }),
        );
        expect(past.expired).toBe(1);
        expect(sends.length).toBe(before);
        const [row] = await invitesOf(tx, order.orderId);
        expect(row?.skipped_reason).toBe("expired");
        expect(row?.sent_at).toBeNull();
        // Turned on later: an expired invite is never sent.
        const later = await runReviewRequest(
          requestDeps(tx, {
            at: new Date(PHOTO_AT.getTime() + 31 * 24 * HOUR),
          }),
        );
        expect(later.sent).toBe(0);
      });
    });

    it("T-08: every status after the photo is invited; only opted-out, redacted and expired are skipped", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const edges = await tx<{ from: string; to: string }[]>`
          SELECT from_status AS "from", to_status AS "to" FROM order_transition`;
        const reachable = new Set<string>(["photo_uploaded"]);
        for (let grew = true; grew;) {
          grew = false;
          for (const edge of edges) {
            if (reachable.has(edge.from) && !reachable.has(edge.to)) {
              reachable.add(edge.to);
              grew = true;
            }
          }
        }
        // closed, disputed, resolved, refunded_full and the chargeback states, at least.
        for (const status of [
          "closed",
          "disputed",
          "resolved",
          "refunded_full",
        ]) {
          expect(reachable).toContain(status);
        }
        const at = new Date(PHOTO_AT.getTime() + 25 * HOUR);
        for (const status of reachable) {
          const order = await photoOrder(tx, "live");
          await invite(tx, order);
          if (status !== "photo_uploaded") {
            await walkOrderTo(tx, order.orderId, status);
          }
          await runReviewRequest(requestDeps(tx, { at }));
          const [row] = await invitesOf(tx, order.orderId);
          expect(row?.sent_at, status).not.toBeNull();
          expect(row?.skipped_reason, status).toBeNull();
        }

        const optedOut = await photoOrder(tx, "live");
        await invite(tx, optedOut);
        await tx`UPDATE customer SET review_invite_opt_out_at = now() WHERE id = ${optedOut.customerId}`;
        const redacted = await photoOrder(tx, "live");
        await invite(tx, redacted);
        await tx`UPDATE customer SET redacted = true, redacted_at = now() WHERE id = ${redacted.customerId}`;
        const expired = await photoOrder(tx, "live");
        await invite(tx, expired);
        await tx`UPDATE review_invite SET expires_at = ${at.toISOString()}::timestamptz - interval '1 second'
                 WHERE order_id = ${expired.orderId}`;
        const counts = await runReviewRequest(requestDeps(tx, { at }));
        expect(counts.sent).toBe(0);
        expect(counts.skipped).toEqual({
          opted_out: 1,
          redacted: 1,
          expired: 1,
        });
        expect((await invitesOf(tx, optedOut.orderId))[0]?.skipped_reason).toBe(
          "opted_out",
        );
        expect((await invitesOf(tx, redacted.orderId))[0]?.skipped_reason).toBe(
          "redacted",
        );
        expect((await invitesOf(tx, expired.orderId))[0]?.skipped_reason).toBe(
          "expired",
        );
      });
    });

    it("T-10: the BCC and the snippet only with the flag on and the address set", async () => {
      const cases = [
        { flag: true, address: AFS, bcc: true },
        { flag: true, address: undefined, bcc: false },
        { flag: false, address: AFS, bcc: false },
        { flag: false, address: undefined, bcc: false },
      ];
      for (const option of cases) {
        await rolledBack(scratch.sql, async (tx) => {
          const order = await photoOrder(tx, "live", PHOTO_AT, "en");
          await invite(tx, order);
          await runReviewRequest(
            requestDeps(tx, {
              at: new Date(PHOTO_AT.getTime() + 25 * HOUR),
              trustpilotEnabled: () => Promise.resolve(option.flag),
              trustpilotAddress: () => option.address,
            }),
          );
          const sent = sends.at(-1);
          const [row] = await invitesOf(tx, order.orderId);
          expect(row?.trustpilot_bcc, JSON.stringify(option)).toBe(option.bcc);
          expect(sent?.bcc).toBe(option.bcc ? AFS : undefined);
          expect(sent?.html.includes("application/json+trustpilot")).toBe(
            option.bcc,
          );
          if (option.bcc) {
            expect(sent?.html).toContain('"recipientName":"Ada"');
            expect(sent?.html).toContain(`"recipientEmail":"${BUYER_EMAIL}"`);
            expect(sent?.html).toMatch(
              /"referenceId":"FO-[0-9A-Z]{4}-[0-9A-Z]{4}"/u,
            );
          }
        });
      }
    });
  },
);
