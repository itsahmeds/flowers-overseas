/**
 * The hubs' first screens (spec 004 §14 A23 R1–R6, clause 6; A24 clauses 2, 5 and 10; AC-35,
 * AC-37's state half, AC-38 for A1–A5, A8, P4 and P5; T-37, T-39, T-40; TASK-188).
 *
 * Unit half: the view model's facts (R2's lead, R3's links, R5's order, the deck) and the rendered
 * first screen read off server HTML. The viewport half (what lies inside the first viewport at
 * 1440 × 900, 1280 × 800 and 390 × 844, the gaps, the per-width priority image as the browser
 * loads it) is `tests/e2e/hub-first-screens.spec.ts`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  type ListingOccasionEntry,
  type ListingView,
  listingView,
} from "../../src/modules/catalog";
// Two pure helpers of the view model, read where they live rather than widened into the barrel.
import {
  introSentences,
  nextOccasionsOf,
} from "../../src/modules/catalog/listing.ts";
import { CategoryHubPage } from "../../src/modules/catalog/ui/CategoryHubPage.tsx";
import { OccasionHubPage } from "../../src/modules/catalog/ui/OccasionHubPage.tsx";
import { OccasionsIndexPage } from "../../src/modules/catalog/ui/OccasionsIndexPage.tsx";
import { formatDateParts, loadMessages } from "../../src/modules/i18n";

/**
 * The destinations hub reads spec 007's `corridorState()`; the R6 cases flip it per country here,
 * the way a `live` flip in the registry would, with no component change.
 */
const state = vi.hoisted(() => ({ live: new Set<string>() }));
vi.mock("../../src/modules/geo/corridor.ts", async (original) => {
  const actual =
    await original<typeof import("../../src/modules/geo/corridor.ts")>();
  return {
    ...actual,
    corridorState: (iso2: string, locale: string) =>
      state.live.has(iso2) ? "live" : actual.corridorState(iso2, locale),
  };
});
const { DestinationsHubPage } =
  await import("../../src/modules/geo/ui/DestinationsHubPage.tsx");

const FROM = "2026-10-18";
const NAMESPACES = [
  "shop",
  "categoryHub",
  "occasionHub",
  "occasionsIndex",
  "breadcrumb",
  "catalog",
  "common",
  "a11y",
  "media",
  "occasions",
  "destinations",
  "destinationsHub",
  "footer",
  "meta",
] as const;

function render(node: ReactElement, locale = "en-gb"): string {
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

async function view(
  pageType: "categoryHub" | "occasionHub" | "occasionsIndex",
  entity?: string,
  locale = "en-gb",
): Promise<ListingView> {
  const built = await listingView(
    { locale, pageType, ...(entity === undefined ? {} : { entity }) },
    { from: FROM },
  );
  if (built === undefined) throw new Error(`${pageType} ${entity ?? ""}`);
  return built;
}

/** The attribute values of `name`, in document order. */
function hooks(html: string, name: string): readonly string[] {
  return [...html.matchAll(new RegExp(`${name}="([^"]*)"`, "gu"))].map(
    (match) => match[1] ?? "",
  );
}

const EN = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../messages/en.json"), "utf8"),
) as Record<string, unknown>;
const EN_META = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../../messages/en.meta.json"),
    "utf8",
  ),
) as Record<
  string,
  { reviewed: boolean; reviewedBy?: string; sourceHash: string }
>;

function valueOf(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      EN,
    );
}

const birthday = await view("occasionHub", "birthday");
const sympathy = await view("occasionHub", "sympathy");
const mothersDay = await view("occasionHub", "mothers-day");
const anniversary = await view("occasionHub", "anniversary");
const apology = await view("occasionHub", "i-am-sorry");
const roses = await view("categoryHub", "roses");
const bouquets = await view("categoryHub", "hand-tied-bouquets");
const index = await view("occasionsIndex");

