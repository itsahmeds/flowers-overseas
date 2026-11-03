/**
 * Spec 030a's founder emails F2 `payouts-ready` and F3 `payout-line-missing` (§5.2 "Founder
 * emails"; AC-11, AC-14; artboard `email-founder-*.dc.html`, "F2" and "F3"; TASK-364): English,
 * the founder frame, counts, shop codes and order references only, the admin links. F1 is
 * TASK-363's (`tests/integration/payouts-030a.test.ts`).
 */
import { describe, expect, it } from "vitest";

import { adminT } from "../../src/modules/admin/messages";
import { orderDetailHref } from "../../src/modules/admin/orders";
import {
  payoutDetailHref,
  payoutsListHref,
} from "../../src/modules/admin/payouts";
import { formatDate } from "../../src/modules/i18n";
import {
  type OpsCopy,
  renderLineMissing,
  renderPayoutsReady,
} from "../../src/modules/notifications/emails";
import { orderReference } from "../../src/modules/orders";

const COPY: OpsCopy = {
  t: adminT as unknown as OpsCopy["t"],
  orderHref: orderDetailHref,
  payoutHref: payoutDetailHref,
  payoutsHref: payoutsListHref,
};
const ORIGIN = "https://flowersoverseas.com";
const ORDER_ID = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";

describe("F2: weekly payouts ready (as drawn)", () => {
  it("reads as the artboard: subject, heading, lead, the two counts with their reasons, the list link", () => {
    const mail = renderPayoutsReady(
      {
        closed: 4,
        readyToSend: 4,
        needLook: 2,
        review: true,
        adjustment: true,
      },
      COPY,
      ORIGIN,
    );
    expect(mail.subject).toBe("4 payouts ready for review");
    expect(mail.text).toBe(
      [
        "Weekly payouts are ready",
        "4 weekly payouts closed after Sunday. Review any flagged line, then send the statements.",
        "Ready to send: 4\nNeed a look first: 2 (a line to review, an open adjustment)",
        `Open payouts:\n${ORIGIN}/admin/payouts`,
        mail.text.split("\n\n").at(-1)?.trimEnd() ?? "",
      ].join("\n\n") + "\n",
    );
    expect(mail.text).toContain("OPS_ALERT_EMAIL");
    expect(mail.html).toContain('lang="en"');
    expect(mail.html).toContain(`href="${ORIGIN}/admin/payouts"`);
  });

  it("one payout, nothing to look at: the singular, and no 'Need a look first' row", () => {
    const mail = renderPayoutsReady(
      {
        closed: 1,
        readyToSend: 3,
        needLook: 0,
        review: false,
        adjustment: false,
      },
      COPY,
      ORIGIN,
    );
    expect(mail.subject).toBe("1 payout ready for review");
    expect(mail.text).toContain("1 weekly payout closed after Sunday.");
    expect(mail.text).toContain("Ready to send: 3\n");
    expect(mail.text).not.toContain("Need a look first");
  });

  it("names only the reason that applies", () => {
    const review = renderPayoutsReady(
      {
        closed: 2,
        readyToSend: 2,
        needLook: 1,
        review: true,
        adjustment: false,
      },
      COPY,
      ORIGIN,
    );
    expect(review.text).toContain("Need a look first: 1 (a line to review)\n");
    const adjustment = renderPayoutsReady(
      {
        closed: 2,
        readyToSend: 2,
        needLook: 1,
        review: false,
        adjustment: true,
      },
      COPY,
      ORIGIN,
    );
    expect(adjustment.text).toContain(
      "Need a look first: 1 (an open adjustment)\n",
    );
  });

  it("refuses a run that closed nothing, and a worker without the list link", () => {
    const facts = {
      closed: 0,
      readyToSend: 0,
      needLook: 0,
      review: false,
      adjustment: false,
    };
    expect(() => renderPayoutsReady(facts, COPY, ORIGIN)).toThrow();
    expect(() =>
      renderPayoutsReady(
        { ...facts, closed: 1 },
        { t: COPY.t, orderHref: COPY.orderHref },
        ORIGIN,
      ),
    ).toThrow(/EMAIL_FACTS_MISSING/u);
  });
});

describe("F3: a delivered order with no payout line (as drawn)", () => {
  it("band, heading, the order, the photo time in the florist's zone, the florist code, the admin link, the cause", () => {
    const photoAt = new Date("2026-10-21T08:00:00Z");
    const mail = renderLineMissing(
      {
        orderId: ORDER_ID,
        minutes: 60,
        photoAt,
        timeZone: "Europe/Warsaw",
        partnerCode: "pl-krk-pod-lipa",
      },
      COPY,
      ORIGIN,
    );
    const reference = orderReference(ORDER_ID);
    const time = formatDate(photoAt, "en", "dayMonthTime", "Europe/Warsaw");
    expect(mail.subject).toBe(`No payout line: ${reference}`);
    expect(
      mail.text.startsWith(
        [
          "A delivered order has no payout line",
          "The delivery photo arrived 60 minutes ago and no payout line exists.",
          `Order: ${reference}\nPhoto received: ${time} Europe/Warsaw\nFlorist: pl-krk-pod-lipa`,
          `Open the order in admin:\n${ORIGIN}/admin/orders/${ORDER_ID}`,
          "The usual cause: the florist has no price for this bouquet and size. Add it on the florist page; the line is written on the next retry.",
        ].join("\n\n"),
      ),
    ).toBe(true);
    // 10:00 in Warsaw (CEST), not the UTC 08:00.
    expect(time).toContain("10:00");
    expect(mail.html).toContain(
      "The delivery photo arrived 60 minutes ago and no payout line exists.",
    );
    expect(mail.subject).not.toContain(ORDER_ID);
  });
});
