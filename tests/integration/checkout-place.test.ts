/**
 * Placing a basket against a migrated PG16 (spec 010 §2 "Placing the order", §5.2
 * `placeOrderAction`; T-02 integration half, T-19 integration half, T-20 placement half, T-21,
 * T-27, T-28, T-52, T-63, T-64, T-65, T-67; AC-2, AC-15, AC-16, AC-19, AC-20, AC-21, AC-27,
 * AC-28, AC-52, AC-63, AC-64, AC-65, AC-67; TASK-205).
 *
 * Each case starts a basket through the real start route and the real step runners, then places
 * it with `placeBasket` / `runPlaceOrder`, on a scratch database of a disposable local Postgres 16
 * inside a transaction that is rolled back. The concurrency case commits on two connections of its
 * own. Flags are injected (`checkout.open` and `checkout.demo_guard` on: the mode is `demo`); the
 * clock is injected.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import { CHECKOUT_SAMPLES } from "../../src/config/checkout-samples.ts";
import { logger } from "@/lib/logger";
import { listProducts, listTiers, priceProjection } from "@/modules/catalog";
import {
  type CheckoutFlagReader,
  type Draft,
  type DraftConnection,
  type StepOutcome,
  assessBasket,
  checkoutScreen,
  confirmationFor,
  draftTokenFromCookieHeader,
  loadDraft,
  nextDeliveryDate,
  placeBasket,
  runCardAndBuyerStep,
  runPlaceOrder,
  runRecipientStep,
  saveLine,
  startCheckout,
} from "@/modules/checkout";
import { PlaceOrderInputSchema, orderService } from "@/modules/orders";

import { runRetentionSweep } from "../../src/jobs/retention.ts";

import { country, customer, partner, recipient } from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const T0 = new Date(`${FX_SNAPSHOT_AS_OF}T09:00:00.000Z`);
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);
const DAY = 24 * 60;

const PRODUCTS = await listProducts({ countryIso: "PL" });
const [PRODUCT, SECOND] = PRODUCTS;
if (PRODUCT === undefined || SECOND === undefined) {
  throw new Error("the dataset needs two products priced for PL");
}
const [TIER] = await listTiers(PRODUCT.sku);
const [SECOND_TIER] = await listTiers(SECOND.sku);
if (TIER === undefined || SECOND_TIER === undefined) {
  throw new Error("each product needs a tier");
}

const OPEN: CheckoutFlagReader = () => Promise.resolve(true);
const SAMPLE = CHECKOUT_SAMPLES.PL;

/** The first selectable demo date three days out, so a one-day clock move keeps it. */
const DELIVERY_DATE =
  nextDeliveryDate("PL", new Date(T0.getTime() + 3 * DAY * 60_000)) ?? "";

let db: ScratchDatabase | undefined;

beforeAll(async () => {
  if (server.url !== undefined) {
    db = await scratchDatabase(server.url, "checkout_place");
  }
}, 180_000);

afterAll(async () => {
  await db?.drop();
});

