/**
 * The buyer emails B1 to B6 and B8 (spec 016 §5.2, §7, §8, §14 A-founder-2026-10-14,
 * A-founder-2026-10-14b, A-founder-2026-10-22; T-21 for these templates, T-24, T-25, T-38, T-40,
 * T-41, T-42, and the template half of T-45 and T-48; artboard `email-buyer-*.dc.html`, B1 and B4
 * as redrawn 2026-11-04; TASK-333).
 *
 * The renderers are pure over their facts; the database half (the loaders on a fixture purchase,
 * rendered through the registered renderers) is `tests/integration/email-buyer.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { relayMatches } from "@/config/honesty";
import type { LocaleCode } from "@/config/locales";
import { formatDate, formatMoney } from "@/modules/i18n";
import { notificationsFor } from "@/modules/notifications/rules";
import {
  BUYER_TEMPLATES,
  type BuyerOrderFacts,
  type CancelledFacts,
  type DeliveredFacts,
  type DocumentFacts,
  type PurchaseFacts,
  type RefundFacts,
  buyerStatusLabelKey,
  firstNameOf,
  renderBeingMade,
  renderCancelled,
  renderCreditNote,
  renderDeliveredPhoto,
  renderOrderReceived,
  renderOutForDelivery,
  renderRefund,
} from "../../src/modules/notifications/emails";
import type { RenderedNotification } from "../../src/modules/notifications/templates";

const BUYER_LOCALES = [
  "en",
  "en-gb",
  "de",
  "pl",
] as const satisfies readonly LocaleCode[];

/** A 1×1 JPEG's bytes stand in for the photo: the renderer passes them through untouched. */
const PHOTO =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

/** AC-24's fixture: buyer "Sam Taylor", an order to Kraków on Saturday 17 October 2026, £45.90. */
const ORDER: BuyerOrderFacts = {
  orderId: "0b9d6c3e-1f2a-4b5c-8d7e-9f0a1b2c3d4e",
  reference: "FO-7K2M-9QXA",
  deliveryDate: "2026-10-17",
  timeZone: "Europe/Warsaw",
  city: "Kraków",
  recipientName: "Anna Kowalska",
  products: [
    { name: "Amber Hour", tierLabelKey: "catalog.tier.stems", tierStems: 18 },
  ],
  amount: { amountMinor: 4590, currency: "GBP" },
  trackingUrl:
    "https://flowersoverseas.com/en-gb/track/Tok3nOne_aaaaaaaaaaaaaa",
};

/** AC-45's second delivery: Warsaw, Sunday 18 October 2026, £70.90. */
const SECOND: BuyerOrderFacts = {
  ...ORDER,
  orderId: "1c0e7d4f-2a3b-4c5d-9e8f-0a1b2c3d4e5f",
  reference: "FO-3PRT-H8WD",
  deliveryDate: "2026-10-18",
  city: "Warsaw",
  recipientName: "Jan Przykładowy",
  products: [
    { name: "Vistula Red", tierLabelKey: "catalog.tier.stems", tierStems: 18 },
  ],
  amount: { amountMinor: 7090, currency: "GBP" },
  trackingUrl:
    "https://flowersoverseas.com/en-gb/track/Tok3nTwo_bbbbbbbbbbbbbb",
};

const TERMS = {
  filename: "flowers-overseas-terms-2026-10.pdf",
  path: "https://media.flowersoverseas.com/legal/terms-2026-10.pdf",
  contentType: "application/pdf",
};
const INVOICE = {
  filename: "FO-PL-2026-000001.pdf",
  content: "JVBERi0xLjcK",
  contentType: "application/pdf",
};

const PURCHASE: PurchaseFacts = {
  buyerName: "Sam Taylor",
  total: { amountMinor: 4590, currency: "GBP" },
  orders: [ORDER],
  accountUrl: "https://flowersoverseas.com/en-gb/account/orders/FO-7K2M-9QXA",
  terms: [TERMS],
  invoices: [INVOICE],
  complaintKey: null,
};

const TWO: PurchaseFacts = {
  ...PURCHASE,
  // Not the sum of the two orders: the email prints the purchase's own total (AC-45).
  total: { amountMinor: 11680, currency: "GBP" },
  orders: [ORDER, SECOND],
  accountUrl: "https://flowersoverseas.com/en-gb/account",
  invoices: [INVOICE, { ...INVOICE, filename: "FO-PL-2026-000002.pdf" }],
};

