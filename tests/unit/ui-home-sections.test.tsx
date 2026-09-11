/**
 * The locale home's five lower sections (spec 004 §2 "Locale-home skeleton" and "Trust strip",
 * §13's 2026-09-08 resolution note, design round 6, §14 A5, **AC-10**, AC-14, **AC-15**,
 * **AC-16**; TASK-053).
 *
 * Rendered with `react-dom/server` against the **real** `messages/*.json` through the provider the
 * document layout uses — `tests/unit/ui-home.test.tsx`'s pattern — so the asserted copy is the
 * shipped copy. What is here is every property that is a fact about the markup: the sections'
 * structure, the honesty rules that can only be checked by looking at what renders, and both
 * branches of the `published` flag spec 008 will flip. Layout at the two artboard geometries, the
 * four locales in a browser and axe are the e2e, visual and a11y files'.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { OCCASION_DATES, OCCASION_TILES } from "../../src/config/occasions.ts";
import { loadMessages } from "../../src/modules/i18n";
import { HomeFaq, FAQ_ENTRIES } from "../../src/modules/ui/home/HomeFaq.tsx";
import {
  HOW_IT_WORKS_STEPS,
  HowItWorks,
} from "../../src/modules/ui/home/HowItWorks.tsx";
import { OccasionDates } from "../../src/modules/ui/home/OccasionDates.tsx";
import { OccasionTiles } from "../../src/modules/ui/home/OccasionTiles.tsx";
import {
  TRUST_CLAIMS,
  TrustStrip,
} from "../../src/modules/ui/trust/TrustStrip.tsx";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

/** The namespaces these five sections read. */
const NAMESPACES = [
  "home",
  "faq",
  "trust",
  "occasions",
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

const tiles = (locale: string): string =>
  render(<OccasionTiles locale={locale} />, locale);
const dates = (locale: string): string =>
  render(<OccasionDates locale={locale} />, locale);
const explainer = (locale: string): string => render(<HowItWorks />, locale);
const faq = (locale: string): string => render(<HomeFaq />, locale);
const trust = (locale: string): string => render(<TrustStrip />, locale);

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../../src/config/occasions.ts");
});

describe("the occasion tiles", () => {
  it("renders the artboards' six tiles with their names and subtitles", () => {
    const html = tiles("en");
    const rendered = text(html);

    expect([...html.matchAll(/<li/g)]).toHaveLength(OCCASION_TILES.length);
    for (const fragment of [
      "Shop by occasion",
      "What is the occasion?",
      "Birthday",
      "Any day of the year",
      "Name day",
      // The line that explains the Polish tradition a German buyer is here for.
      "Imieniny, the Polish tradition",
      "Anniversary",
      "Sympathy",
      "Just because",
      "New baby",
      "Soft colours, no lilies",
    ]) {
      expect(rendered, fragment).toContain(fragment);
    }
  });

  it("links none of them while spec 008 has not published the pages (AC-14)", () => {
    expect(hrefs(tiles("en"))).toEqual([]);
    for (const tile of OCCASION_TILES) {
      expect(tiles("en")).toContain(`data-fo-occasion="${tile.id}"`);
    }
  });

  it("renders a photo placeholder per tile and not one `<img>` (plan/10 §3)", () => {
    const html = tiles("en");

    expect([...html.matchAll(/data-fo-media-slot="tile"/g)]).toHaveLength(
      OCCASION_TILES.length,
    );
    expect(html).toContain(
      'data-fo-media-sizes="(min-width: 768px) 33vw, 50vw"',
    );
    expect(html).toContain("Photography to supply");
    expect(html).not.toContain("<img");
  });

  it("renders a link per tile once `published` is flipped, from the same loop", async () => {
    vi.doMock("../../src/config/occasions.ts", async () => {
      const actual = await vi.importActual<
        typeof import("../../src/config/occasions.ts")
      >("../../src/config/occasions.ts");
      return {
        ...actual,
        isOccasionPagePublished: (id: string) => id === "nameDay",
      };
    });

    const { OccasionTiles: Tiles } =
      await import("../../src/modules/ui/home/OccasionTiles.tsx");

    expect(hrefs(render(<Tiles locale="en" />, "en"))).toEqual([
      "/en/occasions/name-day",
    ]);
    expect(hrefs(render(<Tiles locale="de" />, "de"))).toEqual([
      "/de/anlaesse/namenstag",
    ]);
    expect(hrefs(render(<Tiles locale="pl" />, "pl"))).toEqual([
      "/pl/okazje/imieniny",
    ]);
  });

  it("renders in every launch locale, with one item per tile", () => {
    for (const locale of LOCALES) {
      expect([...tiles(locale).matchAll(/<li/g)].length, locale).toBe(
        OCCASION_TILES.length,
      );
    }
  });
});