/** PL with one demo florist, both products, then the system context. */
async function seed(tx: Tx | Sql): Promise<void> {
  const plId = await country(tx as Tx, "PL");
  await tx`INSERT INTO locale (code, bcp47, name) VALUES ('en-gb', 'en-GB', 'English (UK)')
           ON CONFLICT DO NOTHING`;
  for (const sku of [PRODUCT?.sku ?? "", SECOND?.sku ?? ""]) {
    await tx`
      INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                           substitution_class, freshness_days)
      VALUES (${sku}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
      ON CONFLICT DO NOTHING`;
  }
  const [florists] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM fulfillment_partner WHERE status = 'demo'`;
  if ((florists?.n ?? 0) === 0) await partner(tx as Tx, plId, "demo");
}

async function seeded(tx: Tx): Promise<DraftConnection> {
  await seed(tx);
  await asApp(tx, { role: "system" });
  return { executor: runnerOf(tx) };
}

function form(values: Record<string, string | readonly string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of typeof value === "string" ? [value] : value) {
      data.append(key, item);
    }
  }
  return data;
}

async function shown(
  sku: string,
  tierKey: string,
): Promise<{ amountMinor: number; currency: string }> {
  const projection = await priceProjection("pl", {
    productId: sku,
    tierKey,
    countryIso: "PL",
    now: T0,
  });
  return projection.displayPrice;
}

/** "Add to basket" (or "Try a demo order") for one product; returns the basket's token. */
async function add(
  connection: DraftConnection,
  sku: string,
  tierKey: string,
  token: string | null = null,
): Promise<string> {
  const display = await shown(sku, tierKey);
  const response = await startCheckout(
    new Request("http://flowersoverseas.test/api/checkout/start", {
      method: "POST",
      headers: {
        host: "flowersoverseas.test",
        origin: "http://flowersoverseas.test",
        "content-type": "application/x-www-form-urlencoded",
        ...(token === null ? {} : { cookie: `fo_checkout=${token}` }),
      },
      body: new URLSearchParams({
        locale: "pl",
        countryIso: "PL",
        sku,
        tierKey,
        expectedTotalMinor: String(display.amountMinor),
        expectedCurrency: display.currency,
        then: "checkout",
      }).toString(),
    }),
    { now: () => T0, connection, flags: OPEN },
  );
  if (token !== null) return token;
  const started = draftTokenFromCookieHeader(
    response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("fo_checkout=")),
  );
  if (started === null) {
    throw new Error(`no basket: ${String(response.status)}`);
  }
  return started;
}

function ctx(connection: DraftConnection, token: string, minutes = 1) {
  return {
    locale: "pl",
    token,
    connection,
    flags: OPEN,
    now: () => at(minutes),
  };
}

function location(outcome: StepOutcome): string {
  if (outcome.kind !== "redirect") {
    throw new Error(`expected a redirect, got ${JSON.stringify(outcome)}`);
  }
  return outcome.location;
}

/** Steps 1 and 2 of every line, as the buyer posts them. */
async function fill(
  connection: DraftConnection,
  token: string,
  lines: number,
): Promise<void> {
  for (let line = 1; line <= lines; line += 1) {
    const outcome = await runRecipientStep(
      ctx(connection, token),
      form({
        line: String(line),
        ...SAMPLE.recipient.fields,
        fullName: `Anna Przykładowa ${String(line)}`,
        placeKind: SAMPLE.recipient.placeKind,
        deliveryNote: "",
        deliveryDate: DELIVERY_DATE,
      }),
    );
    location(outcome);
  }
  for (let line = 1; line <= lines; line += 1) {
    const last = line === lines;
    const outcome = await runCardAndBuyerStep(
      ctx(connection, token),
      form({
        line: String(line),
        cardMessage: `Wszystkiego najlepszego ${String(line)}`,
        signAs: "Sam",
        ...(last
          ? {
              email: SAMPLE.buyer.email,
              buyerName: SAMPLE.buyer.buyerName,
              buyerPhone: "",
              residenceCountry: SAMPLE.buyer.residenceCountry,
            }
          : {}),
      }),
    );
    location(outcome);
  }
}

async function draftOf(
  connection: DraftConnection,
  token: string,
  minutes = 2,
): Promise<Draft> {
  const lookup = await loadDraft(token, at(minutes), connection);
  if (lookup.status !== "active") throw new Error(`draft ${lookup.status}`);
  return lookup.draft;
}

/** The total the review displays: the basket's assessed total. */
async function reviewTotal(
  connection: DraftConnection,
  token: string,
  minutes = 2,
): Promise<{ amountMinor: number; currency: string }> {
  const assessed = await assessBasket(
    await draftOf(connection, token, minutes),
    {
      locale: "pl",
      now: at(minutes),
      flags: OPEN,
    },
  );
  if (assessed.total === null) throw new Error("no total");
  return assessed.total;
}

/** Rows of the seven tables placement writes, as the superuser sees them. */
async function counts(tx: Tx): Promise<Record<string, number>> {
  await tx.unsafe("RESET ROLE");
  const [row] = await tx<Record<string, number>[]>`
    SELECT (SELECT count(*)::int FROM purchase) AS purchase,
           (SELECT count(*)::int FROM "order") AS orders,
           (SELECT count(*)::int FROM order_line) AS order_lines,
           (SELECT count(*)::int FROM order_event) AS events,
           (SELECT count(*)::int FROM order_assignment) AS assignments,
           (SELECT count(*)::int FROM outbox) AS outbox,
           (SELECT count(*)::int FROM payment) AS payments`;
  await asApp(tx, { role: "system" });
  return row ?? {};
}

const EMPTY = {
  purchase: 0,
  orders: 0,
  order_lines: 0,
  events: 0,
  assignments: 0,
  outbox: 0,
  payments: 0,
};

const describeDb = server.url === undefined ? describe.skip : describe;

describeDb(`placing a basket (${server.reason})`, () => {
  const sql = (): Sql => {
    if (db === undefined) throw new Error("no scratch database");
    return db.sql;
  };

  it("T-20, T-63 (N = 1): one demo order, routed, events 1 to 4, one assignment, no payment or outbox row, the draft cleared", async () => {
    await rolledBack(sql(), async (tx) => {
      const connection = await seeded(tx);
      const token = await add(connection, PRODUCT.sku, TIER.tierKey);
      await fill(connection, token, 1);
      const seen = await reviewTotal(connection, token);

      const outcome = await placeBasket(ctx(connection, token, 2), seen);
      expect(outcome.kind).toBe("placed");
      if (outcome.kind !== "placed") return;
      expect(outcome.orderIds).toHaveLength(1);

      await tx.unsafe("RESET ROLE");
      const [order] = await tx<
        {
          mode: string;
          status: string;
          buyer_total_minor: string;
          buyer_currency_code: string;
          terms_version: string | null;
          purchase_id: string;
          delivery_date: string;
          recipient_snapshot: { fullName: string; cardMessage?: string };
          buyer_snapshot: { email: string };
          vat_breakdown: { grossMinor: number }[];
        }[]
      >`SELECT mode, status, buyer_total_minor::text, buyer_currency_code, terms_version,
               purchase_id, delivery_date::text, recipient_snapshot, buyer_snapshot,
               vat_breakdown
          FROM "order" WHERE id = ${outcome.orderIds[0] ?? ""}`;
      expect(order?.mode).toBe("demo");
      expect(order?.status).toBe("routed");
      expect(order?.terms_version).toBeNull();
      expect(order?.purchase_id).toBe(outcome.purchaseId);
      expect(order?.delivery_date).toBe(DELIVERY_DATE);
      // Price shown = price charged: the order is the review's total, the same integer (AC-15).
      expect(Number(order?.buyer_total_minor)).toBe(seen.amountMinor);
      expect(order?.buyer_currency_code).toBe(seen.currency);
      expect(order?.recipient_snapshot.fullName).toBe("Anna Przykładowa 1");
      expect(order?.recipient_snapshot.cardMessage).toBe(
        "Wszystkiego najlepszego 1",
      );
      expect(order?.buyer_snapshot.email).toBe(SAMPLE.buyer.email);
      // AC-16: the VAT split by rate sums to the total.
      expect(
        order?.vat_breakdown.reduce((sum, split) => sum + split.grossMinor, 0),
      ).toBe(seen.amountMinor);

      const lines = await tx<{ sum: string }[]>`
        SELECT sum(unit_retail_minor * qty)::text AS sum FROM order_line
         WHERE order_id = ${outcome.orderIds[0] ?? ""}`;
      expect(Number(lines[0]?.sum)).toBe(seen.amountMinor);

      const events = await tx<{ seq: number; type: string; actor: string }[]>`
        SELECT seq, type, actor FROM order_event
         WHERE order_id = ${outcome.orderIds[0] ?? ""} ORDER BY seq`;
      expect(
        events.map((event) => [event.seq, event.type, event.actor]),
      ).toEqual([
        [1, "order.placed", "buyer"],
        [2, "order.authorised", "system:demo_guard"],
        [3, "order.routed", "system:demo_router"],
        [4, "assignment.offered", "system:demo_router"],
      ]);
      const [assignment] = await tx<{ status: string; minutes: number }[]>`
        SELECT p.status,
               round(extract(epoch FROM (a.sla_expires_at - a.offered_at)) / 60)::int AS minutes
          FROM order_assignment a JOIN fulfillment_partner p ON p.id = a.partner_id
         WHERE a.order_id = ${outcome.orderIds[0] ?? ""}`;
      expect(assignment?.status).toBe("demo");
      expect(assignment?.minutes).toBe(60);

      const [purchase] = await tx<{ total_minor: string; mode: string }[]>`
        SELECT total_minor::text, mode FROM purchase WHERE id = ${outcome.purchaseId}`;
      expect(Number(purchase?.total_minor)).toBe(seen.amountMinor);
      expect(purchase?.mode).toBe("demo");

      const [draft] = await tx<
        {
          buyer: unknown;
          purchase_id: string;
          recipient: unknown;
          card: unknown;
          order_id: string;
        }[]
      >`SELECT d.buyer, d.purchase_id, l.recipient, l.card, l.order_id
          FROM checkout_draft d JOIN checkout_draft_line l ON l.draft_id = d.id`;
      expect(draft).toEqual({
        buyer: null,
        purchase_id: outcome.purchaseId,
        recipient: null,
        card: null,
        order_id: outcome.orderIds[0],
      });
      await asApp(tx, { role: "system" });
      // AC-2: no provider was called, so no payment row; Phase 0 targets are empty, so no outbox.
      const after = await counts(tx);
      expect(after.payments).toBe(0);
      expect(after.outbox).toBe(0);
    });
  });

  it("T-63 (N = 2): one purchase, two orders whose totals sum to it, one assignment each", async () => {
    await rolledBack(sql(), async (tx) => {
      const connection = await seeded(tx);
      const token = await add(connection, PRODUCT.sku, TIER.tierKey);
      await add(connection, SECOND.sku, SECOND_TIER.tierKey, token);
      await fill(connection, token, 2);
      const seen = await reviewTotal(connection, token);
      const outcome = await placeBasket(ctx(connection, token, 2), seen);
      if (outcome.kind !== "placed") throw new Error(outcome.kind);
      expect(outcome.orderIds).toHaveLength(2);
      await tx.unsafe("RESET ROLE");
      const orders = await tx<{ total: string; name: string }[]>`
        SELECT buyer_total_minor::text AS total, recipient_snapshot ->> 'fullName' AS name
          FROM "order" WHERE purchase_id = ${outcome.purchaseId} ORDER BY created_at, id`;
      expect(orders.reduce((sum, order) => sum + Number(order.total), 0)).toBe(
        seen.amountMinor,
      );
      expect(new Set(orders.map((order) => order.name))).toEqual(
        new Set(["Anna Przykładowa 1", "Anna Przykładowa 2"]),
      );
      const [assignments] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM order_assignment a JOIN "order" o ON o.id = a.order_id
         WHERE o.purchase_id = ${outcome.purchaseId}`;
      expect(assignments?.n).toBe(2);

      // T-29, T-68 (data half): the confirmation the cookie leads to lists every delivery in
      // basket order with its own reference and amount, and the purchase total.
      await asApp(tx, { role: "system" });
      const confirmation = await confirmationFor(token, at(3), connection);
      if (confirmation.kind !== "placed") throw new Error(confirmation.kind);
      expect(confirmation.mode).toBe("demo");
      expect(
        confirmation.deliveries.map((delivery) => delivery.recipientName),
      ).toEqual(["Anna Przykładowa 1", "Anna Przykładowa 2"]);
      expect(confirmation.deliveries.map((delivery) => delivery.sku)).toEqual([
        PRODUCT.sku,
        SECOND.sku,
      ]);
      for (const delivery of confirmation.deliveries) {
        expect(delivery.reference).toMatch(/^FO-[0-9A-Z]{4}-[0-9A-Z]{4}$/u);
        expect(delivery.addonNameKeys).toEqual([]);
      }
      expect(confirmation.total.amountMinor).toBe(seen.amountMinor);
      expect(
        confirmation.deliveries.reduce(
          (sum, delivery) => sum + delivery.amount.amountMinor,
          0,
        ),
      ).toBe(seen.amountMinor);
    });
  });

  it("step 2 offers the add-ons but never the free printed card (the step 2 board)", async () => {
    await rolledBack(sql(), async (tx) => {
      const connection = await seeded(tx);
      const token = await add(connection, PRODUCT.sku, TIER.tierKey);
      await fill(connection, token, 1);
      const { listAddons } = await import("@/modules/catalog");
      const dataset = (await listAddons("PL")).map((addon) => addon.key);
      // The dataset does carry the card for PL, so its absence below is the filter's doing.
      expect(dataset).toContain("card");
      const screen = await checkoutScreen({
        locale: "pl",
        token,
        step: "card",
        line: "1",
        now: () => at(2),
        connection,
        flags: OPEN,
      });
      if (!("step" in screen)) throw new Error(screen.kind);
      expect(screen.step).toBe("card");
      expect(screen.addons.map((addon) => addon.key)).toEqual(
        dataset.filter((key) => key !== "card"),
      );
    });
  });

  it("T-21, T-65: a repeated placement returns the same purchase and writes nothing more", async () => {
    await rolledBack(sql(), async (tx) => {
      const connection = await seeded(tx);
      const token = await add(connection, PRODUCT.sku, TIER.tierKey);
      await fill(connection, token, 1);
      const seen = await reviewTotal(connection, token);
      const first = await placeBasket(ctx(connection, token, 2), seen);
      const before = await counts(tx);
      const again = await placeBasket(ctx(connection, token, 3), seen);
      expect(again).toEqual({
        kind: "placed",
        purchaseId: first.kind === "placed" ? first.purchaseId : "",
        orderIds: first.kind === "placed" ? first.orderIds : [],
        replay: true,
      });
      expect(await counts(tx)).toEqual(before);
      // The action answers the same confirmation for the replayed POST.
      const outcome = await runPlaceOrder(
        ctx(connection, token, 3),
        form({
          seenTotalMinor: String(seen.amountMinor),
          seenCurrency: seen.currency,
        }),
      );
      expect(location(outcome)).toBe("/pl/checkout/done");
    });
  });

  it("T-52 (AC-52, TASK-203 hole 15): a placed draft is read-only; every step action goes to the confirmation and writes nothing", async () => {
    await rolledBack(sql(), async (tx) => {
      const connection = await seeded(tx);
      const token = await add(connection, PRODUCT.sku, TIER.tierKey);
      await fill(connection, token, 1);
      const seen = await reviewTotal(connection, token);
      await placeBasket(ctx(connection, token, 2), seen);
      const placed = await draftOf(connection, token, 3);
      const outcome = await runRecipientStep(
        ctx(connection, token, 3),
        form({
          line: "1",
          ...SAMPLE.recipient.fields,
          placeKind: "home",
          deliveryNote: "",
          deliveryDate: DELIVERY_DATE,
        }),
      );
      expect(location(outcome)).toBe("/pl/checkout/done");
      // The save itself refuses a placed draft (`purchase_id IS NULL` in its WHERE).
      const line = placed.lines[0];
      if (line === undefined) throw new Error("no line");
      expect(
        await saveLine(placed.id, 1, { addonKeys: [] }, at(3), connection),
      ).toBe(false);
      expect(await draftOf(connection, token, 3)).toEqual(placed);
    });
  });

  it("T-19, T-64: a date that can no longer be met refuses placement, opens that line's step 1 and writes nothing", async () => {
    await rolledBack(sql(), async (tx) => {
      const connection = await seeded(tx);
      const token = await add(connection, PRODUCT.sku, TIER.tierKey);
      await fill(connection, token, 1);
      const seen = await reviewTotal(connection, token);
      const before = await counts(tx);
      // Ten days on, the chosen date has passed.
      const outcome = await placeBasket(ctx(connection, token, 10 * DAY), seen);
      expect(outcome).toEqual({ kind: "redirect", location: "/pl/checkout" });
      expect(await counts(tx)).toEqual(before);
      expect(before).toEqual(EMPTY);
    });
  });

  it("price shown = price charged: a total other than the one the review showed places nothing", async () => {
    await rolledBack(sql(), async (tx) => {
      const connection = await seeded(tx);
      const token = await add(connection, PRODUCT.sku, TIER.tierKey);
      await fill(connection, token, 1);
      const seen = await reviewTotal(connection, token);
      for (const posted of [
        { amountMinor: seen.amountMinor - 1, currency: seen.currency },
        { amountMinor: seen.amountMinor, currency: "EUR" },
        null,
      ]) {
        expect(await placeBasket(ctx(connection, token, 2), posted)).toEqual({
          kind: "redirect",
          location: "/pl/checkout?step=review",
        });
      }
      expect(await counts(tx)).toEqual(EMPTY);
    });
  });

  it("T-28: an add-on with no `addon` row refuses placement with a logged code and writes nothing", async () => {
    await rolledBack(sql(), async (tx) => {
      const connection = await seeded(tx);
      const token = await add(connection, PRODUCT.sku, TIER.tierKey);
      await fill(connection, token, 1);
      const draft = await draftOf(connection, token);
      const assessed = await assessBasket(draft, {
        locale: "pl",
        now: at(2),
        flags: OPEN,
      });
      // A paid add-on of the dataset, with no row in the (unseeded) `addon` table.
      const { listAddons } = await import("@/modules/catalog");
      const addon = (await listAddons("PL"))[0];
      if (addon === undefined) throw new Error("PL needs an add-on");
      const line = draft.lines[0];
      if (line === undefined || assessed.lines[0]?.check === null) {
        throw new Error("no line");
      }
      const { deriveLineQuote, selectionOf } =
        await import("@/modules/checkout");
      const priced = await deriveLineQuote(
        { ...selectionOf(line), addonKeys: [addon.key] },
        "PLN",
        "pl",
        at(2),
      );
      await saveLine(
        draft.id,
        1,
        {
          addonKeys: [addon.key],
          quote: priced,
          lastSeen: {
            amountMinor: priced.totalMinor,
            currency: priced.currency,
          },
        },
        at(2),
        connection,
      );
      const errors = vi.spyOn(logger, "error");
      const seen = await reviewTotal(connection, token);
      const outcome = await placeBasket(ctx(connection, token, 2), seen);
      expect(outcome).toEqual({ kind: "refused", reason: "unable" });
      expect(errors).toHaveBeenCalledWith(
        expect.objectContaining({ code: "addon_not_in_database" }),
        "checkout.place_refused",
      );
      errors.mockRestore();
      expect(await counts(tx)).toEqual(EMPTY);
    });
  });

  it("T-27, T-67: the daily cap counts orders; over it nothing is written, and the next UTC day accepts", async () => {
    await rolledBack(sql(), async (tx) => {
      const connection = await seeded(tx);
      // K = 1 placed today.
      const first = await add(connection, PRODUCT.sku, TIER.tierKey);
      await fill(connection, first, 1);
      const placed = await placeBasket(
        { ...ctx(connection, first, 2), dailyCap: 3 },
        await reviewTotal(connection, first),
      );
      expect(placed.kind).toBe("placed");
      // Orders take the database's clock; pin them to the injected day.
      await tx.unsafe("RESET ROLE");
      await tx`UPDATE "order" SET created_at = ${at(2).toISOString()}::timestamptz`;
      await asApp(tx, { role: "system" });

      // N = 2 more: K + N = 3 is within C = 3, but 4 is not (C = 3 with K = 2 below).
      const token = await add(connection, PRODUCT.sku, TIER.tierKey);
      await add(connection, SECOND.sku, SECOND_TIER.tierKey, token);
      await fill(connection, token, 2);
      const seen = await reviewTotal(connection, token);
      const before = await counts(tx);
      expect(
        await placeBasket({ ...ctx(connection, token, 3), dailyCap: 2 }, seen),
      ).toEqual({ kind: "refused", reason: "cap" });
      expect(await counts(tx)).toEqual(before);
      const action = await runPlaceOrder(
        { ...ctx(connection, token, 3), dailyCap: 2 },
        form({
          seenTotalMinor: String(seen.amountMinor),
          seenCurrency: seen.currency,
        }),
      );
      expect(action).toEqual({
        kind: "render",
        state: { status: "refused", reason: "cap" },
      });
      // The next UTC day starts again at zero.
      const tomorrow = await reviewTotal(connection, token, DAY + 3);
      const accepted = await placeBasket(
        { ...ctx(connection, token, DAY + 3), dailyCap: 2 },
        tomorrow,
      );
      expect(accepted.kind).toBe("placed");
    });
  });
});

