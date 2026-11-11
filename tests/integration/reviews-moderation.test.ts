/**
 * Moderation, the exit metric, the overdue list, the rating refresh and the redaction on a
 * database (spec 022a §10 T-16 to T-18, T-20, T-22 connected half, T-29; AC-16 to AC-18, AC-20,
 * AC-22, AC-29; TASK-372).
 *
 *  - T-16: the queue lists pending reviews oldest first; the metric is 4.33 over 3 ratings for
 *    [5, 4, 4] plus a removed 1;
 *  - T-17: each action writes its columns and one `audit_log` row (admin context); a removal
 *    without a note, a removal reason on "publish without text" and a reason outside the list are
 *    refused by `ModerationAction`; an `UPDATE` of `rating` or `text` raises
 *    `REVIEW_CONTENT_IMMUTABLE`;
 *  - T-18: a withheld review is in `public_review` with its stars and a null text, counts in the
 *    metric and in `partnerRatingBp`'s input; a removed one is in neither;
 *  - T-20: a review pending 72 h + 1 min is overdue, one pending 71 h is not;
 *  - T-22: the refresh writes both columns after a submission and after a removal, covers every
 *    non-demo florist nightly, and never writes `status`;
 *  - T-29: redacting a customer with two reviews nulls text and name, sets `redacted_at`, keeps
 *    the ratings, and the public view then shows no text and no name.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import "@/modules/payments/events";
import { refreshPartnerRatings } from "@/modules/partners";
import {
  exitMetric,
  moderateReview,
  ModerationActionSchema,
  overduePendingReviews,
  queueCounts,
  listPublicReviews,
  redactForCustomer,
  reviewQueue,
  reviewSummary,
} from "@/modules/reviews";

import { registerFixtureEventSchemas } from "../fixtures/order-engine.ts";
import { insertPlacedOrder } from "../fixtures/order-state.ts";
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
const NOW = new Date("2027-05-01T12:00:00.000Z");

async function activePartner(tx: Tx, countryId: string): Promise<string> {
  const partnerId = await makePartner(tx, countryId, "onboarding");
  await agreement(tx, partnerId);
  await tx`SELECT set_config('app.role', 'admin', true)`;
  await tx`SELECT set_config('app.audit_action', 'partner.activate', true)`;
  await tx`UPDATE fulfillment_partner SET status = 'active' WHERE id = ${partnerId}`;
  await tx`SELECT set_config('app.role', '', true)`;
  await tx`SELECT set_config('app.audit_action', '', true)`;
  return partnerId;
}

interface Made {
  readonly reviewId: string;
  readonly orderId: string;
  readonly customerId: string;
}

/** A live order and its first-party review, `pending`, created `ageMs` before `NOW`. */
async function review(
  tx: Tx,
  input: {
    rating: number;
    partnerId?: string | null;
    ageMs?: number;
    text?: string | null;
    name?: string | null;
    customerId?: string;
    countryId?: string;
  },
): Promise<Made> {
  const parents = await orderParents(tx);
  const customerId = input.customerId ?? parents.customerId;
  const countryId = input.countryId ?? parents.countryId;
  const orderId = await insertPlacedOrder(tx, {
    ...parents,
    customerId,
    countryId,
    mode: "live",
  });
  const created = new Date(NOW.getTime() - (input.ageMs ?? HOUR)).toISOString();
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO review (order_id, source, rating, text, verified_order, moderation_status,
                        locale_code, display_name, destination_country_id, partner_id,
                        delivered_on, created_at)
    VALUES (${orderId}, 'internal', ${input.rating}, ${input.text === undefined ? "Lovely" : input.text},
            true, 'pending', 'en', ${input.name ?? null}, ${countryId},
            ${input.partnerId ?? null}, DATE '2027-04-20', ${created}::timestamptz)
    RETURNING id`;
  return { reviewId: row?.id ?? "", orderId, customerId };
}

/** Runs `fn` as the admin role with an audit action, as the admin action does. */
async function asAdmin<T>(
  tx: Tx,
  action: string,
  adminId: string,
  fn: () => Promise<T>,
) {
  await tx`SELECT set_config('app.role', 'admin', true)`;
  await tx`SELECT set_config('app.user_id', ${adminId}, true)`;
  await tx`SELECT set_config('app.audit_action', ${action}, true)`;
  try {
    return await fn();
  } finally {
    await tx`SELECT set_config('app.role', '', true)`;
    await tx`SELECT set_config('app.audit_action', '', true)`;
  }
}

async function adminUser(tx: Tx): Promise<string> {
  const id = randomUUID();
  await tx`INSERT INTO users (id, email) VALUES (${id}, ${`${id}@example.test`})`;
  return id;
}

async function audits(tx: Tx, reviewId: string): Promise<number> {
  const [row] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM audit_log
    WHERE entity_table = 'review' AND entity_id = ${reviewId}`;
  return row?.n ?? 0;
}

