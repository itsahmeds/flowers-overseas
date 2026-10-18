/**
 * T-20 — `retention.sweep` on an injected clock (spec 002 AC-20, §8 "Retention"; TASK-025).
 *
 * Every case builds its rows as the server's superuser inside a transaction that is rolled back,
 * enters the runtime role as `system` exactly as `withSystemContext` does, runs the real sweep
 * (`src/jobs/retention.ts`) through Drizzle on that transaction, then steps back out to read what
 * changed. The clock is the only thing faked: events carry the database's real `now()`, and the
 * sweep is told it is 91 (or 89) days later. Local, disposable server only
 * (`support/scratch-db.ts`).
 */
import { randomUUID } from "node:crypto";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  initialsOf,
  redactedEmail,
  runRetentionSweep,
  type PolicyOutcome,
  type RetentionDb,
  type RetentionSweepResult,
} from "../../src/jobs/retention.ts";
import { InMemoryStorage } from "../../src/lib/storage.ts";
import {
  FIXTURE_ACTOR,
  applyTransition,
  insertPlacedOrder,
  shortestPath,
  walkOrderTo,
} from "../fixtures/order-state.ts";
import * as make from "./support/rows.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();
const DAY_MS = 86_400_000;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

const dialect = new PgDialect();

/**
 * Drizzle's driver cannot wrap a postgres.js *transaction* (`drizzle(tx)` reads `tx.options`,
 * which a transaction object lacks), so the statement is rendered with Drizzle's Postgres dialect
 * and run with `tx.unsafe(text, params)`, the call Drizzle's postgres-js session makes.
 */
function runnerOf(tx: Tx): RetentionDb {
  return {
    async execute(query: SQL) {
      const { sql, params } = dialect.sqlToQuery(query);
      return tx.unsafe(sql, params as never[]);
    },
  };
}

/** Runs the sweep as `system` inside `tx`, then returns to the superuser to let the test read. */
async function sweep(
  tx: Tx,
  options: { now: Date; dryRun?: boolean; storage?: InMemoryStorage },
): Promise<RetentionSweepResult> {
  await asApp(tx, { role: "system" });
  const result = await runRetentionSweep(runnerOf(tx), {
    now: options.now,
    dryRun: options.dryRun ?? false,
    ...(options.storage === undefined ? {} : { storage: options.storage }),
  });
  await tx.unsafe("RESET ROLE");
  return result;
}

function policy(result: RetentionSweepResult, key: string): PolicyOutcome {
  const found = result.policies.find((outcome) => outcome.key === key);
  if (found === undefined) throw new Error(`no outcome for ${key}`);
  return found;
}

/** The snapshot a checkout would write: a name, a phone, a street, a postcode, a note, a city. */
const RECIPIENT_SNAPSHOT = {
  name: "Anna Maria Nowak",
  phone_e164: "+48500000000",
  lines: ["ul. Testowa 1", "m. 2"],
  postal_code: "00-001",
  delivery_note: "ring twice",
  city: "Warszawa",
  country_iso2: "PL",
};

interface Delivered {
  readonly orderId: string;
  readonly recipientId: string;
  readonly customerId: string;
  readonly addressId: string;
  readonly paymentId: string;
}

/**
 * Walks the order to `delivered` along legal rows, writing the last event at a whole
 * millisecond (`order_event` is append-only, so its time is chosen at insert, the way
 * `applyTransition` writes it, never edited).
 */
