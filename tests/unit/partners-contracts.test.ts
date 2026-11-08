/**
 * Spec 030b T-31 to T-35 (unit halves; AC-37, AC-39, AC-42, AC-58; TASK-442):
 *
 *  - `checkPdf`: a 2-page PDF and a file of exactly 10 485 760 bytes pass with their page count;
 *    10 485 761 bytes, a PNG, `%PDF-` over garbage, an encrypted PDF, a document JavaScript, an
 *    `/OpenAction` Launch, an attached file and an XFA form are each refused with their rule id;
 *  - `contractFlags`: exactly the spec's flag sets; `reviewState` and `contractReminderDue` at
 *    the AC-42 instants (2026-10-31T22:30Z sends nothing, 23:30Z is 1 November in Warsaw);
 *  - the upload, edit and withdraw parsers refuse the spec's cases with their field codes;
 *  - no import of `modules/partners/contracts` outside `src/app/admin`, `src/jobs`, the module
 *    itself and the tests.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { PDFDocument, PDFName, PDFString } from "@cantoo/pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";

import { CONTRACTS_CONFIG } from "@/config/contracts";

import {
  contractFlags,
  contractReminderDue,
  type CurrentDocument,
  reviewState,
} from "../../src/modules/partners/contracts/flags.ts";
import { checkPdf } from "../../src/modules/partners/contracts/pdf.ts";
import {
  parseContractDetailsEdit,
  parseContractUpload,
  parseContractWithdraw,
} from "../../src/modules/partners/contracts/schemas.ts";

const ID = "8f9c1d3e-6a3b-4f1e-9b8c-1a2b3c4d5e6f";
const VERSION = "2026-10-28T10:00:00.000Z";

async function pdf(
  pages: number,
  shape?: (doc: PDFDocument) => void | Promise<void>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let page = 0; page < pages; page += 1) doc.addPage([200, 200]);
  await shape?.(doc);
  return doc.save({ useObjectStreams: false });
}

/** `bytes` padded with trailing whitespace to exactly `size`. */
function padded(bytes: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size).fill(0x20);
  out.set(bytes, 0);
  return out;
}

describe("checkPdf (AC-37)", () => {
  let twoPages: Uint8Array;
  beforeAll(async () => {
    twoPages = await pdf(2);
  });

  it("passes a 2-page PDF with its page count", async () => {
    expect(await checkPdf(twoPages)).toEqual({ ok: true, pageCount: 2 });
  });

  it("passes exactly 10 485 760 bytes and refuses one byte more", async () => {
    expect(CONTRACTS_CONFIG.maxBytes).toBe(10_485_760);
    expect(await checkPdf(padded(twoPages, 10_485_760))).toEqual({
      ok: true,
      pageCount: 2,
    });
    expect(await checkPdf(padded(twoPages, 10_485_761))).toEqual({
      ok: false,
      ruleId: "contract.too_large",
    });
  });

  it("refuses a PNG as not_pdf and %PDF- over garbage as unreadable", async () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
    ]);
    expect(await checkPdf(png)).toEqual({
      ok: false,
      ruleId: "contract.not_pdf",
    });
    const garbage = new TextEncoder().encode(`%PDF-1.7\n${"x".repeat(400)}`);
    expect(await checkPdf(garbage)).toEqual({
      ok: false,
      ruleId: "contract.unreadable",
    });
  });

  it("refuses an encrypted PDF", async () => {
    const bytes = await pdf(1, (doc) => {
      doc.encrypt({ userPassword: "secret", ownerPassword: "owner" });
    });
    expect(await checkPdf(bytes)).toEqual({
      ok: false,
      ruleId: "contract.encrypted",
    });
  });

  it.each([
    [
      "a document JavaScript",
      (doc: PDFDocument) => doc.addJavaScript("hello", "app.alert('x')"),
    ],
    [
      "an /OpenAction Launch",
      (doc: PDFDocument) => {
        const action = doc.context.obj({
          Type: "Action",
          S: "Launch",
          F: PDFString.of("calc.exe"),
        });
        doc.catalog.set(PDFName.of("OpenAction"), doc.context.register(action));
      },
    ],
    [
      "an attached file",
      async (doc: PDFDocument) => {
        await doc.attach(new TextEncoder().encode("hello"), "note.txt", {
          mimeType: "text/plain",
        });
      },
    ],
    [
      "an XFA form",
      (doc: PDFDocument) => {
        const form = doc.context.obj({
          Fields: [],
          XFA: PDFString.of("<xdp/>"),
        });
        doc.catalog.set(PDFName.of("AcroForm"), doc.context.register(form));
      },
    ],
  ])("refuses %s as active content", async (_label, shape) => {
    expect(await checkPdf(await pdf(1, shape))).toEqual({
      ok: false,
      ruleId: "contract.active_content",
    });
  });
});

