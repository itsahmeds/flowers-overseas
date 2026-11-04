/**
 * What the buyer sees after an admin cancels or refunds, on a disposable PG16 (spec 020a §2.6,
 * §8 "No negative framing", "No relay language"; AC-27 render half / T-28, AC-31 / T-32 for this
 * suite; TASK-361).
 *
 * Every action runs as the real thing would: `adminOrderCancel` / `adminOrderRefund` →
 * `runOrderAction` in an admin-context transaction → spec 013's `cancelOrder` / `requestRefund`,
 * then the refund on the in-memory `FakePaymentProvider` (the cancel's automatic refund through
 * `refundCancelledOrder`, the admin's through `submitRefund` after the commit), each with the
 * internal note "SENTINEL-NOTE-7". Then the buyer's renders, exactly as the pipeline and the page
 * make them: B5 (`cancelled`) or B6 (`refund`) through `renderBuyerNotification`, and the tracking
 * page through `getTrackingView` and `TrackingPageView`, in `en-gb` and `pl`.
 *
 * In none of them: the note, any admin reason label (`admin.orderActions.cancel.reason.*`,
 * `admin.orderActions.refunds.reason.*`) or reason code, and `relayMatches` finds nothing.
 * Over the whole suite the process's log sinks and Sentry carry no person, note, token or link
 * (`support/pii-watch.ts`).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { relayMatches } from "@/config/honesty";
import { PAYMENT_METHODS } from "@/config/payment-methods";
import type { OrderActionTransaction } from "@/modules/admin/order-actions";
import {
  adminOrderCancel,
  type AdminOrderCancelDeps,
} from "@/modules/admin/order-actions/cancel";
import {
  adminOrderRefund,
  type AdminOrderRefundDeps,
} from "@/modules/admin/order-actions/refund";
import { loadMessages } from "@/modules/i18n";
import { MESSAGE_NAMESPACES } from "@/modules/i18n/messages";
import type { NotificationRenderInput } from "@/modules/notifications";
import { getTrackingView, type OrderExecutor } from "@/modules/orders";
import { buyerRefundLines } from "@/modules/orders/buyer-refund-lines";
import { refundCancelledOrder } from "@/modules/payments";
import { FakePaymentProvider } from "@/modules/payments/fake";
import {
  startPayment,
  syncFromProvider,
  type LifecycleDeps,
  type PaymentTransaction,
} from "@/modules/payments/lifecycle";
import type { MethodSources } from "@/modules/payments/methods";

import {
  type BuyerFactSources,
  renderBuyerNotification,
} from "../../src/modules/notifications/emails";
import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
import { watchLogsAndSentry } from "./support/pii-watch.ts";
import { base, country, customer, recipient } from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const sentry = vi.hoisted(() => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock("@sentry/nextjs", async (original) => ({
  ...(await original<typeof import("@sentry/nextjs")>()),
  ...sentry,
}));

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

const { TrackingPageView } =
  await import("../../src/app/[locale]/(track)/track/[token]/TrackingPageView.tsx");

const server = await probeLocalServer();
const watch = watchLogsAndSentry(sentry);

const T0 = new Date("2026-11-04T08:00:00.000Z");
const FAR_DATE = "2027-12-24";
const ADMIN_ID = randomUUID();
const ADMIN_NAME = "Renders Admin";
const NOTE = "SENTINEL-NOTE-7 buyer phoned twice";
const BUYER_NAME = "Sentinel Buyer Name";
/** The recipient as the order snapshots it: a buyer email may print the name and the city only. */
const RECIPIENT = {
  fullName: "Zxqrecipient Anna",
  phoneE164: "+48555019283",
  addressLines: ["Zxqmarkerstreet 17"],
  postcode: "99-123",
  city: "Warszawa",
  placeKind: "home",
  cardMessage: "Zxqmarkercard happy day",
};
const LOCALES = ["en-gb", "pl"] as const;

const SESSION = {
  userId: ADMIN_ID,
  displayName: ADMIN_NAME,
  roles: ["admin" as const],
  timeZone: "Europe/Warsaw",
};

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

/** Every admin reason label and code: none may reach a buyer surface (AC-27). */
const ADMIN_CATALOGUE = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../messages/admin/en.json"),
    "utf8",
  ),
) as {
  admin: {
    orderActions: {
      cancel: { reason: Record<string, string> };
      refunds: { reason: Record<string, string> };
    };
  };
};
const REASON_LABELS = [
  ...Object.values(ADMIN_CATALOGUE.admin.orderActions.cancel.reason),
  ...Object.values(ADMIN_CATALOGUE.admin.orderActions.refunds.reason),
];
/**
 * The codes that cannot be ordinary words ("buyer_cancel", "addon_missing", …). The one-word codes
 * ("other", "quality", "goodwill", "duplicate") are English words a buyer email may well use
 * ("Choose other flowers"); their labels are checked as phrases above instead.
 */
