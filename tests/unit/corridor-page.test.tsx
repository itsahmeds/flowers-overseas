/**
 * The corridor page as markup, in **both** states (spec 007 §5.3, AC-8, AC-19, AC-22, AC-24;
 * T-09, T-23, T-25; TASK-091).
 *
 * `tests/unit/ui-home-sections.test.tsx`'s pattern: `react-dom/server` over the **real**
 * `messages/*.json`, so the asserted copy is the shipped copy. Two properties are provable only
 * here, before a browser is involved:
 *
 *  - **the same template renders both states** — the live markup below comes from the same
 *    component with a view model whose `state` is `live`, and the file contains no second
 *    component and no second code path to compare (AC-8);
 *  - **the guide state claims nothing** — no cutoff, no delivery date, no price, no city, no
 *    florist count and no shop link, asserted over the rendered text rather than over the source
 *    (AC-19).
 *
 * The live view model is a fixture, and it has to be: only Poland has an `operations` block
 * (TASK-124), no `live` content file exists, and no florist has been signed (§13 Q3). That is the
 * point of the seam — the flip is data, and this is what the data produces.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type CorridorView, corridorView } from "../../src/modules/geo";
import { CorridorPage } from "../../src/modules/geo/ui/CorridorPage.tsx";
import { loadMessages } from "../../src/modules/i18n";

const FROM = "2026-09-15";

/** Every namespace a corridor document resolves. */
const NAMESPACES = [
  "corridor",
  "breadcrumb",
  "destinations",
  "catalog",
  "common",
  "a11y",
  "media",
] as const;

function render(node: ReactElement, locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, [...NAMESPACES])}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

function text(html: string): string {
  return html
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll(/\s+/g, " ")
    .trim();
}

const guide = corridorView("PL", "en", { from: FROM });
if (guide === undefined) throw new Error("the en Poland guide must exist");

/** How many questions the committed `en` Poland guide authors (`content/corridors/`). */
const GUIDE_FAQ_ITEMS = 10;

/**
 * The live state, as the flip produces it: a florist is taking our orders, the `operations` block
 * is authored, and spec 005/008 have supplied the two slots this spec does not own.
 */
const live: CorridorView = {
  ...guide,
  state: "live",
  h1: "Send flowers to Poland",
  // The chip follows the corridor state, not `countries.ts`'s label — see `stateKeyOf()`.
  stateKey: "destinations.state.deliveringNow",
  facts: {
    known: true,
    operations: {
      ianaZone: "Europe/Warsaw",
      sameDayCutoffLocal: "14:00",
      deliveryDays: [1, 2, 3, 4, 5, 6],
      sundayDelivery: "peak",
    },
    citiesKey: "destinations.pl.cities",
  },
  liveSlots: {
    fromPrice: "149,00 zł",
    shopEntryHref: "/en/flowers/poland",
  },
};

