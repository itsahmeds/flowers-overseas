/**
 * Spec 034 T-06 (render half), T-11, T-12, T-13, T-14 (headers half), T-25 (thresholds), T-33
 * (dates, keys) (AC-6, AC-11 to AC-14, AC-25, AC-33; TASK-450): R1 in four locales from a fixture
 * basket, what it never contains, its strict props, the exact English of Appendix A, the
 * two-recipient diff, the Mailer's marketing stream and headers, and the auto-pause thresholds.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { relayMatches } from "../../src/config/honesty.ts";
import { shouldAutoPause } from "../../src/modules/checkout/reminders/scan.ts";
import {
  BasketReminderEmailPropsSchema,
  type BasketReminderEmailProps,
  renderBasketReminderEmail,
  reminderDate,
} from "../../src/modules/notifications/emails/basket-reminder.ts";
import {
  capturingMailer,
  MailMessageSchema,
  resendMailer,
} from "../../src/modules/notifications/mailer.ts";

const ROOT = resolve(__dirname, "../..");
const ORIGIN = "https://flowersoverseas.com";

function props(
  locale: "en" | "en-gb" | "de" | "pl",
  tokens = { restore: "R".repeat(43), unsubscribe: "U".repeat(43) },
): BasketReminderEmailProps {
  return {
    locale,
    lines: [
      {
        productName: "Amber Hour",
        tierLabel: "18 stems",
        countryName: "Poland",
        imageUrl: "https://media.flowersoverseas.com/media/fo-bq-001/384.webp",
        imageAlt: "A bouquet of orange roses",
        date: { kind: "kept", isoDate: "2026-10-08" },
      },
      {
        productName: "Spring Song",
        tierLabel: null,
        countryName: "Poland",
        imageUrl: null,
        imageAlt: "",
        date: { kind: "moved", nextIsoDate: "2026-10-09" },
      },
      {
        productName: "White Calm",
        tierLabel: "M",
        countryName: "Germany",
        imageUrl: "https://media.flowersoverseas.com/media/fo-bq-002/384.webp",
        imageAlt: "White lilies",
        date: { kind: "open" },
      },
    ],
    restoreUrl: `${ORIGIN}/${locale}/basket/restore/${tokens.restore}`,
    unsubscribeUrl: `${ORIGIN}/${locale}/basket/unsubscribe/${tokens.unsubscribe}`,
    helpUrl: `${ORIGIN}/${locale}/help`,
    privacyUrl: `${ORIGIN}/${locale}/privacy`,
  };
}

const APPENDIX_A: Record<string, string> = {
  subject: "Your basket is saved",
  preheader: "Pick up where you left off, whenever suits you.",
  heading: "Your basket is saved",
  intro:
    "You started an order with us. Everything you chose is still in your basket.",
  to: "To {country}",
  dateKept: "Delivery on {date}",
  dateMoved: "The earliest delivery date is now {date}.",
  dateOpen: "Choose a delivery date when you come back.",
  button: "Open my basket",
  total:
    "Your basket shows the total, with VAT and delivery included, before you pay.",
  help: "Questions? We are happy to help: {helpLink}",
  why: "You are getting this email because you asked us to when you started your order. It is the only one we send about this basket.",
  stop: "Stop basket emails",
};

const catalogue = (locale: string) =>
  JSON.parse(
    readFileSync(resolve(ROOT, `messages/${locale}.json`), "utf8"),
  ) as {
    emails: { basketReminder: Record<string, string> };
  };

describe("T-11 (AC-11) · R1 in each locale", () => {
  it.each(["en", "en-gb", "de", "pl"] as const)(
    "%s: lang, both parts, every line, one button",
    (locale) => {
      const mail = renderBasketReminderEmail(props(locale));
      expect(mail.html).toMatch(
        new RegExp(
          `<html[^>]*lang="${locale === "en-gb" ? "en-GB" : locale === "pl" ? "pl" : locale}`,
          "iu",
        ),
      );
      expect(mail.html).toMatch(/<html[^>]*dir="ltr"/u);
      for (const name of ["Amber Hour", "Spring Song", "White Calm"]) {
        expect(mail.html).toContain(name);
        expect(mail.text).toContain(name);
      }
      const anchors = [
        ...mail.html.matchAll(/<a [^>]*class="fo-btn"[^>]*href="([^"]+)"/gu),
      ];
      expect(anchors.map((m) => m[1])).toEqual([props(locale).restoreUrl]);
      expect(mail.text).toContain(props(locale).restoreUrl);
      for (const part of [mail.subject, mail.html, mail.text]) {
        expect(relayMatches(part, locale)).toEqual([]);
        expect(part).not.toMatch(/[€£$]|zł|\b(?:EUR|GBP|PLN|USD)\b/u);
      }
    },
  );

  it("en: the subject is Appendix A's", () => {
    expect(renderBasketReminderEmail(props("en")).subject).toBe(
      "Your basket is saved",
    );
  });
});

describe("T-06 (AC-6, render half) · a moved date shows only the next date", () => {
  it("prints 'The earliest delivery date is now {next}' and never the original date", () => {
    const base = props("en-gb");
    const input = {
      ...base,
      lines: [
        {
          ...base.lines[0]!,
          date: { kind: "moved" as const, nextIsoDate: "2026-10-09" },
        },
      ],
    };
    const mail = renderBasketReminderEmail(input);
    const next = reminderDate("2026-10-09", "en-gb");
    expect(mail.html).toContain(`The earliest delivery date is now ${next}.`);
    expect(mail.text).toContain(`The earliest delivery date is now ${next}.`);
    const original = reminderDate("2026-10-08", "en-gb");
    expect(mail.html).not.toContain(original);
    expect(mail.text).not.toContain(original);
  });

  it("an open line asks for a date", () => {
    expect(renderBasketReminderEmail(props("en")).text).toContain(
      "Choose a delivery date when you come back.",
    );
  });
});

describe("T-12 (AC-12) · the props cannot carry money, urgency or a name", () => {
  it.each([
    "price",
    "amount",
    "currency",
    "total",
    "discount",
    "code",
    "stock",
    "remaining",
    "deadline",
    "cutoff",
    "expiresAt",
    "name",
  ])("rejects %s at the top level and on a line", (key) => {
    const base = props("en");
    expect(
      BasketReminderEmailPropsSchema.safeParse({ ...base, [key]: 1 }).success,
    ).toBe(false);
    expect(
      BasketReminderEmailPropsSchema.safeParse({
        ...base,
        lines: [{ ...base.lines[0], [key]: 1 }],
      }).success,
    ).toBe(false);
  });

  it("every en value under emails.basketReminder.* that Appendix A lists equals it exactly", () => {
    const en = catalogue("en").emails.basketReminder;
    for (const [key, value] of Object.entries(APPENDIX_A)) {
      expect(en[key], key).toBe(value);
    }
  });

  it("no value in any locale has an ICU argument other than country, date and helpLink, and none has a dash", () => {
    for (const locale of ["en", "de", "pl"]) {
      for (const [key, value] of Object.entries(
        catalogue(locale).emails.basketReminder,
      )) {
        for (const match of value.matchAll(/\{(\w+)/gu)) {
          expect(["country", "date", "helpLink"], `${locale} ${key}`).toContain(
            match[1],
          );
        }
        expect(value, `${locale} ${key}`).not.toMatch(/[–—]/u);
      }
    }
  });
});

describe("T-13 (AC-13) · nothing per recipient but the two token URLs", () => {
  it("two recipients' renders differ only in the restore and unsubscribe URLs", () => {
    const a = renderBasketReminderEmail(props("en"));
    const b = renderBasketReminderEmail(
      props("en", { restore: "a".repeat(43), unsubscribe: "b".repeat(43) }),
    );
    const normalise = (html: string) =>
      html.replace(
        /\/basket\/(restore|unsubscribe)\/[A-Za-z0-9_-]{43}/gu,
        "/basket/$1/T",
      );
    expect(normalise(a.html)).toBe(normalise(b.html));
    expect(normalise(a.text)).toBe(normalise(b.text));
  });

  it("no 1 by 1 or 0 by 0 image and no query string on any URL", () => {
    const html = renderBasketReminderEmail(props("en")).html;
    expect(html).not.toMatch(/<img[^>]*width="[01]"/u);
    expect(html).not.toMatch(/(?:src|href)="[^"]*\?/u);
  });
});

describe("T-14 (AC-14) · the Mailer's marketing stream and headers", () => {
  const headers = {
    "List-Unsubscribe": `<${ORIGIN}/api/basket-reminders/unsubscribe/${"U".repeat(43)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  } as const;
  const message = {
    tag: "basket_reminder" as const,
    to: "buyer@example.test",
    subject: "Your basket is saved",
    html: "<p>x</p>",
    text: "x",
    stream: "marketing" as const,
    idempotencyKey: "basket_reminder:00000000-0000-4000-8000-000000000001",
    headers,
  };

  it("admits only the two RFC 8058 headers", () => {
    expect(MailMessageSchema.safeParse(message).success).toBe(true);
    expect(
      MailMessageSchema.safeParse({
        ...message,
        headers: { ...headers, "X-Track": "1" },
      }).success,
    ).toBe(false);
    expect(
      MailMessageSchema.safeParse({
        ...message,
        headers: { ...headers, "List-Unsubscribe-Post": "yes" },
      }).success,
    ).toBe(false);
  });

  it("the capturing mailer sends a marketing message from MARKETING_MAIL_FROM with the headers and tag", async () => {
    const mailer = capturingMailer(
      "Orders <orders@x.test>",
      "Basket <hello@mail.x.test>",
    );
    mailer.clear();
    await mailer.send(message);
    const [sent] = mailer.messages("buyer@example.test");
    expect(sent?.from).toBe("Basket <hello@mail.x.test>");
    expect(sent?.headers).toEqual(headers);
    expect(sent?.tag).toBe("basket_reminder");
    mailer.clear();
  });

  it("the Resend request carries from, headers and the idempotency key, and no tracking option", async () => {
    const calls: {
      body: Record<string, unknown>;
      headers: Record<string, string>;
    }[] = [];
    const mailer = resendMailer(
      {
        apiKey: "re_test",
        from: "Orders <orders@x.test>",
        marketingFrom: "Basket <hello@mail.x.test>",
      },
      (async (_url: string, init: RequestInit) => {
        calls.push({
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
          headers: init.headers as Record<string, string>,
        });
        return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
      }) as unknown as typeof fetch,
    );
    await mailer.send(message);
    expect(calls[0]?.body["from"]).toBe("Basket <hello@mail.x.test>");
    expect(calls[0]?.body["headers"]).toEqual(headers);
    expect(calls[0]?.headers["idempotency-key"]).toBe(message.idempotencyKey);
    expect(
      Object.keys(calls[0]?.body ?? {}).filter((key) => /track/iu.test(key)),
    ).toEqual([]);
  });

  it("the visible stop link points at the unsubscribe page in both parts", () => {
    const mail = renderBasketReminderEmail(props("en"));
    expect(mail.html).toMatch(
      new RegExp(
        `<a [^>]*href="${ORIGIN}/en/basket/unsubscribe/U{43}"[^>]*>Stop basket emails</a>`,
        "u",
      ),
    );
    expect(mail.text).toContain(
      `Stop basket emails: ${ORIGIN}/en/basket/unsubscribe/${"U".repeat(43)}`,
    );
  });
});

describe("T-25 (AC-25) · the auto-pause thresholds", () => {
  // The approved thresholds (§5.2 `AUTO_PAUSE`, §13 Q9): complaints above 0.3 %, bounces above 4 %,
  // at least 50 sent. AC-25's "60 with 1 complaint" and "3 bounces in 60" leave-on cases contradict
  // them (1/60 is 1.7 %, 3/60 is 5 %); escalated in docs/tasks/TASK-450.md, tested as approved.
  it.each([
    [{ sent: 60, complained: 2, bounced: 0 }, true],
    [{ sent: 49, complained: 5, bounced: 0 }, false],
    [{ sent: 50, complained: 0, bounced: 3 }, true],
    [{ sent: 1000, complained: 3, bounced: 0 }, false],
    [{ sent: 1000, complained: 4, bounced: 0 }, true],
    [{ sent: 100, complained: 0, bounced: 4 }, false],
    [{ sent: 100, complained: 0, bounced: 5 }, true],
  ])("%o pauses: %s", (counts, expected) => {
    expect(shouldAutoPause(counts)).toBe(expected);
  });
});

describe("T-33 (AC-33) · dates with weekday and month name", () => {
  it("formats a fixture date exactly in en-gb, de and pl", () => {
    expect(reminderDate("2026-02-14", "en-gb")).toBe("Sat 14 Feb");
    expect(reminderDate("2026-02-14", "de")).toBe("Sa., 14. Feb.");
    expect(reminderDate("2026-02-14", "pl")).toBe("sob., 14 lut");
  });
});