const REASON_CODES = [
  ...Object.keys(ADMIN_CATALOGUE.admin.orderActions.cancel.reason),
  ...Object.keys(ADMIN_CATALOGUE.admin.orderActions.refunds.reason),
].filter((code) => code.includes("_"));
const CANCEL_REASONS = ["buyer_cancel", "no_partner", "other"] as const;
const REFUND_REASONS = [
  "addon_missing",
  "late_delivery",
  "substitution_complaint",
  "quality",
  "goodwill",
  "duplicate",
  "other",
] as const;

const SOURCES: BuyerFactSources = {
  refundLines: (orderId, options) => buyerRefundLines(orderId, options),
  photoContent: () => Promise.resolve(""),
  trackingLink: (orderId, locale) =>
    Promise.resolve(
      `https://staging.example.test/${locale}/track/T-${orderId.slice(0, 4)}`,
    ),
  termsPdf: () => null,
  siteOrigin: () => "https://staging.example.test",
};

/** Visible words of a render: tags dropped, `Intl`'s spaces plain. */
function words(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replaceAll(/[  ]/gu, " ")
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/&amp;/gu, "&")
    .replace(/\s+/gu, " ");
}

/** The AC-27 scan of one render: no note, no reason label as a phrase, no code, no relay word. */
function scanned(label: string, text: string, locale: string): void {
  expect(text, label).not.toContain("SENTINEL-NOTE-7");
  expect(text, label).not.toContain(BUYER_NAME);
  for (const marker of [
    RECIPIENT.phoneE164,
    RECIPIENT.addressLines[0] ?? "",
    RECIPIENT.cardMessage,
  ]) {
    expect(text, label).not.toContain(marker);
  }
  for (const reasonLabel of REASON_LABELS) {
    // A label as its own phrase: "Other" inside "Others" or "Quality" inside a longer word is not it.
    expect(text, `${label}: ${reasonLabel}`).not.toMatch(
      new RegExp(
        `(?<![\\p{L}])${reasonLabel.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?![\\p{L}])`,
        "u",
      ),
    );
  }
  for (const code of REASON_CODES) {
    expect(text, `${label}: ${code}`).not.toContain(code);
  }
  expect(relayMatches(text, locale), label).toEqual([]);
}

let fakes = 0;
function newFake(): FakePaymentProvider {
  fakes += 1;
  return new FakePaymentProvider({
    now: () => T0,
    namespace: `br${String(fakes)}`,
    refunds: "sync",
  });
}