/** AC-41's fixture: delivered at 11:42 Warsaw time (CEST, UTC+2) on Saturday 17 October 2026. */
const DELIVERED: DeliveredFacts = {
  order: ORDER,
  deliveredAt: new Date("2026-10-17T09:42:00Z"),
  photo: { content: PHOTO, width: 1200, height: 1500 },
};

const CANCELLED_BY_US: CancelledFacts = {
  order: ORDER,
  cancelledBy: "us",
  homeUrl: "https://flowersoverseas.com/en-gb",
};

const REFUND_PARTIAL: RefundFacts = {
  order: ORDER,
  refunds: [
    {
      amountMinor: 1200,
      currencyCode: "GBP",
      succeededAt: new Date("2026-10-09T10:00:00Z"),
    },
  ],
  projection: "delivered",
};

const CREDIT_NOTE: DocumentFacts = {
  kind: "credit_note",
  number: "FOK-PL/2026/000001",
  reference: "FO-7K2M-9QXA",
  amount: { amountMinor: 1200, currency: "GBP" },
  pdf: { filename: "FOK-PL-2026-000001.pdf", content: "JVBERi0xLjcK" },
};

/** Every buyer template rendered from its fixture in `locale`. */
function renderAll(locale: LocaleCode): Record<string, RenderedNotification> {
  return {
    "order-received": renderOrderReceived(PURCHASE, locale),
    "order-received-two": renderOrderReceived(TWO, locale),
    "being-made": renderBeingMade(ORDER, locale),
    "out-for-delivery": renderOutForDelivery(ORDER, locale),
    "delivered-photo": renderDeliveredPhoto(DELIVERED, locale),
    cancelled: renderCancelled(CANCELLED_BY_US, locale),
    "cancelled-by-buyer": renderCancelled(
      { ...CANCELLED_BY_US, cancelledBy: "buyer" },
      locale,
    ),
    refund: renderRefund(REFUND_PARTIAL, locale),
    "refund-full": renderRefund(
      { ...REFUND_PARTIAL, projection: "closed" },
      locale,
    ),
    "credit-note": renderCreditNote(CREDIT_NOTE, locale),
    "credit-note-invoice": renderCreditNote(
      { ...CREDIT_NOTE, kind: "invoice", number: "FO-PL/2026/000001" },
      locale,
    ),
  };
}

/** `Intl`'s no-break and narrow no-break spaces read as plain spaces. */
function spaces(value: string): string {
  return value.replaceAll(/[  ]/gu, " ");
}

/** The hidden preheader of an HTML part. */
function preheaderOf(html: string): string {
  const found = /<div style="display:none[^"]*">([\s\S]*?)<\/div>/u.exec(html);
  return found?.[1] ?? "";
}

/** The visible text of an HTML part: no head, no preheader, blocks spaced, entities read back. */
function visible(html: string): string {
  return spaces(
    html
      .replace(/<head>[\s\S]*?<\/head>/u, "")
      .replace(/<div style="display:none[^"]*">[\s\S]*?<\/div>/u, "")
      .replaceAll(/<\/(?:p|h1|h2|td|th|tr|div|table)>|<br>/gu, " ")
      .replaceAll(/<[^>]+>/gu, "")
      .replaceAll("&amp;", "&")
      .replaceAll("&#39;", "'")
      .replaceAll("&quot;", '"')
      .replaceAll(/\s+/gu, " ")
      .trim(),
  );
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/gu)].map((found) =>
    (found[1] ?? "").replaceAll("&amp;", "&"),
  );
}

/** Every string a buyer reads in a message: subject, preheader, both parts, file names. */
function everything(rendered: RenderedNotification): string {
  return [
    rendered.subject,
    preheaderOf(rendered.html),
    visible(rendered.html),
    rendered.text,
    ...(rendered.attachments ?? []).map((file) => file.filename),
  ].join("\n");
}

/* -------------------------------------------------------------------------- */