async function deliverAtWholeMillisecond(
  tx: Tx,
  orderId: string,
): Promise<void> {
  const edges = await tx<{ from: string; event: string; to: string }[]>`
    SELECT from_status AS "from", event, to_status AS "to" FROM order_transition`;
  const path = shortestPath(edges, "placed", "delivered") ?? [];
  const last = path[path.length - 1];
  if (last === undefined) throw new Error("no path to delivered");
  for (const step of path.slice(0, -1)) {
    await applyTransition(tx, orderId, step.event, step.to);
  }
  const [current] = await tx<{ seq: number }[]>`
    SELECT max(seq) AS seq FROM order_event WHERE order_id = ${orderId}`;
  await tx`SELECT set_config('app.allow_status_write', 'on', true)`;
  await tx`SELECT set_config('app.transition_event', ${last.event}, true)`;
  await tx`UPDATE "order" SET status = 'delivered' WHERE id = ${orderId}`;
  await tx`SELECT set_config('app.allow_status_write', '', true)`;
  await tx`SELECT set_config('app.transition_event', '', true)`;
  await tx`
    INSERT INTO order_event (order_id, seq, type, from_status, to_status, actor, payload,
                             payload_version, occurred_at)
    VALUES (${orderId}, ${(current?.seq ?? 0) + 1}, ${last.event}, ${last.from}, 'delivered',
            ${FIXTURE_ACTOR}, '{}'::jsonb, 1, date_trunc('milliseconds', now()))`;
}

/** A live order, paid, delivered today, with its recipient's address, one line and a payment. */
async function deliveredOrder(
  tx: Tx,
  options: {
    status?: string;
    linkCustomer?: boolean;
    isSelf?: boolean;
    /** Deliver at a whole millisecond, so a JS clock can stand exactly on the boundary. */
    exactDelivery?: boolean;
  } = {},
): Promise<Delivered> {
  const parents = await make.orderParents(tx);
  const orderId = await insertPlacedOrder(tx, { ...parents, mode: "live" });
  await tx`UPDATE "order" SET recipient_snapshot = ${tx.json(RECIPIENT_SNAPSHOT)}
           WHERE id = ${orderId}`;
  await tx`UPDATE recipient SET full_name = 'Anna Maria Nowak' WHERE id = ${parents.recipientId}`;
  const [address] = await tx<{ id: string }[]>`
    INSERT INTO recipient_address (recipient_id, lines, postal_code, city, country_id, delivery_note)
    VALUES (${parents.recipientId}, ARRAY['ul. Testowa 1', 'm. 2'], '00-001', 'Warszawa',
            ${parents.countryId}, 'ring twice')
    RETURNING id`;
  await tx`
    INSERT INTO order_line (order_id, kind, qty, unit_retail_minor, currency_code, vat_rate_bp)
    VALUES (${orderId}, 'surcharge', 1, 18900, 'PLN', 800)`;
  const [payment] = await tx<{ id: string }[]>`
    INSERT INTO payment (order_id, provider, provider_ref, status, method, amount_minor,
                         currency_code, captured_at)
    VALUES (${orderId}, 'stripe', ${make.unique("pi_")}, 'captured', 'card', 18900, 'PLN', now())
    RETURNING id`;
  if (options.exactDelivery === true) {
    await deliverAtWholeMillisecond(tx, orderId);
  } else {
    await walkOrderTo(tx, orderId, "delivered");
  }
  if (options.isSelf === true) {
    await tx`UPDATE recipient SET is_self = true WHERE id = ${parents.recipientId}`;
  }
  if (options.status !== undefined && options.status !== "delivered") {
    await walkOrderTo(tx, orderId, options.status);
  }
  if (options.linkCustomer === true) {
    const linked = await make.customer(tx);
    await tx`UPDATE recipient SET linked_customer_id = ${linked} WHERE id = ${parents.recipientId}`;
  }
  return {
    orderId,
    recipientId: parents.recipientId,
    customerId: parents.customerId,
    addressId: address?.id ?? "",
    paymentId: payment?.id ?? "",
  };
}

/** Every column of the rows a sweep must never change, as JSON text. */
async function untouchable(tx: Tx, order: Delivered): Promise<string> {
  const [row] = await tx<{ state: string }[]>`
    SELECT json_build_object(
      'order', (SELECT to_jsonb(o) - 'recipient_snapshot' - 'updated_at'
                FROM "order" o WHERE o.id = ${order.orderId}),
      'lines', (SELECT json_agg(to_jsonb(l) ORDER BY l.id) FROM order_line l
                WHERE l.order_id = ${order.orderId}),
      'events', (SELECT json_agg(to_jsonb(e) ORDER BY e.seq) FROM order_event e
                 WHERE e.order_id = ${order.orderId}),
      'payment', (SELECT to_jsonb(p) FROM payment p WHERE p.id = ${order.paymentId})
    )::text AS state`;
  return row?.state ?? "";
}

