/**
 * The basket page's body in every state of item 6 (spec 010 §14 A-founder-2026-10-22 item 6, D5,
 * D8; AC-57 render half, AC-73 basket half, AC-74 basket half; T-57 unit, T-73, T-74 basket half;
 * TASK-349).
 *
 * `BasketView` is rendered with `react-dom/server` against the real `messages/*.json`, from a
 * `BasketPage` fixture (the view model `loadBasketPage()` returns; its own decisions against a
 * database are `tests/integration/checkout-basket-page.test.ts`). With JavaScript off the page is
 * exactly this HTML, so every control is asserted to be a form or a link.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { NextIntlClientProvider, createTranslator } from "next-intl";

import type { LocaleCode } from "../../src/config/locales.ts";
import { relayMatches } from "../../src/config/honesty.ts";
import {
  type IntegerMoney,
  IntegerMoneySchema,
} from "../../src/modules/catalog";
import type { BasketPage, BasketPageLine } from "../../src/modules/checkout";
import { formatDate, formatMoney, loadMessages } from "../../src/modules/i18n";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";

vi.mock("next-intl/server", () => ({
  getTranslations: ({
    locale,
    namespace,
  }: {
    locale: string;
    namespace?: string;
  }) =>
    Promise.resolve(
      createTranslator({
        locale,
        messages: loadMessages(locale, MESSAGE_NAMESPACES),
        ...(namespace === undefined ? {} : { namespace }),
      } as Parameters<typeof createTranslator>[0]),
    ),
}));

const { BasketView } =
  await import("../../src/app/[locale]/(checkout)/basket/BasketView.tsx");

const noop = (): Promise<void> => Promise.resolve();
const ACTIONS = { remove: noop, useNextDate: noop, confirmPrice: noop };
const HREFS = {
  home: "/en-gb",
  checkout: "/en-gb/checkout",
  continueShopping: "/en-gb/send-flowers-to-poland",
  guarantee: "/en-gb/guarantee",
};

function gbp(amountMinor: number): IntegerMoney {
  return IntegerMoneySchema.parse({ amountMinor, currency: "GBP" });
}

function line(
  position: number,
  overrides: Partial<BasketPageLine> = {},
): BasketPageLine {
  return {
    position,
    countryIso: "PL",
    state: "ok",
    display: {
      name: `Bouquet ${String(position)}`,
      tier: { labelKey: "catalog.tier.stems", stems: 18 },
      addOnNameKeys: [],
      photo: null,
    },
    deliveryDate: "2026-10-08",
    amount: gbp(4590),
    gone: null,
    ...overrides,
  };
}

function lines(
  entries: readonly BasketPageLine[],
  extra: Partial<Extract<BasketPage, { kind: "lines" }>> = {},
): BasketPage {
  const total = entries
    .filter((entry) => entry.state === "ok")
    .reduce((sum, entry) => sum + (entry.amount?.amountMinor ?? 0), 0);
  return {
    kind: "lines",
    mode: "live",
    lines: entries,
    total: gbp(total),
    notice: null,
    priceNotice: null,
    blocked: entries.filter((entry) => entry.state !== "ok").length,
    continueCountry: "PL",
    ...extra,
  };
}

async function render(
  page: BasketPage,
  locale: LocaleCode = "en-gb",
): Promise<string> {
  const body = (await BasketView({
    locale,
    page,
    actions: ACTIONS,
    hrefs: HREFS,
  })) as ReactElement;
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, MESSAGE_NAMESPACES)}
      timeZone="UTC"
    >
      {body}
    </NextIntlClientProvider>,
  );
}

function text(html: string): string {
  return html
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll(/\s+/gu, " ");
}

function dateOf(date: string, locale: LocaleCode): string {
  return formatDate(
    new Date(`${date}T12:00:00Z`),
    locale,
    "calendarDate",
    "UTC",
  );
}

/** The `<li>` of line `n`. */
function lineHtml(html: string, n: number): string {
  const start = html.indexOf(`data-fo-basket-line="${String(n)}"`);
  return html.slice(
    html.lastIndexOf("<li", start),
    html.indexOf("</li>", start),
  );
}

