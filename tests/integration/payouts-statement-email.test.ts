/**
 * Spec 030a's statement job on a migrated PG16 scratch database (§10 T-21, with T-22's scan run on
 * a real order; AC-21, AC-22; TASK-365): `runStatementEmailJob` with the capturing mailer and an
 * in-memory `Storage`.
 *
 *  - A florist whose earliest owner member reads Polish gets exactly one email, in `pl`, at the
 *    shop's `contact_email`, with the statement number, period, every line's reference, delivery
 *    date, product name and amount, the total as `formatMoney` renders it, and the PDF attached;
 *    the PDF is stored private at `payouts/{yyyy}/{payoutId}.pdf` as a `media_asset`,
 *    `statement_media_asset_id` is set, and the delivery row is keyed by the payout and the
 *    florist. A re-run sends nothing more.
 *  - A florist with no member gets the country's language (`de` for a florist in DE).
 *  - A draft payout sends nothing; with `notifications.email` off the job throws
 *    `NOTIFICATIONS_HELD` and stores nothing.
 *  - The email's parts and the PDF's text carry none of the order's recipient name, street, phone,
 *    card message, buyer name, buyer email, public token or retail amount.
 */
import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InMemoryStorage } from "../../src/lib/storage.ts";
import { formatMoney } from "../../src/modules/i18n/index.ts";
import {
  capturingMailer,
  type CapturingMailer,
} from "../../src/modules/notifications/index.ts";
import {
  payoutStatementPdf,
  registerPayoutStatementTemplate,
} from "../../src/modules/notifications/emails/index.ts";
import {
  type PayoutActor,
  runStatementEmailJob,
  sendStatement,
} from "../../src/modules/partners/payouts/index.ts";
import { insertPlacedOrder } from "../fixtures/order-state.ts";
import { pdfText } from "../fixtures/pdf-text.ts";
import * as make from "./support/rows.ts";
import { runnerOf } from "./support/sql-runner.ts";
import {
  asApp,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

const DISTINCT = {
  recipientName: "Zofia Recipientówna",
  street: "ul. Tajemnicza 77",
  phone: "+48600111222",
  card: "Kocham Cię najbardziej na świecie",
  buyerName: "Bartholomew Buyerson",
  buyerEmail: "bartholomew.buyer@example.test",
} as const;

interface Catalogue {
  readonly plId: string;
  readonly deId: string;
  readonly productId: string;
  readonly adminId: string;
}

async function setUpCatalogue(sql: Sql): Promise<Catalogue> {
  return sql.begin(async (tx) => {
    const plId = await make.country(tx, "PL");
    await tx`INSERT INTO locale (code, bcp47, name) VALUES ('de', 'de-DE', 'Deutsch')
             ON CONFLICT DO NOTHING`;
    const [de] = await tx<{ id: string }[]>`
      INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone)
      VALUES ('DE', 'PLN', 700, 'Europe/Berlin')
      ON CONFLICT (iso2) DO UPDATE SET iso2 = EXCLUDED.iso2
      RETURNING id`;
    const [product] = await tx<{ id: string }[]>`
      INSERT INTO product (sku, product_type, primary_flower, colour_primary, style,
                           price_tier, substitution_class, freshness_days)
      VALUES (${make.unique("FO-STM-S")}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
      RETURNING id`;
    const productId = product?.id ?? "";
    await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
             VALUES (${productId}, 'en', 'Amber Hour', ${make.unique("amber-hour-")}),
                    (${productId}, 'pl', 'Bursztynowa Godzina', ${make.unique("bursztynowa-")})`;
    const adminId = randomUUID();
    await tx`INSERT INTO users (id, email) VALUES (${adminId}, ${`${make.unique("founder")}@example.test`})`;
    return { plId, deId: de?.id ?? "", productId, adminId };
  });
}

/** A weekly florist paid in PLN; its contact address is unique so the capture can find it. */
async function florist(
  tx: Tx,
  countryId: string,
): Promise<{ id: string; contact: string }> {
  const id = await make.partner(tx, countryId, "active");
  const contact = `${make.unique("shop")}@example.test`;
  await tx`UPDATE fulfillment_partner SET contact_email = ${contact} WHERE id = ${id}`;
  return { id, contact };
}

async function member(
  tx: Tx,
  partnerId: string,
  role: "owner" | "staff",
  locale: string,
  createdAt: string,
): Promise<void> {
  const userId = randomUUID();
  await tx`INSERT INTO users (id, email) VALUES (${userId}, ${`${make.unique("member")}@example.test`})`;
  await tx`INSERT INTO partner_member (user_id, partner_id, role, locale_code, created_at)
           VALUES (${userId}, ${partnerId}, ${role}, ${locale}, ${createdAt})`;
}

/** A live order of the product, qty 1, whose snapshots and token carry distinctive values. */
async function order(
  tx: Tx,
  c: Catalogue,
  countryId: string,
): Promise<{ id: string; token: string }> {
  const buyer = await make.customer(tx);
  const id = await insertPlacedOrder(tx, {
    customerId: buyer,
    recipientId: await make.recipient(tx, buyer),
    countryId,
    mode: "live",
  });
  await tx`INSERT INTO order_line (order_id, kind, product_id, addon_id, tier_key, qty, unit_retail_minor, currency_code, vat_rate_bp)
           VALUES (${id}, 'product', ${c.productId}, NULL, NULL, 1, 8000, 'PLN', 800)`;
  await tx`UPDATE "order"
           SET recipient_snapshot = ${tx.json({
             fullName: DISTINCT.recipientName,
             line1: DISTINCT.street,
             phone: DISTINCT.phone,
             cardMessage: DISTINCT.card,
             city: "Kraków",
           })},
               buyer_snapshot = ${tx.json({
                 name: DISTINCT.buyerName,
                 email: DISTINCT.buyerEmail,
               })}
           WHERE id = ${id}`;
  const [row] = await tx<{ public_token: string }[]>`
    SELECT public_token FROM "order" WHERE id = ${id}`;
  return { id, token: row?.public_token ?? "" };
}

/** A closed weekly payout for 19 to 25 October with the order's line and an adjustment. */
async function closedPayout(
  tx: Tx,
  partnerId: string,
  orderId: string,
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO payout (partner_id, period_start, period_end, status, total_minor, currency_code,
                        kind, closed_at)
    VALUES (${partnerId}, '2026-10-19', '2026-10-25', 'draft', 0, 'PLN', 'weekly', now())
    RETURNING id`;
  const id = row?.id ?? "";
  await tx`INSERT INTO payout_line (payout_id, order_id, amount_minor, currency_code, kind)
           VALUES (${id}, ${orderId}, 14900, 'PLN', 'order')`;
  await tx`INSERT INTO payout_line (payout_id, order_id, amount_minor, currency_code, kind, note)
           VALUES (${id}, ${orderId}, 2000, 'PLN', 'adjustment', 'Vase, agreed by phone')`;
  return id;
}

const collapse = (value: string): string => value.replace(/\s+/gu, " ");

function visible(html: string): string {
  return collapse(
    html
      .replace(/<style[\s\S]*?<\/style>/gu, " ")
      .replace(/<[^>]+>/gu, " ")
      .replace(/&#39;/gu, "'")
      .replace(/&amp;/gu, "&"),
  );
}

describe.skipIf(server.url === undefined)(
  `spec 030a statement email${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let c: Catalogue;
    let actor: PayoutActor;
    let capture: CapturingMailer;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "payoutsstmtemail");
      c = await setUpCatalogue(scratch.sql);
      actor = { userId: c.adminId, requestId: "it-payouts-365b" };
      capture = capturingMailer("Flowers Overseas <orders@example.test>");
      registerPayoutStatementTemplate();
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    async function send(tx: Tx, payoutId: string): Promise<string> {
      const result = await tx.savepoint(async (sp) => {
        await asApp(sp as unknown as Tx, { role: "admin", userId: c.adminId });
        try {
          return await sendStatement(
            runnerOf(sp as unknown as Tx),
            payoutId,
            actor,
            {
              scheduleEmail: () => Promise.resolve(),
              log: quiet,
            },
          );
        } finally {
          await sp.unsafe("RESET ROLE");
        }
      });
      return (result as { statementNumber: string }).statementNumber;
    }

    function job(
      tx: Tx,
      payoutId: string,
      storage: InMemoryStorage,
      enabled = true,
    ) {
      return runStatementEmailJob(payoutId, {
        executor: runnerOf(tx),
        store: { storage, bucket: "private-test" },
        renderPdf: payoutStatementPdf,
        notifications: {
          mailer: () => capture,
          provider: () => "capture",
          emailEnabled: () => Promise.resolve(enabled),
          log: quiet,
        },
        log: quiet,
      });
    }

    it("T-21 (AC-21, AC-22): one email in pl to the contact address, every field, the PDF attached and stored; a re-run sends nothing", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const shop = await florist(tx, c.plId);
        // The earliest owner reads Polish; a later owner and an earlier staff member do not count.
        await member(tx, shop.id, "staff", "de", "2026-01-01T00:00:00Z");
        await member(tx, shop.id, "owner", "pl", "2026-02-01T00:00:00Z");
        await member(tx, shop.id, "owner", "en", "2026-03-01T00:00:00Z");
        const placed = await order(tx, c, c.plId);
        const payoutId = await closedPayout(tx, shop.id, placed.id);
        const number = await send(tx, payoutId);
        const [ref] = await tx<{ ref: string; delivery: string }[]>`
          SELECT order_reference(${placed.id}) AS ref, delivery_date::text AS delivery
          FROM "order" WHERE id = ${placed.id}`;
        const storage = new InMemoryStorage();

        const outcome = await job(tx, payoutId, storage);
        expect(outcome.status).toBe("sent");

        const mails = capture.messages(shop.contact);
        expect(mails).toHaveLength(1);
        const mail = mails[0];
        if (mail === undefined) throw new Error("no mail");
        const total = formatMoney(
          { amountMinor: 16900, currency: "PLN" },
          "pl",
        );
        expect(mail.subject).toBe(`Zestawienie wypłaty ${number} · ${total}`);
        expect(mail.html).toContain('lang="pl"');
        const text = collapse(mail.text);
        for (const value of [
          `Zestawienie ${number}`,
          ref?.ref ?? "",
          "Bursztynowa Godzina",
          collapse(formatMoney({ amountMinor: 14900, currency: "PLN" }, "pl")),
          collapse(formatMoney({ amountMinor: 2000, currency: "PLN" }, "pl")),
          `Razem: ${collapse(total)}`,
          "Vase, agreed by phone",
        ]) {
          expect(text, value).toContain(value);
        }
        // The period, and the order's delivery date (14 Feb 2027 in the fixture), in Polish.
        expect(text).toMatch(/19.*25.*2026/u);
        expect(text).toMatch(/14 lut/u);

        // The attachment: one PDF, named by the number, the same bytes as the stored object.
        expect(mail.attachments).toHaveLength(1);
        const file = mail.attachments?.[0];
        expect(file?.filename).toBe(`payout-statement-${number}.pdf`);
        expect(file?.contentType).toBe("application/pdf");
        const bytes = Buffer.from(file?.content ?? "", "base64");
        expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        const pdf = collapse(pdfText(new Uint8Array(bytes)));
        expect(pdf).toContain(number);
        expect(pdf).toContain(ref?.ref ?? "");
        expect(pdf).toContain("Bursztynowa Godzina");
        expect(pdf).toContain(collapse(total));

        const [stored] = await tx<
          {
            asset: string | null;
            kind: string;
            visibility: string;
            object_key: string;
            bucket: string;
            mime: string;
            checksum: string;
            year: string;
          }[]
        >`SELECT p.statement_media_asset_id AS asset, m.kind, m.visibility, m.object_key,
                 m.bucket, m.mime, m.checksum_sha256 AS checksum,
                 extract(year FROM p.sent_at AT TIME ZONE 'UTC')::text AS year
          FROM payout p JOIN media_asset m ON m.id = p.statement_media_asset_id
          WHERE p.id = ${payoutId}`;
        const sha = createHash("sha256").update(bytes).digest("hex");
        expect(stored).toEqual({
          asset: outcome.status === "sent" ? outcome.mediaAssetId : null,
          kind: "partner",
          visibility: "private",
          object_key: `payouts/${stored?.year ?? ""}/${payoutId}.pdf`,
          bucket: "private-test",
          mime: "application/pdf",
          checksum: sha,
          year: stored?.year,
        });
        const object = await storage.head({
          bucket: "private-test",
          objectKey: `payouts/${stored?.year ?? ""}/${payoutId}.pdf`,
        });
        expect(object?.checksumSha256).toBe(sha);

        const deliveries = await tx<
          {
            template_key: string;
            audience: string;
            recipient_ref: string;
            order_id: string | null;
            locale_code: string;
            status: string;
          }[]
        >`SELECT template_key, audience, recipient_ref, order_id, locale_code, status
          FROM notification_delivery
          WHERE source_key = ${`job:payouts.statement_email:${payoutId}`}`;
        expect(deliveries).toEqual([
          {
            template_key: "florist-payout-statement",
            audience: "florist",
            recipient_ref: shop.id,
            order_id: null,
            locale_code: "pl",
            status: "sent",
          },
        ]);

        // AC-22 on a real order: none of its person, price or token values in any part.
        for (const value of [
          ...Object.values(DISTINCT),
          placed.token,
          collapse(formatMoney({ amountMinor: 8000, currency: "PLN" }, "pl")),
          collapse(formatMoney({ amountMinor: 18900, currency: "PLN" }, "pl")),
        ]) {
          expect(mail.subject, value).not.toContain(value);
          expect(text, value).not.toContain(value);
          expect(visible(mail.html), value).not.toContain(value);
          expect(pdf, value).not.toContain(value);
        }

        // A re-run: done, nothing rendered, stored or sent.
        expect((await job(tx, payoutId, new InMemoryStorage())).status).toBe(
          "already_done",
        );
        expect(capture.messages(shop.contact)).toHaveLength(1);
        const [count] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM notification_delivery
          WHERE source_key = ${`job:payouts.statement_email:${payoutId}`}`;
        expect(count?.n).toBe(1);
      });
    });

    it("T-21 (AC-21): a florist with no member gets its country's language (de for DE)", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const shop = await florist(tx, c.deId);
        const placed = await order(tx, c, c.deId);
        const payoutId = await closedPayout(tx, shop.id, placed.id);
        const number = await send(tx, payoutId);
        expect((await job(tx, payoutId, new InMemoryStorage())).status).toBe(
          "sent",
        );
        const mails = capture.messages(shop.contact);
        expect(mails).toHaveLength(1);
        expect(mails[0]?.subject).toContain(`Auszahlungsübersicht ${number}`);
        expect(mails[0]?.html).toContain('lang="de"');
        // No German product name: the English one, the spec's fallback.
        expect(mails[0]?.text).toContain("Amber Hour");
      });
    });

    it("a draft payout sends nothing; with notifications.email off the job is held and stores nothing", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const shop = await florist(tx, c.plId);
        const placed = await order(tx, c, c.plId);
        const payoutId = await closedPayout(tx, shop.id, placed.id);
        const storage = new InMemoryStorage();
        expect((await job(tx, payoutId, storage)).status).toBe("not_sent");
        await send(tx, payoutId);
        const held = await tx
          .savepoint((sp) => job(sp as unknown as Tx, payoutId, storage, false))
          .then(
            () => "done",
            (error: unknown) => (error as { code?: string }).code,
          );
        expect(held).toBe("NOTIFICATIONS_HELD");
        expect(capture.messages(shop.contact)).toHaveLength(0);
        const [row] = await tx<{ asset: string | null }[]>`
          SELECT statement_media_asset_id AS asset FROM payout WHERE id = ${payoutId}`;
        expect(row?.asset).toBeNull();
        const [year] = await tx<{ y: string }[]>`
          SELECT extract(year FROM sent_at AT TIME ZONE 'UTC')::text AS y
          FROM payout WHERE id = ${payoutId}`;
        expect(
          await storage.head({
            bucket: "private-test",
            objectKey: `payouts/${year?.y ?? ""}/${payoutId}.pdf`,
          }),
        ).toBeNull();
      });
    });
  },
);
