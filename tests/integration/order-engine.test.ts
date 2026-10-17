/**
 * The shared order engine against a migrated PG16 (spec 010 §10 T-20 service half, T-22, T-23,
 * T-25, T-41 … T-44 integration halves; AC-20, AC-22 … AC-25, AC-41 … AC-44; TASK-202).
 *
 * Every case runs on a scratch database of a disposable local Postgres 16
 * (`support/scratch-db.ts`); never the shared Phase 0 database. States are reached through
 * `walkOrderTo` (spec 002 A6.7 (b)); no trigger is switched off. The engine runs inside the
 * test's transaction through a Drizzle handle on it, exactly as the checkout hands it one.
 */
import { loadavg } from "node:os";

import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ACTOR_CLASSES,
  appendEvent,
  demoRoute,
  isOrderEngineError,
  type OrderExecutor,
  type OrderErrorCode,
  place,
  selectAdminOrders,
  selectPartnerOrders,
  transition,
  type OutboxTargetResolver,
} from "@/modules/orders";
import { createRecipient, upsertGuestCustomer } from "@/modules/customers";

import {
  ACTOR_OF,
  CONTACT_KEY_FRAGMENTS,
  ORDER_LIST_ITEM_KEYS,
  payloadFor,
  placeInput,
  registerFixtureEventSchemas,
  type PlaceParents,
} from "../fixtures/order-engine.ts";
import {
  STATUS_PRESERVING_EVENTS,
  TRANSITION_EVENTS,
  TRANSITIONS,
} from "../fixtures/order-machine.ts";
import { walkOrderTo } from "../fixtures/order-state.ts";
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
import { runnerOf, sqlText } from "./support/sql-runner.ts";

const server = await probeLocalServer();
registerFixtureEventSchemas();

const db = (tx: Tx) => ({ db: runnerOf(tx) });

/** An executor over `tx` that throws straight after the statement matching `after` ran. */
function failingAfter(tx: Tx, after: RegExp): OrderExecutor {
  const handle = runnerOf(tx);
  return {
    async execute(query: SQL) {
      const rows = await handle.execute(query);
      if (after.test(sqlText(query))) {
        throw new Error("injected failure");
      }
      return rows;
    },
  };
}