describe("AC-57: each line and the one total, JavaScript off", () => {
  it("renders name, size, destination, date, add-ons and the line amount, and the total of the lines", async () => {
    const page = lines([
      line(1),
      line(2, {
        display: {
          name: "Vistula Red",
          tier: { labelKey: "catalog.tier.stems", stems: 12 },
          addOnNameKeys: [
            "catalog.addon.chocolates.name",
            "catalog.addon.vase.name",
          ],
          photo: null,
        },
        countryIso: "DE",
        deliveryDate: "2026-10-10",
        amount: gbp(7090),
      }),
    ]);
    const html = await render(page);
    const second = text(lineHtml(html, 2));
    expect(second).toContain("Vistula Red");
    expect(second).toContain("12 stems");
    expect(second).toContain("To Germany");
    expect(second).toContain(dateOf("2026-10-10", "en-gb"));
    expect(second).toContain("Add-ons · Box of chocolates and Glass vase");
    expect(second).toContain(formatMoney(gbp(7090), "en-gb"));
    expect(text(lineHtml(html, 1))).toContain("To Poland");
    // The one total: 45.90 + 70.90, through formatMoney, in the polite live region.
    const total = html.slice(html.indexOf("data-fo-basket-total"));
    expect(total.slice(0, total.indexOf("</div>"))).toContain(
      formatMoney(gbp(11680), "en-gb"),
    );
    expect(html).toMatch(/aria-live="polite"[^>]*data-fo-basket-total/u);
    expect(text(html)).toContain(
      "Each price includes VAT and delivery to its address.",
    );
  });

  it("a demo line without a date says the date comes at checkout, and the demo banner shows", async () => {
    const html = await render(
      lines([line(1, { deliveryDate: null })], {
        mode: "demo",
        notice: "added",
      }),
    );
    expect(text(lineHtml(html, 1))).toContain(
      "You choose the date at checkout.",
    );
    expect(html).toContain("data-fo-demo-banner");
    expect(html).toMatch(/data-fo-basket-notice="added" role="status"/u);
    expect(text(html)).toContain("Added to your basket.");
  });

  it("each Remove is a submit in its own form posting only the line's position, named for its bouquet", async () => {
    const html = await render(lines([line(1), line(2), line(3)]));
    const forms = [
      ...html.matchAll(/<form[^>]*data-fo-remove-line[^>]*>(.*?)<\/form>/gu),
    ];
    expect(forms).toHaveLength(3);
    forms.forEach((form, index) => {
      const body = form[1] ?? "";
      expect(body).toContain(
        `<input name="line" type="hidden" value="${String(index + 1)}"/>`,
      );
      expect(body).toContain(
        `aria-label="Remove Bouquet ${String(index + 1)} from your basket"`,
      );
      expect(body).toContain('type="submit"');
      expect(body.match(/<input/gu)).toHaveLength(1);
    });
  });

  it("Check out and Continue shopping are plain links", async () => {
    const html = await render(lines([line(1)]));
    expect(html).toMatch(
      /<a [^>]*data-fo-basket-checkout=""[^>]*href="\/en-gb\/checkout"/u,
    );
    expect(html).toContain('href="/en-gb/send-flowers-to-poland"');
    expect(html).toContain('href="/en-gb/guarantee"');
  });

  it("the empty state: one sentence and one link home, no total, no form", async () => {
    const html = await render({ kind: "empty" });
    expect(text(html)).toContain("Your basket is empty.");
    expect([...html.matchAll(/<a /gu)]).toHaveLength(1);
    expect(html).toContain('href="/en-gb"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("data-fo-basket-total");
    expect(html).toMatch(
      /<h1[^>]*id="basket-title"[^>]*tabindex="-1"|<h1[^>]*tabIndex="-1"[^>]*id="basket-title"/u,
    );
  });
});

describe("D8: lines that need the buyer stay visible and out of the total", () => {
  it("an unavailable line is greyed, flagged in words, keeps its quoted amount and is not in the total", async () => {
    const page = lines([
      line(1, { state: "unavailable", amount: gbp(4590) }),
      line(2, { amount: gbp(3390) }),
    ]);
    expect(page.kind === "lines" && page.total?.amountMinor).toBe(3390);
    const html = await render(page);
    const first = lineHtml(html, 1);
    expect(first).toContain('data-fo-basket-line-state="unavailable"');
    expect(first).toContain("grayscale");
    expect(text(first)).toContain(
      "This bouquet is no longer available. Please remove it to continue.",
    );
    expect(text(first)).toContain(formatMoney(gbp(4590), "en-gb"));
    expect(text(html)).toContain(
      "One bouquet in your basket is no longer available. Please remove it to continue.",
    );
    const total = html.slice(html.indexOf("data-fo-basket-total"));
    expect(total.slice(0, total.indexOf("</div>"))).toContain(
      formatMoney(gbp(3390), "en-gb"),
    );
  });

  it("a date-gone line names the date, the country, the reason and the next date, with Use {next} for that line only", async () => {
    const html = await render(
      lines([
        line(1),
        line(2, {
          state: "dateGone",
          deliveryDate: "2026-10-10",
          gone: {
            next: "2026-10-12",
            reason: {
              key: "delivery.reason.pastCutoff",
              params: { time: "14:00", city: "Warsaw" },
            },
          },
        }),
      ]),
    );
    const second = lineHtml(html, 2);
    expect(text(second)).toContain(
      `${dateOf("2026-10-10", "en-gb")} is no longer available in Poland: Ordering closed at 14:00 in Warsaw. The next date is ${dateOf("2026-10-12", "en-gb")}.`,
    );
    expect(second).toContain('<input name="line" type="hidden" value="2"/>');
    expect(second).toContain(
      '<input name="deliveryDate" type="hidden" value="2026-10-12"/>',
    );
    expect(text(second)).toContain(`Use ${dateOf("2026-10-12", "en-gb")}`);
    expect(lineHtml(html, 1)).not.toContain("deliveryDate");
    expect(text(html)).toContain(
      "One bouquet in your basket is no longer available.",
    );
  });

  it("the refusal notices of the start route render once, from pending_notice", async () => {
    const full = await render(lines([line(1)], { notice: "full" }));
    expect(text(full)).toContain(
      "Your basket holds up to 5 bouquets. Please check out first, then start a new basket.",
    );
    const mode = await render(lines([line(1)], { notice: "other_mode" }));
    expect(text(mode)).toContain(
      "This bouquet cannot go in this basket. Please check out or empty your basket first.",
    );
    const currency = await render(
      lines([line(1)], { notice: "other_currency" }),
    );
    expect(text(currency)).toContain(
      "Your basket is in GBP, and this bouquet cannot be priced in GBP today. Please check out your basket first.",
    );
  });

  it("a price change shows both amounts and a confirm form posting the new total", async () => {
    const html = await render(
      lines([line(1, { amount: gbp(7140) })], {
        priceNotice: { previous: gbp(7090), current: gbp(7140) },
      }),
    );
    expect(text(html)).toContain(
      `The price changed from ${formatMoney(gbp(7090), "en-gb")} to ${formatMoney(gbp(7140), "en-gb")} since you opened the product page.`,
    );
    expect(html).toContain(
      '<input name="intent" type="hidden" value="confirmPrice"/>',
    );
    expect(html).toContain(
      '<input name="seenTotalMinor" type="hidden" value="7140"/>',
    );
    expect(html).toContain(
      '<input name="seenCurrency" type="hidden" value="GBP"/>',
    );
  });
});

describe("AC-73 basket half: formatting, bdi and RTL", () => {
  it("every date has a weekday and a month name, in pl too", async () => {
    const html = await render(lines([line(1)]), "pl");
    expect(text(html)).toContain(dateOf("2026-10-08", "pl"));
    expect(dateOf("2026-10-08", "pl")).toMatch(/czwartek/u);
    expect(dateOf("2026-10-08", "en-gb")).toMatch(/Thursday/u);
    expect(dateOf("2026-10-08", "en-gb")).toMatch(/October/u);
  });

  it("names sit in <bdi>, and /ar-XB renders the basket", async () => {
    const html = await render(lines([line(1), line(2)]), "ar-XB");
    expect(html).toContain("<bdi>Bouquet 1</bdi>");
    expect(html).toContain("data-fo-basket-lines");
  });

  it("no physical CSS class in the basket's markup", async () => {
    const html = await render(
      lines([line(1, { state: "unavailable" }), line(2)]),
    );
    const classes = [...html.matchAll(/class="([^"]*)"/gu)].flatMap((m) =>
      (m[1] ?? "").split(" "),
    );
    for (const name of classes) {
      expect(name).not.toMatch(
        /^(?:[a-z0-9-]+:)*-?(?:ml|mr|pl|pr|left|right|text-left|text-right|border-l|border-r|rounded-l|rounded-r)(?:-|$)/u,
      );
    }
  });
});