const AGREEMENT: CurrentDocument = {
  docKind: "agreement",
  templateVersion: "pa-pl-2026-10",
  signedOn: "2026-10-20",
  includesDpa: false,
  reviewOn: null,
  noticeDays: 30,
};
const ADDENDUM: CurrentDocument = {
  ...AGREEMENT,
  docKind: "dpa_addendum",
  templateVersion: "dpa-pl-2026-10",
};
const TERMS = { termsSignedAt: "2026-10-20", termsVersion: "pa-pl-2026-10" };

describe("contractFlags (AC-39)", () => {
  const today = "2026-10-28";
  it("no documents: exactly no_agreement and no_dpa", () => {
    expect(
      contractFlags({
        current: [],
        termsSignedAt: null,
        termsVersion: null,
        today,
      }),
    ).toEqual(["no_agreement", "no_dpa"]);
  });
  it("an agreement without the clauses: exactly no_dpa", () => {
    expect(contractFlags({ current: [AGREEMENT], ...TERMS, today })).toEqual([
      "no_dpa",
    ]);
  });
  it("that agreement plus an addendum, or one with the clauses: nothing", () => {
    expect(
      contractFlags({ current: [AGREEMENT, ADDENDUM], ...TERMS, today }),
    ).toEqual([]);
    expect(
      contractFlags({
        current: [{ ...AGREEMENT, includesDpa: true }],
        ...TERMS,
        today,
      }),
    ).toEqual([]);
  });
  it("profile terms edited away from the agreement: terms_mismatch", () => {
    expect(
      contractFlags({
        current: [AGREEMENT, ADDENDUM],
        termsSignedAt: "2026-10-20",
        termsVersion: "pa-pl-2026-09",
        today,
      }),
    ).toEqual(["terms_mismatch"]);
  });
  it("review due inside the notice window and passed after the date", () => {
    const reviewing = { ...AGREEMENT, reviewOn: "2026-11-15" };
    expect(
      contractFlags({
        current: [reviewing, ADDENDUM],
        ...TERMS,
        today: "2026-10-16",
      }),
    ).toEqual(["review_due"]);
    expect(
      contractFlags({
        current: [reviewing, ADDENDUM],
        ...TERMS,
        today: "2026-10-15",
      }),
    ).toEqual([]);
    expect(
      contractFlags({
        current: [reviewing, ADDENDUM],
        ...TERMS,
        today: "2026-11-16",
      }),
    ).toEqual(["review_passed"]);
  });
});

describe("reviewState and contractReminderDue (AC-42)", () => {
  const row = { reviewOn: "2026-12-01", noticeDays: 30 };
  it("Warsaw: nothing at 2026-10-31T22:30Z, due at 23:30Z (00:30 on 1 November)", () => {
    expect(
      contractReminderDue(
        row,
        "Europe/Warsaw",
        new Date("2026-10-31T22:30:00Z"),
      ),
    ).toBeNull();
    expect(
      contractReminderDue(
        row,
        "Europe/Warsaw",
        new Date("2026-10-31T23:30:00Z"),
      ),
    ).toBe("due");
  });
  it("due on the review date, passed the day after, none without a date", () => {
    expect(reviewState(row, "2026-12-01")).toBe("due");
    expect(reviewState(row, "2026-12-02")).toBe("passed");
    expect(
      reviewState({ reviewOn: null, noticeDays: 30 }, "2026-12-02"),
    ).toBeNull();
  });
  it("a moved review date opens a new window (2027-01-15, 30 days: 2026-12-16)", () => {
    const moved = { reviewOn: "2027-01-15", noticeDays: 30 };
    expect(reviewState(moved, "2026-12-15")).toBeNull();
    expect(reviewState(moved, "2026-12-16")).toBe("due");
  });
});