describe.skipIf(server.url === undefined)(
  `spec 020a what the buyer sees after an admin action${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "admin_renders");
      await scratch.sql`INSERT INTO users (id, email) VALUES (${ADMIN_ID}, 'renders-admin@example.test')`;
      await scratch.sql`INSERT INTO admin_profile (user_id, display_name) VALUES (${ADMIN_ID}, ${ADMIN_NAME})`;
      await scratch.sql.begin(async (tx) => {
        await base(tx);
        await tx`INSERT INTO locale (code, bcp47, name, fallback_code)
                 VALUES ('en-gb', 'en-GB', 'English (UK)', 'en'),
                        ('pl', 'pl-PL', 'Polski', 'en')
                 ON CONFLICT DO NOTHING`;
      });
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    const transactionOf =
      (): PaymentTransaction =>
      <T>(fn: (executor: OrderExecutor) => Promise<T>) =>
        scratch.sql.begin((tx) => fn(runnerOf(tx))) as Promise<T>;

    const adminTransaction: OrderActionTransaction = (context, fn) =>
      scratch.sql.begin(async (tx) => {
        await tx`SELECT set_config('app.audit_action', ${context.action}, true)`;
        await tx`SELECT set_config('app.audit_reason', ${context.reason ?? ""}, true)`;
        await asApp(tx, {
          role: "admin",
          ...(context.userId === undefined ? {} : { userId: context.userId }),
        });
        return fn(runnerOf(tx));
      }) as never;

    function lifecycleOf(fake: FakePaymentProvider): LifecycleDeps {
      return {
        provider: fake,
        transaction: transactionOf(),
        now: () => T0,
        alert: () => undefined,
        methodSources: () => Promise.resolve(METHODS_ON),
      };
    }

    const refundDeps = (fake: FakePaymentProvider): AdminOrderRefundDeps => ({
      guard: () => Promise.resolve(SESSION),
      transaction: adminTransaction,
      refund: lifecycleOf(fake),
    });
    const cancelDeps = (): AdminOrderCancelDeps => ({
      guard: () => Promise.resolve(SESSION),
      transaction: adminTransaction,
    });

    /** A paid one-order purchase of 58.00 PLN on its own fake. */
    async function paidOrder(): Promise<{
      orderId: string;
      fake: FakePaymentProvider;
    }> {
      const fake = newFake();
      const { purchaseId, orderId } = (await scratch.sql.begin(async (tx) => {
        const customerId = await customer(tx);
        const recipientId = await recipient(tx, customerId);
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
          VALUES ('test', 'PLN', 5800, 'en', ${customerId}) RETURNING id`;
        const purchase = row?.id ?? "";
        const countryId = await country(tx, "PL");
        const id = await insertPlacedOrder(tx, {
          customerId,
          recipientId,
          countryId,
          mode: "test",
          totalMinor: 5_800,
          purchaseId: purchase,
        });
        await tx`UPDATE "order"
                 SET buyer_snapshot = ${tx.json({ name: BUYER_NAME, countryIso2: "GB" })},
                     recipient_snapshot = ${tx.json(RECIPIENT)},
                     delivery_date = ${FAR_DATE}::date
                 WHERE id = ${id}`;
        // One bouquet line: the buyer emails name what was bought.
        const [product] = await tx<{ id: string }[]>`
          INSERT INTO product (sku, product_type, primary_flower, colour_primary, style,
                               price_tier, substitution_class, freshness_days)
          VALUES ('FO-BQ-361', 'bouquet', 'roses', 'red', 'classic', 'classic',
                  'main_flower', 5)
          ON CONFLICT (sku) DO UPDATE SET sku = EXCLUDED.sku
          RETURNING id`;
        const productId = product?.id ?? "";
        await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
                 VALUES (${productId}, 'en', 'Amber Hour', 'amber-hour-361')
                 ON CONFLICT DO NOTHING`;
        await tx`INSERT INTO product_tier (product_id, tier_key, label_key, stems, sort,
                                           is_default)
                 VALUES (${productId}, 'stems_18', 'catalog.tier.stems', 18, 0, true)
                 ON CONFLICT DO NOTHING`;
        await tx`INSERT INTO order_line (order_id, kind, product_id, tier_key, qty,
                                         unit_retail_minor, currency_code, vat_rate_bp)
                 VALUES (${id}, 'product', ${productId}, 'stems_18', 1, 5800, 'PLN', 800)`;
        return { purchaseId: purchase, orderId: id };
      })) as { purchaseId: string; orderId: string };
      const started = await startPayment(purchaseId, lifecycleOf(fake));
      if (started.kind !== "started") throw new Error(started.kind);
      await fake.simulateSuccess(started.intentRef);
      const synced = await syncFromProvider(purchaseId, lifecycleOf(fake));
      if (synced.outcome !== "captured") throw new Error(synced.outcome);
      return { orderId, fake };
    }

    async function seqOf(orderId: string): Promise<number> {
      const [row] = await scratch.sql<{ seq: number }[]>`
        SELECT coalesce(max(seq), 0)::int AS seq FROM order_event WHERE order_id = ${orderId}`;
      return row?.seq ?? 0;
    }

    async function statusOf(orderId: string): Promise<string> {
      const [row] = await scratch.sql<{ status: string }[]>`
        SELECT status FROM "order" WHERE id = ${orderId}`;
      return row?.status ?? "";
    }

    async function succeededRefunds(orderId: string): Promise<string[]> {
      return (
        await scratch.sql<{ amount_minor: string }[]>`
          SELECT amount_minor FROM refund WHERE order_id = ${orderId} AND status = 'succeeded'
          ORDER BY created_at, id`
      ).map((row) => row.amount_minor);
    }

    /** B5 or B6 and the tracking page, in `locale`, as the system renders them. */
    async function renders(
      orderId: string,
      template: "cancelled" | "refund",
      locale: (typeof LOCALES)[number],
    ): Promise<{ email: string; page: string }> {
      return (await scratch.sql.begin(async (tx) => {
        await asApp(tx, { role: "system" });
        const executor = runnerOf(tx);
        const input: NotificationRenderInput = {
          template,
          audience: "buyer",
          locale,
          trigger:
            template === "cancelled"
              ? "order.cancelled"
              : "order.refunded_partial",
          fromStatus: null,
          orderId,
          purchaseId: null,
          assignmentId: null,
          partnerId: null,
          invoiceId: null,
          link: null,
          inboxUrl: null,
          whatsappCopyOf: null,
          executor,
        };
        const email = await renderBuyerNotification(template, input, SOURCES);
        const view = await getTrackingView(orderId, {
          executor,
          refundLines: buyerRefundLines,
        });
        const page = renderToStaticMarkup(
          await TrackingPageView({
            locale,
            view,
            photoHref: `/${locale}/track/T/photo`,
            calendarHref: `/${locale}/track/T/calendar.ics`,
          }),
        );
        return {
          email: `${email.subject}\n${words(email.html)}\n${email.text}`,
          page: words(page),
        };
      })) as { email: string; page: string };
    }

    /* ---------------------------------------------------------------------- */

    it("T-28 (AC-27): a cancel with each reason and the note: B5 and the tracking page in en-gb and pl carry neither the note nor a reason", async () => {
      for (const reason of CANCEL_REASONS) {
        const { orderId, fake } = await paidOrder();
        const result = await adminOrderCancel(
          {
            orderId,
            actionId: randomUUID(),
            expectedSeq: await seqOf(orderId),
            reason,
            note: NOTE,
          },
          cancelDeps(),
        );
        expect(result, reason).toMatchObject({ ok: true, kind: "cancel" });
        await refundCancelledOrder(orderId, lifecycleOf(fake));
        expect(await succeededRefunds(orderId), reason).toEqual(["5800"]);
        for (const locale of LOCALES) {
          const { email, page } = await renders(orderId, "cancelled", locale);
          // The render is the real one: it states the refund of this order's total.
          expect(email, `${reason} ${locale}`).toMatch(/58[.,]00/u);
          expect(page, `${reason} ${locale}`).toMatch(/58[.,]00/u);
          scanned(`B5 ${reason} ${locale}`, email, locale);
          scanned(`tracking ${reason} ${locale}`, page, locale);
        }
      }
    }, 300_000);

    it("T-28 (AC-27): a partial refund then a full refund with each refund reason and the note: B6 and the tracking page carry neither", async () => {
      for (const reason of REFUND_REASONS) {
        const { orderId, fake } = await paidOrder();
        await scratch.sql.begin((tx) =>
          walkOrderTo(tx, orderId, "in_production"),
        );
        const partial = await adminOrderRefund(
          {
            orderId,
            actionId: randomUUID(),
            expectedSeq: await seqOf(orderId),
            kind: "partial",
            amountText: "13,00",
            reason,
            note: NOTE,
          },
          refundDeps(fake),
        );
        expect(partial, reason).toMatchObject({
          ok: true,
          kind: "refund_partial",
        });
        expect(await statusOf(orderId), reason).toBe("in_production");
        for (const locale of LOCALES) {
          const { email, page } = await renders(orderId, "refund", locale);
          expect(email, `${reason} ${locale}`).toMatch(/13[.,]00/u);
          scanned(`B6 partial ${reason} ${locale}`, email, locale);
          scanned(`tracking partial ${reason} ${locale}`, page, locale);
        }
        const full = await adminOrderRefund(
          {
            orderId,
            actionId: randomUUID(),
            expectedSeq: await seqOf(orderId),
            kind: "full",
            reason,
            note: NOTE,
          },
          refundDeps(fake),
        );
        expect(full, reason).toMatchObject({ ok: true, kind: "refund_full" });
        expect(await succeededRefunds(orderId), reason).toEqual([
          "1300",
          "4500",
        ]);
        expect(await statusOf(orderId), reason).toBe("refunded_full");
        for (const locale of LOCALES) {
          const { email, page } = await renders(orderId, "refund", locale);
          expect(email, `${reason} ${locale}`).toMatch(/45[.,]00/u);
          scanned(`B6 full ${reason} ${locale}`, email, locale);
          scanned(`tracking full ${reason} ${locale}`, page, locale);
        }
      }
    }, 600_000);

    it("T-32 (AC-31): over this suite no log line or Sentry event carries a person, the note, a token or a link", async () => {
      const tokens = (
        await scratch.sql<
          { public_token: string }[]
        >`SELECT public_token FROM "order"`
      ).map((row) => row.public_token);
      expect(tokens.length).toBeGreaterThan(0);
      // The spy is live: the action log line of every call above reached it.
      expect(watch.captured()).toContain("admin.order_action");
      watch.expectClean([
        "SENTINEL-NOTE-7",
        BUYER_NAME,
        "Test Recipient",
        "+48500000000",
        RECIPIENT.fullName,
        RECIPIENT.phoneE164,
        RECIPIENT.addressLines[0] ?? "",
        RECIPIENT.cardMessage,
        "@example.test",
        ...tokens,
      ]);
    });
  },
);