/** Every row of every table the sweep may write, as JSON text (the dry-run oracle). */
async function everything(tx: Tx): Promise<string> {
  const [row] = await tx<{ state: string }[]>`
    SELECT json_build_object(
      'order', (SELECT json_agg(to_jsonb(t) ORDER BY t.id) FROM "order" t),
      'recipient', (SELECT json_agg(to_jsonb(t) ORDER BY t.id) FROM recipient t),
      'recipient_address', (SELECT json_agg(to_jsonb(t) ORDER BY t.id) FROM recipient_address t),
      'customer', (SELECT json_agg(to_jsonb(t) ORDER BY t.id) FROM customer t),
      'address', (SELECT json_agg(to_jsonb(t) ORDER BY t.id) FROM address t),
      'delivery_proof', (SELECT json_agg(to_jsonb(t) ORDER BY t.id) FROM delivery_proof t),
      'media_asset', (SELECT json_agg(to_jsonb(t) ORDER BY t.id) FROM media_asset t),
      'media_variant', (SELECT json_agg(to_jsonb(t) ORDER BY t.object_key) FROM media_variant t),
      'webhook_inbox', (SELECT json_agg(to_jsonb(t) ORDER BY t.id) FROM webhook_inbox t),
      'consent_log', (SELECT json_agg(to_jsonb(t) ORDER BY t.id) FROM consent_log t)
    )::text AS state`;
  return row?.state ?? "";
}

async function recipientState(tx: Tx, order: Delivered) {
  const [row] = await tx<
    {
      snapshot: Record<string, unknown>;
      full_name: string;
      phone_e164: string | null;
      contact_redacted: boolean;
      lines: string[];
      postal_code: string | null;
      delivery_note: string | null;
      city: string;
    }[]
  >`
    SELECT o.recipient_snapshot AS snapshot, r.full_name, r.phone_e164, r.contact_redacted,
           a.lines, a.postal_code, a.delivery_note, a.city
    FROM "order" o
    JOIN recipient r ON r.id = o.recipient_id
    JOIN recipient_address a ON a.id = ${order.addressId}
    WHERE o.id = ${order.orderId}`;
  if (row === undefined) throw new Error("no row");
  return row;
}

/** A private, EXIF-stripped delivery photo with one variant, stored in `storage`. */
async function deliveryPhoto(
  tx: Tx,
  storage: InMemoryStorage,
  orderId: string,
  uploadedDaysAgo: number,
): Promise<{ assetId: string; original: string; variant: string }> {
  const assetId = await make.mediaAsset(tx);
  const [asset] = await tx<{ bucket: string; object_key: string }[]>`
    SELECT bucket, object_key FROM media_asset WHERE id = ${assetId}`;
  const bucket = asset?.bucket ?? "";
  const original = asset?.object_key ?? "";
  const variant = `delivery-proof/${assetId}/w640.webp`;
  await tx`
    INSERT INTO media_variant (media_asset_id, variant, object_key, format, width, height, bytes,
                               checksum_sha256)
    VALUES (${assetId}, 'w640', ${variant}, 'webp', 640, 800, 2048, ${"b".repeat(64)})`;
  await tx`
    INSERT INTO delivery_proof (order_id, media_asset_id, uploaded_by, uploaded_at)
    VALUES (${orderId}, ${assetId}, 'partner',
            now() - make_interval(days => ${uploadedDaysAgo}))`;
  const body = new Uint8Array([1, 2, 3]);
  await storage.put({ bucket, objectKey: original, body, mime: "image/jpeg" });
  await storage.put({ bucket, objectKey: variant, body, mime: "image/webp" });
  return { assetId, original, variant };
}

