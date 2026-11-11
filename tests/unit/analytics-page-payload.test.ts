/**
 * Spec 023 TASK-492, the server half of the GA4 client: the location sanitiser (T-07 / AC-7) and
 * the page payloads built from the view models (T-08 / AC-8, T-09 / AC-9, T-11 / AC-11, T-14 /
 * AC-14), with the no-PII scan of T-17 / AC-17 over every payload built here.
 */
import { describe, expect, it } from "vitest";

import {
  ClientEventSchema,
  checkoutPagePayload,
  isPrivateLocation,
  listingPagePayload,
  PageAnalyticsSchema,
  productPagePayload,
  sanitisePageLocation,
  sanitiseReferrer,
} from "../../src/modules/analytics";
import { Ga4ItemSchema } from "../../src/modules/analytics/items";
import type {
  Ga4ProductFacts,
  ListingView,
  ProductView,
} from "../../src/modules/catalog";
import type { StepScreen } from "../../src/modules/checkout";

const ORIGIN = "https://staging.flowersoverseas.com";

describe("sanitisePageLocation (AC-7)", () => {
  it.each([
    [`${ORIGIN}/en-gb/track/abcDEF123456`, `${ORIGIN}/en-gb/track/:token`],
    [
      `${ORIGIN}/en-gb/track/abcDEF123456/photo`,
      `${ORIGIN}/en-gb/track/:token/photo`,
    ],
    [`${ORIGIN}/r/ZX81`, `${ORIGIN}/r/:code`],
    [`${ORIGIN}/pl/basket/restore/tok-1`, `${ORIGIN}/pl/basket/restore/:token`],
    [
      `${ORIGIN}/en/account/orders/FO-2026-0001`,
      `${ORIGIN}/en/account/orders/:reference`,
    ],
    [
      `${ORIGIN}/en-gb/checkout?step=card&utm_source=x&email=a@b.c`,
      `${ORIGIN}/en-gb/checkout?step=card&utm_source=x`,
    ],
    [`${ORIGIN}/en/-search?q=Anna+Kowalska`, `${ORIGIN}/en/-search`],
    [`${ORIGIN}/en/poland#top`, `${ORIGIN}/en/poland`],
  ])("%s", (url, expected) => {
    expect(sanitisePageLocation(url)).toBe(expected);
  });

  it("drops `email` and keeps the five campaign keys", () => {
    const sent = sanitisePageLocation(
      `${ORIGIN}/en?utm_medium=m&utm_campaign=c&utm_term=t&utm_content=k&email=a@b.c&t=secret`,
    );
    expect(sent).toBe(
      `${ORIGIN}/en?utm_medium=m&utm_campaign=c&utm_term=t&utm_content=k`,
    );
    expect(sent).not.toContain("a@b.c");
    expect(sent).not.toContain("secret");
  });

  it("marks only private routes as private (their title becomes the page type)", () => {
    expect(isPrivateLocation(`${ORIGIN}/en-gb/track/abc`)).toBe(true);
    expect(isPrivateLocation(`${ORIGIN}/en-gb/poland`)).toBe(false);
  });

  it("sanitises a same-origin referrer and keeps a cross-origin one", () => {
    expect(sanitiseReferrer(`${ORIGIN}/en-gb/track/abc?email=x`, ORIGIN)).toBe(
      `${ORIGIN}/en-gb/track/:token`,
    );
    expect(sanitiseReferrer("https://www.google.com/", ORIGIN)).toBe(
      "https://www.google.com/",
    );
    expect(sanitiseReferrer("", ORIGIN)).toBe("");
  });
});

const gbp = (amountMinor: number) => ({ amountMinor, currency: "GBP" });

function card(index: number, amountMinor: number) {
  return {
    productId: `FO-BQ-${String(index).padStart(3, "0")}`,
    price: gbp(amountMinor),
  };
}

function factsFor(skus: readonly string[]): Map<string, Ga4ProductFacts> {
  return new Map(
    skus.map((sku) => [
      sku,
      { sku, enName: `Bouquet ${sku}`, categoryKey: "roses" },
    ]),
  );
}

describe("listingPagePayload (AC-8, AC-9)", () => {
  const cards = Array.from({ length: 50 }, (_, index) =>
    card(index + 1, 4500 + index),
  );
  const view = {
    pageType: "countryCategory",
    locale: "en-gb",
    country: { iso2: "pl", orderingOpen: true },
    entity: { kind: "category", key: "roses" },
    items: cards,
  } as unknown as ListingView;
  const payload = listingPagePayload(
    view,
    factsFor(cards.map((c) => c.productId)),
  );

  it("carries the common set from the view model, country upper case", () => {
    expect(payload.common).toEqual({
      locale: "en-gb",
      page_type: "country_category",
      destination_country: "PL",
      country_status: "live",
      display_currency: "GBP",
    });
    expect(PageAnalyticsSchema.parse(payload)).toEqual(payload);
  });

  it("lists min(N, 48) items in rendered order, index 0 to 47, each a valid item", () => {
    const list = payload.events?.[0];
    expect(list?.name).toBe("view_item_list");
    if (list?.name !== "view_item_list") return;
    expect(list.params.item_list_id).toBe("PL:category:roses");
    expect(list.params.item_list_name).toBe("PL:category:roses");
    expect(list.params.items).toHaveLength(48);
    list.params.items.forEach((item, index) => {
      expect(item.index).toBe(index);
      expect(item.item_id).toBe(cards[index]?.productId);
      expect(Ga4ItemSchema.parse(item)).toEqual(item);
    });
    expect(list.params.items[2]?.price).toBe(45.02);
  });

  it("says `demo` where ordering is not open", () => {
    const demo = listingPagePayload(
      {
        ...view,
        country: { iso2: "pl", orderingOpen: false },
      } as unknown as ListingView,
      factsFor([]),
    );
    expect(demo.common.country_status).toBe("demo");
  });
});

