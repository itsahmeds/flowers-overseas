/**
 * T-38 (spec 007 §14 A-orchestrator-2026-11-01b, AC-37; TASK-431): the destinations hub states its
 * country count from the data, never in words.
 *
 * `destinationsHub.seoDescription`, `.intro` and `.phoneIntro` take `{count}` in an ICU plural, and
 * the hub passes the length of the list `hubView(locale)` builds, in the page
 * (`DestinationsHubPage`) and in the route's `generateMetadata`. Three properties are pinned:
 *
 *  1. **The stated number is the listed rows**, in the page (the lede and the phone line) and in
 *     the meta description, in `en`, `en-gb`, `de` and `pl`, with the committed registry.
 *  2. **A fixture registry moves the number with no message or code change**: one more destination
 *     (a clone of the Netherlands under a code of its own, guide and all) states eight; fixtures of
 *     two and five destinations state the `pl` `few` and `many` forms; one states `one`.
 *  3. **No value of the three keys carries a country count**: no digit, no number word before the
 *     country noun, no "in Europe", in any catalogue.
 *
 * Red with the count written back into the `en` value (property 3, and property 1's "leading
 * number"); red with the count read from a constant (property 2's fixtures of 8, 2, 5 and 1).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages, MESSAGE_NAMESPACES } =
    await import("../../src/modules/i18n/messages.ts");
  return {
    setRequestLocale: (): void => undefined,
    getTranslations: ({
      locale,
      namespace,
    }: {
      locale: string;
      namespace?: string;
    }) =>
      Promise.resolve(
        createTranslator({
          locale,
          messages: loadMessages(locale, [...MESSAGE_NAMESPACES]),
          // The route asks for one namespace; the test translator takes it as given.
          ...(namespace === undefined
            ? {}
            : { namespace: namespace as "destinationsHub" }),
          timeZone: "UTC",
        }),
      ),
  };
});

const LOCALES = ["en", "en-gb", "de", "pl"] as const;
const KEYS = ["seoDescription", "intro", "phoneIntro"] as const;
const COUNTRIES_PATH = "../../src/config/countries.ts";
const SITE_LINKS_PATH = "../../src/config/site-links.ts";
const CONTENT_VIEW_PATH = "../../src/modules/geo/content/view.ts";
const PARTNERS_PATH = "../../src/modules/geo/partners.ts";

/** The extra destination of the "one more" fixture: the Netherlands' row under its own code. */
const EXTRA = "BE";
const TWIN = "NL";

function readMessages(file: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../../messages", file), "utf8"),
  ) as Record<string, unknown>;
}

function hubValue(locale: string, key: string): string | undefined {
  const hub = readMessages(`${locale}.json`)["destinationsHub"] as
    Record<string, unknown> | undefined;
  const value = hub?.[key];
  return typeof value === "string" ? value : undefined;
}

function text(html: string): string {
  return html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll(/\s+/g, " ")
    .trim();
}

/** The leading number of a stated line, read as the locale formats it. */
function leadingNumber(line: string): number | undefined {
  const match = /^(\d[\d\s.,  ]*)\s/u.exec(line);
  if (match?.[1] === undefined) return undefined;
  return Number(match[1].replaceAll(/[\s.,  ]/gu, ""));
}

/** The hub's own pieces of the rendered page: the rows it lists and the two lines that count them. */
interface Rendered {
  readonly rows: number;
  readonly lede: string;
  readonly phone: string;
}

/** Wraps every function export so `EXTRA` reads as its twin: the clone is the twin's data. */
function aliased<T extends Record<string, unknown>>(actual: T): T {
  const swap = (value: unknown): unknown => (value === EXTRA ? TWIN : value);
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [
      name,
      typeof value === "function"
        ? (...args: unknown[]) =>
            (value as (...rest: unknown[]) => unknown)(...args.map(swap))
        : value,
    ]),
  ) as T;
}

type CountriesModule = typeof import("../../src/config/countries.ts");

/** Off while modules load, on while the hub renders: see `withRegistry()`. */
let fixtureActive = false;

