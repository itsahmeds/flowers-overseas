/**
 * The florist's payout statement, email and PDF, from one view (spec 030a §10 T-22, T-23; AC-21,
 * AC-22, AC-23; TASK-365).
 *
 *  - T-22: the view is strict, so a recipient, buyer, card, retail or token field is refused
 *    before anything renders; and the email and PDF of a fixture print none of the distinctive
 *    strings an order around it carries. (The integration suite, T-21, does the same scan with the
 *    loader reading a real order that holds them.)
 *  - T-23: the `emails.floristPayoutStatement.*` keys the email and the PDF read are exactly the
 *    namespace's keys; every other key either reads is the florist frame's; `notInvoice` and
 *    `deleteReminder` are in both; a VAT scan (`%`, `VAT`, `PTU`, `MwSt`) of the visible text of
 *    both, in en, pl and de, finds nothing.
 */
import { describe, expect, it } from "vitest";

import type { LocaleCode } from "@/config/locales";
import { formatMoney } from "@/modules/i18n";
import {
  type PayoutStatementView,
  PayoutStatementViewSchema,
  payoutStatementWords,
  renderPayoutStatementEmail,
  renderPayoutStatementPdf,
  statementFilename,
} from "@/modules/notifications/emails";
import { emailTranslator } from "@/modules/notifications/emails/copy";

import en from "../../messages/en.json" with { type: "json" };
import { pdfText } from "../fixtures/pdf-text.ts";

const VIEW: PayoutStatementView = {
  payoutId: "4b6f1d2e-8c3a-4f5b-9e7d-1a2b3c4d5e6f",
  statementNumber: "P-000127",
  kind: "weekly",
  periodStart: "2026-10-19",
  periodEnd: "2026-10-25",
  sentAt: new Date("2026-10-26T09:15:00Z"),
  currency: "PLN",
  totalMinor: 56600,
  language: "en",
  partnerCode: "pl-krk-pod-lipa",
  partnerName: "Kwiaciarnia pod Lipą Piotr Nowak",
  lines: [
    {
      kind: "order",
      orderReference: "FO-7K2M-9QXA",
      deliveryDate: "2026-10-21",
      items: [
        {
          productName: "Amber Hour",
          tierLabelKey: "catalog.tier.stems",
          tierStems: 18,
          quantity: 1,
        },
      ],
      amountMinor: 14900,
      note: null,
    },
    {
      kind: "order",
      orderReference: "FO-3HNP-A4TV",
      deliveryDate: "2026-10-23",
      items: [
        {
          productName: "Amber Hour",
          tierLabelKey: "catalog.tier.stems",
          tierStems: 18,
          quantity: 2,
        },
        {
          productName: "Vistula Red",
          tierLabelKey: "catalog.tier.stems",
          tierStems: 12,
          quantity: 1,
        },
      ],
      amountMinor: 39700,
      note: null,
    },
    {
      kind: "adjustment",
      orderReference: "FO-3HNP-A4TV",
      deliveryDate: null,
      items: [],
      amountMinor: 2000,
      note: "Vase for FO-3HNP-A4TV, agreed by phone",
    },
  ],
};

/** What an order around the statement holds and the statement must never print (AC-22). */
const DISTINCTIVE = [
  "Zofia Recipientówna",
  "ul. Tajemnicza 77",
  "+48 600 111 222",
  "Kocham Cię najbardziej na świecie",
  "Bartholomew Buyerson",
  "bartholomew.buyer@example.test",
  "tok_9f8e7d6c5b4a",
  // The retail amount of the order (8000 + 900 minor), as the buyer was charged it.
  "89.00",
];

/** The visible text of an HTML part: no style block, no tags, entities as characters. */
function visible(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&#39;/gu, "'")
    .replace(/&amp;/gu, "&")
    .replace(/&nbsp;/gu, " ")
    .replace(/\s+/gu, " ");
}

