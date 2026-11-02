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

import { OCCASION_TILES } from "../../src/config/occasions.ts";
import { loadMessages } from "../../src/modules/i18n";
import { HomeFaq, FAQ_ENTRIES } from "../../src/modules/ui/home/HomeFaq.tsx";
import {
  HOW_IT_WORKS_STEPS,
  HowItWorks,
} from "../../src/modules/ui/home/HowItWorks.tsx";
import { OccasionTiles } from "../../src/modules/ui/home/OccasionTiles.tsx";
import {
  TRUST_CLAIMS,
  TrustStrip,
} from "../../src/modules/ui/trust/TrustStrip.tsx";

import { dayCountIn } from "../support/day-count.ts";

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

  it("links none of them without the catalogue's hub set (AC-14)", () => {
    expect(hrefs(tiles("en"))).toEqual([]);
    for (const tile of OCCASION_TILES) {
      expect(tiles("en")).toContain(`data-fo-occasion="${tile.id}"`);
    }
  });

  it("renders the founder's six photographs, one per tile, lazily (TASK-080)", () => {
    const html = tiles("en");

    expect([...html.matchAll(/data-fo-media-slot="tile"/g)]).toHaveLength(
      OCCASION_TILES.length,
    );
    expect([...html.matchAll(/<img/g)]).toHaveLength(OCCASION_TILES.length);
    expect(html).toContain('sizes="(min-width: 768px) 17vw, 50vw"');
    // Below the fold on both artboards, so every tile is lazy and none is the LCP candidate.
    expect([...html.matchAll(/loading="lazy"/g)]).toHaveLength(
      OCCASION_TILES.length,
    );
    expect(html).not.toContain('fetchPriority="high"');
    expect(html).not.toContain("Photography to supply");
  });

  it("falls back to the captioned box and no `<img>` in a locale with no alt text", () => {
    // `plan/07` §8 and spec 006 AC-18: a missing translation degrades to something honest, never
    // to an English sentence read aloud on a non-English page. `ar-XB` has no alt text and never
    // will, so it is the locale that reaches the arm without editing the dataset.
    const html = tiles("ar-XB");

    expect(html).not.toContain("<img");
    expect([
      ...html.matchAll(/data-fo-media-placeholder="noAlt"/g),
    ]).toHaveLength(OCCASION_TILES.length);
    expect(html).toContain("aspect-[4/5]");
    expect(html).toContain("rounded-arch");
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

  it("links each tile to its occasion hub when the page hands the hub in (A20; TASK-177)", () => {
    const html = render(
      <OccasionTiles
        locale="en"
        hubHrefs={{
          birthday: "/en/occasions/birthday",
          new_baby: "/en/occasions/new-baby",
        }}
      />,
      "en",
    );

    expect(hrefs(html)).toEqual([
      "/en/occasions/birthday",
      "/en/occasions/new-baby",
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

// "Coming up in Poland" left the home (spec 004 §14 A-founder-2026-10-24a items 4.6 and 13;
// TASK-387): "Coming up" over every shop country is `tests/unit/home-v3.test.tsx`.

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

  it("renders the three steps as an ordered list, numbered by CSS counters", () => {
    const html = explainer("en");
    const rendered = text(html);

    expect(HOW_IT_WORKS_STEPS).toHaveLength(3);
    expect([...html.matchAll(/<li/g)]).toHaveLength(3);
    expect(html).toContain("<ol");
    expect(html).toContain("before:content-[counter(step)]");
    for (const fragment of [
      "You choose the town, the day and a bouquet.",
      "any order-by time we show is on the recipient's clock, not yours.",
      "Our florist nearby makes it that morning.",
      "Substitutions are like for like, and we tell you.",
      "Delivered by hand. You get the photo.",
      "A picture arrives when the flowers do, so you know it happened.",
    ]) {
      expect(rendered, fragment).toContain(fragment);
    }
  });

  it("draws no guarantee control and no photo slot: neither has a page or a photograph (A20)", () => {
    const html = explainer("en");

    expect(text(html)).not.toContain("Read the guarantee in full");
    expect(hrefs(html)).toEqual([]);
    expect(html).not.toContain("data-fo-media-slot");
    expect(html).not.toContain("<img");
  });
});

describe("the FAQ", () => {
  it("renders three native disclosures, the first open as drawn, and no JSON-LD (AC-16)", () => {
    const html = faq("en");

    // Three since TASK-177, two founder rulings of 2026-10-04: "What if the flowers do not
    // last?" answered "Seven days from delivery" (a day-count freshness promise, withdrawn), and
    // "Is the price really final?" answered with the VAT-and-delivery sentence the founder ruled
    // off the home ("dont write this on home").
    expect(FAQ_ENTRIES).toHaveLength(3);
    expect([...html.matchAll(/<details/g)]).toHaveLength(3);
    expect([...html.matchAll(/<summary/g)]).toHaveLength(3);
    // TASK-232 (QA-3 D-10): both artboards draw the first question open, the others closed.
    expect(
      [...html.matchAll(/<details([^>]*)>/g)].map((match) =>
        /\sopen=""/.test(match[1] ?? ""),
      ),
    ).toEqual([true, false, false]);
    expect(html).not.toContain("application/ld+json");
  });

  it("asks three questions and answers them, promising no day count and naming no VAT", () => {
    const rendered = text(faq("en"));

    for (const fragment of [
      "Before you order",
      "Questions people ask first",
      "Will the bouquet look like the photo?",
      "substitutes like for like in colour and value",
      "What if nobody is home?",
      "Who delivers, and when?",
    ]) {
      expect(rendered, fragment).toContain(fragment);
    }
    expect(rendered).not.toMatch(/\bVAT\b/u);
    // No day count in any locale: spelled numbers, words between and week words too (H4).
    for (const locale of LOCALES) {
      expect(dayCountIn(text(faq(locale))), locale).toBeUndefined();
    }
  });

  it("draws the artboards' `+` affordance on every summary, decorative and CSS-only", () => {
    const html = faq("en");

    // One `+` per disclosure, hidden from AT because `<details>` carries the state itself.
    expect([...html.matchAll(/aria-hidden="true"/g)]).toHaveLength(
      FAQ_ENTRIES.length,
    );
    expect([...html.matchAll(/>\+</g)]).toHaveLength(FAQ_ENTRIES.length);
    // The native marker is suppressed in both engines, so the `+` is the only marker drawn …
    expect([...html.matchAll(/list-none/g)]).toHaveLength(FAQ_ENTRIES.length);
    expect(
      // `&` is entity-escaped in the attribute value.
      [...html.matchAll(/\[&amp;::-webkit-details-marker\]:hidden/g)],
    ).toHaveLength(FAQ_ENTRIES.length);
    // … and the open state rotates that same glyph into a `×` with no script of ours.
    expect([...html.matchAll(/group-open:rotate-45/g)]).toHaveLength(
      FAQ_ENTRIES.length,
    );
    // The rotation hangs off the `<details>`, which is the element that holds `open`.
    expect([...html.matchAll(/<details class="[^"]*\bgroup\b/g)]).toHaveLength(
      FAQ_ENTRIES.length,
    );
    expect(html).not.toContain("onClick");
  });

  it("does not render the help-centre control at all while it has no page (A20; TASK-232)", () => {
    for (const locale of LOCALES) {
      expect(text(faq(locale)), locale).not.toContain("All help topics");
      expect(hrefs(faq(locale)), locale).toEqual([]);
    }
    // The sentence saying what holds today stays (copy for the founder's batch).
    expect(text(faq("en"))).toContain("Our help pages are being written.");
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
      // Spec 009 §14 A11 (TASK-172): the guarantee's name is the fresh-flower promise, never a
      // number of days.
      "Fresh-flower promise",
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
    expect(messages.trust.guarantee.name).toBe("Fresh-flower promise");
    expect(text(trust("en"))).toContain(messages.trust.guarantee.name);
  });

  it("renders no icon, no badge, no photo and no number at all (spec 009 §14 A11)", () => {
    const html = trust("en");

    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("data-fo-media-slot");
    expect(text(html)).not.toMatch(/\d/u);
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
