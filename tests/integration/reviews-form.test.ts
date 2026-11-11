/**
 * The review form's commands on a database (spec 022a §10 T-12 connected half, T-13, T-14, T-15;
 * AC-12 to AC-15; TASK-371).
 *
 *  - T-12: the form's read (`reviewFormState`, what the `GET` runs) leaves `review`,
 *    `review_invite.used_at` and `order_event` unchanged, for an open, a used and an unknown link;
 *  - T-13: a valid submission writes one `review` with every column asserted (with and without
 *    `showFirstName`), sets `used_at`, appends one `review.created` (actor `buyer`), and leaves
 *    the order's status as it was;
 *  - T-14: a replay, a submission after `expires_at` and an unknown token write nothing; expired
 *    and unknown answer the same; `ReviewSubmission` refuses 1001 graphemes and ratings 0 and 6;
 *  - T-15: the opt-out sets `customer.review_invite_opt_out_at`, and that buyer's next invite is
 *    skipped `opted_out`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLogger } from "@/lib/logger";
import "@/modules/payments/events";
import {
  createReviewInvite,
  optOutOfReviewInvites,
  reviewFormState,
  ReviewSubmissionSchema,
  reviewToken,
  runReviewRequest,
  submitReview,
} from "@/modules/reviews";

import { registerFixtureEventSchemas } from "../fixtures/order-engine.ts";
import {
  applyTransition,
  insertPlacedOrder,
  walkOrderTo,
} from "../fixtures/order-state.ts";
import {
  agreement,
  orderParents,
  partner as makePartner,
} from "./support/rows.ts";
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
const PHOTO_AT = new Date("2027-03-27T09:00:00.000Z");
const NOW = new Date(PHOTO_AT.getTime() + 30 * HOUR);
const silent = createLogger({ level: "fatal", write: () => undefined });

interface Fixture {
  readonly orderId: string;
  readonly customerId: string;
  readonly countryId: string;
  readonly token: string;
  readonly inviteId: string;
}

/** A live order delivered with a photo, one product line, an accepted florist, and its invite. */
async function invited(
  tx: Tx,
  buyerName = "Łucja Nowak-Kowalska",
): Promise<Fixture> {
  const parents = await orderParents(tx);
  const orderId = await insertPlacedOrder(tx, { ...parents, mode: "live" });
  await tx`UPDATE "order" SET
    buyer_snapshot = ${tx.json({ name: buyerName, email: "lucja@example.test", countryIso2: "PL" })},
    recipient_snapshot = ${tx.json({ fullName: "Recipient Person", city: "Kraków" })},
    locale_code = 'pl'
    WHERE id = ${orderId}`;
  const [product] = await tx<
    { id: string }[]
  >`SELECT id FROM product ORDER BY sku LIMIT 1`;
  const productId = product?.id ?? null;
  if (productId !== null) {
    await tx`
      INSERT INTO order_line (order_id, kind, product_id, tier_key, qty, unit_retail_minor,
                              currency_code, vat_rate_bp)
      VALUES (${orderId}, 'product', ${productId}, 'standard', 1, 18900, 'PLN', 800)`;
  }
  const partnerId = await makePartner(tx, parents.countryId, "onboarding");
  await agreement(tx, partnerId);
  // The go-live flip is admin's (`status_flip_guard`): the fixture takes the admin role for it.
  await tx`SELECT set_config('app.role', 'admin', true)`;
  await tx`SELECT set_config('app.audit_action', 'partner.activate', true)`;
  await tx`UPDATE fulfillment_partner SET status = 'active' WHERE id = ${partnerId}`;
  await tx`SELECT set_config('app.role', '', true)`;
  await tx`SELECT set_config('app.audit_action', '', true)`;
  await tx`
    INSERT INTO order_assignment (order_id, partner_id, attempt, sla_expires_at, response,
                                  responded_at)
    VALUES (${orderId}, ${partnerId}, 1, now() + interval '1 hour', 'accept', now())`;
  await walkOrderTo(tx, orderId, "delivered");
  await applyTransition(
    tx,
    orderId,
    "order.photo_uploaded",
    "photo_uploaded",
    PHOTO_AT,
  );
  const [event] = await tx<{ id: string }[]>`
    SELECT id FROM order_event WHERE order_id = ${orderId} AND type = 'order.photo_uploaded'`;
  await createReviewInvite(
    runnerOf(tx),
    { orderId, eventId: event?.id ?? "" },
    { secret: () => SECRET, log: silent },
  );
  const [invite] = await tx<{ id: string }[]>`
    SELECT id FROM review_invite WHERE order_id = ${orderId}`;
  const inviteId = invite?.id ?? "";
  return {
    orderId,
    customerId: parents.customerId,
    countryId: parents.countryId,
    token: reviewToken(SECRET, inviteId),
    inviteId,
  };
}

