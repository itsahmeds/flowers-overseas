/**
 * Migration `0031_reviews_close` on a database (spec 022a §5.1, §10 T-19; AC-19; TASK-368).
 *
 * On a migrated PG16 scratch database (`support/scratch-db.ts`; never the shared database):
 *
 *  - T-19 (AC-19): under `app.role = 'public'`, `public_review` returns published reviews only,
 *    `text` `NULL` for a withheld one, exactly its eleven columns (none of `order_id`,
 *    `partner_id`, `moderation_note`, `moderated_by`), and a direct `SELECT` on `review` returns
 *    no row;
 *  - the §5.1 checks: an `internal` review without `verified_order`, `hidden` without a removal
 *    reason or with a withholding one, withheld text on an unpublished review, an unknown reason,
 *    2 001 characters;
 *  - `review_content_immutable`: `rating`, `text` (save erasure with `redacted_at`), `order_id`,
 *    `source`, `verified_order` and `created_at` refuse to change; moderation columns do not;
 *  - the audit trigger: an admin's moderation writes one `audit_log` row; an admin's erasure
 *    records the text as `[masked]`, never the words;
 *  - `review_invite`: staff only, one per order, a hex SHA-256 only; the two flags, off;
 *  - the rollback refuses (`REVIEWS_ROLLBACK_DATA_PRESENT`, nothing changed) with one invite
 *    present, rolls back on a clean database (the public read of `review` restored), and applies
 *    again.
 */
import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { insertPlacedOrder } from "../fixtures/order-state.ts";
import { orderParents } from "./support/rows.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  rolledBack,
  runner,
  scratchDatabase,
  type Sql,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

/** `public_review`'s columns, in order (spec 022a §5.1). */
const PUBLIC_REVIEW_COLUMNS = [
  "id",
  "rating",
  "text",
  "display_name",
  "locale_code",
  "published_at",
  "delivered_month",
  "destination_country_id",
  "product_id",
  "response_text",
  "response_at",
];

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/** A `live` order and its customer. */
async function liveOrder(
  tx: Tx,
): Promise<{ orderId: string; customerId: string }> {
  const parents = await orderParents(tx);
  const orderId = await insertPlacedOrder(tx, { ...parents, mode: "live" });
  return { orderId, customerId: parents.customerId };
}

