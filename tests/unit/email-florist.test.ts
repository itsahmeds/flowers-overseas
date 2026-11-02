/**
 * The florist emails V1 to V5, the layout's florist frame and the W paste text (spec 016 §5.2,
 * §5.3, §7; T-21 and T-22 for these templates; AC-21, AC-22; artboard `email-florist-*.dc.html`;
 * TASK-332).
 *
 *  - T-21: every template in each florist language (en, pl, de) renders an HTML part and a
 *    plain-text part with no missing message key (the translator throws on one), `lang` and `dir`
 *    from the locale config, the payout through `formatMoney` in the florist's locale, the delivery
 *    date and the answer-by time through `formatDate` in the destination's zone. The rendered
 *    HTML of each (template, language) is pinned as a file snapshot under
 *    `tests/unit/__snapshots__/emails/`, the markup the visual baselines are taken from.
 *  - T-22: the facts a template is given cannot carry a person (the schema is strict); no
 *    subject carries the town, the postcode, a name or a phone; the stop message has no link.
 *    The database half (a fixture order with recipient and buyer marker values, rendered through
 *    the registered renderers) is `tests/integration/email-templates.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { FLORIST_LANGUAGES } from "@/config/florists";
import {
  FLORIST_TEMPLATES,
  type FloristMessageFacts,
  FloristMessageFactsSchema,
  renderFloristEmail,
  whatsappFloristText,
} from "../../src/modules/notifications/emails";

/**
 * The artboard's data: Amber Hour, 18 stems and a vase, Thursday 8 October 2026, 00-001 Warszawa,
 * a 149 zł payout, answer by 15:40 Warsaw time. The artboard prints "Thu 8 Oct" and "149 zł"; the
 * built strings are `Intl`'s for each locale ("Thu, 8 Oct" and "149.00 PLN" in `en`, "149,00 zł"
 * in `pl`), the same formatter the florist inbox uses, so the email and the inbox agree.
 */
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
  // 15:40 in Warsaw (CEST, UTC+2) on 8 October 2026.
  answerBy: new Date("2026-10-08T13:40:00Z"),
  partnerCode: "pl-waw-02",
  partnerName: "Kwiaciarnia Przykładowa",
};

const LINK =
  "https://flowersoverseas.com/vendor/sign-in/confirm?t=Xq3TokenValue";

function render(
  template: (typeof FLORIST_TEMPLATES)[number],
  language: (typeof FLORIST_LANGUAGES)[number],
  overrides: Partial<{ timedOut: boolean; facts: FloristMessageFacts }> = {},
) {
  return renderFloristEmail(template, overrides.facts ?? FACTS, {
    language,
    link: template === "offer-withdrawn" ? null : LINK,
    timedOut: overrides.timedOut ?? false,
  });
}

/** `Intl`'s no-break and narrow no-break spaces read as plain spaces. */
function spaces(value: string): string {
  return value.replaceAll(/[\u00a0\u202f]/gu, " ");
}

/**
 * The visible text of an HTML part: no head, no hidden preheader, a space at the end of each
 * block, inline tags dropped, entities read back.
 */
function visible(html: string): string {
  return spaces(
    html
      .replace(/<head>[\s\S]*?<\/head>/u, "")
      .replace(/<div style="display:none[^"]*">[\s\S]*?<\/div>/u, "")
      .replaceAll(/<\/(?:p|h1|td|th|tr|div|table)>/gu, " ")
      .replaceAll(/<[^>]+>/gu, "")
      .replaceAll("&amp;", "&")
      .replaceAll("&#39;", "'")
      .replaceAll("&quot;", '"')
      .replaceAll(/\s+/gu, " ")
      .trim(),
  );
}

