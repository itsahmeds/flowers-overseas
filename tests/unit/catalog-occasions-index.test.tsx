/**
 * The **occasions index** as markup and as a view model (spec 008 §2 row 14, **AC-20**, AC-11,
 * §14 design round **Q3** and **Q4**; T-20; TASK-113).
 *
 * `tests/unit/catalog-hub-pages.test.tsx`'s pattern: `react-dom/server` over the **real**
 * `messages/*.json` and the **real** view model, so the asserted copy is the shipped copy and the
 * asserted dates are the committed calendar's own.
 *
 * Four properties, and the second and third are the ones that matter:
 *
 *  - **every occasion hub that exists is on this page, and every link on it is a hub that
 *    exists.** The page's whole reason to be is that twenty-eight hubs were reachable from
 *    nowhere; a page that listed twenty-seven of them would leave one orphan, and a page that
 *    listed one hub too many would link at a 404 (spec 004 AC-14). Both directions are asserted
 *    against `listingPages()`, the set `generateStaticParams` emits.
 *  - **the caption names the country the dates were computed in.** §14 Q4's ruling exists because
 *    an index with no destination would otherwise quote one country's calendar as everyone's. The
 *    test reads the caption's country out of the document and checks it against the country whose
 *    calendar produced the dates — so a page that printed Poland's dates under Germany's name
 *    fails here, which a "does it say Poland" assertion would not.
 *  - **the three groups partition the entries, and the undated ones carry no date at all.** Not a
 *    blank cell, not an em dash, not "all year" dressed up as a date (the artboard's "States").
 *  - **no money, no date literal, and none of AC-6's forbidden claims** in the component or in
 *    its namespace.
 */
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  COUNTRY_CODES,
  countryConfig,
  isCountryIso2,
} from "../../src/config/countries.ts";
import type { LocaleCode } from "../../src/config/locales.ts";
import {
  type ListingView,
  listingLocales,
  listingPages,
  listingView,
} from "../../src/modules/catalog";
import {
  isPublishedCountry,
  publishedCountries,
} from "../../src/modules/catalog/listing.ts";
import { OccasionsIndexPage } from "../../src/modules/catalog/ui/OccasionsIndexPage.tsx";
import { formatDate, loadMessages } from "../../src/modules/i18n";
import { listingHonestyViolations, textOf } from "../support/listing-honesty";

/** A fixed window start, so a rendered date is assertable without freezing a clock. */
const FROM = "2026-10-01";

const NAMESPACES = [
  "occasionsIndex",
  "breadcrumb",
  "catalog",
  "common",
  "a11y",
  "occasions",
  "destinations",
] as const;

/** Money, in any shape the four launch locales can print it (AC-7's pattern, reused). */
const MONEY = /[€£]|\bPLN\b|\bEUR\b|\bGBP\b|zł/u;

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

async function indexView(locale: string): Promise<ListingView> {
  const view = await listingView(
    { locale, pageType: "occasionsIndex" },
    { from: FROM },
  );
  if (view === undefined) {
    throw new Error(`the ${locale} occasions index must exist`);
  }
  return view;
}

/** The locales in which the index exists — `en` and `en-gb` today, `de`/`pl` when slugs land. */
const locales: LocaleCode[] = [];
for (const locale of listingLocales()) {
  const pages = await listingPages(locale);
  if (pages.some((page) => page.pageType === "occasionsIndex")) {
    locales.push(locale);
  }
}

const en = await indexView("en");
const html = render(<OccasionsIndexPage view={en} />, "en");

