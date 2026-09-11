/**
 * The locale home's hero, finder and proof row (spec 004 §2 "Locale-home skeleton", §5.3, §13's
 * 2026-09-08 resolution note, §14 A1/A5, **AC-11**, AC-14, AC-15; TASK-052).
 *
 * Rendered with `react-dom/server` against the **real** `messages/*.json` through the same
 * provider the document layout uses — the pattern `tests/unit/ui-site-header.test.tsx`
 * established — so the asserted copy is the shipped copy in all four locales.
 *
 * What is here rather than in `tests/e2e/home.spec.ts`: every property that is a fact about the
 * markup. **AC-11 in both directions** above all — the committed registry publishes no corridor
 * page, so the "renders a link" half is exercised through a mocked `countries.ts`, and a rule
 * tested only in its false branch is not tested. Layout, stickiness, the type-ahead in a browser,
 * the zero-JavaScript fallback and the four locales at two viewports are the e2e file's.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { COUNTRIES } from "../../src/config/countries.ts";
import { loadMessages, localePath } from "../../src/modules/i18n";
import {
  FINDER_IDS,
  finderDestinationGroups,
  finderDestinations,
  finderTarget,
} from "../../src/modules/ui/home/finder-model.ts";
import { DestinationsGrid } from "../../src/modules/ui/home/DestinationsGrid.tsx";
import { HOME_BLEED, HomeHero } from "../../src/modules/ui/home/HomeHero.tsx";
import { PROOF_FACTS, ProofRow } from "../../src/modules/ui/home/ProofRow.tsx";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

/** The namespaces the home reads. `finder` and `home` are new with this task. */
const NAMESPACES = [
  "home",
  "finder",
  "destinations",
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

const hero = (locale: string): string =>
  render(<HomeHero locale={locale} />, locale);

/**
 * TASK-054 replaced TASK-052's `DestinationList` stand-in with the artboards' grid, which carries
 * the same `destinations` id and the same AC-11/AC-14 obligations; these assertions moved onto it
 * unchanged, minus the stand-in's onboarding line (the grid says the same thing in the section's
 * own copy, asserted in `tests/unit/ui-home-gated.test.tsx`).
 */
const destinationList = (locale: string): string =>
  render(<DestinationsGrid locale={locale} />, locale);

/** The visible text of the rendered markup: tags stripped, entities decoded. */
function text(html: string): string {
  return html
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll(/\s+/g, " ");
}

/** Every `href` in document order. */
function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? "");
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../../src/config/countries.ts");
});

describe("the hero band", () => {
  it("renders exactly one `<h1>`, and it is the artboards' headline", () => {
    const html = hero("en");

    expect([...html.matchAll(/<h1/g)]).toHaveLength(1);
    expect(html).toContain("Flowers for someone far away.");
  });

  it("renders the eyebrow and the first-person proposition (§14 A5)", () => {
    const html = text(hero("en"));

    expect(html).toContain("International flower delivery");
    expect(html).toContain("Our florist in your recipient's town");
    expect(html).toContain("We never ship a box.");
  });

  it("reserves the hero photo slot with its caption and renders no image", () => {
    const html = hero("en");

    expect(html).toContain('data-fo-media-slot="hero"');
    expect(html).toContain('data-fo-media-sizes="100vw"');
    expect(html).toContain("Photography to supply");
    expect(html).not.toContain("<img");
  });

  it("reserves a height at both artboard geometries, so nothing shifts", () => {
    const html = hero("en");
    // The mobile photo band and the desktop hero band, per `HERO_HEIGHTS`.
    expect(html).toContain("h-[300px]");
    expect(html).toContain("md:h-[820px]");
  });

  it("uses the header's inline gutter, so the card lines up with the wordmark", async () => {
    const header = await import("../../src/modules/ui/layout/SiteHeader.tsx");
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/modules/ui/layout/SiteHeader.tsx", "utf8"),
    );
    // `BLEED` is private to the header, so the pin is on its source line rather than an import.
    expect(source).toContain(`const BLEED = "${HOME_BLEED}"`);
    expect(header.SiteHeader).toBeTypeOf("function");
  });

  it("renders in every launch locale with its own copy", () => {
    for (const locale of LOCALES) {
      const html = hero(locale);
      expect([...html.matchAll(/<h1/g)], locale).toHaveLength(1);
      expect(text(html).length, locale).toBeGreaterThan(200);
    }
  });
});