describe("the 'Coming up in Poland' strip", () => {
  it("prints the four dates in the recipient's calendar and their names", () => {
    const rendered = text(dates("en"));

    for (const fragment of [
      "Coming up in Poland",
      "Dates worth sending for",
      "Sun, 1 Nov",
      "All Saints' Day · Wszystkich Świętych",
      "Andrzejki · St Andrew's Eve",
      "Wigilia · Christmas Eve",
      "Women's Day · Dzień Kobiet",
      "Poland's biggest flower day",
    ]) {
      expect(rendered, fragment).toContain(fragment);
    }
    expect([...dates("en").matchAll(/<li/g)]).toHaveLength(
      OCCASION_DATES.length,
    );
  });

  it("states each cutoff with its date and its wall clock in the recipient's zone", () => {
    const rendered = text(dates("en"));

    expect(rendered).toContain("Order by Fri, 30 Oct, 14:00 CET");
    expect(rendered).toContain("Order by Sat, 28 Nov, 14:00 CET");
    expect(rendered).toContain("Order by Tue, 22 Dec, 14:00 CET");
  });

  it("formats the same instants in the reader's own language", () => {
    // The zone is the recipient's in every locale; only the wording is the reader's.
    expect(text(dates("de"))).toContain("Fr., 30. Okt.");
    expect(text(dates("de"))).toContain("14:00 MEZ");
    expect(text(dates("pl"))).toContain("30 paź");
  });

  it("links nothing and computes nothing", () => {
    const html = dates("en");

    expect(hrefs(html)).toEqual([]);
    // No countdown, no "days left", no "next occasion": this document is ISR-cached.
    expect(text(html).toLowerCase()).not.toContain("days left");
    expect(html).not.toContain("<img");
  });
});

describe("the how-it-works explainer", () => {
  it("renders the round-2 artboard's eyebrow, headline and cross-border paragraph", () => {
    const rendered = text(explainer("en"));

    for (const fragment of [
      "How we send your flowers",
      "Three people touch your order. None of them is a courier.",
      "Our florist in the recipient's town makes the bouquet the morning it is delivered",
      "there is no customs form and nothing to pay on arrival",
    ]) {
      expect(rendered, fragment).toContain(fragment);
    }
  });

  it("renders the three numbered steps as an ordered list, with the ordinals decorative", () => {
    const html = explainer("en");
    const rendered = text(html);

    expect(HOW_IT_WORKS_STEPS).toHaveLength(3);
    expect([...html.matchAll(/<li/g)]).toHaveLength(3);
    expect(html).toContain("<ol");
    // "01" is drawn beside a list the reader is already told the position of.
    expect([...html.matchAll(/aria-hidden="true"/g)]).toHaveLength(3);
    for (const fragment of [
      "You choose the town, the day and a bouquet.",
      "The cutoff is shown in the recipient's time, not yours.",
      "A florist a few streets away accepts it.",
      "Substitutions are like for like, and we tell you.",
      "Delivered by hand. You get the photo.",
      "A picture arrives when the flowers do, so you know it happened.",
    ]) {
      expect(rendered, fragment).toContain(fragment);
    }
  });

  it("renders the guarantee control as text, because 007 has not published the page", () => {
    const html = explainer("en");

    expect(text(html)).toContain("Read the guarantee in full");
    expect(text(html)).toContain("The full terms go up with our help pages");
    expect(hrefs(html)).toEqual([]);
  });

  it("reserves the band's photo slot and renders no `<img>`, with the resolved caption", () => {
    const html = explainer("en");

    expect(html).toContain('data-fo-media-slot="band"');
    expect(html).toContain(
      'data-fo-media-sizes="(min-width: 768px) 50vw, 100vw"',
    );
    // `/review 41`: the caption describes the photograph the slot will hold and asserts no
    // consent-gated feature of spec 027.
    expect(text(html)).toContain(
      "Photography to supply · a bouquet handed over at the recipient's door",
    );
    expect(text(html)).not.toContain("the delivery photo we send you");
    expect(html).not.toContain("<img");
  });
});

