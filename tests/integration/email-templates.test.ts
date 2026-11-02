/**
 * The registered florist and founder templates against migrated tables (spec 016 §5.2, §8
 * "Minimisation"; T-22, the database half; AC-22, AC-21; TASK-332).
 *
 * On a scratch PG16 (`support/scratch-db.ts`), every case in a rolled-back transaction, the
 * renderers running as `app_web` in the `system` context (row-level security on), as the
 * pipeline runs them. The order carries marker values in every person field the database has:
 * the recipient's name, street, phone and card message, and the buyer's name, email and phone.
 *
 *  - T-22: V1 to V5 (V4 withdrawn and timed out), the W offer and the W stop message, and A1,
 *    rendered from that order, contain none of the markers in subject, HTML or text; the W copy
 *    contains the inbox address and not the one-tap token the pipeline mints for the member.
 *  - The facts are the order's: the product's name, the tier, the town and postcode, the
 *    florist's payout from its catalogue mapping, the answer-by time in the destination's zone,
 *    and A1's offers with their outcomes.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminT } from "../../src/modules/admin/messages";
import { orderDetailHref } from "../../src/modules/admin/orders";
import {
  FLORIST_TEMPLATES,
  type OpsCopy,
  loadNoPartnerAlertFacts,
  renderFloristNotification,
  renderNoPartnerAlert,
} from "../../src/modules/notifications/emails";
import { renderWhatsappCopyNotification } from "../../src/modules/notifications/emails/ops";
import type { NotificationRenderInput } from "@/modules/notifications";

import { registerFixtureEventSchemas } from "../fixtures/order-engine.ts";
import { insertPlacedOrder } from "../fixtures/order-state.ts";
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
const INBOX_BASE = `${ORIGIN}/vendor/orders/`;
const TOKEN = "MarkerTokenQz81";

const RECIPIENT_NAME = "Markerrecipient Zebedee";
const RECIPIENT_STREET = "Markerstreet 9";
const RECIPIENT_PHONE = "+48500333444";
const CARD_MESSAGE = "Markercard message for Zebedee";
const BUYER_NAME = "Markerbuyer Quill";
const BUYER_EMAIL = "marker-buyer-7731@example.test";
const BUYER_PHONE = "+48500111222";
const MARKERS = [
  RECIPIENT_NAME,
  RECIPIENT_STREET,
  RECIPIENT_PHONE,
  CARD_MESSAGE,
  BUYER_NAME,
  BUYER_EMAIL,
  BUYER_PHONE,
];

const COPY: OpsCopy = {
  t: adminT as unknown as OpsCopy["t"],
  orderHref: orderDetailHref,
};

interface Fixture {
  readonly orderId: string;
  readonly assignmentId: string;
  readonly partnerCode: string;
}

/** A placed order to Warsaw with marker people, one line of Amber Hour, and a timed-out offer. */
async function fixture(tx: Tx): Promise<Fixture> {
  const parents = await make.orderParents(tx);
  await tx`UPDATE country SET same_day_cutoff_local = '14:00' WHERE id = ${parents.countryId}`;
  const [product] = await tx<{ id: string }[]>`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES ('FO-BQ-332', 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
    ON CONFLICT (sku) DO UPDATE SET sku = EXCLUDED.sku
    RETURNING id`;
  const productId = product?.id ?? "";
  await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
           VALUES (${productId}, 'en', 'Amber Hour', ${make.unique("amber-hour-")})
           ON CONFLICT DO NOTHING`;
  await tx`INSERT INTO product_tier (product_id, tier_key, label_key, stems, sort, is_default)
           VALUES (${productId}, 'stems_18', 'catalog.tier.stems', 18, 0, true)
           ON CONFLICT DO NOTHING`;
  const orderId = await insertPlacedOrder(tx, { ...parents, mode: "test" });
  await tx`UPDATE "order" SET
    delivery_date = DATE '2026-10-08',
    destination_postcode = '00-001',
    buyer_snapshot = ${tx.json({ name: BUYER_NAME, email: BUYER_EMAIL, phoneE164: BUYER_PHONE })},
    recipient_snapshot = ${tx.json({
      fullName: RECIPIENT_NAME,
      addressLines: [RECIPIENT_STREET],
      phoneE164: RECIPIENT_PHONE,
      cardMessage: CARD_MESSAGE,
      city: "Warszawa",
      postcode: "00-001",
    })}
    WHERE id = ${orderId}`;
  await tx`INSERT INTO order_line (order_id, kind, product_id, tier_key, qty, unit_retail_minor,
                                   currency_code, vat_rate_bp)
           VALUES (${orderId}, 'product', ${productId}, 'stems_18', 1, 18900, 'PLN', 800)`;
  const partnerId = await make.partner(tx, parents.countryId, "demo");
  await tx`INSERT INTO partner_catalog_mapping (partner_id, product_id, tier_key,
                                                partner_payout_minor, currency_code)
           VALUES (${partnerId}, ${productId}, 'stems_18', 14900, 'PLN')`;
  const [assignment] = await tx<{ id: string }[]>`
    INSERT INTO order_assignment (order_id, partner_id, offered_at, sla_expires_at, attempt,
                                  response, responded_at)
    VALUES (${orderId}, ${partnerId}, '2026-10-08T12:40:00Z', '2026-10-08T13:40:00Z', 1,
            'decline', '2026-10-08T13:00:00Z')
    RETURNING id`;
  await tx`UPDATE order_assignment SET reason = 'Call Markerrecipient Zebedee' WHERE id = ${assignment?.id ?? ""}`;
  await tx`
    INSERT INTO order_event (order_id, seq, type, actor, payload, payload_version, occurred_at)
    VALUES (${orderId}, 2, 'order.no_partner_available', 'system:order.route', '{}'::jsonb, 1,
            '2026-10-08T10:10:00Z')`;
  const [code] = await tx<{ code: string }[]>`
    SELECT code FROM fulfillment_partner WHERE id = ${partnerId}`;
  return {
    orderId,
    assignmentId: assignment?.id ?? "",
    partnerCode: code?.code ?? "",
  };
}

function input(
  tx: Tx,
  f: Fixture,
  over: Partial<NotificationRenderInput>,
): NotificationRenderInput {
  return {
    template: "offer",
    audience: "florist",
    locale: "pl",
    trigger: "assignment.offered",
    fromStatus: null,
    orderId: f.orderId,
    purchaseId: null,
    assignmentId: f.assignmentId,
    partnerId: null,
    invoiceId: null,
    link: `${ORIGIN}/vendor/sign-in/confirm?t=${TOKEN}`,
    inboxUrl: null,
    whatsappCopyOf: null,
    executor: runnerOf(tx),
    ...over,
  };
}

function scan(parts: { subject: string; html: string; text: string }): void {
  for (const marker of MARKERS) {
    expect(parts.subject).not.toContain(marker);
    expect(parts.html).not.toContain(marker);
    expect(parts.text).not.toContain(marker);
  }
}

describe.skipIf(server.url === undefined)(
  `the florist and founder templates${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "emails");
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("T-22: V1 to V5 read the order's facts and none of its people", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const f = await fixture(tx);
        await asApp(tx, { role: "system" });
        for (const template of FLORIST_TEMPLATES) {
          for (const trigger of [
            "assignment.offered",
            "assignment.timed_out",
          ] as const) {
            const rendered = await renderFloristNotification(
              template,
              input(tx, f, {
                template,
                trigger,
                link:
                  template === "offer-withdrawn" ? null : input(tx, f, {}).link,
              }),
            );
            scan(rendered);
          }
        }
        const offer = await renderFloristNotification(
          "offer",
          input(tx, f, { locale: "en" }),
        );
        const text = offer.text.replaceAll(/[  ]/gu, " ");
        expect(text).toContain("Bouquet: Amber Hour · 18 stems");
        expect(text).toContain("Town: 00-001 Warszawa");
        expect(text).toContain("You receive: 149.00 PLN");
        expect(text).toContain("Answer by 15:40");
        expect(offer.subject).toBe(
          "New order for Thu, 8 Oct · answer by 15:40",
        );
      });
    });

    it("T-22: the W copy carries the inbox address, never the member's one-tap token, and no person", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const f = await fixture(tx);
        await asApp(tx, { role: "system" });
        const inboxUrl = `${INBOX_BASE}${f.assignmentId}`;
        for (const kind of ["offer", "offer-withdrawn"] as const) {
          const rendered = await renderWhatsappCopyNotification(
            input(tx, f, {
              template: "whatsapp-copy",
              audience: "ops",
              whatsappCopyOf: kind,
              inboxUrl: kind === "offer" ? inboxUrl : null,
            }),
            COPY,
          );
          scan(rendered);
          for (const part of [rendered.subject, rendered.html, rendered.text]) {
            expect(part).not.toContain(TOKEN);
          }
          if (kind === "offer") expect(rendered.text).toContain(inboxUrl);
          expect(rendered.subject).toContain(f.partnerCode);
        }
      });
    });

    it("T-22: A1 reads the offers by their outcome only, and none of the order's people", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const f = await fixture(tx);
        await asApp(tx, { role: "system" });
        const facts = await loadNoPartnerAlertFacts(runnerOf(tx), f.orderId);
        expect(facts.city).toBe("Warszawa");
        expect(facts.sameDayCutoffLocal).toBe("14:00");
        expect(facts.exhaustedAt.toISOString()).toBe(
          "2026-10-08T10:10:00.000Z",
        );
        const rendered = renderNoPartnerAlert(facts, COPY, ORIGIN);
        scan(rendered);
        expect(rendered.text).toContain(
          `1. ${f.partnerCode}: Declined · Another reason`,
        );
        expect(rendered.text).toContain(
          "Cancels automatically at 14:10 Warsaw time unless you act.",
        );
        expect(rendered.text).toContain(`${ORIGIN}/admin/orders/${f.orderId}`);
      });
    });

    it("throws for an assignment that does not exist, so the delivery is retried", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const f = await fixture(tx);
        await asApp(tx, { role: "system" });
        await expect(
          renderFloristNotification(
            "offer",
            input(tx, f, { assignmentId: randomUUID() }),
          ),
        ).rejects.toThrow(/EMAIL_FACTS_MISSING/u);
      });
    });
  },
);