const collapse = (value: string): string => value.replace(/\s+/gu, " ");

/** A translator that records every key it is asked for. */
function recording(keys: Set<string>) {
  return (locale: LocaleCode) => {
    const inner = emailTranslator(locale);
    return Object.assign(
      (key: string, values?: Readonly<Record<string, string | number>>) => {
        keys.add(key);
        return inner(key, values);
      },
      {
        plain: (
          key: string,
          values?: Readonly<Record<string, string | number>>,
        ) => {
          keys.add(key);
          return inner.plain(key, values);
        },
      },
    );
  };
}

function flatKeys(node: unknown, prefix: string): string[] {
  if (typeof node !== "object" || node === null) return [prefix];
  return Object.entries(node).flatMap(([key, value]) =>
    flatKeys(value, `${prefix}.${key}`),
  );
}

const NAMESPACE_KEYS = flatKeys(
  en.emails.floristPayoutStatement,
  "emails.floristPayoutStatement",
).sort();

/** The florist frame's keys and the tier's: everything else a statement may read. */
const FRAME_KEYS = [
  "company.support.label",
  "emails.layout.audience.florist",
  "emails.layout.floristHelp",
  "emails.layout.floristWhy",
  "catalog.tier.stems",
];

describe("T-22 (AC-22): nothing about a person, a price or a token", () => {
  it("the view refuses a recipient, buyer, card, retail or token field, on the payout or on a line", () => {
    for (const extra of [
      { recipientName: "Zofia" },
      { buyerEmail: "b@example.test" },
      { publicToken: "tok" },
      { vatRateBp: 2300 },
    ]) {
      expect(
        PayoutStatementViewSchema.safeParse({ ...VIEW, ...extra }).success,
      ).toBe(false);
    }
    const [line] = VIEW.lines;
    for (const extra of [
      { recipientName: "Zofia" },
      { cardMessage: "Kocham" },
      { unitRetailMinor: 8000 },
    ]) {
      expect(
        PayoutStatementViewSchema.safeParse({
          ...VIEW,
          lines: [{ ...line, ...extra }],
        }).success,
      ).toBe(false);
    }
    expect(PayoutStatementViewSchema.safeParse(VIEW).success).toBe(true);
  });

  it("the email (both parts) and the PDF text print none of the order's distinctive strings", async () => {
    const email = renderPayoutStatementEmail(VIEW);
    const pdf = collapse(pdfText(await renderPayoutStatementPdf(VIEW)));
    for (const value of DISTINCTIVE) {
      expect(email.subject, value).not.toContain(value);
      expect(email.text, value).not.toContain(value);
      expect(visible(email.html), value).not.toContain(value);
      expect(pdf, value).not.toContain(value);
    }
  });
});