/** Runs `fn` in a savepoint that is always rolled back, and returns its result. */
async function undone<T>(tx: Tx, fn: (sp: Tx) => Promise<T>): Promise<T> {
  const marker = new Error("undo");
  let result: T | undefined;
  try {
    await tx.savepoint(async (sp) => {
      result = await fn(sp);
      throw marker;
    });
  } catch (error) {
    if (error !== marker) throw error;
  }
  return result as T;
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

async function settings(tx: Tx): Promise<[string, string]> {
  const [row] = await tx<{ allow: string; event: string }[]>`
    SELECT coalesce(current_setting('app.allow_status_write', true), '') AS allow,
           coalesce(current_setting('app.transition_event', true), '') AS event`;
  return [row?.allow ?? "?", row?.event ?? "?"];
}

interface Snapshot {
  readonly status: string | undefined;
  readonly events: number;
  readonly outbox: number;
  readonly orders: number;
  readonly lines: number;
}

async function snapshot(tx: Tx, orderId?: string): Promise<Snapshot> {
  const [row] = await tx<
    {
      status: string | null;
      events: number;
      outbox: number;
      orders: number;
      lines: number;
    }[]
  >`
    SELECT (SELECT status FROM "order" WHERE id = ${orderId ?? null}) AS status,
           (SELECT count(*)::int FROM order_event) AS events,
           (SELECT count(*)::int FROM outbox) AS outbox,
           (SELECT count(*)::int FROM "order") AS orders,
           (SELECT count(*)::int FROM order_line) AS lines`;
  return {
    status: row?.status ?? undefined,
    events: row?.events ?? -1,
    outbox: row?.outbox ?? -1,
    orders: row?.orders ?? -1,
    lines: row?.lines ?? -1,
  };
}

interface World extends PlaceParents {
  readonly iso2: string;
  readonly cityId: string;
  readonly zonePartner: string;
  readonly countryPartner: string;
  readonly activePartner: string;
}

/**
 * A fresh two-letter country code per world, so worlds committed by one case (the injected
 * failure, the pinned connection, the p95 runs) never share florists, zones or orders with
 * another case's world.
 */
let isoCounter = Math.floor(Math.random() * 400);
function nextIso(): string {
  isoCounter += 1;
  const n = isoCounter % 676;
  return String.fromCharCode(65 + Math.floor(n / 26), 65 + (n % 26));
}

/** A country with a city, a postcode zone, two demo florists (one covering the zone) and an active one. */
async function world(tx: Tx): Promise<World> {
  const iso2 = nextIso();
  const countryId = await country(tx, iso2);
  const [city] = await tx<{ id: string }[]>`
    INSERT INTO city (country_id) VALUES (${countryId}) RETURNING id`;
  const cityId = city?.id ?? "";
  await tx`INSERT INTO city_translation (city_id, country_id, locale_code, name, slug)
           VALUES (${cityId}, ${countryId}, 'en', 'Warsaw', ${unique("warsaw-")}),
                  (${cityId}, ${countryId}, 'pl', 'Warszawa', ${unique("warszawa-")})`;
  // The fixture's postcode is 00-950.
  const [zone] = await tx<{ id: string }[]>`
    INSERT INTO postcode_zone (country_id, prefix, city_id)
    VALUES (${countryId}, '00-9', ${cityId}) RETURNING id`;
  // `partner()` codes are random; these prefixes make the zone florist sort last on purpose, so
  // the country fallback and the zone rule pick different florists.
  const countryPartner = await partner(tx, countryId, "demo");
  const zonePartner = await partner(tx, countryId, "demo");
  await tx`UPDATE fulfillment_partner SET code = ${`zz-${zonePartner}`} WHERE id = ${zonePartner}`;
  await tx`UPDATE fulfillment_partner SET code = ${`aa-${countryPartner}`} WHERE id = ${countryPartner}`;
  await tx`INSERT INTO partner_coverage (partner_id, postcode_zone_id)
           VALUES (${zonePartner}, ${zone?.id ?? ""})`;
  const activePartner = await partner(tx, countryId, "active");
  const [product] = await tx<{ id: string }[]>`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES (${unique("SKU-")}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
    RETURNING id`;
  const productId = product?.id ?? "";
  await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
           VALUES (${productId}, 'en', 'Red roses', ${unique("red-roses-")})`;
  const customerId = await customer(tx);
  const recipientId = await recipient(tx, customerId);
  return {
    iso2,
    countryId,
    cityId,
    customerId,
    recipientId,
    productId,
    zonePartner,
    countryPartner,
    activePartner,
  };
}

/** AC-20's one transaction: place, authorise by the demo guard, demo-route. */
async function demoOrder(
  tx: Tx,
  w: World,
  options: { postcode?: string; partnerId?: string } = {},
): Promise<{ orderId: string; assignmentId: string; partnerId: string }> {
  const { orderId } = await place(
    placeInput(w, {
      ...(options.postcode === undefined
        ? {}
        : { destinationPostcode: options.postcode }),
    }),
    db(tx),
  );
  await transition(
    orderId,
    "order.authorised",
    "system:demo_guard",
    { mode: "demo" },
    db(tx),
  );
  const routed = await demoRoute(orderId, {
    ...db(tx),
    ...(options.partnerId === undefined
      ? {}
      : { partnerId: options.partnerId }),
  });
  return { orderId, ...routed };
}

describe.skipIf(server.url === undefined)(
  `order engine on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "engine");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    it("T-20: a demo placement writes the order, its lines, events seq 1–4, one 60-minute offer to a demo florist, no payment, no outbox", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const before = await snapshot(tx);
        const { orderId, assignmentId, partnerId } = await demoOrder(tx, w);
        const [order] = await tx<
          {
            mode: string;
            status: string;
            terms_version: string | null;
            buyer_snapshot: Record<string, unknown>;
            recipient_snapshot: Record<string, unknown>;
            vat_breakdown: unknown[];
            buyer_total_minor: string;
          }[]
        >`SELECT mode, status, terms_version, buyer_snapshot, recipient_snapshot, vat_breakdown,
                 buyer_total_minor FROM "order" WHERE id = ${orderId}`;
        const events = await tx<
          {
            seq: number;
            type: string;
            actor: string;
            from_status: string | null;
            to_status: string | null;
            payload: Record<string, unknown>;
          }[]
        >`SELECT seq, type, actor, from_status, to_status, payload FROM order_event
          WHERE order_id = ${orderId} ORDER BY seq`;
        const assignments = await tx<
          { id: string; partner_id: string; minutes: number; status: string }[]
        >`SELECT a.id, a.partner_id, p.status,
                 (extract(epoch FROM a.sla_expires_at - a.offered_at) / 60)::int AS minutes
          FROM order_assignment a JOIN fulfillment_partner p ON p.id = a.partner_id
          WHERE a.order_id = ${orderId}`;
        const [counts] = await tx<
          { payments: number; outbox: number; lines: number }[]
        >`
          SELECT (SELECT count(*)::int FROM payment WHERE order_id = ${orderId}) AS payments,
                 (SELECT count(*)::int FROM outbox) AS outbox,
                 (SELECT count(*)::int FROM order_line WHERE order_id = ${orderId}) AS lines`;
        return {
          w,
          before,
          order,
          events,
          assignments,
          counts,
          assignmentId,
          partnerId,
        };
      });
      expect(result.order).toMatchObject({
        mode: "demo",
        status: "routed",
        terms_version: null,
        buyer_total_minor: "19900",
      });
      expect(result.order?.buyer_snapshot).toMatchObject({
        email: "buyer@example.test",
      });
      expect(result.order?.recipient_snapshot).toMatchObject({
        city: "Warszawa",
      });
      expect(result.order?.vat_breakdown).toHaveLength(1);
      expect(result.counts).toEqual({ payments: 0, outbox: 0, lines: 2 });
      expect(result.before.outbox).toBe(0);
      expect(
        result.events.map((e) => [
          e.seq,
          e.type,
          e.actor,
          e.from_status,
          e.to_status,
        ]),
      ).toEqual([
        [1, "order.placed", "buyer", null, null],
        [2, "order.authorised", "system:demo_guard", "placed", "authorised"],
        [3, "order.routed", "system:demo_router", "authorised", "routed"],
        [4, "assignment.offered", "system:demo_router", "routed", "routed"],
      ]);
      expect(result.events.every((e) => e.payload["mode"] === "demo")).toBe(
        true,
      );
      expect(result.assignments).toEqual([
        {
          id: result.assignmentId,
          partner_id: result.w.zonePartner,
          minutes: 60,
          status: "demo",
        },
      ]);
      expect(result.partnerId).toBe(result.w.zonePartner);
    });

    it("T-20: demoRoute picks the named demo florist, else the zone, else the first in the country by code, and refuses a live order or no florist", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const byZone = await demoOrder(tx, w);
        const byCountry = await demoOrder(tx, w, { postcode: "99-999" });
        const named = await demoOrder(tx, w, { partnerId: w.countryPartner });
        const namedActive = await undone(tx, async (sp) => {
          const { orderId } = await place(placeInput(w), db(sp));
          await transition(
            orderId,
            "order.authorised",
            "system:demo_guard",
            { mode: "demo" },
            db(sp),
          );
          return refusal(
            demoRoute(orderId, { ...db(sp), partnerId: w.activePartner }),
          );
        });
        const live = await undone(tx, async (sp) => {
          const { orderId } = await place(
            placeInput(w, { mode: "live", termsVersion: "2026-10" }),
            db(sp),
          );
          const before = await snapshot(sp, orderId);
          const code = await refusal(demoRoute(orderId, db(sp)));
          return {
            code,
            unchanged: (await snapshot(sp, orderId)).events === before.events,
          };
        });
        const none = await undone(tx, async (sp) => {
          const other = await country(sp, nextIso());
          const { orderId } = await place(
            placeInput({ ...w, countryId: other }),
            db(sp),
          );
          await transition(
            orderId,
            "order.authorised",
            "system:demo_guard",
            { mode: "demo" },
            db(sp),
          );
          const before = await snapshot(sp, orderId);
          const code = await refusal(demoRoute(orderId, db(sp)));
          return { code, after: await snapshot(sp, orderId), before };
        });
        return { w, byZone, byCountry, named, namedActive, live, none };
      });
      expect(result.byZone.partnerId).toBe(result.w.zonePartner);
      expect(result.byCountry.partnerId).toBe(result.w.countryPartner);
      expect(result.named.partnerId).toBe(result.w.countryPartner);
      expect(result.namedActive).toBe("DEMO_ROUTE_PARTNER_INVALID");
      expect(result.live).toEqual({
        code: "DEMO_ROUTE_LIVE_ORDER",
        unchanged: true,
      });
      expect(result.none.code).toBe("DEMO_ROUTE_NO_PARTNER");
      expect(result.none.after).toEqual(result.none.before);
    });

    it("T-22 + T-44: every row of order_transition, reached with walkOrderTo, is applied for each allowed class and refused for each other class with nothing written", async () => {
      const outcomes = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const rows = await tx<
          {
            from_status: string;
            event: string;
            to_status: string;
            allowed_actors: string[];
          }[]
        >`SELECT from_status, event, to_status, allowed_actors FROM order_transition
          ORDER BY from_status, event`;
        const seen: string[] = [];
        for (const row of rows) {
          await undone(tx, async (sp) => {
            const { orderId } = await place(placeInput(w), db(sp));
            await walkOrderTo(sp, orderId, row.from_status);
            for (const klass of ACTOR_CLASSES) {
              const actor = ACTOR_OF[klass];
              const payload = payloadFor(row.event, "demo");
              if (row.allowed_actors.includes(klass)) {
                const applied = await undone(sp, async (inner) => {
                  const before = await snapshot(inner, orderId);
                  const result = await transition(
                    orderId,
                    row.event as never,
                    actor,
                    payload,
                    db(inner),
                  );
                  const [event] = await inner<
                    {
                      seq: number;
                      type: string;
                      from_status: string;
                      to_status: string;
                      actor: string;
                    }[]
                  >`SELECT seq, type, from_status, to_status, actor FROM order_event
                    WHERE order_id = ${orderId} ORDER BY seq DESC LIMIT 1`;
                  const after = await snapshot(inner, orderId);
                  return {
                    result,
                    event,
                    before,
                    after,
                    settings: await settings(inner),
                  };
                });
                expect(
                  applied.after.status,
                  `${row.from_status} ${row.event} ${klass}`,
                ).toBe(row.to_status);
                expect(applied.event).toEqual({
                  seq: applied.result.seq,
                  type: row.event,
                  from_status: row.from_status,
                  to_status: row.to_status,
                  actor,
                });
                expect(applied.after.events).toBe(applied.before.events + 1);
                expect(applied.after.outbox).toBe(applied.before.outbox);
                expect(applied.settings).toEqual(["", ""]);
                seen.push(`${row.from_status}|${row.event}|${klass}|applied`);
              } else {
                const before = await snapshot(sp, orderId);
                const code = await refusal(
                  transition(
                    orderId,
                    row.event as never,
                    actor,
                    payload,
                    db(sp),
                  ),
                );
                expect(code, `${row.from_status} ${row.event} ${klass}`).toBe(
                  "ORDER_ACTOR_NOT_ALLOWED",
                );
                expect(await snapshot(sp, orderId)).toEqual(before);
                expect(await settings(sp)).toEqual(["", ""]);
                seen.push(`${row.from_status}|${row.event}|${klass}|refused`);
              }
            }
          });
        }
        return { rows: rows.length, seen };
      });
      expect(outcomes.rows).toBe(73);
      expect(outcomes.seen).toHaveLength(73 * ACTOR_CLASSES.length);
      const expected = TRANSITIONS.flatMap((row) =>
        ACTOR_CLASSES.map(
          (klass) =>
            `${row.from}|${row.event}|${klass}|${row.allowedActors.includes(klass) ? "applied" : "refused"}`,
        ),
      ).sort();
      expect([...outcomes.seen].sort()).toEqual(expected);
    }, 300_000);

    it("T-22: an absent event is ORDER_TRANSITION_ILLEGAL, an unknown order ORDER_NOT_FOUND, and the refusals keep A1.5's order", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const { orderId } = await place(placeInput(w), db(tx));
        const before = await snapshot(tx, orderId);
        const missing = "00000000-0000-4000-8000-000000000000";
        const codes = {
          illegal: await refusal(
            transition(
              orderId,
              "order.delivered",
              "system:x",
              { mode: "demo" },
              db(tx),
            ),
          ),
          placedViaTransition: await refusal(
            transition(
              orderId,
              "order.placed",
              "buyer",
              {
                mode: "demo",
                buyerCurrency: "PLN",
                buyerTotalMinor: 1,
                deliveryDate: "2027-01-01",
                lineCount: 1,
              },
              db(tx),
            ),
          ),
          notFound: await refusal(
            transition(
              missing,
              "order.authorised",
              "system:x",
              { mode: "demo" },
              db(tx),
            ),
          ),
          // A1.5: actor first, then payload, then the order, then the row, then the class.
          actorFirst: await refusal(
            transition(
              missing,
              "order.authorised",
              "system:demo-guard",
              { bad: 1 },
              db(tx),
            ),
          ),
          payloadSecond: await refusal(
            transition(
              missing,
              "order.authorised",
              "system:x",
              { bad: 1 },
              db(tx),
            ),
          ),
          illegalBeforeClass: await refusal(
            transition(
              orderId,
              "order.delivered",
              "buyer",
              { mode: "demo" },
              db(tx),
            ),
          ),
          hyphen: await refusal(
            transition(
              orderId,
              "order.authorised",
              "system:demo-guard",
              { mode: "demo" },
              db(tx),
            ),
          ),
          malformed: await refusal(
            transition(
              orderId,
              "order.authorised",
              "system:demo_guard",
              { mode: "demo", note: "x" },
              db(tx),
            ),
          ),
          wrongMode: await refusal(
            transition(
              orderId,
              "order.authorised",
              "system:demo_guard",
              { mode: "live" },
              db(tx),
            ),
          ),
        };
        return {
          codes,
          before,
          after: await snapshot(tx, orderId),
          settings: await settings(tx),
        };
      });
      expect(result.codes).toEqual({
        illegal: "ORDER_TRANSITION_ILLEGAL",
        placedViaTransition: "ORDER_TRANSITION_ILLEGAL",
        notFound: "ORDER_NOT_FOUND",
        actorFirst: "ORDER_ACTOR_INVALID",
        payloadSecond: "ORDER_PAYLOAD_INVALID",
        illegalBeforeClass: "ORDER_TRANSITION_ILLEGAL",
        hyphen: "ORDER_ACTOR_INVALID",
        malformed: "ORDER_PAYLOAD_INVALID",
        wrongMode: "ORDER_PAYLOAD_INVALID",
      });
      expect(result.after).toEqual(result.before);
      expect(result.settings).toEqual(["", ""]);
    });

    it("T-22: a target fixture with one target writes one outbox row in the event's transaction; with none, zero", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const oneTarget: OutboxTargetResolver = () => [
          { name: "ops.fixture", audience: "staff" },
        ];
        const { orderId } = await place(placeInput(w), db(tx));
        const none = await transition(
          orderId,
          "order.authorised",
          "system:demo_guard",
          { mode: "demo" },
          db(tx),
        );
        const one = await transition(
          orderId,
          "order.routed",
          "system:demo_router",
          { mode: "demo", partnerId: w.zonePartner },
          { ...db(tx), outboxTargets: oneTarget },
        );
        const rows = await tx<
          {
            id: string;
            event_id: string;
            targets: string[];
            payload: Record<string, unknown>;
          }[]
        >`
          SELECT id, event_id, targets, payload FROM outbox WHERE order_id = ${orderId}`;
        return { none, one, rows };
      });
      expect(result.none.outboxId).toBeNull();
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        id: result.one.outboxId,
        event_id: result.one.eventId,
        targets: ["ops.fixture"],
      });
      expect(result.rows[0]?.payload).toMatchObject({
        type: "order.routed",
        seq: result.one.seq,
      });
    });

    it("T-22: a failure injected after the event insert leaves no partial write", async () => {
      const committed = await scratch.sql.begin(async (tx) => {
        const w = await world(tx);
        const { orderId } = await place(placeInput(w), db(tx));
        return { orderId };
      });
      const before = await scratch.sql.begin((tx) =>
        snapshot(tx, committed.orderId),
      );
      await expect(
        scratch.sql.begin(async (tx) =>
          transition(
            committed.orderId,
            "order.authorised",
            "system:demo_guard",
            { mode: "demo" },
            {
              executor: failingAfter(tx, /^\s*INSERT INTO order_event/),
            },
          ),
        ),
      ).rejects.toThrow("injected failure");
      const after = await scratch.sql.begin((tx) =>
        snapshot(tx, committed.orderId),
      );
      expect(before.status).toBe("placed");
      expect(after).toEqual(before);
    });

    it("T-22: the distinct order_transition events equal the fixture's 28 transition events and hold no status-preserving one", async () => {
      const rows = await scratch.sql<{ event: string }[]>`
        SELECT DISTINCT event FROM order_transition ORDER BY event`;
      const events = rows.map((row) => row.event);
      expect(events).toEqual([...TRANSITION_EVENTS].sort());
      expect(
        events.filter((e) =>
          (STATUS_PRESERVING_EVENTS as readonly string[]).includes(e),
        ),
      ).toEqual([]);
    });

    it("T-41: after a transition both settings read '' in the transaction, a raw status write is refused, and the next transaction on the same connection reads ''", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const { orderId } = await place(placeInput(w), db(tx));
        await transition(
          orderId,
          "order.authorised",
          "system:demo_guard",
          { mode: "demo" },
          db(tx),
        );
        const inside = await settings(tx);
        const raw = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE "order" SET status = 'routed' WHERE id = ${orderId}`,
        );
        return { inside, raw };
      });
      expect(result.inside).toEqual(["", ""]);
      expect(result.raw.raised).toBe("ORDER_STATUS_DIRECT_WRITE");

      const reserved = await scratch.sql.reserve();
      try {
        // A pinned connection: BEGIN, the engine's transition, COMMIT, then the next statement.
        const pinned = reserved as unknown as Tx;
        await reserved`BEGIN`;
        const w = await world(pinned);
        const { orderId } = await place(placeInput(w), db(pinned));
        await transition(
          orderId,
          "order.authorised",
          "system:demo_guard",
          { mode: "demo" },
          db(pinned),
        );
        await reserved`COMMIT`;
        const [next] = await reserved<{ allow: string; event: string }[]>`
          SELECT coalesce(current_setting('app.allow_status_write', true), '') AS allow,
                 coalesce(current_setting('app.transition_event', true), '') AS event`;
        expect([next?.allow, next?.event]).toEqual(["", ""]);
      } finally {
        reserved.release();
      }
    });

    it("T-42: place inserts with the switch only, resets it, and a raw insert after it in the same transaction is ORDER_INSERT_OUTSIDE_SERVICE", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        await place(placeInput(w), db(tx));
        const after = await settings(tx);
        const raw = await pgFailure(
          tx,
          (sp) => sp`
          INSERT INTO "order" (public_token, mode, customer_id, recipient_id, destination_country_id,
                               delivery_date, buyer_currency_code, buyer_total_minor,
                               base_currency_code, base_total_minor, buyer_snapshot, recipient_snapshot)
          VALUES (${"r".repeat(24)}, 'demo', ${w.customerId}, ${w.recipientId}, ${w.countryId},
                  DATE '2027-02-14', 'PLN', 100, 'PLN', 100, '{}'::jsonb, '{}'::jsonb)`,
        );
        return { after, raw };
      });
      expect(result.after).toEqual(["", ""]);
      expect(result.raw.raised).toBe("ORDER_INSERT_OUTSIDE_SERVICE");
    });

    it("T-43: appendEvent refuses each of the 28 transition events on a routed order with nothing written, then appends assignment.offered with from = to", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const { orderId } = await demoOrder(tx, w);
        const before = await snapshot(tx, orderId);
        const codes: string[] = [];
        for (const event of TRANSITION_EVENTS) {
          codes.push(
            await refusal(
              appendEvent(
                orderId,
                event,
                "system:x",
                payloadFor(event, "demo"),
                db(tx),
              ),
            ),
          );
          expect(await settings(tx)).toEqual(["", ""]);
        }
        const unchanged = await snapshot(tx, orderId);
        const appended = await appendEvent(
          orderId,
          "assignment.offered",
          "system:demo_router",
          {
            mode: "demo",
            assignmentId: w.zonePartner,
            partnerId: w.zonePartner,
            attempt: 1,
            answerWindowMinutes: 60,
          },
          db(tx),
        );
        const [row] = await tx<
          { seq: number; from_status: string; to_status: string }[]
        >`
          SELECT seq, from_status, to_status FROM order_event WHERE order_id = ${orderId} AND seq = ${appended.seq}`;
        return {
          codes,
          before,
          unchanged,
          row,
          appended,
          settings: await settings(tx),
        };
      });
      expect(result.codes).toEqual(
        TRANSITION_EVENTS.map(() => "ORDER_EVENT_NEEDS_TRANSITION"),
      );
      expect(result.unchanged).toEqual(result.before);
      expect(result.row).toEqual({
        seq: 5,
        from_status: "routed",
        to_status: "routed",
      });
      expect(result.settings).toEqual(["", ""]);
    });

    it("T-23: raw inserts are refused by name, and assignments cannot cross modes", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const insert = (sp: Tx, status: string) => sp`
          INSERT INTO "order" (public_token, mode, customer_id, recipient_id, destination_country_id,
                               delivery_date, status, buyer_currency_code, buyer_total_minor,
                               base_currency_code, base_total_minor, buyer_snapshot, recipient_snapshot)
          VALUES (${"t".repeat(24)}, 'demo', ${w.customerId}, ${w.recipientId}, ${w.countryId},
                  DATE '2027-02-14', ${status}, 'PLN', 100, 'PLN', 100, '{}'::jsonb, '{}'::jsonb)`;
        const noFlag = await pgFailure(tx, (sp) => insert(sp, "placed"));
        const wrongStatus = await pgFailure(tx, async (sp) => {
          await sp`SELECT set_config('app.allow_status_write', 'on', true)`;
          await insert(sp, "routed");
        });
        const demo = await place(placeInput(w), db(tx));
        const live = await place(
          placeInput(w, { mode: "live", termsVersion: "2026-10" }),
          db(tx),
        );
        const offer = (sp: Tx, orderId: string, partnerId: string) => sp`
          INSERT INTO order_assignment (order_id, partner_id, sla_expires_at, attempt)
          VALUES (${orderId}, ${partnerId}, now() + interval '1 hour', 1)`;
        const demoToActive = await pgFailure(tx, (sp) =>
          offer(sp, demo.orderId, w.activePartner),
        );
        const liveToDemo = await pgFailure(tx, (sp) =>
          offer(sp, live.orderId, w.zonePartner),
        );
        return { noFlag, wrongStatus, demoToActive, liveToDemo };
      });
      expect(result.noFlag.raised).toBe("ORDER_INSERT_OUTSIDE_SERVICE");
      expect(result.wrongStatus.raised).toBe("ORDER_INITIAL_STATUS");
      expect(result.demoToActive.raised).toBe("ASSIGNMENT_MODE_MISMATCH");
      expect(result.liveToDemo.raised).toBe("ASSIGNMENT_MODE_MISMATCH");
    });

    it("T-25: the assigned florist and the admin see the routed order; another florist sees nothing; no item carries a contact field", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const { orderId } = await demoOrder(tx, w);
        const read = <T>(
          context: Parameters<typeof asApp>[1],
          fn: (e: OrderExecutor) => Promise<T>,
        ) =>
          undone(tx, async (sp) => {
            await asApp(sp, context);
            return fn(runnerOf(sp));
          });
        const assigned = await read(
          { role: "partner", partnerIds: [w.zonePartner] },
          (e) => selectPartnerOrders(e),
        );
        const assignedPl = await read(
          { role: "partner", partnerIds: [w.zonePartner] },
          (e) => selectPartnerOrders(e, "pl"),
        );
        const other = await read(
          { role: "partner", partnerIds: [w.countryPartner] },
          (e) => selectPartnerOrders(e),
        );
        const mine = { countryIso2: w.iso2 };
        const admin = await read({ role: "admin" }, (e) =>
          selectAdminOrders(e, mine),
        );
        const filters = {
          routed: await read({ role: "admin" }, (e) =>
            selectAdminOrders(e, { ...mine, status: "routed" }),
          ),
          placed: await read({ role: "admin" }, (e) =>
            selectAdminOrders(e, { ...mine, status: "placed" }),
          ),
          pl: await read({ role: "admin" }, (e) => selectAdminOrders(e, mine)),
          de: await read({ role: "admin" }, (e) =>
            selectAdminOrders(e, { countryIso2: nextIso() }),
          ),
          date: await read({ role: "admin" }, (e) =>
            selectAdminOrders(e, { ...mine, deliveryDate: "2027-02-14" }),
          ),
          otherDate: await read({ role: "admin" }, (e) =>
            selectAdminOrders(e, { ...mine, deliveryDate: "2027-02-15" }),
          ),
          page2: await read({ role: "admin" }, (e) =>
            selectAdminOrders(e, { ...mine, page: 2 }),
          ),
        };
        const [today] = await tx<
          { d: string }[]
        >`SELECT (now() AT TIME ZONE 'UTC')::date::text AS d`;
        const created = await read({ role: "admin" }, (e) =>
          selectAdminOrders(e, { ...mine, createdOn: today?.d ?? "" }),
        );
        const createdBefore = await read({ role: "admin" }, (e) =>
          selectAdminOrders(e, { ...mine, createdOn: "2020-01-01" }),
        );
        return {
          w,
          orderId,
          assigned,
          assignedPl,
          other,
          admin,
          filters,
          created,
          createdBefore,
        };
      });
      expect(result.assigned).toHaveLength(1);
      expect(result.assigned[0]).toMatchObject({
        orderId: result.orderId,
        mode: "demo",
        buyerStatus: "confirmed",
        deliveryDate: "2027-02-14",
        cityName: "Warsaw",
        productName: "Red roses",
        tierKey: "classic",
      });
      expect(result.assignedPl[0]?.cityName).toBe("Warszawa");
      expect(result.assignedPl[0]?.productName).toBe("Red roses");
      expect(result.other).toEqual([]);
      expect(result.admin).toHaveLength(1);
      expect(result.admin[0]).toMatchObject({
        orderId: result.orderId,
        status: "routed",
        buyerStatus: "confirmed",
        totalMinor: 19_900,
        currency: "PLN",
        assignedPartner: { partnerId: result.w.zonePartner },
      });
      for (const item of [...result.assigned, ...result.admin]) {
        for (const key of Object.keys(item)) {
          for (const fragment of CONTACT_KEY_FRAGMENTS) {
            expect(key.toLowerCase()).not.toContain(fragment);
          }
        }
      }
      expect(Object.keys(result.assigned[0] ?? {}).sort()).toEqual(
        ORDER_LIST_ITEM_KEYS,
      );
      expect(result.filters.routed).toHaveLength(1);
      expect(result.filters.placed).toHaveLength(0);
      expect(result.filters.pl).toHaveLength(1);
      expect(result.filters.de).toHaveLength(0);
      expect(result.filters.date).toHaveLength(1);
      expect(result.filters.otherDate).toHaveLength(0);
      expect(result.filters.page2).toHaveLength(0);
      expect(result.created).toHaveLength(1);
      expect(result.createdBefore).toHaveLength(0);
    });

    it("T-25: 20 committed demo placements are visible to both projections; p95 of place → visible is under 5 s (local PG16, load average logged)", async () => {
      const setup = await scratch.sql.begin((tx) => world(tx));
      const durations: number[] = [];
      for (let run = 0; run < 20; run += 1) {
        const started = performance.now();
        const { orderId } = await scratch.sql.begin((tx) =>
          demoOrder(tx, setup, { partnerId: setup.zonePartner }),
        );
        const seen = await scratch.sql.begin(async (tx) => {
          const exec = runnerOf;
          const partnerSees = await undone(tx, async (sp) => {
            await asApp(sp, {
              role: "partner",
              partnerIds: [setup.zonePartner],
            });
            return selectPartnerOrders(exec(sp));
          });
          const adminSees = await undone(tx, async (sp) => {
            await asApp(sp, { role: "admin" });
            return selectAdminOrders(exec(sp), {
              countryIso2: setup.iso2,
              status: "routed",
            });
          });
          return (
            partnerSees.some((item) => item.orderId === orderId) &&
            adminSees.some((item) => item.orderId === orderId)
          );
        });
        expect(seen).toBe(true);
        durations.push(performance.now() - started);
      }
      const sorted = [...durations].sort((a, b) => a - b);
      const p95 =
        sorted[Math.ceil(0.95 * sorted.length) - 1] ?? Number.POSITIVE_INFINITY;
      process.stderr.write(
        `AC-25 local p95 place→visible over 20 runs: ${p95.toFixed(1)} ms (median ${sorted[9]?.toFixed(1)} ms); load average ${loadavg()
          .map((n) => n.toFixed(2))
          .join(" ")}\n`,
      );
      expect(p95).toBeLessThan(5_000);
    }, 120_000);

    it("customers: the guest upsert matches the normalised email and overwrites nothing; recipients dedupe on (customer, normalised name, phone)", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await country(tx);
        const handle = runnerOf(tx);
        const email = `${unique("guest")}@example.test`;
        const first = await upsertGuestCustomer(handle, {
          email,
          name: "First Name",
          phoneE164: "+447700900001",
          countryIso2: "GB",
        });
        const again = await upsertGuestCustomer(handle, {
          email: `  ${email.toUpperCase()} `,
          name: "Someone Else",
          phoneE164: "+447700900002",
          countryIso2: "PL",
        });
        const [row] = await tx<
          {
            name: string;
            phone_e164: string;
            country_iso2: string;
            n: number;
          }[]
        >`
          SELECT name, phone_e164, country_iso2,
                 (SELECT count(*)::int FROM customer WHERE lower(email_normalised) = ${email}) AS n
          FROM customer WHERE id = ${first.customerId}`;
        const address = {
          lines: ["ul. Testowa 1"],
          city: "Warszawa",
          countryId,
          placeKind: "home" as const,
        };
        const r1 = await createRecipient(handle, {
          customerId: first.customerId,
          fullName: "Anna  Nowak",
          phoneE164: "+48500000001",
          address,
        });
        const r2 = await createRecipient(handle, {
          customerId: first.customerId,
          fullName: " anna nowak ",
          phoneE164: "+48500000001",
          address,
        });
        const r3 = await createRecipient(handle, {
          customerId: first.customerId,
          fullName: "Anna Nowak",
          phoneE164: "+48500000002",
          address,
        });
        const r4 = await createRecipient(handle, {
          customerId: first.customerId,
          fullName: "Anna Nowak",
          phoneE164: "+48500000001",
          address: { ...address, lines: ["ul. Inna 2"] },
        });
        const [addresses] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM recipient_address WHERE recipient_id = ${r1.recipientId}`;
        return { first, again, row, r1, r2, r3, r4, addresses };
      });
      expect(result.first.created).toBe(true);
      expect(result.again).toEqual({
        customerId: result.first.customerId,
        created: false,
      });
      expect(result.row).toEqual({
        name: "First Name",
        phone_e164: "+447700900001",
        country_iso2: "GB",
        n: 1,
      });
      expect(result.r1.created).toBe(true);
      expect(result.r2).toEqual({ ...result.r1, created: false });
      expect(result.r3.recipientId).not.toBe(result.r1.recipientId);
      expect(result.r4.recipientId).toBe(result.r1.recipientId);
      expect(result.r4.addressId).not.toBe(result.r1.addressId);
      expect(result.addresses?.n).toBe(2);
    });
  },
);