/* -------------------------------------------------------------------------- */
/* T-35: retention of drafts and demo orders (TASK-207). Before the concurrent  */
/* block: that one commits, and its rows would be due at `NOW`.                 */
/* -------------------------------------------------------------------------- */

const HOUR_MS = 3_600_000;
const NOW = new Date("2027-03-01T12:00:00.000Z");
const before = (ms: number): string =>
  new Date(NOW.getTime() - ms).toISOString();

describeDb(
  `retention of checkout drafts and demo orders (${server.reason})`,
  () => {
    const sql = (): Sql => {
      if (db === undefined) throw new Error("no scratch database");
      return db.sql;
    };

    async function sweep(tx: Tx, dryRun = false) {
      await asApp(tx, { role: "system" });
      const result = await runRetentionSweep(runnerOf(tx), {
        now: NOW,
        dryRun,
      });
      await tx.unsafe("RESET ROLE");
      return Object.fromEntries(
        result.policies.map((policy) => [policy.key, policy]),
      );
    }

    async function idle(tx: Tx, token: string, ms: number): Promise<void> {
      await tx.unsafe("RESET ROLE");
      await tx`UPDATE checkout_draft
                SET last_activity_at = ${before(ms)}::timestamptz,
                    expires_at = ${before(ms)}::timestamptz + interval '30 days'
              WHERE token_sha256 = encode(sha256(convert_to(${token}, 'UTF8')), 'hex')`;
    }

    async function draftRow(tx: Tx) {
      const [draft] = await tx<
        {
          buyer: unknown;
          recipient: unknown;
          card: unknown;
          tier_key: string;
          delivery_date: string | null;
          addon_keys: string[];
        }[]
      >`SELECT d.buyer, l.recipient, l.card, l.tier_key, l.delivery_date::text, l.addon_keys
        FROM checkout_draft d JOIN checkout_draft_line l ON l.draft_id = d.id`;
      return draft;
    }

    it("T-35: the buyer, recipient and card are cleared at 24 h of idleness, not at 23 h 59 min; the line stays", async () => {
      await rolledBack(sql(), async (tx) => {
        const connection = await seeded(tx);
        const token = await add(connection, PRODUCT.sku, TIER.tierKey);
        await fill(connection, token, 1);

        await idle(tx, token, 24 * HOUR_MS - 60_000);
        expect((await sweep(tx))["checkout_draft_personal"]?.counts).toEqual({
          drafts: 0,
          draft_lines: 0,
        });
        expect((await draftRow(tx))?.buyer).not.toBeNull();

        await idle(tx, token, 24 * HOUR_MS);
        const dry = await sweep(tx, true);
        expect(dry["checkout_draft_personal"]?.counts).toEqual({
          drafts: 1,
          draft_lines: 1,
        });
        expect((await draftRow(tx))?.recipient).not.toBeNull();

        const done = await sweep(tx);
        expect(done["checkout_draft_personal"]?.counts).toEqual({
          drafts: 1,
          draft_lines: 1,
        });
        const row = await draftRow(tx);
        expect(row?.buyer).toBeNull();
        expect(row?.recipient).toBeNull();
        expect(row?.card).toBeNull();
        expect(row?.tier_key).toBe(TIER.tierKey);
        expect(row?.delivery_date).toBe(DELIVERY_DATE);
      });
    });

    it("T-35: a draft and its lines are deleted at 30 days of idleness, not at 29 days 23 h", async () => {
      await rolledBack(sql(), async (tx) => {
        const connection = await seeded(tx);
        const token = await add(connection, PRODUCT.sku, TIER.tierKey);
        await fill(connection, token, 1);

        await idle(tx, token, 30 * 24 * HOUR_MS - HOUR_MS);
        expect((await sweep(tx))["checkout_draft"]?.counts).toEqual({
          drafts: 0,
          draft_lines: 0,
        });
        expect(await draftRow(tx)).toBeDefined();

        await idle(tx, token, 30 * 24 * HOUR_MS);
        expect((await sweep(tx, true))["checkout_draft"]?.counts).toEqual({
          drafts: 1,
          draft_lines: 1,
        });
        expect(await draftRow(tx)).toBeDefined();
        expect((await sweep(tx))["checkout_draft"]?.counts).toEqual({
          drafts: 1,
          draft_lines: 1,
        });
        expect(await draftRow(tx)).toBeUndefined();
      });
    });

    /** A placed demo order, and the input the checkout handed `placePurchase` for it. */
    async function placedDemoWithInput(tx: Tx): Promise<{
      orderId: string;
      purchaseId: string;
      input: Parameters<typeof orderService.placePurchase>[0];
    }> {
      const connection = await seeded(tx);
      const token = await add(
        connection,
        PRODUCT?.sku ?? "",
        TIER?.tierKey ?? "",
      );
      await fill(connection, token, 1);
      const original = orderService.placePurchase;
      let input: Parameters<typeof orderService.placePurchase>[0] | undefined;
      const spy = vi
        .spyOn(orderService, "placePurchase")
        .mockImplementation((given, options) => {
          input = given;
          return original(given, options);
        });
      const outcome = await placeBasket(
        ctx(connection, token, 2),
        await reviewTotal(connection, token),
      );
      spy.mockRestore();
      if (outcome.kind !== "placed" || input === undefined) {
        throw new Error(outcome.kind);
      }
      await tx.unsafe("RESET ROLE");
      // The draft is fresh, so only the demo-order rule can act.
      await tx`UPDATE checkout_draft SET last_activity_at = ${NOW.toISOString()}::timestamptz,
                expires_at = ${NOW.toISOString()}::timestamptz + interval '30 days'`;
      return {
        orderId: outcome.orderIds[0] ?? "",
        purchaseId: outcome.purchaseId,
        input,
      };
    }

    async function placedAs(
      tx: Tx,
    ): Promise<{ orderId: string; purchaseId: string }> {
      const { orderId, purchaseId } = await placedDemoWithInput(tx);
      return { orderId, purchaseId };
    }

    /**
     * An order placed in `mode` from the same checkout input: the checkout has no `test` or `live`
     * payment step in this spec (spec 013 adds them), so the order engine places it directly, a
     * purchase of one, in its mode from the start; no trigger is switched off (AC-36's scan). It
     * has a customer and a recipient of its own, and the demo order the input came from is made
     * fresh, so only the new order's age matters.
     */
    async function placedIn(
      tx: Tx,
      mode: "test" | "live",
    ): Promise<{ orderId: string }> {
      const demo = await placedDemoWithInput(tx);
      await placedAgo(tx, demo.orderId, 0);
      const [first] = demo.input.orders;
      if (first === undefined) throw new Error("no order input");
      const customerId = await customer(tx);
      const recipientId = await recipient(tx, customerId);
      await asApp(tx, { role: "system" });
      const placed = await orderService.place(
        PlaceOrderInputSchema.parse({
          ...first,
          customerId,
          recipientId,
          mode,
          ...(mode === "live" ? { termsVersion: "terms-test" } : {}),
        }),
        { executor: runnerOf(tx) },
      );
      await tx.unsafe("RESET ROLE");
      return { orderId: placed.orderId };
    }

    async function placedAgo(
      tx: Tx,
      orderId: string,
      ms: number,
    ): Promise<void> {
      await tx`UPDATE "order" SET created_at = ${before(ms)}::timestamptz WHERE id = ${orderId}`;
    }

    async function personal(tx: Tx, orderId: string) {
      const [row] = await tx<
        {
          recipient_snapshot: Record<string, unknown>;
          buyer_snapshot: Record<string, unknown>;
          full_name: string;
          phone_e164: string | null;
          contact_redacted: boolean;
          customer_name: string | null;
          customer_redacted: boolean;
          events: number;
          lines: number;
          purchase: number;
        }[]
      >`SELECT o.recipient_snapshot, o.buyer_snapshot, r.full_name, r.phone_e164, r.contact_redacted,
             c.name AS customer_name, c.redacted AS customer_redacted,
             (SELECT count(*)::int FROM order_event e WHERE e.order_id = o.id) AS events,
             (SELECT count(*)::int FROM order_line ol WHERE ol.order_id = o.id) AS lines,
             (SELECT count(*)::int FROM purchase p WHERE p.id = o.purchase_id) AS purchase
        FROM "order" o
        JOIN recipient r ON r.id = o.recipient_id
        JOIN customer c ON c.id = o.customer_id
       WHERE o.id = ${orderId}`;
      if (row === undefined) throw new Error("no order");
      return row;
    }

    it("T-35: production seed (1 day): a demo order is pseudonymised at 24 h, its order, lines, events and purchase kept", async () => {
      await rolledBack(sql(), async (tx) => {
        const { orderId } = await placedAs(tx);
        const events = (await personal(tx, orderId)).events;

        await placedAgo(tx, orderId, 24 * HOUR_MS - 60_000);
        expect((await sweep(tx))["demo_order_personal"]?.counts).toEqual({
          order_snapshots: 0,
          recipients: 0,
          customers: 0,
        });
        expect(
          (await personal(tx, orderId)).recipient_snapshot["fullName"],
        ).toBe("Anna Przykładowa 1");

        await placedAgo(tx, orderId, 24 * HOUR_MS);
        const counts = { order_snapshots: 1, recipients: 1, customers: 1 };
        expect((await sweep(tx, true))["demo_order_personal"]?.counts).toEqual(
          counts,
        );
        expect((await personal(tx, orderId)).contact_redacted).toBe(false);
        expect((await sweep(tx))["demo_order_personal"]?.counts).toEqual(
          counts,
        );

        const after = await personal(tx, orderId);
        expect(after.recipient_snapshot["fullName"]).toBe("A. P. 1.");
        expect(after.recipient_snapshot["redacted"]).toBe(true);
        for (const gone of [
          "addressLines",
          "postcode",
          "phone",
          "cardMessage",
          "street",
        ]) {
          expect(after.recipient_snapshot).not.toHaveProperty(gone);
        }
        expect(after.buyer_snapshot["redacted"]).toBe(true);
        expect(after.buyer_snapshot).not.toHaveProperty("email");
        expect(after.full_name).toBe("A. P. 1.");
        expect(after.phone_e164).toBeNull();
        expect(after.contact_redacted).toBe(true);
        expect(after.customer_name).toBeNull();
        expect(after.customer_redacted).toBe(true);
        expect(after.events).toBe(events);
        expect(after.lines).toBeGreaterThan(0);
        expect(after.purchase).toBe(1);
        // A second sweep finds nothing left to do.
        expect((await sweep(tx))["demo_order_personal"]?.counts).toEqual({
          order_snapshots: 0,
          recipients: 0,
          customers: 0,
        });
      });
    });

    it("T-35: staging seed (7 days): untouched at 24 h, pseudonymised at 7 days; a test order too", async () => {
      await rolledBack(sql(), async (tx) => {
        const { orderId } = await placedIn(tx, "test");
        await tx`UPDATE retention_policy SET retention_days = 7 WHERE key = 'demo_order_personal'`;

        await placedAgo(tx, orderId, 24 * HOUR_MS);
        expect(
          (await sweep(tx))["demo_order_personal"]?.counts?.["order_snapshots"],
        ).toBe(0);
        await placedAgo(tx, orderId, 7 * 24 * HOUR_MS - 60_000);
        expect(
          (await sweep(tx))["demo_order_personal"]?.counts?.["order_snapshots"],
        ).toBe(0);
        await placedAgo(tx, orderId, 7 * 24 * HOUR_MS);
        expect(
          (await sweep(tx))["demo_order_personal"]?.counts?.["order_snapshots"],
        ).toBe(1);
        expect((await personal(tx, orderId)).contact_redacted).toBe(true);
      });
    });

    it("T-35: a live order, its recipient and its buyer are never touched", async () => {
      await rolledBack(sql(), async (tx) => {
        const { orderId } = await placedIn(tx, "live");
        await placedAgo(tx, orderId, 400 * 24 * HOUR_MS);

        expect((await sweep(tx))["demo_order_personal"]?.counts).toEqual({
          order_snapshots: 0,
          recipients: 0,
          customers: 0,
        });
        const after = await personal(tx, orderId);
        expect(after.recipient_snapshot["fullName"]).toBe("Anna Przykładowa 1");
        expect(after.contact_redacted).toBe(false);
        expect(after.customer_redacted).toBe(false);
      });
    });
  },
);