/** One `internal`, verified review of a fresh live order, with the columns given. */
async function internalReview(
  tx: Tx,
  fields: Record<string, unknown> = {},
): Promise<string> {
  const { orderId } = await liveOrder(tx);
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO review ${tx({
      order_id: orderId,
      source: "internal",
      verified_order: true,
      rating: 4,
      text: "Lovely flowers, delivered on time.",
      locale_code: "en",
      ...fields,
    })} RETURNING id`;
  return row?.id ?? "";
}

async function objects(sql: Sql | Tx) {
  const [row] = await sql<
    {
      view: number;
      invite: number;
      read_policy: number;
      column: number;
      trigger: number;
      fn: number;
      flags: number;
      mask: string[];
    }[]
  >`
    SELECT (SELECT count(*)::int FROM pg_views WHERE viewname = 'public_review') AS view,
           (SELECT count(*)::int FROM pg_class WHERE relname = 'review_invite') AS invite,
           (SELECT count(*)::int FROM pg_policies WHERE policyname = 'review_read') AS read_policy,
           (SELECT count(*)::int FROM information_schema.columns
              WHERE table_name = 'review' AND column_name = 'text_visible') AS column,
           (SELECT count(*)::int FROM pg_trigger
              WHERE tgname IN ('review_content_immutable', 'review_audit')) AS trigger,
           (SELECT count(*)::int FROM pg_proc WHERE proname = 'review_content_immutable') AS fn,
           (SELECT count(*)::int FROM feature_flag
              WHERE key IN ('reviews.invite', 'reviews.trustpilot')) AS flags,
           public.audit_mask_columns('review') AS mask`;
  return row;
}

describe.skipIf(server.url === undefined)(
  `spec 022a — migration 0031_reviews_close${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "reviews");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("T-19 (AC-19): public reads published reviews through public_review only, withheld text null, no private column", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const published = await internalReview(tx, {
          moderation_status: "published",
          published_at: new Date(),
          display_name: "Ana",
          delivered_on: "2027-05-17",
          moderation_note: "checked",
        });
        const withheld = await internalReview(tx, {
          moderation_status: "published",
          published_at: new Date(),
          text: "Ask for Jan Kowalski at the shop.",
          text_visible: false,
          moderation_reason: "personal_data",
        });
        await internalReview(tx, { moderation_status: "pending" });
        await internalReview(tx, {
          moderation_status: "hidden",
          moderation_reason: "not_genuine",
          moderation_note: "test order by staff",
        });
        const owner = await tx<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM review`;
        const columns = await tx<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'public_review'
          ORDER BY ordinal_position`;
        await asApp(tx, { role: "public" });
        const view = await tx<
          {
            id: string;
            text: string | null;
            display_name: string | null;
            delivered_month: Date | null;
          }[]
        >`SELECT id, text, display_name, delivered_month FROM public_review ORDER BY rating, id`;
        const direct = await tx<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM review`;
        const viewInsert = await pgFailure(
          tx,
          (sp) =>
            sp`INSERT INTO public_review (id, rating) VALUES (gen_random_uuid(), 5)`,
        );
        return {
          owner: owner[0]?.n,
          columns: columns.map((row) => row.column_name),
          view: view.map((row) => ({
            id:
              row.id === published
                ? "published"
                : row.id === withheld
                  ? "withheld"
                  : row.id,
            text: row.text,
            display_name: row.display_name,
            delivered_month:
              row.delivered_month === null
                ? null
                : new Date(row.delivered_month).toISOString().slice(0, 10),
          })),
          direct: direct[0]?.n,
          viewInsert: viewInsert.code,
        };
      });
      expect(result.owner).toBe(4);
      expect(result.columns).toEqual(PUBLIC_REVIEW_COLUMNS);
      for (const forbidden of [
        "order_id",
        "partner_id",
        "moderation_note",
        "moderated_by",
        "moderation_reason",
        "text_visible",
        "source",
      ]) {
        expect(result.columns).not.toContain(forbidden);
      }
      expect(result.view).toEqual(
        expect.arrayContaining([
          {
            id: "published",
            text: "Lovely flowers, delivered on time.",
            display_name: "Ana",
            delivered_month: "2027-05-01",
          },
          {
            id: "withheld",
            text: null,
            display_name: null,
            delivered_month: null,
          },
        ]),
      );
      expect(result.view).toHaveLength(2);
      expect(result.direct).toBe(0);
      // 42501: app_web holds no INSERT on the view.
      expect(result.viewInsert).toBe("42501");
    });

    it("the §5.1 checks refuse an unverified internal review, a reasonless removal, a misplaced withholding, an unknown reason and 2 001 characters", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const { orderId } = await liveOrder(tx);
        const out: Record<string, string | undefined> = {};
        const insert = (sp: Tx, fields: Record<string, unknown>) =>
          sp`INSERT INTO review ${sp({
            order_id: orderId,
            source: "internal",
            verified_order: true,
            rating: 3,
            ...fields,
          })}`;
        out["internal, not verified"] = (
          await pgFailure(tx, (sp) => insert(sp, { verified_order: false }))
        ).constraint;
        out["internal, no order"] = (
          await pgFailure(tx, (sp) =>
            insert(sp, { order_id: null, verified_order: false }),
          )
        ).constraint;
        out["hidden without a reason"] = (
          await pgFailure(tx, (sp) =>
            insert(sp, { moderation_status: "hidden" }),
          )
        ).constraint;
        out["hidden for personal data"] = (
          await pgFailure(tx, (sp) =>
            insert(sp, {
              moderation_status: "hidden",
              moderation_reason: "personal_data",
            }),
          )
        ).constraint;
        out["published with a removal reason"] = (
          await pgFailure(tx, (sp) =>
            insert(sp, {
              moderation_status: "published",
              published_at: new Date(),
              moderation_reason: "duplicate",
            }),
          )
        ).constraint;
        out["withheld while pending"] = (
          await pgFailure(tx, (sp) =>
            insert(sp, {
              text_visible: false,
              moderation_reason: "abuse",
            }),
          )
        ).constraint;
        out["withheld without a reason"] = (
          await pgFailure(tx, (sp) =>
            insert(sp, {
              moderation_status: "published",
              published_at: new Date(),
              text_visible: false,
            }),
          )
        ).constraint;
        out["unknown reason"] = (
          await pgFailure(tx, (sp) =>
            insert(sp, { moderation_reason: "too_negative" }),
          )
        ).constraint;
        out["2001 characters"] = (
          await pgFailure(tx, (sp) => insert(sp, { text: "a".repeat(2001) }))
        ).constraint;
        // The accepted shapes, each on its own order (one review per order).
        const accepted = async (fields: Record<string, unknown>) => {
          await internalReview(tx, fields);
          return "inserted";
        };
        out["2000 characters"] = await accepted({ text: "ż".repeat(2000) });
        out["withheld, published, abuse"] = await accepted({
          moderation_status: "published",
          published_at: new Date(),
          text_visible: false,
          moderation_reason: "abuse",
        });
        out["trustpilot, no order"] = await (async () => {
          await tx`INSERT INTO review (source, rating) VALUES ('trustpilot', 5)`;
          return "inserted";
        })();
        return out;
      });
      expect(result).toEqual({
        "internal, not verified": "review_internal_verified_check",
        "internal, no order": "review_internal_verified_check",
        "hidden without a reason": "review_hidden_reason_check",
        "hidden for personal data": "review_hidden_reason_check",
        "published with a removal reason": "review_hidden_reason_check",
        "withheld while pending": "review_text_withheld_check",
        "withheld without a reason": "review_text_withheld_check",
        "unknown reason": "review_moderation_reason_check",
        "2001 characters": "review_text_length_check",
        "2000 characters": "inserted",
        "withheld, published, abuse": "inserted",
        "trustpilot, no order": "inserted",
      });
    });

    it("review_content_immutable: stars, words, order, source, verification and creation time never change; erasure and moderation do", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const id = await internalReview(tx, { display_name: "Ana" });
        const { orderId: other } = await liveOrder(tx);
        const out: Record<string, string | undefined> = {};
        const change = async (
          label: string,
          fn: (sp: Tx) => Promise<unknown>,
        ) => {
          out[label] = (await pgFailure(tx, fn)).raised;
        };
        await change(
          "rating",
          (sp) => sp`UPDATE review SET rating = 5 WHERE id = ${id}`,
        );
        await change(
          "text",
          (sp) => sp`UPDATE review SET text = 'Better now' WHERE id = ${id}`,
        );
        await change(
          "text to null without redacted_at",
          (sp) => sp`UPDATE review SET text = NULL WHERE id = ${id}`,
        );
        await change(
          "order_id",
          (sp) => sp`UPDATE review SET order_id = ${other} WHERE id = ${id}`,
        );
        await change(
          "source",
          (sp) => sp`UPDATE review SET source = 'trustpilot' WHERE id = ${id}`,
        );
        await change(
          "verified_order",
          (sp) =>
            sp`UPDATE review SET verified_order = false, source = 'trustpilot' WHERE id = ${id}`,
        );
        await change(
          "created_at",
          (sp) =>
            sp`UPDATE review SET created_at = created_at - interval '1 day' WHERE id = ${id}`,
        );
        await tx`UPDATE review
                 SET moderation_status = 'published', published_at = now(),
                     response_text = 'Thank you.', response_at = now()
                 WHERE id = ${id}`;
        await tx`UPDATE review SET text = NULL, display_name = NULL, redacted_at = now()
                 WHERE id = ${id}`;
        const [row] = await tx<
          {
            rating: number;
            text: string | null;
            display_name: string | null;
            redacted: boolean;
            status: string;
          }[]
        >`SELECT rating, text, display_name, redacted_at IS NOT NULL AS redacted,
                 moderation_status AS status
          FROM review WHERE id = ${id}`;
        return { out, row };
      });
      expect(result.out).toEqual({
        rating: "REVIEW_CONTENT_IMMUTABLE",
        text: "REVIEW_CONTENT_IMMUTABLE",
        "text to null without redacted_at": "REVIEW_CONTENT_IMMUTABLE",
        order_id: "REVIEW_CONTENT_IMMUTABLE",
        source: "REVIEW_CONTENT_IMMUTABLE",
        verified_order: "REVIEW_CONTENT_IMMUTABLE",
        created_at: "REVIEW_CONTENT_IMMUTABLE",
      });
      expect(result.row).toEqual({
        rating: 4,
        text: null,
        display_name: null,
        redacted: true,
        status: "published",
      });
    });

    it("the audit trigger: an admin's moderation writes one audit row; an admin's erasure records [masked], never the words", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const id = await internalReview(tx, { display_name: "Ana" });
        const [admin] = await tx<{ id: string }[]>`
          INSERT INTO users (email) VALUES ('moderator@example.test') RETURNING id`;
        const adminId = admin?.id ?? "";
        await tx`INSERT INTO admin_profile (user_id, display_name) VALUES (${adminId}, 'Moderator')`;
        const audit = () => tx<
          {
            action: string;
            before: Record<string, unknown> | null;
            after: Record<string, unknown> | null;
          }[]
        >`SELECT action, before, after FROM audit_log
          WHERE entity_table = 'review' AND entity_id = ${id} ORDER BY at, id`;
        const enter = async (action: string) => {
          await tx`SELECT set_config('app.audit_action', ${action}, true)`;
          await tx`SELECT set_config('app.audit_reason', '', true)`;
          await asApp(tx, { role: "admin", userId: adminId });
        };
        await tx.savepoint(async (sp) => {
          await enter("review.publish");
          await sp`UPDATE review SET moderation_status = 'published', published_at = now(),
                     moderated_by = ${adminId}, moderated_at = now()
                   WHERE id = ${id}`;
          await sp.unsafe("RESET ROLE");
        });
        const afterPublish = await audit();
        await tx.savepoint(async (sp) => {
          await enter("review.redact");
          await sp`UPDATE review SET text = NULL, display_name = NULL, redacted_at = now()
                   WHERE id = ${id}`;
          await sp.unsafe("RESET ROLE");
        });
        const all = await audit();
        return { afterPublish, redaction: all[1], count: all.length };
      });
      expect(result.afterPublish).toHaveLength(1);
      expect(result.afterPublish[0]?.action).toBe("review.publish");
      expect(result.afterPublish[0]?.after).toMatchObject({
        moderation_status: "published",
      });
      expect(result.count).toBe(2);
      expect(result.redaction?.action).toBe("review.redact");
      expect(result.redaction?.before).toMatchObject({
        text: "[masked]",
        display_name: "[masked]",
      });
      expect(result.redaction?.after).toMatchObject({
        text: null,
        display_name: null,
      });
      expect(JSON.stringify(result.redaction)).not.toContain("Lovely");
      expect(JSON.stringify(result.redaction)).not.toContain("Ana");
    });

    it("review_invite: staff only, one per order, a lower-case hex SHA-256 only; the two flags exist, off", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const { orderId, customerId } = await liveOrder(tx);
        const invite = (sp: Tx, fields: Record<string, unknown> = {}) =>
          sp`INSERT INTO review_invite ${sp({
            order_id: orderId,
            customer_id: customerId,
            token_hash: hash("token-1"),
            send_after: new Date("2027-05-18T09:00:00Z"),
            expires_at: new Date("2027-06-16T09:00:00Z"),
            ...fields,
          })}`;
        await invite(tx);
        const second = await pgFailure(tx, (sp) =>
          invite(sp, { token_hash: hash("token-2") }),
        );
        const { orderId: other } = await liveOrder(tx);
        const raw = await pgFailure(tx, (sp) =>
          invite(sp, { order_id: other, token_hash: "Token-in-the-clear" }),
        );
        const reason = await pgFailure(tx, (sp) =>
          invite(sp, {
            order_id: other,
            token_hash: hash("token-3"),
            skipped_reason: "low_rating",
          }),
        );
        const seen: Record<string, number | undefined> = {};
        for (const role of [
          "public",
          "customer",
          "partner",
          "system",
          "admin",
        ]) {
          seen[role] = await tx.savepoint(async (sp) => {
            await asApp(sp, { role });
            const [row] = await sp<{ n: number }[]>`
              SELECT count(*)::int AS n FROM review_invite`;
            await sp.unsafe("RESET ROLE");
            return row?.n;
          });
        }
        const flags = await tx<{ key: string; enabled_default: boolean }[]>`
          SELECT key, enabled_default FROM feature_flag
          WHERE key LIKE 'reviews.%' ORDER BY key`;
        const optOut = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM information_schema.columns
          WHERE table_name = 'customer' AND column_name = 'review_invite_opt_out_at'`;
        return {
          second: second.constraint,
          raw: raw.constraint,
          reason: reason.constraint,
          seen,
          flags,
          optOut: optOut[0]?.n,
        };
      });
      expect(result.second).toBe("review_invite_order_id_key");
      expect(result.raw).toBe("review_invite_token_hash_check");
      expect(result.reason).toBe("review_invite_skipped_reason_check");
      expect(result.seen).toEqual({
        public: 0,
        customer: 0,
        partner: 0,
        system: 1,
        admin: 1,
      });
      expect(result.flags).toEqual([
        { key: "reviews.invite", enabled_default: false },
        { key: "reviews.trustpilot", enabled_default: false },
      ]);
      expect(result.optOut).toBe(1);
    });

    it("rollback: refuses with an invite present and changes nothing; rolls back on a clean database; applies again", async () => {
      const applied = await objects(scratch.sql);
      expect(applied).toEqual({
        view: 1,
        invite: 1,
        read_policy: 0,
        column: 1,
        trigger: 2,
        fn: 1,
        flags: 2,
        mask: ["text", "display_name"],
      });

      const { orderId } = await scratch.sql.begin(async (tx) => {
        const order = await liveOrder(tx);
        await tx`INSERT INTO review_invite ${tx({
          order_id: order.orderId,
          customer_id: order.customerId,
          token_hash: hash("rollback-token"),
          send_after: new Date("2027-05-18T09:00:00Z"),
          expires_at: new Date("2027-06-16T09:00:00Z"),
        })}`;
        return order;
      });
      const refused = await runner(scratch.url, [
        "--down",
        "--to",
        "0030",
      ]).then(
        () => "rolled back",
        (error: unknown) =>
          /REVIEWS_ROLLBACK_DATA_PRESENT/.test(
            String((error as { stderr?: string }).stderr ?? error),
          )
            ? "REVIEWS_ROLLBACK_DATA_PRESENT"
            : String(error),
      );
      expect(refused).toBe("REVIEWS_ROLLBACK_DATA_PRESENT");
      expect(await objects(scratch.sql)).toEqual(applied);

      await scratch.sql`DELETE FROM review_invite WHERE order_id = ${orderId}`;
      await runner(scratch.url, ["--down", "--to", "0030"]);
      expect(await objects(scratch.sql)).toEqual({
        view: 0,
        invite: 0,
        read_policy: 1,
        column: 0,
        trigger: 0,
        fn: 0,
        flags: 0,
        mask: [],
      });

      await runner(scratch.url);
      expect(await objects(scratch.sql)).toEqual(applied);
    }, 300_000);
  },
);
