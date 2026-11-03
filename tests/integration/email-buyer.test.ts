/**
 * The registered buyer templates against migrated tables (spec 016 §5.2, §8 "Minimisation",
 * "Price display"; the database half of T-21, T-24, T-25, T-40, T-41 and T-45; TASK-333).
 *
 * On a scratch PG16 (`support/scratch-db.ts`), every case in a rolled-back transaction, the
 * renderers running as `app_web` in the `system` context (row-level security on), as the pipeline
 * runs them. The orders carry marker values in every person field the database has; the emails may
 * print the recipient's name and city and the buyer's first name, never the street, the phones, the
 * card message or the buyer's email.
 *
 *  - B1 for a two-order `live` purchase stored out of date order: one email, the orders sorted by
 *    delivery date then reference, the purchase's own total, the terms PDF of the orders' version,
 *    the account link to the account; a purchase whose version has no terms PDF is refused.
 *  - B2, B3: the order's facts in the buyer's locale and the destination's zone.
 *  - B4: the `order.delivered` instant read in Warsaw, the newest photo's bytes attached.
 *  - B5: the order's own charged total; who cancelled read from the event's actor class.
 *  - B6: the succeeded refunds through spec 013's `succeededRefunds` (`buyerRefundLines`),
 *    oldest first, and the status of a `refunded_full` order read "Closed".
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";

import type { NotificationRenderInput } from "@/modules/notifications";
import {
  type BuyerFactSources,
  TermsPdfMissing,
  renderBuyerNotification,
} from "../../src/modules/notifications/emails";
import { buyerRefundLines } from "../../src/modules/orders/buyer-refund-lines";

import { registerFixtureEventSchemas } from "../fixtures/order-engine.ts";
import {
  applyTransition,
  insertPlacedOrder,
  walkOrderTo,
} from "../fixtures/order-state.ts";
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

const ORIGIN = "https://staging.example.test";
const RECIPIENT_STREET = "Markerstreet 9";
const RECIPIENT_PHONE = "+48500333444";
const CARD_MESSAGE = "Markercard message for Anna";
const BUYER_EMAIL = "marker-buyer-7731@example.test";
const BUYER_PHONE = "+48500111222";
const FORBIDDEN = [
  RECIPIENT_STREET,
  RECIPIENT_PHONE,
  CARD_MESSAGE,
  BUYER_EMAIL,
  BUYER_PHONE,
];
const PHOTO = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD";

const SOURCES: BuyerFactSources = {
  refundLines: (orderId, options) => buyerRefundLines(orderId, options),
  photoContent: () => Promise.resolve(PHOTO),
  trackingLink: (orderId, locale) =>
    Promise.resolve(`${ORIGIN}/${locale}/track/token-${orderId.slice(0, 8)}`),
  termsPdf: (version) =>
    version === "2026-10"
      ? {
          filename: `flowers-overseas-terms-${version}.pdf`,
          url: `https://media.example.test/legal/terms-${version}.pdf`,
        }
      : null,
  siteOrigin: () => ORIGIN,
};

/** `Intl`'s no-break and narrow no-break spaces read as plain spaces. */
function spaces(value: string): string {
  return value.replaceAll(/[  ]/gu, " ");
}

interface Purchase {
  readonly purchaseId: string;
  /** Warsaw, Sunday 18 October 2026 (inserted first). */
  readonly warsaw: string;
  /** Kraków, Saturday 17 October 2026 (inserted second). */
  readonly krakow: string;
}

async function product(tx: Tx, name: string, sku: string): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES (${sku}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
    ON CONFLICT (sku) DO UPDATE SET sku = EXCLUDED.sku
    RETURNING id`;
  const id = row?.id ?? "";
  await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
           VALUES (${id}, 'en', ${name}, ${make.unique("p-")})
           ON CONFLICT DO NOTHING`;
  await tx`INSERT INTO product_tier (product_id, tier_key, label_key, stems, sort, is_default)
           VALUES (${id}, 'stems_18', 'catalog.tier.stems', 18, 0, true)
           ON CONFLICT DO NOTHING`;
  return id;
}