describe("T-21: every buyer template in every buyer locale", () => {
  for (const locale of BUYER_LOCALES) {
    const rendered = renderAll(locale);
    for (const [name, message] of Object.entries(rendered)) {
      it(`${name} in ${locale}: HTML and text parts, lang and dir, no key path, a pinned snapshot`, async () => {
        expect(message.subject.length).toBeGreaterThan(0);
        expect(message.html.startsWith("<!doctype html><html")).toBe(true);
        expect(message.html).toMatch(
          new RegExp(
            `<html lang="${locale === "en-gb" ? "en-GB" : locale}" dir="ltr">`,
            "u",
          ),
        );
        // The plain text ends with the buyer footer after the `--` line.
        expect(message.text).toMatch(/\n--\n[\s\S]+\n$/u);
        for (const part of [message.subject, message.html, message.text]) {
          expect(part).not.toMatch(
            /emails\.|tracking\.|catalog\.|checkout\.|payments\.|company\./u,
          );
          // No em or en dash in any buyer copy (founder 2026-10-14).
          expect(part).not.toMatch(/[–—]/u);
        }
        await expect(message.html).toMatchFileSnapshot(
          `__snapshots__/emails/buyer-${name}.${locale}.html`,
        );
      });
    }
  }

  it("covers every registered buyer template", () => {
    expect([...BUYER_TEMPLATES].sort()).toStrictEqual([
      "being-made",
      "cancelled",
      "credit-note",
      "delivered-photo",
      "order-received",
      "out-for-delivery",
      "refund",
    ]);
  });

  it("formats money, dates and times through Intl in the buyer's locale and the destination's zone", () => {
    const pl = renderOrderReceived(
      {
        ...PURCHASE,
        total: { amountMinor: 14900, currency: "PLN" },
        orders: [{ ...ORDER, amount: { amountMinor: 14900, currency: "PLN" } }],
      },
      "pl",
    );
    expect(visible(pl.html)).toContain(
      spaces(formatMoney({ amountMinor: 14900, currency: "PLN" }, "pl")),
    );
    expect(visible(pl.html)).toContain("149,00 zł");
    expect(visible(pl.html)).toContain(
      formatDate(
        new Date("2026-10-17T12:00:00Z"),
        "pl",
        "weekdayDayMonth",
        "Europe/Warsaw",
      ),
    );
    const de = renderBeingMade(
      { ...ORDER, amount: { amountMinor: 4590, currency: "EUR" } },
      "de",
    );
    expect(visible(de.html)).toContain(
      formatDate(
        new Date("2026-10-17T12:00:00Z"),
        "de",
        "weekdayDayMonth",
        "Europe/Warsaw",
      ),
    );
    const eur = renderOrderReceived(
      {
        ...PURCHASE,
        total: { amountMinor: 4590, currency: "EUR" },
        orders: [{ ...ORDER, amount: { amountMinor: 4590, currency: "EUR" } }],
      },
      "de",
    );
    expect(visible(eur.html)).toContain("45,90 €");
  });
});

/* -------------------------------------------------------------------------- */

