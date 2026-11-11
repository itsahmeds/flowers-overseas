/**
 * The post-purchase block and the buyer's cancel against a disposable PG16 (spec 018 §5.2
 * "`getConfirmationBlock`", "Buyer cancellation"; §14 A-founder-2026-10-14b B.1, B.2; AC-9,
 * AC-28 confirmation half, AC-39, AC-43, AC-46; T-09, T-28, T-39, T-43, T-46 integration halves;
 * TASK-340).
 *
 *  - **AC-9 / AC-28:** over A6.4's 26 statuses (`walkOrderTo`), `getConfirmationBlock` carries the
 *    `cancelLine` part in exactly the seven statuses of set P and the rendered line with it; the
 *    masked email; the tracking link's token resolves to the order; a `demo` order has no block.
 *  - **AC-39:** the marker fixture (a partner whose legal name and id are markers, two declines, a
 *    timeout, `no_partner_available`, `manual_reroute`) walked to every status: the tracking page,
 *    its `.ics`, the not-working page, the lookup answer, T16 (HTML and text) and the block with
 *    its line, in en-gb, de and pl: no `relayMatches` hit, no marker, no partner id; "our florist"
 *    only with an `order.in_production` event.
 *  - **AC-43:** a live order at `paid_unrouted`: step 1 current; the invoice tile `pending` until
 *    the invoice renders, then `issued`.
 *  - **AC-28:** `cancelOrderAsBuyer` confirmed from each state of set P on a `test` purchase paid
 *    on spec 013's fake provider: one `order_event` by `buyer`, status `cancelled`, and, through
 *    spec 013's cancel handler, one full refund of `buyer_total_minor` on the fake (none from
 *    `authorised`, where nothing was captured); `review` writes nothing; from `in_production` no
 *    event, no outbox row, no refund; a double submit and two concurrent confirms write one event
 *    and request one refund; a confirm racing the production start (pre-check passed, lock lost)
 *    is refused with nothing written; another draft's reference writes nothing (404).
 *  - **AC-46:** Warsaw, delivery on 25 October 2026 (the DST night), accepted three days ahead:
 *    at 05:59:59 the production tick starts nothing, the block has its line and the buyer can
 *    still cancel a twin order; at 06:00:00 (05:00Z, CET) the tick writes `in_production`, the
 *    tracking page reads "Being made" dated 06:00 CET with the florist line, the block has no
 *    line, a confirm is refused; no "refund" or "cannot deliver" in either order content.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createTranslator } from "next-intl";

import { relayMatches } from "@/config/honesty";
import { PAYMENT_METHODS } from "@/config/payment-methods";
import type { LocaleCode } from "@/config/locales";
import { formatDate, loadMessages } from "@/modules/i18n";
import { MESSAGE_NAMESPACES } from "@/modules/i18n/messages";
import { renderTrackingLinkEmail } from "@/modules/notifications/emails";
import {
  dispatchOutbox,
  getConfirmationBlock,
  getTrackingView,
  tracking,
  type ConfirmationBlock,
  type HandlerRegistry,
  type OrderExecutor,
} from "@/modules/orders";
import { buyerRefundLines } from "@/modules/orders/buyer-refund-lines";
import { cancelOrderAsBuyer } from "@/modules/orders/buyer-cancel";
import { paymentsOutboxHandler, runProductionStart } from "@/modules/payments";
import { FakePaymentProvider } from "@/modules/payments/fake";
import {
  startPayment,
  syncFromProvider,
  type LifecycleDeps,
  type PaymentTransaction,
} from "@/modules/payments/lifecycle";
import type { MethodSources } from "@/modules/payments/methods";

import { SET_P, STATES } from "../fixtures/order-machine.ts";
import {
  applyTransition,
  insertPlacedOrder,
  shortestPath,
  walkOrderTo,
} from "../fixtures/order-state.ts";
import { base, country, customer, recipient, unique } from "./support/rows.ts";
import {
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

vi.mock("next-intl/server", () => ({
  getTranslations: ({
    locale,
    namespace,
  }: {
    locale: string;
    namespace?: string;
  }) =>
    Promise.resolve(
      createTranslator({
        locale,
        messages: loadMessages(locale, MESSAGE_NAMESPACES),
        ...(namespace === undefined ? {} : { namespace }),
      } as Parameters<typeof createTranslator>[0]),
    ),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const { CancelDialog, CancelLine, PostPurchaseBlock } =
  await import("../../src/app/[locale]/(checkout)/_views/PostPurchaseBlock.tsx");
const { runBuyerCancel } =
  await import("../../src/app/[locale]/(checkout)/checkout/done/buyer-cancel.ts");
const { NotWorkingView, TrackingPageView } =
  await import("../../src/app/[locale]/(track)/track/[token]/TrackingPageView.tsx");
const { LookupPageView } =
  await import("../../src/app/[locale]/(track)/track/LookupForm.tsx");
const { calendarResponse } =
  await import("../../src/app/[locale]/(track)/track/[token]/tracking-routes.ts");

const server = await probeLocalServer();

const SECRET = "s".repeat(64);
const ORIGIN = "https://flowersoverseas.com";
const T0 = new Date("2026-10-16T08:00:00.000Z");
const FAR_DATE = "2027-12-24";
const MARKERS = {
  partner: "Zxqmarkerpartner",
  email: "zxqmarkeremail@example.test",
  name: "Zxqmarkername",
  street: "Zxqmarkerstreet 17",
};
const LINE =
  "Plans changed? You can cancel for free until we start preparing your order.";
const REFUSAL_FREE = /refund|cannot deliver|could not deliver/iu;

const METHODS_ON: MethodSources = {
  enabledFlags: new Set([
    "payments.method.card",
    "payments.method.apple-pay",
    "payments.method.google-pay",
  ]),
  registry: PAYMENT_METHODS.map((method) => ({
    ...method,
    available: method.id !== "blik",
    ...(method.id === "blik" ? {} : { processor: "stripe" as const }),
  })),
};

let fakes = 0;
function newFake(): FakePaymentProvider {
  fakes += 1;
  return new FakePaymentProvider({
    now: () => T0,
    namespace: `pp${String(fakes)}`,
  });
}

const trackingOpts = (executor: OrderExecutor) => ({
  executor,
  secret: SECRET,
  origin: ORIGIN,
});

const blockOf = (executor: OrderExecutor, orderId: string, locale = "en-gb") =>
  getConfirmationBlock(orderId, {
    locale,
    executor,
    tracking: { secret: SECRET, origin: ORIGIN },
  });

/** Visible text: inline tags vanish, block tags separate words. */
function visible(html: string): string {
  return html
    .replace(/<script>[\s\S]*?<\/script>/gu, "")
    .replace(/<\/?(?:b|em|strong|button|a|bdi)\b[^>]*>/gu, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&#x27;/gu, "'")
    .replace(/&amp;/gu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}

/** The block, its line and (for `review`) its dialog, as the state would mount them. */
async function renderBlock(
  model: ConfirmationBlock,
  locale: LocaleCode,
  cancel: { step: "review" | "refused"; line: number } | null = null,
): Promise<string> {
  const parts = await Promise.all([
    PostPurchaseBlock({ block: model, locale }),
    CancelLine({ block: model, locale, line: 1, state: cancel }),
    CancelDialog({ block: model, locale, line: 1, state: cancel }),
  ]);
  return renderToStaticMarkup(
    createElement("main", { id: "main" }, ...parts),
  ).replace(/<script>[\s\S]*?<\/script>/gu, "");
}

async function poland(tx: Tx): Promise<string> {
  await base(tx);
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone)
    VALUES ('PL', 'PLN', 800, 'Europe/Warsaw')
    ON CONFLICT (iso2) DO UPDATE SET iana_zone = EXCLUDED.iana_zone
    RETURNING id`;
  return row?.id ?? "";
}

/** A placed order whose buyer and recipient carry the markers. */
async function markedOrder(
  tx: Tx,
  mode: "demo" | "test" | "live" = "live",
): Promise<string> {
  const countryId = await poland(tx);
  const customerId = await customer(tx);
  const recipientId = await recipient(tx, customerId);
  const id = await insertPlacedOrder(tx, {
    customerId,
    recipientId,
    countryId,
    mode,
  });
  await tx`
    UPDATE "order" SET delivery_date = DATE '2026-10-25',
      buyer_snapshot = ${tx.json({ name: "Test Buyer", email: MARKERS.email })},
      recipient_snapshot = ${tx.json({
        fullName: MARKERS.name,
        addressLines: [MARKERS.street],
        postcode: "00-001",
        city: "Warszawa",
      })}
    WHERE id = ${id}`;
  return id;
}

async function markerPartner(
  tx: Tx,
  firstName: string | null,
  status: "active" | "demo" = "active",
): Promise<string> {
  const countryId = await poland(tx);
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO fulfillment_partner (code, legal_name, city_label, country_id, status,
                                     contact_email, payout_currency_code, capacity_per_day,
                                     display_first_name)
    VALUES (${unique("florist-")}, ${MARKERS.partner}, 'Warszawa', ${countryId}, ${status},
            'florist@example.test', 'PLN', 15, ${firstName})
    RETURNING id`;
  return row?.id ?? "";
}

async function assignment(
  tx: Tx,
  orderId: string,
  partnerId: string,
  attempt: number,
  response: "accept" | "decline" | "timeout",
): Promise<void> {
  await tx`
    INSERT INTO order_assignment (order_id, partner_id, offered_at, sla_expires_at,
                                  responded_at, response, attempt)
    VALUES (${orderId}, ${partnerId}, now() - interval '1 hour', now() + interval '1 hour',
            now(), ${response}, ${attempt})`;
}

describe.skipIf(server.url === undefined)(
  `spec 018 post-purchase block and buyer cancel${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "postpurchase");
    }, 600_000);
    afterAll(async () => {
      await scratch.drop();
    });

    const transactionOf =
      (): PaymentTransaction =>
      <T>(fn: (executor: OrderExecutor) => Promise<T>) =>
        scratch.sql.begin((tx) => fn(runnerOf(tx))) as Promise<T>;

    function depsOf(
      provider: FakePaymentProvider,
      clock = () => T0,
    ): LifecycleDeps {
      return {
        provider,
        transaction: transactionOf(),
        now: clock,
        alert: () => undefined,
        methodSources: () => Promise.resolve(METHODS_ON),
      };
    }

    /** A committed `test` purchase of one order (PLN 189.00), paid on the fake: `paid_unrouted`. */
    async function paidOrder(
      options: { deliveryDate?: string; totalMinor?: number } = {},
    ): Promise<{ orderId: string; fake: FakePaymentProvider }> {
      const total = options.totalMinor ?? 18_900;
      const { purchaseId, orderId } = await scratch.sql.begin(async (tx) => {
        const countryId = await country(tx, "PL");
        const customerId = await customer(tx);
        const recipientId = await recipient(tx, customerId);
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
          VALUES ('test', 'PLN', ${total}, 'en', ${customerId}) RETURNING id`;
        const id = await insertPlacedOrder(tx, {
          customerId,
          recipientId,
          countryId,
          mode: "test",
          totalMinor: total,
          purchaseId: row?.id ?? "",
        });
        await tx`UPDATE "order"
                 SET buyer_snapshot = ${tx.json({ name: "Test Buyer", email: "buyer@example.test", countryIso2: "GB" })},
                     delivery_date = ${options.deliveryDate ?? FAR_DATE}::date
                 WHERE id = ${id}`;
        return { purchaseId: row?.id ?? "", orderId: id };
      });
      const fake = newFake();
      const started = await startPayment(purchaseId, depsOf(fake));
      if (started.kind !== "started") throw new Error(started.kind);
      await fake.simulateSuccess(started.intentRef);
      const synced = await syncFromProvider(purchaseId, depsOf(fake));
      if (synced.outcome !== "captured") throw new Error(synced.outcome);
      return { orderId, fake };
    }

    const walk = (orderId: string, target: string) =>
      scratch.sql.begin((tx) => walkOrderTo(tx, orderId, target));

    const buyerCancel = (orderId: string, step: "review" | "confirm") =>
      scratch.sql.begin((tx) =>
        cancelOrderAsBuyer({ orderId, step }, { executor: runnerOf(tx) }),
      );

    async function facts(orderId: string) {
      const [row] = await scratch.sql<
        {
          status: string;
          events: number;
          buyer: number;
          outbox: number;
          refunds: number;
        }[]
      >`
        SELECT o.status,
               (SELECT count(*)::int FROM order_event e WHERE e.order_id = o.id) AS events,
               (SELECT count(*)::int FROM order_event e
                 WHERE e.order_id = o.id AND e.actor = 'buyer') AS buyer,
               (SELECT count(*)::int FROM outbox x WHERE x.order_id = o.id) AS outbox,
               (SELECT count(*)::int FROM refund r WHERE r.order_id = o.id) AS refunds
        FROM "order" o WHERE o.id = ${orderId}`;
      if (row === undefined) throw new Error("no order");
      return { ...row };
    }

    /** Delivers every pending outbox row of the order: `payments` real, the rest stubs. */
    async function deliver(
      orderId: string,
      fake: FakePaymentProvider,
    ): Promise<void> {
      const handlers: HandlerRegistry = {
        payments: paymentsOutboxHandler(depsOf(fake)),
        routing: () => Promise.resolve(),
        invoices: () => Promise.resolve(),
        notifications: () => Promise.resolve(),
        "analytics.ga4": () => Promise.resolve(),
        risk: () => Promise.resolve(),
        reviews: () => Promise.resolve(),
        payouts: () => Promise.resolve(),
      };
      for (let run = 0; run < 10; run += 1) {
        const counts = await dispatchOutbox({
          handlers,
          transaction: transactionOf(),
          orderId,
        });
        if (counts.claimed === 0) return;
      }
    }

    const refundCalls = (fake: FakePaymentProvider) =>
      fake.calls.filter((call) => call.method === "refund");

    it("AC-9, AC-28: the line's part in exactly the seven statuses of set P; masked email; the tracking link opens the order", async () => {
      const results = await rolledBack(scratch.sql, async (tx) => {
        const out: {
          status: string;
          block: ConfirmationBlock;
          html: string;
          resolves: boolean;
        }[] = [];
        for (const state of STATES) {
          const id = await markedOrder(tx);
          await walkOrderTo(tx, id, state.key);
          const block = await blockOf(runnerOf(tx), id);
          const token = block.trackingUrl.split("/track/")[1] ?? "";
          const resolved = await tracking.resolve(
            token,
            trackingOpts(runnerOf(tx)),
          );
          out.push({
            status: state.key,
            block,
            html: await renderBlock(block, "en-gb"),
            resolves: resolved.ok && resolved.orderId === id,
          });
        }
        const demo = await markedOrder(tx, "demo");
        const demoError = await blockOf(runnerOf(tx), demo).then(
          () => null,
          (error: unknown) => String(error),
        );
        return { out, demoError };
      });
      expect(results.out).toHaveLength(26);
      const withLine = results.out
        .filter((row) => row.block.cancelLine !== null)
        .map((row) => row.status)
        .sort();
      expect(withLine).toEqual([...SET_P].sort());
      for (const { status, block, html, resolves } of results.out) {
        const inP = (SET_P as readonly string[]).includes(status);
        expect(block.maskedEmail, status).toBe("z•••@example.test");
        expect(resolves, status).toBe(true);
        expect(block.trackingPath, status).toMatch(/^\/en-gb\/track\/[^/]+$/u);
        expect(block.invoice, status).toBe("pending");
        expect(visible(html).includes(LINE), status).toBe(inP);
        if (inP) {
          expect(block.cancelLine?.amount, status).toEqual({
            amountMinor: 18_900,
            currencyCode: "PLN",
          });
          expect(html, status).toMatch(
            /data-fo-cancel-line=""[^>]*>.*<\/div><\/main>$/u,
          );
          expect(visible(html), status).not.toMatch(REFUSAL_FREE);
        }
        expect(html, status).not.toContain(MARKERS.email);
      }
      expect(results.demoError).toMatch(/demo order has no block/u);
    });

    it("AC-39: the marker fixture over every status: tracking, .ics, not-working, lookup answer, T16 and the block, in en-gb, de and pl", async () => {
      const failures = await rolledBack(scratch.sql, async (tx) => {
        const edges = await tx<{ from: string; event: string; to: string }[]>`
          SELECT from_status AS "from", event, to_status AS "to" FROM order_transition`;
        const florist = await markerPartner(tx, null);
        const other = await markerPartner(tx, "Zxqother");
        const bad: string[] = [];
        for (const state of STATES) {
          const id = await markedOrder(tx);
          // The history, when the target can still be reached after it.
          const viaHistory =
            shortestPath(edges, "manual_reroute", state.key) !== undefined;
          await assignment(tx, id, other, 1, "decline");
          await assignment(tx, id, other, 2, "decline");
          await assignment(tx, id, other, 3, "timeout");
          await assignment(tx, id, florist, 4, "accept");
          if (viaHistory) {
            await applyTransition(tx, id, "order.captured", "paid_unrouted");
            await applyTransition(tx, id, "order.routed", "routed");
            await applyTransition(tx, id, "assignment.declined", "routed");
            await applyTransition(tx, id, "assignment.declined", "routed");
            await applyTransition(tx, id, "assignment.timed_out", "routed");
            await applyTransition(
              tx,
              id,
              "order.no_partner_available",
              "no_partner_available",
            );
            await applyTransition(
              tx,
              id,
              "order.manual_reroute",
              "manual_reroute",
            );
          }
          await walkOrderTo(tx, id, state.key);
          const [produced] = await tx<{ p: boolean }[]>`
            SELECT EXISTS (SELECT 1 FROM order_event WHERE order_id = ${id}
                           AND to_status = 'in_production') AS p`;
          for (const locale of ["en-gb", "de", "pl"] as const) {
            const view = await getTrackingView(id, {
              executor: runnerOf(tx),
              refundLines: buyerRefundLines,
            });
            const link = await tracking.linkFor(
              id,
              locale,
              trackingOpts(runnerOf(tx)),
            );
            const token = link.split("/track/")[1] ?? "";
            const ics = await (
              await calendarResponse(token, locale, {
                ...trackingOpts(runnerOf(tx)),
                now: () => new Date("2026-10-20T10:00:00Z"),
                host: "flowersoverseas.com",
              })
            ).text();
            const mail = renderTrackingLinkEmail({
              locale,
              reference: view.reference,
              link,
            });
            const block = await blockOf(runnerOf(tx), id, locale);
            const surfaces: Record<string, string> = {
              tracking: renderToStaticMarkup(
                await TrackingPageView({
                  locale,
                  view,
                  photoHref: `/${locale}/track/T/photo`,
                  calendarHref: `/${locale}/track/T/calendar.ics`,
                }),
              ),
              ics,
              notWorking: renderToStaticMarkup(
                await NotWorkingView({ locale }),
              ),
              lookup: renderToStaticMarkup(
                await LookupPageView({ locale, sent: true }),
              ),
              t16: `${mail.subject}\n${mail.html}\n${mail.text}`,
              block: await renderBlock(block, locale),
              dialog: await renderBlock(block, locale, {
                step: "review",
                line: 1,
              }),
            };
            for (const [surface, body] of Object.entries(surfaces)) {
              const where = `${state.key} ${locale} ${surface}`;
              const hits = relayMatches(visible(body), locale);
              if (hits.length > 0)
                bad.push(`${where}: relay ${JSON.stringify(hits)}`);
              if (body.includes(MARKERS.partner))
                bad.push(`${where}: partner name`);
              if (body.includes("Zxqother"))
                bad.push(`${where}: other partner`);
              if (body.includes(florist) || body.includes(other)) {
                bad.push(`${where}: partner id`);
              }
              const florists =
                /our florist|unser(?:e|em)? Florist|nasz(?:a|ej)? florystk|nasz(?:ego)? florysty/iu;
              if (
                surface === "tracking" &&
                !(produced?.p ?? false) &&
                florists.test(visible(body))
              ) {
                bad.push(`${where}: "our florist" before production`);
              }
              if (surface === "block" && florists.test(visible(body))) {
                bad.push(`${where}: "our florist" on the block`);
              }
            }
          }
        }
        return bad;
      });
      expect(failures).toEqual([]);
    });

    it("AC-43: at paid_unrouted step 1 is current; the invoice tile is pending, then issued once rendered", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const id = await markedOrder(tx);
        await walkOrderTo(tx, id, "paid_unrouted");
        const before = await blockOf(runnerOf(tx), id);
        await tx`INSERT INTO invoice_profile (key, supply_model, destination_iso2, document_kind,
                   title_key, label_locales, vat_bearing_line_kinds, series_key,
                   credit_series_key, active)
                 VALUES ('test-profile', 'principal', 'PL', 'vat_invoice', 'invoice.title.vatInvoice',
                   ARRAY['pl'], ARRAY['product'], 'fo-pl-2026', 'fok-pl-2026', true)
                 ON CONFLICT (key) DO NOTHING`;
        const [invoice] = await tx<{ id: string }[]>`
          INSERT INTO invoice (kind, order_id, series_key, number, issued_at, supply_date,
                               currency_code, total_minor, profile_key, snapshot, snapshot_version)
          VALUES ('invoice', ${id}, 'fo-pl-2026', ${unique("FO-PL/2026/")}, now(),
                  DATE '2026-10-25', 'PLN', 18900, 'test-profile', '{"lines": []}'::jsonb, 1)
          RETURNING id`;
        const issuedUnrendered = await blockOf(runnerOf(tx), id);
        await tx`UPDATE invoice SET pdf_object_key = 'invoices/2026/x.pdf',
                   pdf_sha256 = ${"0".repeat(64)}, rendered_at = now()
                 WHERE id = ${invoice?.id ?? ""}`;
        const rendered = await blockOf(runnerOf(tx), id);
        return {
          before,
          issuedUnrendered,
          rendered,
          html: await renderBlock(rendered, "en-gb"),
        };
      });
      expect(result.before.steps.map((step) => step.state)).toEqual([
        "current",
        "future",
        "future",
        "future",
      ]);
      expect(result.before.invoice).toBe("pending");
      expect(result.issuedUnrendered.invoice).toBe("pending");
      expect(result.rendered.invoice).toBe("issued");
      expect(visible(result.html)).toContain("We have emailed it to you.");
      expect(visible(result.html)).not.toMatch(
        /\bheld\b|\bhold\b|authori[sz]|not yet charged|accept/iu,
      );
    });

    describe("AC-28: the buyer's cancel", () => {
      for (const state of SET_P) {
        it(`confirm from ${state}: one buyer event, cancelled, one full refund through spec 013's handler`, async () => {
          // `authorised` follows no capture (no launch path reaches it): a placed order walked there.
          const { orderId: id, fake } =
            state === "authorised"
              ? {
                  orderId: await scratch.sql.begin(async (tx) => {
                    const countryId = await country(tx, "PL");
                    const customerId = await customer(tx);
                    const recipientId = await recipient(tx, customerId);
                    return insertPlacedOrder(tx, {
                      customerId,
                      recipientId,
                      countryId,
                      mode: "test",
                    });
                  }),
                  fake: newFake(),
                }
              : await paidOrder();
          if (state !== "paid_unrouted") await walk(id, state);
          const before = await facts(id);
          const review = await buyerCancel(id, "review");
          expect(review).toEqual({
            kind: "review",
            amount: { amountMinor: 18_900, currencyCode: "PLN" },
          });
          expect(await facts(id)).toEqual(before);

          expect(await buyerCancel(id, "confirm")).toEqual({
            kind: "cancelled",
          });
          const [event] = await scratch.sql<
            {
              actor: string;
              from_status: string;
              to_status: string;
              type: string;
              reason: string;
            }[]
          >`SELECT actor, from_status, to_status, type, payload ->> 'reason' AS reason
            FROM order_event WHERE order_id = ${id} ORDER BY seq DESC LIMIT 1`;
          expect({ ...event }).toEqual({
            actor: "buyer",
            from_status: state,
            to_status: "cancelled",
            type: "order.cancelled",
            reason: "buyer_cancel",
          });
          const after = await facts(id);
          expect(after.status).toBe("cancelled");
          expect(after.buyer).toBe(1);
          expect(after.events).toBe(before.events + 1);

          await deliver(id, fake);
          const refunds = await scratch.sql<
            { amount_minor: string; status: string; reason: string }[]
          >`
            SELECT amount_minor, status, reason FROM refund WHERE order_id = ${id}`;
          if (state === "authorised") {
            expect(refunds).toHaveLength(0);
          } else {
            expect(refunds.map((row) => ({ ...row }))).toEqual([
              {
                amount_minor: "18900",
                status: "succeeded",
                reason: "buyer_cancel",
              },
            ]);
            expect(refundCalls(fake)).toHaveLength(1);
          }
        });
      }

      it("from in_production (and later): refused, no event, no outbox row, no refund, status unchanged", async () => {
        for (const late of [
          "in_production",
          "out_for_delivery",
          "delivered",
          "closed",
        ]) {
          const { orderId, fake } = await paidOrder();
          await walk(orderId, late);
          const before = await facts(orderId);
          expect(await buyerCancel(orderId, "review"), late).toEqual({
            kind: "refused",
          });
          expect(await buyerCancel(orderId, "confirm"), late).toEqual({
            kind: "refused",
          });
          expect(await facts(orderId), late).toEqual(before);
          await deliver(orderId, fake);
          expect(refundCalls(fake), late).toHaveLength(0);
        }
      });

      it("placed (payment not confirmed) is refused and writes nothing", async () => {
        const id = await scratch.sql.begin(async (tx) => {
          const countryId = await country(tx, "PL");
          const customerId = await customer(tx);
          const recipientId = await recipient(tx, customerId);
          return insertPlacedOrder(tx, {
            customerId,
            recipientId,
            countryId,
            mode: "live",
          });
        });
        const before = await facts(id);
        expect(await buyerCancel(id, "confirm")).toEqual({ kind: "refused" });
        expect(await facts(id)).toEqual(before);
      });

      it("a double submit, and two concurrent confirms: one event, one refund", async () => {
        const first = await paidOrder();
        await walk(first.orderId, "paid");
        expect(await buyerCancel(first.orderId, "confirm")).toEqual({
          kind: "cancelled",
        });
        expect(await buyerCancel(first.orderId, "confirm")).toEqual({
          kind: "cancelled",
        });
        expect((await facts(first.orderId)).buyer).toBe(1);
        await deliver(first.orderId, first.fake);
        expect(refundCalls(first.fake)).toHaveLength(1);

        const second = await paidOrder();
        await walk(second.orderId, "accepted");
        const both = await Promise.all([
          buyerCancel(second.orderId, "confirm"),
          buyerCancel(second.orderId, "confirm"),
        ]);
        expect(both).toEqual([{ kind: "cancelled" }, { kind: "cancelled" }]);
        const after = await facts(second.orderId);
        expect(after.buyer).toBe(1);
        expect(after.status).toBe("cancelled");
        await deliver(second.orderId, second.fake);
        expect(refundCalls(second.fake)).toHaveLength(1);
      });

      it("a confirm racing the production start: the pre-check passes, the lock is lost, nothing is written", async () => {
        const { orderId, fake } = await paidOrder();
        await walk(orderId, "paid");
        let racing: Promise<unknown> | undefined;
        await scratch.sql.begin(async (tx) => {
          await tx`SELECT id FROM "order" WHERE id = ${orderId} FOR UPDATE`;
          await applyTransition(
            tx,
            orderId,
            "order.in_production",
            "in_production",
          );
          // The cancel reads `paid` (this write is not committed) and then waits on the lock.
          racing = buyerCancel(orderId, "confirm");
          await new Promise((resolve) => {
            setTimeout(resolve, 300);
          });
        });
        expect(await racing).toEqual({ kind: "refused" });
        const after = await facts(orderId);
        expect(after.status).toBe("in_production");
        expect(after.buyer).toBe(0);
        await deliver(orderId, fake);
        expect(refundCalls(fake)).toHaveLength(0);
      });

      it("another draft's reference: 404, nothing written", async () => {
        const mine = await paidOrder();
        const theirs = await paidOrder();
        const before = await facts(theirs.orderId);
        const answer = await runBuyerCancel(
          { locale: "en-gb", reference: "FO-THEI-RSXX", step: "confirm" },
          {
            confirmation: () =>
              Promise.resolve({
                kind: "placed",
                mode: "test",
                total: { amountMinor: 18_900, currency: "PLN" },
                deliveries: [
                  {
                    orderId: mine.orderId,
                    reference: "FO-MINE-0001",
                    sku: null,
                    productName: "Amber Hour",
                    tier: null,
                    countryIso: "PL",
                    recipientName: "R",
                    address: "A",
                    city: "Warszawa",
                    deliveryDate: FAR_DATE,
                    card: null,
                    addonNameKeys: [],
                    amount: { amountMinor: 18_900, currency: "PLN" },
                  },
                ],
              } as never),
            cancel: (input) =>
              scratch.sql.begin((tx) =>
                cancelOrderAsBuyer(input, { executor: runnerOf(tx) }),
              ),
          },
        );
        expect(answer).toEqual({ kind: "not_found" });
        expect(await facts(theirs.orderId)).toEqual(before);
        expect((await facts(mine.orderId)).buyer).toBe(0);
      });
    });

    it("AC-46: Warsaw, delivered on the DST night, accepted three days ahead: 05:59:59 cancellable, 06:00:00 being made", async () => {
      const D = "2026-10-25";
      const { orderId } = await paidOrder({ deliveryDate: D });
      const twin = await paidOrder({ deliveryDate: D });
      const florist = await scratch.sql.begin(async (tx) => {
        // A `test` order is offered only to a `demo` partner (`ASSIGNMENT_MODE_MISMATCH`).
        const id = await markerPartner(tx, "Anna", "demo");
        await assignment(tx, orderId, id, 1, "accept");
        return id;
      });
      expect(florist).not.toBe("");
      // Accepted on D-3: routed, accepted and captured at that time, then nothing until D.
      const acceptedAt = new Date("2026-10-22T09:00:00Z");
      for (const id of [orderId, twin.orderId]) {
        await scratch.sql.begin(async (tx) => {
          await applyTransition(tx, id, "order.routed", "routed", acceptedAt);
          await applyTransition(
            tx,
            id,
            "assignment.accepted",
            "accepted",
            acceptedAt,
          );
          await applyTransition(tx, id, "order.captured", "paid", acceptedAt);
        });
      }
      const tick = (at: string) =>
        runProductionStart({
          transaction: transactionOf(),
          now: () => new Date(at),
        });
      const pageOf = async () => {
        const view = await scratch.sql.begin((tx) =>
          getTrackingView(orderId, {
            executor: runnerOf(tx),
            refundLines: buyerRefundLines,
          }),
        );
        const block = await scratch.sql.begin((tx) =>
          blockOf(runnerOf(tx), orderId),
        );
        return {
          view,
          tracking: renderToStaticMarkup(
            await TrackingPageView({
              locale: "en-gb",
              view,
              photoHref: "/en-gb/track/T/photo",
              calendarHref: "/en-gb/track/T/calendar.ics",
            }),
          ),
          block,
          html: await renderBlock(block, "en-gb"),
        };
      };

      // 05:59:59 Warsaw (CET after the night's change): 04:59:59Z.
      expect((await tick("2026-10-25T04:59:59Z")).started).toBe(0);
      const before = await pageOf();
      expect(before.view.projection).toBe("confirmed");
      expect(before.tracking).toMatch(
        /data-fo-track-headline="confirmed"[^>]*>We have your order</u,
      );
      expect(before.tracking).not.toContain("data-fo-track-florist");
      expect(before.block.cancelLine).not.toBeNull();
      expect(visible(before.html)).toContain(LINE);
      // The twin is still cancellable at that second.
      expect(await buyerCancel(twin.orderId, "confirm")).toEqual({
        kind: "cancelled",
      });

      // 06:00:00 Warsaw: 05:00:00Z.
      expect((await tick("2026-10-25T05:00:00Z")).started).toBe(1);
      const after = await pageOf();
      expect(after.view.projection).toBe("being_made");
      const step = after.view.timeline.steps.find(
        (each) => each.step === "being_made",
      );
      // The step is dated at the `order.in_production` event's own time (the engine stamps it with
      // the database clock, not the tick's injected one), printed in Warsaw time with its zone.
      const [produced] = await scratch.sql<{ at: Date; actor: string }[]>`
        SELECT occurred_at AS at, actor FROM order_event
        WHERE order_id = ${orderId} AND to_status = 'in_production'`;
      expect(produced?.actor).toBe("system:payments.production_start");
      expect(step?.at?.toISOString()).toBe(produced?.at.toISOString());
      const printed = formatDate(
        produced?.at ?? new Date(0),
        "en-gb",
        "stepTime",
        "Europe/Warsaw",
      );
      expect(printed).toMatch(/\bCES?T\b/u);
      expect(visible(after.tracking)).toContain(printed);
      expect(after.tracking).toMatch(
        /data-fo-track-headline="being_made"[^>]*>Being made</u,
      );
      expect(after.tracking).toContain("data-fo-track-florist");
      expect(after.block.cancelLine).toBeNull();
      expect(after.html).not.toContain("data-fo-cancel-line");
      expect(after.html).toMatch(
        /aria-current="step"[^>]*data-fo-post-purchase-step="beingMade"/u,
      );
      const refused = await buyerCancel(orderId, "confirm");
      expect(refused).toEqual({ kind: "refused" });
      expect((await facts(orderId)).buyer).toBe(0);

      // The order content of both surfaces, without the site chrome: no refund or failure text.
      for (const page of [before, after]) {
        const headline =
          page.tracking.match(
            /<h1[^>]*data-fo-track-headline[\s\S]*?<\/h1>/u,
          )?.[0] ?? "";
        const timeline = page.tracking.match(/<ol[\s\S]*?<\/ol>/u)?.[0] ?? "";
        const floristLine =
          page.tracking.match(/data-fo-track-florist[\s\S]*?<\/div>/u)?.[0] ??
          "";
        expect(headline).not.toBe("");
        expect(timeline).not.toBe("");
        for (const part of [headline, timeline, floristLine, page.html]) {
          expect(visible(part)).not.toMatch(REFUSAL_FREE);
        }
      }
    });
  },
);
