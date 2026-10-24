/**
 * The guide's first screen, its Rule column and its v2 shapes, as server markup (spec 007 §14
 * A11, A12; AC-30, AC-31, AC-32; T-31, T-32, T-33 unit halves; spec 004 §14 A23 clause 6, AC-38
 * for id A11, T-40; TASK-189).
 *
 * `corridor-page.test.tsx`'s pattern: `react-dom/server` over the real `messages/*.json`, so the
 * asserted copy is the shipped copy. The browser halves (viewport boxes, computed fonts, the pill's
 * computed radius) are `tests/e2e/corridor-first-screen.spec.ts`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { corridorShopEntry } from "../../src/modules/catalog/shop-entry.ts";
import {
  type CorridorView,
  type OccasionRuleKind,
  corridorView,
} from "../../src/modules/geo";
import { CorridorPage } from "../../src/modules/geo/ui/CorridorPage.tsx";
import { calendarRuleKey } from "../../src/modules/geo/ui/calendar-rule.ts";
import {
  formatDate,
  formatDateParts,
  loadMessages,
} from "../../src/modules/i18n";

const FROM = "2026-09-15";

const NAMESPACES = [
  "corridor",
  "breadcrumb",
  "destinations",
  "catalog",
  "common",
  "a11y",
  "media",
  "shop",
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
    .replaceAll(/\s+/g, " ")
    .trim();
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "messages", file), "utf8"),
  ) as Record<string, unknown>;
}

/** The value at a dotted key, or `undefined`. */
function at(catalogue: unknown, key: string): unknown {
  let value: unknown = catalogue;
  for (const segment of key.split(".")) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

const EN = readJson("en.json");

/** Spec 007 §14 A11 (a), the approved English (Appendix A A11), and the reuse rule for the rest. */
const RULE_WORDS: Readonly<Record<OccasionRuleKind, string | undefined>> = {
  fixed: "Same date every year",
  easter_offset: "Moves with Easter",
  nth_weekday: "A set weekday of the month",
  last_weekday: "A set weekday of the month",
  lent_sunday: "Moves with Easter",
  orthodox_easter_offset: "Moves with Easter",
  none: undefined,
};

const IDENTIFIERS = Object.keys(RULE_WORDS);

/** The `<tbody>` rows of the calendar: [ISO date, occasion cell, date cell, rule cell]. */
function calendarRows(html: string): [string, string, string, string][] {
  const tbody = /<tbody>(.*?)<\/tbody>/su.exec(html)?.[1] ?? "";
  return [
    ...tbody.matchAll(
      /<tr data-fo-calendar-date="([^"]+)">\s*<th[^>]*>(.*?)<\/th>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<\/tr>/gsu,
    ),
  ].map((match) => [
    match[1] ?? "",
    match[2] ?? "",
    match[3] ?? "",
    match[4] ?? "",
  ]);
}

/** The first screen's band, whole. */
function firstScreen(html: string): string {
  const start = html.indexOf("data-fo-corridor-first-screen");
  const facts = html.indexOf("data-fo-corridor-facts");
  if (start === -1 || facts === -1) throw new Error("no first screen");
  return html.slice(start, facts);
}

/** The first screen's date cards: [ISO date, card markup]. */
function firstDates(html: string): [string, string][] {
  return [
    ...firstScreen(html).matchAll(
      /<li[^>]*data-fo-first-date="([^"]+)"[^>]*>(.*?)<\/li>/gsu,
    ),
  ].map((match) => [match[1] ?? "", match[2] ?? ""]);
}

const DESTINATIONS = ["PL", "DE", "FR", "ES", "IT", "RO", "NL"] as const;

const pages = await Promise.all(
  (["en", "en-gb"] as const).flatMap((locale) =>
    DESTINATIONS.map(async (iso2) => {
      const view = corridorView(iso2, locale, {
        from: FROM,
        liveSlots: await corridorShopEntry(locale, iso2),
      });
      if (view === undefined)
        throw new Error(`the ${locale} ${iso2} guide must exist`);
      return {
        locale,
        iso2,
        view,
        html: render(<CorridorPage view={view} />, locale),
      };
    }),
  ),
);

const poland = pages.find((page) => page.locale === "en" && page.iso2 === "PL");
if (poland === undefined) throw new Error("the en Poland guide must exist");