describe("the finder card (AC-11)", () => {
  it("labels all three fields and binds each label to its control", () => {
    const html = hero("en");

    for (const [id, label] of [
      [FINDER_IDS.country, "Country"],
      [FINDER_IDS.town, "Town, city or postcode"],
      [FINDER_IDS.date, "Delivery date"],
    ] as const) {
      expect(html, id).toContain(`for="${id}"`);
      expect(html, id).toContain(`id="${id}"`);
      expect(text(html), id).toContain(label);
    }
  });

  it("offers the seven destinations as a native `<datalist>`, so it works without JavaScript", () => {
    const html = hero("en");
    const options = [...html.matchAll(/<option value="([^"]*)"/g)].map(
      (match) => match[1] ?? "",
    );

    expect(html).toContain(`<datalist id="${FINDER_IDS.countryList}"`);
    expect(html).toContain(`list="${FINDER_IDS.countryList}"`);
    expect(options).toHaveLength(COUNTRIES.length);
    expect(options).toEqual([
      "France",
      "Germany",
      "Italy",
      "Netherlands",
      "Poland",
      "Romania",
      "Spain",
    ]);
  });

  it("orders the destinations by `collator(locale)`, which is what `pl` needs", () => {
    const polish = [...hero("pl").matchAll(/<option value="([^"]*)"/g)].map(
      (match) => match[1] ?? "",
    );

    // The `pl` catalogue is a machine draft today, so the *names* are still English while the
    // order is Polish collation's. What this pins is that the order is computed per locale and
    // not copied from the registry, whose order is Poland-first.
    expect(polish[0]).not.toBe("Poland");
    expect(polish).toHaveLength(COUNTRIES.length);
  });

  it("names every destination with its state, and links none of them", () => {
    const html = destinationList("en");
    const rendered = text(html);

    for (const country of COUNTRIES) {
      expect(html, country.iso2).toContain(
        `data-fo-destination="${country.iso2}"`,
      );
    }
    expect(rendered).toContain("Delivering now");
    expect(rendered).toContain("Guide · waiting list");
    // AC-14: while every flag is false the finder links nowhere at all.
    expect(hrefs(html)).toEqual([]);
  });

  it("submits to a document that exists, with no `action` to a non-200 URL", () => {
    const html = hero("en");

    expect(html).toContain('method="get"');
    expect(html).toContain(`action="/en#${FINDER_IDS.destinations}"`);
    expect(html).toContain('type="submit"');
    expect(text(html)).toContain("Continue");
  });

  it("keeps the status list out of the card, as design round 7 requires", () => {
    const html = hero("en");

    // No status column, no footnote and no pills next to the field: the states are rendered by
    // `DestinationsGrid`, after the finder, where round 7 puts them.
    expect(html).not.toContain("data-fo-destination=");
    expect(text(html)).not.toContain("Delivering now");
  });

  it("prints the cutoff in the recipient's zone, as static copy", () => {
    expect(text(hero("en"))).toContain(
      "Order by 14:00 in Warsaw — the recipient's own time, not yours",
    );
  });

  it("describes the country field with one sentence, not the whole section (`/review 40`)", () => {
    const html = hero("en");

    // The description used to be `destinations` — the section — so focusing the field read seven
    // names, seven state words and the onboarding line on every focus.
    expect(html).toContain(
      `aria-describedby="${FINDER_IDS.destinationsSummary}"`,
    );
    expect(html).not.toContain(`aria-describedby="${FINDER_IDS.destinations}"`);
    expect(html).toContain(`id="${FINDER_IDS.destinationsSummary}"`);
    // The sentence is built from the same registry the section renders, so it cannot drift.
    expect(text(html)).toContain(
      "We deliver in Poland today. In France, Germany, Italy, Netherlands, Romania and Spain we are still choosing florists.",
    );
  });

  it("keeps both destination groups non-empty, which the summary sentence assumes", () => {
    const groups = finderDestinationGroups(
      finderDestinations("en", (key) => key),
      (key) => key,
    );
    expect(groups.delivering.length).toBeGreaterThan(0);
    expect(groups.onboarding.length).toBeGreaterThan(0);
  });

  it("ships the type-ahead as an enhancement whose input is server-rendered", () => {
    const html = hero("en");
    // The island's own input, rendered on the server with `list` set: the field is a native
    // type-ahead before hydration and forever without JavaScript.
    expect(html).toContain(`id="${FINDER_IDS.country}"`);
    expect(html).toContain("data-fo-finder-announce");
    expect(html).toContain('aria-live="polite"');
  });
});