describe("T-40: the approved hub strings, byte for byte (AC-38: A1–A5, A8; A24 clause 10 P4, P5)", () => {
  const APPROVED: Readonly<Record<string, string>> = {
    // A1
    "occasionHub.deck.birthday":
      "Bright flowers for the day itself, made by our florist in the town where they live.",
    // A2
    "categoryHub.h1": "{entity} to send abroad",
    // A3
    "occasionHub.productsHeading": "{entity} flowers",
    // A4
    "occasionHub.about.birthday.eyebrow": "About birthdays",
    "occasionHub.aboutHeading": "What people send",
    "categoryHub.about.roses.eyebrow": "About roses",
    "categoryHub.about.roses.heading": "Which rose says what",
    // A5
    "categoryHub.deck.roses":
      "Red for love, white for a loss, pink and orange for everything in between.",
    "categoryHub.deck.bouquet":
      "Tied by hand the morning they go, and handed over wrapped, ready for water.",
    "categoryHub.deck.plant": "Something that is still there next season.",
    // A8
    "occasionsIndex.eyebrow": "Every occasion, on every calendar",
    "occasionsIndex.undatedEyebrow": "Dated elsewhere",
    // A24 clause 10 (proposed, the founder's to approve)
    "destinationsHub.phoneIntro":
      "Seven countries in Europe, each with a guide we wrote ourselves.",
    // `shop.card.noPrice` was deleted with the hubs' per-card line (spec 004 §14
    // A-founder-2026-10-19b clause 4; TASK-285).
    // A3's exception (open item (iii)): the shipped wording, under its own key
    "occasionHub.productsHeadingPlain": "Flowers for {entity}",
  };

  for (const [key, text] of Object.entries(APPROVED)) {
    it(`${key} is the approved text, ships unreviewed, and has no em dash`, () => {
      expect(valueOf(key)).toBe(text);
      // The founder attests with his own script; no agent sets `reviewed: true` (A23 clause 6).
      // Unreviewed, unless the founder's own `record-approval-batch5.py` run recorded it.
      const recorded =
        /^founder, \d{4}-\d{2}-\d{2}: ran record-approval-batch5\.py /u.test(
          EN_META[key]?.reviewedBy ?? "",
        );
      expect(EN_META[key]?.reviewed, key).toBe(recorded);
      expect(EN_META[key]?.sourceHash, key).toBe(
        createHash("sha256").update(text).digest("hex"),
      );
      expect(text).not.toMatch(/—/u);
    });
  }
});

describe("R1: the band's register is the registry row's", () => {
  it.each([
    ["Birthday", birthday, OccasionHubPage, "warm"],
    ["Sympathy", sympathy, OccasionHubPage, "quiet"],
    ["Mother's Day", mothersDay, OccasionHubPage, "dated"],
    ["roses", roses, CategoryHubPage, "ink"],
    ["hand-tied bouquets", bouquets, CategoryHubPage, "cream"],
  ] as const)(
    "%s renders `data-register` %s",
    (_name, built, Page, register) => {
      expect(built.entity?.register).toBe(register);
      const html = render(<Page view={built} />);
      expect(hooks(html, "data-register")).toEqual([register]);
    },
  );

  it("draws nothing rotated or taped in a band (A24 clause 2)", () => {
    for (const html of [
      render(<OccasionHubPage view={sympathy} />),
      render(<OccasionHubPage view={birthday} />),
      render(<CategoryHubPage view={roses} />),
    ]) {
      const band = /<section[^>]*data-fo-hub-band[\s\S]*?<\/section>/u.exec(
        html,
      )?.[0];
      expect(band).toBeDefined();
      expect(band).not.toMatch(/rotate|tilt|tape|postmark|stamp/u);
    }
  });
});

describe("the deck and the about block (A23 clause 6, open item (iii))", () => {
  const deckOf = (html: string): string | undefined =>
    /<p[^>]*data-fo-hub-deck[^>]*>([^<]*)<\/p>/u.exec(html)?.[1];

  it("prints A1 on Birthday and A5 on roses", () => {
    expect(deckOf(render(<OccasionHubPage view={birthday} />))).toBe(
      valueOf("occasionHub.deck.birthday"),
    );
    expect(deckOf(render(<CategoryHubPage view={roses} />))).toBe(
      valueOf("categoryHub.deck.roses"),
    );
  });

  it("prints a verbatim sentence of the hub's own intro where no deck is approved", () => {
    const deck = deckOf(render(<OccasionHubPage view={sympathy} />));
    expect(deck).toBe(
      "Tell us the date you want and we will not deliver early, which matters more here than anywhere else.",
    );
    expect(introSentences(sympathy.intro ?? "")).toContain(deck);
  });

  it("prints no deck at all on a hub with neither", () => {
    expect(anniversary.hubDeck).toBeUndefined();
    expect(render(<OccasionHubPage view={anniversary} />)).not.toContain(
      "data-fo-hub-deck",
    );
  });

  it("moves the intro under the grid, under A4's pair where approved", () => {
    const html = render(<OccasionHubPage view={birthday} />);
    const grid = html.indexOf("data-fo-listing-grid");
    const about = html.indexOf("data-fo-hub-about");
    expect(about).toBeGreaterThan(grid);
    const block = html.slice(about);
    expect(block).toContain("About birthdays");
    expect(block).toContain("What people send");
    expect(block).toContain(birthday.intro?.slice(0, 40) ?? "-");
    // Bouquets: no eyebrow and no heading, the intro alone.
    const plain = render(<CategoryHubPage view={bouquets} />);
    const bouquetAbout = plain.slice(plain.indexOf("data-fo-hub-about"));
    expect(bouquetAbout).not.toMatch(/<h2/u);
    expect(bouquetAbout).not.toContain('class="eyebrow');
  });

  it("names the grid with A3, and keeps the shipped heading where A3 reads badly", () => {
    expect(render(<OccasionHubPage view={birthday} />)).toMatch(
      /id="hub-products-heading"[^>]*>Birthday <em[^>]*>flowers|id="hub-products-heading"[^>]*>(?:<em[^>]*>)?Birthday(?:<\/em>)? flowers/u,
    );
    expect(
      render(<OccasionHubPage view={apology} />).replace(/<[^>]+>/gu, ""),
    ).toContain("Flowers for I am sorry");
  });
});

