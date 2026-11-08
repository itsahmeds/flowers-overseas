/**
 * Spec 030b's founder emails C1 `contract-review-due` and C2 `contract-review-passed` (§14.5,
 * AC-42; artboard `email-founder-*.dc.html`, "Spec 030b amendment"; TASK-442): English, the
 * founder frame, the florist code, the document kind and version, the review date in the
 * florist's zone and the Contracts tab link. Nothing else about the florist.
 */
import { describe, expect, it } from "vitest";

import { adminT } from "../../src/modules/admin/messages";
import { orderDetailHref } from "../../src/modules/admin/orders";
import {
  type OpsCopy,
  parseContractReviewJobId,
  renderContractReview,
} from "../../src/modules/notifications/emails";

const COPY: OpsCopy = {
  t: adminT as unknown as OpsCopy["t"],
  orderHref: orderDetailHref,
  contractsHref: (code) =>
    `/admin/partners/${encodeURIComponent(code)}/contracts`,
};
const ORIGIN = "https://flowersoverseas.com";
const CONTRACT = "5f7e9d1c-3b5a-4c2e-9f8d-6a4b2c0e8d1f";

const facts = {
  partnerCode: "de-ber-01",
  docKind: "agreement" as const,
  versionNo: 1,
  reviewOn: "2026-11-15",
  timeZone: "Europe/Berlin",
  daysLeft: 30,
};

const footer = (text: string): string =>
  text.split("\n\n").at(-1)?.trimEnd() ?? "";

describe("C1: contract review due (as drawn)", () => {
  it("reads as the artboard: subject, preview, heading, band, facts, link, note", () => {
    const mail = renderContractReview("due", facts, COPY, ORIGIN);
    expect(mail.subject).toBe(
      "Contract review due: de-ber-01 · agreement v1 · 15 Nov 2026",
    );
    expect(mail.text).toBe(
      [
        "Contract review due for de-ber-01",
        "Review the florist agreement by 15 Nov 2026.",
        "Florist: de-ber-01\nDocument: Florist agreement v1\nReview date: 15 Nov 2026, Europe/Berlin",
        `Open the Contracts tab:\n${ORIGIN}/admin/partners/de-ber-01/contracts`,
        "Renew or replace it before the review date: upload the new version on the Contracts tab. Earlier versions are kept.",
        footer(mail.text),
      ].join("\n\n") + "\n",
    );
    expect(footer(mail.text)).toContain("OPS_ALERT_EMAIL");
    expect(mail.html).toContain("The review date is in 30 days.");
    expect(mail.html).toContain('lang="en"');
    expect(mail.html).toContain(
      `href="${ORIGIN}/admin/partners/de-ber-01/contracts"`,
    );
  });

  it("an addendum names itself; one day left is singular, the day itself says today", () => {
    const one = renderContractReview(
      "due",
      { ...facts, docKind: "dpa_addendum", versionNo: 2, daysLeft: 1 },
      COPY,
      ORIGIN,
    );
    expect(one.subject).toBe(
      "Contract review due: de-ber-01 · data-processing addendum v2 · 15 Nov 2026",
    );
    expect(one.text).toContain("Document: Data-processing addendum v2");
    expect(one.text).toContain(
      "Review the data-processing addendum by 15 Nov 2026.",
    );
    expect(one.html).toContain("The review date is in 1 day.");
    const today = renderContractReview(
      "due",
      { ...facts, daysLeft: 0 },
      COPY,
      ORIGIN,
    );
    expect(today.html).toContain("The review date is today.");
  });
});

describe("C2: contract review date passed (as drawn)", () => {
  it("reads as the artboard", () => {
    const mail = renderContractReview(
      "passed",
      { ...facts, daysLeft: -1 },
      COPY,
      ORIGIN,
    );
    expect(mail.subject).toBe(
      "Contract review date passed: de-ber-01 · agreement v1",
    );
    expect(mail.text).toBe(
      [
        "Contract review date passed for de-ber-01",
        "The review date of this florist agreement has passed.",
        "Florist: de-ber-01\nDocument: Florist agreement v1\nReview date: 15 Nov 2026, Europe/Berlin",
        `Open the Contracts tab:\n${ORIGIN}/admin/partners/de-ber-01/contracts`,
        "The agreement is still the current one on file. Upload the renewed version, or edit its review date if the agreement runs on.",
        footer(mail.text),
      ].join("\n\n") + "\n",
    );
    expect(mail.html).toContain("The review date was 15 Nov 2026.");
  });

  it("no em or en dash in either email", () => {
    for (const state of ["due", "passed"] as const) {
      const mail = renderContractReview(state, facts, COPY, ORIGIN);
      expect(`${mail.subject}${mail.text}${mail.html}`).not.toMatch(/[–—]/u);
    }
  });

  it("refuses to render without the Contracts link", () => {
    expect(() =>
      renderContractReview(
        "due",
        facts,
        { t: COPY.t, orderHref: orderDetailHref },
        ORIGIN,
      ),
    ).toThrow("EMAIL_FACTS_MISSING");
  });
});

describe("the job key", () => {
  it("reads `{contractId}:{reviewOn}:{state}` and refuses anything else", () => {
    expect(parseContractReviewJobId(`${CONTRACT}:2026-12-01:due`)).toEqual({
      contractId: CONTRACT,
      reviewOn: "2026-12-01",
      state: "due",
    });
    for (const bad of [
      `${CONTRACT}:2026-12-01`,
      `${CONTRACT}:2026-12-01:soon`,
      `${CONTRACT}:2026-12-01:due:x`,
      `not-a-uuid:2026-12-01:passed`,
    ]) {
      expect(() => parseContractReviewJobId(bad)).toThrow();
    }
  });
});