describe("`finderTarget()` — where `Continue` goes", () => {
  it("answers the on-page destination anchor while no corridor page is published", () => {
    for (const locale of LOCALES) {
      expect(finderTarget(locale), locale).toBe(
        `${localePath(locale, "home")}#destinations`,
      );
      expect(finderTarget(locale, "PL"), locale).toBe(
        `${localePath(locale, "home")}#destinations`,
      );
    }
  });

  it("answers the corridor country page once a flag is flipped, with no code change", async () => {
    vi.doMock("../../src/config/countries.ts", async () => {
      const actual = await vi.importActual<
        typeof import("../../src/config/countries.ts")
      >("../../src/config/countries.ts");
      return {
        ...actual,
        isCorridorPagePublished: (iso2: string) => iso2 === "PL",
      };
    });

    const { finderTarget: withPublishedPl } =
      await import("../../src/modules/ui/home/finder-model.ts");

    expect(withPublishedPl("en", "PL")).toBe("/en/send-flowers-to/poland");
    expect(withPublishedPl("de", "PL")).toBe("/de/blumen-verschicken/polen");
    expect(withPublishedPl("pl", "PL")).toBe("/pl/wyslij-kwiaty/polska");
    // Everything else still has nowhere to go.
    expect(withPublishedPl("en", "DE")).toBe("/en#destinations");
  });

  it("renders the published destination as a link, from the same template", async () => {
    vi.doMock("../../src/config/countries.ts", async () => {
      const actual = await vi.importActual<
        typeof import("../../src/config/countries.ts")
      >("../../src/config/countries.ts");
      return {
        ...actual,
        isCorridorPagePublished: (iso2: string) => iso2 === "PL",
      };
    });

    const { DestinationsGrid: List } =
      await import("../../src/modules/ui/home/DestinationsGrid.tsx");
    const html = render(<List locale="en" />, "en");

    // The one published destination is a link; the six unpublished ones are still text.
    expect(hrefs(html)).toEqual(["/en/send-flowers-to/poland"]);
    expect(html).toContain('data-fo-destination="DE"');
  });
});

describe("the four-fact proof row", () => {
  const row = (locale: string): string => render(<ProofRow />, locale);

  it("renders the artboards' four facts, in the first person (§14 A5)", () => {
    const rendered = text(row("en"));

    expect(PROOF_FACTS).toHaveLength(4);
    for (const fragment of [
      "7-day freshness guarantee",
      "We redeliver or refund, your choice",
      "We make it in their own town",
      "Independent shops we chose ourselves",
      "The price you see is what we charge",
      "Delivery and VAT already in it",
      "We photograph it at the door",
      "The picture reaches you the same day",
    ]) {
      expect(rendered, fragment).toContain(fragment);
    }
  });

  it("renders four list items and four decorative icons", () => {
    const html = row("en");

    expect([...html.matchAll(/<li/g)]).toHaveLength(4);
    expect([...html.matchAll(/aria-hidden="true"/g)]).toHaveLength(4);
  });

  it("renders no photo for the delivery-photo promise (AC-15, the TASK-052 row)", () => {
    const html = row("en");

    expect(html).not.toContain("<img");
    expect(html).not.toContain("photo aspect-");
    expect(html).not.toContain("data-fo-media-slot");
  });

  it("invents no number: no count, rating or review anywhere in the row", () => {
    const rendered = text(row("en"));

    // "7-day" is a term of the guarantee, not a measurement; nothing else numeric may appear.
    expect(rendered.replaceAll("7-day", "")).not.toMatch(/\d/);
    for (const forbidden of ["review", "rating", "star", "florists", "★"]) {
      expect(rendered.toLowerCase(), forbidden).not.toContain(forbidden);
    }
  });
});

describe("the copy obeys the brand voice (§14 A5)", () => {
  const BANNED = [
    "relay",
    "corridor",
    "partner",
    "third party",
    "third-party",
    "vendor",
    "anywhere in the world",
    "super fresh",
    // A5's list names five model words; "network" is the sixth shape of the same claim ("our
    // network of florists" is a marketplace sentence) and the founder's brand-voice note bans it
    // alongside them. It is the ninth entry, which is what this test's name has always claimed.
    "network",
  ];

  it("uses none of the nine banned words in any locale's home-page copy", () => {
    for (const locale of LOCALES) {
      // TASK-053 extended the page with four namespaces, and the explainer is exactly where a
      // model word ("relay", "our partner network") would land: it is the section that explains
      // the model.
      const messages = loadMessages(locale, [
        "home",
        "finder",
        "trust",
        "faq",
        "occasions",
      ]);
      const serialised = JSON.stringify(messages).toLowerCase();
      for (const word of BANNED) {
        expect(serialised, `${locale}: ${word}`).not.toContain(word);
      }
    }
  });

  it("caps the geography at live coverage: Poland today, no country count", () => {
    // TASK-054 moved the sentence out of the finder's onboarding line and into the destinations
    // grid's heading, where the artboard puts it; both namespaces are read so the claim is
    // pinned wherever it lives.
    const messages = JSON.stringify(loadMessages("en", ["finder", "home"]));
    expect(messages).toContain("Poland today");
    expect(messages).not.toMatch(/\b(seven|7) countries\b/i);
  });
});