describe("the FAQ", () => {
  it("renders five native disclosures, all closed, and no JSON-LD (AC-16)", () => {
    const html = faq("en");

    expect(FAQ_ENTRIES).toHaveLength(5);
    expect([...html.matchAll(/<details/g)]).toHaveLength(5);
    expect([...html.matchAll(/<summary/g)]).toHaveLength(5);
    expect(html).not.toContain(" open");
    expect(html).not.toContain("application/ld+json");
  });

  it("asks the five questions the artboards ask, and answers them", () => {
    const rendered = text(faq("en"));

    for (const fragment of [
      "Before you order",
      "Questions people ask first",
      "Will the bouquet look like the photo?",
      "substitute like for like in colour and value",
      "What if nobody is home?",
      "Is the price really final?",
      "Delivery and VAT are inside the price you see.",
      "Who delivers, and when?",
      "What if the flowers do not last?",
      "we redeliver or refund, your choice",
    ]) {
      expect(rendered, fragment).toContain(fragment);
    }
  });

  it("renders the help-centre control as text, because 007 has not published it", () => {
    expect(text(faq("en"))).toContain("All help topics");
    expect(hrefs(faq("en"))).toEqual([]);
  });
});

describe("the trust strip (AC-10, AC-15)", () => {
  it("renders §2's three claims and nothing else", () => {
    const html = trust("en");
    const rendered = text(html);

    expect(TRUST_CLAIMS).toHaveLength(3);
    for (const claim of TRUST_CLAIMS) {
      expect(html, claim.id).toContain(`data-fo-trust-claim="${claim.id}"`);
    }
    for (const fragment of [
      "7-day freshness guarantee",
      "We redeliver or refund, your choice.",
      "Hand-made in the recipient's own town",
      "The price includes delivery and VAT",
    ]) {
      expect(rendered, fragment).toContain(fragment);
    }
  });

  it("keeps the guarantee's name in its own key, so §13 Q4's rename is a catalogue edit", () => {
    const messages = loadMessages("en", ["trust"]) as {
      trust: { guarantee: { name: string } };
    };
    expect(messages.trust.guarantee.name).toBe("7-day freshness guarantee");
    expect(text(trust("en"))).toContain(messages.trust.guarantee.name);
  });

  it("renders no icon, no badge, no photo and no number but the guarantee's term", () => {
    const html = trust("en");

    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("data-fo-media-slot");
    expect(text(html).replaceAll("7-day", "")).not.toMatch(/\d/);
  });

  it("names its region for a screen reader without drawing a heading", () => {
    const html = trust("en");

    expect(html).toContain('aria-labelledby="trust-strip-heading"');
    expect(html).toContain('class="sr-only" id="trust-strip-heading"');
  });

  it("renders in every launch locale", () => {
    for (const locale of LOCALES) {
      expect(text(trust(locale)).length, locale).toBeGreaterThan(80);
    }
  });
});
