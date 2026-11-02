/**
 * The founder's emails A1 (no florist took the order) and W (the WhatsApp copy), and the
 * layout's founder frame (spec 016 §5.2, §5.3; T-21 and T-22 for these templates; AC-21, AC-22;
 * artboard `email-founder-*.dc.html`; TASK-332).
 *
 *  - A1: the band and the "Cancels at" row come from `graceEnd` in the destination's zone (due
 *    today: two hours after the exhaustion, capped at the routing deadline; not due today: 10:00
 *    the next morning); every offer with its outcome, a decline by its reason's label only (a
 *    free-text reason never prints); the "no florist covers it" row when no offer was made; the
 *    admin order link; English, `lang="en"`; a pinned HTML snapshot.
 *  - W: the offer and the stop message, the shop's name and code, the paste block in the
 *    florist's language between the copy markers, the inbox address and never a sign-in token.
 */
import { describe, expect, it } from "vitest";

import { adminT } from "../../src/modules/admin/messages";
import { orderDetailHref } from "../../src/modules/admin/orders";
import {
  type FloristMessageFacts,
  type NoPartnerAlertFacts,
  type OpsCopy,
  renderNoPartnerAlert,
  renderWhatsappCopy,
} from "../../src/modules/notifications/emails";

/** What the worker hands in: the admin catalogue and the admin order path. */
const COPY: OpsCopy = {
  t: adminT as unknown as OpsCopy["t"],
  orderHref: orderDetailHref,
};

const ORDER_ID = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";
const ORIGIN = "https://flowersoverseas.com";

/** Due today: exhausted at 12:10 Warsaw time on the delivery date (CEST, UTC+2). */
const ALERT: NoPartnerAlertFacts = {
  orderId: ORDER_ID,
  deliveryDate: "2026-10-08",
  countryIso2: "PL",
  city: "Warszawa",
  timeZone: "Europe/Warsaw",
  sameDayCutoffLocal: "14:00",
  exhaustedAt: new Date("2026-10-08T10:10:00Z"),
  offers: [
    {
      attempt: 2,
      partnerCode: "pl-waw-02",
      response: "timeout",
      reason: null,
      slaExpiresAt: new Date("2026-10-08T09:10:00Z"),
      withdrawn: false,
    },
    {
      attempt: 1,
      partnerCode: "pl-waw-01",
      response: "decline",
      reason: "capacity",
      slaExpiresAt: new Date("2026-10-08T08:40:00Z"),
      withdrawn: false,
    },
    {
      attempt: 3,
      partnerCode: "pl-waw-03",
      response: "decline",
      reason: "Call Anna on +48 500 111 222",
      slaExpiresAt: new Date("2026-10-08T10:00:00Z"),
      withdrawn: false,
    },
  ],
};

function spaces(value: string): string {
  return value.replaceAll(/[  ]/gu, " ");
}

function visible(html: string): string {
  return spaces(
    html
      .replace(/<head>[\s\S]*?<\/head>/u, "")
      .replace(/<div style="display:none[^"]*">[\s\S]*?<\/div>/u, "")
      .replaceAll(/<\/(?:p|h1|td|th|tr|div|table)>/gu, " ")
      .replaceAll(/<[^>]+>/gu, "")
      .replaceAll("&amp;", "&")
      .replaceAll("&#39;", "'")
      .replaceAll(/\s+/gu, " ")
      .trim(),
  );
}