describe("the index lists every hub that exists, and nothing else (AC-20, AC-21)", () => {
  it("has one link per occasion hub in the existence set, in both directions", async () => {
    for (const locale of locales) {
      const view = await indexView(locale);
      const hubs = (await listingPages(locale))
        .filter((page) => page.pageType === "occasionHub")
        .map((page) => page.path);
      expect(hubs.length, locale).toBeGreaterThan(0);

      const linked = (view.occasions ?? []).map((entry) => entry.href);
      // Every hub is listed (no orphan) and every listing is a hub (no link to a 404).
      expect([...linked].sort(), locale).toEqual([...hubs].sort());

      // The same set reaches the document, as real `<a href>`s and not as text.
      const document = render(<OccasionsIndexPage view={view} />, locale);
      for (const href of hubs) {
        expect(document, `${locale} → ${href}`).toContain(`href="${href}"`);
      }
    }
  });

  it("renders the hubs in `collator(locale)` order and not in date order", () => {
    const names = (en.occasions ?? []).map((entry) => entry.name);
    expect(names).toEqual([...names].sort(new Intl.Collator("en").compare));
    // Sorted by name, the dated entries are not in date order — which is the point of the
    // ruling, and an assertion that would pass vacuously if it were not checked.
    const dates = (en.occasions ?? [])
      .map((entry) => entry.nextDate)
      .filter((date): date is string => date !== null);
    expect(dates.length).toBeGreaterThan(1);
    expect(dates).not.toEqual([...dates].sort());
  });
});

describe("the dated table quotes one country, and says which (§14 Q4)", () => {
  it("names in the caption the same country whose calendar produced the dates", async () => {
    expect(en.occasionsDateCountryKey).toBeDefined();
    // The country's own name from its own registry key — a dotted key held as data, so it is read
    // the way `registryLabel()` reads one and not by naming Poland here.
    const destinations = loadMessages("en", ["destinations"]).destinations as
      Record<string, { name?: string } | undefined> | undefined;
    const iso = en.occasionsDateCountryKey?.split(".")[1] ?? "";
    const country = destinations?.[iso]?.name;
    expect(typeof country, iso).toBe("string");

    const caption = /<caption[^>]*>([^<]*)<\/caption>/u.exec(html)?.[1] ?? "";
    expect(caption).toContain(country ?? "");

    // And the dates really are that country's: the soonest Mother's Day in the caption's country
    // is the one the table prints. Computed here from the same view model, never typed in.
    const mothers = (en.occasions ?? []).find(
      (entry) => entry.key === "mothers_day",
    );
    expect(mothers?.nextDate).toBe("2027-05-26");
    // Formatted by the same `formatDate` the page calls, so the assertion is about the date and
    // not about the locale's comma.
    expect(textOf(html)).toContain(
      formatDate(
        new Date(`${mothers?.nextDate ?? ""}T12:00:00Z`),
        "en",
        "calendarDate",
        "UTC",
      ),
    );
  });

  /**
   * `/review 98` round 1, required change 2. The captions said "in Poland — the one destination
   * we have published" and "the day belongs to a country we have not published yet", beside
   * Sant Jordi and Grandmothers' Day in France, while all seven destinations were published and
   * `/en` linked France's and Spain's guides. A count in prose is false the day the count moves,
   * so the caption now carries **one** fact and it is computed: the country the dates are from.
   */
  it("names the date source the registry gives, computed here and not read off the view", () => {
    // The rule, restated from the registry and not from `listingView()`: the first **published**
    // destination whose status is `live`.
    const source = COUNTRY_CODES.filter(isCountryIso2).find(
      (iso2) =>
        isPublishedCountry(iso2) && countryConfig(iso2).status === "live",
    );
    expect(source, "a published, live destination exists").toBeDefined();
    expect(en.occasionsDateCountryKey).toBe(
      source === undefined ? undefined : countryConfig(source).nameKey,
    );
    // **Pinned to today's data**, as `tests/e2e/shop-reachability.spec.ts` pins its counts: seven
    // destinations published, one of them live. The day either number moves — a country is
    // unpublished, or a second one goes live — this goes red, and whoever moved it re-reads the
    // caption against the new data before re-pinning it.
    expect(publishedCountries()).toHaveLength(7);
    expect(source).toBe("PL");
    const caption = /<caption[^>]*>([^<]*)<\/caption>/u.exec(html)?.[1] ?? "";
    expect(textOf(caption)).toBe(
      "The next date for each, in Poland. Every other country keeps its own date, and each page below carries the whole table.",
    );
  });

  it("says nothing about which destinations are published, in the caption or the undated note", () => {
    const caption = /<caption[^>]*>([^<]*)<\/caption>/u.exec(html)?.[1] ?? "";
    const undated =
      /data-fo-occasions-undated="\d+"[^>]*>(.*?)<ul/su.exec(html)?.[1] ?? "";
    expect(undated, "the undated group renders its note").toContain("calendar");
    for (const copy of [caption, textOf(undated)]) {
      expect(copy).not.toMatch(/\bpublish/iu);
      expect(copy).not.toMatch(
        /\b(?:the one|the only|only one) destination\b/iu,
      );
    }
  });

  it("puts every dated entry in the table and no undated one", () => {
    const dated = (en.occasions ?? []).filter(
      (entry) => entry.kind === "seasonal" && entry.nextDate !== null,
    );
    const undated = (en.occasions ?? []).filter(
      (entry) => entry.kind === "seasonal" && entry.nextDate === null,
    );
    const everyday = (en.occasions ?? []).filter(
      (entry) => entry.kind === "evergreen",
    );
    // The three groups partition the entries: nothing is listed twice, nothing is dropped.
    expect(dated.length + undated.length + everyday.length).toBe(
      (en.occasions ?? []).length,
    );
    expect(dated.length).toBeGreaterThan(0);
    expect(undated.length).toBeGreaterThan(0);
    expect(everyday.length).toBeGreaterThan(0);

    expect(html).toContain(`data-fo-occasions-dated="${String(dated.length)}"`);
    expect(html).toContain(
      `data-fo-occasions-undated="${String(undated.length)}"`,
    );
    expect(html).toContain(
      `data-fo-occasions-everyday="${String(everyday.length)}"`,
    );

    const table = /<table[\s\S]*?<\/table>/u.exec(html)?.[0] ?? "";
    expect(table).not.toBe("");
    for (const entry of dated) {
      expect(table, entry.key).toContain(`data-fo-occasion="${entry.key}"`);
    }
    // Name day, Sant Jordi, Grandmothers' Day in France and the May Day lily of the valley have a
    // hub and no date we can compute. They are named and linked **outside** the table — never a
    // row with a blank cell, which is the failure §14 Q6 forbids.
    for (const entry of [...undated, ...everyday]) {
      expect(table, entry.key).not.toContain(`data-fo-occasion="${entry.key}"`);
      expect(html, entry.key).toContain(`data-fo-occasion="${entry.key}"`);
    }
  });

  it("prints no empty date cell anywhere", () => {
    expect(html).not.toMatch(/<td[^>]*>\s*<\/td>/u);
  });
});

