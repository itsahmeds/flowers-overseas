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

import { country, partner } from "./support/rows.ts";
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
