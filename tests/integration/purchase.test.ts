/**
 * The purchase: `placePurchase`, `0019`'s composite key and deferred total check, and who may read
 * a purchase (spec 010 §14 A-founder-2026-10-22; T-63 service half, T-66 purchase half, T-69;
 * AC-63, AC-66, AC-69; TASK-347).
 *
 * Every case runs on a scratch database of a disposable local Postgres 16 (`support/scratch-db.ts`),
 * never the shared Phase 0 database. The engine runs as `app_web` under `app.role = 'system'`, as
 * `withSystemContext('checkout', …)` runs it. "At commit" is proved two ways: by a real `COMMIT`
 * (`scratch.sql.begin`), and inside a rolled-back case by `SET CONSTRAINTS ALL IMMEDIATE`, which
 * runs the deferred trigger's queued checks at that statement exactly as `COMMIT` would.
 *
 * The migration's own round trip (backfill, rollback with purchases present, up again) is
 * `purchase-migration.test.ts`.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BASKET_MAX_LINES } from "@/config/checkout";
import {
  demoRoute,
  isOrderEngineError,
  type OrderErrorCode,
  place,
  placePurchase,
  type PlaceOrderInput,
  selectAdminOrders,
  selectPartnerOrders,
  transition,
} from "@/modules/orders";

import {
  ORDER_LIST_ITEM_KEYS,
  placeInput,
  registerFixtureEventSchemas,
} from "../fixtures/order-engine.ts";
import {
  country,
  customer,
  partner,
  recipient,
  unique,
} from "./support/rows.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();
registerFixtureEventSchemas();

const db = (tx: Tx) => ({ db: runnerOf(tx) });

let isoCounter = Math.floor(Math.random() * 300);
/** A fresh two-letter code per destination, so committed cases never share florists or zones. */
function nextIso(): string {
  isoCounter += 1;
  const n = isoCounter % 676;
  return String.fromCharCode(65 + Math.floor(n / 26), 65 + (n % 26));
}

interface Destination {
  readonly iso2: string;
  readonly countryId: string;
  readonly cityId: string;
  readonly productId: string;
  /** Covers postcode zone `00-9` (the fixture's 00-950). */
  readonly zonePartner: string;
  /** The country fallback, first by code. */
  readonly countryPartner: string;
}