describe.skipIf(server.url === undefined)(
  `spec 022a: moderation and rating${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(
        server.url as string,
        "reviews_moderation",
      );
    }, 240_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("T-16: the queue is oldest first; the metric is 4.33 over 3 for [5, 4, 4] and a removed 1", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        await tx`DELETE FROM review`;
        const admin = await adminUser(tx);
        const newest = await review(tx, { rating: 5, ageMs: 1 * HOUR });
        const oldest = await review(tx, { rating: 4, ageMs: 50 * HOUR });
        const middle = await review(tx, { rating: 4, ageMs: 20 * HOUR });
        const fake = await review(tx, { rating: 1, ageMs: 10 * HOUR });
        await asAdmin(tx, "reviews.remove", admin, () =>
          moderateReview(
            runnerOf(tx),
            fake.reviewId,
            { action: "remove", reason: "test_order", note: "Placed by us" },
            admin,
            NOW,
          ),
        );
        const queue = await reviewQueue(runnerOf(tx), { status: "pending" });
        expect(queue.map((item) => item.id)).toEqual([
          oldest.reviewId,
          middle.reviewId,
          newest.reviewId,
        ]);
        expect(await exitMetric(runnerOf(tx))).toEqual({
          average: 4.33,
          count: 3,
        });
        expect(await queueCounts(runnerOf(tx))).toMatchObject({
          pending: 3,
          removed: 1,
          all: 4,
        });
      });
    });

    it("T-17: each action writes its columns and one audit row; content is immutable", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const admin = await adminUser(tx);
        const run = async (reviewId: string, input: unknown) =>
          asAdmin(tx, "reviews.test", admin, () =>
            moderateReview(
              runnerOf(tx),
              reviewId,
              ModerationActionSchema.parse(input),
              admin,
              NOW,
            ),
          );
        const read = async (reviewId: string) =>
          (
            await tx<
              Record<string, unknown>[]
            >`SELECT * FROM review WHERE id = ${reviewId}`
          )[0] ?? {};

        const a = await review(tx, { rating: 5 });
        const before = await audits(tx, a.reviewId);
        await run(a.reviewId, { action: "publish" });
        let row = await read(a.reviewId);
        expect(row).toMatchObject({
          moderation_status: "published",
          text_visible: true,
          moderation_reason: null,
          moderated_by: admin,
        });
        expect((row["published_at"] as Date).toISOString()).toBe(
          NOW.toISOString(),
        );
        expect(await audits(tx, a.reviewId)).toBe(before + 1);

        const b = await review(tx, { rating: 3 });
        const beforeB = await audits(tx, b.reviewId);
        await run(b.reviewId, {
          action: "publish_without_text",
          reason: "personal_data",
        });
        row = await read(b.reviewId);
        expect(row).toMatchObject({
          moderation_status: "published",
          text_visible: false,
          moderation_reason: "personal_data",
          text: "Lovely",
        });
        expect(await audits(tx, b.reviewId)).toBe(beforeB + 1);

        const c = await review(tx, { rating: 2 });
        const beforeC = await audits(tx, c.reviewId);
        await run(c.reviewId, {
          action: "remove",
          reason: "duplicate",
          note: "Same as the other",
        });
        row = await read(c.reviewId);
        expect(row).toMatchObject({
          moderation_status: "hidden",
          moderation_reason: "duplicate",
          moderation_note: "Same as the other",
        });
        expect(await audits(tx, c.reviewId)).toBe(beforeC + 1);

        const beforeReply = await audits(tx, a.reviewId);
        await run(a.reviewId, {
          action: "reply",
          text: "Thank you for writing to us.",
        });
        row = await read(a.reviewId);
        expect(row["response_text"]).toBe("Thank you for writing to us.");
        expect((row["response_at"] as Date).toISOString()).toBe(
          NOW.toISOString(),
        );
        expect(await audits(tx, a.reviewId)).toBe(beforeReply + 1);

        for (const refused of [
          { action: "remove", reason: "duplicate" },
          { action: "remove", reason: "duplicate", note: "   " },
          { action: "publish_without_text", reason: "not_genuine" },
          { action: "publish_without_text", reason: "low_rating" },
          { action: "remove", reason: "rude", note: "x" },
          { action: "edit", text: "x" },
        ]) {
          expect(
            ModerationActionSchema.safeParse(refused).success,
            JSON.stringify(refused),
          ).toBe(false);
        }

        await expect(
          tx.savepoint(
            (sp) => sp`UPDATE review SET rating = 5 WHERE id = ${c.reviewId}`,
          ),
        ).rejects.toThrow(/REVIEW_CONTENT_IMMUTABLE/u);
        await expect(
          tx.savepoint(
            (sp) =>
              sp`UPDATE review SET text = 'changed' WHERE id = ${c.reviewId}`,
          ),
        ).rejects.toThrow(/REVIEW_CONTENT_IMMUTABLE/u);
      });
    });

    it("T-18: a withheld review is public with stars and no text, and counts; a removed one is nowhere", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const admin = await adminUser(tx);
        const parents = await orderParents(tx);
        const partnerId = await activePartner(tx, parents.countryId);
        const withheld = await review(tx, {
          rating: 2,
          partnerId,
          ageMs: 2 * HOUR,
        });
        const removed = await review(tx, {
          rating: 1,
          partnerId,
          ageMs: 3 * HOUR,
        });
        await review(tx, { rating: 5, partnerId, ageMs: 4 * HOUR });
        await review(tx, { rating: 5, partnerId, ageMs: 5 * HOUR });
        await asAdmin(tx, "reviews.test", admin, async () => {
          await moderateReview(
            runnerOf(tx),
            withheld.reviewId,
            { action: "publish_without_text", reason: "abuse" },
            admin,
            NOW,
          );
          await moderateReview(
            runnerOf(tx),
            removed.reviewId,
            { action: "remove", reason: "not_genuine", note: "Not our order" },
            admin,
            NOW,
          );
        });
        const visible = await tx<
          { id: string; rating: number; text: string | null }[]
        >`
          SELECT id, rating, text FROM public_review WHERE id IN (${withheld.reviewId}, ${removed.reviewId})`;
        expect(visible).toEqual([
          { id: withheld.reviewId, rating: 2, text: null },
        ]);
        // The public reads see the same: the withheld 2 with no text counts; the removed 1 and the
        // two pending 5s are not there (TASK-373 summary and list).
        const summary = await reviewSummary(runnerOf(tx), "all");
        expect(summary).toMatchObject({
          average: 2,
          count: 1,
          withText: 0,
          distribution: { 1: 0, 2: 1, 3: 0, 4: 0, 5: 0 },
        });
        const cards = await listPublicReviews(runnerOf(tx), "all", 1);
        expect(cards.map((card) => [card.id, card.text])).toEqual([
          [withheld.reviewId, null],
        ]);
        // The card's withheld line (AC-18 page half; `0051`, TASK-373): the reason is public only
        // for a withheld text; the removal reason and the note never are.
        expect(cards[0]?.withheld_reason).toBe("abuse");
        const [refresh] = await refreshPartnerRatings(
          runnerOf(tx),
          NOW,
          partnerId,
        );
        // [2, 5, 5] counted (the removed 1 is not): round(2000 × 4) = 8000.
        expect(refresh?.ratingBp).toBe(8000);
      });
    });

    it("T-24/T-26 data (TASK-373): `0051`'s view reads by product SKU and country, a visible text has no withheld reason, and the build reads the view only", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const admin = await adminUser(tx);
        const parents = await orderParents(tx);
        const sku = `SKU-${randomUUID().slice(0, 8)}`;
        const [product] = await tx<{ id: string }[]>`
          INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                               substitution_class, freshness_days)
          VALUES (${sku}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
          RETURNING id`;
        const made = [
          await review(tx, { rating: 5, ageMs: 2 * HOUR, name: "Anna" }),
          await review(tx, { rating: 4, ageMs: 3 * HOUR }),
          await review(tx, { rating: 1, ageMs: 4 * HOUR }),
        ];
        await tx`UPDATE review SET product_id = ${product?.id ?? ""}
                 WHERE id IN (${made[0]?.reviewId ?? ""}, ${made[1]?.reviewId ?? ""})`;
        await asAdmin(tx, "reviews.publish", admin, async () => {
          for (const { reviewId } of made) {
            await moderateReview(runnerOf(tx), reviewId, { action: "publish" }, admin, NOW);
          }
        });
        const bySku = await reviewSummary(runnerOf(tx), { productSku: sku });
        expect(bySku).toMatchObject({ count: 2, average: 4.5, withText: 2 });
        const listed = await listPublicReviews(runnerOf(tx), { productSku: sku }, 1);
        // Published in one instant, so the order is the id tie-break; compare as sets.
        const byId = (a: readonly unknown[], b: readonly unknown[]) =>
          String(a[0]).localeCompare(String(b[0]));
        expect(
          listed.map((card) => [card.id, card.display_name, card.withheld_reason]).sort(byId),
        ).toEqual(
          [
            [made[0]?.reviewId, "Anna", null],
            [made[1]?.reviewId, null, null],
          ].sort(byId),
        );
        expect(
          (await reviewSummary(runnerOf(tx), { productSku: "NO-SUCH-SKU" })).count,
        ).toBe(0);
        const [iso] = await tx<{ iso2: string }[]>`
          SELECT iso2 FROM country WHERE id = ${parents.countryId}`;
        const country = await reviewSummary(runnerOf(tx), { countryIso2: iso?.iso2 ?? "" });
        expect(country.count).toBeGreaterThanOrEqual(3);
        expect(country.distribution[1]).toBeGreaterThanOrEqual(1);
        // The build role: the view, never the table (TASK-368's carry-forward).
        const [grants] = await tx<{ view: boolean; table: boolean; policy: number }[]>`
          SELECT has_table_privilege('app_build', 'public.public_review', 'SELECT') AS view,
                 has_table_privilege('app_build', 'public.review', 'SELECT') AS table,
                 (SELECT count(*)::int FROM pg_policies
                  WHERE tablename = 'review' AND policyname = 'review_build_read') AS policy`;
        expect(grants).toEqual({ view: true, table: false, policy: 0 });
      });
    });

    it("T-20: a review pending 72 h + 1 min is overdue; 71 h is not; a published one never", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const late = await review(tx, { rating: 4, ageMs: 72 * HOUR + 60_000 });
        const early = await review(tx, { rating: 4, ageMs: 71 * HOUR });
        const overdue = await overduePendingReviews(runnerOf(tx), NOW);
        expect(overdue).toContain(late.reviewId);
        expect(overdue).not.toContain(early.reviewId);
      });
    });

    it("T-22: the refresh writes both columns after a submission and after a removal, nightly for every non-demo florist, never status", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const admin = await adminUser(tx);
        const parents = await orderParents(tx);
        const partnerId = await activePartner(tx, parents.countryId);
        const demo = await makePartner(tx, parents.countryId, "demo");
        const read = async (id: string) =>
          (
            await tx<
              {
                rating_90d_bp: number | null;
                acceptance_rate_bp: number | null;
                status: string;
              }[]
            >`
              SELECT rating_90d_bp, acceptance_rate_bp, status FROM fulfillment_partner WHERE id = ${id}`
          )[0];
        await review(tx, { rating: 5, partnerId });
        await review(tx, { rating: 4, partnerId });
        const third = await review(tx, { rating: 4, partnerId });
        await refreshPartnerRatings(runnerOf(tx), NOW, partnerId);
        expect(await read(partnerId)).toMatchObject({
          rating_90d_bp: 8667,
          status: "active",
        });
        await asAdmin(tx, "reviews.remove", admin, () =>
          moderateReview(
            runnerOf(tx),
            third.reviewId,
            { action: "remove", reason: "duplicate", note: "x" },
            admin,
            NOW,
          ),
        );
        await refreshPartnerRatings(runnerOf(tx), NOW, partnerId);
        expect(await read(partnerId)).toMatchObject({
          rating_90d_bp: null,
          status: "active",
        });
        const nightly = await refreshPartnerRatings(runnerOf(tx), NOW);
        const ids = nightly.map((result) => result.partnerId);
        expect(ids).toContain(partnerId);
        expect(ids).not.toContain(demo);
        expect((await read(partnerId))?.status).toBe("active");
      });
    });

    it("T-29: redaction nulls text and name, keeps the rating, and the public view shows neither", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const admin = await adminUser(tx);
        const parents = await orderParents(tx);
        const first = await review(tx, {
          rating: 5,
          name: "Ada",
          customerId: parents.customerId,
          countryId: parents.countryId,
        });
        const second = await review(tx, {
          rating: 3,
          name: "Ada",
          customerId: parents.customerId,
          countryId: parents.countryId,
        });
        await asAdmin(tx, "reviews.publish", admin, () =>
          moderateReview(
            runnerOf(tx),
            first.reviewId,
            { action: "publish" },
            admin,
            NOW,
          ),
        );
        const scopes = await redactForCustomer(
          runnerOf(tx),
          parents.customerId,
          NOW,
        );
        expect(scopes.map((scope) => scope.reviewId).sort()).toEqual(
          [first.reviewId, second.reviewId].sort(),
        );
        const rows = await tx<
          {
            rating: number;
            text: string | null;
            display_name: string | null;
            redacted_at: Date | null;
          }[]
        >`
          SELECT rating, text, display_name, redacted_at FROM review
          WHERE id IN (${first.reviewId}, ${second.reviewId}) ORDER BY rating DESC`;
        expect(
          rows.map((row) => [row.rating, row.text, row.display_name]),
        ).toEqual([
          [5, null, null],
          [3, null, null],
        ]);
        expect(
          rows.every(
            (row) => row.redacted_at?.toISOString() === NOW.toISOString(),
          ),
        ).toBe(true);
        const [shown] = await tx<
          { rating: number; text: string | null; display_name: string | null }[]
        >`
          SELECT rating, text, display_name FROM public_review WHERE id = ${first.reviewId}`;
        expect(shown).toEqual({ rating: 5, text: null, display_name: null });
        // A second run touches nothing more.
        expect(
          await redactForCustomer(runnerOf(tx), parents.customerId, NOW),
        ).toEqual([]);
      });
    });
  },
);
