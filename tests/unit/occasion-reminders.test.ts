/**
 * Spec 018 §14 A-founder-2026-10-22 C.7.4 row B, the parts without a database (T-56 calendar half,
 * T-57 render half, T-58 HTTP half; AC-56, AC-57, AC-58; TASK-353): `reminderTargets` at the lead
 * boundary and on 29 February, `ReminderInputSchema`'s calendar and shape, T18 in every locale (no
 * amount, no name in the subject, no relay wording, the date without a year), its two RFC 8058
 * headers and its links, and the one-click endpoint's answers without a valid token.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { relayMatches } from "@/config/honesty";
import {
  type AccountRunner,
  type DueReminder,
  ReminderInputSchema,
  reminderOneClickMethodNotAllowed,
  reminderOneClickResponse,
  reminderTargets,
  reminderUnsubscribeLinkToken,
} from "@/modules/customers";
import type { MailMessage } from "@/modules/notifications";
import { renderOccasionReminderEmail } from "@/modules/notifications/emails";

import {
  reminderDestinationPath,
  reminderLinks,
  sendOccasionReminder,
} from "../../src/jobs/occasion-reminders.ts";

const SECRET = "test-signed-link-secret-0123456789abcdef";
const ORIGIN = "https://flowersoverseas.test";
const TOKEN = "AAAAAAAAAAAAAAAAAAAAAA";
const LOCALES = ["en", "en-gb", "de", "pl"] as const;
/** A currency amount in any form an email could print one. */
const AMOUNT =
  /(?:€|£|\$|zł|EUR|PLN|GBP|USD|CHF)\s?\d|\d[\d.,\s]*\s?(?:€|£|\$|zł|EUR|PLN|GBP|USD|CHF)/u;