/** A destination country with a city, a zone, a zone florist and a fallback florist (both demo). */
async function destination(tx: Tx): Promise<Destination> {
  const iso2 = nextIso();
  const countryId = await country(tx, iso2);
  const [city] = await tx<{ id: string }[]>`
    INSERT INTO city (country_id) VALUES (${countryId}) RETURNING id`;
  const cityId = city?.id ?? "";
  await tx`INSERT INTO city_translation (city_id, country_id, locale_code, name, slug)
           VALUES (${cityId}, ${countryId}, 'en', 'Fixture City', ${unique("city-")})`;
  const [zone] = await tx<{ id: string }[]>`
    INSERT INTO postcode_zone (country_id, prefix, city_id)
    VALUES (${countryId}, '00-9', ${cityId}) RETURNING id`;
  const countryPartner = await partner(tx, countryId, "demo");
  const zonePartner = await partner(tx, countryId, "demo");
  await tx`UPDATE fulfillment_partner SET code = ${`zz-${zonePartner}`} WHERE id = ${zonePartner}`;
  await tx`UPDATE fulfillment_partner SET code = ${`aa-${countryPartner}`} WHERE id = ${countryPartner}`;
  await tx`INSERT INTO partner_coverage (partner_id, postcode_zone_id)
           VALUES (${zonePartner}, ${zone?.id ?? ""})`;
  const [product] = await tx<{ id: string }[]>`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES (${unique("SKU-")}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
    RETURNING id`;
  const productId = product?.id ?? "";
  await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
           VALUES (${productId}, 'en', 'Red roses', ${unique("red-roses-")})`;
  return {
    iso2,
    countryId,
    cityId,
    productId,
    zonePartner,
    countryPartner,
  };
}

interface Buyer {
  readonly customerId: string;
}

/**
 * Line `index` (0-based) of a basket: its own destination, recipient, date, postcode and amount.
 * The amount differs per line (19 900 + 1 000 × index, minor units of PLN, the basket currency),
 * so a sum that dropped, doubled or swapped a line could not pass.
 */
async function lineFor(
  tx: Tx,
  buyer: Buyer,
  to: Destination,
  index: number,
  overrides: Partial<PlaceOrderInput> = {},
): Promise<PlaceOrderInput> {
  const total = 19_900 + 1_000 * index;
  const vat = Math.round((total * 800) / 10_800);
  const recipientId = await recipient(tx, buyer.customerId);
  const day = String(10 + index).padStart(2, "0");
  return placeInput(
    {
      countryId: to.countryId,
      customerId: buyer.customerId,
      recipientId,
      productId: to.productId,
      cityId: to.cityId,
    },
    {
      deliveryDate: `2027-03-${day}`,
      buyerTotalMinor: total,
      baseTotalMinor: total,
      vatBreakdown: [
        {
          rateBp: 800,
          netMinor: total - vat,
          vatMinor: vat,
          grossMinor: total,
        },
      ],
      recipientSnapshot: {
        fullName: `Fixture Recipient ${String(index + 1)}`,
        phoneE164: `+4850000000${String(index)}`,
        addressLines: [`ul. Testowa ${String(index + 1)}`],
        postcode: "00-950",
        city: "Fixture City",
        placeKind: "home",
        cardMessage: `Fixture card ${String(index + 1)}`,
      },
      lines: [
        {
          kind: "product",
          productId: to.productId,
          tierKey: "classic",
          qty: 1,
          unitRetailMinor: total - 1_000,
          vatRateBp: 800,
        },
        { kind: "surcharge", qty: 1, unitRetailMinor: 1_000, vatRateBp: 800 },
      ],
      ...overrides,
    },
  );
}

const sumOf = (orders: readonly PlaceOrderInput[]): number =>
  orders.reduce((sum, order) => sum + order.buyerTotalMinor, 0);

/** What the checkout's placement will do per order after `placePurchase` (TASK-205, AC-63). */
async function authoriseAndRoute(tx: Tx, orderId: string): Promise<void> {
  await transition(
    orderId,
    "order.authorised",
    "system:demo_guard",
    { mode: "demo" },
    db(tx),
  );
  await demoRoute(orderId, db(tx));
}

async function refusal(promise: Promise<unknown>): Promise<OrderErrorCode> {
  try {
    await promise;
  } catch (error) {
    if (isOrderEngineError(error)) return error.code;
    throw error;
  }
  throw new Error("expected a refusal, and the call succeeded");
}

async function counts(tx: Tx): Promise<{
  purchases: number;
  orders: number;
  lines: number;
  events: number;
}> {
  const [row] = await tx<
    { purchases: number; orders: number; lines: number; events: number }[]
  >`
    SELECT (SELECT count(*)::int FROM purchase) AS purchases,
           (SELECT count(*)::int FROM "order") AS orders,
           (SELECT count(*)::int FROM order_line) AS lines,
           (SELECT count(*)::int FROM order_event) AS events`;
  return row ?? { purchases: -1, orders: -1, lines: -1, events: -1 };
}

describe.skipIf(server.url === undefined)(
  `the purchase on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "purchase");
    }, 600_000);
    afterAll(async () => {
      await scratch.drop();
    });

    describe("T-63 (service half): placePurchase writes one purchase and N orders, summing to the total", () => {
      for (const n of [1, 2, BASKET_MAX_LINES]) {
        it(`N = ${String(n)}, two destinations: rows, sums, events 1 to 4, one covering demo florist each, no payment or outbox row`, async () => {
          const result = await rolledBack(scratch.sql, async (tx) => {
            const first = await destination(tx);
            const second = await destination(tx);
            const buyer = { customerId: await customer(tx) };
            const inputs: PlaceOrderInput[] = [];
            for (let index = 0; index < n; index += 1) {
              inputs.push(
                await lineFor(
                  tx,
                  buyer,
                  index % 2 === 0 ? first : second,
                  index,
                ),
              );
            }
            const confirmedTotalMinor = sumOf(inputs);
            await asApp(tx, { role: "system" });
            const placed = await placePurchase(
              {
                mode: "demo",
                buyerCurrency: "PLN",
                totalMinor: confirmedTotalMinor,
                localeCode: "en",
                customerId: buyer.customerId,
                orders: inputs,
              },
              db(tx),
            );
            for (const orderId of placed.orderIds) {
              await authoriseAndRoute(tx, orderId);
            }
            // Commit's check, now: the deferred trigger runs every queued row event here.
            await tx`SET CONSTRAINTS ALL IMMEDIATE`;
            await tx.unsafe("RESET ROLE");
            const purchases = await tx<
              {
                id: string;
                mode: string;
                buyer_currency_code: string;
                total_minor: string;
                locale_code: string;
                customer_id: string;
              }[]
            >`SELECT id, mode, buyer_currency_code, total_minor::text, locale_code, customer_id
              FROM purchase`;
            const orders = await tx<
              {
                id: string;
                purchase_id: string;
                destination_country_id: string;
                delivery_date: string;
                buyer_total_minor: string;
                recipient_name: string;
                lines: number;
                events: string;
                partner_id: string | null;
                partner_status: string | null;
                partner_country: string | null;
                assignments: number;
              }[]
            >`
              SELECT o.id, o.purchase_id, o.destination_country_id,
                     o.delivery_date::text AS delivery_date, o.buyer_total_minor::text,
                     o.recipient_snapshot->>'fullName' AS recipient_name,
                     (SELECT count(*)::int FROM order_line l WHERE l.order_id = o.id) AS lines,
                     (SELECT string_agg(e.seq || ':' || e.type, ',' ORDER BY e.seq)
                        FROM order_event e WHERE e.order_id = o.id) AS events,
                     (SELECT a.partner_id FROM order_assignment a WHERE a.order_id = o.id
                        LIMIT 1) AS partner_id,
                     (SELECT p.status FROM order_assignment a
                        JOIN fulfillment_partner p ON p.id = a.partner_id
                        WHERE a.order_id = o.id LIMIT 1) AS partner_status,
                     (SELECT p.country_id FROM order_assignment a
                        JOIN fulfillment_partner p ON p.id = a.partner_id
                        WHERE a.order_id = o.id LIMIT 1) AS partner_country,
                     (SELECT count(*)::int FROM order_assignment a
                        WHERE a.order_id = o.id) AS assignments
              FROM "order" o`;
            const [other] = await tx<{ payments: number; outbox: number }[]>`
              SELECT (SELECT count(*)::int FROM payment) AS payments,
                     (SELECT count(*)::int FROM outbox) AS outbox`;
            return {
              placed,
              purchases,
              orders,
              other,
              inputs,
              confirmedTotalMinor,
              first,
              second,
              customerId: buyer.customerId,
            };
          });
          const byId = new Map(result.orders.map((row) => [row.id, row]));

          expect(result.purchases).toEqual([
            {
              id: result.placed.purchaseId,
              mode: "demo",
              buyer_currency_code: "PLN",
              total_minor: String(result.confirmedTotalMinor),
              locale_code: "en",
              customer_id: result.customerId,
            },
          ]);
          expect(result.placed.orderIds).toHaveLength(n);
          expect(result.orders).toHaveLength(n);
          expect(
            result.orders.reduce(
              (sum, row) => sum + Number(row.buyer_total_minor),
              0,
            ),
          ).toBe(result.confirmedTotalMinor);
          result.placed.orderIds.forEach((orderId, index) => {
            const row = byId.get(orderId);
            const input = result.inputs[index];
            const to = index % 2 === 0 ? result.first : result.second;
            expect(row?.purchase_id, `order ${String(index + 1)}`).toBe(
              result.placed.purchaseId,
            );
            expect(row?.destination_country_id).toBe(to.countryId);
            expect(row?.delivery_date).toBe(input?.deliveryDate);
            expect(row?.buyer_total_minor).toBe(String(input?.buyerTotalMinor));
            expect(row?.recipient_name).toBe(
              `Fixture Recipient ${String(index + 1)}`,
            );
            expect(row?.lines).toBe(2);
            expect(row?.events).toBe(
              "1:order.placed,2:order.authorised,3:order.routed,4:assignment.offered",
            );
            expect(row?.assignments).toBe(1);
            expect(row?.partner_id).toBe(to.zonePartner);
            expect(row?.partner_status).toBe("demo");
            expect(row?.partner_country).toBe(to.countryId);
          });
          expect(result.other).toEqual({ payments: 0, outbox: 0 });
        });
      }

      it("a real COMMIT of a two-line purchase passes the deferred check, and the rows are there afterwards", async () => {
        const purchaseId = randomUUID();
        await scratch.sql.begin(async (tx) => {
          const to = await destination(tx);
          const buyer = { customerId: await customer(tx) };
          const inputs = [
            await lineFor(tx, buyer, to, 0),
            await lineFor(tx, buyer, to, 1),
          ];
          await asApp(tx, { role: "system" });
          await placePurchase(
            {
              mode: "demo",
              buyerCurrency: "PLN",
              totalMinor: sumOf(inputs),
              localeCode: "en",
              customerId: buyer.customerId,
              orders: inputs,
            },
            { ...db(tx), newPurchaseId: () => purchaseId },
          );
        });
        const [row] = await scratch.sql<{ total: string; orders: number }[]>`
          SELECT p.total_minor::text AS total,
                 (SELECT count(*)::int FROM "order" o WHERE o.purchase_id = p.id) AS orders
          FROM purchase p WHERE p.id = ${purchaseId}`;
        expect(row).toEqual({ total: String(19_900 + 20_900), orders: 2 });
      });

      it("refuses before writing anything: a total that is not the sum, mixed currencies, mixed modes, no order, more than BASKET_MAX_LINES, an order carrying its own purchaseId", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const to = await destination(tx);
          const buyer = { customerId: await customer(tx) };
          const a = await lineFor(tx, buyer, to, 0);
          const b = await lineFor(tx, buyer, to, 1);
          const six: PlaceOrderInput[] = [];
          for (let index = 0; index <= BASKET_MAX_LINES; index += 1) {
            six.push(await lineFor(tx, buyer, to, index));
          }
          const base = {
            mode: "demo" as const,
            buyerCurrency: "PLN",
            localeCode: "en",
            customerId: buyer.customerId,
          };
          await asApp(tx, { role: "system" });
          const before = await counts(tx);
          const codes = {
            offByOne: await refusal(
              placePurchase(
                { ...base, totalMinor: sumOf([a, b]) + 1, orders: [a, b] },
                db(tx),
              ),
            ),
            zeroTotal: await refusal(
              placePurchase({ ...base, totalMinor: 0, orders: [a] }, db(tx)),
            ),
            mixedCurrency: await refusal(
              placePurchase(
                {
                  ...base,
                  totalMinor: sumOf([a, b]),
                  orders: [
                    a,
                    {
                      ...b,
                      buyerCurrency: "GBP",
                      baseCurrency: "GBP",
                    },
                  ],
                },
                db(tx),
              ),
            ),
            mixedMode: await refusal(
              placePurchase(
                {
                  ...base,
                  totalMinor: sumOf([a, b]),
                  orders: [a, { ...b, mode: "test" }],
                },
                db(tx),
              ),
            ),
            empty: await refusal(
              placePurchase({ ...base, totalMinor: 1, orders: [] }, db(tx)),
            ),
            overCap: await refusal(
              placePurchase(
                { ...base, totalMinor: sumOf(six), orders: six },
                db(tx),
              ),
            ),
            ownPurchaseId: await refusal(
              placePurchase(
                {
                  ...base,
                  totalMinor: sumOf([a]),
                  orders: [{ ...a, purchaseId: randomUUID() }],
                },
                db(tx),
              ),
            ),
          };
          const after = await counts(tx);
          return { codes, before, after };
        });
        expect(result.codes).toEqual({
          offByOne: "ORDER_INPUT_INVALID",
          zeroTotal: "ORDER_INPUT_INVALID",
          mixedCurrency: "ORDER_INPUT_INVALID",
          mixedMode: "ORDER_INPUT_INVALID",
          empty: "ORDER_INPUT_INVALID",
          overCap: "ORDER_INPUT_INVALID",
          ownPurchaseId: "ORDER_INPUT_INVALID",
        });
        expect(result.after).toEqual(result.before);
      });

      it("a lone place() writes a purchase of that one order, at its total (spec 011's demo control keeps working)", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const to = await destination(tx);
          const buyer = { customerId: await customer(tx) };
          const input = await lineFor(tx, buyer, to, 3);
          await asApp(tx, { role: "system" });
          const { orderId } = await place(input, db(tx));
          await tx`SET CONSTRAINTS ALL IMMEDIATE`;
          const [row] = await tx<
            { total: string; mode: string; currency: string; orders: number }[]
          >`
            SELECT p.total_minor::text AS total, p.mode, p.buyer_currency_code AS currency,
                   (SELECT count(*)::int FROM "order" s WHERE s.purchase_id = p.id) AS orders
            FROM "order" o JOIN purchase p ON p.id = o.purchase_id WHERE o.id = ${orderId}`;
          return row;
        });
        expect(result).toEqual({
          total: "22900",
          mode: "demo",
          currency: "PLN",
          orders: 1,
        });
      });
    });

    describe("T-66 (purchase half): the composite key and the deferred total check", () => {
      it("an order naming a purchase of another currency, or of another mode, raises the foreign-key error", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const to = await destination(tx);
          const buyer = { customerId: await customer(tx) };
          const input = await lineFor(tx, buyer, to, 0);
          await asApp(tx, { role: "system" });
          const purchaseOf = async (mode: string, currency: string) => {
            const [row] = await tx<{ id: string }[]>`
              INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code)
              VALUES (${mode}, ${currency}, ${input.buyerTotalMinor}, 'en') RETURNING id`;
            return row?.id ?? "";
          };
          const gbp = await purchaseOf("demo", "GBP");
          const live = await purchaseOf("live", "PLN");
          const same = await purchaseOf("demo", "PLN");
          const viaPlace = await pgFailure(tx, (sp) =>
            place({ ...input, purchaseId: gbp }, db(sp)),
          );
          const otherMode = await pgFailure(tx, (sp) =>
            place({ ...input, purchaseId: live }, db(sp)),
          );
          // A raw insert, with the engine's switch, on the same key.
          const raw = await pgFailure(tx, async (sp) => {
            await sp`SELECT set_config('app.allow_status_write', 'on', true)`;
            await sp`
              INSERT INTO "order" (public_token, mode, customer_id, recipient_id,
                                   destination_country_id, delivery_date, buyer_currency_code,
                                   buyer_total_minor, base_currency_code, base_total_minor,
                                   buyer_snapshot, recipient_snapshot, purchase_id)
              VALUES (${"p".repeat(22)}, 'demo', ${buyer.customerId}, ${input.recipientId},
                      ${to.countryId}, DATE '2027-03-10', 'PLN', ${input.buyerTotalMinor},
                      'PLN', ${input.buyerTotalMinor}, '{}'::jsonb, '{}'::jsonb, ${gbp})`;
          });
          // The control: the same input against a purchase of its own currency and mode places.
          const { orderId } = await place(
            { ...input, purchaseId: same },
            db(tx),
          );
          return { viaPlace, otherMode, raw, orderId };
        });
        for (const failure of [result.viaPlace, result.otherMode, result.raw]) {
          expect(failure.code).toBe("23503");
          expect(failure.constraint).toBe(
            "order_purchase_id_buyer_currency_code_mode_purchase_fk",
          );
        }
        expect(result.orderId).toMatch(/^[0-9a-f-]{36}$/);
      });

      it("a purchase whose orders do not sum is refused at COMMIT, not at insert; nothing is kept", async () => {
        const purchaseId = randomUUID();
        let insertedWithoutError = false;
        const outcome = await scratch.sql
          .begin(async (tx) => {
            const to = await destination(tx);
            const buyer = { customerId: await customer(tx) };
            const input = await lineFor(tx, buyer, to, 0);
            await asApp(tx, { role: "system" });
            await tx`
              INSERT INTO purchase (id, mode, buyer_currency_code, total_minor, locale_code)
              VALUES (${purchaseId}, 'demo', 'PLN', ${input.buyerTotalMinor + 1}, 'en')`;
            await place({ ...input, purchaseId }, db(tx));
            insertedWithoutError = true;
          })
          .then(
            () => "committed",
            (error: unknown) => (error as Error).message,
          );
        expect(insertedWithoutError).toBe(true);
        expect(outcome).toMatch(/^PURCHASE_TOTAL_MISMATCH:/);
        const [left] = await scratch.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM purchase WHERE id = ${purchaseId}`;
        expect(left?.n).toBe(0);
      });

      it("a purchase with no order is refused at COMMIT", async () => {
        const purchaseId = randomUUID();
        const outcome = await scratch.sql
          .begin(async (tx) => {
            await tx`INSERT INTO locale (code, bcp47, name) VALUES ('en', 'en', 'English')
                     ON CONFLICT DO NOTHING`;
            await tx`INSERT INTO currency (code, minor_unit_exponent) VALUES ('PLN', 2)
                     ON CONFLICT DO NOTHING`;
            await asApp(tx, { role: "system" });
            await tx`
              INSERT INTO purchase (id, mode, buyer_currency_code, total_minor, locale_code)
              VALUES (${purchaseId}, 'demo', 'PLN', 0, 'en')`;
          })
          .then(
            () => "committed",
            (error: unknown) => (error as Error).message,
          );
        expect(outcome).toMatch(/^PURCHASE_TOTAL_MISMATCH:/);
      });

      it("after a valid commit, changing an order's total, moving it to another purchase, or changing the purchase total is refused at COMMIT", async () => {
        const ids = { first: randomUUID(), second: randomUUID() };
        await scratch.sql.begin(async (tx) => {
          const to = await destination(tx);
          const buyer = { customerId: await customer(tx) };
          const one = [await lineFor(tx, buyer, to, 0)];
          const two = [
            await lineFor(tx, buyer, to, 1),
            await lineFor(tx, buyer, to, 2),
          ];
          await asApp(tx, { role: "system" });
          for (const [id, orders] of [
            [ids.first, one],
            [ids.second, two],
          ] as const) {
            await placePurchase(
              {
                mode: "demo",
                buyerCurrency: "PLN",
                totalMinor: sumOf(orders),
                localeCode: "en",
                customerId: buyer.customerId,
                orders,
              },
              { ...db(tx), newPurchaseId: () => id },
            );
          }
        });
        const attempt = (fn: (tx: Tx) => Promise<unknown>) =>
          scratch.sql
            .begin(async (tx) => {
              await fn(tx);
            })
            .then(
              () => "committed",
              (error: unknown) => (error as Error).message,
            );
        const orderTotal = await attempt(
          (tx) =>
            tx`UPDATE "order" SET buyer_total_minor = buyer_total_minor + 1
               WHERE purchase_id = ${ids.first}`,
        );
        // Moving line 2 of the second purchase into the first: both sums break.
        const moved = await attempt(
          (tx) => tx`
            UPDATE "order" SET purchase_id = ${ids.first}
            WHERE id = (SELECT id FROM "order" WHERE purchase_id = ${ids.second}
                        ORDER BY buyer_total_minor DESC LIMIT 1)`,
        );
        const purchaseTotal = await attempt(
          (tx) =>
            tx`UPDATE purchase SET total_minor = total_minor - 1 WHERE id = ${ids.second}`,
        );
        // The control: an update that keeps the sum commits.
        const harmless = await attempt(
          (tx) =>
            tx`UPDATE purchase SET total_minor = total_minor WHERE id = ${ids.second}`,
        );
        expect(orderTotal).toMatch(/^PURCHASE_TOTAL_MISMATCH:/);
        expect(moved).toMatch(/^PURCHASE_TOTAL_MISMATCH:/);
        expect(purchaseTotal).toMatch(/^PURCHASE_TOTAL_MISMATCH:/);
        expect(harmless).toBe("committed");
      });

      it("concurrent placements of two purchases each commit with their own sums (no cross-talk in the deferred check)", async () => {
        const setup = await scratch.sql.begin(async (tx) => {
          const to = await destination(tx);
          const buyer = { customerId: await customer(tx) };
          return {
            first: [
              await lineFor(tx, buyer, to, 0),
              await lineFor(tx, buyer, to, 1),
            ],
            second: [await lineFor(tx, buyer, to, 2)],
            customerId: buyer.customerId,
          };
        });
        const run = (orders: readonly PlaceOrderInput[]) =>
          scratch.sql.begin(async (tx) => {
            await asApp(tx, { role: "system" });
            return placePurchase(
              {
                mode: "demo",
                buyerCurrency: "PLN",
                totalMinor: sumOf(orders),
                localeCode: "en",
                customerId: setup.customerId,
                orders: [...orders],
              },
              db(tx),
            );
          });
        const [a, b] = await Promise.all([run(setup.first), run(setup.second)]);
        const rows = await scratch.sql<
          { id: string; total: string; n: number }[]
        >`
          SELECT p.id, p.total_minor::text AS total,
                 (SELECT count(*)::int FROM "order" o WHERE o.purchase_id = p.id) AS n
          FROM purchase p WHERE p.id IN ${scratch.sql([a.purchaseId, b.purchaseId])}
          ORDER BY n DESC`;
        expect(rows).toEqual([
          { id: a.purchaseId, total: String(19_900 + 20_900), n: 2 },
          { id: b.purchaseId, total: "21900", n: 1 },
        ]);
      });
    });

    describe("T-69: a florist sees its own order only; the purchase is system's and admin's", () => {
      it("two lines in one country, two florists: the partner list holds line 1 only and no purchaseId; admin items carry it; partner, customer and public SELECT on purchase return 0 rows; admin cannot write one", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const to = await destination(tx);
          const buyer = { customerId: await customer(tx) };
          const lineOne = await lineFor(tx, buyer, to, 0);
          // Line 2 outside the zone, so the country fallback florist gets it.
          const lineTwo = await lineFor(tx, buyer, to, 1, {
            destinationPostcode: "99-999",
          });
          await asApp(tx, { role: "system" });
          const placed = await placePurchase(
            {
              mode: "demo",
              buyerCurrency: "PLN",
              totalMinor: sumOf([lineOne, lineTwo]),
              localeCode: "en",
              customerId: buyer.customerId,
              orders: [lineOne, lineTwo],
            },
            db(tx),
          );
          for (const orderId of placed.orderIds) {
            await authoriseAndRoute(tx, orderId);
          }
          await tx`SET CONSTRAINTS ALL IMMEDIATE`;
          await tx.unsafe("RESET ROLE");
          const [assigned] = await tx<{ partner_id: string }[]>`
            SELECT partner_id FROM order_assignment WHERE order_id = ${placed.orderIds[0] ?? ""}`;
          const florist = assigned?.partner_id ?? "";

          const inContext = async <T>(
            context: Parameters<typeof asApp>[1],
            fn: (sp: Tx) => Promise<T>,
          ): Promise<T> => {
            let out: T | undefined;
            await tx
              .savepoint(async (sp) => {
                await asApp(sp, context);
                out = await fn(sp);
                throw new Error("undo");
              })
              .catch((error: unknown) => {
                if ((error as Error).message !== "undo") throw error;
              });
            return out as T;
          };
          const purchaseRows = (sp: Tx) =>
            sp<{ n: number }[]>`SELECT count(*)::int AS n FROM purchase`.then(
              (rows) => rows[0]?.n ?? -1,
            );

          const partnerItems = await inContext(
            { role: "partner", partnerIds: [florist] },
            (sp) => selectPartnerOrders(runnerOf(sp)),
          );
          const partnerPurchase = await inContext(
            { role: "partner", partnerIds: [florist] },
            purchaseRows,
          );
          const customerPurchase = await inContext(
            { role: "customer", userId: randomUUID() },
            purchaseRows,
          );
          const publicPurchase = await inContext(
            { role: "public" },
            purchaseRows,
          );
          const adminItems = await inContext({ role: "admin" }, (sp) =>
            selectAdminOrders(runnerOf(sp)),
          );
          const adminPurchase = await inContext({ role: "admin" }, (sp) =>
            sp<{ id: string }[]>`SELECT id FROM purchase`.then((rows) =>
              rows.map((row) => row.id),
            ),
          );
          const adminWrite = await inContext({ role: "admin" }, (sp) =>
            pgFailure(
              sp,
              (inner) =>
                inner`INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code)
                      VALUES ('demo', 'PLN', 1, 'en')`,
            ),
          );
          return {
            placed,
            florist,
            partnerItems,
            partnerPurchase,
            customerPurchase,
            publicPurchase,
            adminItems,
            adminPurchase,
            adminWrite,
          };
        });
        const [lineOneId, lineTwoId] = result.placed.orderIds;
        expect(result.partnerItems.map((item) => item.orderId)).toEqual([
          lineOneId,
        ]);
        for (const item of result.partnerItems) {
          expect(Object.keys(item).sort()).toEqual(ORDER_LIST_ITEM_KEYS);
          expect(JSON.stringify(item)).not.toContain(result.placed.purchaseId);
          expect(JSON.stringify(item)).not.toContain(lineTwoId ?? "?");
        }
        expect(result.partnerPurchase).toBe(0);
        expect(result.customerPurchase).toBe(0);
        expect(result.publicPurchase).toBe(0);
        expect(result.adminPurchase).toContain(result.placed.purchaseId);
        expect(
          result.adminItems
            .filter(
              (item) =>
                item.orderId === lineOneId || item.orderId === lineTwoId,
            )
            .map((item) => item.purchaseId),
        ).toEqual([result.placed.purchaseId, result.placed.purchaseId]);
        expect(result.adminWrite.code).toBe("42501");
      });
    });
  },
);