describe("what the page may not say", () => {
  it("shows no money in any locale", async () => {
    for (const locale of locales) {
      const document = render(
        <OccasionsIndexPage view={await indexView(locale)} />,
        locale,
      );
      expect(textOf(document), locale).not.toMatch(MONEY);
    }
  });

  it("makes none of AC-6's forbidden claims in any locale", async () => {
    for (const locale of locales) {
      const document = render(
        <OccasionsIndexPage view={await indexView(locale)} />,
        locale,
      );
      expect(
        listingHonestyViolations({ text: textOf(document), html: document }),
        locale,
      ).toEqual([]);
    }
  });

  it("contains no date literal in the component or in its namespace (AC-11)", () => {
    const source = readFileSync(
      resolve(__dirname, "../../src/modules/catalog/ui/OccasionsIndexPage.tsx"),
      "utf8",
    );
    // A four-digit year, a `YYYY-MM-DD`, or a month name: every date on this page is computed by
    // `nextOccasions()` and formatted by `formatDate`. `T12:00:00Z` is the instant rule, not a
    // date, and `007`/`008` are spec numbers.
    const withoutInstant = source.replaceAll("T12:00:00Z", "");
    expect(withoutInstant).not.toMatch(/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/u);
    expect(withoutInstant).not.toMatch(
      /\b(?:January|February|March|April|June|July|August|September|October|November|December)\b/u,
    );

    const messages = JSON.parse(
      readFileSync(resolve(__dirname, "../../messages/en.json"), "utf8"),
    ) as { occasionsIndex: Record<string, string> };
    for (const [key, value] of Object.entries(messages.occasionsIndex)) {
      expect(value, key).not.toMatch(/\b(?:19|20)\d{2}\b/u);
      expect(value, key).not.toMatch(/\d{1,2}[./-]\d{1,2}/u);
    }
  });
});