/**
 * Loads the hub page and the route against a fixture registry. `shape` receives the committed
 * `COUNTRIES` and returns the fixture's; `extra` turns on the `EXTRA` clone's lookups.
 */
async function withRegistry(
  shape: (
    countries: CountriesModule["COUNTRIES"],
  ) => CountriesModule["COUNTRIES"],
  extra = false,
): Promise<{
  render: (locale: string) => Rendered;
  description: (locale: string) => Promise<string>;
  listed: (locale: string) => number;
}> {
  fixtureActive = false;
  vi.resetModules();
  vi.doMock(COUNTRIES_PATH, async () => {
    const actual = await vi.importActual<CountriesModule>(COUNTRIES_PATH);
    const fixture = shape(actual.COUNTRIES);
    // The fixture is read at call time, after every module has loaded: the catalogue's own
    // import-time check (prices.data.ts: one price row per destination) runs against the
    // committed set, and `hubView()` (which reads `COUNTRIES` per call) sees the fixture.
    return Object.defineProperty(
      { ...(extra ? aliased(actual) : actual) },
      "COUNTRIES",
      {
        enumerable: true,
        get: () => (fixtureActive ? fixture : actual.COUNTRIES),
      },
    );
  });
  if (extra) {
    for (const path of [SITE_LINKS_PATH, CONTENT_VIEW_PATH, PARTNERS_PATH]) {
      vi.doMock(path, async () =>
        aliased(await vi.importActual<Record<string, unknown>>(path)),
      );
    }
  }
  const hub = await load();
  fixtureActive = true;
  return hub;
}

async function load(): Promise<{
  render: (locale: string) => Rendered;
  description: (locale: string) => Promise<string>;
  listed: (locale: string) => number;
}> {
  const { DestinationsHubPage, hubView } =
    await import("../../src/modules/geo/index.ts");
  const { loadMessages, localePath } =
    await import("../../src/modules/i18n/index.ts");
  const route = await import("../../src/app/[locale]/[segment]/page.tsx");

  const render = (locale: string): Rendered => {
    const messages = loadMessages(locale, [
      "meta",
      "a11y",
      "common",
      "breadcrumb",
      "destinations",
      "destinationsHub",
      "footer",
    ]);
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <DestinationsHubPage locale={locale} />
      </NextIntlClientProvider>,
    );
    const rows = new Set(
      [...html.matchAll(/data-fo-hub-destination="([A-Z]{2})"/g)].map(
        (match) => match[1],
      ),
    );
    const pills = new Set(
      [...html.matchAll(/data-fo-hub-pill="([A-Z]{2})"/g)].map(
        (match) => match[1],
      ),
    );
    // The page lists each destination once per surface; the pills (where drawn) list the same set.
    if (pills.size > 0) expect(pills).toEqual(rows);
    const lede = /data-fo-hub-lede[^>]*>([\s\S]*?)<\/div>/u.exec(html)?.[1];
    const phone = /id="destinations-phone-intro"[^>]*>([\s\S]*?)<\/p>/u.exec(
      html,
    )?.[1];
    return {
      rows: rows.size,
      lede: text(lede ?? ""),
      phone: text(phone ?? ""),
    };
  };

  const description = async (locale: string): Promise<string> => {
    const segment = localePath(locale, "destinations").split("/").at(-1) ?? "";
    const metadata = await route.generateMetadata({
      params: Promise.resolve({ locale, segment }),
    });
    return String(metadata.description ?? "");
  };

  const listed = (locale: string): number =>
    hubView(locale, (nameKey) => nameKey).destinations.length;

  return { render, description, listed };
}

beforeEach(() => {
  // `generateMetadata()` builds the canonical from the deployment's own origin.
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://flowersoverseas.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  fixtureActive = false;
  vi.resetModules();
  for (const path of [
    COUNTRIES_PATH,
    SITE_LINKS_PATH,
    CONTENT_VIEW_PATH,
    PARTNERS_PATH,
  ]) {
    vi.doUnmock(path);
  }
});