/** A `live` purchase of two orders, the later delivery stored first, in `en-gb`. */
async function purchase(tx: Tx): Promise<Purchase> {
  const parents = await make.orderParents(tx);
  await tx`INSERT INTO locale (code, bcp47, name, fallback_code)
           VALUES ('en-gb', 'en-GB', 'English (UK)', 'en') ON CONFLICT DO NOTHING`;
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
    VALUES ('live', 'PLN', 33800, 'en-gb', ${parents.customerId})
    RETURNING id`;
  const purchaseId = row?.id ?? "";
  const amber = await product(tx, "Amber Hour", "FO-BQ-333A");
  const vistula = await product(tx, "Vistula Red", "FO-BQ-333V");
  const order = async (
    total: number,
    date: string,
    city: string,
    fullName: string,
    productId: string,
  ): Promise<string> => {
    const id = await insertPlacedOrder(tx, {
      ...parents,
      mode: "live",
      totalMinor: total,
      purchaseId,
    });
    await tx`UPDATE "order" SET
      delivery_date = ${date}::date,
      locale_code = 'en-gb',
      buyer_snapshot = ${tx.json({ name: "  Sam  Taylor ", email: BUYER_EMAIL, phoneE164: BUYER_PHONE, countryIso2: "GB" })},
      recipient_snapshot = ${tx.json({
        fullName,
        addressLines: [RECIPIENT_STREET],
        phoneE164: RECIPIENT_PHONE,
        cardMessage: CARD_MESSAGE,
        city,
        postcode: "30-001",
        placeKind: "home",
      })}
      WHERE id = ${id}`;
    await tx`INSERT INTO order_line (order_id, kind, product_id, tier_key, qty, unit_retail_minor,
                                     currency_code, vat_rate_bp)
             VALUES (${id}, 'product', ${productId}, 'stems_18', 1, ${total}, 'PLN', 800)`;
    return id;
  };
  const warsaw = await order(
    18900,
    "2026-10-18",
    "Warszawa",
    "Jan Przykładowy",
    vistula,
  );
  const krakow = await order(
    14900,
    "2026-10-17",
    "Kraków",
    "Anna Kowalska",
    amber,
  );
  return { purchaseId, warsaw, krakow };
}

function input(
  tx: Tx,
  over: Partial<NotificationRenderInput>,
): NotificationRenderInput {
  return {
    template: "order-received",
    audience: "buyer",
    locale: "en-gb",
    trigger: "order.captured",
    fromStatus: "placed",
    orderId: null,
    purchaseId: null,
    assignmentId: null,
    partnerId: null,
    invoiceId: null,
    link: null,
    inboxUrl: null,
    whatsappCopyOf: null,
    executor: runnerOf(tx),
    ...over,
  };
}

function scan(parts: { subject: string; html: string; text: string }): void {
  for (const marker of FORBIDDEN) {
    expect(parts.subject).not.toContain(marker);
    expect(parts.html).not.toContain(marker);
    expect(parts.text).not.toContain(marker);
  }
}

describe.skipIf(server.url === undefined)(
  `the buyer templates${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "buyer_emails");
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("B1: one email for the purchase, orders by date, the purchase's total, the terms, no person but the names and cities", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const p = await purchase(tx);
        await asApp(tx, { role: "system" });
        return renderBuyerNotification(
          "order-received",
          input(tx, { purchaseId: p.purchaseId }),
          SOURCES,
        );
      });
      scan(result);
      const text = spaces(result.text);
      expect(
        text.startsWith(
          "Thank you, Sam.\nYour flowers arrive on the dates below.\n\nYour flowers arrive in Kraków on Saturday 17 October.",
        ),
      ).toBe(true);
      expect(text.indexOf("Kraków on Saturday 17 October")).toBeLessThan(
        text.indexOf("Warszawa on Sunday 18 October"),
      );
      expect(text).toContain("Your order: Amber Hour · 18 stems");
      expect(text).toContain("Recipient: Anna Kowalska, Kraków");
      expect(text).toContain("Recipient: Jan Przykładowy, Warszawa");
      expect(text).toContain(
        "Total paid PLN 338.00 (Includes VAT and delivery)",
      );
      expect(text).toContain(`${ORIGIN}/en-gb/account`);
      expect(text).not.toContain("/account/orders/");
      expect(result.subject).toMatch(
        /^We have your order FO-[0-9A-Z]{4}-[0-9A-Z]{4}$/u,
      );
      expect(result.attachments).toStrictEqual([
        {
          filename: "flowers-overseas-terms-2026-10.pdf",
          path: "https://media.example.test/legal/terms-2026-10.pdf",
          contentType: "application/pdf",
        },
      ]);
      expect(text).toContain("Our terms are attached.");
    });

    it("B1: refused while the orders' terms version has no PDF", async () => {
      await expect(
        rolledBack(scratch.sql, async (tx) => {
          const p = await purchase(tx);
          await tx`UPDATE "order" SET terms_version = '2027-01' WHERE purchase_id = ${p.purchaseId}`;
          await asApp(tx, { role: "system" });
          return renderBuyerNotification(
            "order-received",
            input(tx, { purchaseId: p.purchaseId }),
            SOURCES,
          );
        }),
      ).rejects.toBeInstanceOf(TermsPdfMissing);
    });

    it("B2, B3, B4: the order's facts, the delivery time in Warsaw, the photo attached", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const p = await purchase(tx);
        await walkOrderTo(tx, p.krakow, "out_for_delivery");
        // 11:42 in Warsaw (CEST) on 17 October 2026.
        await applyTransition(
          tx,
          p.krakow,
          "order.delivered",
          "delivered",
          new Date("2026-10-17T09:42:00Z"),
        );
        await walkOrderTo(tx, p.krakow, "photo_uploaded");
        const assetId = await make.mediaAsset(tx);
        await tx`
          INSERT INTO delivery_proof (order_id, media_asset_id, uploaded_by, public_use_consent)
          VALUES (${p.krakow}, ${assetId}, 'partner', false)`;
        await asApp(tx, { role: "system" });
        const of = (
          template: "being-made" | "out-for-delivery" | "delivered-photo",
        ) =>
          renderBuyerNotification(
            template,
            input(tx, { template, orderId: p.krakow }),
            SOURCES,
          );
        return {
          b2: await of("being-made"),
          b3: await of("out-for-delivery"),
          b4: await of("delivered-photo"),
        };
      });
      for (const message of Object.values(result)) scan(message);
      expect(spaces(result.b2.text)).toContain(
        "Our florist is making your order. It arrives on Saturday 17 October.",
      );
      expect(result.b2.text).toMatch(
        /^Order FO-[0-9A-Z]{4}-[0-9A-Z]{4} to Kraków, Saturday 17 October\n/u,
      );
      expect(spaces(result.b3.text)).toContain(
        "They arrive today, Saturday 17 October.",
      );
      expect(result.b4.subject).toBe(
        "Delivered in Kraków. Here is your photo.",
      );
      expect(spaces(result.b4.text)).toContain(
        "Your flowers reached Kraków at 11:42 on Saturday 17 October.\nDelivered to Anna",
      );
      expect(result.b4.html).toContain('width="600" height="750"');
      expect(result.b4.attachments?.map((file) => file.content)).toStrictEqual([
        PHOTO,
        PHOTO,
      ]);
    });

    it("B5 and B6: the order's own amounts, the refunds from their rows, Closed for a full refund", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const p = await purchase(tx);
        await walkOrderTo(tx, p.warsaw, "cancelled");
        await walkOrderTo(tx, p.krakow, "refunded_full");
        const [payment] = await tx<{ id: string }[]>`
          INSERT INTO payment (purchase_id, provider, provider_ref, status, method, amount_minor,
                               currency_code, livemode, capture_method, amount_captured_minor,
                               captured_at)
          VALUES (${p.purchaseId}, 'stripe', 'pi_buyer_333', 'captured', 'card', 33800, 'PLN',
                  true, 'automatic', 33800, now())
          RETURNING id`;
        const refund = (
          amount: number,
          status: string,
          at: string | null,
        ) => tx`
          INSERT INTO refund (payment_id, order_id, purchase_id, provider_ref, amount_minor,
                              currency_code, reason, status, requested_by, succeeded_at)
          VALUES (${payment?.id ?? ""}, ${p.krakow}, ${p.purchaseId},
                  ${`re_${amount}_${status}`}, ${amount}, 'PLN', 'quality', ${status},
                  'system:payments', ${at}::timestamptz)`;
        // Stored newest first; one pending and one failed print nothing.
        await refund(4900, "succeeded", "2026-10-12T10:00:00Z");
        await refund(9998, "succeeded", "2026-10-09T22:30:00Z");
        await refund(1, "pending", null);
        await refund(1, "failed", null);
        await asApp(tx, { role: "system" });
        return {
          b5: await renderBuyerNotification(
            "cancelled",
            input(tx, { template: "cancelled", orderId: p.warsaw }),
            SOURCES,
          ),
          b6: await renderBuyerNotification(
            "refund",
            input(tx, { template: "refund", orderId: p.krakow }),
            SOURCES,
          ),
        };
      });
      scan(result.b5);
      scan(result.b6);
      const b5 = spaces(result.b5.text);
      // The fixture's actor is a system actor: "We could not deliver", with this order's total.
      expect(b5).toContain(
        "We could not deliver this order.\nWe have refunded PLN 189.00.",
      );
      expect(b5).toContain("Status: Cancelled");
      expect(b5).not.toContain("338.00");
      const b6 = spaces(result.b6.text);
      // 22:30 UTC on the 9th is the 10th in Warsaw; oldest first.
      expect(b6).toContain(
        "Refunded PLN 99.98 on 10 October\nRefunded PLN 49.00 on 12 October",
      );
      expect(b6).not.toMatch(/PLN 0\.01/u);
      expect(b6).toContain("Status: Closed");
      expect(`${result.b6.subject}${result.b6.html}${b6}`).not.toMatch(
        /cancel/iu,
      );
    });
  },
);