describe("T-24: B1 for Sam Taylor, Kraków, 17 October 2026, en-gb, and B2", () => {
  const b1 = renderOrderReceived(PURCHASE, "en-gb");
  const body = visible(b1.html);

  it("opens with the hero's two exact lines, right after the logo", () => {
    expect(
      body.startsWith(
        "Flowers Overseas Thank you, Sam. Your flowers arrive in Kraków on Saturday 17 October. ",
      ),
    ).toBe(true);
    expect(
      b1.text.startsWith(
        "Thank you, Sam.\nYour flowers arrive in Kraków on Saturday 17 October.\n",
      ),
    ).toBe(true);
  });

  it("puts the recap, the amount and the button before 'Your order terms', and every legal item after it only", () => {
    const terms = body.indexOf("Your order terms");
    expect(terms).toBeGreaterThan(0);
    for (const before of [
      "Order FO-7K2M-9QXA",
      "Your order Amber Hour · 18 stems",
      "Recipient Anna Kowalska, Kraków",
      "Date Saturday 17 October",
      "You paid £45.90 Includes VAT and delivery",
      "Track your order",
    ]) {
      const at = body.indexOf(before);
      expect(at, before).toBeGreaterThan(0);
      expect(at, before).toBeLessThan(terms);
    }
    expect(b1.html).toContain(`href="${ORDER.trackingUrl}"`);
    for (const after of [
      "You can cancel for free until we start preparing your order. Flowers are fresh, so the 14-day cancellation right does not apply after that.",
      "To cancel, message us on WhatsApp or call us with your order number.",
      "You can see and manage this order in your account.",
      "Our terms and your invoice are attached.",
    ]) {
      expect(body.indexOf(after), after).toBeGreaterThan(terms);
      // ... and nowhere before it.
      expect(body.lastIndexOf(after, terms), after).toBe(-1);
    }
    const textTerms = b1.text.indexOf("YOUR ORDER TERMS");
    expect(textTerms).toBeGreaterThan(b1.text.indexOf("Track your order:"));
    expect(b1.text.indexOf("You can cancel for free")).toBeGreaterThan(
      textTerms,
    );
    expect(b1.text.indexOf("To cancel, message us")).toBeGreaterThan(textTerms);
  });

  it("prints the trader identity in the footer only, after the heading", () => {
    // The footer's operated-by line is printed once the company is registered; either way it
    // follows "Your order terms" and is printed once.
    const operated = body.indexOf("Operated by");
    if (operated !== -1) {
      expect(operated).toBeGreaterThan(body.indexOf("Your order terms"));
      expect(body.indexOf("Operated by", operated + 1)).toBe(-1);
    }
  });

  it("links the account line to the order's detail, and lists the attached files", () => {
    expect(b1.html).toContain(`href="${PURCHASE.accountUrl}"`);
    expect(b1.text).toContain(
      `You can see and manage this order in your account.\n${PURCHASE.accountUrl}`,
    );
    expect(body).toContain(`${TERMS.filename} PDF`);
    expect(body).toContain(`${INVOICE.filename} PDF`);
  });

  it("keeps the subject and preheader free of cancel, refund, 14-day and terms", () => {
    expect(b1.subject).toBe("We have your order FO-7K2M-9QXA");
    expect(preheaderOf(b1.html)).toBe("Thank you. We have your order.");
    for (const part of [b1.subject, preheaderOf(b1.html)]) {
      expect(part).not.toMatch(/cancel|refund|14-day|terms/iu);
    }
  });

  it("says nothing about a refund or a failure anywhere", () => {
    for (const locale of BUYER_LOCALES) {
      for (const message of [
        renderOrderReceived(PURCHASE, locale),
        renderOrderReceived(TWO, locale),
      ]) {
        expect(everything(message)).not.toMatch(
          /refund|cannot deliver|could not deliver|if we/iu,
        );
      }
    }
  });

  it("attaches the terms PDF of the order's version and the invoice PDF; B2 attaches nothing and carries no contract text", () => {
    expect(b1.attachments).toStrictEqual([
      {
        filename: TERMS.filename,
        path: TERMS.path,
        contentType: "application/pdf",
      },
      {
        filename: INVOICE.filename,
        content: INVOICE.content,
        contentType: "application/pdf",
      },
    ]);
    const b2 = renderBeingMade(ORDER, "en-gb");
    expect(b2.attachments).toBeUndefined();
    expect(everything(b2)).not.toMatch(/cancel|terms|14-day|attached/iu);
  });

  it("without an invoice yet, attaches the terms only and reads 'Our terms are attached.'", () => {
    const none = renderOrderReceived({ ...PURCHASE, invoices: [] }, "en-gb");
    expect(visible(none.html)).toContain("Our terms are attached.");
    expect(none.text).toContain("Our terms are attached.");
    expect(visible(none.html)).not.toMatch(/invoice/iu);
    expect(none.attachments?.map((file) => file.filename)).toStrictEqual([
      TERMS.filename,
    ]);
  });

  it("prints the complaint path after the heading once the lawyer's key is set", () => {
    const withPath = renderOrderReceived(
      { ...PURCHASE, complaintKey: "emails.buyer.orderReceived.cancelHow" },
      "en-gb",
    );
    const text = visible(withPath.html);
    const terms = text.indexOf("Your order terms");
    const first = text.indexOf("To cancel, message us");
    expect(text.indexOf("To cancel, message us", first + 1)).toBeGreaterThan(
      terms,
    );
  });
});

/* -------------------------------------------------------------------------- */

describe("T-45 (template half): B1 for a two-order purchase, en-gb", () => {
  const b1 = renderOrderReceived(TWO, "en-gb");
  const body = visible(b1.html);

  it("reads the hero, one block per delivery in the given order, the purchase total, the terms once", () => {
    expect(
      body.startsWith(
        "Flowers Overseas Thank you, Sam. Your flowers arrive on the dates below. Your flowers arrive in Kraków on Saturday 17 October. Order FO-7K2M-9QXA",
      ),
    ).toBe(true);
    const krakow = body.indexOf(
      "Your flowers arrive in Kraków on Saturday 17 October.",
    );
    const warsaw = body.indexOf(
      "Your flowers arrive in Warsaw on Sunday 18 October.",
    );
    const total = body.indexOf("Total paid £116.80");
    const terms = body.indexOf("Your order terms");
    expect(krakow).toBeLessThan(warsaw);
    expect(body).toContain("£45.90 Includes VAT and delivery");
    expect(body).toContain("£70.90 Includes VAT and delivery");
    expect(warsaw).toBeLessThan(total);
    expect(total).toBeLessThan(terms);
    expect(body.split("Your order terms")).toHaveLength(2);
    expect(body).toContain("Our terms and your invoices are attached.");
  });

  it("links each delivery to its own tracking page, and the account line to the account", () => {
    const links = hrefs(b1.html);
    expect(links).toContain(ORDER.trackingUrl);
    expect(links).toContain(SECOND.trackingUrl);
    expect(links.filter((href) => href.includes("/track/"))).toHaveLength(2);
    expect(links).toContain("https://flowersoverseas.com/en-gb/account");
    expect(body.split("Track this delivery")).toHaveLength(3);
  });

  it("carries no street, phone or card message, and keeps the subject to the first reference", () => {
    expect(b1.subject).toBe("We have your order FO-7K2M-9QXA");
    expect(everything(b1)).not.toMatch(/\+48|ul\.|street|card message/iu);
  });
});