describe("A1: no florist took the order", () => {
  it("reads as drawn: band, heading, facts, every offer in order, the admin button and note", async () => {
    const { subject, html, text } = renderNoPartnerAlert(ALERT, COPY, ORIGIN);
    expect(spaces(subject)).toBe(
      "No florist: FO-1EEP-R7HF · Warszawa · Thu, 8 Oct",
    );
    expect(html).toContain(`<html lang="en" dir="ltr">`);
    expect(visible(html)).toBe(
      [
        "Flowers Overseas Internal",
        "Cancels automatically at 14:10 Warsaw time unless you act.",
        "No florist took order FO-1EEP-R7HF",
        "Destination Warszawa, Poland",
        "Delivery date Thu, 8 Oct (today)",
        "Cancels at 14:10 Europe/Warsaw",
        "# Florist Outcome",
        "1 pl-waw-01 Declined · We are full that day",
        "2 pl-waw-02 No answer by 11:10",
        "3 pl-waw-03 Declined · Another reason",
        "Open the order in admin",
        "Reroute to a florist you have phoned, or cancel, from the order page. The buyer has paid; a cancel refunds in full.",
        "Sent to OPS_ALERT_EMAIL. Internal: never forwarded to a buyer or a florist.",
      ].join(" "),
    );
    expect(html).toContain(`href="${ORIGIN}/admin/orders/${ORDER_ID}"`);
    expect(spaces(text)).toBe(
      [
        "No florist took order FO-1EEP-R7HF",
        "",
        "Cancels automatically at 14:10 Warsaw time unless you act.",
        "",
        "Destination: Warszawa, Poland",
        "Delivery date: Thu, 8 Oct (today)",
        "Cancels at: 14:10 Europe/Warsaw",
        "",
        "Offers made:",
        "1. pl-waw-01: Declined · We are full that day",
        "2. pl-waw-02: No answer by 11:10",
        "3. pl-waw-03: Declined · Another reason",
        "",
        "Open the order in admin:",
        `${ORIGIN}/admin/orders/${ORDER_ID}`,
        "",
        "Reroute to a florist you have phoned, or cancel, from the order page. The buyer has paid; a cancel refunds in full.",
        "",
        "--",
        "Sent to OPS_ALERT_EMAIL. Internal: never forwarded to a buyer or a florist.",
        "",
      ].join("\n"),
    );
    await expect(html).toMatchFileSnapshot(
      "__snapshots__/emails/ops-alert-no-partner.en.html",
    );
  });

  it("never prints a free-text decline reason", () => {
    const { html, text, subject } = renderNoPartnerAlert(ALERT, COPY, ORIGIN);
    for (const part of [html, text, subject]) {
      expect(part).not.toContain("Anna");
      expect(part).not.toContain("+48 500");
    }
  });

  it("caps a due-today cancel at the routing deadline (cutoff plus two hours)", () => {
    // Exhausted at 14:40 local: two hours later is 16:40, past the 16:00 deadline.
    const late = renderNoPartnerAlert(
      { ...ALERT, exhaustedAt: new Date("2026-10-08T12:40:00Z") },
      COPY,
      ORIGIN,
    );
    expect(visible(late.html)).toContain(
      "Cancels automatically at 16:00 Warsaw time unless you act.",
    );
  });

  it("says 'tomorrow' with the date when the cancel falls on the next local day", () => {
    // Exhausted at 21:00 Warsaw on 7 October, for delivery on the 9th: 10:00 on the 8th.
    const night = renderNoPartnerAlert(
      {
        ...ALERT,
        deliveryDate: "2026-10-09",
        exhaustedAt: new Date("2026-10-07T19:00:00Z"),
      },
      COPY,
      ORIGIN,
    );
    expect(visible(night.html)).toContain(
      "Cancels automatically at 10:00 tomorrow, Thu, 8 Oct, Warsaw time, unless you act.",
    );
    expect(visible(night.html)).toContain(
      "Delivery date Fri, 9 Oct Cancels at",
    );
    expect(visible(night.html)).not.toContain("(today)");
  });

  it("reads the cancel time across the October clock change in the destination's zone", () => {
    // Exhausted at 21:00 CEST on 24 October (19:00Z); the clocks go back at 03:00 on the 25th,
    // so 10:00 local on the 25th is 09:00Z, and it prints as 10:00.
    const dst = renderNoPartnerAlert(
      {
        ...ALERT,
        deliveryDate: "2026-10-26",
        exhaustedAt: new Date("2026-10-24T19:00:00Z"),
      },
      COPY,
      ORIGIN,
    );
    expect(visible(dst.html)).toContain(
      "Cancels automatically at 10:00 tomorrow, Sun, 25 Oct, Warsaw time, unless you act.",
    );
  });

  it("prints the one 'no florist covers it' row when no offer was made", () => {
    const none = renderNoPartnerAlert({ ...ALERT, offers: [] }, COPY, ORIGIN);
    expect(visible(none.html)).toContain(
      "# Florist Outcome None No florist covers this date and place",
    );
    expect(none.text).toContain(
      "Offers made:\nNone: No florist covers this date and place",
    );
  });

  it("has no band and no 'Cancels at' row for a country with no cutoff", () => {
    const manual = renderNoPartnerAlert(
      { ...ALERT, sameDayCutoffLocal: null },
      COPY,
      ORIGIN,
    );
    expect(visible(manual.html)).not.toContain("Cancels");
    expect(manual.text).not.toContain("Cancels");
  });
});

