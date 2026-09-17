/**
 * The all-destinations hub: view model, grouping, the two destination states and the data flip
 * (spec 007 §5.3, §6, AC-7, AC-17, AC-20; **T-08**, T-21; TASK-092).
 *
 * Three properties are pinned here, because each is a way the page could lie:
 *
 *  1. **A destination is a link iff its page exists in this locale.** `en`/`en-gb` have seven
 *     authored guides; `de`/`pl` have none (§13 Q1), so the German and Polish hubs render the
 *     same seven destinations as text and link nothing. A link that ignored the locale would be
 *     a link to the router's own 404 (spec 004 AC-14).
 *  2. **The grouping is the founder's 2026-09-15 ruling (b)**, in its order, with the order
 *     *inside* a group coming from `collator(locale)` over the translated names — and a group
 *     with nothing to link to is not rendered at all.
 *  3. **The flip is data.** Unpublishing a country's guide removes its URL and its link from the
 *     hub, the finder and the grid at once, through the same predicate and with no template edit
 *     (AC-7's "a new country is data"; the `git diff --stat src/app` half of T-08 is recorded in
 *     the PR body, because a test cannot prove a diff that was never made).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COUNTRIES, countryRegions } from "../../src/config/countries.ts";
import { isPublished } from "../../src/config/site-links.ts";
import { DestinationsHubPage, hubView } from "../../src/modules/geo/index.ts";
import { loadMessages } from "../../src/modules/i18n/messages.ts";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

/** Every namespace the hub resolves — the page is server-rendered, so it gets the catalogue. */
function render(locale: string): string {
  const messages = loadMessages(locale, [
    "meta",
    "a11y",
    "common",
    "breadcrumb",
    "destinations",
    "destinationsHub",
  ]);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DestinationsHubPage locale={locale} />
    </NextIntlClientProvider>,
  );
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? "");
}

function text(html: string): string {
  return html.replaceAll(/<[^>]+>/g, " ").replaceAll(/\s+/g, " ");
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../../src/config/countries.ts");
});

describe("the hub's view model (AC-20)", () => {
  it("lists every destination in every locale, and links only the ones with a page", () => {
    for (const locale of LOCALES) {
      const view = hubView(locale, (nameKey) => nameKey);
      expect(view.destinations.map((d) => d.iso2).sort(), locale).toEqual(
        COUNTRIES.map((country) => country.iso2).sort(),
      );
      const linked = view.destinations.filter((d) => d.href !== undefined);
      if (locale === "de" || locale === "pl") {
        // §13 Q1: no human has written a German or Polish guide, so there is no page to link.
        expect(linked, locale).toEqual([]);
        expect(view.empty, locale).toBe(true);
        expect(view.regions, locale).toEqual([]);
        expect(view.anyReviewed, locale).toBe(false);
      } else {
        expect(linked.length, locale).toBe(COUNTRIES.length);
        expect(view.empty, locale).toBe(false);
        expect(view.anyReviewed, locale).toBe(true);
      }
    }
  });

  it("groups the destinations the way the founder ruled, in that order", () => {
    const view = hubView("en", (nameKey) => nameKey);
    expect(view.regions.map((region) => region.region)).toEqual([
      ...countryRegions,
    ]);
    const members = (region: string): string[] =>
      view.regions
        .find((candidate) => candidate.region === region)
        ?.destinations.map((destination) => destination.iso2) ?? [];
    expect(members("centralEurope").sort()).toEqual(["DE", "NL", "PL"]);
    expect(members("westernSouthernEurope").sort()).toEqual(["ES", "FR", "IT"]);
    expect(members("southEasternEurope")).toEqual(["RO"]);
  });

  it("orders each group by `collator(locale)` over the reader's own names, not the registry", () => {
    const names: Readonly<Record<string, string>> = {
      "destinations.pl.name": "Polen",
      "destinations.de.name": "Deutschland",
      "destinations.nl.name": "Niederlande",
    };
    const view = hubView("en", (nameKey) => names[nameKey] ?? nameKey);
    const central = view.regions.find(
      (region) => region.region === "centralEurope",
    );
    expect(central?.destinations.map((d) => d.iso2)).toEqual([
      "DE",
      "NL",
      "PL",
    ]);
  });

  it("carries the guide's own authored teaser, and nothing for a destination without one", () => {
    const view = hubView("en", (nameKey) => nameKey);
    const pl = view.destinations.find((d) => d.iso2 === "PL");
    expect(pl?.teaser).toBeTypeOf("string");
    expect((pl?.teaser ?? "").length).toBeGreaterThan(0);
    for (const destination of hubView("de", (nameKey) => nameKey)
      .destinations) {
      expect(destination.teaser, destination.iso2).toBeUndefined();
    }
  });

  it("carries a breadcrumb whose leaf is the hub itself and is never a link", () => {
    const view = hubView("en", (nameKey) => nameKey);
    expect(view.breadcrumb.map((crumb) => crumb.labelKey)).toEqual([
      "common.homeLink",
      "breadcrumb.destinations",
    ]);
    expect(view.breadcrumb[0]?.href).toBe("/en");
    expect(view.breadcrumb[1]?.href).toBeUndefined();
    expect(view.breadcrumb[1]?.current).toBe(true);
  });

  it("publishes the hub's own link id, so the footer and the breadcrumb may link it", () => {
    expect(isPublished("destinations")).toBe(true);
    expect(hubView("pl", (nameKey) => nameKey).path).toBe("/pl/wyslij-kwiaty");
    expect(hubView("de", (nameKey) => nameKey).path).toBe(
      "/de/blumen-verschicken",
    );
  });
});

