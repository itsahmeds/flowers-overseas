import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { renderInvoicePdf } from "@/modules/invoices";
import {
  AC17_INVOICE,
  PRINCIPAL_PROFILE,
} from "../fixtures/invoice-documents.ts";
import { pdfText, pdfCatalog } from "../fixtures/pdf-text.ts";
it("smoke", async () => {
  const bytes = await renderInvoicePdf({
    kind: "invoice",
    number: "FO-PL/2026/000001",
    issuedAt: new Date("2026-10-06T10:00:00Z"),
    snapshot: AC17_INVOICE,
    profile: PRINCIPAL_PROFILE,
  });
  writeFileSync(process.env.SMOKE_OUT ?? "/dev/null", bytes);
  writeFileSync(
    (process.env.SMOKE_OUT ?? "/dev/null") + ".txt",
    pdfCatalog(bytes) + "\n----\n" + pdfText(bytes),
  );

  expect(bytes.length).toBeGreaterThan(1000);
});