describe("AC-21: every field, as the formatters render it", () => {
  it("the email carries the number, the period, each line's reference, date, product and amount, and the total", () => {
    const email = renderPayoutStatementEmail(VIEW);
    const total = formatMoney({ amountMinor: 56600, currency: "PLN" }, "en");
    expect(email.subject).toBe(`Payout statement P-000127 · ${total}`);
    const body = collapse(email.text);
    for (const value of [
      "Statement P-000127",
      collapse(payoutStatementWords(VIEW).period),
      "FO-7K2M-9QXA",
      "FO-3HNP-A4TV",
      "21 October",
      "23 October",
      "Amber Hour · 18 stems",
      "Amber Hour · 18 stems × 2",
      "Vistula Red · 12 stems",
      "Vase for FO-3HNP-A4TV, agreed by phone",
      collapse(formatMoney({ amountMinor: 14900, currency: "PLN" }, "en")),
      collapse(formatMoney({ amountMinor: 39700, currency: "PLN" }, "en")),
      collapse(formatMoney({ amountMinor: 2000, currency: "PLN" }, "en")),
      `Total: ${collapse(total)}`,
      "Attached: payout-statement-P-000127.pdf",
    ]) {
      expect(body, value).toContain(value);
    }
    expect(statementFilename("P-000127")).toBe("payout-statement-P-000127.pdf");
  });

  it("the PDF carries the same, with the florist's name extracting as typed", async () => {
    const pdf = collapse(pdfText(await renderPayoutStatementPdf(VIEW)));
    for (const value of [
      "Payout statement",
      "P-000127",
      "FO-7K2M-9QXA",
      "21 Oct 2026",
      "Amber Hour · 18 stems × 2",
      "Kwiaciarnia pod Lipą Piotr Nowak",
      "pl-krk-pod-lipa",
      collapse(formatMoney({ amountMinor: 56600, currency: "PLN" }, "en")),
    ]) {
      expect(pdf, value).toContain(value);
    }
  });

  it("a prepaid payout prints the single date, not a period", () => {
    const words = payoutStatementWords({
      ...VIEW,
      kind: "prepaid",
      periodStart: "2026-10-22",
      periodEnd: "2026-10-22",
    });
    expect(words.periodLabel).toBe("Date");
    expect(words.period).toBe("22 Oct 2026");
  });

  it("Polish: amounts and dates in pl, the Polish words", () => {
    const email = renderPayoutStatementEmail({ ...VIEW, language: "pl" });
    expect(email.subject).toContain("Zestawienie wypłaty P-000127");
    expect(collapse(email.text)).toContain(
      collapse(formatMoney({ amountMinor: 56600, currency: "PLN" }, "pl")),
    );
    expect(email.html).toContain('lang="pl"');
  });
});

describe("T-23 (AC-23): the namespace's keys, the two sentences, no VAT", () => {
  it("email and PDF together read exactly the namespace's keys, and nothing outside it but the florist frame's", async () => {
    const keys = new Set<string>();
    // The weekly fixture, and a prepaid one with a goodwill line: between them every state.
    const prepaid: PayoutStatementView = {
      ...VIEW,
      kind: "prepaid",
      periodStart: "2026-10-22",
      periodEnd: "2026-10-22",
      lines: [
        ...VIEW.lines.slice(0, 1),
        {
          kind: "goodwill",
          orderReference: null,
          deliveryDate: null,
          items: [],
          amountMinor: 5000,
          note: "Thank you for the Sunday delivery",
        },
      ],
    };
    for (const view of [VIEW, prepaid]) {
      renderPayoutStatementEmail(view, recording(keys));
      await renderPayoutStatementPdf(view, { translator: recording(keys) });
    }
    const inside = [...keys]
      .filter((key) => key.startsWith("emails.floristPayoutStatement."))
      .sort();
    expect(inside).toEqual(NAMESPACE_KEYS);
    const outside = [...keys]
      .filter((key) => !key.startsWith("emails.floristPayoutStatement."))
      .sort();
    expect(outside).toEqual([...FRAME_KEYS].sort());
  });

  for (const language of ["en", "pl", "de"] as const) {
    it(`${language}: notInvoice and deleteReminder in the email and the PDF; no %, VAT, PTU or MwSt`, async () => {
      const view = { ...VIEW, language };
      const t = emailTranslator(language);
      const notInvoice = t("emails.floristPayoutStatement.notInvoice");
      const deleteReminder = t("emails.floristPayoutStatement.deleteReminder");
      const email = renderPayoutStatementEmail(view);
      const html = visible(email.html);
      const pdf = collapse(pdfText(await renderPayoutStatementPdf(view)));
      for (const text of [collapse(email.text), html, pdf]) {
        expect(text).toContain(notInvoice);
        expect(text).toContain(collapse(deleteReminder));
        expect(text).not.toMatch(/%|\bVAT\b|\bPTU\b|MwSt/iu);
      }
      expect(email.subject).not.toMatch(/%|\bVAT\b|\bPTU\b|MwSt/iu);
    });
  }
});
