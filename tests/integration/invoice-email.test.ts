/**
 * The invoice rides B1, and the B8 job, against migrated tables (spec 016 §5.2 "The invoice rides
 * B1", "B8 handler", A-founder-2026-10-14b, §14 A-founder-2026-10-22 item 5; T-37, T-43; AC-37,
 * AC-43; TASK-334).
 *
 * On a scratch PG16 (`support/scratch-db.ts`), every case in a rolled-back transaction, the
 * pipeline running as `app_web` in the `system` context (row-level security on). B1 and B8 are the
 * real buyer templates (`renderBuyerNotification`) behind the real `notifications` outbox handler
 * and the real `invoice.email` job; the mailer records every message. Each outbox attempt runs in a
 * savepoint, so an `INVOICE_PENDING` throw takes its `queued` row back with it, as the dispatcher's
 * savepoint does.
 *
 * **The clock and the render are injected.** Each purchase's `order.captured` from `placed` is
 * written at `CAPTURED`; every B1 attempt runs at an injected instant after it, with the
 * dispatcher's `retryDueAt` (`outboxRetryDueAt`, base 0 as the dispatcher suites run it, or the
 * production 30 s where a case says so). The invoice is issued (its row written by SQL, unrendered)
 * at once, and "rendered" at the instant a case names: its bytes put in an in-memory private bucket
 * at `invoiceObjectKey` with their SHA-256 and the three render columns written, which is what
 * spec 018's `renderInvoice` stores (its PDF, and the `invoice.email` enqueue, are
 * `invoices-pdf.test.ts`'s T-16 and T-37). B1 and B8 read it through spec 018's own
 * `getPdfByInvoiceId`, the hash checked.
 *
 *  - **T-43:** render at 2 minutes → B1 at 2 carries it, one `notification_delivery_invoice` row,
 *    no B8; at 4:59 → carried; B1 at 5:00 before a render at 5:00 → without, then one B8; a render
 *    at 5:00 before B1 at 5:00 → carried; at 6 minutes → B1 at 5:00 without ("Our terms are
 *    attached."), then one B8; `invoice.issue` off for PL → B1 at once; `B1_INVOICE_WAIT` of 10
 *    minutes → the 6-minute case carries it; the production backoff → B1 by its fourth attempt at
 *    3:30, never a retry due after 5:00.
 *  - **T-37:** B1 carried it → nothing; B1 went without → one B8 invoice; a credit note (a partial
 *    refund, on an order whose B1 carried its invoice) → one B8 credit note; a `test` and a `demo`
 *    order → nothing; no stored PDF → a thrown retry; B1 `queued` or absent → a thrown retry; each
 *    job run twice → one send; the subject and body hold the number, reference and amount, and no
 *    name, address, phone or email.
 *  - The breaker's cases: two deliveries in one purchase with two invoices; a render that never
 *    lands (dead); a stored PDF whose object is gone; Resend's 409 `invalid_idempotent_request` on
 *    B1 (no link row, so B8 still sends the invoice); `notifications.email` off holds B8.
 */
import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLogger, type Logger } from "@/lib/logger";
import { InMemoryStorage } from "@/lib/storage";
import { formatMoney } from "@/modules/i18n";
import {
  getPdfByInvoiceId,
  invoiceFlagOn,
  invoiceObjectKey,
  type InvoiceStore,
} from "@/modules/invoices";
import {
  type Mailer,
  type MailMessage,
  MailerError,
  type NotificationDeps,
  notificationsOutboxHandler,
} from "@/modules/notifications";
import { orderReference, outboxRetryDueAt } from "@/modules/orders";
import {
  B1NotSent,
  type BuyerFactSources,
  type BuyerTemplate,
  BUYER_TEMPLATES,
  InvoicePdfNotStored,
  InvoicePending,
  renderBuyerNotification,
  runInvoiceEmailJob,
} from "../../src/modules/notifications/emails";

import { registerFixtureEventSchemas } from "../fixtures/order-engine.ts";
import { applyTransition, insertPlacedOrder } from "../fixtures/order-state.ts";
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
const BUCKET = "fo-private-test";
const CAPTURED = new Date("2026-10-16T09:00:00.000Z");
const MINUTE = 60_000;

/** Marker values in every person field: none may reach B8, a row or a log line. */
const BUYER_EMAIL = "marker-buyer-3341@example.test";
const BUYER_PHONE = "+48500111334";
const BUYER_NAME = "Sam Markerbuyer";
const RECIPIENT_NAME = "Anna Markerrecipient";
const RECIPIENT_STREET = "Markerstreet 34";
const RECIPIENT_PHONE = "+48500333434";
const B8_FORBIDDEN = [
  BUYER_EMAIL,
  BUYER_PHONE,
  BUYER_NAME,
  "Sam",
  RECIPIENT_NAME,
  RECIPIENT_STREET,
  RECIPIENT_PHONE,
  "Kraków",
];