async function counts(tx: Tx, orderId: string) {
  const [row] = await tx<{ reviews: number; used: number; events: number }[]>`
    SELECT (SELECT count(*)::int FROM review WHERE order_id = ${orderId}) AS reviews,
           (SELECT count(*)::int FROM review_invite
             WHERE order_id = ${orderId} AND used_at IS NOT NULL) AS used,
           (SELECT count(*)::int FROM order_event WHERE order_id = ${orderId}) AS events`;
  return row;
}

const submission = (input: Record<string, unknown>) =>
  ReviewSubmissionSchema.parse(input);

describe.skipIf(server.url === undefined)(
  `spec 022a: the review form${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "reviews_form");
    }, 240_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("T-12: the GET's read writes nothing, open, used or unknown", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const fixture = await invited(tx);
        const before = await counts(tx, fixture.orderId);
        const open = await reviewFormState(runnerOf(tx), fixture.token, NOW);
        expect(open.kind).toBe("open");
        if (open.kind === "open") {
          expect(open.order.localeCode).toBe("pl");
          expect(open.order.city).toBe("Kraków");
          expect(open.order).not.toHaveProperty("recipientName");
        }
        expect(await counts(tx, fixture.orderId)).toEqual(before);
        const unknown = await reviewFormState(
          runnerOf(tx),
          "A".repeat(43),
          NOW,
        );
        expect(unknown.kind).toBe("gone");
        expect(await counts(tx, fixture.orderId)).toEqual(before);
      });
    });

    it("T-13: a valid submission writes one review with every column, used_at and review.created; status unchanged", async () => {
      for (const showFirstName of [true, false]) {
        await rolledBack(scratch.sql, async (tx) => {
          const fixture = await invited(tx);
          const [order] = await tx<{ status: string; delivery_date: string }[]>`
            SELECT status, delivery_date::text FROM "order" WHERE id = ${fixture.orderId}`;
          const outcome = await submitReview(
            runnerOf(tx),
            fixture.token,
            submission({
              rating: "4",
              text: "  Piękne kwiaty, dziękuję 🌷  ",
              showFirstName,
            }),
            NOW,
          );
          expect(outcome.kind).toBe("thanks");
          const rows = await tx<Record<string, unknown>[]>`
            SELECT r.*, c.iso2, (SELECT partner_id FROM order_assignment
                                 WHERE order_id = r.order_id) AS assigned
            FROM review r JOIN country c ON c.id = r.destination_country_id
            WHERE r.order_id = ${fixture.orderId}`;
          expect(rows).toHaveLength(1);
          const row = rows[0] ?? {};
          expect(row["source"]).toBe("internal");
          expect(row["verified_order"]).toBe(true);
          expect(row["rating"]).toBe(4);
          expect(row["text"]).toBe("Piękne kwiaty, dziękuję 🌷");
          expect(row["moderation_status"]).toBe("pending");
          expect(row["locale_code"]).toBe("pl");
          expect(row["display_name"]).toBe(showFirstName ? "Łucja" : null);
          expect(row["destination_country_id"]).toBe(fixture.countryId);
          expect(row["partner_id"]).toBe(row["assigned"]);
          expect(row["partner_id"]).not.toBeNull();
          expect(row["product_id"]).not.toBeUndefined();
          expect((row["delivered_on"] as Date).toISOString().slice(0, 10)).toBe(
            order?.delivery_date,
          );
          if (outcome.kind === "thanks") {
            expect(outcome.partnerId).toBe(row["partner_id"]);
            expect(outcome.reviewId).toBe(row["id"]);
          }
          const [invite] = await tx<{ used_at: Date | null }[]>`
            SELECT used_at FROM review_invite WHERE id = ${fixture.inviteId}`;
          expect(invite?.used_at?.toISOString()).toBe(NOW.toISOString());
          const events = await tx<
            {
              actor: string;
              payload: Record<string, unknown>;
              from_status: string | null;
              to_status: string | null;
            }[]
          >`
            SELECT actor, payload, from_status, to_status FROM order_event
            WHERE order_id = ${fixture.orderId} AND type = 'review.created'`;
          expect(events).toHaveLength(1);
          expect(events[0]?.actor).toBe("buyer");
          expect(events[0]?.payload).toEqual({
            mode: "live",
            reviewId: row["id"],
            rating: 4,
          });
          const [after] = await tx<{ status: string }[]>`
            SELECT status FROM "order" WHERE id = ${fixture.orderId}`;
          expect(after?.status).toBe(order?.status);
        });
      }
    });

    it("T-14: a replay, an expired link and an unknown token write nothing; expired and unknown read the same", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const fixture = await invited(tx);
        const input = submission({ rating: 5 });
        expect(
          (await submitReview(runnerOf(tx), fixture.token, input, NOW)).kind,
        ).toBe("thanks");
        const afterFirst = await counts(tx, fixture.orderId);
        const replay = await submitReview(
          runnerOf(tx),
          fixture.token,
          input,
          NOW,
        );
        expect(replay.kind).toBe("used");
        expect(await counts(tx, fixture.orderId)).toEqual(afterFirst);
        expect(
          (await reviewFormState(runnerOf(tx), fixture.token, NOW)).kind,
        ).toBe("used");

        const late = await invited(tx);
        const lateBefore = await counts(tx, late.orderId);
        const afterExpiry = new Date(PHOTO_AT.getTime() + 30 * 24 * HOUR);
        const expired = await submitReview(
          runnerOf(tx),
          late.token,
          input,
          afterExpiry,
        );
        const unknown = await submitReview(
          runnerOf(tx),
          "B".repeat(43),
          input,
          NOW,
        );
        expect(expired).toEqual({ kind: "gone" });
        expect(unknown).toEqual({ kind: "gone" });
        expect(
          await reviewFormState(runnerOf(tx), late.token, afterExpiry),
        ).toEqual(await reviewFormState(runnerOf(tx), "B".repeat(43), NOW));
        expect(await counts(tx, late.orderId)).toEqual(lateBefore);
      });
      const segmenter = (text: string) =>
        ReviewSubmissionSchema.safeParse({ rating: 3, text });
      const mixed = (n: number) =>
        Array.from(
          { length: n },
          (_, index) => ["ż", "🌷", "a", "👩‍👩‍👧"][index % 4],
        ).join("");
      expect(segmenter(mixed(1000)).success).toBe(true);
      const tooLong = segmenter(mixed(1001));
      expect(tooLong.success).toBe(false);
      expect(tooLong.error?.issues[0]?.path).toEqual(["text"]);
      for (const rating of [0, 6, "x", 4.5]) {
        const refused = ReviewSubmissionSchema.safeParse({ rating });
        expect(refused.success, String(rating)).toBe(false);
        expect(refused.error?.issues[0]?.path).toEqual(["rating"]);
      }
    });

    it("T-15: the opt-out sets the customer's objection and later invites are skipped", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const fixture = await invited(tx);
        const [before] = await tx<{ opt: Date | null }[]>`
          SELECT review_invite_opt_out_at AS opt FROM customer WHERE id = ${fixture.customerId}`;
        expect(before?.opt).toBeNull();
        expect(
          await optOutOfReviewInvites(runnerOf(tx), fixture.token, NOW),
        ).toBe("done");
        expect(
          await optOutOfReviewInvites(runnerOf(tx), "C".repeat(43), NOW),
        ).toBe("gone");
        const [after] = await tx<{ opt: Date | null }[]>`
          SELECT review_invite_opt_out_at AS opt FROM customer WHERE id = ${fixture.customerId}`;
        expect(after?.opt?.toISOString()).toBe(NOW.toISOString());
        const counted = await runReviewRequest({
          transaction: (fn) => tx.savepoint((sp) => fn(runnerOf(sp))) as never,
          inviteEnabled: () => Promise.resolve(true),
          trustpilotEnabled: () => Promise.resolve(false),
          trustpilotAddress: () => undefined,
          secret: () => SECRET,
          send: () => Promise.reject(new Error("must not send")),
          now: () => NOW,
          log: silent,
        });
        expect(counted.skipped.opted_out).toBe(1);
        const [invite] = await tx<{ skipped_reason: string | null }[]>`
          SELECT skipped_reason FROM review_invite WHERE id = ${fixture.inviteId}`;
        expect(invite?.skipped_reason).toBe("opted_out");
      });
    });
  },
);