describe.skipIf(server.url === undefined)(
  `T-20 — retention.sweep on an injected clock${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "retention");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("AC-20: 91 days past delivery pseudonymises the recipient contact and the snapshot, city kept, order, lines, events and payment intact", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const order = await deliveredOrder(tx);
        const before = await untouchable(tx, order);
        const clock = daysFromNow(91);

        const result = await sweep(tx, { now: clock });

        expect(policy(result, "recipient_contact")).toEqual({
          key: "recipient_contact",
          status: "applied",
          counts: { order_snapshots: 1, recipients: 1, recipient_addresses: 1 },
          skipped: { dispute_open: 0, recipient_is_customer: 0 },
        });
        const after = await recipientState(tx, order);
        expect(after.snapshot).toEqual({
          name: "A. M. N.",
          city: "Warszawa",
          country_iso2: "PL",
          redacted: true,
          redacted_at: clock.toISOString(),
        });
        expect(after.full_name).toBe("A. M. N.");
        expect(after.phone_e164).toBeNull();
        expect(after.contact_redacted).toBe(true);
        expect(after.lines).toEqual([]);
        expect(after.postal_code).toBeNull();
        expect(after.delivery_note).toBeNull();
        expect(after.city).toBe("Warszawa");
        expect(await untouchable(tx, order)).toBe(before);
      });
    });

    it("AC-20: 89 days past delivery changes nothing", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const order = await deliveredOrder(tx);
        const before = await recipientState(tx, order);
        const result = await sweep(tx, { now: daysFromNow(89) });
        expect(policy(result, "recipient_contact").counts).toEqual({
          order_snapshots: 0,
          recipients: 0,
          recipient_addresses: 0,
        });
        expect(await recipientState(tx, order)).toEqual(before);
      });
    });

    it("AC-20: a dispute-open order is skipped, and keeps its recipient's contact", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const disputed = await deliveredOrder(tx, { status: "disputed" });
        const settled = await deliveredOrder(tx);
        const before = await recipientState(tx, disputed);

        const result = await sweep(tx, { now: daysFromNow(91) });

        const outcome = policy(result, "recipient_contact");
        expect(outcome.skipped).toEqual({
          dispute_open: 1,
          recipient_is_customer: 0,
        });
        expect(outcome.counts["order_snapshots"]).toBe(1);
        expect(await recipientState(tx, disputed)).toEqual(before);
        expect((await recipientState(tx, settled)).contact_redacted).toBe(true);
      });
    });

    it("AC-20: a recipient with a second, undelivered order keeps the contact; the delivered order's snapshot is still pseudonymised", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const order = await deliveredOrder(tx);
        const second = await insertPlacedOrder(tx, {
          customerId: order.customerId,
          recipientId: order.recipientId,
          countryId: (
            await tx<
              { id: string }[]
            >`SELECT destination_country_id AS id FROM "order"
                                       WHERE id = ${order.orderId}`
          )[0]?.id as string,
          mode: "live",
        });
        const result = await sweep(tx, { now: daysFromNow(91) });
        expect(policy(result, "recipient_contact").counts).toEqual({
          order_snapshots: 1,
          recipients: 0,
          recipient_addresses: 0,
        });
        const after = await recipientState(tx, order);
        expect(after.snapshot["redacted"]).toBe(true);
        expect(after.phone_e164).toBe("+48500000000");
        expect(after.contact_redacted).toBe(false);
        const [placed] = await tx<{ snapshot: Record<string, unknown> }[]>`
          SELECT recipient_snapshot AS snapshot FROM "order" WHERE id = ${second}`;
        expect(placed?.snapshot).toEqual({ city: "Warszawa" });
      });
    });

    it("AC-20: a recipient who became a customer is skipped", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const order = await deliveredOrder(tx, { linkCustomer: true });
        const before = await recipientState(tx, order);
        const result = await sweep(tx, { now: daysFromNow(91) });
        expect(policy(result, "recipient_contact").skipped).toEqual({
          dispute_open: 0,
          recipient_is_customer: 1,
        });
        expect(await recipientState(tx, order)).toEqual(before);
      });
    });

    it("AC-20: --dry-run writes nothing — no row, no object — and reports the counts of the real run", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const storage = new InMemoryStorage();
        const order = await deliveredOrder(tx);
        await deliveredOrder(tx, { status: "disputed" });
        const photo = await deliveryPhoto(tx, storage, order.orderId, 0);
        await tx`INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, received_at)
                 VALUES ('stripe', ${make.unique("evt_")}, true, '{}'::jsonb, now())`;
        // A consent record withdrawn long enough before the clock to be due (hole 5).
        const subject = randomUUID();
        for (const daysAgo of [2000, 1000]) {
          await tx`INSERT INTO consent_log (subject_kind, anonymous_id, choices, policy_version, occurred_at)
                   VALUES ('visitor', ${subject}, '{"analytics": true}'::jsonb, 1,
                           now() - make_interval(days => ${daysAgo}))`;
        }
        const clock = daysFromNow(1100);
        const before = await everything(tx);

        const dry = await sweep(tx, { now: clock, dryRun: true, storage });
        expect(policy(dry, "consent_records").counts).toEqual({
          consent_log: 1,
        });

        expect(await everything(tx)).toBe(before);
        const [bucket] = await tx<{ bucket: string }[]>`
          SELECT bucket FROM media_asset WHERE id = ${photo.assetId}`;
        expect(
          await storage.head({
            bucket: bucket?.bucket ?? "",
            objectKey: photo.original,
          }),
        ).not.toBeNull();
        expect(dry.dryRun).toBe(true);
        expect(
          dry.policies.every((outcome) => outcome.status !== "applied"),
        ).toBe(true);

        const real = await sweep(tx, { now: clock, storage });
        const strip = (result: RetentionSweepResult) =>
          result.policies.map(({ key, counts, skipped }) => ({
            key,
            counts,
            skipped,
          }));
        expect(strip(dry)).toEqual(strip(real));
        expect(
          real.policies.some((outcome) =>
            Object.values(outcome.counts).some((count) => count > 0),
          ),
        ).toBe(true);
        expect(await everything(tx)).not.toBe(before);
      });
    });

    it("is idempotent: a second run on the same clock finds nothing left to do", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        await deliveredOrder(tx);
        const clock = daysFromNow(1100);
        await sweep(tx, { now: clock });
        const after = await everything(tx);
        const again = await sweep(tx, { now: clock });
        for (const outcome of again.policies) {
          expect(Object.values(outcome.counts).every((n) => n === 0)).toBe(
            true,
          );
        }
        expect(await everything(tx)).toBe(after);
      });
    });

    it("AC-20: exactly 90 days after delivery is due; one millisecond earlier is not (hole 3)", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const order = await deliveredOrder(tx, { exactDelivery: true });
        const [event] = await tx<{ ms: string }[]>`
          SELECT (extract(epoch FROM occurred_at) * 1000)::bigint::text AS ms
          FROM order_event WHERE order_id = ${order.orderId} AND to_status = 'delivered'`;
        const boundary = new Date(Number(event?.ms) + 90 * DAY_MS);

        const early = await sweep(tx, {
          now: new Date(boundary.getTime() - 1),
          dryRun: true,
        });
        expect(
          policy(early, "recipient_contact").counts["order_snapshots"],
        ).toBe(0);
        const due = await sweep(tx, { now: boundary, dryRun: true });
        expect(policy(due, "recipient_contact").counts["order_snapshots"]).toBe(
          1,
        );
      });
    });

    it("AC-20: an order with a chargeback open is skipped like a dispute (hole 4)", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const order = await deliveredOrder(tx, { status: "chargeback_open" });
        const before = await recipientState(tx, order);
        const result = await sweep(tx, { now: daysFromNow(91) });
        expect(
          policy(result, "recipient_contact").skipped["dispute_open"],
        ).toBe(1);
        expect(await recipientState(tx, order)).toEqual(before);
      });
    });

    it("AC-20: a recipient who is the buyer (is_self) is skipped, row and snapshot (hole 4)", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const order = await deliveredOrder(tx, { isSelf: true });
        const before = await recipientState(tx, order);
        const result = await sweep(tx, { now: daysFromNow(91) });
        expect(policy(result, "recipient_contact")).toMatchObject({
          counts: { order_snapshots: 0, recipients: 0, recipient_addresses: 0 },
          skipped: { recipient_is_customer: 1 },
        });
        expect(await recipientState(tx, order)).toEqual(before);
      });
    });

    it("keeps a buyer whose account is over 3 years old but who ordered last week (hole 2)", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const recent = await deliveredOrder(tx);
        await tx`UPDATE customer SET created_at = now() - interval '4 years'
                 WHERE id = ${recent.customerId}`;
        await tx`UPDATE "order" SET created_at = now() - interval '7 days'
                 WHERE id = ${recent.orderId}`;
        const idle = await make.customer(tx);
        await tx`UPDATE customer SET created_at = now() - interval '4 years' WHERE id = ${idle}`;

        const result = await sweep(tx, { now: new Date() });

        expect(policy(result, "buyer_personal").counts["customers"]).toBe(1);
        const rows = await tx<{ id: string; redacted: boolean }[]>`
          SELECT id, redacted FROM customer WHERE id IN (${recent.customerId}, ${idle})`;
        const redacted = Object.fromEntries(
          rows.map((row) => [row.id, row.redacted]),
        );
        expect(redacted).toEqual({ [recent.customerId]: false, [idle]: true });
      });
    });

    it("is period-driven: a changed retention_days is a data edit, not a code change", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const order = await deliveredOrder(tx);
        await tx`UPDATE retention_policy SET retention_days = 30 WHERE key = 'recipient_contact'`;
        await sweep(tx, { now: daysFromNow(31) });
        expect((await recipientState(tx, order)).contact_redacted).toBe(true);
      });
    });

    it("deletes a delivery photo at 2 years: every variant and the original through the storage seam, then the rows; the order stays", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const storage = new InMemoryStorage();
        const order = await deliveredOrder(tx);
        const old = await deliveryPhoto(tx, storage, order.orderId, 731);
        const recent = await deliveryPhoto(tx, storage, order.orderId, 700);
        const [{ bucket } = { bucket: "" }] = await tx<{ bucket: string }[]>`
          SELECT bucket FROM media_asset WHERE id = ${old.assetId}`;
        const before = await untouchable(tx, order);

        const result = await sweep(tx, { now: new Date(), storage });

        expect(policy(result, "delivery_photo")).toEqual({
          key: "delivery_photo",
          status: "applied",
          counts: { photos: 1, objects: 2 },
          skipped: { dispute_open: 0 },
        });
        expect(
          await storage.head({ bucket, objectKey: old.original }),
        ).toBeNull();
        expect(
          await storage.head({ bucket, objectKey: old.variant }),
        ).toBeNull();
        expect(
          await storage.head({ bucket, objectKey: recent.original }),
        ).not.toBeNull();
        const assets = await tx<{ id: string }[]>`
          SELECT id FROM media_asset WHERE id IN (${old.assetId}, ${recent.assetId})`;
        expect(assets.map((row) => row.id)).toEqual([recent.assetId]);
        const variants = await tx`
          SELECT 1 FROM media_variant WHERE media_asset_id = ${old.assetId}`;
        expect(variants).toHaveLength(0);
        expect(await untouchable(tx, order)).toBe(before);
      });
    });

    it("keeps a delivery photo when no storage is wired, and when the order's dispute is open", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const storage = new InMemoryStorage();
        const order = await deliveredOrder(tx);
        const disputed = await deliveredOrder(tx, { status: "disputed" });
        await deliveryPhoto(tx, storage, order.orderId, 731);
        await deliveryPhoto(tx, storage, disputed.orderId, 731);
        const before = await everything(tx);

        const blind = await sweep(tx, { now: new Date() });
        expect(policy(blind, "delivery_photo")).toEqual({
          key: "delivery_photo",
          status: "storage_unavailable",
          counts: { photos: 0, objects: 0 },
          skipped: { dispute_open: 1, storage_unavailable: 1 },
        });
        expect(await everything(tx)).toBe(before);

        const wired = await sweep(tx, { now: new Date(), storage });
        expect(policy(wired, "delivery_photo").counts).toEqual({
          photos: 1,
          objects: 2,
        });
        const left = await tx<{ order_id: string }[]>`
          SELECT order_id FROM delivery_proof`;
        expect(left.map((row) => row.order_id)).toEqual([disputed.orderId]);
      });
    });

    it("pseudonymises a guest buyer 3 years after the last order, keeps the invoice data, and skips an account holder", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const guest = await deliveredOrder(tx);
        await tx`UPDATE customer SET name = 'Jan Kowalski', phone_e164 = '+48600000000',
                                     marketing_consent = true, country_iso2 = 'GB'
                 WHERE id = ${guest.customerId}`;
        await tx`UPDATE "order" SET buyer_snapshot = ${tx.json({
          name: "Jan Kowalski",
          email: "jan@example.test",
          phone_e164: "+48600000000",
          country_iso2: "GB",
        })} WHERE id = ${guest.orderId}`;
        await tx`INSERT INTO address (customer_id, kind, lines, postal_code, city, country_iso2)
                 VALUES (${guest.customerId}, 'billing', ARRAY['1 Test Street'], 'SW1A 1AA',
                         'London', 'GB')`;
        const [user] = await tx<{ id: string }[]>`
          INSERT INTO users (email) VALUES (${`${make.unique("acct")}@example.test`}) RETURNING id`;
        const holder = await make.customer(tx, user?.id);
        const before = await untouchable(tx, guest);
        const clock = daysFromNow(1096);

        const result = await sweep(tx, { now: clock });

        expect(policy(result, "buyer_personal")).toEqual({
          key: "buyer_personal",
          status: "applied",
          counts: { customers: 1, addresses: 1, buyer_snapshots: 1 },
          skipped: { dispute_open: 0, account_holder: 1 },
        });
        const [customer] = await tx<
          {
            name: string | null;
            phone_e164: string | null;
            email_normalised: string;
            marketing_consent: boolean;
            redacted: boolean;
            country_iso2: string | null;
          }[]
        >`SELECT name, phone_e164, email_normalised, marketing_consent, redacted, country_iso2
          FROM customer WHERE id = ${guest.customerId}`;
        expect(customer).toEqual({
          name: null,
          phone_e164: null,
          email_normalised: redactedEmail(guest.customerId),
          marketing_consent: false,
          redacted: true,
          country_iso2: "GB",
        });
        const [snapshot] = await tx<{ s: Record<string, unknown> }[]>`
          SELECT buyer_snapshot AS s FROM "order" WHERE id = ${guest.orderId}`;
        expect(snapshot?.s).toEqual({
          name: "J. K.",
          country_iso2: "GB",
          redacted: true,
          redacted_at: clock.toISOString(),
        });
        const [billing] = await tx<
          { lines: string[]; postal_code: string | null; city: string }[]
        >`SELECT lines, postal_code, city FROM address WHERE customer_id = ${guest.customerId}`;
        expect(billing).toEqual({
          lines: [],
          postal_code: null,
          city: "London",
        });
        const [kept] = await tx<{ redacted: boolean }[]>`
          SELECT redacted FROM customer WHERE id = ${holder}`;
        expect(kept?.redacted).toBe(false);
        // The order, its lines, events and payment: the invoice archive (§8).
        const afterOrder = JSON.parse(await untouchable(tx, guest)) as Record<
          string,
          Record<string, unknown>
        >;
        const beforeOrder = JSON.parse(before) as Record<
          string,
          Record<string, unknown>
        >;
        expect({ ...afterOrder.order, buyer_snapshot: null }).toEqual({
          ...beforeOrder.order,
          buyer_snapshot: null,
        });
        expect(afterOrder.lines).toEqual(beforeOrder.lines);
        expect(afterOrder.events).toEqual(beforeOrder.events);
        expect(afterOrder.payment).toEqual(beforeOrder.payment);
      });
    });

    it("skips a buyer whose order has a dispute open", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const disputed = await deliveredOrder(tx, { status: "disputed" });
        const result = await sweep(tx, { now: daysFromNow(1096) });
        expect(policy(result, "buyer_personal").skipped["dispute_open"]).toBe(
          1,
        );
        const [row] = await tx<{ redacted: boolean }[]>`
          SELECT redacted FROM customer WHERE id = ${disputed.customerId}`;
        expect(row?.redacted).toBe(false);
      });
    });

    it("HOLE 2 (PR 210): system may set redacted, redacted_at, email_normalised and marketing_consent; a buyer may not touch created_at or id", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const [user] = await tx<{ id: string }[]>`
          INSERT INTO users (email) VALUES (${`${make.unique("self")}@example.test`}) RETURNING id`;
        const userId = user?.id as string;
        const id = await make.customer(tx, userId);

        await tx.savepoint(async (sp) => {
          await asApp(sp, { role: "system" });
          const updated = await sp`
            UPDATE customer SET redacted = true, redacted_at = now(),
                   email_normalised = ${redactedEmail(id)}, marketing_consent = true
            WHERE id = ${id} RETURNING id`;
          expect(updated).toHaveLength(1);
          await sp.unsafe("RESET ROLE");
        });
        const [row] = await tx<{ redacted: boolean; email: string }[]>`
          SELECT redacted, email_normalised AS email FROM customer WHERE id = ${id}`;
        expect(row).toEqual({ redacted: true, email: redactedEmail(id) });

        for (const statement of [
          (sp: Tx) =>
            sp`UPDATE customer SET created_at = created_at - interval '1 day' WHERE id = ${id}`,
          (sp: Tx) =>
            sp`UPDATE customer SET id = ${randomUUID()} WHERE id = ${id}`,
        ]) {
          const failure = await pgFailure(tx, async (sp) => {
            await asApp(sp, { role: "customer", userId });
            await statement(sp);
          });
          expect(failure.raised).toBe("CUSTOMER_COLUMN_READ_ONLY");
        }
      });
    });

    it("deletes webhook payloads at 12 months and keeps younger ones", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const old = make.unique("evt_");
        const young = make.unique("evt_");
        await tx`INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, received_at)
                 VALUES ('stripe', ${old}, true, '{}'::jsonb, now() - interval '366 days'),
                        ('stripe', ${young}, true, '{}'::jsonb, now() - interval '364 days')`;
        const result = await sweep(tx, { now: new Date() });
        expect(policy(result, "fraud_signals").counts).toEqual({
          webhook_inbox: 1,
        });
        const left = await tx<{ event_id: string }[]>`
          SELECT event_id FROM webhook_inbox WHERE event_id IN (${old}, ${young})`;
        expect(left.map((row) => row.event_id)).toEqual([young]);
      });
    });

    it("deletes a consent record 5 years after it was withdrawn, and never a subject's latest record", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const subject = randomUUID();
        const lonely = randomUUID();
        const recent = randomUUID();
        const insert = (anon: string, daysAgo: number) => tx<{ id: string }[]>`
          INSERT INTO consent_log (subject_kind, anonymous_id, choices, policy_version, occurred_at)
          VALUES ('visitor', ${anon}, '{"analytics": true}'::jsonb, 1,
                  now() - make_interval(days => ${daysAgo}))
          RETURNING id`;
        const [given] = await insert(subject, 2200);
        const [withdrawn] = await insert(subject, 1830);
        const [alone] = await insert(lonely, 4000);
        const [first] = await insert(recent, 2200);
        const [second] = await insert(recent, 1800);

        const result = await sweep(tx, { now: new Date() });

        expect(policy(result, "consent_records").counts).toEqual({
          consent_log: 1,
        });
        const left = await tx<{ id: string }[]>`
          SELECT id FROM consent_log ORDER BY occurred_at`;
        const ids = left.map((row) => row.id);
        expect(ids).not.toContain(given?.id);
        for (const kept of [withdrawn, alone, first, second]) {
          expect(ids).toContain(kept?.id);
        }
      });
    });

    it("reports every retention_policy row: the keep row kept, the spec 010 rows without a handler yet", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const result = await sweep(tx, { now: new Date() });
        expect(result.policies.map(({ key, status }) => [key, status])).toEqual(
          [
            ["buyer_personal", "applied"],
            ["checkout_draft", "no_handler"],
            ["consent_records", "applied"],
            ["delivery_photo", "storage_unavailable"],
            ["demo_order_personal", "no_handler"],
            ["fraud_signals", "applied"],
            ["invoice_archive", "kept"],
            ["recipient_contact", "applied"],
          ],
        );
      });
    });

    it("initials are what the snapshot and the row keep of a name", () => {
      expect(initialsOf("  Łucja  Żak ")).toBe("Ł. Ż.");
    });
  },
);