const at = (minutes: number, seconds = 0): Date =>
  new Date(CAPTURED.getTime() + minutes * MINUTE + seconds * 1000);

/** Every log line of the suite (no marker may appear in one). */
const lines: string[] = [];
const log: Logger = createLogger({
  level: "debug",
  write: (line) => {
    lines.push(line);
  },
});

/** The private bucket, in memory, read through spec 018's own reader. */
function bucket(): InvoiceStore & { readonly memory: InMemoryStorage } {
  const memory = new InMemoryStorage();
  return {
    memory,
    storage: memory,
    bucket: BUCKET,
    fetchObject: (url) => memory.fetch(url),
  };
}

/** The recording mailer, with an optional fault for the next send. */
const sent: MailMessage[] = [];
let fault: (() => Error) | null = null;
const mailer: Mailer = {
  send(message) {
    if (fault !== null) {
      const error = fault();
      fault = null;
      return Promise.reject(error);
    }
    sent.push(message);
    return Promise.resolve({ providerRef: `re_${String(sent.length)}` });
  },
};
function reset(): void {
  sent.length = 0;
  fault = null;
}

function sources(store: InvoiceStore, waitMs?: number): BuyerFactSources {
  return {
    refundLines: () => Promise.resolve([]),
    photoContent: () => Promise.resolve(""),
    trackingLink: (orderId, locale) =>
      Promise.resolve(`${ORIGIN}/${locale}/track/t-${orderId.slice(0, 8)}`),
    termsPdf: (version) => ({
      filename: `flowers-overseas-terms-${version}.pdf`,
      url: `https://media.example.test/legal/terms-${version}.pdf`,
    }),
    siteOrigin: () => ORIGIN,
    invoices: {
      read: (invoiceId, executor) =>
        getPdfByInvoiceId(invoiceId, { executor, store }),
      issueOn: invoiceFlagOn,
      ...(waitMs === undefined ? {} : { waitMs }),
    },
  };
}

function deps(
  store: InvoiceStore,
  now: Date,
  over: { waitMs?: number; enabled?: boolean } = {},
): NotificationDeps {
  const own = sources(store, over.waitMs);
  return {
    mailer: () => mailer,
    provider: () => "capture",
    template: (key) =>
      (BUYER_TEMPLATES as readonly string[]).includes(key)
        ? (input) => renderBuyerNotification(key as BuyerTemplate, input, own)
        : undefined,
    siteOrigin: () => ORIGIN,
    emailEnabled: () => Promise.resolve(over.enabled ?? true),
    now: () => now,
    log,
  };
}

/** `invoice.issue` for PL. Off is the migration's own row. */
async function issueFlag(tx: Tx, on: boolean): Promise<void> {
  await tx`UPDATE feature_flag_scope SET enabled = ${on}
           WHERE flag_key = 'invoice.issue' AND scope = 'country' AND scope_ref = 'PL'`;
}

let profileReady = false;
async function profile(tx: Tx): Promise<void> {
  if (profileReady) return;
  await tx`INSERT INTO invoice_profile (key, supply_model, destination_iso2, document_kind,
                                        title_key, label_locales, vat_bearing_line_kinds,
                                        series_key, credit_series_key, vat_currency_code,
                                        vat_rate_source, active)
           VALUES ('principal-pl', 'principal', 'PL', 'vat_invoice', 'invoice.title.vatInvoice',
                   ARRAY['pl', '{buyer}'], ARRAY['product', 'addon', 'surcharge'],
                   'fo-pl-2026', 'fok-pl-2026', 'PLN', 'nbp_previous_business_day', true)
           ON CONFLICT (key) DO NOTHING`;
}

async function product(tx: Tx): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES (${make.unique("FO-BQ-")}, 'bouquet', 'roses', 'red', 'classic', 'classic',
            'main_flower', 5)
    RETURNING id`;
  const id = row?.id ?? "";
  await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
           VALUES (${id}, 'en', 'Amber Hour', ${make.unique("p-")})`;
  await tx`INSERT INTO product_tier (product_id, tier_key, label_key, stems, sort, is_default)
           VALUES (${id}, 'stems_18', 'catalog.tier.stems', 18, 0, true)`;
  return id;
}