/* -------------------------------------------------------------------------- */

describe("T-25: the refund line, in PLN and GBP, in pl and en-gb", () => {
  const cases = [
    { locale: "en-gb", currency: "GBP", minor: 1, zone: "Europe/London" },
    { locale: "en-gb", currency: "GBP", minor: 4590, zone: "Europe/London" },
    { locale: "pl", currency: "PLN", minor: 1, zone: "Europe/Warsaw" },
    { locale: "pl", currency: "PLN", minor: 14900, zone: "Europe/Warsaw" },
    { locale: "en-gb", currency: "PLN", minor: 1234, zone: "Europe/Warsaw" },
  ] as const;
  for (const { locale, currency, minor, zone } of cases) {
    it(`${String(minor)} minor units of ${currency} in ${locale}: "Refunded {amount} on {date}" from Intl`, () => {
      const succeededAt = new Date("2026-10-09T22:30:00Z");
      const rendered = renderRefund(
        {
          order: { ...ORDER, timeZone: zone },
          refunds: [
            { amountMinor: minor, currencyCode: currency, succeededAt },
          ],
          projection:
            minor === 4590 || minor === 14900 ? "closed" : "delivered",
        },
        locale,
      );
      const amount = formatMoney({ amountMinor: minor, currency }, locale);
      const date = formatDate(succeededAt, locale, "dayMonth", zone);
      // en-gb reads the English line; pl's draft echoes it until spec 003's review.
      const line = `Refunded ${amount} on ${date}`;
      expect(spaces(rendered.text)).toContain(spaces(line));
      expect(visible(rendered.html)).toContain(spaces(line));
    });
  }

  it("pins the smallest amounts and the zone's date", () => {
    const at = new Date("2026-10-09T22:30:00Z");
    const gbp = renderRefund(
      {
        ...REFUND_PARTIAL,
        order: { ...ORDER, timeZone: "Europe/London" },
        refunds: [{ amountMinor: 1, currencyCode: "GBP", succeededAt: at }],
      },
      "en-gb",
    );
    expect(gbp.text).toContain("Refunded £0.01 on 9 October");
    const pln = renderRefund(
      {
        ...REFUND_PARTIAL,
        refunds: [{ amountMinor: 1, currencyCode: "PLN", succeededAt: at }],
      },
      "pl",
    );
    // 22:30 UTC is 00:30 on the 10th in Warsaw.
    expect(spaces(pln.text)).toContain("Refunded 0,01 zł on 10 października");
  });

  it("prints one line per succeeded refund, oldest first, and the status beside them", () => {
    const two = renderRefund(
      {
        ...REFUND_PARTIAL,
        refunds: [
          {
            amountMinor: 800,
            currencyCode: "GBP",
            succeededAt: new Date("2026-10-09T10:00:00Z"),
          },
          {
            amountMinor: 400,
            currencyCode: "GBP",
            succeededAt: new Date("2026-10-12T10:00:00Z"),
          },
        ],
      },
      "en-gb",
    );
    const body = visible(two.html);
    expect(body).toContain(
      "Refunded £8.00 on 9 October Refunded £4.00 on 12 October",
    );
    expect(body).toContain("Status Delivered");
    expect(preheaderOf(two.html)).toBe("Refunded £4.00 on 12 October");
  });

  it("never says 'cancelled' for a refunded_full order: its status reads Closed", () => {
    for (const locale of BUYER_LOCALES) {
      const full = renderRefund(
        { ...REFUND_PARTIAL, projection: "closed" },
        locale,
      );
      expect(everything(full)).not.toMatch(/cancel/iu);
    }
    expect(
      visible(
        renderRefund({ ...REFUND_PARTIAL, projection: "closed" }, "en-gb").html,
      ),
    ).toContain("Status Closed");
  });

  it("sends no B6 for row 32 on a cancelled order, and one on a cancelled_refunded order", () => {
    const codes = (from: string) =>
      notificationsFor("order.refunded_full", from, "live").map(
        (rule) => rule.code,
      );
    expect(codes("cancelled")).not.toContain("B6");
    expect(codes("cancelled_refunded")).toContain("B6");
    expect(codes("delivered")).toContain("B6");
  });
});