describe("T-21: every florist template in every florist language", () => {
  for (const template of FLORIST_TEMPLATES) {
    for (const language of FLORIST_LANGUAGES) {
      it(`${template} in ${language}: HTML and text parts, lang and dir, a pinned snapshot`, async () => {
        const rendered = render(template, language);
        expect(rendered.subject.length).toBeGreaterThan(0);
        expect(rendered.html.startsWith("<!doctype html><html")).toBe(true);
        expect(rendered.html).toContain(`<html lang="${language}" dir="ltr">`);
        expect(rendered.text.length).toBeGreaterThan(0);
        // The plain text ends with the florist footer after the `--` line.
        expect(rendered.text).toMatch(/\n--\n.+\n.+\n$/u);
        // No key path leaked into either part (the translator throws on a missing key; this
        // catches a key passed through as text).
        expect(rendered.html).not.toMatch(/emails\.|floristInbox\.|catalog\./u);
        expect(rendered.text).not.toMatch(/emails\.|floristInbox\.|catalog\./u);
        await expect(rendered.html).toMatchFileSnapshot(
          `__snapshots__/emails/florist-${template}.${language}.html`,
        );
      });
    }
  }

  it("V1 in en reads exactly as the artboard: heading, answer by, facts, payout, button, note", () => {
    const { subject, html, text } = render("offer", "en");
    expect(subject).toBe("New order for Thu, 8 Oct · answer by 15:40");
    expect(visible(html)).toContain(
      "A new order for you Answer by 15:40 Bouquet Amber Hour · 18 stems Add-ons Glass vase Delivery date Thu, 8 Oct Town 00-001 Warszawa You receive 149.00 PLN Open the order The button signs you in and opens this order. It works once, for one hour. The recipient's name, address and phone appear in the order once you accept it.",
    );
    expect(html).toContain(`href="${LINK}"`);
    expect(spaces(text)).toBe(
      [
        "A new order for you",
        "",
        "Answer by 15:40",
        "",
        "Bouquet: Amber Hour · 18 stems",
        "Add-ons: Glass vase",
        "Delivery date: Thu, 8 Oct",
        "Town: 00-001 Warszawa",
        "You receive: 149.00 PLN",
        "",
        "Open the order:",
        LINK,
        "The link signs you in and opens this order. It works once, for one hour.",
        "",
        "The recipient's name, address and phone appear in the order once you accept it.",
        "",
        "--",
        "Help & WhatsApp: +1 (213) 592-5150. Call us if anything about an order is unclear.",
        "You receive this email because your shop takes orders from Flowers Overseas.",
        "",
      ].join("\n"),
    );
  });

  it("formats the payout, the date and the time in the florist's own locale and the destination's zone", () => {
    // pl: "149,00 zł", "czw., 8 paź", 15:40; de: "149,00 PLN", "Do., 8. Okt.", 15:40.
    const pl = render("offer", "pl");
    expect(spaces(pl.subject)).toBe(
      "Nowe zamówienie na czw., 8 paź · odpowiedz do 15:40",
    );
    expect(visible(pl.html)).toContain("Otrzymujesz 149,00 zł");
    expect(visible(pl.html)).toContain("Amber Hour · 18 łodyg");
    const de = render("offer", "de");
    expect(spaces(de.subject)).toBe(
      "Neuer Auftrag für Do., 8. Okt. · antworten bis 15:40",
    );
    expect(visible(de.html)).toContain("Sie erhalten 149,00 PLN");
    expect(visible(de.html)).toContain("Strauß Amber Hour · 18 Stiele");
  });

  it("puts the answer-by time in the destination's zone, across the October clock change", () => {
    // 25 October 2026, 01:30 UTC is 02:30 in Warsaw (CET, after the change at 03:00 CEST).
    const after = render("offer-reminder", "en", {
      facts: { ...FACTS, answerBy: new Date("2026-10-25T01:30:00Z") },
    });
    expect(after.subject).toBe("Reminder: answer by 02:30");
    // The same instant read in Lisbon's zone is an hour behind Warsaw, so the zone is not ignored.
    const lisbon = render("offer-reminder", "en", {
      facts: {
        ...FACTS,
        timeZone: "Europe/Lisbon",
        answerBy: new Date("2026-10-25T01:30:00Z"),
      },
    });
    expect(lisbon.subject).toBe("Reminder: answer by 01:30");
  });

  it("prints a payout of zero minor units as an amount, and leaves the row out when no payout is known", () => {
    const zero = render("offer", "en", {
      facts: { ...FACTS, payout: { amountMinor: 0, currency: "PLN" } },
    });
    expect(visible(zero.html)).toContain("You receive 0.00 PLN");
    const none = render("offer", "en", { facts: { ...FACTS, payout: null } });
    // "You receive this email because ..." stays: the footer is not the payout row.
    expect(visible(none.html)).not.toMatch(/You receive (?!this email)/u);
    expect(none.text).not.toMatch(
      /You receive(?!: | this email)|You receive: /u,
    );
  });

  it("V2 to V5 in en read as drawn", () => {
    const reminder = render("offer-reminder", "en");
    expect(reminder.subject).toBe("Reminder: answer by 15:40");
    expect(visible(reminder.html)).toContain(
      "This order is still waiting for your answer. Answer by 15:40 Amber Hour · 18 stems · For Thu, 8 Oct Open the order The button signs you in and opens this order. It works once, for one hour.",
    );
    const confirmed = render("order-confirmed", "en");
    expect(confirmed.subject).toBe(
      "Confirmed: please make the order for Thu, 8 Oct",
    );
    expect(visible(confirmed.html)).toContain(
      "Confirmed. Please make this order. Open the order for the recipient's name, address, phone and the card message to print. Amber Hour · 18 stems · For Thu, 8 Oct Open the order",
    );
    const withdrawn = render("offer-withdrawn", "en");
    expect(withdrawn.subject).toBe(
      "Please do not make the order for Thu, 8 Oct",
    );
    expect(visible(withdrawn.html)).toContain(
      "This order is no longer yours. Please do not make it. Amber Hour · 18 stems · For Thu, 8 Oct If you have already started, call us on +1 (213) 592-5150.",
    );
    const photo = render("photo-reminder", "en");
    expect(photo.subject).toBe("Add the photo for the order of Thu, 8 Oct");
    expect(visible(photo.html)).toContain(
      "Add the photo Thank you for delivering Amber Hour today. Please add one photo of the bouquet as you handed it over. Add the photo",
    );
  });

  it("V4 on a timeout has its own subject, the passed line, and no 'already started' line", () => {
    const timedOut = render("offer-withdrawn", "en", { timedOut: true });
    expect(timedOut.subject).toBe(
      "The time to answer the order for Thu, 8 Oct has passed",
    );
    expect(visible(timedOut.html)).toContain(
      "The time to answer has passed. This order is no longer yours. Please do not make it. Amber Hour · 18 stems · For Thu, 8 Oct",
    );
    expect(timedOut.text).not.toContain("already started");
    expect(timedOut.html).not.toContain("already started");
  });

  it("refuses to render a linked template without its link", () => {
    expect(() =>
      renderFloristEmail("offer", FACTS, {
        language: "en",
        link: null,
        timedOut: false,
      }),
    ).toThrow(/EMAIL_LINK_MISSING/u);
  });

  it("throws on a missing key rather than mailing a key path", () => {
    expect(() =>
      render("offer", "en", {
        facts: { ...FACTS, addonKeys: ["catalog.addon.nothing.name"] },
      }),
    ).toThrow();
  });

  it("escapes data it prints: a product name with markup stays text", () => {
    const { html } = render("offer", "en", {
      facts: { ...FACTS, productName: `Rosa <b>"&'</b>` },
    });
    expect(html).toContain("Rosa &lt;b&gt;&quot;&amp;&#39;&lt;/b&gt;");
    expect(html).not.toContain(`Rosa <b>`);
  });
});

