/**
 * The approximate-equivalents line on the product card (spec 004 §14 A21 clause 6 (b)–(d);
 * spec 008 AC-6 as amended, T-06's equivalents case; TASK-178).
 *
 * Rendered against the real `messages/*.json`, so each expected string is the sentence that ships
 * in that locale: the other currencies of {EUR, GBP, PLN, USD} through `formatMoney`, joined by
 * `formatList` as a disjunction, and the rate's day and month through `formatDate`'s `dayMonth`.
 * The non-breaking spaces are `Intl`'s (U+00A0), asserted as such.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import type { LocaleCode } from "../../src/config/locales.ts";
import { loadMessages } from "../../src/modules/i18n";
import { ProductCard } from "../../src/modules/ui/shop/ProductCard.tsx";
import { equivalentsMessageValues } from "../../src/modules/ui/shop/equivalents.ts";
import {
  HubCardViewSchema,
  ProductCardViewSchema,
  type ProductCardView,
} from "../../src/modules/ui/shop/viewModel.ts";

function render(node: React.ReactElement, locale: LocaleCode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, ["shop", "catalog", "media", "a11y"])}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

/** €45.90 charged; GBP, PLN and USD at the 2026-09-08 snapshot's mid rate (see the helper test). */
const EUR_CARD: ProductCardView = {
  productId: "FO-BQ-001",
  name: "Amber Hour",
  photo: { kind: "placeholder", slot: "grid" },
  price: { amountMinor: 4590, currency: "EUR" },
  priceLabelKey: "catalog.price.inclusive",
  equivalents: {
    asOf: "2026-09-08",
    amounts: [
      { amountMinor: 3885, currency: "GBP" },
      { amountMinor: 19_590, currency: "PLN" },
      { amountMinor: 5331, currency: "USD" },
    ],
  },
  provenance: "ai",
};

/** 199 zł charged natively on /pl; EUR, GBP and USD at the latest snapshot. */
const PLN_CARD: ProductCardView = {
  ...EUR_CARD,
  price: { amountMinor: 19_900, currency: "PLN" },
  equivalents: {
    asOf: "2026-09-08",
    amounts: [
      { amountMinor: 4663, currency: "EUR" },
      { amountMinor: 3947, currency: "GBP" },
      { amountMinor: 5415, currency: "USD" },
    ],
  },
};

const NBSP = " ";

/** The equivalents span's text, or `undefined` when the card has none. */
function equivalentsText(html: string): string | undefined {
  const match =
    /<span[^>]*data-fo-price-equivalents[^>]*>([^<]*)<\/span>/u.exec(html);
  return match?.[1]
    ?.replaceAll("&amp;", "&")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"');
}

describe("ProductCard: the equivalents line under the one prominent price", () => {
  it.each([
    [
      "en",
      `about 38.85${NBSP}£, 195.90${NBSP}PLN or 53.31${NBSP}US$ at the rate of 8 September`,
    ],
    [
      "en-gb",
      `about £38.85, PLN${NBSP}195.90 or US$53.31 at the rate of 8 September`,
    ],
    [
      "de",
      `etwa 38,85${NBSP}£, 195,90${NBSP}PLN oder 53,31${NBSP}$ zum Kurs vom 8. September`,
    ],
    [
      "pl",
      `ok. 38,85${NBSP}GBP, 195,90${NBSP}zł lub 53,31${NBSP}USD po kursie z 8 września`,
    ],
  ] as const)("prints the exact line in %s", (locale, expected) => {
    expect(
      equivalentsText(
        render(<ProductCard card={EUR_CARD} locale={locale} />, locale),
      ),
    ).toBe(expected);
  });

  it("prints the native PLN card's line with EUR, GBP and USD", () => {
    expect(
      equivalentsText(
        render(<ProductCard card={PLN_CARD} locale="pl" />, "pl"),
      ),
    ).toBe(
      `ok. 46,63${NBSP}€, 39,47${NBSP}GBP lub 54,15${NBSP}USD po kursie z 8 września`,
    );
  });

  it("keeps the charged price the one prominent amount, unchanged by the line", () => {
    const html = render(<ProductCard card={EUR_CARD} locale="en" />, "en");
    const withoutLine = render(
      <ProductCard
        card={{ ...EUR_CARD, equivalents: undefined } as ProductCardView}
        locale="en"
      />,
      "en",
    );
    // Same amount, same qualifier; the only difference is the added line.
    expect(
      html.replace(
        /<span[^>]*data-fo-price-equivalents[^>]*>[^<]*<\/span>/u,
        "",
      ),
    ).toBe(withoutLine);
    expect(html).toContain("€45.90");
  });

  it("prints no line, and no empty element, when the card carries none (stale rate, fallback)", () => {
    const stale: ProductCardView = { ...EUR_CARD };
    delete stale.equivalents;
    const html = render(<ProductCard card={stale} locale="en" />, "en");
    expect(html).not.toContain("data-fo-price-equivalents");
    expect(html).not.toContain("at the rate of");
  });
});

describe("the view model refuses an equivalents line it must not carry", () => {
  it("refuses the charged currency inside the line (A21 clause 6 (b))", () => {
    const result = ProductCardViewSchema.safeParse({
      ...EUR_CARD,
      equivalents: {
        asOf: "2026-09-08",
        amounts: [{ amountMinor: 4590, currency: "EUR" }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("refuses more than three amounts, an empty line and a repeated currency", () => {
    const amount = { amountMinor: 100, currency: "GBP" } as const;
    for (const amounts of [
      [],
      [amount, amount],
      [
        amount,
        { amountMinor: 1, currency: "PLN" },
        { amountMinor: 1, currency: "USD" },
        { amountMinor: 1, currency: "CHF" },
      ],
    ]) {
      expect(
        ProductCardViewSchema.safeParse({
          ...EUR_CARD,
          equivalents: { asOf: "2026-09-08", amounts },
        }).success,
        JSON.stringify(amounts),
      ).toBe(false);
    }
  });

  it("refuses an equivalents line on a destination-less hub card (spec 008 AC-7)", () => {
    expect(
      HubCardViewSchema.safeParse({
        productId: "FO-BQ-001",
        name: "Amber Hour",
        photo: { kind: "placeholder", slot: "grid" },
        provenance: "ai",
        equivalents: EUR_CARD.equivalents,
      }).success,
    ).toBe(false);
  });
});

describe("equivalentsMessageValues", () => {
  it("names the rate's calendar day in every locale, whatever the server's zone", () => {
    for (const [locale, date] of [
      ["en", "8 September"],
      ["en-gb", "8 September"],
      ["de", "8. September"],
      ["pl", "8 września"],
    ] as const) {
      expect(
        equivalentsMessageValues(
          {
            asOf: "2026-09-08",
            amounts: [{ amountMinor: 1, currency: "GBP" }],
          },
          locale,
        ).date,
      ).toBe(date);
    }
  });
});