describe("the hub, rendered (T-08, AC-19, AC-20)", () => {
  it("renders one `h1`, the intro and one region section per group in `en`", () => {
    const html = render("en");
    expect([...html.matchAll(/<h1/g)]).toHaveLength(1);
    expect(text(html)).toContain("Where we can send flowers");
    for (const region of countryRegions) {
      expect(html, region).toContain(`data-fo-hub-region="${region}"`);
    }
    expect([...html.matchAll(/<h2/g)]).toHaveLength(countryRegions.length);
    expect(html).not.toContain("data-fo-hub-empty");
  });

  it("links every destination that has a page, as a real `<a>`", () => {
    const html = render("en");
    for (const country of COUNTRIES) {
      expect(html, country.iso2).toContain(
        `data-fo-hub-destination="${country.iso2}"`,
      );
    }
    expect([...html.matchAll(/data-fo-hub-linked="true"/g)]).toHaveLength(
      COUNTRIES.length,
    );
    for (const href of hrefs(html).filter((href) => href !== "/en")) {
      expect(href).toMatch(/^\/en\/send-flowers-to\/[a-z-]+$/);
    }
  });

  it("renders a destination with no page as text plus one state line, never a link", () => {
    const html = render("de");
    expect(html).toContain("data-fo-hub-empty");
    expect([...html.matchAll(/data-fo-hub-linked="false"/g)]).toHaveLength(
      COUNTRIES.length,
    );
    // The only link on the German hub is the breadcrumb's home crumb.
    expect(hrefs(html)).toEqual(["/de"]);
    expect(text(html)).toContain("We have not written a guide to");
    // No region heading for a group with nothing to link to (§5.3's empty-group state).
    for (const region of countryRegions) {
      expect(html, region).not.toContain(`data-fo-hub-region="${region}"`);
    }
  });

  it("claims nothing: no price, no count, no photo, no featured section", () => {
    for (const locale of LOCALES) {
      const html = render(locale);
      const body = text(html);
      expect(body, locale).not.toMatch(/\d[\d\s.,]*\s?(?:zł|€|£|EUR|PLN|GBP)/u);
      expect(body, locale).not.toMatch(/same[- ]day/iu);
      expect(html, locale).not.toContain("<img");
      expect(html, locale).not.toContain("<input");
      expect(html, locale).not.toContain("<form");
      expect(body, locale).not.toMatch(/featured/iu);
    }
  });
});

describe("a new country is data (AC-7; T-08)", () => {
  it("removes a destination's link everywhere when its guide is unpublished", async () => {
    vi.doMock("../../src/config/countries.ts", async () => {
      const actual = await vi.importActual<
        typeof import("../../src/config/countries.ts")
      >("../../src/config/countries.ts");
      return {
        ...actual,
        // Germany's guide, withdrawn. Poland cannot be withdrawn this way: its registry `status`
        // is `live`, which is the other half of `plan/02` §5.1's existence rule.
        isGuidePublished: (iso2: string) => iso2 !== "DE",
      };
    });

    const { hubView: flipped, listCorridorPages } =
      await import("../../src/modules/geo/index.ts");
    const view = flipped("en", (nameKey) => nameKey);
    const germany = view.destinations.find((d) => d.iso2 === "DE");

    expect(germany).toBeDefined();
    expect(germany?.href).toBeUndefined();
    expect(germany?.teaser).toBeUndefined();
    // The URL is gone from the built set too: one predicate, one answer.
    expect(listCorridorPages().filter((page) => page.iso2 === "DE")).toEqual(
      [],
    );
    // Every other destination is untouched.
    expect(
      view.destinations
        .filter((d) => d.iso2 !== "DE")
        .every((d) => d.href !== undefined),
    ).toBe(true);
  });

  it("puts the link back when the guide is published again, with no template edit", async () => {
    const { hubView: shipped, listCorridorPages } =
      await import("../../src/modules/geo/index.ts");
    const germany = shipped("en", (nameKey) => nameKey).destinations.find(
      (d) => d.iso2 === "DE",
    );
    expect(germany?.href).toBe("/en/send-flowers-to/germany");
    expect(
      listCorridorPages().filter((page) => page.iso2 === "DE").length,
    ).toBeGreaterThan(0);
  });
});