/* -------------------------------------------------------------------------- */

describe("T-40: B5's exact sentences, and no hold wording anywhere", () => {
  for (const locale of ["en", "de", "pl"] as const) {
    it(`B5 by us and by the buyer in ${locale}: the sentences with the charged total, and "Cancelled"`, () => {
      const amount = spaces(formatMoney(ORDER.amount, locale));
      const ours = visible(renderCancelled(CANCELLED_BY_US, locale).html);
      expect(ours).toContain(
        `We could not deliver this order. We have refunded ${amount}.`,
      );
      expect(ours).toContain("Status Cancelled");
      const theirs = visible(
        renderCancelled({ ...CANCELLED_BY_US, cancelledBy: "buyer" }, locale)
          .html,
      );
      expect(theirs).toContain(
        `You cancelled this order. We have refunded ${amount}.`,
      );
      expect(theirs).toContain("Status Cancelled");
      expect(theirs).not.toContain("We could not deliver");
      expect(theirs).not.toMatch(/Closed/u);
    });
  }

  it("names no reason and no florist in B5", () => {
    for (const cancelledBy of ["us", "buyer"] as const) {
      const b5 = renderCancelled({ ...CANCELLED_BY_US, cancelledBy }, "en-gb");
      // The message itself, before the layout's footer (which says what we do, "our florist").
      const own = [
        b5.subject,
        preheaderOf(b5.html),
        b5.text.split("\n--\n")[0] ?? "",
      ].join("\n");
      expect(own).not.toMatch(/florist|partner|no_partner|because|reason/iu);
    }
  });

  it("prints the order's own amount, never another one (AC-48's template half)", () => {
    const own = renderCancelled(
      {
        ...CANCELLED_BY_US,
        order: { ...SECOND, amount: { amountMinor: 7090, currency: "GBP" } },
      },
      "en-gb",
    );
    expect(visible(own.html)).toContain("We have refunded £70.90.");
    expect(visible(own.html)).toContain(
      "Order FO-3PRT-H8WD to Warsaw, Sunday 18 October",
    );
  });

  it("has no held, authorised or not-charged sentence in B1 to B6 or B8, and no buyer row for order.authorised", () => {
    for (const locale of BUYER_LOCALES) {
      for (const message of Object.values(renderAll(locale))) {
        expect(everything(message)).not.toMatch(
          /\bheld\b|authori[sz]ed|not charged|will be charged|on hold/iu,
        );
      }
    }
    for (const mode of ["test", "live"] as const) {
      for (const from of [null, "placed"]) {
        expect(
          notificationsFor("order.authorised", from, mode).filter(
            (rule) => rule.audience === "buyer",
          ),
        ).toStrictEqual([]);
      }
    }
  });

  it("maps every buyer projection to the label map's words", () => {
    expect(buyerStatusLabelKey("with_florist")).toBe(
      "tracking.headline.confirmed",
    );
    expect(buyerStatusLabelKey("confirmed")).toBe(
      "tracking.headline.confirmed",
    );
    expect(buyerStatusLabelKey("placed")).toBe("tracking.headline.confirmed");
    expect(buyerStatusLabelKey("being_made")).toBe(
      "tracking.headline.beingMade",
    );
    expect(buyerStatusLabelKey("on_its_way")).toBe(
      "tracking.headline.onItsWay",
    );
    expect(buyerStatusLabelKey("delivered")).toBe(
      "tracking.headline.delivered",
    );
    expect(buyerStatusLabelKey("closed")).toBe("tracking.headline.closed");
    expect(buyerStatusLabelKey("cancelled")).toBe(
      "tracking.headline.cancelled",
    );
    expect(() => buyerStatusLabelKey("offered")).toThrow();
  });
});

/* -------------------------------------------------------------------------- */