describe("AC-74 basket half: no relay language", () => {
  it("relayMatches finds nothing in the new keys, in four locales", () => {
    for (const locale of ["en", "en-gb", "de", "pl"] as const) {
      const messages = loadMessages(locale, ["checkout", "nav"]) as {
        checkout: {
          basket: Record<string, string>;
          date: Record<string, string>;
        };
        nav: Record<string, unknown>;
      };
      const values = [
        ...Object.values(messages.checkout.basket),
        ...Object.values(messages.checkout.date),
        messages.nav["basket"] as string,
        messages.nav["basketCount"] as string,
      ];
      expect(values.length).toBeGreaterThan(20);
      for (const value of values) {
        expect(relayMatches(value, locale), `${locale}: ${value}`).toEqual([]);
      }
    }
  });

  it("relayMatches finds nothing in the rendered HTML of every state", async () => {
    const states: BasketPage[] = [
      { kind: "empty" },
      lines([line(1)], { mode: "demo", notice: "added" }),
      lines([line(1, { state: "unavailable" }), line(2)], { notice: "full" }),
      lines([line(1)], { notice: "other_mode" }),
      lines([line(1)], { notice: "other_currency" }),
      lines([line(1)], { priceNotice: { previous: gbp(1), current: gbp(2) } }),
    ];
    for (const state of states) {
      const html = await render(state);
      expect(relayMatches(text(html), "en-gb")).toEqual([]);
    }
  });

  it("no new basket key is marked reviewed (the founder's act)", () => {
    const meta = loadMeta();
    for (const [key, record] of Object.entries(meta)) {
      if (
        key.startsWith("checkout.basket.") ||
        key === "checkout.date.gone" ||
        key === "nav.basketCount" ||
        key === "nav.basket"
      ) {
        expect(record.reviewed, key).toBe(false);
      }
    }
  });
});

function loadMeta(): Record<string, { reviewed: boolean }> {
  return JSON.parse(
    readFileSync(
      join(import.meta.dirname, "../../messages/en.meta.json"),
      "utf8",
    ),
  ) as Record<string, { reviewed: boolean }>;
}
