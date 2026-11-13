/**
 * The client `formatMoney` (`src/modules/i18n/client.ts`; TASK-522): its two mirrors equal their
 * authored sources, it renders exactly what the barrel's `formatMoney` renders, and it refuses
 * what the barrel refuses. Its import graph (no zod, no locale registry) is
 * `tests/unit/client-message-graph.test.ts`'s.
 */
import { describe, expect, it } from "vitest";

import { CURRENCY_EXPONENTS_CLIENT } from "../../src/config/currencies-client.data.ts";
import { CURRENCIES } from "../../src/config/currencies.ts";
import { FORMATTING_TAGS_CLIENT } from "../../src/config/locales-client.data.ts";
import { launchLocales, localeConfig } from "../../src/config/locales.ts";
import { formatMoney as clientFormatMoney } from "../../src/modules/i18n/client.ts";
import { formatMoney } from "../../src/modules/i18n/index.ts";

describe("the client money formatter's mirrors", () => {
  it("carries every currency's exponent, as `currencies.ts` authors it", () => {
    expect(CURRENCY_EXPONENTS_CLIENT).toEqual(
      Object.fromEntries(
        CURRENCIES.map((currency) => [
          currency.code,
          currency.minorUnitExponent,
        ]),
      ),
    );
  });

  it("carries every launch locale's formatting tag, as `locales.data.ts` authors it", () => {
    expect(FORMATTING_TAGS_CLIENT).toEqual(
      Object.fromEntries(
        launchLocales.map((code) => [code, localeConfig(code).formattingTag]),
      ),
    );
  });
});

describe("the client formatMoney renders what the barrel renders", () => {
  const amounts = [0, 1, 4590, -1250, 123_456_789];
  for (const locale of launchLocales) {
    for (const currency of Object.keys(CURRENCY_EXPONENTS_CLIENT)) {
      it(`${locale} ${currency}`, () => {
        for (const amountMinor of amounts) {
          const money = { amountMinor, currency } as Parameters<
            typeof formatMoney
          >[0];
          expect(clientFormatMoney({ amountMinor, currency }, locale)).toBe(
            formatMoney(money, locale),
          );
          expect(
            clientFormatMoney({ amountMinor, currency }, locale, {
              withIsoCode: true,
              signDisplay: "always",
            }),
          ).toBe(
            formatMoney(money, locale, {
              withIsoCode: true,
              signDisplay: "always",
            }),
          );
        }
      });
    }
  }

  it("refuses a fractional amount, an unknown currency and an unknown locale", () => {
    expect(() =>
      clientFormatMoney({ amountMinor: 45.9, currency: "EUR" }, "en"),
    ).toThrow();
    expect(() =>
      clientFormatMoney({ amountMinor: 4590, currency: "XXX" }, "en"),
    ).toThrow();
    expect(() =>
      clientFormatMoney({ amountMinor: 4590, currency: "EUR" }, "fr"),
    ).toThrow();
  });
});
