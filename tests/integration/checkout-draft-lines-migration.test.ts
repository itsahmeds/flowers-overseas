/**
 * Migration `0020_checkout_draft_lines` up, down and up on PG16, with drafts in it (spec 010 §14
 * A-founder-2026-10-22 item 2 B and C; T-66 draft half; AC-66; TASK-348).
 *
 *  1. Rolled back to `0019`, the scratch database gets `0015`-shaped drafts. A placed one (an
 *     `order_id`) makes the up migration refuse with `DRAFT_LINES_PLACED_DRAFT` and change
 *     nothing; without it, every draft becomes line 1 of itself, its basket currency read from
 *     its quote, its 30-day expiry set, and the two retention rows are in place.
 *  2. Baskets of three lines, of one line, placed, and empty are made; the down file keeps the
 *     one-line unplaced basket as a `0015` draft (its line's values back on the row) and deletes
 *     the rest, and the runner prints the counts.
 *  3. Up again closes the round trip.
 *
 * Its own scratch database, because it rolls migrations back.
 */
import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { insertPlacedOrder } from "../fixtures/order-state.ts";
import { country, customer, recipient, unique } from "./support/rows.ts";
import {
  probeLocalServer,
  runner,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

/** Three runner invocations and committed data: well past Vitest's 5 s default on a loaded runner. */
const MIGRATION_ROUND_TRIP_MS = 120_000;

const QUOTE = {
  currency: "PLN",
  totalMinor: 18_900,
  digest: "d".repeat(64),
};

async function lineTable(sql: Sql): Promise<boolean> {
  const [row] = await sql<{ present: boolean }[]>`
    SELECT to_regclass('public.checkout_draft_line') IS NOT NULL AS present`;
  return row?.present ?? false;
}

async function retention(
  sql: Sql,
): Promise<Record<string, { days: number; action: string }>> {
  const rows = await sql<{ key: string; days: number; action: string }[]>`
    SELECT key, retention_days AS days, action FROM retention_policy
    WHERE key LIKE 'checkout_draft%' ORDER BY key`;
  return Object.fromEntries(
    rows.map((row) => [row.key, { days: row.days, action: row.action }]),
  );
}

/** A `0015` draft: the selection on the row. */
async function legacyDraft(
  tx: Tx,
  options: {
    steps: number;
    quote: boolean;
    productId: string;
    countryId: string;
  },
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO checkout_draft (token_sha256, locale_code, destination_country_id, product_id,
                                tier_key, delivery_date, addon_keys, recipient, buyer, card, quote,
                                confirmed_total_minor, confirmed_currency_code, mode,
                                steps_completed, last_activity_at, expires_at)
    VALUES (${randomBytes(32).toString("hex")}, 'pl',
            ${options.countryId}, ${options.productId}, 'stems_15', DATE '2027-02-14',
            ARRAY['chocolates']::text[], '{"fullName": "Test Recipient"}'::jsonb,
            '{"email": "buyer@example.test"}'::jsonb, '{"cardMessage": "Hi", "signAs": "A"}'::jsonb,
            (${options.quote ? JSON.stringify(QUOTE) : null}::text)::jsonb,
            18900, 'PLN', 'demo', ${options.steps},
            TIMESTAMPTZ '2026-10-24 08:00:00+00', TIMESTAMPTZ '2026-10-25 08:00:00+00')
    RETURNING id`;
  return row?.id ?? "";
}

describe.skipIf(server.url === undefined)(
  `0020_checkout_draft_lines up, down, up with drafts${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "draft_lines_mig");
    }, 600_000);
    afterAll(async () => {
      await scratch.drop();
    });

    it(
      "refuses a placed draft, copies every draft into line 1, and the down file keeps one-line drafts only, printing the counts",
      async () => {
        await runner(scratch.url, ["--down", "--to", "0019"]);
        expect(await lineTable(scratch.sql)).toBe(false);
        expect(await retention(scratch.sql)).toEqual({
          checkout_draft: { days: 1, action: "delete" },
        });

        const ids = await scratch.sql.begin(async (tx) => {
          const countryId = await country(tx, "PL");
          const [product] = await tx<{ id: string }[]>`
          INSERT INTO product (sku, product_type, primary_flower, colour_primary, style,
                               price_tier, substitution_class, freshness_days)
          VALUES (${unique("SKU-")}, 'bouquet', 'roses', 'red', 'classic', 'classic',
                  'main_flower', 5)
          RETURNING id`;
          const productId = product?.id ?? "";
          const buyer = await customer(tx);
          const orderId = await insertPlacedOrder(tx, {
            customerId: buyer,
            recipientId: await recipient(tx, buyer),
            countryId,
          });
          const saved = await legacyDraft(tx, {
            steps: 2,
            quote: true,
            productId,
            countryId,
          });
          const fresh = await legacyDraft(tx, {
            steps: 0,
            quote: false,
            productId,
            countryId,
          });
          const placed = await legacyDraft(tx, {
            steps: 3,
            quote: true,
            productId,
            countryId,
          });
          await tx`UPDATE checkout_draft SET order_id = ${orderId} WHERE id = ${placed}`;
          return { saved, fresh, placed, orderId, productId, countryId, buyer };
        });

        // A placed draft: the up migration refuses and changes nothing.
        const refused = await runner(scratch.url).then(
          () => "applied",
          (error: unknown) => String(error),
        );
        expect(refused).toContain("DRAFT_LINES_PLACED_DRAFT");
        expect(await lineTable(scratch.sql)).toBe(false);

        await scratch.sql`DELETE FROM checkout_draft WHERE id = ${ids.placed}`;
        await runner(scratch.url);
        expect(await lineTable(scratch.sql)).toBe(true);
        expect(await retention(scratch.sql)).toEqual({
          checkout_draft: { days: 30, action: "delete" },
          checkout_draft_personal: { days: 1, action: "pseudonymise" },
        });
        const migrated = await scratch.sql<
          {
            id: string;
            currency_code: string | null;
            buyer_saved: boolean;
            lifetime: string;
            lines: number;
            position: number;
            tier_key: string;
            addon_keys: string[];
            recipient: string | null;
            card: string | null;
            last_seen: string | null;
            steps: number;
          }[]
        >`
        SELECT d.id, d.currency_code, d.buyer_saved,
               (d.expires_at - d.last_activity_at)::text AS lifetime,
               (SELECT count(*)::int FROM checkout_draft_line c WHERE c.draft_id = d.id) AS lines,
               l.position, l.tier_key, l.addon_keys, l.recipient ->> 'fullName' AS recipient,
               l.card ->> 'cardMessage' AS card, l.last_seen_total_minor::text AS last_seen,
               l.steps_completed AS steps
        FROM checkout_draft d JOIN checkout_draft_line l ON l.draft_id = d.id
        ORDER BY d.buyer_saved DESC`;
        expect(migrated).toEqual([
          {
            id: ids.saved,
            currency_code: "PLN",
            buyer_saved: true,
            lifetime: "30 days",
            lines: 1,
            position: 1,
            tier_key: "stems_15",
            addon_keys: ["chocolates"],
            recipient: "Test Recipient",
            card: "Hi",
            last_seen: "18900",
            steps: 2,
          },
          {
            id: ids.fresh,
            currency_code: null,
            buyer_saved: false,
            lifetime: "30 days",
            lines: 1,
            position: 1,
            tier_key: "stems_15",
            addon_keys: ["chocolates"],
            recipient: "Test Recipient",
            card: "Hi",
            last_seen: "18900",
            steps: 0,
          },
        ]);

        // Baskets for the down file: three lines (saved), one line (fresh), placed, empty.
        await scratch.sql.begin(async (tx) => {
          for (const position of [2, 3]) {
            await tx`
            INSERT INTO checkout_draft_line (draft_id, position, destination_country_id,
                                             product_id, tier_key)
            VALUES (${ids.saved}, ${position}, ${ids.countryId}, ${ids.productId}, 'stems_15')`;
          }
          const [purchase] = await tx<{ purchase_id: string }[]>`
          SELECT purchase_id FROM "order" WHERE id = ${ids.orderId}`;
          const [placed] = await tx<{ id: string }[]>`
          INSERT INTO checkout_draft (token_sha256, locale_code, mode, purchase_id, expires_at)
          VALUES (${"b".repeat(64)}, 'pl', 'demo', ${purchase?.purchase_id ?? ""},
                  now() + interval '30 days')
          RETURNING id`;
          await tx`
          INSERT INTO checkout_draft_line (draft_id, position, destination_country_id,
                                           product_id, tier_key, order_id)
          VALUES (${placed?.id ?? ""}, 1, ${ids.countryId}, ${ids.productId}, 'stems_15',
                  ${ids.orderId})`;
          await tx`
          INSERT INTO checkout_draft (token_sha256, locale_code, mode, expires_at)
          VALUES (${"c".repeat(64)}, 'pl', 'demo', now() + interval '30 days')`;
        });

        const printed = await runner(scratch.url, ["--down", "--to", "0019"]);
        expect(printed).toContain(
          "DRAFT_LINES_DOWN: kept 1 one-line drafts, deleted 3 drafts (multi-line, empty or placed)",
        );
        expect(await lineTable(scratch.sql)).toBe(false);
        expect(await retention(scratch.sql)).toEqual({
          checkout_draft: { days: 1, action: "delete" },
        });
        const kept = await scratch.sql<
          {
            id: string;
            tier_key: string;
            addon_keys: string[];
            recipient: string | null;
            steps: number;
            confirmed: string | null;
            lifetime: string;
          }[]
        >`
        SELECT id, tier_key, addon_keys, recipient ->> 'fullName' AS recipient,
               steps_completed AS steps, confirmed_total_minor::text AS confirmed,
               (expires_at - last_activity_at)::text AS lifetime
        FROM checkout_draft`;
        expect(kept).toEqual([
          {
            id: ids.fresh,
            tier_key: "stems_15",
            addon_keys: ["chocolates"],
            recipient: "Test Recipient",
            steps: 0,
            confirmed: "18900",
            lifetime: "1 day",
          },
        ]);

        await runner(scratch.url);
        expect(await lineTable(scratch.sql)).toBe(true);
        const [again] = await scratch.sql<{ drafts: number; lines: number }[]>`
        SELECT (SELECT count(*)::int FROM checkout_draft) AS drafts,
               (SELECT count(*)::int FROM checkout_draft_line) AS lines`;
        expect(again).toEqual({ drafts: 1, lines: 1 });
      },
      MIGRATION_ROUND_TRIP_MS,
    );
  },
);
