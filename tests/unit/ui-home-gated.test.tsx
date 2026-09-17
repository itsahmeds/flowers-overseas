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
import { TRENDING_PICKS } from "../../src/config/trending.ts";
import { loadMessages } from "../../src/modules/i18n";
import { DestinationsGrid } from "../../src/modules/ui/home/DestinationsGrid.tsx";
import { ReviewsSection } from "../../src/modules/ui/home/ReviewsSection.tsx";
import { TrendingRow } from "../../src/modules/ui/home/TrendingRow.tsx";
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
import {
  emptyTrendingProvider,
  staticTrendingProvider,
  trendingProviderOf,
  withTrendingProvider,
} from "../../src/modules/ui/home/trending-provider.ts";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

const NAMESPACES = [
  "home",
  "finder",
  "destinations",
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

/**
 * The founder's sentence, verbatim from `docs/design/homepage-v1/homepage-desktop.dc.html` — the
 * design source of truth, and first person as spec 004 §14 A5 requires ("our florists' own
 * picks"). The shipped key adds the closing full stop the artboard's sentence carries into the
 * paragraph, so the assertion is `toContain` (`/review 58` required change 1).
 */
const VERBATIM_BASIS =
  "Ranking is by real orders in the last 7 days and switches on once we have them; until then this row shows our florists' own picks and says so";

describe("the trending row is gated on real orders", () => {
  it("renders the five florists' picks by name, with no price element of any kind", () => {
    const html = render(<TrendingRow />, "en");
    const rendered = text(html);

    expect([...html.matchAll(/<li/g)]).toHaveLength(TRENDING_PICKS.length);
    for (const fragment of ["Trending now", "Most sent this week"]) {
      expect(rendered, fragment).toContain(fragment);
    }
    // Spec §3/§8: nothing here knows what a product is and no price is rendered — not a figure,
    // not a "starting at", not a currency symbol, not the canvas's grey price bar.
    expect(rendered).not.toMatch(/starting at|from\s*€|€|zł|£|\bfrom \d/iu);
    expect(html).not.toContain("data-fo-price");
  });

  it("carries the founder's verbatim label while the basis is the florists' picks", () => {
    const html = render(<TrendingRow />, "en");

    expect(html).toContain('data-fo-trending-basis="picks"');
    expect(text(html)).toContain(VERBATIM_BASIS);
  });

  it("drops the label the moment the ranking is real, with no call-site change", () => {
    const ranked = trendingProviderOf(
      [{ id: "one", name: "Amber Hour" }],
      "orders",
    );
    const html = render(<TrendingRow provider={ranked} />, "en");

    expect(html).toContain('data-fo-trending-basis="orders"');
    // The sentence is only true while the row is picks; a ranked row must not keep claiming it.
    expect(text(html)).not.toContain(VERBATIM_BASIS);
    expect(text(html)).toContain("Amber Hour");
  });

  it("renders no section at all when the provider answers with nothing", () => {
    expect(render(<TrendingRow provider={emptyTrendingProvider} />, "en")).toBe(
      "",
    );
  });

  it("links nothing and shows no `<img>`, one photo placeholder per pick (AC-14)", () => {
    const html = render(<TrendingRow />, "en");

    expect(hrefs(html)).toEqual([]);
    expect(html).not.toContain("<img");
    expect([...html.matchAll(/data-fo-media-slot="grid"/g)]).toHaveLength(
      TRENDING_PICKS.length,
    );
  });

  it("takes its names from the committed catalogue, so none of them is invented", () => {
    const rendered = text(render(<TrendingRow />, "en"));
    for (const pick of staticTrendingProvider.list()) {
      expect(rendered, pick.name).toContain(pick.name);
    }
    expect(staticTrendingProvider.basis()).toBe("picks");
  });

  it("swaps at the composition root: the module-level provider changes the output", async () => {
    const before = render(<TrendingRow />, "en");
    const after = await withTrendingProvider(emptyTrendingProvider, () =>
      render(<TrendingRow />, "en"),
    );
    const restored = render(<TrendingRow />, "en");

    expect(before).not.toBe("");
    expect(after).toBe("");
    expect(restored).toBe(before);
  });
});

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
    expect(rendered).toContain("Delivering now");
    expect(rendered).toContain("Guide · not delivering yet");
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

  it("names Poland's five cities and no city anywhere else (plan/10 §3)", () => {
    const rendered = text(grid("en"));

    expect(rendered).toContain("Warszawa · Kraków · Wrocław · Gdańsk · Poznań");
    // A city line exists exactly once, because exactly one destination is `live`.
    expect(
      [...grid("en").matchAll(/Warszawa/g)],
      "one city line only",
    ).toHaveLength(1);
    for (const city of ["Berlin", "Paris", "Madrid", "Rome", "Amsterdam"]) {
      expect(rendered, city).not.toContain(city);
    }
  });

  it("puts the delivering destination first and collates the rest per locale", () => {
    const order = (locale: string): string[] =>
      [...grid(locale).matchAll(/data-fo-destination="([A-Z]{2})"/g)].map(
        (match) => match[1] ?? "",
      );

    expect(order("en")[0]).toBe("PL");
    expect(order("pl")[0]).toBe("PL");
    // The six guides are collated, not registry-ordered (which is DE, FR, ES, IT, RO, NL).
    expect(order("en").slice(1)).toEqual(["FR", "DE", "IT", "NL", "RO", "ES"]);
    expect(order("en")).toHaveLength(COUNTRIES.length);
  });

  it("ships the artboard's copy-only 'Somewhere else?' cell with no input at all", () => {
    const html = grid("en");

    expect(html).toContain("data-fo-destinations-elsewhere");
    expect(text(html)).toContain("Somewhere else?");
    // A waiting-list capture is a new personal-data flow (010/016 own it); an inert field would
    // be a dark pattern, so there is no field, no button and nothing to submit.
    for (const tag of ["<input", "<form", "<button", "<select", "<textarea"]) {
      expect(html, tag).not.toContain(tag);
    }
  });

  it("inherits the finder's `destinations` id, so `Continue` still lands somewhere", () => {
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