interface Purchase {
  readonly purchaseId: string;
  readonly orders: readonly {
    readonly orderId: string;
    readonly eventId: string;
  }[];
}

/**
 * A purchase of `count` orders to Kraków in `en-gb`, captured at `CAPTURED` (row 2 from `placed`),
 * with marker values in every person field.
 */
async function purchase(
  tx: Tx,
  options: { count?: number; mode?: "live" | "test" | "demo" } = {},
): Promise<Purchase> {
  const mode = options.mode ?? "live";
  const parents = await make.orderParents(tx);
  await profile(tx);
  await tx`INSERT INTO locale (code, bcp47, name, fallback_code)
           VALUES ('en-gb', 'en-GB', 'English (UK)', 'en') ON CONFLICT DO NOTHING`;
  const count = options.count ?? 1;
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
    VALUES (${mode}, 'PLN', ${14900 * count}, 'en-gb', ${parents.customerId})
    RETURNING id`;
  const purchaseId = row?.id ?? "";
  const productId = await product(tx);
  const orders: { orderId: string; eventId: string }[] = [];
  for (let index = 0; index < count; index += 1) {
    const orderId = await insertPlacedOrder(tx, {
      ...parents,
      mode,
      totalMinor: 14900,
      purchaseId,
    });
    await tx`UPDATE "order" SET
      delivery_date = ${`2026-10-1${String(7 + index)}`}::date,
      locale_code = 'en-gb',
      buyer_snapshot = ${tx.json({ name: BUYER_NAME, email: BUYER_EMAIL, phoneE164: BUYER_PHONE, countryIso2: "GB" })},
      recipient_snapshot = ${tx.json({
        fullName: RECIPIENT_NAME,
        addressLines: [RECIPIENT_STREET],
        phoneE164: RECIPIENT_PHONE,
        city: "Kraków",
        postcode: "30-001",
        placeKind: "home",
      })}
      WHERE id = ${orderId}`;
    await tx`INSERT INTO order_line (order_id, kind, product_id, tier_key, qty, unit_retail_minor,
                                     currency_code, vat_rate_bp)
             VALUES (${orderId}, 'product', ${productId}, 'stems_18', 1, 14900, 'PLN', 800)`;
    await applyTransition(
      tx,
      orderId,
      "order.captured",
      "paid_unrouted",
      CAPTURED,
    );
    const [event] = await tx<{ id: string }[]>`
      SELECT id FROM order_event WHERE order_id = ${orderId} ORDER BY seq DESC LIMIT 1`;
    orders.push({ orderId, eventId: event?.id ?? "" });
  }
  return { purchaseId, orders };
}

/** The order's invoice, issued and not rendered (spec 018 writes it in the `invoices` delivery). */
async function issue(tx: Tx, orderId: string): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO invoice (kind, order_id, series_key, number, issued_at, supply_date,
                         currency_code, total_minor, profile_key, snapshot, snapshot_version)
    VALUES ('invoice', ${orderId}, 'fo-pl-2026', ${`FO-PL/2026/${make.unique("")}`},
            ${CAPTURED.toISOString()}::timestamptz, DATE '2026-10-17', 'PLN', 14900,
            'principal-pl', '{"fixture": true}'::jsonb, 1)
    RETURNING id`;
  return row?.id ?? "";
}

