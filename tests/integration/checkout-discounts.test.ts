/**
 * Discount codes at checkout against a migrated PG16 (spec 047 §2 "Codes, entered at checkout",
 * §5.2 `applyDiscountAction`, `removeDiscountAction`, the placement re-check; §10 T-07, T-08, T-09,
 * T-12, T-13, T-14, T-17 integration half; AC-7, AC-8, AC-9, AC-12, AC-13, AC-14, AC-17 placed-order
 * half; TASK-447).
 *
 * Each case starts a basket through the real start route and step runners (as
 * `checkout-place.test.ts` does), creates its codes as the superuser, then applies, removes and
 * places through `runApplyDiscount`, `runRemoveDiscount`, `checkoutScreen` and `runPlaceOrder`,
 * inside a transaction that is rolled back. The flags and the clock are injected.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import { CHECKOUT_SAMPLES } from "../../src/config/checkout-samples.ts";
import {
  listProducts,
  listTiers,
  priceProjection,
  VatLineSchema,
  vatBreakdown,
} from "@/modules/catalog";
import {
  type CheckoutFlagReader,
  type DiscountFlagReader,
  type DraftConnection,
  type StepOutcome,
  type StepScreen,
  checkoutScreen,
  draftTokenFromCookieHeader,
  loadDraft,
  nextDeliveryDate,
  runApplyDiscount,
  runBuyerStep,
  runCardStep,
  runPlaceOrder,
  runRecipientStep,
  runRemoveDiscount,
  startCheckout,
} from "@/modules/checkout";
import { discountAmount, lookupTypedCode } from "@/modules/discounts";

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
const CODES_ON: DiscountFlagReader = () => Promise.resolve(true);
const CODES_OFF: DiscountFlagReader = () => Promise.resolve(false);
const SAMPLE = CHECKOUT_SAMPLES.PL;
const DELIVERY_DATE =
  nextDeliveryDate("PL", new Date(T0.getTime() + 3 * DAY * 60_000)) ?? "";

let db: ScratchDatabase | undefined;

beforeAll(async () => {
  if (server.url !== undefined) {
    db = await scratchDatabase(server.url, "checkout_discounts");
  }
}, 180_000);

afterAll(async () => {
  await db?.drop();
});

async function seeded(tx: Tx): Promise<DraftConnection> {
  const plId = await country(tx, "PL");
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
  if ((florists?.n ?? 0) === 0) await partner(tx, plId, "demo");
  await asApp(tx, { role: "system" });
  return { executor: runnerOf(tx) };
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

async function add(
  connection: DraftConnection,
  sku: string,
  tierKey: string,
  token: string | null = null,
): Promise<string> {
  const display = (
    await priceProjection("pl", {
      productId: sku,
      tierKey,
      countryIso: "PL",
      now: T0,
    })
  ).displayPrice;
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
    response.headers.getSetCookie().find((c) => c.startsWith("fo_checkout=")),
  );
  if (started === null)
    throw new Error(`no basket: ${String(response.status)}`);
  return started;
}

function ctx(
  connection: DraftConnection,
  token: string,
  minutes = 1,
  discountFlag: DiscountFlagReader = CODES_ON,
) {
  return {
    locale: "pl",
    token,
    connection,
    flags: OPEN,
    discountFlag,
    now: () => at(minutes),
  };
}

function location(outcome: StepOutcome): string {
  if (outcome.kind !== "redirect") {
    throw new Error(`expected a redirect, got ${JSON.stringify(outcome)}`);
  }
  return outcome.location;
}

async function fill(connection: DraftConnection, token: string, lines: number) {
  for (let line = 1; line <= lines; line += 1) {
    location(
      await runRecipientStep(
        ctx(connection, token),
        form({
          line: String(line),
          ...SAMPLE.recipient.fields,
          fullName: `Anna Przykładowa ${String(line)}`,
          placeKind: SAMPLE.recipient.placeKind,
          deliveryNote: "",
          deliveryDate: DELIVERY_DATE,
        }),
      ),
    );
  }
  for (let line = 1; line <= lines; line += 1) {
    location(
      await runCardStep(
        ctx(connection, token),
        form({ line: String(line), cardMessage: "Sto lat", signAs: "Sam" }),
      ),
    );
  }
  location(
    await runBuyerStep(
      ctx(connection, token),
      form({
        email: SAMPLE.buyer.email,
        buyerName: SAMPLE.buyer.buyerName,
        buyerPhone: "",
        residenceCountry: SAMPLE.buyer.residenceCountry,
      }),
    ),
  );
}

/** A basket of `lines` deliveries, filled to step 4. */
async function basket(
  connection: DraftConnection,
  lines: number,
): Promise<string> {
  let token = await add(connection, PRODUCT?.sku ?? "", TIER?.tierKey ?? "");
  for (let line = 2; line <= lines; line += 1) {
    token = await add(
      connection,
      SECOND?.sku ?? "",
      SECOND_TIER?.tierKey ?? "",
      token,
    );
  }
  await fill(connection, token, lines);
  return token;
}

