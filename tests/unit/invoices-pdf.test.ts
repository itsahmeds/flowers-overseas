/**
 * Spec 018 invoice PDF, pure half (TASK-342), on the snapshots of `tests/fixtures/invoice-
 * documents.ts`, read back with `tests/fixtures/pdf-text.ts`:
 *
 *  - **T-17 / AC-17 (render):** every listed field of a `principal/PL` invoice is in the extracted
 *    text: issuer legal name, registry code, EE and PL VAT ids, address; buyer name and country;
 *    number, issue and supply dates; each line; per rate net, VAT and gross; totals and currency.
 *  - **T-19 / AC-19 (render):** VAT per rate also in PLN at the stored rate (half away from zero),
 *    with the source, table number and date; no PLN block without a stored rate.
 *  - **T-22 / AC-22:** `StructTreeRoot`, `/MarkInfo << /Marked true >>`, `/Lang`, embedded fonts
 *    (no standard font); "Zażółć gęślą jaźń" and "Größe" extract as typed; the same row renders the
 *    same bytes.
 *  - **T-40 / AC-40 (render):** invoice and credit-note text and snapshot JSON: no `relayMatches`
 *    hit in any locale, no "on behalf of" or partner line, the issuer named as seller; the seed
 *    profiles' title and statement keys resolve to clean strings.
 *  - **T-18 / AC-18 (render):** an agent profile's title and statement come from the profile's
 *    keys, and a line outside `vat_bearing_line_kinds` prints no rate.
 *  - Money edge cases: zero-amount lines, VAT at 0, 5, 8, 20 and 23 %, negative credit-note
 *    amounts.
 */
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { relayMatches } from "@/config/honesty";
import { formatMoney } from "@/modules/i18n";
import {
  convertMinor,
  invoiceTranslator,
  renderInvoicePdf,
  splitGross,
  type InvoiceSnapshot,
  type InvoiceTranslatorFactory,
  type RenderableDocument,
} from "@/modules/invoices";

import { INVOICE_PROFILES } from "../../seed/plan.ts";
import {
  AC17_INVOICE,
  AC21_CREDIT_NOTE,
  PRINCIPAL_PROFILE,
} from "../fixtures/invoice-documents.ts";
import { pdfCatalog, pdfObjects, pdfText } from "../fixtures/pdf-text.ts";

const ISSUED_AT = new Date("2026-10-06T10:00:00Z");

function invoice(
  snapshot: InvoiceSnapshot = AC17_INVOICE,
  profile: RenderableDocument["profile"] = PRINCIPAL_PROFILE,
): RenderableDocument {
  return {
    kind: "invoice",
    number: "FO-PL/2026/000001",
    issuedAt: ISSUED_AT,
    snapshot,
    profile,
  };
}

const CREDIT: RenderableDocument = {
  kind: "credit_note",
  number: "FOK-PL/2026/000001",
  issuedAt: new Date("2026-10-09T10:00:00Z"),
  snapshot: AC21_CREDIT_NOTE,
  profile: PRINCIPAL_PROFILE,
};

/** `Intl` separates a code from its amount with a no-break space; the text is collapsed alike. */
const gbp = (amountMinor: number) =>
  formatMoney({ amountMinor, currency: "GBP" }, "en-gb").replace(/\s+/g, " ");
const pln = (amountMinor: number) =>
  formatMoney({ amountMinor, currency: "PLN" }, "en-gb").replace(/\s+/g, " ");

/** Text with every run joined, whitespace collapsed: what a reader's search finds. */
async function textOf(
  document: RenderableDocument,
  translator?: InvoiceTranslatorFactory,
) {
  const bytes = await renderInvoicePdf(
    document,
    translator === undefined ? {} : { translator },
  );
  return { bytes, text: pdfText(bytes).replace(/\s+/g, " ") };
}

