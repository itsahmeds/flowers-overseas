/**
 * The locale home's three **data-gated** sections and their provider seams (spec 004 §13's
 * 2026-09-08 resolution note, §3, §5.1, §8, **AC-11**, **AC-14**, **AC-15**; TASK-054).
 *
 * The gating is the deliverable, so it is what is asserted: for each section, the branch that
 * ships today, the branch a **fake provider** reaches, and the fact that swapping the provider
 * changes the rendered output with **no change at the call site** — the property spec 002/008/016
 * depend on. `tests/unit/ui-home-sections.test.tsx`'s harness, for the same reason: rendered with
 * `react-dom/server` against the real `messages/*.json`, so the asserted copy is the shipped copy.
 *
 * Two module-level swaps are exercised through `with*Provider()` (the injection hook that is
 * deliberately not exported from the barrel) rather than through the `provider` prop, because the
 * prop proves the component renders and the hook proves the **composition root** is the only
 * thing a later spec has to touch.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { COUNTRIES } from "../../src/config/countries.ts";
import { withActivePartnersProvider } from "../../src/modules/geo/partners.ts";
import { loadMessages } from "../../src/modules/i18n";
import { DestinationsGrid } from "../../src/modules/ui/home/DestinationsGrid.tsx";
import { ReviewsSection } from "../../src/modules/ui/home/ReviewsSection.tsx";
import {
  destinationStatusProviderOf,
  staticDestinationStatusProvider,
  withDestinationStatusProvider,
} from "../../src/modules/ui/home/destination-status-provider.ts";
import {
  reviewsProviderOf,
  staticReviewsProvider,
  withReviewsProvider,
} from "../../src/modules/ui/home/reviews-provider.ts";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

const NAMESPACES = [
  "home",
  "finder",
  "destinations",
  "destinationsHub",
  "nav",
  "media",
  "a11y",
  "common",
] as const;

function render(node: React.ReactElement, locale: string): string {
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

/** The visible text of the rendered markup: tags stripped, entities decoded. */
function text(html: string): string {
  return html
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll(/\s+/g, " ");
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? "");
}

describe("the verified-reviews section renders nothing until a review exists", () => {
  it("renders nothing in every locale with the shipped provider (AC-15)", () => {
    for (const locale of LOCALES) {
      expect(render(<ReviewsSection locale={locale} />, locale), locale).toBe(
        "",
      );
    }
    expect(staticReviewsProvider.list()).toEqual([]);
  });

  it("renders the artboard's band once a provider answers with real reviews", () => {
    const provider = reviewsProviderOf([
      {
        id: "r1",
        body: "Fixture text, not a review.",
        authorFirstName: "Fixture",
        place: "Warszawa",
        date: "2026-09-01",
        kind: "order",
      },
    ]);
    const html = render(
      <ReviewsSection locale="en" provider={provider} />,
      "en",
    );
    const rendered = text(html);

    expect(rendered).toContain("What buyers and recipients say");
    expect(rendered).toContain("Fixture · sent to Warszawa · 01/09/2026");
    expect(rendered).toContain("verified order");
    // The Trustpilot slot is a *named region with nothing in it*: no score, no logo, no script.
    expect(html).toContain("data-fo-reviews-trustpilot");
    expect(html).toContain('role="region"');
    expect(rendered).not.toMatch(/\d(?:[.,]\d)?\s*(?:\/|out of)\s*5\b/u);
    // No star row, no rating widget and no third-party mark in the markup.
    expect(html).not.toMatch(/★|⭐|itemprop="ratingValue"/u);
  });

  it("never renders the canvas's placeholder attribution rows", () => {
    const html = render(<ReviewsSection locale="en" />, "en");
    expect(html).not.toContain("[Buyer first name]");
    expect(html).not.toContain("[date]");
  });

  it("swaps at the composition root, with no call-site change", async () => {
    const populated = await withReviewsProvider(
      reviewsProviderOf([
        {
          id: "r1",
          body: "Fixture text, not a review.",
          authorFirstName: "Fixture",
          place: "Kraków",
          date: "2026-09-02",
          kind: "delivery",
        },
      ]),
      () => render(<ReviewsSection locale="en" />, "en"),
    );

    expect(populated).not.toBe("");
    expect(text(populated)).toContain("verified delivery");
    // Restored: the page is back to rendering nothing.
    expect(render(<ReviewsSection locale="en" />, "en")).toBe("");
  });
});