beforeEach(() => {
  vi.stubEnv("SIGNED_LINK_SECRET", SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("reminderTargets (C.7.4, AC-57)", () => {
  const leadSeven = (today: string) =>
    reminderTargets(today).filter((target) => target.leadDays === 7);

  it("looks exactly the lead time ahead, one per lead", () => {
    expect(reminderTargets("2026-03-07")).toEqual([
      { leadDays: 3, month: 3, day: 10, occurrence: "2026-03-10" },
      { leadDays: 7, month: 3, day: 14, occurrence: "2026-03-14" },
      { leadDays: 14, month: 3, day: 21, occurrence: "2026-03-21" },
    ]);
  });

  it("a 14 March date with 7 days' lead is due on 7 March, not on 6 or 8 March", () => {
    const hits = (today: string) =>
      leadSeven(today).some((t) => t.month === 3 && t.day === 14);
    expect(hits("2026-03-06")).toBe(false);
    expect(hits("2026-03-07")).toBe(true);
    expect(hits("2026-03-08")).toBe(false);
  });

  it("29 February fires for 28 February in a common year: 21 February 2027 with 7 days", () => {
    expect(leadSeven("2027-02-21")).toEqual([
      { leadDays: 7, month: 2, day: 28, occurrence: "2027-02-28" },
      { leadDays: 7, month: 2, day: 29, occurrence: "2027-02-28" },
    ]);
    expect(
      leadSeven("2027-02-20").some((t) => t.day === 29 || t.day === 28),
    ).toBe(false);
  });

  it("in a leap year 29 February fires for itself, and 28 February only for 28 February", () => {
    expect(leadSeven("2028-02-22")).toEqual([
      { leadDays: 7, month: 2, day: 29, occurrence: "2028-02-29" },
    ]);
    expect(leadSeven("2028-02-21")).toEqual([
      { leadDays: 7, month: 2, day: 28, occurrence: "2028-02-28" },
    ]);
  });

  it("crosses a year end on the UTC calendar", () => {
    expect(reminderTargets("2026-12-28").find((t) => t.leadDays === 7)).toEqual(
      { leadDays: 7, month: 1, day: 4, occurrence: "2027-01-04" },
    );
  });
});

describe("ReminderInputSchema (C.7.4, C.12, AC-56)", () => {
  const base = {
    occasionKey: "birthday",
    day: 14,
    month: 3,
    leadDays: 7,
    savedRecipientId: null,
  };

  it("accepts (2, 29) and refuses (2, 30), (4, 31) and (13, 1)", () => {
    expect(
      ReminderInputSchema.safeParse({ ...base, month: 2, day: 29 }).success,
    ).toBe(true);
    for (const [month, day] of [
      [2, 30],
      [4, 31],
      [13, 1],
      [1, 0],
    ] as const) {
      expect(
        ReminderInputSchema.safeParse({ ...base, month, day }).success,
        `${String(month)}-${String(day)}`,
      ).toBe(false);
    }
  });

  it("takes no year and no free text, a lead of 3, 7 or 14 only, and consent only as true", () => {
    expect(ReminderInputSchema.safeParse({ ...base, year: 1990 }).success).toBe(
      false,
    );
    expect(
      ReminderInputSchema.safeParse({ ...base, note: "Mum" }).success,
    ).toBe(false);
    expect(
      ReminderInputSchema.safeParse({ ...base, occasionKey: "Mum's day" })
        .success,
    ).toBe(false);
    expect(
      ReminderInputSchema.safeParse({ ...base, leadDays: 5 }).success,
    ).toBe(false);
    expect(
      ReminderInputSchema.safeParse({ ...base, consent: false }).success,
    ).toBe(false);
    expect(
      ReminderInputSchema.safeParse({ ...base, consent: true }).success,
    ).toBe(true);
  });
});

describe("T18 occasion-reminder (C.7.4, C.15, AC-57)", () => {
  const props = {
    occasionKey: "birthday" as const,
    occurrence: "2027-03-14",
    recipientName: "Maria Przykładowa",
    chooseUrl: `${ORIGIN}/en-gb/poland/occasions/birthday`,
    stopUrl: `${ORIGIN}/en-gb/account/reminders/unsubscribe?t=x.y`,
  };

  it("en: the board's subject, sentence, button and footer; the first name only, never in the subject", () => {
    const email = renderOccasionReminderEmail({ ...props, locale: "en" });
    expect(email.subject).toBe("Birthday on 14 March");
    expect(email.text).toContain(
      "Maria's birthday is on 14 March. There is still time to send flowers for the day.",
    );
    expect(email.text).not.toContain("Przykładowa");
    expect(email.html).not.toContain("Przykładowa");
    expect(email.text).toContain(`Choose flowers:\n${props.chooseUrl}`);
    expect(email.text).toContain(
      "You get this email because you asked us for reminders.",
    );
    expect(email.text).toContain(`Stop reminders: ${props.stopUrl}`);
    expect(email.html).toContain(`href="${props.stopUrl}"`);
    expect(email.html).toContain('lang="en"');
  });

  it("without a saved recipient: the none sentence", () => {
    const email = renderOccasionReminderEmail({
      ...props,
      locale: "en",
      recipientName: null,
      occasionKey: "name_day",
    });
    expect(email.subject).toBe("Name day on 14 March");
    expect(email.text).toContain("Your name day reminder: 14 March.");
  });

  it.each(LOCALES)(
    "%s: no currency amount, no year, no relay wording, no dash in the words",
    (locale) => {
      for (const occasionKey of [
        "birthday",
        "anniversary",
        "name_day",
        "other",
      ] as const) {
        for (const recipientName of ["Maria Przykładowa", null]) {
          const email = renderOccasionReminderEmail({
            ...props,
            locale,
            occasionKey,
            recipientName,
          });
          const words = `${email.subject}\n${email.text}`;
          expect(words).not.toMatch(AMOUNT);
          expect(words).not.toContain("2027");
          expect(email.html).not.toMatch(AMOUNT);
          expect(relayMatches(words, locale)).toEqual([]);
          expect(words).not.toMatch(/[—–]/u);
          expect(email.subject).not.toContain("Maria");
          expect(email.html).toMatch(new RegExp(`lang="${locale}"`, "iu"));
        }
      }
    },
  );

  it("refuses a price or any field the schema does not name", () => {
    expect(() =>
      renderOccasionReminderEmail({
        ...props,
        locale: "en",
        priceMinor: 4500,
      } as never),
    ).toThrow();
  });
});

describe("T18's links and send (AC-57)", () => {
  const due: DueReminder = {
    id: "0b3e8f9a-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
    email: "buyer@example.test",
    occasionKey: "birthday",
    occurrence: "2027-03-14",
    locale: "en-gb",
    countryIso2: "PL",
    recipientName: "Maria Przykładowa",
    unsubscribeToken: TOKEN,
  };

  it("the stop links carry only the signed t, over https", () => {
    const links = reminderLinks(ORIGIN, due, "/en-gb/poland/flowers");
    const t = encodeURIComponent(reminderUnsubscribeLinkToken(TOKEN));
    expect(links).toEqual({
      chooseUrl: `${ORIGIN}/en-gb/poland/flowers`,
      stopUrl: `${ORIGIN}/en-gb/account/reminders/unsubscribe?t=${t}`,
      oneClickUrl: `${ORIGIN}/api/reminders/unsubscribe?t=${t}`,
    });
    expect(links.oneClickUrl).not.toContain(TOKEN);
    expect(links.oneClickUrl).not.toContain("example.test");
  });

  it("sends one message with the two RFC 8058 headers, the T18 tag and a per-occurrence key", async () => {
    const sent: MailMessage[] = [];
    await sendOccasionReminder(due, {
      origin: ORIGIN,
      mailer: {
        send: (message) => {
          sent.push(message);
          return Promise.resolve({ providerRef: "ref" });
        },
      },
      destinationPath: () =>
        Promise.resolve("/en-gb/poland/occasions/birthday"),
    });
    expect(sent).toHaveLength(1);
    const [message] = sent;
    const t = encodeURIComponent(reminderUnsubscribeLinkToken(TOKEN));
    expect(message?.tag).toBe("occasion_reminder");
    expect(message?.to).toBe("buyer@example.test");
    expect(message?.idempotencyKey).toBe(
      `occasion_reminder:${due.id}:2027-03-14`,
    );
    expect(message?.headers).toEqual({
      "List-Unsubscribe": `<${ORIGIN}/api/reminders/unsubscribe?t=${t}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(message?.subject).toBe("Birthday on 14 March");
  });

  it("Choose flowers: the occasion page, else the country's shop, else the locale home", async () => {
    const asked: unknown[] = [];
    const href =
      (pages: Record<string, string>) =>
      (identity: unknown): Promise<string | undefined> => {
        asked.push(identity);
        const { pageType } = identity as { pageType: string };
        return Promise.resolve(pages[pageType]);
      };
    expect(
      await reminderDestinationPath(
        "pl",
        "PL",
        "name_day",
        href({ countryOccasion: "/pl/polska/okazje/imieniny" }),
      ),
    ).toBe("/pl/polska/okazje/imieniny");
    expect(asked[0]).toEqual({
      pageType: "countryOccasion",
      locale: "pl",
      countryIso: "PL",
      entityKey: "name_day",
    });
    expect(
      await reminderDestinationPath(
        "en",
        "PL",
        "birthday",
        href({ countryShopRoot: "/en/poland/flowers" }),
      ),
    ).toBe("/en/poland/flowers");
    expect(
      await reminderDestinationPath("de", "PL", "birthday", href({})),
    ).toBe("/de");
    expect(
      await reminderDestinationPath("en", null, "birthday", href({})),
    ).toBe("/en");
    asked.length = 0;
    await reminderDestinationPath("en", "PL", "other", href({}));
    expect(asked).toEqual([
      { pageType: "countryShopRoot", locale: "en", countryIso: "PL" },
    ]);
  });
});

describe("POST /api/reminders/unsubscribe without a valid token (AC-58)", () => {
  const post = (
    query: string,
    body: string,
    type = "application/x-www-form-urlencoded",
  ) =>
    new Request(`${ORIGIN}/api/reminders/unsubscribe${query}`, {
      method: "POST",
      headers: { "content-type": type },
      body,
    });
  const untouched: AccountRunner = () => {
    throw new Error("the database must not be reached");
  };

  it("a forged, unknown-shaped or missing t answers the same 200 body and reaches no database", async () => {
    const valid = reminderUnsubscribeLinkToken(TOKEN);
    const forged = `${valid.slice(0, -2)}AA`;
    const bodies: string[] = [];
    for (const query of [`?t=${forged}`, "?t=nonsense", ""]) {
      const response = await reminderOneClickResponse(
        post(query, "List-Unsubscribe=One-Click"),
        { system: untouched },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store, private");
      bodies.push(await response.text());
    }
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toBe(
      "Reminders are off. We have deleted your saved dates.",
    );
  });

  it("any other body or content type answers 400; GET answers 405", async () => {
    const t = `?t=${reminderUnsubscribeLinkToken(TOKEN)}`;
    for (const request of [
      post(t, "List-Unsubscribe=Yes"),
      post(t, "List-Unsubscribe=One-Click&x=1"),
      post(t, '{"List-Unsubscribe":"One-Click"}', "application/json"),
    ]) {
      const response = await reminderOneClickResponse(request, {
        system: untouched,
      });
      expect(response.status).toBe(400);
    }
    const get = reminderOneClickMethodNotAllowed();
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
  });
});