describe("AC-17: every listed field (T-17, render half)", () => {
  it("prints the issuer, the buyer, the dates, each line, per rate and the totals", async () => {
    const { text } = await textOf(invoice());
    const { issuer } = AC17_INVOICE;
    for (const expected of [
      "Faktura / Invoice",
      "Sprzedawca / Seller Test Seller LLC",
      "Kod rejestrowy / Registry code: Test Register TEST-0001",
      "VAT EE: EE000000000",
      "VAT PL: PL0000000000",
      ...issuer.address.lines,
      "00001 Testville",
      "Nabywca / Buyer Sam Sample Wielka Brytania / United Kingdom",
      "Numer / Number FO-PL/2026/000001",
      "Data wystawienia / Issue date 6 Oct 2026",
      "Data dostawy / Supply date 8 Oct 2026",
      "Zamówienie / Order FO-7K2M-9QXA",
      "Waluta / Currency GBP",
      `1 Amber Hour 8% ${gbp(4_590)}`,
      `2 Bombonierka / Box of chocolates 23% ${gbp(600)}`,
      `3 Drukowany bilecik / Printed card 8% ${gbp(0)}`,
      `Razem 8% / Total 8% 8% ${gbp(4_250)} ${gbp(340)} ${gbp(4_590)}`,
      `Razem 23% / Total 23% 23% ${gbp(488)} ${gbp(112)} ${gbp(600)}`,
      `Do zapłaty / Total ${gbp(4_738)} ${gbp(452)} ${gbp(5_190)}`,
      `Zapłacono / Paid, 6 Oct 2026 ${gbp(5_190)}`,
    ]) {
      expect(text).toContain(expected);
    }
  });

  it("the per-rate figures are the snapshot's and sum to the total", () => {
    const gross = AC17_INVOICE.byRate.reduce(
      (sum, split) => sum + split.grossMinor,
      0,
    );
    expect(gross).toBe(AC17_INVOICE.totals.grossMinor);
    expect(AC17_INVOICE.byRate).toEqual([
      { rateBp: 800, netMinor: 4_250, vatMinor: 340, grossMinor: 4_590 },
      { rateBp: 2300, netMinor: 488, vatMinor: 112, grossMinor: 600 },
    ]);
  });

  it("a credit note: its title, the invoice it corrects, negative amounts, the refund line", async () => {
    const { text } = await textOf(CREDIT);
    for (const expected of [
      "Faktura korygująca / Credit note",
      "Numer / Number FOK-PL/2026/000001",
      "Koryguje fakturę / Corrects invoice FO-PL/2026/000001",
      `Razem 23% / Total 23% 23% ${gbp(-488)} ${gbp(-112)} ${gbp(-600)}`,
      `Do zwrotu / Refunded ${gbp(-488)} ${gbp(-112)} ${gbp(-600)}`,
      `Zwrócono / Refunded, 9 Oct 2026 ${gbp(-600)}`,
    ]) {
      expect(text).toContain(expected);
    }
  });
});

describe("AC-19: VAT in PLN at the stored rate (T-19, render half)", () => {
  it("prints each rate's VAT in PLN with the source, table and date", async () => {
    const { text } = await textOf(invoice());
    // 340 × 5.1234 = 1 741.956 → 1 742; 112 × 5.1234 = 573.8208 → 574.
    expect(text).toContain("VAT w PLN / VAT in PLN");
    expect(text).toContain(
      "Kurs NBP, tabela A nr 193/A/NBP/2026, 5 Oct 2026: 1 GBP = 5.1234 PLN / NBP rate, table A no. 193/A/NBP/2026, 5 Oct 2026: 1 GBP = 5.1234 PLN",
    );
    expect(text).toContain(`8%: VAT ${pln(1_742)}`);
    expect(text).toContain(`23%: VAT ${pln(574)}`);
  });

  it("a credit note's PLN VAT is negative, rounded away from zero", async () => {
    const { text } = await textOf(CREDIT);
    expect(text).toContain(`23%: VAT ${pln(-574)}`);
  });

  it("no stored rate, no PLN block", async () => {
    const { text } = await textOf(
      invoice({ ...AC17_INVOICE, vatCurrency: null, vatRate: null }),
    );
    expect(text).not.toContain("PLN");
  });

  it("converts in integer arithmetic, half away from zero", () => {
    expect(convertMinor(340, "5.1234", 2, 2)).toBe(1_742);
    expect(convertMinor(1, "0.5", 2, 2)).toBe(1);
    expect(convertMinor(-1, "0.5", 2, 2)).toBe(-1);
    expect(convertMinor(3, "1.5", 2, 2)).toBe(5);
    expect(convertMinor(1, "0.4999", 2, 2)).toBe(0);
    expect(convertMinor(0, "5.1234", 2, 2)).toBe(0);
    expect(convertMinor(100, "190.125", 2, 0)).toBe(190);
    expect(convertMinor(150, "1.0", 0, 2)).toBe(15_000);
    expect(() => convertMinor(1, "5", 2, 2)).toThrow(RangeError);
  });
});