describe("R2: the lead figure is the registry's `leadSku`", () => {
  it("is the artboards' six, each in its hub's own product set", async () => {
    for (const [pageType, entity, sku] of [
      ["occasionHub", "birthday", "FO-BQ-023"],
      ["occasionHub", "sympathy", "FO-BQ-016"],
      ["occasionHub", "mothers-day", "FO-BQ-007"],
      ["categoryHub", "roses", "FO-BQ-002"],
      ["categoryHub", "hand-tied-bouquets", "FO-BQ-009"],
      ["categoryHub", "plants", "FO-PT-002"],
    ] as const) {
      const built = await view(pageType, entity);
      expect(built.hubLead?.productId, entity).toBe(sku);
    }
  });

  it("falls back to the hub's first product where the registry names none", () => {
    expect(anniversary.hubLead?.productId).toBe(
      anniversary.hubItems[0]?.productId,
    );
  });
});

describe("R3: a dated hub's per-country dates in the first screen", () => {
  const html = render(<OccasionHubPage view={mothersDay} />);

  it("repeats the table: the same countries, in the table's order", () => {
    const first = hooks(html, "data-fo-hub-first-date");
    const table = hooks(html, "data-fo-hub-date");
    expect(first).toHaveLength(7);
    expect(first).toEqual(table);
    // …and the first screen comes before the table.
    expect(html.indexOf("data-fo-hub-first-date")).toBeLessThan(
      html.indexOf('data-fo-hub-date="'),
    );
  });

  it("prints each date as the parts of one `formatDateParts` value", () => {
    for (const row of mothersDay.occasionDates ?? []) {
      if (row.date === null) continue;
      const parts = formatDateParts(
        new Date(`${row.date}T12:00:00Z`),
        "en-gb",
        "UTC",
      );
      const card = new RegExp(
        `data-fo-hub-first-date="${row.iso2}"[\\s\\S]*?>${parts.day}<[\\s\\S]*?${parts.month}`,
        "u",
      );
      expect(html, row.iso2).toMatch(card);
    }
  });

  it("links an entry only where its country occasion page exists", () => {
    for (const row of mothersDay.occasionDates ?? []) {
      expect(row.href, row.iso2).toMatch(/\/occasions\/mothers-day$/u);
      expect(html).toMatch(
        new RegExp(
          `href="${row.href ?? "-"}"[^>]*data-fo-hub-first-date="${row.iso2}"|data-fo-hub-first-date="${row.iso2}"[^>]*href="${row.href ?? "-"}"`,
          "u",
        ),
      );
    }
    // An evergreen hub's picker falls back to the category, but its date entries never do: it
    // has none (§14 A1), and no entry links a category page.
    expect(birthday.occasionDates?.some((row) => row.href !== undefined)).toBe(
      false,
    );
  });
});

describe("R4: the category hub's destinations in the first screen", () => {
  const html = render(<CategoryHubPage view={roses} />);
  const band =
    /<section[^>]*data-fo-hub-band[\s\S]*?<\/section>/u.exec(html)?.[0] ?? "";

  it("puts every destination in the band, each one link named by `destinationLink`", () => {
    expect(hooks(band, "data-fo-hub-destination")).toEqual([
      "FR",
      "DE",
      "IT",
      "NL",
      "PL",
      "RO",
      "ES",
    ]);
    for (const destination of roses.links.destinations) {
      expect(band).toContain(`href="${destination.href ?? "-"}"`);
    }
    expect(band).toContain('aria-label="See them with prices for Poland"');
    expect(band.replace(/<[^>]+>/gu, " ")).toContain(
      "We can make 15 of them there.",
    );
    expect(band).toContain("We show no price on this page");
  });
});