/** A credit note for a partial refund of `amountMinor`, correcting `invoiceId`. Not rendered. */
async function creditNote(
  tx: Tx,
  orderId: string,
  invoiceId: string,
  amountMinor: number,
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO invoice (kind, order_id, corrects_invoice_id, series_key, number, issued_at,
                         supply_date, currency_code, total_minor, profile_key, snapshot,
                         snapshot_version)
    VALUES ('credit_note', ${orderId}, ${invoiceId}, 'fok-pl-2026',
            ${`FOK-PL/2026/${make.unique("")}`}, ${CAPTURED.toISOString()}::timestamptz,
            DATE '2026-10-17', 'PLN', ${-amountMinor}, 'principal-pl',
            '{"fixture": true}'::jsonb, 1)
    RETURNING id`;
  return row?.id ?? "";
}

/** The fault-injected render: the document's bytes stored now, as `renderInvoice` stores them. */
async function render(
  tx: Tx,
  store: InvoiceStore,
  invoiceId: string,
): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(
    `%PDF-1.7\n% TASK-334 fixture ${invoiceId}\n%%EOF\n`,
  );
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const objectKey = invoiceObjectKey(invoiceId, CAPTURED);
  await store.storage.put({
    bucket: BUCKET,
    objectKey,
    body: bytes,
    mime: "application/pdf",
    checksumSha256: sha256,
  });
  await tx`UPDATE invoice SET pdf_object_key = ${objectKey}, pdf_sha256 = ${sha256},
             rendered_at = now() WHERE id = ${invoiceId}`;
  return bytes;
}

/** Runs `fn` as `app_web` in the `system` context, in a savepoint (a throw takes its writes back). */
async function asSystem<T>(
  tx: Tx,
  fn: (executor: ReturnType<typeof runnerOf>) => Promise<T>,
): Promise<T> {
  return (await tx.savepoint(async (sp) => {
    const own = sp as unknown as Tx;
    await asApp(own, { role: "system" });
    try {
      return await fn(runnerOf(own));
    } finally {
      await own.unsafe("RESET ROLE");
    }
  })) as T;
}

/**
 * One outbox attempt of B1 (the row-2 delivery of the purchase's first order) at `now`, with the
 * dispatcher's `retryDueAt` for `attempt` (base 0 unless `base` is given). The error, or null.
 */
async function b1(
  tx: Tx,
  store: InvoiceStore,
  p: Purchase,
  now: Date,
  options: {
    attempt?: number;
    base?: number;
    waitMs?: number;
    order?: number;
  } = {},
): Promise<Error | null> {
  const attempt = options.attempt ?? 1;
  const target = p.orders[options.order ?? 0];
  try {
    await asSystem(tx, (executor) =>
      notificationsOutboxHandler(
        deps(store, now, {
          ...(options.waitMs === undefined ? {} : { waitMs: options.waitMs }),
        }),
      )(
        {
          eventId: target?.eventId ?? "",
          orderId: target?.orderId ?? "",
          type: "order.captured",
          seq: 2,
          fromStatus: "placed",
          toStatus: "paid_unrouted",
          mode: "live",
        },
        {
          deliveryId: randomUUID(),
          outboxId: randomUUID(),
          target: "notifications",
          attempt,
          retryDueAt: outboxRetryDueAt(now, attempt, options.base ?? 0),
          executor,
        },
      ),
    );
    return null;
  } catch (error) {
    return error as Error;
  }
}

/** One `invoice.email` job run. The outcome, or the error it threw. */
async function b8(
  tx: Tx,
  store: InvoiceStore,
  invoiceId: string,
  options: { enabled?: boolean } = {},
): Promise<string | Error> {
  try {
    return await asSystem(tx, (executor) =>
      runInvoiceEmailJob(invoiceId, {
        executor,
        notifications: deps(store, at(30), options),
        log,
      }),
    );
  } catch (error) {
    return error as Error;
  }
}

/** The B1 row of the purchase and the invoices it carried. */
async function b1Row(
  tx: Tx,
  purchaseId: string,
): Promise<{ status: string; invoices: string[] } | null> {
  const [row] = await tx<{ id: string; status: string }[]>`
    SELECT id, status FROM notification_delivery
    WHERE source_key = ${`purchase:${purchaseId}`} AND template_key = 'order-received'`;
  if (row === undefined) return null;
  const links = await tx<{ invoice_id: string }[]>`
    SELECT invoice_id FROM notification_delivery_invoice
    WHERE notification_delivery_id = ${row.id} ORDER BY invoice_id`;
  return { status: row.status, invoices: links.map((link) => link.invoice_id) };
}

const b1Sends = () =>
  sent.filter((message) => message.subject.startsWith("We have your order"));
const b8Sends = () =>
  sent.filter((message) =>
    /^Your (invoice|credit note) /u.test(message.subject),
  );
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

function scanB8(message: MailMessage | undefined): void {
  expect(message).toBeDefined();
  for (const marker of B8_FORBIDDEN) {
    expect(message?.subject).not.toContain(marker);
    expect(message?.text).not.toContain(marker);
    expect(message?.html).not.toContain(marker);
  }
}

describe.skipIf(server.url === undefined)(
  `the invoice on B1 and the B8 job${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "invoice_email");
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    /** Each case: a fresh bucket, the mailer cleared, the profile written once per transaction. */
    async function scenario(
      fn: (tx: Tx, store: ReturnType<typeof bucket>) => Promise<void>,
    ): Promise<void> {
      reset();
      profileReady = false;
      await rolledBack(scratch.sql, async (tx) => {
        await issueFlag(tx, true);
        await fn(tx, bucket());
      });
    }

    it("T-43: a render at 2 minutes rides B1 (one link row), and B8 sends nothing for it", async () => {
      await scenario(async (tx, store) => {
        const p = await purchase(tx);
        const invoiceId = await issue(tx, p.orders[0]?.orderId ?? "");
        expect(await b1(tx, store, p, at(0))).toBeInstanceOf(InvoicePending);
        expect(await b1(tx, store, p, at(1), { attempt: 2 })).toBeInstanceOf(
          InvoicePending,
        );
        expect(await b1Row(tx, p.purchaseId)).toBeNull();
        expect(sent).toHaveLength(0);
        const bytes = await render(tx, store, invoiceId);
        expect(await b1(tx, store, p, at(2), { attempt: 3 })).toBeNull();
        expect(await b1Row(tx, p.purchaseId)).toEqual({
          status: "sent",
          invoices: [invoiceId],
        });
        const [message] = b1Sends();
        expect(b1Sends()).toHaveLength(1);
        expect(message?.text).toContain(
          "Our terms and your invoice are attached.",
        );
        expect(message?.attachments?.map((file) => file.filename)).toEqual([
          "flowers-overseas-terms-2026-10.pdf",
          expect.stringMatching(/^FO-PL-2026-.+\.pdf$/u),
        ]);
        expect(message?.attachments?.[1]?.content).toBe(base64(bytes));
        expect(await b8(tx, store, invoiceId)).toBe("carried_by_b1");
        expect(b8Sends()).toHaveLength(0);
      });
    });

    it("T-43: a render at 4:59 rides B1", async () => {
      await scenario(async (tx, store) => {
        const p = await purchase(tx);
        const invoiceId = await issue(tx, p.orders[0]?.orderId ?? "");
        expect(await b1(tx, store, p, at(4, 58))).toBeInstanceOf(
          InvoicePending,
        );
        await render(tx, store, invoiceId);
        expect(await b1(tx, store, p, at(4, 59), { attempt: 2 })).toBeNull();
        expect((await b1Row(tx, p.purchaseId))?.invoices).toEqual([invoiceId]);
        expect(await b8(tx, store, invoiceId)).toBe("carried_by_b1");
        expect(b8Sends()).toHaveLength(0);
      });
    });

    it("T-43: at 5:00, B1 goes with what is stored: without an invoice rendered after it, with one rendered before it", async () => {
      await scenario(async (tx, store) => {
        const p = await purchase(tx);
        const invoiceId = await issue(tx, p.orders[0]?.orderId ?? "");
        expect(await b1(tx, store, p, at(4, 59))).toBeInstanceOf(
          InvoicePending,
        );
        expect(await b1(tx, store, p, at(5), { attempt: 2 })).toBeNull();
        expect(await b1Row(tx, p.purchaseId)).toEqual({
          status: "sent",
          invoices: [],
        });
        expect(b1Sends()[0]?.text).toContain("Our terms are attached.");
        expect(b1Sends()[0]?.attachments).toHaveLength(1);
        await render(tx, store, invoiceId);
        expect(await b8(tx, store, invoiceId)).toBe("sent");
        expect(b8Sends()).toHaveLength(1);
      });
      await scenario(async (tx, store) => {
        const p = await purchase(tx);
        const invoiceId = await issue(tx, p.orders[0]?.orderId ?? "");
        await render(tx, store, invoiceId);
        expect(await b1(tx, store, p, at(5))).toBeNull();
        expect((await b1Row(tx, p.purchaseId))?.invoices).toEqual([invoiceId]);
        expect(await b8(tx, store, invoiceId)).toBe("carried_by_b1");
      });
    });

    it("T-43: a render at 6 minutes leaves B1 sent at 5:00 without it ('Our terms are attached.'), then exactly one B8", async () => {
      await scenario(async (tx, store) => {
        const p = await purchase(tx);
        const invoiceId = await issue(tx, p.orders[0]?.orderId ?? "");
        for (const [index, minute] of [0, 1, 2, 3, 4].entries()) {
          expect(
            await b1(tx, store, p, at(minute), { attempt: index + 1 }),
          ).toBeInstanceOf(InvoicePending);
        }
        expect(await b1(tx, store, p, at(5), { attempt: 6 })).toBeNull();
        const row = await b1Row(tx, p.purchaseId);
        expect(row).toEqual({ status: "sent", invoices: [] });
        const [b1Message] = b1Sends();
        expect(b1Message?.text).toContain("Our terms are attached.");
        expect(b1Message?.text).not.toContain("invoice");
        expect(await b8(tx, store, invoiceId)).toBeInstanceOf(
          InvoicePdfNotStored,
        );
        const bytes = await render(tx, store, invoiceId);
        expect(await b8(tx, store, invoiceId)).toBe("sent");
        expect(await b8(tx, store, invoiceId)).toBe("skipped");
        expect(b8Sends()).toHaveLength(1);
        const [message] = b8Sends();
        expect(message?.subject).toMatch(/^Your invoice FO-PL\/2026\//u);
        expect(message?.attachments).toEqual([
          {
            filename: expect.stringMatching(/^FO-PL-2026-.+\.pdf$/u) as string,
            content: base64(bytes),
            contentType: "application/pdf",
          },
        ]);
        expect(message?.idempotencyKey).toBe(
          `job:invoice.email:${invoiceId}:credit-note:buyer`,
        );
        expect(message?.to).toBe(BUYER_EMAIL);
        scanB8(message);
      });
    });

    it("T-43: with invoice.issue off for PL, B1 is sent at once with no invoice and waits for none", async () => {
      await scenario(async (tx, store) => {
        await issueFlag(tx, false);
        const p = await purchase(tx);
        expect(await b1(tx, store, p, at(0))).toBeNull();
        expect(await b1Row(tx, p.purchaseId)).toEqual({
          status: "sent",
          invoices: [],
        });
        expect(b1Sends()[0]?.text).toContain("Our terms are attached.");
      });
    });

    it("T-43: with invoice.issue on and no invoice issued yet, B1 waits (the issue still to come)", async () => {
      await scenario(async (tx, store) => {
        const p = await purchase(tx);
        expect(await b1(tx, store, p, at(0))).toBeInstanceOf(InvoicePending);
        expect(await b1(tx, store, p, at(5), { attempt: 2 })).toBeNull();
        expect((await b1Row(tx, p.purchaseId))?.invoices).toEqual([]);
      });
    });

    it("T-43: B1_INVOICE_WAIT of 10 minutes in the test config carries the 6-minute render", async () => {
      await scenario(async (tx, store) => {
        const p = await purchase(tx);
        const invoiceId = await issue(tx, p.orders[0]?.orderId ?? "");
        const waitMs = 10 * MINUTE;
        expect(await b1(tx, store, p, at(5), { waitMs })).toBeInstanceOf(
          InvoicePending,
        );
        await render(tx, store, invoiceId);
        expect(
          await b1(tx, store, p, at(6), { attempt: 2, waitMs }),
        ).toBeNull();
        expect((await b1Row(tx, p.purchaseId))?.invoices).toEqual([invoiceId]);
      });
    });

    it("T-43: with the production backoff (30 s doubling), B1 is sent by its fourth attempt at 3:30, not retried after 5:00", async () => {
      await scenario(async (tx, store) => {
        const p = await purchase(tx);
        await issue(tx, p.orders[0]?.orderId ?? "");
        const schedule = [at(0), at(0, 30), at(1, 30)];
        for (const [index, now] of schedule.entries()) {
          expect(
            await b1(tx, store, p, now, { attempt: index + 1, base: 30 }),
          ).toBeInstanceOf(InvoicePending);
        }
        expect(
          await b1(tx, store, p, at(3, 30), { attempt: 4, base: 30 }),
        ).toBeNull();
        expect(await b1Row(tx, p.purchaseId)).toEqual({
          status: "sent",
          invoices: [],
        });
      });
    });

    it("breaker: two deliveries in one purchase, two invoices: both stored by 2 minutes ride one B1; one stored at 7 minutes gets one B8", async () => {
      await scenario(async (tx, store) => {
        const p = await purchase(tx, { count: 2 });
        const first = await issue(tx, p.orders[0]?.orderId ?? "");
        const second = await issue(tx, p.orders[1]?.orderId ?? "");
        await render(tx, store, first);
        expect(await b1(tx, store, p, at(1))).toBeInstanceOf(InvoicePending);
        await render(tx, store, second);
        expect(
          await b1(tx, store, p, at(2), { attempt: 2, order: 1 }),
        ).toBeNull();
        expect((await b1Row(tx, p.purchaseId))?.invoices).toEqual(
          [first, second].sort(),
        );
        expect(b1Sends()[0]?.text).toContain(
          "Our terms and your invoices are attached.",
        );
        expect(b1Sends()[0]?.attachments).toHaveLength(3);
        expect(await b1(tx, store, p, at(2), { order: 0 })).toBeNull();
        expect(b1Sends()).toHaveLength(1);
        expect(await b8(tx, store, first)).toBe("carried_by_b1");
        expect(await b8(tx, store, second)).toBe("carried_by_b1");
      });
      await scenario(async (tx, store) => {
        const p = await purchase(tx, { count: 2 });
        const first = await issue(tx, p.orders[0]?.orderId ?? "");
        const second = await issue(tx, p.orders[1]?.orderId ?? "");
        await render(tx, store, first);
        expect(await b1(tx, store, p, at(4))).toBeInstanceOf(InvoicePending);
        expect(await b1(tx, store, p, at(5), { attempt: 2 })).toBeNull();
        expect((await b1Row(tx, p.purchaseId))?.invoices).toEqual([first]);
        expect(b1Sends()[0]?.text).toContain(
          "Our terms and your invoice are attached.",
        );
        await render(tx, store, second);
        expect(await b8(tx, store, first)).toBe("carried_by_b1");
        expect(await b8(tx, store, second)).toBe("sent");
        expect(await b8(tx, store, second)).toBe("skipped");
        expect(b8Sends()).toHaveLength(1);
        expect(b8Sends()[0]?.text).toContain(
          orderReference(p.orders[1]?.orderId ?? ""),
        );
      });
    });

    it("breaker: a render that never lands (dead) and a stored PDF whose object is gone: B1 at 5:00 without them, B8 retries", async () => {
      await scenario(async (tx, store) => {
        const p = await purchase(tx);
        const invoiceId = await issue(tx, p.orders[0]?.orderId ?? "");
        expect(await b1(tx, store, p, at(4))).toBeInstanceOf(InvoicePending);
        expect(await b1(tx, store, p, at(5), { attempt: 2 })).toBeNull();
        expect(await b8(tx, store, invoiceId)).toBeInstanceOf(
          InvoicePdfNotStored,
        );
      });
      await scenario(async (tx, store) => {
        const p = await purchase(tx);
        const invoiceId = await issue(tx, p.orders[0]?.orderId ?? "");
        await render(tx, store, invoiceId);
        await store.storage.delete({
          bucket: BUCKET,
          objectKey: invoiceObjectKey(invoiceId, CAPTURED),
        });
        expect(await b1(tx, store, p, at(1))).toBeInstanceOf(InvoicePending);
        expect(await b1(tx, store, p, at(5), { attempt: 2 })).toBeNull();
        expect((await b1Row(tx, p.purchaseId))?.invoices).toEqual([]);
        const outcome = await b8(tx, store, invoiceId);
        expect(outcome).toBeInstanceOf(Error);
        expect((outcome as Error).message).toContain(
          "INVOICE_PDF_HASH_MISMATCH",
        );
        expect(b8Sends()).toHaveLength(0);
      });
    });

    it("breaker: Resend's 409 invalid_idempotent_request on B1 writes no link row, so B8 still sends the invoice", async () => {
      await scenario(async (tx, store) => {
        const p = await purchase(tx);
        const invoiceId = await issue(tx, p.orders[0]?.orderId ?? "");
        await render(tx, store, invoiceId);
        fault = () => new MailerError("409", "invalid_idempotent_request");
        expect(await b1(tx, store, p, at(1))).toBeNull();
        expect(await b1Row(tx, p.purchaseId)).toEqual({
          status: "sent",
          invoices: [],
        });
        expect(await b8(tx, store, invoiceId)).toBe("sent");
        expect(b8Sends()).toHaveLength(1);
      });
    });

    it("T-37: B1 carried it → nothing; B1 went without → one B8 invoice; run twice → one send", async () => {
      await scenario(async (tx, store) => {
        const carried = await purchase(tx);
        const carriedInvoice = await issue(
          tx,
          carried.orders[0]?.orderId ?? "",
        );
        await render(tx, store, carriedInvoice);
        expect(await b1(tx, store, carried, at(0))).toBeNull();
        expect(await b8(tx, store, carriedInvoice)).toBe("carried_by_b1");
        expect(await b8(tx, store, carriedInvoice)).toBe("carried_by_b1");

        await issueFlag(tx, false);
        const without = await purchase(tx);
        expect(await b1(tx, store, without, at(0))).toBeNull();
        await issueFlag(tx, true);
        const withoutInvoice = await issue(
          tx,
          without.orders[0]?.orderId ?? "",
        );
        await render(tx, store, withoutInvoice);
        expect(await b8(tx, store, withoutInvoice)).toBe("sent");
        expect(await b8(tx, store, withoutInvoice)).toBe("skipped");

        expect(b8Sends()).toHaveLength(1);
        const [message] = b8Sends();
        const [number] = await tx<{ number: string }[]>`
          SELECT number FROM invoice WHERE id = ${withoutInvoice}`;
        expect(message?.subject).toBe(`Your invoice ${number?.number ?? ""}`);
        const text = message?.text.replaceAll(/[  ]/gu, " ") ?? "";
        expect(text).toContain(number?.number ?? "");
        expect(text).toContain(
          orderReference(without.orders[0]?.orderId ?? ""),
        );
        expect(text).toContain(
          formatMoney(
            { amountMinor: 14900, currency: "PLN" },
            "en-gb",
          ).replaceAll(/[  ]/gu, " "),
        );
        scanB8(message);
        const rows = await tx<{ source_key: string; status: string }[]>`
          SELECT source_key, status FROM notification_delivery
          WHERE template_key = 'credit-note'`;
        expect(rows).toEqual([
          { source_key: `job:invoice.email:${withoutInvoice}`, status: "sent" },
        ]);
      });
    });

    it("T-37: a credit note for a partial refund, on an order whose B1 carried its invoice, is one B8 with its PDF, its size and nothing personal", async () => {
      await scenario(async (tx, store) => {
        const p = await purchase(tx);
        const orderId = p.orders[0]?.orderId ?? "";
        const invoiceId = await issue(tx, orderId);
        await render(tx, store, invoiceId);
        expect(await b1(tx, store, p, at(0))).toBeNull();
        const creditId = await creditNote(tx, orderId, invoiceId, 5000);
        expect(await b8(tx, store, creditId)).toBeInstanceOf(
          InvoicePdfNotStored,
        );
        const bytes = await render(tx, store, creditId);
        expect(await b8(tx, store, creditId)).toBe("sent");
        expect(await b8(tx, store, creditId)).toBe("skipped");
        expect(b8Sends()).toHaveLength(1);
        const [message] = b8Sends();
        expect(message?.subject).toMatch(/^Your credit note FOK-PL\/2026\//u);
        const text = message?.text.replaceAll(/[  ]/gu, " ") ?? "";
        expect(text).toContain(
          formatMoney(
            { amountMinor: 5000, currency: "PLN" },
            "en-gb",
          ).replaceAll(/[  ]/gu, " "),
        );
        expect(text).not.toContain("149");
        expect(text).toContain(orderReference(orderId));
        expect(message?.attachments?.[0]?.content).toBe(base64(bytes));
        scanB8(message);
      });
    });

    it("T-37: a test and a demo order send nothing; no stored PDF, B1 queued and B1 absent are thrown retries; notifications.email off holds it", async () => {
      await scenario(async (tx, store) => {
        for (const mode of ["test", "demo"] as const) {
          const p = await purchase(tx, { mode });
          const invoiceId = await issue(tx, p.orders[0]?.orderId ?? "");
          await render(tx, store, invoiceId);
          expect(await b8(tx, store, invoiceId)).toBe("not_live");
        }

        const absent = await purchase(tx);
        const absentInvoice = await issue(tx, absent.orders[0]?.orderId ?? "");
        expect(await b8(tx, store, absentInvoice)).toBeInstanceOf(
          InvoicePdfNotStored,
        );
        await render(tx, store, absentInvoice);
        expect(await b8(tx, store, absentInvoice)).toBeInstanceOf(B1NotSent);

        await tx`
          INSERT INTO notification_delivery (source_key, purchase_id, template_key, audience,
                                             recipient_ref, locale_code, provider, status,
                                             status_at)
          VALUES (${`purchase:${absent.purchaseId}`}, ${absent.purchaseId}, 'order-received',
                  'buyer', 'buyer', 'en-gb', 'capture', 'queued', now())`;
        expect(await b8(tx, store, absentInvoice)).toBeInstanceOf(B1NotSent);

        await tx`UPDATE notification_delivery SET status = 'sent'
                 WHERE source_key = ${`purchase:${absent.purchaseId}`}`;
        const held = await b8(tx, store, absentInvoice, { enabled: false });
        expect(held).toBeInstanceOf(Error);
        expect((held as Error).message).toContain("NOTIFICATIONS_HELD");
        expect(await b8(tx, store, absentInvoice)).toBe("sent");
        expect(b8Sends()).toHaveLength(1);
        expect(
          await b8(tx, store, "00000000-0000-4000-8000-000000000000"),
        ).toBe("missing");
      });
    });

    it("no log line of the suite carries a buyer or recipient marker", () => {
      const out = lines.join("\n");
      for (const marker of [
        BUYER_EMAIL,
        BUYER_PHONE,
        BUYER_NAME,
        RECIPIENT_NAME,
        RECIPIENT_STREET,
        RECIPIENT_PHONE,
      ]) {
        expect(out).not.toContain(marker);
      }
      expect(out).toContain('"invoice.email"');
    });
  },
);