describe("T-41: B4 for Anna Kowalska in Kraków, delivered 11:42 on 17 October 2026, en-gb", () => {
  const b4 = renderDeliveredPhoto(DELIVERED, "en-gb");
  const bodyHtml = b4.html.slice(b4.html.indexOf("</h1>"));

  it("puts the photo first: the first image, before any paragraph but the headline", () => {
    const firstImage = b4.html.indexOf("<img");
    expect(firstImage).toBeGreaterThan(0);
    expect(b4.html.slice(firstImage)).toMatch(
      /^<img src="cid:delivery-photo" alt="Photo of your delivered flowers, taken on Saturday 17 October"/u,
    );
    // Only the headline precedes it in the body.
    const beforePhoto = visible(b4.html.slice(0, firstImage));
    expect(beforePhoto).toBe("Flowers Overseas Delivered.");
    expect(bodyHtml.indexOf("<img")).toBeLessThan(bodyHtml.indexOf("<p"));
  });

  it("reads the two exact lines, then the tracking link, and nothing else", () => {
    const body = visible(b4.html);
    expect(body).toContain(
      "Delivered. Your flowers reached Kraków at 11:42 on Saturday 17 October. Delivered to Anna Track your order",
    );
    expect(hrefs(b4.html)).toStrictEqual([ORDER.trackingUrl]);
    expect(everything(b4)).not.toMatch(
      /rate|review|star|discount|send again|again|product|Amber/iu,
    );
  });

  it("has the exact subject, with no name, and no refund or failure word", () => {
    expect(b4.subject).toBe("Delivered in Kraków. Here is your photo.");
    expect(preheaderOf(b4.html)).toBe(
      "Your flowers reached Kraków at 11:42 on Saturday 17 October.",
    );
    expect(everything(b4)).not.toMatch(/refund|cannot deliver|if we/iu);
  });

  it("attaches the photo, inline and as a file", () => {
    expect(b4.attachments).toStrictEqual([
      {
        filename: "delivery-FO-7K2M-9QXA.jpg",
        content: PHOTO,
        contentType: "image/jpeg",
        contentId: "delivery-photo",
      },
      {
        filename: "delivery-FO-7K2M-9QXA.jpg",
        content: PHOTO,
        contentType: "image/jpeg",
      },
    ]);
    expect(b4.text).toContain(
      "Your photo is attached: delivery-FO-7K2M-9QXA.jpg",
    );
  });

  it("reads the time in the destination's zone across the clock change", () => {
    // 25 October 2026, 01:30 UTC is 02:30 in Warsaw (CET after 03:00 CEST).
    const after = renderDeliveredPhoto(
      {
        ...DELIVERED,
        deliveredAt: new Date("2026-10-25T01:30:00Z"),
        order: { ...ORDER, deliveryDate: "2026-10-25" },
      },
      "en-gb",
    );
    expect(after.subject).toBe("Delivered in Kraków. Here is your photo.");
    expect(visible(after.html)).toContain("at 02:30 on Sunday 25 October.");
  });
});

/* -------------------------------------------------------------------------- */

describe("T-42: firstNameOf and names kept out of subjects and preheaders", () => {
  it.each([
    ["Sam Taylor", "Sam"],
    ["  Anna  Kowalska ", "Anna"],
    ["Dr. Anna Nowak", "Dr. Anna Nowak"],
    ["J Smith", "J Smith"],
    ["Zoë", "Zoë"],
    ["Zażółć Gęślą-Jaźń", "Zażółć"],
    ["محمد علي", "محمد"],
    ["Łucja", "Łucja"],
  ])("%j reads %j", (name, expected) => {
    expect(firstNameOf(name)).toBe(expected);
  });

  it("puts the buyer's and the recipient's first names in no subject or preheader", () => {
    const marker = "Qxbuyermarker Taylor";
    const recipient = "Qxrecipientmarker Kowalska";
    const order = { ...ORDER, recipientName: recipient };
    for (const locale of BUYER_LOCALES) {
      const messages = [
        renderOrderReceived(
          { ...PURCHASE, buyerName: marker, orders: [order] },
          locale,
        ),
        renderBeingMade(order, locale),
        renderOutForDelivery(order, locale),
        renderDeliveredPhoto({ ...DELIVERED, order }, locale),
        renderCancelled({ ...CANCELLED_BY_US, order }, locale),
        renderRefund({ ...REFUND_PARTIAL, order }, locale),
        renderCreditNote(CREDIT_NOTE, locale),
      ];
      for (const message of messages) {
        for (const part of [message.subject, preheaderOf(message.html)]) {
          expect(part).not.toMatch(/Qx|Taylor|Kowalska/u);
        }
      }
      // The names are in the body, inside <bdi>.
      expect(messages[0]?.html).toContain("<bdi>Qxbuyermarker</bdi>");
      expect(messages[3]?.html).toContain("<bdi>Qxrecipientmarker</bdi>");
    }
  });

  it("isolates right-to-left names and Polish diacritics in <bdi> and escapes markup", () => {
    const b1 = renderOrderReceived(
      {
        ...PURCHASE,
        buyerName: "محمد علي",
        orders: [
          {
            ...ORDER,
            city: "Zażółć <b>gęślą</b> jaźń",
            recipientName: "Dr. Anna Nowak",
          },
        ],
      },
      "en-gb",
    );
    expect(b1.html).toContain("Thank you, <bdi>محمد</bdi>.");
    expect(b1.html).toContain(
      "<bdi>Zażółć &lt;b&gt;gęślą&lt;/b&gt; jaźń</bdi>",
    );
    expect(b1.html).not.toContain("<b>gęślą</b>");
    expect(b1.text).toContain(
      "Recipient: Dr. Anna Nowak, Zażółć <b>gęślą</b> jaźń",
    );
  });
});