/** The florist facts of the W copy, as on the artboard. */
const FACTS: FloristMessageFacts = {
  assignmentId: "6f1c2e0a-0c1d-4a7e-9a55-1d2c3b4a5f60",
  productName: "Amber Hour",
  tierLabelKey: "catalog.tier.stems",
  tierStems: 18,
  addonKeys: ["catalog.addon.vase.name"],
  deliveryDate: "2026-10-08",
  timeZone: "Europe/Warsaw",
  town: "Warszawa",
  postcode: "00-001",
  payout: { amountMinor: 14900, currency: "PLN" },
  answerBy: new Date("2026-10-08T13:40:00Z"),
  partnerCode: "pl-waw-02",
  partnerName: "Kwiaciarnia Przykładowa",
};

const INBOX =
  "https://flowersoverseas.com/vendor/orders/6f1c2e0a-0c1d-4a7e-9a55-1d2c3b4a5f60";

describe("W: the WhatsApp copy", () => {
  it("the offer: subject, facts, the Polish paste block between the markers, the note", async () => {
    const { subject, html, text } = renderWhatsappCopy(
      FACTS,
      {
        kind: "offer",
        language: "pl",
        inboxUrl: INBOX,
        timedOut: false,
      },
      COPY,
    );
    expect(subject).toBe("WhatsApp: new order for pl-waw-02 · answer by 15:40");
    expect(visible(html)).toContain(
      "Paste this offer into WhatsApp Florist Kwiaciarnia Przykładowa · pl-waw-02 Language Polski Paste before 15:40 Europe/Warsaw Nowe zamówienie od Flowers Overseas",
    );
    expect(html).toContain("white-space:pre-wrap");
    expect(spaces(text)).toContain(
      [
        "----- copy from here -----",
        "Nowe zamówienie od Flowers Overseas",
        "",
        "Amber Hour · 18 łodyg",
      ].join("\n"),
    );
    expect(text).toContain(`Otwórz zamówienie: ${INBOX}`);
    expect(text).toContain("----- to here -----");
    expect(text).toContain(
      "The florist has the same offer by email already. Never accept or decline for them; ask them to open the order.",
    );
    await expect(html).toMatchFileSnapshot(
      "__snapshots__/emails/ops-whatsapp-copy-offer.en.html",
    );
  });

  it("the stop message: its own subject and heading, no link, no deadline row, no note", async () => {
    const { subject, html, text } = renderWhatsappCopy(
      FACTS,
      {
        kind: "offer-withdrawn",
        language: "en",
        inboxUrl: null,
        timedOut: false,
      },
      COPY,
    );
    expect(subject).toBe("WhatsApp: stop message for pl-waw-02");
    expect(visible(html)).toContain(
      "Paste this stop message into WhatsApp Florist Kwiaciarnia Przykładowa · pl-waw-02 Language English Flowers Overseas This order is no longer yours. Please do not make it.",
    );
    expect(visible(html)).not.toContain("Paste before");
    expect(html).not.toContain("<a ");
    expect(text).not.toMatch(/https?:/u);
    await expect(html).toMatchFileSnapshot(
      "__snapshots__/emails/ops-whatsapp-copy-stop.en.html",
    );
  });

  it("T-22: carries no sign-in token and no phone of the florist; its subject names only the code", () => {
    for (const kind of ["offer", "offer-withdrawn"] as const) {
      const rendered = renderWhatsappCopy(
        FACTS,
        {
          kind,
          language: "en",
          inboxUrl: kind === "offer" ? INBOX : null,
          timedOut: false,
        },
        COPY,
      );
      for (const part of [rendered.subject, rendered.html, rendered.text]) {
        expect(part).not.toMatch(/[?&]t=|sign-in|token/iu);
      }
      expect(rendered.subject).not.toContain("Warszawa");
      expect(rendered.subject).not.toContain("00-001");
      expect(rendered.subject).not.toContain(FACTS.partnerName);
    }
  });
});
