/**
 * The florist inbox's read side and demo against migrated tables (spec 011 AC-23, AC-24, AC-25,
 * AC-26 `placeDemoOrder` half, AC-33; TASK-214).
 *
 *  - T-33: `placeDemoOrder` calls spec 010's `place` and `demoRoute` once each (spies that call
 *    through), the order is `demo`, its people are the shared samples, its amount is the price
 *    provider's and its payout the seed mapping's; `florists:demo-member` adds, then removes the
 *    membership, the florist sessions and the orphaned `users` row, and keeps a user something
 *    else still holds.
 *  - T-23: florist A's list holds only A's assignments, B's assignment is `null` (404) for A, and
 *    under A's partner context `"order"`, `order_line`, `order_assignment`, `delivery_proof` and
 *    `media_asset` return none of B's rows.
 *  - T-25: walking one order through its stages, the order page's HTML (TASK-210's
 *    `OrderScreen`) contains the recipient's name, phone and street from acceptance until the
 *    photo, and none of them for an open offer, after the photo, after a decline, or once the
 *    answer-by time has passed. A cancelled order's open offer is not shown at all.
 *  - T-24: the list's groups and items, the answer-by times on both sides of the October DST
 *    change in `Europe/Warsaw` (12:00 CEST, 11:00 CET), the empty list.
 */
import { randomUUID } from "node:crypto";

import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { demoMember } from "../../scripts/florists-demo-member.ts";
import { CHECKOUT_SAMPLES } from "../../src/config/checkout-samples.ts";
import { priceProjection } from "../../src/modules/catalog/index.ts";
import { loadMessages } from "../../src/modules/i18n/index.ts";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import {
  demoRoute,
  type OrderExecutor,
  place,
  selectFloristAssignments,
  selectFloristOrderView,
  transition,
} from "../../src/modules/orders/index.ts";
import {
  type FloristAssignmentListItem,
  type FloristOrderView,
  InboxList,
  OrderScreen,
} from "../../src/modules/partners/index.ts";
import { placeDemoOrder } from "../../src/modules/orders/demo/index.ts";
import { registerFixtureEventSchemas } from "../fixtures/order-engine.ts";
import * as make from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();
registerFixtureEventSchemas();

const SKU = "FO-BQ-001";
const TIER = "stems_15";
const PAYOUT_A = 14_900;
const PAYOUT_B = 12_000;
const SAMPLE = CHECKOUT_SAMPLES.PL;
const STREET = "Marszałkowska";

interface World {
  readonly countryId: string;
  readonly productId: string;
  readonly partnerA: string;
  readonly partnerB: string;
  readonly partnerC: string;
}