describe("T-31 (unit): the Rule column prints words (AC-30)", () => {
  it.each(Object.entries(RULE_WORDS))(
    "`%s` maps to its approved sentence",
    (kind, words) => {
      const key = calendarRuleKey(kind as OccasionRuleKind);
      expect(key === undefined ? undefined : at(EN, key)).toBe(words);
    },
  );

  it("covers the fourteen English guides", () => {
    expect(pages).toHaveLength(14);
  });

  for (const { locale, iso2, view, html } of pages) {
    it(`${locale}/${iso2}: every Rule cell is its row's sentence, no identifier, no code font`, () => {
      const rows = calendarRows(html);
      expect(rows.length, "the table's rows").toBe(view.occasions?.length);
      rows.forEach(([date, , , rule], index) => {
        const occasion = view.occasions?.[index];
        expect(date).toBe(occasion?.date);
        expect(text(rule)).toBe(RULE_WORDS[occasion?.ruleKind ?? "none"] ?? "");
        for (const identifier of IDENTIFIERS) {
          expect(text(rule)).not.toContain(identifier);
        }
      });
      const calendar =
        /<section[^>]*data-fo-corridor-calendar[^>]*>(.*?)<\/section>/su.exec(
          html,
        )?.[1] ?? "";
      expect(calendar).not.toMatch(/<(?:code|kbd|samp|pre|tt)\b/u);
      expect(calendar).not.toMatch(/font-mono/u);
    });
  }

  it("leaves a `none` row's Rule cell empty", () => {
    const first = poland.view.occasions?.[0];
    if (first === undefined) throw new Error("Poland has dated rows");
    const view: CorridorView = {
      ...poland.view,
      occasions: [{ ...first, ruleKind: "none" }],
    };
    const [row] = calendarRows(render(<CorridorPage view={view} />, "en"));
    expect(row?.[3]).toBe("");
  });

  it("prints the words in `de` and `pl` too (their drafts), never an identifier", () => {
    for (const locale of ["de", "pl"]) {
      const messages = readJson(`${locale}.json`);
      for (const kind of IDENTIFIERS) {
        const key = calendarRuleKey(kind as OccasionRuleKind);
        if (key === undefined) continue;
        const value = at(messages, key);
        expect(typeof value, `${locale} ${key}`).toBe("string");
        expect(IDENTIFIERS).not.toContain(value);
      }
    }
  });
});

describe("T-32 (unit): the first screen is the state and the calendar's first three rows (AC-31)", () => {
  for (const { locale, iso2, view, html } of pages) {
    it(`${locale}/${iso2}: the three cards are the table's first three rows, through formatDate`, () => {
      const cards = firstDates(html);
      const rows = calendarRows(html);
      expect(cards.map(([date]) => date)).toStrictEqual(
        rows.slice(0, 3).map(([date]) => date),
      );
      expect(cards).toHaveLength(Math.min(3, view.occasions?.length ?? 0));
      cards.forEach(([date, card], index) => {
        const parts = formatDateParts(
          new Date(`${date}T12:00:00Z`),
          locale,
          "UTC",
        );
        const value = formatDate(
          new Date(`${date}T12:00:00Z`),
          locale,
          "calendarDate",
          "UTC",
        );
        // Each part is a part of the one value the table's date cell prints.
        expect(text(rows[index]?.[2] ?? "")).toBe(value);
        expect(text(card)).toContain(
          `${parts.day} ${parts.month} · ${parts.weekday}`,
        );
        // The same occasion name the table's row header prints.
        expect(text(card)).toContain(text(rows[index]?.[1] ?? "!"));
      });
    });
  }

  it("prints the guide state's own text, from the view's state key", () => {
    const band = firstScreen(poland.html);
    const line = /<p[^>]*data-fo-corridor-state-line[^>]*>(.*?)<\/p>/su.exec(
      band,
    )?.[1];
    expect(text(line ?? "")).toBe(
      at(EN, "destinations.state.guideNotDelivering"),
    );
    // A view flipped to live says the live state instead: the line is data, not a literal.
    const live = render(
      <CorridorPage
        view={{
          ...poland.view,
          state: "live",
          stateKey: "destinations.state.deliveringNow",
        }}
      />,
      "en",
    );
    const liveLine =
      /<p[^>]*data-fo-corridor-state-line[^>]*>(.*?)<\/p>/su.exec(
        firstScreen(live),
      )?.[1];
    expect(text(liveLine ?? "")).toBe(
      at(EN, "destinations.state.deliveringNow"),
    );
  });

  it("puts the h1 first, then the state line, then the dates, then the intro", () => {
    const band = firstScreen(poland.html);
    const h1 = band.indexOf("<h1");
    const state = band.indexOf("data-fo-corridor-state-line");
    const dates = band.indexOf("data-fo-corridor-first-dates");
    const intro = band.indexOf(
      poland.view.intro.slice(0, 40).replaceAll("'", "&#x27;"),
    );
    expect(h1).toBeGreaterThan(-1);
    expect(state).toBeGreaterThan(h1);
    expect(dates).toBeGreaterThan(state);
    expect(intro).toBeGreaterThan(dates);
    // Nothing in `<main>` precedes the h1 but the breadcrumb.
    expect(poland.html.indexOf("<h1")).toBeLessThan(
      poland.html.indexOf("data-fo-corridor-state-line"),
    );
  });

  it("draws no photo slot, no image and no preload", () => {
    const band = firstScreen(poland.html);
    expect(band).not.toMatch(/<img\b|<picture\b|<link\b/u);
    // `Photo`'s own class word and the lead-photo marker, not a `rounded-photo-s` token.
    expect(band).not.toMatch(/class="(?:[^"]* )?photo[ "]|data-fo-lead-photo/u);
    expect(text(poland.html)).not.toContain("Photo slot");
    expect(poland.html).not.toMatch(/rel="preload"/u);
  });

  it("shows two cards for a two-row calendar, and the state line alone for none", () => {
    const two: CorridorView = {
      ...poland.view,
      occasions: poland.view.occasions?.slice(0, 2),
    };
    expect(firstDates(render(<CorridorPage view={two} />, "en"))).toHaveLength(
      2,
    );
    const none: CorridorView = {
      ...poland.view,
      occasions: undefined,
      undatedOccasions: undefined,
    };
    const html = render(<CorridorPage view={none} />, "en");
    const band = firstScreen(html);
    expect(band).not.toContain("data-fo-corridor-first-dates");
    expect(band).toContain("data-fo-corridor-state-line");
    expect(band).toContain("<h1");
  });
});