const UPLOAD = {
  docKind: "agreement",
  templateVersion: "PA-PL-2026-10",
  languageCode: "pl",
  signedOn: "2026-10-20",
  effectiveOn: "2026-10-21",
  reviewOn: "2027-10-20",
  noticeDays: "30",
  note: "Replaces v1.",
  expectedCurrentId: "",
};

describe("contract parsers (AC-37, AC-41)", () => {
  it("accepts an upload and lower-cases the template version", () => {
    const parsed = parseContractUpload(UPLOAD, "2026-10-28");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.templateVersion).toBe("pa-pl-2026-10");
      expect(parsed.value.expectedCurrentId).toBeNull();
    }
  });

  it.each([
    [{ docKind: "contract" }, "docKind", "choice"],
    [{ templateVersion: "pa pl" }, "templateVersion", "template"],
    [{ templateVersion: "" }, "templateVersion", "required"],
    [{ signedOn: "2026-10-29" }, "signedOn", "dateFuture"],
    [{ reviewOn: "2026-10-21" }, "reviewOn", "reviewOrder"],
    [{ noticeDays: "366" }, "noticeDays", "notice"],
    [{ note: "Call anna@example.pl" }, "note", "contactDetails"],
    [{ expectedCurrentId: "nope" }, "expectedCurrentId", "target"],
  ])("refuses %j with %s:%s", (patch, field, code) => {
    const parsed = parseContractUpload({ ...UPLOAD, ...patch }, "2026-10-28");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors[field]).toBe(code);
  });

  it("refuses includes_dpa on an addendum edit", () => {
    const parsed = parseContractDetailsEdit(
      { ...UPLOAD, includesDpa: "on", contractId: ID, updatedAt: VERSION },
      "2026-10-28",
      "dpa_addendum",
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.includesDpa).toBe(false);
  });

  it("withdraw: 10 characters pass, 9 are refused", () => {
    expect(
      parseContractWithdraw({
        contractId: ID,
        updatedAt: VERSION,
        reason: "a".repeat(10),
      }).ok,
    ).toBe(true);
    const short = parseContractWithdraw({
      contractId: ID,
      updatedAt: VERSION,
      reason: "a".repeat(9),
    });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.errors["reason"]).toBe("reasonLength");
  });
});

describe("AC-58: modules/partners/contracts is imported only by admin and jobs", () => {
  const ROOT = join(__dirname, "../..");
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  }

  it("finds no other importer", () => {
    const importers = walk(join(ROOT, "src"))
      .filter((path) => /\.(ts|tsx)$/u.test(path))
      .filter((path) =>
        /modules\/partners\/contracts|from "\.\/contracts|from "\.\.\/contracts/u.test(
          readFileSync(path, "utf8"),
        ),
      )
      .map((path) => relative(ROOT, path))
      .filter(
        (path) =>
          !path.startsWith("src/app/admin/") &&
          !path.startsWith("src/jobs/") &&
          !path.startsWith("src/modules/partners/contracts/"),
      );
    expect(importers).toEqual([]);
  });

  it("no florist route reaches modules/admin or the contracts module", () => {
    const florist = walk(join(ROOT, "src/app"))
      .filter((path) => /\/(vendor|florist)\//u.test(path))
      .filter((path) =>
        /@\/modules\/(admin|partners\/contracts)\b/u.test(
          readFileSync(path, "utf8"),
        ),
      );
    expect(florist).toEqual([]);
  });
});