describe("R5 (T-37): the occasions index's next six, in date order", () => {
  const entry = (
    key: string,
    nextDate: string | null,
    kind: "seasonal" | "evergreen" = "seasonal",
  ): ListingOccasionEntry => ({
    key,
    name: key,
    href: `/en/occasions/${key}`,
    kind,
    nextDate,
  });

  it("orders by date, not by name, and stops at six", () => {
    const collated = [
      entry("a-christmas", "2026-12-25"),
      entry("b-all-saints", "2026-11-01"),
      entry("c-birthday", null, "evergreen"),
      entry("d-name-day", null),
      entry("e-new-year", "2027-01-01"),
      entry("f-valentines", "2027-02-14"),
      entry("g-womens-day", "2027-03-08"),
      entry("h-grandparents", "2027-01-21"),
      entry("i-mothers-day", "2027-05-26"),
    ];
    expect(nextOccasionsOf(collated).map((row) => row.key)).toEqual([
      "b-all-saints",
      "a-christmas",
      "e-new-year",
      "h-grandparents",
      "f-valentines",
      "g-womens-day",
    ]);
  });

  it("is empty when no occasion is dated", () => {
    expect(nextOccasionsOf([entry("x", null)])).toEqual([]);
  });

  it("is the view's block, with the same dates the table prints", () => {
    const next = index.nextOccasions ?? [];
    expect(next.length).toBe(6);
    const dates = next.map((row) => row.nextDate ?? "");
    expect(dates).toEqual([...dates].sort());
    for (const row of next) {
      expect(
        index.occasions?.find((candidate) => candidate.key === row.key)
          ?.nextDate,
      ).toBe(row.nextDate);
    }
  });

  it("renders the block in the view's order, and nothing when there is none", () => {
    const html = render(<OccasionsIndexPage view={index} />);
    expect(hooks(html, "data-fo-next-occasion")).toEqual(
      (index.nextOccasions ?? []).map((row) => row.key),
    );
    const none: ListingView = { ...index };
    delete (none as { nextOccasions?: unknown }).nextOccasions;
    const empty = render(<OccasionsIndexPage view={none} />);
    expect(empty).not.toContain("data-fo-next-occasion");
    expect(empty).not.toContain("data-fo-occasions-next");
  });

  it("puts no image on the index (its LCP element is the `<h1>`)", () => {
    expect(render(<OccasionsIndexPage view={index} />)).not.toMatch(/<img/u);
  });
});

describe("R6 (T-37, T-39): the destinations hub's state line", () => {
  const GUIDE = "Guide · not delivering yet";
  const LIVE = "Delivering now";

  function renderHub(): string {
    return render(<DestinationsHubPage locale="en-gb" />);
  }

  it("prints the guide state as real text in the first screen while any destination is a guide", () => {
    state.live.clear();
    const html = renderHub();
    const line =
      /data-fo-hub-guide-state[^>]*>([\s\S]*?)<\/span><\/span>/u.exec(
        html,
      )?.[1];
    expect(line?.replace(/<[^>]+>/gu, "")).toBe(GUIDE);
    expect(html).not.toContain(LIVE);
    expect(html).not.toMatch(/<img/u);
  });

  it("prints no guide-state line when no destination is a guide", () => {
    state.live = new Set(["PL", "DE", "FR", "ES", "IT", "RO", "NL"]);
    const html = renderHub();
    state.live.clear();
    expect(html).not.toContain("data-fo-hub-guide-state");
  });

  it("gives a live destination its live state, and a guide never reads as live", () => {
    state.live = new Set(["PL"]);
    const html = renderHub();
    state.live.clear();
    const pills = [
      ...html.matchAll(
        /data-fo-hub-pill="([A-Z]{2})"[^>]*>([\s\S]*?)<\/(?:a|span)><\/li>/gu,
      ),
    ].map((match) => ({
      iso2: match[1],
      text: (match[2] ?? "").replace(/<[^>]+>/gu, " "),
    }));
    expect(pills).toHaveLength(7);
    for (const pill of pills) {
      expect(pill.text.includes(LIVE), pill.iso2).toBe(pill.iso2 === "PL");
    }
  });

  it("lists the same destinations, in the same order, with the same links, as the page below", () => {
    state.live.clear();
    const html = renderHub();
    const pills = hooks(html, "data-fo-hub-pill");
    const rows = hooks(html, "data-fo-hub-row");
    expect(pills).toEqual(["FR", "DE", "IT", "NL", "PL", "RO", "ES"]);
    expect(rows).toEqual(pills);
    expect(html).toContain(
      "Seven countries in Europe, each with a guide we wrote ourselves.",
    );
  });
});