describe("T-33 (unit): the steps are the numbered route and the shop link is a pill (AC-32)", () => {
  const steps =
    /<section[^>]*data-fo-corridor-steps[^>]*>(.*?)<\/section>/su.exec(
      poland.html,
    )?.[1] ?? "";

  it("renders the steps as an ordered list with no 01/02/03 label and no hairline box", () => {
    expect(steps).toMatch(/<ol\b/u);
    expect(steps.match(/<li\b/gu) ?? []).toHaveLength(3);
    expect(text(steps)).not.toMatch(/\b0[1-3]\b/u);
    // No square hairline card: no element of the list draws a border on all four sides.
    expect(steps).not.toMatch(/class="[^"]*\bborder(?:-[0-9])?\b(?!-)[^"]*"/u);
  });

  it("renders the shop link as a pill, not a full-width bar", () => {
    const section =
      /<section[^>]*data-fo-corridor-shop[^>]*>(.*?)<\/section>/su.exec(
        poland.html,
      )?.[1] ?? "";
    const link = /<a\b[^>]*class="([^"]*)"/u.exec(section)?.[1] ?? "";
    expect(link.split(" ")).toContain("rounded-full");
    expect(link.split(" ")).not.toContain("w-full");
    expect(link.split(" ")).toContain("self-start");
  });
});

/**
 * Spec 004 T-40 for id A11 (AC-38): each `en` value equals its approved literal byte for byte, each
 * key ships `reviewed: false` (the founder attests, never an agent), and no value carries an em
 * dash.
 */
describe("T-40 (A11): the approved Rule-column strings (AC-38)", () => {
  const APPROVED = {
    "corridor.calendar.ruleFixed": "Same date every year",
    "corridor.calendar.ruleEaster": "Moves with Easter",
    "corridor.calendar.ruleWeekday": "A set weekday of the month",
  } as const;
  const meta = readJson("en.meta.json") as Record<
    string,
    { reviewed?: boolean; sourceHash?: string }
  >;

  it.each(Object.entries(APPROVED))("`%s` is %j, unreviewed", (key, value) => {
    expect(at(EN, key)).toBe(value);
    expect(meta[key]?.reviewed).toBe(false);
    expect(meta[key]?.sourceHash).toBe(
      createHash("sha256").update(value).digest("hex"),
    );
    for (const locale of ["en", "de", "pl"]) {
      expect(String(at(readJson(`${locale}.json`), key))).not.toContain("—");
    }
  });

  it("retires the photo slot's caption from every catalogue", () => {
    for (const file of ["en", "en-gb", "de", "pl"]) {
      expect(at(readJson(`${file}.json`), "corridor.photo")).toBeUndefined();
    }
  });
});
