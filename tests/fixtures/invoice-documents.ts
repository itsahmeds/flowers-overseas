/**
 * Invoice and credit-note snapshots for the PDF suites (spec 018 AC-17, AC-19, AC-21, AC-22,
 * AC-40; TASK-342). Synthetic facts only: the issuer is an obvious test seller, never the real
 * company's registry number or address (`plan/07` §6).
 *
 * `AC17_INVOICE` is AC-17's fixture as the artboard draws it: one 8 % bouquet (£45.90), one 23 %
 * add-on (£6.00) and the free printed card, paid in GBP (£51.90), labelled `pl` + `en-gb`, with
 * the PLN line at an NBP table A rate. The per-rate figures are `splitGross`'s (round half to
 * even on the group total), the same arithmetic `issueInvoice` stores.
 */
import {
  splitGross,
  type CreditNoteSnapshot,
  type InvoiceSnapshot,
} from "@/modules/invoices";

export const TEST_ISSUER: InvoiceSnapshot["issuer"] = {
  legalName: "Test Seller LLC",
  registryName: "Test Register",
  registrationNumber: "TEST-0001",
  address: {
    lines: ["1 Test Street"],
    postalCode: "00001",
    city: "Testville",
    countryIso2: "US",
  },
  vatIds: [
    { countryIso2: "EE", vatId: "EE000000000" },
    { countryIso2: "PL", vatId: "PL0000000000" },
  ],
};

const RATE_8 = splitGross(4_590, 800);
const RATE_23 = splitGross(600, 2300);

export const AC17_INVOICE: InvoiceSnapshot = {
  kind: "invoice",
  issuer: TEST_ISSUER,
  buyer: { name: "Sam Sample", countryIso2: "GB" },
  supplyDate: "2026-10-08",
  issueDate: "2026-10-06",
  lines: [
    {
      kind: "product",
      qty: 1,
      unitGrossMinor: 4_590,
      grossMinor: 4_590,
      vatRateBp: 800,
      vatBearing: true,
      names: { "en-gb": "Amber Hour" },
    },
    {
      kind: "addon",
      qty: 1,
      unitGrossMinor: 600,
      grossMinor: 600,
      vatRateBp: 2300,
      vatBearing: true,
      names: { pl: "Bombonierka", "en-gb": "Box of chocolates" },
    },
    {
      kind: "addon",
      qty: 1,
      unitGrossMinor: 0,
      grossMinor: 0,
      vatRateBp: 800,
      vatBearing: true,
      names: { pl: "Drukowany bilecik", "en-gb": "Printed card" },
    },
  ],
  byRate: [RATE_8, RATE_23],
  outsideVatMinor: 0,
  totals: {
    netMinor: RATE_8.netMinor + RATE_23.netMinor,
    vatMinor: RATE_8.vatMinor + RATE_23.vatMinor,
    grossMinor: 5_190,
  },
  currency: "GBP",
  vatCurrency: "PLN",
  vatRate: {
    from: "GBP",
    to: "PLN",
    rate: "5.1234",
    source: "nbp_table_a",
    table: "193/A/NBP/2026",
    effectiveDate: "2026-10-05",
  },
  profileKey: "principal-pl",
  labelLocales: ["pl", "en-gb"],
  orderReference: "FO-7K2M-9QXA",
};

const CREDIT_23 = splitGross(-600, 2300);

/** A partial refund of the add-on (row 30), against `AC17_INVOICE`. */
export const AC21_CREDIT_NOTE: CreditNoteSnapshot = {
  kind: "credit_note",
  issuer: TEST_ISSUER,
  buyer: { name: "Sam Sample", countryIso2: "GB" },
  supplyDate: "2026-10-08",
  issueDate: "2026-10-09",
  byRate: [CREDIT_23],
  outsideVatMinor: 0,
  totals: {
    netMinor: CREDIT_23.netMinor,
    vatMinor: CREDIT_23.vatMinor,
    grossMinor: -600,
  },
  currency: "GBP",
  vatCurrency: "PLN",
  vatRate: AC17_INVOICE.vatRate,
  profileKey: "principal-pl",
  labelLocales: ["pl", "en-gb"],
  orderReference: "FO-7K2M-9QXA",
  corrects: {
    invoiceId: "00000000-0000-4000-8000-000000000001",
    number: "FO-PL/2026/000001",
    issueDate: "2026-10-06",
  },
  refund: {
    refundId: "00000000-0000-4000-8000-000000000002",
    succeededAt: "2026-10-09T10:00:00.000Z",
  },
};

export const PRINCIPAL_PROFILE = {
  titleKey: "invoice.title.vatInvoice",
  issuerStatementKey: null,
} as const;
