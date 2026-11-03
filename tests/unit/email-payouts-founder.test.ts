/**
 * Spec 030a's founder emails F2 `payouts-ready` and F3 `payout-line-missing` (§5.2 "Founder
 * emails"; AC-11, AC-14; TASK-364): English, the founder frame, shop codes and order references
 * only, the admin links. F1 is TASK-363's (`tests/integration/payouts-030a.test.ts`).
 */
import { describe, expect, it } from "vitest";

import { adminT } from "../../src/modules/admin/messages";
import { orderDetailHref } from "../../src/modules/admin/orders";
import {
  payoutDetailHref,
  payoutsListHref,
} from "../../src/modules/admin/payouts";
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

describe("F2: weekly payouts ready", () => {
  it("names the count and links the payouts list, in English, in the founder frame", () => {
    const mail = renderPayoutsReady({ count: 3 }, COPY, ORIGIN);
    expect(mail.subject).toBe("Weekly payouts ready for review: 3");
    expect(mail.text).toContain("Weekly payouts ready to review: 3");
    expect(mail.text).toContain(`${ORIGIN}/admin/payouts\n`);
    expect(mail.text).toContain("OPS_ALERT_EMAIL");
    expect(mail.html).toContain('lang="en"');
    expect(mail.html).toContain(`href="${ORIGIN}/admin/payouts"`);
  });

  it("refuses a count of zero and a worker without the list link", () => {
    expect(() => renderPayoutsReady({ count: 0 }, COPY, ORIGIN)).toThrow();
    expect(() =>
      renderPayoutsReady(
        { count: 1 },
        { t: COPY.t, orderHref: COPY.orderHref },
        ORIGIN,
      ),
    ).toThrow(/EMAIL_FACTS_MISSING/u);
  });
});

describe("F3: a payout line missing", () => {
  it("names the order by its reference only and links the admin order page", () => {
    const mail = renderLineMissing(
      { orderId: ORDER_ID, minutes: 60 },
      COPY,
      ORIGIN,
    );
    const reference = orderReference(ORDER_ID);
    expect(mail.subject).toBe(`No payout line for ${reference}`);
    expect(mail.text).toContain(
      `Order ${reference} has a photo and no payout line`,
    );
    expect(mail.text).toContain(`${ORIGIN}/admin/orders/${ORDER_ID}`);
    expect(mail.html).toContain("within 60 minutes");
    // No buyer or recipient field exists in its facts; the order id appears only in the link.
    expect(mail.subject).not.toContain(ORDER_ID);
  });
});