describe("the guide state (AC-8, AC-19)", () => {
  const html = render(<CorridorPage view={guide} />, "en");
  const body = text(html);

  it("renders one h1, the authored intro and the guide body", () => {
    expect(html.match(/<h1/g) ?? []).toHaveLength(1);
    expect(html).toContain(guide.h1);
    expect(body).toContain(guide.intro.slice(0, 60));
    // The ≥600-word authored guide is on the page: the existence rule guards nothing otherwise.
    expect(body).toContain(guide.body.split("\n")[2]?.slice(0, 40) ?? "!");
  });

  it("states the blanks in words and claims no cutoff, date, price or city", () => {
    expect(body).toContain("no cutoff, because no florist has agreed to one");
    expect(body).toContain("no price on this page");
    expect(body).toMatch(/Nowhere in Poland, today/u);
    // No price, no time of day, no "same-day": the guide claims nothing operational. (The
    // authored prose may *name* a currency — "we settle with our florists in złoty" — which is
    // not a price; what neither may carry is an amount, and `corridor:check` fails the file that
    // writes one.)
    expect(body).not.toMatch(/\b\d{1,2}:\d{2}\b/u);
    expect(body).not.toMatch(/\d[\d\s.,]*\s?(?:zł|€|£|EUR|PLN|GBP)/u);
    expect(body).not.toMatch(/Delivering now/u);
    expect(body).not.toMatch(/same[- ]day/iu);
    expect(body).not.toContain("destinations.pl.cities");
    expect(body).not.toMatch(/Warszawa/u);
  });

  it("renders the FAQ as headings and visible text, with no accordion and no script", () => {
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    // The stated number (TASK-143): the loop and the `<h3>` count below both range over
    // `guide.faq`, so a view that carried no FAQ passed them as zero-vs-zero. The committed `en`
    // Poland guide authors this many questions; a change to it is written here deliberately.
    expect(guide.faq).toHaveLength(GUIDE_FAQ_ITEMS);
    for (const item of guide.faq) {
      expect(body).toContain(item.q);
      expect(body).toContain(item.a.slice(0, 40));
    }
    expect(html.match(/<h3/g) ?? []).toHaveLength(GUIDE_FAQ_ITEMS);
  });

  it("renders the calendar as a captioned table with formatted dates and the rule", () => {
    expect(html).toContain("<caption");
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    // `formatDate(..., "calendarDate")` in `en`: weekday, day, month name and year.
    expect(body).toMatch(/Sunday, 1 November 2026/u);
    expect(body).toContain("easter_offset");
    // The undated line, never a row with a guessed date.
    expect(body).toContain("Also kept here, with no date of its own");
  });

  it("marks the breadcrumb leaf and links the hub crumb now that the hub exists", () => {
    expect(html).toContain('aria-current="page"');
    // TASK-092 shipped `/{locale}/{destinations}` and published its link id, so the middle crumb
    // is a link — from the same view model, with no edit to the breadcrumb component.
    expect(html).toContain('href="/en/send-flowers-to"');
  });

  it("renders no shop entry while nothing is published", () => {
    expect(html).not.toContain("data-fo-corridor-shop");
  });
});

describe("the live state, through the same template (AC-8)", () => {
  const html = render(<CorridorPage view={live} />, "en");
  const body = text(html);

  it("prints the cutoff with its zone, the delivery days and the cities", () => {
    expect(body).toContain("14:00 in Europe/Warsaw");
    expect(body).toContain("Monday");
    expect(body).toContain("Saturday");
    expect(body).toContain("Warszawa");
  });

  it("prints the from-price and the shop entry, both supplied by their owning specs", () => {
    expect(body).toContain("149,00 zł");
    expect(html).toContain("data-fo-corridor-shop");
    expect(html).toContain('href="/en/flowers/poland"');
  });

  it("uses the imperative h1 and the delivering chip", () => {
    expect(body).toContain("Send flowers to Poland");
    expect(body).toContain("Delivering now");
  });

  it("keeps every block the guide state has — one template, no second page", () => {
    for (const marker of [
      "data-fo-corridor-facts",
      "data-fo-corridor-steps",
      "data-fo-corridor-guide",
      "data-fo-corridor-calendar",
      "data-fo-corridor-flowers",
      "data-fo-corridor-coverage",
      "data-fo-corridor-faq",
    ]) {
      expect(html).toContain(marker);
    }
  });
});

describe("the other locale and the empty branches", () => {
  it("renders the en-gb guide from its own corpus file", () => {
    const uk = corridorView("PL", "en-gb", { from: FROM });
    if (uk === undefined) throw new Error("the en-gb Poland guide must exist");
    const body = text(render(<CorridorPage view={uk} />, "en-gb"));
    expect(body).toContain(uk.h1);
    expect(body).not.toContain(guide.faq[0]?.a ?? "");
  });

  it("renders no calendar block at all for a destination with no occasion rows", () => {
    const html = render(
      <CorridorPage
        view={{ ...guide, occasions: undefined, undatedOccasions: undefined }}
      />,
      "en",
    );
    expect(html).not.toContain("data-fo-corridor-calendar");
    expect(html).not.toContain("<caption");
  });

  it("renders no related row at all when no target has a page here", () => {
    const html = render(
      <CorridorPage view={{ ...guide, related: undefined }} />,
      "en",
    );
    expect(html).not.toContain("data-fo-corridor-related");
  });
});