/** A code, made as the superuser (the admin path is TASK-446's). */
async function makeCode(
  tx: Tx,
  fields: {
    readonly text: string;
    readonly kind?: "percent" | "fixed";
    readonly percentBp?: number;
    readonly currencies?: readonly {
      currency: string;
      amountOff: number | null;
      min: number;
    }[];
    readonly maxRedemptions?: number;
  },
): Promise<string> {
  await tx.unsafe("RESET ROLE");
  const kind = fields.kind ?? "percent";
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO discount_code (code, code_normalised, campaign_label, kind, percent_bp, starts_at,
                               max_redemptions, max_per_email)
    VALUES (${fields.text}, ${fields.text}, 'Fixture campaign', ${kind},
            ${kind === "percent" ? (fields.percentBp ?? 1000) : null},
            ${at(-DAY).toISOString()}::timestamptz, ${fields.maxRedemptions ?? null}, 1)
    RETURNING id`;
  for (const entry of fields.currencies ?? []) {
    await tx`
      INSERT INTO discount_code_currency (discount_code_id, currency_code, amount_off_minor,
                                          min_order_minor)
      VALUES (${row?.id ?? ""}, ${entry.currency}, ${entry.amountOff}, ${entry.min})`;
  }
  await asApp(tx, { role: "system" });
  return row?.id ?? "";
}

async function screenOf(
  connection: DraftConnection,
  token: string,
  minutes = 2,
  discountFlag: DiscountFlagReader = CODES_ON,
): Promise<StepScreen> {
  const screen = await checkoutScreen({
    locale: "pl",
    token,
    step: "review",
    connection,
    flags: OPEN,
    discountFlag,
    now: () => at(minutes),
  });
  if (screen.kind !== "step") throw new Error(`screen ${screen.kind}`);
  return screen;
}

async function draftCode(connection: DraftConnection, token: string) {
  const lookup = await loadDraft(token, at(2), connection);
  if (lookup.status !== "active") throw new Error(lookup.status);
  return lookup.draft.discountCodeId;
}

/** Rows of the tables placement writes, as the superuser sees them. */
async function counts(tx: Tx): Promise<Record<string, number>> {
  await tx.unsafe("RESET ROLE");
  const [row] = await tx<Record<string, number>[]>`
    SELECT (SELECT count(*)::int FROM purchase) AS purchase,
           (SELECT count(*)::int FROM "order") AS orders,
           (SELECT count(*)::int FROM order_line) AS order_lines,
           (SELECT count(*)::int FROM order_event) AS events,
           (SELECT count(*)::int FROM outbox) AS outbox,
           (SELECT count(*)::int FROM payment) AS payments,
           (SELECT count(*)::int FROM order_discount) AS order_discounts`;
  await asApp(tx, { role: "system" });
  return row ?? {};
}

const describeDb = server.url === undefined ? describe.skip : describe;

describeDb(`discount codes at checkout (${server.reason})`, () => {
  const sql = (): Sql => {
    if (db === undefined) throw new Error("no scratch database");
    return db.sql;
  };

  it("AC-7, T-07: flag off, no control and the action refuses with nothing changed; on, the closed control", async () => {
    await rolledBack(sql(), async (tx) => {
      const connection = await seeded(tx);
      const token = await basket(connection, 1);
      await makeCode(tx, { text: "POLONIA10" });

      const off = await screenOf(connection, token, 2, CODES_OFF);
      expect(off.discountControl).toBeNull();
      const before = await draftCode(connection, token);
      expect(
        await runApplyDiscount(
          ctx(connection, token, 2, CODES_OFF),
          form({ code: "POLONIA10" }),
        ),
      ).toEqual({ kind: "closed" });
      expect(await draftCode(connection, token)).toBe(before);
      expect(before).toBeNull();

      const on = await screenOf(connection, token);
      expect(on.discountControl).toEqual({ lockedMinutes: null });
      expect(on.discount).toBeNull();
    });
  });

  it("AC-8, AC-17, T-08, T-17: a 10 % code on two deliveries, every total one integer, then placed rows hold the invariants", async () => {
    await rolledBack(sql(), async (tx) => {
      const connection = await seeded(tx);
      const token = await basket(connection, 2);
      await makeCode(tx, { text: "POLONIA10", percentBp: 1000 });
      const plain = await screenOf(connection, token);
      const subtotal = plain.total;
      if (subtotal === null) throw new Error("no total");

      const applied = await runApplyDiscount(
        ctx(connection, token, 2),
        form({ code: " polonia-10 " }),
      );
      const amount = discountAmount(
        { kind: "percent", percentBp: 1000, currencies: [] },
        { amountMinor: subtotal.amountMinor, currency: subtotal.currency },
      ).amountMinor;
      expect(applied).toEqual({
        kind: "notice",
        notice: {
          kind: "applied",
          code: "POLONIA10",
          amount: { amountMinor: amount, currency: subtotal.currency },
        },
      });

      const screen = await screenOf(connection, token);
      expect(screen.discount?.amount.amountMinor).toBe(amount);
      expect(screen.total?.amountMinor).toBe(subtotal.amountMinor - amount);
      expect(screen.discount?.subtotal.amountMinor).toBe(subtotal.amountMinor);
      const paid = screen.discount?.allocation ?? [];
      expect(paid.reduce((sum, line) => sum + line.shareMinor, 0)).toBe(amount);
      expect(screen.discount?.vat).toEqual(
        vatBreakdown(
          paid.map((line) =>
            VatLineSchema.parse({
              rateBp: line.vatRateBp,
              grossMinor: line.paidMinor,
              currency: line.currency,
            }),
          ),
        ),
      );
      expect(
        screen.discount?.vat.reduce((sum, split) => sum + split.grossMinor, 0),
      ).toBe(subtotal.amountMinor - amount);

      const outcome = await runPlaceOrder(
        ctx(connection, token, 3),
        form({
          seenTotalMinor: String(subtotal.amountMinor - amount),
          seenCurrency: subtotal.currency,
        }),
      );
      expect(location(outcome)).toBe("/pl/checkout/done");

      await tx.unsafe("RESET ROLE");
      const orders = await tx<
        {
          id: string;
          buyer_total_minor: string;
          vat_breakdown: { grossMinor: number }[];
          lines_minor: string;
          shares_minor: string;
          od_amount: string | null;
          od_code: string | null;
          od_mode: string | null;
          purchase_total: string;
        }[]
      >`
        SELECT o.id, o.buyer_total_minor::text, o.vat_breakdown,
               (SELECT sum(unit_retail_minor * qty) FROM order_line WHERE order_id = o.id)::text AS lines_minor,
               (SELECT sum(discount_minor) FROM order_line WHERE order_id = o.id)::text AS shares_minor,
               od.amount_minor::text AS od_amount, od.code_snapshot AS od_code, od.mode AS od_mode,
               p.total_minor::text AS purchase_total
          FROM "order" o
          JOIN purchase p ON p.id = o.purchase_id
          LEFT JOIN order_discount od ON od.order_id = o.id`;
      expect(orders).toHaveLength(2);
      let discounted = 0;
      for (const order of orders) {
        const share = Number(order.od_amount ?? 0);
        discounted += share;
        expect(order.od_code).toBe("POLONIA10");
        expect(order.od_mode).toBe("demo");
        expect(Number(order.shares_minor)).toBe(share);
        expect(Number(order.buyer_total_minor)).toBe(
          Number(order.lines_minor) - share,
        );
        expect(
          order.vat_breakdown.reduce((sum, split) => sum + split.grossMinor, 0),
        ).toBe(Number(order.buyer_total_minor));
        expect(Number(order.purchase_total)).toBe(
          subtotal.amountMinor - amount,
        );
      }
      expect(discounted).toBe(amount);
      const [event] = await tx<{ payload: Record<string, unknown> }[]>`
        SELECT payload FROM order_event WHERE type = 'order.placed' LIMIT 1`;
      expect(JSON.stringify(event?.payload)).not.toContain("POLONIA10");
    });
  });

  it("AC-9, T-09: a fixed code with GBP and EUR amounts refuses a PLN basket with wrongCurrency", async () => {
    await rolledBack(sql(), async (tx) => {
      const connection = await seeded(tx);
      const token = await basket(connection, 1);
      await makeCode(tx, {
        text: "FIXEDFIVE",
        kind: "fixed",
        currencies: [
          { currency: "GBP", amountOff: 500, min: 1000 },
          { currency: "EUR", amountOff: 600, min: 1200 },
        ],
      });
      const outcome = await runApplyDiscount(
        ctx(connection, token, 2),
        form({ code: "FIXEDFIVE" }),
      );
      expect(outcome).toEqual({
        kind: "notice",
        notice: {
          kind: "refused",
          value: "FIXEDFIVE",
          refusal: { reason: "wrong_currency", currency: "PLN" },
        },
      });
      expect(await draftCode(connection, token)).toBeNull();
    });
  });

  it("AC-12, T-12: a second code replaces the first, Remove restores the undiscounted total", async () => {
    await rolledBack(sql(), async (tx) => {
      const connection = await seeded(tx);
      const token = await basket(connection, 1);
      const first = await makeCode(tx, { text: "POLONIA10", percentBp: 1000 });
      const second = await makeCode(tx, { text: "WELCOME15", percentBp: 1500 });
      const plain = await screenOf(connection, token);

      await runApplyDiscount(
        ctx(connection, token, 2),
        form({ code: "POLONIA10" }),
      );
      expect(await draftCode(connection, token)).toBe(first);
      expect(
        await runApplyDiscount(
          ctx(connection, token, 2),
          form({ code: "WELCOME15" }),
        ),
      ).toEqual({
        kind: "notice",
        notice: { kind: "replaced", previous: "POLONIA10", code: "WELCOME15" },
      });
      expect(await draftCode(connection, token)).toBe(second);
      expect((await screenOf(connection, token)).discount?.code).toBe(
        "WELCOME15",
      );

      expect(await runRemoveDiscount(ctx(connection, token, 2))).toEqual({
        kind: "notice",
        notice: { kind: "removed" },
      });
      expect(await draftCode(connection, token)).toBeNull();
      const after = await screenOf(connection, token);
      expect(after.discount).toBeNull();
      expect(after.total).toEqual(plain.total);
    });
  });

  it("AC-13, T-13: five failures lock the field, the sixth makes no lookup; it opens after 15 minutes", async () => {
    await rolledBack(sql(), async (tx) => {
      const connection = await seeded(tx);
      const token = await basket(connection, 1);
      const lookup = vi.fn(lookupTypedCode);
      const attempt = (code: string, minutes: number) =>
        runApplyDiscount(
          { ...ctx(connection, token, minutes), lookup },
          form({ code }),
        );

      for (let n = 1; n <= 5; n += 1) {
        const outcome = await attempt(`NOSUCH${String(n)}X`, 2 + n * 0.1);
        expect(outcome.kind === "notice" && outcome.notice.kind).toBe(
          "refused",
        );
      }
      expect(lookup).toHaveBeenCalledTimes(5);
      const sixth = await attempt("POLONIA10", 3);
      expect(sixth).toEqual({
        kind: "notice",
        notice: {
          kind: "refused",
          value: "POLONIA10",
          refusal: { reason: "locked", minutes: 15 },
        },
      });
      expect(lookup).toHaveBeenCalledTimes(5);
      expect((await screenOf(connection, token, 3)).discountControl).toEqual({
        lockedMinutes: 15,
      });

      const later = await attempt("NOSUCHAGAIN", 2.5 + 15);
      expect(later.kind === "notice" && later.notice.kind).toBe("refused");
      expect(
        later.kind === "notice" &&
          later.notice.kind === "refused" &&
          later.notice.refusal.reason,
      ).toBe("unknown");
      expect(lookup).toHaveBeenCalledTimes(6);
    });
  });

  it("AC-14, T-14: a code disabled between apply and place writes nothing, names both totals, and the second press places", async () => {
    await rolledBack(sql(), async (tx) => {
      const connection = await seeded(tx);
      const token = await basket(connection, 1);
      const id = await makeCode(tx, { text: "POLONIA10", percentBp: 1000 });
      const plain = (await screenOf(connection, token)).total;
      await runApplyDiscount(
        ctx(connection, token, 2),
        form({ code: "POLONIA10" }),
      );
      const discounted = (await screenOf(connection, token)).total;
      if (plain === null || discounted === null) throw new Error("no total");
      expect(discounted.amountMinor).toBeLessThan(plain.amountMinor);

      await tx.unsafe("RESET ROLE");
      await tx`UPDATE discount_code SET status = 'disabled' WHERE id = ${id}`;
      await asApp(tx, { role: "system" });
      const before = await counts(tx);

      const refused = await runPlaceOrder(
        ctx(connection, token, 3),
        form({
          seenTotalMinor: String(discounted.amountMinor),
          seenCurrency: discounted.currency,
        }),
      );
      expect(refused).toEqual({
        kind: "render",
        state: {
          status: "discount_changed",
          code: "POLONIA10",
          old: {
            amountMinor: discounted.amountMinor,
            currency: discounted.currency,
          },
          new: plain,
        },
      });
      expect(await counts(tx)).toEqual(before);
      expect(before.order_discounts).toBe(0);
      expect(await draftCode(connection, token)).toBeNull();

      const placed = await runPlaceOrder(
        ctx(connection, token, 4),
        form({
          seenTotalMinor: String(plain.amountMinor),
          seenCurrency: plain.currency,
        }),
      );
      expect(location(placed)).toBe("/pl/checkout/done");
      const after = await counts(tx);
      expect(after.orders).toBe((before.orders ?? 0) + 1);
      expect(after.order_discounts).toBe(0);
      await tx.unsafe("RESET ROLE");
      const [order] = await tx<{ buyer_total_minor: string }[]>`
        SELECT buyer_total_minor::text FROM "order"`;
      expect(Number(order?.buyer_total_minor)).toBe(plain.amountMinor);
    });
  });
});