describe("AC-22: the file (T-22)", () => {
  it("is tagged, has a language, and embeds its fonts", async () => {
    const { bytes } = await textOf(invoice());
    const catalog = pdfCatalog(bytes);
    expect(catalog).toMatch(/\/StructTreeRoot \d+ 0 R/);
    expect(catalog).toMatch(/\/Lang \(pl\)/);
    const markInfo = /\/MarkInfo (\d+) 0 R/.exec(catalog);
    const objects = pdfObjects(bytes);
    const mark = objects.find((object) => object.id === Number(markInfo?.[1]));
    expect(mark?.dictionary).toMatch(/\/Marked true/);
    const descriptors = objects.filter((object) =>
      /\/Type \/FontDescriptor/.test(object.dictionary),
    );
    expect(descriptors.length).toBeGreaterThanOrEqual(2);
    for (const descriptor of descriptors) {
      expect(descriptor.dictionary).toMatch(/\/FontFile2 \d+ 0 R/);
      expect(descriptor.dictionary).toMatch(/\/FontName \/[A-Z]{6}\+NotoSans/);
    }
    expect(Buffer.from(bytes).toString("latin1")).not.toMatch(
      /\/BaseFont \/Helvetica/,
    );
  });

  it("round-trips Polish and German diacritics through text extraction", async () => {
    const snapshot: InvoiceSnapshot = {
      ...AC17_INVOICE,
      buyer: { name: "Zażółć gęślą jaźń", countryIso2: "PL" },
      lines: AC17_INVOICE.lines.map((line, index) =>
        index === 0 ? { ...line, names: { "en-gb": "Größe" } } : line,
      ),
    };
    const { text } = await textOf(invoice(snapshot));
    expect(text).toContain("Zażółć gęślą jaźń");
    expect(text).toContain("1 Größe 8%");
    expect(text).not.toContain("�");
  });

  it("sets Hebrew and Arabic names in their own faces, right to left, never as missing glyphs", async () => {
    // A PDF stores right-to-left text in visual order: the extracted run is the name reversed.
    for (const name of ["דנה לוי", "ليلى حداد"]) {
      const { bytes } = await textOf(
        invoice({ ...AC17_INVOICE, buyer: { name, countryIso2: "GB" } }),
      );
      const raw = pdfText(bytes);
      const visual = [...name].reverse().join("");
      expect(raw.replace(/\n/g, "").replace(/\u00A0/g, " ")).toContain(visual);
      expect(raw).not.toMatch(/[\u0000\uFFFD]/u);
    }
    const { text } = await textOf(
      invoice({
        ...AC17_INVOICE,
        buyer: { name: "Олена Шевченко", countryIso2: "UA" },
      }),
    );
    expect(text).toContain("Олена Шевченко");
  });

  it("the same row renders the same bytes (re-render idempotence)", async () => {
    const first = await renderInvoicePdf(invoice());
    const second = await renderInvoicePdf(invoice());
    const digest = (bytes: Uint8Array) =>
      createHash("sha256").update(bytes).digest("hex");
    expect(digest(second)).toBe(digest(first));
  });
});

describe("AC-40: our document, our words (T-40, render half)", () => {
  const ON_BEHALF = /on behalf of|w imieniu|im Namen|im Auftrag/i;

  it("invoice and credit note: no relay word in any locale, no on-behalf line, the issuer is the seller", async () => {
    for (const document of [invoice(), CREDIT]) {
      const { text } = await textOf(document);
      const json = JSON.stringify(document.snapshot);
      for (const locale of ["en", "en-gb", "de", "pl"]) {
        expect(relayMatches(text, locale)).toEqual([]);
        expect(relayMatches(json, locale)).toEqual([]);
      }
      expect(text).not.toMatch(ON_BEHALF);
      expect(text).not.toMatch(/partner|florist|kwiaciar/i);
      expect(text).toContain("Sprzedawca / Seller Test Seller LLC");
    }
  });

  it("a statement that says on behalf of turns the scan red (the mutation T-40 names)", async () => {
    const withStatement: InvoiceTranslatorFactory = (locale) => {
      const translate = invoiceTranslator(locale);
      return (key, values) =>
        key === "invoice.statement.mutation"
          ? "Issued on behalf of the partner florist."
          : translate(key, values);
    };
    const { text } = await textOf(
      invoice(AC17_INVOICE, {
        titleKey: PRINCIPAL_PROFILE.titleKey,
        issuerStatementKey: "invoice.statement.mutation",
      }),
      withStatement,
    );
    expect(text).toMatch(ON_BEHALF);
    expect(relayMatches(text, "en")).not.toEqual([]);
  });

  it("the seed profiles' title and statement keys resolve to clean strings", () => {
    for (const profile of INVOICE_PROFILES) {
      const keys = [
        profile["title_key"],
        profile["issuer_statement_key"],
      ].filter((key): key is string => typeof key === "string");
      expect(keys.length).toBeGreaterThan(0);
      for (const locale of ["en", "en-gb", "de", "pl"] as const) {
        const translate = invoiceTranslator(locale);
        for (const key of keys) {
          const value = translate(key);
          expect(relayMatches(value, locale)).toEqual([]);
          expect(value).not.toMatch(ON_BEHALF);
        }
      }
      // The launch rule (§7): no seed profile carries an issuer statement.
      expect(profile["issuer_statement_key"]).toBeNull();
    }
  });
});