/* -------------------------------------------------------------------------- */

const ROOT = join(import.meta.dirname, "../..");

type Tree = { readonly [key: string]: Tree | string };

function catalogue(locale: "en" | "de" | "pl"): Tree {
  return JSON.parse(
    readFileSync(join(ROOT, `messages/${locale}.json`), "utf8"),
  ) as Tree;
}

function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return typeof value === "string"
      ? [[path, value] as [string, string]]
      : leaves(value, path);
  });
}

/** The scan of AC-38: every value under `emails.buyer.*` and `emails.layout.*`, and the keys the buyer emails reuse. */
function buyerKeyFindings(locale: string, tree: Tree): string[] {
  return leaves(tree)
    .filter(
      ([key]) =>
        /^(?:emails\.buyer|emails\.layout|tracking\.headline|tracking\.refundLine|tracking\.photoAlt|tracking\.eyebrow)\.?/u.test(
          key,
        ) ||
        key === "checkout.legal.cancellation" ||
        key === "payments.confirmation.paid" ||
        key === "emails.account.trackingLink.button",
    )
    .flatMap(([key, value]) =>
      relayMatches(value, locale).map(
        (match) => `${locale} › ${key} › ${match.id}`,
      ),
    );
}

function plant(tree: Tree, key: string, value: string): Tree {
  const [head, ...rest] = key.split(".");
  const name = head ?? "";
  const child = tree[name];
  return {
    ...tree,
    [name]:
      rest.length === 0
        ? value
        : plant(typeof child === "object" ? child : {}, rest.join("."), value),
  };
}

describe("T-38: the relay check over the buyer keys, the template files and every render", () => {
  const trees = {
    en: catalogue("en"),
    "en-gb": catalogue("en"),
    de: catalogue("de"),
    pl: catalogue("pl"),
  };

  for (const [locale, tree] of Object.entries(trees)) {
    it(`finds nothing in the ${locale} buyer email keys`, () => {
      expect(buyerKeyFindings(locale, tree)).toStrictEqual([]);
    });
  }

  for (const [locale, planted] of [
    ["en", "Free to cancel until a florist accepts."],
    [
      "de",
      "Kostenlos stornieren, bis unser Florist Ihre Bestellung akzeptiert.",
    ],
    ["pl", "Bezpłatne anulowanie, dopóki florysta nie zaakceptuje zamówienia."],
  ] as const) {
    it(`turns red on a phrase planted into a temporary ${locale} key`, () => {
      const key = "emails.buyer.planted.body";
      expect(
        buyerKeyFindings(locale, plant(trees[locale], key, planted)).length,
      ).toBeGreaterThan(0);
    });
  }

  it("passes 'our florist': the voice we use", () => {
    expect(
      relayMatches(
        "Our florist is making your order. It arrives on Saturday 17 October.",
        "en",
      ),
    ).toStrictEqual([]);
  });

  it("finds nothing in the buyer template files", () => {
    for (const file of [
      "buyer.ts",
      "buyer-facts.ts",
      "buyer-register.ts",
      "first-name.ts",
    ]) {
      const source = readFileSync(
        join(ROOT, "src/modules/notifications/emails", file),
        "utf8",
      );
      expect(relayMatches(source, "en"), file).toStrictEqual([]);
    }
  });

  for (const locale of BUYER_LOCALES) {
    it(`finds nothing in any ${locale} render: subject, preheader, HTML, text and file names`, () => {
      for (const [name, message] of Object.entries(renderAll(locale))) {
        expect(relayMatches(everything(message), locale), name).toStrictEqual(
          [],
        );
      }
    });
  }
});