describe("T-38: the stated number is the listed rows, with the committed registry", () => {
  for (const locale of LOCALES) {
    it(`${locale}: the lede, the phone line and the meta description state the rows the page lists`, async () => {
      const { COUNTRIES } = await import("../../src/config/countries.ts");
      const hub = await load();
      const page = hub.render(locale);
      expect(page.rows, locale).toBe(COUNTRIES.length);
      expect(hub.listed(locale), locale).toBe(page.rows);
      expect(leadingNumber(page.lede), page.lede).toBe(page.rows);
      expect(leadingNumber(page.phone), page.phone).toBe(page.rows);
      const description = await hub.description(locale);
      expect(leadingNumber(description), description).toBe(page.rows);
    });
  }
});

describe("T-38: a fixture registry moves the number, with no message or code change", () => {
  it("one more destination with a guide: every locale states the number plus one, page and head", async () => {
    const committed = (await import("../../src/config/countries.ts")).COUNTRIES
      .length;
    const hub = await withRegistry(
      (countries) => [
        ...countries,
        ...countries
          .filter((country) => country.iso2 === TWIN)
          .map((country) => ({
            ...country,
            iso2: EXTRA as typeof country.iso2,
          })),
      ],
      true,
    );
    for (const locale of LOCALES) {
      const page = hub.render(locale);
      expect(page.rows, locale).toBe(committed + 1);
      expect(leadingNumber(page.lede), page.lede).toBe(committed + 1);
      expect(leadingNumber(page.phone), page.phone).toBe(committed + 1);
      expect(
        leadingNumber(await hub.description(locale)),
        `${locale} meta`,
      ).toBe(committed + 1);
    }
    // The clone is a destination with a guide where the twin has one: a link in `en`.
    const { hubView } = await import("../../src/modules/geo/index.ts");
    expect(
      hubView("en", (key) => key).destinations.find(
        (d) => (d.iso2 as string) === EXTRA,
      )?.href,
    ).toBeDefined();
  });

  const PL_FORMS: readonly (readonly [number, string, string])[] = [
    [1, "1 kraj z przewodnikiem", "1 kraj, a o nim"],
    [2, "2 kraje, każdy", "2 kraje, a o każdym"],
    [5, "5 krajów, każdy", "5 krajów, a o każdym"],
  ];
  for (const [size, phone, lede] of PL_FORMS) {
    it(`pl states ${size} with its own plural form (one, few, many)`, async () => {
      const hub = await withRegistry((countries) => countries.slice(0, size));
      const page = hub.render("pl");
      expect(page.rows).toBe(size);
      expect(page.phone.startsWith(phone), page.phone).toBe(true);
      expect(page.lede.startsWith(lede), page.lede).toBe(true);
      expect((await hub.description("pl")).startsWith(phone), "pl meta").toBe(
        true,
      );
    });
  }

  it("en states one country in the singular, and five in the plural", async () => {
    const one = await withRegistry((countries) => countries.slice(0, 1));
    expect(one.render("en").phone).toBe(
      "1 country with a guide we wrote ourselves.",
    );
    expect(await one.description("en")).toMatch(/^1 country with a guide/u);
    const five = await withRegistry((countries) => countries.slice(0, 5));
    expect(five.render("en").phone).toBe(
      "5 countries, each with a guide we wrote ourselves.",
    );
    expect(five.render("de").phone).toMatch(/^5 Länder, jedes mit/u);
  });

  it("a destination whose guide is withdrawn by data stays listed and counted", async () => {
    const committed = (await import("../../src/config/countries.ts")).COUNTRIES
      .length;
    vi.resetModules();
    vi.doMock(COUNTRIES_PATH, async () => {
      const actual = await vi.importActual<CountriesModule>(COUNTRIES_PATH);
      return {
        ...actual,
        isGuidePublished: (iso2: string) => iso2 !== "DE",
      };
    });
    const hub = await load();
    const page = hub.render("en");
    expect(page.rows).toBe(committed);
    expect(leadingNumber(page.lede)).toBe(committed);
  });
});