describe("AC-18: the profile's words and VAT-bearing kinds (T-18, render half)", () => {
  it("prints the agent title and a test-only statement from the profile, and no rate on a line outside VAT", async () => {
    const statement: InvoiceTranslatorFactory = (locale) => {
      const translate = invoiceTranslator(locale);
      return (key, values) =>
        key === "invoice.statement.test"
          ? "Test statement."
          : translate(key, values);
    };
    const surcharge = splitGross(500, 2300);
    const product = AC17_INVOICE.lines[0];
    if (product === undefined) throw new Error("fixture has a product line");
    const snapshot: InvoiceSnapshot = {
      ...AC17_INVOICE,
      lines: [
        { ...product, vatBearing: false },
        {
          kind: "surcharge",
          qty: 1,
          unitGrossMinor: 500,
          grossMinor: 500,
          vatRateBp: 2300,
          vatBearing: true,
          names: {},
        },
      ],
      byRate: [surcharge],
      outsideVatMinor: 4_590,
      totals: {
        netMinor: surcharge.netMinor + 4_590,
        vatMinor: surcharge.vatMinor,
        grossMinor: 5_090,
      },
      profileKey: "agent-pl",
    };
    const { text } = await textOf(
      invoice(snapshot, {
        titleKey: "invoice.title.receiptOnBehalf",
        issuerStatementKey: "invoice.statement.test",
      }),
      statement,
    );
    expect(text).toContain("Pokwitowanie / Receipt");
    expect(text).toContain("Test statement.");
    expect(text).toContain(`1 Amber Hour ${gbp(4_590)}`);
    expect(text).toContain(
      `2 Dopłata za dostawę / Delivery surcharge 23% ${gbp(500)}`,
    );
    expect(text).toContain(
      `Nie podlega VAT / Outside the scope of VAT ${gbp(4_590)}`,
    );
  });
});

describe("money edge cases", () => {
  it("VAT at 0, 5, 8, 20 and 23 %, half to even on the group, as printed", async () => {
    const rates = [0, 500, 800, 2000, 2300];
    // 1 050 at 5 % is 50 exactly; 15 at 20 % is 2.5 → 2 (half to even); 1 at 23 % rounds to 0.
    const grosses = [1_000, 1_050, 4_590, 15, 1];
    const byRate = rates.map((rateBp, index) =>
      splitGross(grosses[index] ?? 0, rateBp),
    );
    expect(byRate.map((split) => split.vatMinor)).toEqual([0, 50, 340, 2, 0]);
    const total = grosses.reduce((sum, gross) => sum + gross, 0);
    const snapshot: InvoiceSnapshot = {
      ...AC17_INVOICE,
      lines: rates.map((rateBp, index) => ({
        kind: "product" as const,
        qty: 1,
        unitGrossMinor: grosses[index] ?? 0,
        grossMinor: grosses[index] ?? 0,
        vatRateBp: rateBp,
        vatBearing: true,
        names: { "en-gb": `Line ${String(index + 1)}` },
      })),
      byRate,
      totals: {
        netMinor: byRate.reduce((sum, split) => sum + split.netMinor, 0),
        vatMinor: byRate.reduce((sum, split) => sum + split.vatMinor, 0),
        grossMinor: total,
      },
    };
    const { text } = await textOf(invoice(snapshot));
    expect(text).toContain(
      `Razem 0% / Total 0% 0% ${gbp(1_000)} ${gbp(0)} ${gbp(1_000)}`,
    );
    expect(text).toContain(
      `Razem 5% / Total 5% 5% ${gbp(1_000)} ${gbp(50)} ${gbp(1_050)}`,
    );
    expect(text).toContain(
      `Razem 20% / Total 20% 20% ${gbp(13)} ${gbp(2)} ${gbp(15)}`,
    );
    expect(text).toContain(
      `Razem 23% / Total 23% 23% ${gbp(1)} ${gbp(0)} ${gbp(1)}`,
    );
    expect(text).toContain(
      `Do zapłaty / Total ${gbp(total - 392)} ${gbp(392)} ${gbp(total)}`,
    );
  });

  it("a quantity above one prints it beside the name", async () => {
    const addon = AC17_INVOICE.lines[1];
    if (addon === undefined) throw new Error("fixture has an add-on line");
    const snapshot: InvoiceSnapshot = {
      ...AC17_INVOICE,
      lines: [{ ...addon, qty: 2, unitGrossMinor: 300 }],
    };
    const { text } = await textOf(invoice(snapshot));
    expect(text).toContain(
      `1 Bombonierka / Box of chocolates × 2 23% ${gbp(600)}`,
    );
  });
});
