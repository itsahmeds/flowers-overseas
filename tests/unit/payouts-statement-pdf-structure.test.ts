/**
 * Spec 030a T-30, the PDF half (AC-30; TASK-367): the florist's payout statement is a tagged PDF
 * with a structure tree, a `/Lang` in the florist's language and a `/Title` the viewer shows.
 * The axe half of T-30 (the three pages and the email HTML in a browser) is a Playwright run,
 * carried to CI by tonight's rules (TASK-367 brief, Carry-forwards).
 */
import { describe, expect, it } from "vitest";

import {
  type PayoutStatementView,
  renderPayoutStatementPdf,
} from "@/modules/notifications/emails";

import { pdfCatalog, pdfObjects } from "../fixtures/pdf-text.ts";

const VIEW: PayoutStatementView = {
  payoutId: "4b6f1d2e-8c3a-4f5b-9e7d-1a2b3c4d5e6f",
  statementNumber: "P-000127",
  kind: "weekly",
  periodStart: "2026-10-19",
  periodEnd: "2026-10-25",
  sentAt: new Date("2026-10-26T09:15:00Z"),
  currency: "PLN",
  totalMinor: 14900,
  language: "pl",
  partnerCode: "pl-krk-pod-lipa",
  partnerName: "Kwiaciarnia pod Lipą",
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
  ],
};

/** The Info dictionary the trailer names. */
function infoOf(bytes: Uint8Array): string {
  const text = Buffer.from(bytes).toString("latin1");
  const info = /\/Info (\d+) 0 R/u.exec(text);
  const object = pdfObjects(bytes).find((o) => o.id === Number(info?.[1]));
  if (object === undefined) throw new Error("no Info dictionary");
  return object.dictionary;
}

describe("T-30 (AC-30): the statement PDF's structure, language and title", () => {
  for (const language of ["en", "pl", "de"] as const) {
    it(`${language}: StructTreeRoot, Lang (${language}), a Title shown by the viewer`, async () => {
      const bytes = await renderPayoutStatementPdf({ ...VIEW, language });
      const catalog = pdfCatalog(bytes);
      expect(catalog).toMatch(/\/StructTreeRoot \d+ 0 R/u);
      expect(catalog).toMatch(new RegExp(`/Lang \\(${language}\\)`, "u"));
      const markInfo = /\/MarkInfo (\d+) 0 R/u.exec(catalog);
      const mark = pdfObjects(bytes).find(
        (o) => o.id === Number(markInfo?.[1]),
      );
      expect(mark?.dictionary).toMatch(/\/Marked true/u);
      const info = infoOf(bytes);
      const title = /\/Title (\d+) 0 R/u.exec(info);
      expect(title).not.toBeNull();
      const titleValue = pdfObjects(bytes).find(
        (o) => o.id === Number(title?.[1]),
      )?.dictionary;
      // A non-empty PDF string, literal `(…)` or hex `<…>`.
      expect(titleValue?.trim()).toMatch(/^(?:\([^)]+\)|<[0-9a-fA-F]{4,}>)$/u);
      const prefs = /\/ViewerPreferences (\d+) 0 R/u.exec(catalog);
      const viewer =
        prefs === null
          ? catalog
          : (pdfObjects(bytes).find((o) => o.id === Number(prefs[1]))
              ?.dictionary ?? "");
      expect(viewer).toMatch(/\/DisplayDocTitle true/u);
    });
  }
});