describe("the destinations grid", () => {
  const grid = (locale: string): string =>
    render(<DestinationsGrid locale={locale} />, locale);

  it("names all seven destinations with their state word (AC-14, spec 007 AC-20)", () => {
    const html = grid("en");
    const rendered = text(html);

    for (const country of COUNTRIES) {
      expect(html, country.iso2).toContain(
        `data-fo-destination="${country.iso2}"`,
      );
    }
    // PR 174 item 6: nobody can order yet (no florist signed), so no chip claims delivery.
    expect(rendered).not.toContain("Delivering now");
    expect(rendered.split("Guide · not delivering yet")).toHaveLength(
      COUNTRIES.length + 1,
    );
    // TASK-092 published the seven corridor targets: every destination whose guide exists in
    // this locale is a link, from the same loop and with no markup change (spec 007 AC-20).
    expect(hrefs(html).length).toBe(COUNTRIES.length);
    for (const href of hrefs(html)) {
      expect(href).toMatch(/^\/en\/send-flowers-to\/[a-z-]+$/);
    }
  });

  it("links nothing in a locale with no authored guide (spec 007 §13 Q1, AC-17)", () => {
    // `/de` and `/pl` have no corridor page, so every destination is text — the same component,
    // the same DOM shape, one element different.
    for (const locale of ["de", "pl"]) {
      const html = grid(locale);
      expect(hrefs(html), locale).toEqual([]);
      for (const country of COUNTRIES) {
        expect(html, `${locale}/${country.iso2}`).toContain(
          `data-fo-destination="${country.iso2}"`,
        );
      }
    }
  });

  it("names no city at all: the v2 chips claim no coverage (plan/10 §3)", () => {
    const rendered = text(grid("en"));

    // The opening rule is stated as a rule, not as a fact Poland already meets (2026-10-04).
    expect(rendered).toContain(
      "We open one country at a time, and only when we can promise the same flowers and the same care.",
    );
    expect(rendered).not.toContain("met enough florists");

    for (const city of ["Warszawa", "Kraków", "Berlin", "Paris", "Madrid"]) {
      expect(rendered, city).not.toContain(city);
    }
  });

  it("lists every destination in the one country order, no destination first (AC-73; TASK-387)", () => {
    const order = (locale: string): string[] =>
      [...grid(locale).matchAll(/data-fo-destination="([A-Z]{2})"/g)].map(
        (match) => match[1] ?? "",
      );

    // Every `sortWeight` is 0 today, so the names' collation decides: no "Poland first".
    expect(order("en")).toEqual(["FR", "DE", "IT", "NL", "PL", "RO", "ES"]);
    expect(order("en")).toHaveLength(COUNTRIES.length);
  });

  it("links Poland's chip to its guide, like every other (R2)", () => {
    const html = render(<DestinationsGrid locale="en" />, "en");
    const poland = html.slice(html.indexOf('data-fo-destination="PL"'));

    // plan/02 §11, spec 004 Q11/A2: the chip feeds the guide, which links the shop root.
    // Neutral, not poppy, until delivery dates open (PR 174 item 6); still first, still linked.
    expect(poland.slice(0, poland.indexOf("</li>"))).toMatch(
      /<a class="(?![^"]*bg-accent)[^"]*" href="\/en\/send-flowers-to\/poland">Poland/u,
    );
    expect(html).not.toContain('href="/en/poland/flowers"');
    // All seven chips go to their guides, and nothing on the section asks for input.
    expect(
      hrefs(html).filter((href) => href.includes("send-flowers-to")),
    ).toHaveLength(7);
    for (const tag of ["<input", "<form", "<button", "<select", "<textarea"]) {
      expect(html, tag).not.toContain(tag);
    }
  });

  it("links no chip where no guide exists in the locale: no destination's shop root stands in (AC-73)", () => {
    const html = render(<DestinationsGrid locale="de" />, "de");
    // `/de` has no guides (spec 007 §13 Q1), and the Poland special case left with TASK-387.
    expect(hrefs(html)).toEqual([]);
  });

  /**
   * The day a florist is signed (PR 174 breaker round 3, hole 3): the same grid, with Poland's
   * delivery dates open through the partners seam, claims delivery for Poland — the poppy chip and
   * the reviewed "Delivering now" word, once — and for nobody else. The other half of item 6's pin:
   * a claim that can never render is no better than one that always does.
   */
  it("claims delivery for Poland alone, in word and tone, once a florist is signed", async () => {
    const html = await withActivePartnersProvider(
      { hasActivePartners: (iso2) => iso2 === "PL" },
      () => grid("en"),
    );
    const item = (iso2: string): string => {
      const start = html.indexOf(`data-fo-destination="${iso2}"`);
      return html.slice(start, html.indexOf("</li>", start));
    };

    expect(item("PL")).toMatch(/<a class="[^"]*\bbg-accent\b[^"]*"/u);
    expect(item("PL")).toMatch(/class="[^"]*\btext-on-accent\b[^"]*"/u);
    expect(text(item("PL"))).toContain("Delivering now");
    expect(text(html).split("Delivering now")).toHaveLength(2);
    const others = COUNTRIES.filter((country) => country.iso2 !== "PL");
    expect(others).toHaveLength(6);
    for (const country of others) {
      expect(text(item(country.iso2)), country.iso2).toContain(
        "Guide · not delivering yet",
      );
      expect(item(country.iso2), country.iso2).not.toContain("bg-accent");
    }
  });

  it('keeps the `destinations` id, the home\'s anchor for every "where" question', () => {
    expect(grid("en")).toContain('id="destinations"');
  });

  it("renders the published destination as a link, from the same loop (AC-11)", () => {
    const provider = destinationStatusProviderOf(COUNTRIES, (iso2) =>
      iso2 === "PL" ? "/en/send-flowers-to/poland" : undefined,
    );
    const html = render(
      <DestinationsGrid locale="en" provider={provider} />,
      "en",
    );

    expect(hrefs(html)).toEqual(["/en/send-flowers-to/poland"]);
    expect(html).toContain('data-fo-destination="DE"');
  });

  it("swaps at the composition root, with no call-site change", async () => {
    const published = await withDestinationStatusProvider(
      destinationStatusProviderOf(COUNTRIES, (iso2) =>
        iso2 === "PL" ? "/en/send-flowers-to/poland" : undefined,
      ),
      () => grid("en"),
    );

    expect(hrefs(published)).toEqual(["/en/send-flowers-to/poland"]);
    // Restored: the shipped provider answers from the registry again — seven links in `en`, none
    // in `de`, which is the existence rule and not a second flag.
    expect(hrefs(grid("en")).length).toBe(COUNTRIES.length);
    expect(
      staticDestinationStatusProvider
        .list("de", (key) => key)
        .filter((destination) => destination.href !== undefined),
    ).toEqual([]);
  });
});