describe("T-22: no person in a florist email or a W copy", () => {
  it("cannot be given a recipient's or a buyer's field", () => {
    for (const field of [
      "recipientName",
      "street",
      "phone",
      "cardMessage",
      "buyerEmail",
    ]) {
      expect(
        FloristMessageFactsSchema.safeParse({ ...FACTS, [field]: "Marker" })
          .success,
        field,
      ).toBe(false);
    }
  });

  it("puts no town, postcode, name or phone in any subject, in any language", () => {
    for (const template of FLORIST_TEMPLATES) {
      for (const language of FLORIST_LANGUAGES) {
        for (const timedOut of [false, true]) {
          const { subject } = render(template, language, { timedOut });
          for (const value of [
            FACTS.town,
            FACTS.postcode,
            FACTS.partnerName,
            FACTS.partnerCode,
            "+1 (213) 592-5150",
          ]) {
            expect(subject, `${template} ${language}`).not.toContain(value);
          }
        }
      }
    }
  });

  it("V4 carries no link at all", () => {
    for (const timedOut of [false, true]) {
      const { html, text } = render("offer-withdrawn", "en", { timedOut });
      expect(html).not.toContain("<a ");
      expect(text).not.toMatch(/https?:/u);
    }
  });

  it("the W offer carries the inbox address only, and the W stop message no link", () => {
    const inbox =
      "https://flowersoverseas.com/vendor/orders/6f1c2e0a-0c1d-4a7e-9a55-1d2c3b4a5f60";
    const offer = whatsappFloristText("offer", FACTS, {
      language: "en",
      inboxUrl: inbox,
      timedOut: false,
    });
    expect(spaces(offer)).toBe(
      [
        "New order from Flowers Overseas",
        "",
        "Amber Hour · 18 stems",
        "Add-ons: Glass vase",
        "Delivery date: Thu, 8 Oct",
        "00-001 Warszawa",
        "You receive 149.00 PLN",
        "",
        "Answer by 15:40",
        "",
        `Open the order: ${inbox}`,
        "We have also sent you this order by email.",
      ].join("\n"),
    );
    const stop = whatsappFloristText("offer-withdrawn", FACTS, {
      language: "en",
      inboxUrl: null,
      timedOut: false,
    });
    expect(stop).toBe(
      [
        "Flowers Overseas",
        "",
        "This order is no longer yours. Please do not make it.",
        "",
        "Amber Hour · 18 stems · For Thu, 8 Oct",
        "",
        "If you have already started, call us on +1 (213) 592-5150.",
      ].join("\n"),
    );
    expect(stop).not.toMatch(/https?:/u);
    const timedOutStop = whatsappFloristText("offer-withdrawn", FACTS, {
      language: "en",
      inboxUrl: null,
      timedOut: true,
    });
    expect(timedOutStop).not.toContain("already started");
  });

  it("writes the W paste text in the florist's language", () => {
    const pl = whatsappFloristText("offer", FACTS, {
      language: "pl",
      inboxUrl: "https://flowersoverseas.com/vendor/orders/x",
      timedOut: false,
    });
    expect(pl.split("\n")[0]).toBe("Nowe zamówienie od Flowers Overseas");
    expect(spaces(pl)).toContain("Otrzymujesz 149,00 zł");
  });
});