describe("T-38: no value of the three keys carries a country count", () => {
  const NUMBER_WORD =
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|ein|eine|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|jeden|jedna|dwa|dwie|trzy|cztery|pięć|sześć|siedem|osiem|dziewięć|dziesięć)\s+(?:countr|länd|land|kraj)/iu;

  for (const locale of LOCALES) {
    for (const key of KEYS) {
      it(`${locale} destinationsHub.${key}: no digit, no number word before the noun, no "in Europe"`, () => {
        const value = hubValue(locale, key);
        if (locale === "en-gb") {
          // `en-gb` inherits the English: an override would bypass the plural and the approval.
          expect(value).toBeUndefined();
          return;
        }
        expect(value, key).toBeDefined();
        expect(value, key).not.toMatch(/\d/u);
        expect(value, key).not.toMatch(NUMBER_WORD);
        expect(value, key).not.toMatch(
          /\b(?:in Europe|in Europa|w Europie)\b/iu,
        );
        expect(value, key).toMatch(/^\{count, plural, one \{# /u);
        // No em or en dash, and no spaced hyphen (spec 003 A-founder-2026-10-15a clause 4).
        expect(value, key).not.toMatch(/[–—]| - /u);
      });
    }
  }

  it("pl carries one, few, many and other; en and de carry one and other", () => {
    for (const key of KEYS) {
      expect(hubValue("pl", key)).toMatch(
        /one \{[^}]*\} few \{[^}]*\} many \{[^}]*\} other \{/u,
      );
      for (const locale of ["en", "de"]) {
        expect(hubValue(locale, key)).toMatch(/one \{[^}]*\} other \{/u);
      }
    }
  });
});

describe("T-38: the new English is unreviewed until the delegated record run", () => {
  const NEW_EN: Readonly<Record<(typeof KEYS)[number], string>> = {
    seoDescription:
      "{count, plural, one {# country with a guide we wrote ourselves} other {# countries, each with a guide we wrote ourselves}}: what is given, what is never given, and which dates matter in a year there.",
    intro:
      "{count, plural, one {# country, and we have written a guide to it} other {# countries, and we have written a guide to every one of them}}: what is given, what is never given, how an address is written, and which dates matter in a year there. We write the guide first and open delivery after it. Where we are not delivering yet, this page says so in the same words on every row.",
    phoneIntro:
      "{count, plural, one {# country with a guide we wrote ourselves} other {# countries, each with a guide we wrote ourselves}}.",
  };
  const DELEGATED =
    /^founder \(delegated\), \d{4}-\d{2}-\d{2}: recorded by the orchestrator with record-approval-431\.py /u;
  const hash = (value: string): string =>
    createHash("sha256").update(value).digest("hex");

  for (const key of KEYS) {
    it(`destinationsHub.${key}: the en text byte for byte, its hash in every manifest, de/pl machine drafts`, () => {
      expect(hubValue("en", key)).toBe(NEW_EN[key]);
      const meta = readMessages("en.meta.json")[`destinationsHub.${key}`] as {
        reviewed: boolean;
        reviewedBy?: string;
        source: string;
        sourceHash: string;
      };
      expect(meta.source).toBe("human");
      expect(meta.sourceHash).toBe(hash(NEW_EN[key]));
      // Never an implementer's tick: unreviewed, or the orchestrator's delegated record run.
      if (meta.reviewed) expect(meta.reviewedBy).toMatch(DELEGATED);
      else expect(meta.reviewedBy).toBeUndefined();
      for (const locale of ["de", "pl"]) {
        const draft = readMessages(`${locale}.meta.json`)[
          `destinationsHub.${key}`
        ] as { reviewed: boolean; source: string; sourceHash: string };
        expect(draft, `${locale} ${key}`).toEqual({
          source: "machine",
          reviewed: false,
          sourceHash: hash(NEW_EN[key]),
        });
        expect(hubValue(locale, key), `${locale} ${key}`).not.toBe(NEW_EN[key]);
      }
    });
  }
});