describeDb(`placing one basket twice at once (${server.reason})`, () => {
  it("T-21, T-65: two concurrent placements commit one purchase and both end on it", async () => {
    if (db === undefined) throw new Error("no scratch database");
    const pool = db.sql;
    await seed(pool);
    // The basket, committed, so both placements see it.
    let token = "";
    await pool.begin(async (tx) => {
      await asApp(tx, { role: "system" });
      const connection = { executor: runnerOf(tx) };
      token = await add(connection, PRODUCT.sku, TIER.tierKey);
      await fill(connection, token, 1);
    });
    let seen: { amountMinor: number; currency: string } | undefined;
    await pool.begin(async (tx) => {
      await asApp(tx, { role: "system" });
      seen = await reviewTotal({ executor: runnerOf(tx) }, token);
    });
    const place = () =>
      pool.begin(async (tx) => {
        await asApp(tx, { role: "system" });
        return placeBasket(
          {
            locale: "pl",
            token,
            connection: { executor: runnerOf(tx) },
            flags: OPEN,
            now: () => at(2),
          },
          seen ?? null,
        );
      });
    const [left, right] = await Promise.all([place(), place()]);
    if (left.kind !== "placed" || right.kind !== "placed") {
      throw new Error(`${left.kind} / ${right.kind}`);
    }
    expect(left.purchaseId).toBe(right.purchaseId);
    expect([left.replay, right.replay].sort()).toEqual([false, true]);
    const [row] = await pool<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "order" WHERE purchase_id = ${left.purchaseId}`;
    expect(row?.n).toBe(1);
  });
});