function productView(defaultMinor: number) {
  return {
    locale: "pl",
    country: { iso2: "pl" },
    product: { sku: "FO-BQ-023" },
    tiers: [
      { tierKey: "s12", price: gbp(defaultMinor) },
      { tierKey: "s24", price: gbp(7900) },
    ],
    selectedTierKey: "s12",
    delivery: { state: "live", timeZone: "Europe/Warsaw" },
  } as unknown as ProductView;
}

describe("productPagePayload (AC-8, AC-11)", () => {
  const fact = { sku: "FO-BQ-023", enName: "Red roses", categoryKey: "roses" };

  it.each([
    [4500, 45],
    [4599, 45.99],
  ])(
    "shows %i minor units as value %d, on the item and the event",
    (minor, value) => {
      const payload = productPagePayload(
        productView(minor),
        fact,
        "2026-11-08",
      );
      const event = payload.events?.[0];
      expect(event?.name).toBe("view_item");
      if (event?.name !== "view_item") return;
      expect(event.params.currency).toBe("GBP");
      expect(event.params.value).toBe(value);
      expect(event.params.items[0].price).toBe(value);
      expect(event.params.items[0].item_variant).toBe("s12");
      expect(event.params.items[0].item_id).toBe("FO-BQ-023");
      expect(payload.tiers?.["s24"]?.price).toBe(79);
      expect(payload.today).toBe("2026-11-08");
      expect(payload.common).toEqual({
        locale: "pl",
        page_type: "product",
        destination_country: "PL",
        country_status: "live",
        display_currency: "GBP",
      });
    },
  );
});

function screen(
  step: StepScreen["step"],
  mode: StepScreen["mode"],
): StepScreen {
  return {
    kind: "step",
    step,
    mode,
    locale: "en-gb",
    line: 1,
    total: gbp(5300),
    calendar: [{ date: "2026-11-10", surcharge: gbp(500) }],
    lines: [
      {
        sku: "FO-BQ-023",
        countryIso: "PL",
        deliveryDate: "2026-11-10",
        totals: {
          lines: [
            {
              kind: "product",
              sku: "FO-BQ-023",
              tierKey: "s12",
              amount: gbp(5000),
            },
            { kind: "addon", addonKey: "chocolates", amount: gbp(300) },
          ],
        },
      },
    ],
  } as unknown as StepScreen;
}

const context = {
  facts: factsFor(["FO-BQ-023"]),
  addonNames: new Map([["chocolates", "Chocolates"]]),
  live: true,
  today: "2026-11-08",
};

describe("checkoutPagePayload (AC-14, §14 A-orchestrator-2026-10-25)", () => {
  const sum = (items: readonly { price: number; quantity: number }[]): number =>
    items.reduce(
      (total, item) => total + Math.round(item.price * 100) * item.quantity,
      0,
    );

  it("step 1 sends `begin_checkout` with `checkout_channel: checkout` and the quote", () => {
    const event = checkoutPagePayload(screen("recipient", "test"), context)
      .events?.[0];
    expect(event?.name).toBe("begin_checkout");
    if (event?.name !== "begin_checkout") return;
    expect(event.params.checkout_channel).toBe("checkout");
    expect(event.params.value).toBe(53);
    expect(event.params.currency).toBe("GBP");
    expect(sum(event.params.items)).toBe(5300);
  });

  it("step 2 sends `add_shipping_info` with the surcharge tier and days ahead", () => {
    const event = checkoutPagePayload(screen("card", "live"), context)
      .events?.[0];
    expect(event?.name).toBe("add_shipping_info");
    if (event?.name !== "add_shipping_info") return;
    expect(event.params.shipping_tier).toBe("surcharge");
    expect(event.params.days_ahead).toBe(2);
    expect(event.params.value).toBe(53);
  });

  it("step 3 sends nothing; step 4 carries the quote Pay extends", () => {
    const details = checkoutPagePayload(screen("details", "test"), context);
    expect(details.events).toBeUndefined();
    expect(details.checkout).toBeUndefined();
    const review = checkoutPagePayload(screen("review", "test"), context);
    expect(review.events).toBeUndefined();
    expect(review.checkout?.value).toBe(53);
    expect(sum(review.checkout?.items ?? [])).toBe(5300);
  });

  it("`demo` carries no checkout event and no quote on any step", () => {
    for (const step of ["recipient", "card", "details", "review"] as const) {
      const payload = checkoutPagePayload(screen(step, "demo"), context);
      expect(payload.events, step).toBeUndefined();
      expect(payload.checkout, step).toBeUndefined();
    }
  });

  it("every event, merged with the common set, parses as a client event", () => {
    for (const step of ["recipient", "card"] as const) {
      const payload = checkoutPagePayload(screen(step, "test"), context);
      for (const event of payload.events ?? []) {
        expect(
          ClientEventSchema.safeParse({
            name: event.name,
            params: { ...event.params, ...payload.common },
          }).success,
        ).toBe(true);
      }
    }
  });
});

describe("no personal value in any payload (AC-17)", () => {
  it("carries no recipient, buyer, token, order or florist field", () => {
    const text = JSON.stringify([
      checkoutPagePayload(screen("card", "test"), context),
      checkoutPagePayload(screen("review", "test"), context),
      productPagePayload(productView(4500), {
        sku: "FO-BQ-023",
        enName: "Red roses",
        categoryKey: "roses",
      }),
    ]);
    for (const forbidden of [
      "2026-11-10",
      "FO-2026",
      "recipient",
      "email",
      "user_id",
      "user_data",
      "ip_override",
      "florist",
      "partner",
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
  });
});