async function world(tx: Tx): Promise<World> {
  const countryId = await make.country(tx, "PL");
  const [product] = await tx<{ id: string }[]>`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES (${SKU}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
    ON CONFLICT (sku) DO UPDATE SET sku = EXCLUDED.sku
    RETURNING id`;
  const productId = product?.id ?? "";
  await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
           VALUES (${productId}, 'en', 'Amber Hour', ${make.unique("amber-hour-")})
           ON CONFLICT DO NOTHING`;
  await tx`INSERT INTO product_tier (product_id, tier_key, label_key, stems, sort, is_default)
           VALUES (${productId}, ${TIER}, 'catalog.tier.stems', 15, 0, true)
           ON CONFLICT DO NOTHING`;
  const partnerA = await make.partner(tx, countryId, "demo");
  const partnerB = await make.partner(tx, countryId, "demo");
  const partnerC = await make.partner(tx, countryId, "demo");
  await tx`INSERT INTO partner_catalog_mapping (partner_id, product_id, tier_key, partner_payout_minor,
                                                currency_code)
           VALUES (${partnerA}, ${productId}, ${TIER}, ${PAYOUT_A}, 'PLN'),
                  (${partnerB}, ${productId}, NULL, ${PAYOUT_B}, 'PLN')`;
  return { countryId, productId, partnerA, partnerB, partnerC };
}

/** Runs `fn` in a savepoint that is always rolled back. */
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

/** `fn` under florist `partnerId`'s partner context, as `withDbContext` sets it. */
function asFlorist<T>(
  tx: Tx,
  partnerId: string,
  fn: (executor: OrderExecutor, sp: Tx) => Promise<T>,
): Promise<T> {
  return undone(tx, async (sp) => {
    await asApp(sp, { role: "partner", partnerIds: [partnerId] });
    return fn(runnerOf(sp), sp);
  });
}

function demoOrder(tx: Tx, partnerId: string, deliveryDate = "2026-10-25") {
  return placeDemoOrder(
    { partnerId, deliveryDate },
    { executor: runnerOf(tx), environment: "test", now: NOW },
  );
}

const NOW = new Date("2026-10-24T09:00:00Z");
const PARTNER_ACTOR = (id: string) => `partner:${id}`;

function html(node: ReactElement): string {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      {
        locale: "en",
        messages: loadMessages("en", [...MESSAGE_NAMESPACES]),
        timeZone: "UTC",
        // The provider's props type requires `children`; they are the third argument here.
      } as never,
      node,
    ),
  );
}

function orderHtml(view: FloristOrderView): string {
  return html(
    createElement(OrderScreen, {
      view,
      locale: "en",
      eyebrow: "eyebrow",
      back: { label: "Orders", href: "/" },
    }),
  );
}

function listHtml(items: readonly FloristAssignmentListItem[]): string {
  return html(
    createElement(InboxList, {
      locale: "en",
      title: "Orders",
      groups: [
        {
          id: "all",
          heading: "All",
          items: items.map((item) => ({ item })),
        },
      ],
    }),
  );
}

const PHONE = SAMPLE.recipient.fields.phone.replaceAll(/[^\d+]/gu, "");
const NAME = SAMPLE.recipient.fields.fullName;

function personal(page: string): {
  name: boolean;
  phone: boolean;
  street: boolean;
} {
  return {
    name: page.includes(NAME),
    phone: page.includes(PHONE),
    street: page.includes(STREET),
  };
}

const NONE = { name: false, phone: false, street: false };
const ALL = { name: true, phone: true, street: true };

describe.skipIf(server.url === undefined)(
  `florist inbox on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "inbox");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    it("T-33: placeDemoOrder goes through place and demoRoute once each; demo mode, sample people, provider price, seed payout", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const engine = {
          place: vi.fn(place),
          transition: vi.fn(transition),
          demoRoute: vi.fn(demoRoute),
        };
        const placed = await placeDemoOrder(
          { partnerId: w.partnerA, deliveryDate: "2026-10-27" },
          { executor: runnerOf(tx), environment: "staging", now: NOW, engine },
        );
        const [order] = await tx<
          {
            mode: string;
            status: string;
            buyer_total_minor: string;
            buyer_currency_code: string;
            recipient_snapshot: Record<string, unknown>;
            buyer_snapshot: Record<string, unknown>;
          }[]
        >`SELECT mode, status, buyer_total_minor, buyer_currency_code, recipient_snapshot,
                 buyer_snapshot FROM "order" WHERE id = ${placed.orderId}`;
        const lines = await tx<
          {
            unit_retail_minor: string;
            partner_payout_minor: string | null;
            payout_currency_code: string | null;
          }[]
        >`SELECT unit_retail_minor, partner_payout_minor, payout_currency_code
          FROM order_line WHERE order_id = ${placed.orderId}`;
        const [assignment] = await tx<{ partner_id: string; id: string }[]>`
          SELECT id, partner_id FROM order_assignment WHERE order_id = ${placed.orderId}`;
        const refusedNotDemo = await undone(tx, async (sp) => {
          const onboarding = await make.partner(sp, w.countryId, "onboarding");
          await sp`INSERT INTO partner_catalog_mapping (partner_id, product_id, tier_key,
                                                        partner_payout_minor, currency_code)
                   VALUES (${onboarding}, ${w.productId}, ${TIER}, ${PAYOUT_A}, 'PLN')`;
          return placeDemoOrder(
            { partnerId: onboarding },
            { executor: runnerOf(sp), environment: "staging", now: NOW },
          ).then(
            () => "placed",
            (error: unknown) => (error as { code?: string }).code,
          );
        });
        return {
          placed,
          order,
          lines,
          assignment,
          refusedNotDemo,
          calls: {
            place: engine.place.mock.calls.length,
            demoRoute: engine.demoRoute.mock.calls.length,
            routeTo: engine.demoRoute.mock.calls[0]?.[1]?.partnerId,
          },
          partnerA: w.partnerA,
        };
      });
      const price = await priceProjection("en", {
        productId: SKU,
        tierKey: TIER,
        countryIso: "PL",
        deliveryDate: "2026-10-27",
        now: NOW,
      });
      expect(result.calls).toEqual({
        place: 1,
        demoRoute: 1,
        routeTo: result.partnerA,
      });
      expect(result.order?.mode).toBe("demo");
      expect(result.order?.status).toBe("routed");
      expect(Number(result.order?.buyer_total_minor)).toBe(
        price.destinationCurrencyPrice.amountMinor,
      );
      expect(result.order?.buyer_currency_code).toBe(
        price.destinationCurrencyPrice.currency,
      );
      expect(result.lines).toEqual([
        {
          unit_retail_minor: String(price.destinationCurrencyPrice.amountMinor),
          partner_payout_minor: String(PAYOUT_A),
          payout_currency_code: "PLN",
        },
      ]);
      expect(result.order?.recipient_snapshot["fullName"]).toBe(NAME);
      expect(result.order?.buyer_snapshot["email"]).toBe(SAMPLE.buyer.email);
      expect(result.assignment).toEqual({
        id: result.placed.assignmentId,
        partner_id: result.partnerA,
      });
      expect(result.refusedNotDemo).toBe("partner_not_demo");
    });

    it("T-23: A sees only A's assignments; B's is not found for A; A's context reads none of B's rows in the five tables", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const a = await demoOrder(tx, w.partnerA);
        const b = await demoOrder(tx, w.partnerB);
        // B's order accepted, delivered and photographed, so delivery_proof and media_asset hold rows.
        await tx`UPDATE order_assignment SET response = 'accept', responded_at = now()
                 WHERE id = ${b.assignmentId}`;
        const executor = runnerOf(tx);
        for (const event of [
          "assignment.accepted",
          "order.captured",
          "order.in_production",
          "order.out_for_delivery",
          "order.delivered",
        ] as const) {
          await transition(
            b.orderId,
            event,
            event.startsWith("assignment") ||
              event.includes("out_for") ||
              event.endsWith("delivered")
              ? PARTNER_ACTOR(w.partnerB)
              : "system:demo",
            { mode: "demo" },
            { executor },
          );
        }
        const asset = await make.mediaAsset(tx);
        await tx`INSERT INTO delivery_proof (order_id, media_asset_id, uploaded_by)
                 VALUES (${b.orderId}, ${asset}, ${PARTNER_ACTOR(w.partnerB)})`;
        const listA = await asFlorist(tx, w.partnerA, (e) =>
          selectFloristAssignments(e, { now: NOW }),
        );
        const listB = await asFlorist(tx, w.partnerB, (e) =>
          selectFloristAssignments(e, { now: NOW }),
        );
        const bForA = await asFlorist(tx, w.partnerA, (e) =>
          selectFloristOrderView(e, b.assignmentId, { now: NOW }),
        );
        const aForA = await asFlorist(tx, w.partnerA, (e) =>
          selectFloristOrderView(e, a.assignmentId, { now: NOW }),
        );
        const leaks = await asFlorist(tx, w.partnerA, async (_e, sp) => {
          const [counts] = await sp<
            {
              orders: number;
              lines: number;
              assignments: number;
              proofs: number;
              assets: number;
            }[]
          >`SELECT
              (SELECT count(*)::int FROM "order" WHERE id = ${b.orderId}) AS orders,
              (SELECT count(*)::int FROM order_line WHERE order_id = ${b.orderId}) AS lines,
              (SELECT count(*)::int FROM order_assignment WHERE order_id = ${b.orderId}) AS assignments,
              (SELECT count(*)::int FROM delivery_proof WHERE order_id = ${b.orderId}) AS proofs,
              (SELECT count(*)::int FROM media_asset WHERE id = ${asset}) AS assets`;
          return counts;
        });
        const bSeesOwnProof = await asFlorist(
          tx,
          w.partnerB,
          async (_e, sp) => {
            const [row] = await sp<{ n: number }[]>`
            SELECT count(*)::int AS n FROM delivery_proof WHERE order_id = ${b.orderId}`;
            return row?.n;
          },
        );
        return { a, b, listA, listB, bForA, aForA, leaks, bSeesOwnProof };
      });
      expect(result.listA.map((item) => item.assignmentId)).toEqual([
        result.a.assignmentId,
      ]);
      expect(
        result.listB.map((item) => [item.assignmentId, item.stage]),
      ).toEqual([[result.b.assignmentId, "photoReceived"]]);
      expect(result.bForA).toBeNull();
      expect(result.aForA?.assignmentId).toBe(result.a.assignmentId);
      expect(result.leaks).toEqual({
        orders: 0,
        lines: 0,
        assignments: 0,
        proofs: 0,
        assets: 0,
      });
      // The control: the same count is not vacuous for the florist who holds the order.
      expect(result.bSeesOwnProof).toBe(1);
    });

    it("T-25: the recipient is in the page from acceptance until the photo, and in no other stage", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const executor = runnerOf(tx);
        const order = await demoOrder(tx, w.partnerA);
        const view = () =>
          asFlorist(tx, w.partnerA, (e) =>
            selectFloristOrderView(e, order.assignmentId, { now: NOW }),
          );
        const pages: Record<
          string,
          { stage: string | undefined; page: ReturnType<typeof personal> }
        > = {};
        const snap = async (label: string) => {
          const current = await view();
          pages[label] = {
            stage: current?.stage,
            page: current === null ? NONE : personal(orderHtml(current)),
          };
        };
        await snap("offer");
        await tx`UPDATE order_assignment SET response = 'accept', responded_at = now()
                 WHERE id = ${order.assignmentId}`;
        await transition(
          order.orderId,
          "assignment.accepted",
          PARTNER_ACTOR(w.partnerA),
          { mode: "demo" },
          { executor },
        );
        await snap("accepted");
        await transition(
          order.orderId,
          "order.captured",
          "system:demo",
          { mode: "demo" },
          { executor },
        );
        await transition(
          order.orderId,
          "order.in_production",
          "system:demo",
          { mode: "demo" },
          { executor },
        );
        await snap("inProduction");
        await transition(
          order.orderId,
          "order.out_for_delivery",
          PARTNER_ACTOR(w.partnerA),
          { mode: "demo" },
          { executor },
        );
        await snap("outForDelivery");
        await transition(
          order.orderId,
          "order.delivered",
          PARTNER_ACTOR(w.partnerA),
          { mode: "demo" },
          { executor },
        );
        await snap("delivered");
        const asset = await make.mediaAsset(tx);
        await tx`INSERT INTO delivery_proof (order_id, media_asset_id, uploaded_by)
                 VALUES (${order.orderId}, ${asset}, ${PARTNER_ACTOR(w.partnerA)})`;
        await transition(
          order.orderId,
          "order.photo_uploaded",
          PARTNER_ACTOR(w.partnerA),
          { mode: "demo" },
          { executor },
        );
        await snap("photo");

        // A declined offer: gone from the list, no page.
        const declined = await demoOrder(tx, w.partnerA);
        await tx`UPDATE order_assignment SET response = 'decline', reason = 'capacity',
                   responded_at = now() WHERE id = ${declined.assignmentId}`;
        const declinedView = await asFlorist(tx, w.partnerA, (e) =>
          selectFloristOrderView(e, declined.assignmentId, { now: NOW }),
        );
        // An offer past its answer-by time, the timeout not yet written.
        const expired = await demoOrder(tx, w.partnerA);
        await tx`UPDATE order_assignment SET offered_at = ${new Date(NOW.getTime() - 2 * 3_600_000)},
                   sla_expires_at = ${new Date(NOW.getTime() - 3_600_000)}
                 WHERE id = ${expired.assignmentId}`;
        const expiredView = await asFlorist(tx, w.partnerA, (e) =>
          selectFloristOrderView(e, expired.assignmentId, { now: NOW }),
        );
        // A cancelled order whose offer is still open.
        const cancelled = await demoOrder(tx, w.partnerA);
        await transition(
          cancelled.orderId,
          "order.cancelled",
          "system:demo",
          { mode: "demo" },
          { executor },
        );
        const cancelledView = await asFlorist(tx, w.partnerA, (e) =>
          selectFloristOrderView(e, cancelled.assignmentId, { now: NOW }),
        );
        const list = await asFlorist(tx, w.partnerA, (e) =>
          selectFloristAssignments(e, { now: NOW }),
        );
        return {
          pages,
          declinedView,
          expiredStage: expiredView?.stage,
          expiredPage:
            expiredView === null ? null : personal(orderHtml(expiredView)),
          expiredHasAnswerBy: expiredView !== null && "answerBy" in expiredView,
          cancelledView,
          listed: list.map((item) => item.assignmentId),
          ids: { order: order.assignmentId, expired: expired.assignmentId },
        };
      });
      expect(result.pages).toEqual({
        offer: { stage: "offer", page: NONE },
        accepted: { stage: "accepted", page: ALL },
        inProduction: { stage: "accepted", page: ALL },
        outForDelivery: { stage: "outForDelivery", page: ALL },
        delivered: { stage: "delivered", page: ALL },
        photo: { stage: "photoReceived", page: NONE },
      });
      expect(result.declinedView).toBeNull();
      expect(result.expiredStage).toBe("expired");
      expect(result.expiredPage).toEqual(NONE);
      expect(result.expiredHasAnswerBy).toBe(false);
      expect(result.cancelledView).toBeNull();
      expect([...result.listed].sort()).toEqual(
        [result.ids.order, result.ids.expired].sort(),
      );
    });

    it("T-24: groups, fields, answer-by times across the October DST change, and the empty list", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const executor = runnerOf(tx);
        const summer = await demoOrder(tx, w.partnerB, "2026-10-24");
        const winter = await demoOrder(tx, w.partnerB, "2026-10-26");
        // 10:00 UTC on each side of 25 October 2026 (the last Sunday): 12:00 CEST, 11:00 CET.
        for (const [id, sla] of [
          [summer.assignmentId, "2026-10-24T10:00:00Z"],
          [winter.assignmentId, "2026-10-26T10:00:00Z"],
        ] as const) {
          await tx`UPDATE order_assignment SET offered_at = ${new Date("2026-10-24T08:00:00Z")},
                     sla_expires_at = ${new Date(sla)} WHERE id = ${id}`;
        }
        const making = await demoOrder(tx, w.partnerB, "2026-10-25");
        await tx`UPDATE order_assignment SET response = 'accept', responded_at = now()
                 WHERE id = ${making.assignmentId}`;
        await transition(
          making.orderId,
          "assignment.accepted",
          PARTNER_ACTOR(w.partnerB),
          { mode: "demo" },
          { executor },
        );
        const list = await asFlorist(tx, w.partnerB, (e) =>
          selectFloristAssignments(e, { now: NOW }),
        );
        const empty = await asFlorist(tx, w.partnerC, (e) =>
          selectFloristAssignments(e, { now: NOW }),
        );
        return { list, empty, ids: { summer, winter, making } };
      });
      expect(
        result.list.map((item) => [item.assignmentId, item.stage]),
      ).toEqual([
        [result.ids.summer.assignmentId, "offer"],
        [result.ids.winter.assignmentId, "offer"],
        [result.ids.making.assignmentId, "accepted"],
      ]);
      const first = result.list[0];
      expect(first).toEqual({
        assignmentId: result.ids.summer.assignmentId,
        stage: "offer",
        product: {
          sku: SKU,
          name: "Amber Hour",
          tier: { labelKey: "catalog.tier.stems", stems: 15 },
          addonNameKeys: [],
        },
        delivery: {
          date: "2026-10-24",
          timeZone: "Europe/Warsaw",
          countryIso2: "PL",
          town: SAMPLE.recipient.fields.city,
          postcode: SAMPLE.recipient.fields.postcode,
        },
        // B's mapping has no tier: it answers for every tier of the product.
        payout: { amountMinor: PAYOUT_B, currency: "PLN" },
        answerBy: "2026-10-24T10:00:00.000Z",
      });
      expect(result.list[2]?.answerBy).toBeUndefined();
      const page = listHtml(result.list);
      expect(page).toMatch(/12:00/u);
      expect(page).toMatch(/11:00/u);
      expect(page).not.toMatch(/10:00/u);
      expect(page).toContain("120.00");
      expect(page).not.toContain(NAME);
      expect(result.empty).toEqual([]);
    });

    it("T-33: florists:demo-member adds, then removes the membership, florist sessions and the orphaned user", async () => {
      const code = make.unique("demo-member-");
      const other = make.unique("demo-other-");
      const email = `${randomUUID()}@example.test`;
      const kept = `${randomUUID()}@example.test`;
      await scratch.sql.begin(async (tx) => {
        const countryId = await make.country(tx, "PL");
        for (const [partnerCode, status] of [
          [code, "demo"],
          [other, "active"],
        ] as const) {
          await tx`INSERT INTO fulfillment_partner (code, legal_name, city_label, country_id, status,
                                     contact_email, payout_currency_code, capacity_per_day)
                   VALUES (${partnerCode}, 'Test Florist', 'Warszawa', ${countryId}, ${status},
                           'florist@example.test', 'PLN', 15)`;
        }
      });
      const run = (action: "add" | "remove", address: string, partner = code) =>
        demoMember(
          scratch.sql,
          { action, email: address, partner, language: "pl" },
          "staging",
        );
      const notDemo = await run("add", email, other);
      const added = await run("add", email);
      const [member] = await scratch.sql<{ locale_code: string }[]>`
        SELECT locale_code FROM partner_member WHERE user_id = ${added.kind === "added" ? added.userId : ""}`;
      const userId = added.kind === "added" ? added.userId : "";
      await scratch.sql`INSERT INTO sessions (session_token, user_id, expires)
                        VALUES (${`florist.${randomUUID()}`}, ${userId}, now() + interval '1 day'),
                               (${`florist.${randomUUID()}`}, ${userId}, now() + interval '1 day')`;
      const removed = await run("remove", email);
      const [left] = await scratch.sql<
        { users: number; sessions: number; members: number }[]
      >`
        SELECT (SELECT count(*)::int FROM users WHERE id = ${userId}) AS users,
               (SELECT count(*)::int FROM sessions WHERE user_id = ${userId}) AS sessions,
               (SELECT count(*)::int FROM partner_member WHERE user_id = ${userId}) AS members`;

      // A user an admin profile still holds keeps the row, and their admin session.
      const keptAdded = await run("add", kept);
      const keptId = keptAdded.kind === "added" ? keptAdded.userId : "";
      await scratch.sql`INSERT INTO admin_profile (user_id, display_name) VALUES (${keptId}, 'Ops Test')`;
      await scratch.sql`INSERT INTO sessions (session_token, user_id, expires)
                        VALUES (${`admin.${randomUUID()}`}, ${keptId}, now() + interval '1 day'),
                               (${`florist.${randomUUID()}`}, ${keptId}, now() + interval '1 day')`;
      const keptRemoved = await run("remove", kept);
      const [keptLeft] = await scratch.sql<
        { users: number; admin_sessions: number; florist_sessions: number }[]
      >`
        SELECT (SELECT count(*)::int FROM users WHERE id = ${keptId}) AS users,
               (SELECT count(*)::int FROM sessions WHERE user_id = ${keptId}
                  AND session_token LIKE 'admin.%') AS admin_sessions,
               (SELECT count(*)::int FROM sessions WHERE user_id = ${keptId}
                  AND session_token LIKE 'florist.%') AS florist_sessions`;

      expect(notDemo).toEqual({ kind: "refused", reason: "not_demo" });
      expect(added.kind).toBe("added");
      expect(member?.locale_code).toBe("pl");
      expect(removed).toMatchObject({
        kind: "removed",
        sessions: 2,
        userDeleted: true,
      });
      expect(left).toEqual({ users: 0, sessions: 0, members: 0 });
      expect(keptRemoved).toMatchObject({
        kind: "removed",
        sessions: 1,
        userDeleted: false,
      });
      expect(keptLeft).toEqual({
        users: 1,
        admin_sessions: 1,
        florist_sessions: 0,
      });
      expect(await run("remove", kept)).toEqual({
        kind: "refused",
        reason: "no_member",
      });
    });
  },
);
