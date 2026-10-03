/**
 * The locale home's hero, sentence picker and promise band — v2 "the letter home" (spec 004 §14
 * **A21** clause 4, AC-10, **AC-11**, AC-14, AC-15; TASK-177, superseding TASK-052's finder).
 *
 * Rendered with `react-dom/server` against the **real** `messages/*.json`, so the asserted copy is
 * the shipped copy in all four locales. AC-11 is asserted in both directions: the "open" branch
 * is the committed registry (Poland), and the flip is a mocked `countries.ts` — data, with no
 * file under `src/app/` involved (T-13). The route's own 303/no-store/noindex contract is
 * `tests/unit/api-send-route.test.ts`; the JavaScript-off submission is `tests/e2e/home.spec.ts`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { loadMessages } from "../../src/modules/i18n";
import { HomeHero } from "../../src/modules/ui/home/HomeHero.tsx";
import { PROOF_FACTS, ProofRow } from "../../src/modules/ui/home/ProofRow.tsx";
import { SentencePicker } from "../../src/modules/ui/home/SentencePicker.tsx";
import {
  SENTENCE_FIELDS,
  type SentenceLookups,
  SentenceQuerySchema,
  sentenceAction,
  sentenceTarget,
} from "../../src/modules/ui/home/sentence-model.ts";
import { setMediaManifest } from "../../src/modules/ui/media/manifest.ts";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

/** The namespaces the hero, the picker and the promise band read. */
const NAMESPACES = [
  "home",
  "finder",
  "destinations",
  "destinationsHub",
  "corridor",
  "occasions",
  "nav",
  "trust",
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

/** Poland's shop root exists in every launch locale (the committed catalogue). */
const SHOPS = ["PL"] as const;

const hero = (locale: string): string =>
  render(<HomeHero locale={locale} shopCountries={SHOPS} />, locale);

const picker = (locale: string, shops: readonly string[] = SHOPS): string =>
  render(<SentencePicker locale={locale} shopCountries={shops} />, locale);

/** The visible text of the rendered markup: tags stripped, entities decoded. */
function text(html: string): string {
  return html
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll(/\s+/g, " ");
}

/** Every submitted control name in the markup, in document order. */
function names(html: string): string[] {
  return [...html.matchAll(/\sname="([^"]*)"/g)].map((match) => match[1] ?? "");
}

/** The country `<option>`s as `[iso, label, disabled]`, in document order. */
function countryOptions(html: string): [string, string, boolean][] {
  return [
    ...html.matchAll(
      /<option([^>]*data-fo-sentence-destination="([A-Z]{2})"[^>]*)>([^<]*)<\/option>/g,
    ),
  ].map((match) => [
    match[2] ?? "",
    (match[3] ?? "").replaceAll("&#x27;", "'"),
    / disabled=""/.test(match[1] ?? ""),
  ]);
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../../src/config/countries.ts");
});

describe("the hero band (AC-10)", () => {
  it("renders exactly one `<h1>`, and it is the reviewed headline", () => {
    const html = hero("en");

    expect([...html.matchAll(/<h1/g)]).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Flowers for someone far away\.<\/h1>/);
  });

  it("renders the eyebrow and the proposition, florists in the future tense (A21 clause 7)", () => {
    const rendered = text(hero("en"));

    expect(rendered).toContain("International flower delivery");
    expect(rendered).toContain(
      "A local florist in your recipient's town will make it and hand it over in person. We never ship a box.",
    );
    expect(rendered).not.toMatch(/florist[^.]* (makes|hands) it/u);
  });

  it('carries the `#send` target the header\'s "Send flowers" link points at (TASK-176)', () => {
    const html = hero("en");

    expect([...html.matchAll(/ id="send"/g)]).toHaveLength(1);
    expect(html).toMatch(/<form id="send"[^>]* method="get"/);
  });

  it("fills the photo slot eagerly, at high priority, with one preload (spec 006 AC-19)", () => {
    const html = hero("en");

    expect(html).toContain('data-fo-media-asset="home-hero"');
    expect(html).toContain('loading="eager"');
    expect(html).toContain('fetchPriority="high"');
    expect([...html.matchAll(/rel="preload"/g)]).toHaveLength(1);
    expect([...html.matchAll(/<img/g)]).toHaveLength(1);
  });

  it("is the artboards' 4∶5 photograph on desktop and 4∶3 full-bleed on mobile", () => {
    const html = hero("en");

    expect(html).toContain("aspect-[4/5]");
    expect(html).toContain("max-md:aspect-[4/3]");
    expect(html).toContain("max-md:rounded-none");
  });

  it("falls back to the captioned box and no `<img>` when the dataset has no photograph", () => {
    const previous = setMediaManifest({ assets: [], variants: [], alt: {} });
    try {
      const html = hero("en");

      expect(html).not.toContain("<img");
      expect(html).toContain('data-fo-media-slot="hero"');
      expect(html).toContain("aspect-[4/5]");
    } finally {
      setMediaManifest(previous);
    }
  });

  it("draws the postmark as decoration, with no words in it", () => {
    const html = hero("en");
    const start = html.indexOf("data-fo-postmark");
    const postmark = html.slice(start, html.indexOf("</figure>", start));

    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*data-fo-postmark/);
    expect(postmark).not.toContain("<text");
  });

  it("holds the sentence picker, in every launch locale", () => {
    for (const locale of LOCALES) {
      const html = hero(locale);
      expect([...html.matchAll(/<h1/g)], locale).toHaveLength(1);
      expect(html, locale).toContain("data-fo-sentence");
    }
  });
});

describe("the sentence picker (A21 clause 4, AC-11, T-12, T-13)", () => {
  it("is a server-rendered GET form to the `/api/send/{locale}` route, named by its heading", () => {
    const html = picker("pl");

    const form = /<form [^>]*>/.exec(html)?.[0] ?? "";
    expect(form).toContain('id="send"');
    expect(form).toContain('method="get"');
    expect(form).toContain('action="/api/send/pl"');
    expect(form).toContain('aria-labelledby="send-heading"');
    expect(html).toMatch(
      /<h2 id="send-heading"[^>]*>Where we can send flowers<\/h2>/,
    );
    expect(sentenceAction("en-gb")).toBe("/api/send/en-gb");
  });

  it("submits exactly two fields, `country` and `occasion`, and nothing that names a person", () => {
    const html = picker("en");

    expect(names(html)).toEqual([
      SENTENCE_FIELDS.country,
      SENTENCE_FIELDS.occasion,
    ]);
    expect(names(html)).toEqual(["country", "occasion"]);
  });

  it("labels each select with a real `<label for>`", () => {
    const html = picker("en");

    expect(html).toMatch(/<label for="send-country"[^>]*>Country<\/label>/);
    expect(html).toMatch(/<label for="send-occasion"[^>]*>Occasion<\/label>/);
    expect(html).toContain('<select id="send-country" name="country"');
    expect(html).toContain('<select id="send-occasion" name="occasion"');
  });

  it("lists the seven destinations in `collator(locale)` order (pl and en)", () => {
    expect(countryOptions(picker("pl")).map(([iso]) => iso)).toEqual([
      "FR",
      "ES",
      "NL",
      "DE",
      "PL",
      "RO",
      "IT",
    ]);
    expect(countryOptions(picker("en")).map(([iso]) => iso)).toEqual([
      "FR",
      "DE",
      "IT",
      "NL",
      "PL",
      "RO",
      "ES",
    ]);
  });

  it('opens Poland, selected, and says "not yet" in words for the six others', () => {
    const html = picker("en");
    const options = countryOptions(html);

    expect(options.find(([iso]) => iso === "PL")).toEqual([
      "PL",
      "Poland",
      false,
    ]);
    expect(options.filter(([, , disabled]) => disabled)).toHaveLength(6);
    expect(options.find(([iso]) => iso === "DE")).toEqual([
      "DE",
      "Germany (not yet)",
      true,
    ]);
    expect(html).toMatch(/<option value="PL"[^>]* selected=""/);
  });

  it("closes Poland too when its shop root does not exist here", () => {
    const options = countryOptions(picker("en", []));

    expect(options.filter(([, , disabled]) => disabled)).toHaveLength(7);
  });

  it("lists the six home occasions in registry order, by id, worded by their names", () => {
    const html = picker("en");
    const occasions = [
      ...html.matchAll(/<option value="([a-zA-Z]+)">([^<]*)<\/option>/g),
    ].map((match) => [match[1], match[2]]);

    expect(occasions).toEqual([
      ["birthday", "Birthday"],
      ["nameDay", "Name day"],
      ["anniversary", "Anniversary"],
      ["sympathy", "Sympathy"],
      ["justBecause", "Just because"],
      ["newBaby", "New baby"],
    ]);
  });

  it("opens a destination when the registry makes it live, with no change under `src/app/` (T-13)", async () => {
    vi.doMock("../../src/config/countries.ts", async () => {
      const actual = await vi.importActual<
        typeof import("../../src/config/countries.ts")
      >("../../src/config/countries.ts");
      return {
        ...actual,
        countryConfig: (iso2: Parameters<typeof actual.countryConfig>[0]) =>
          iso2 === "DE"
            ? { ...actual.countryConfig(iso2), status: "live" as const }
            : actual.countryConfig(iso2),
      };
    });
    const { SentencePicker: Flipped } =
      await import("../../src/modules/ui/home/SentencePicker.tsx");
    const html = render(
      <Flipped locale="en" shopCountries={["PL", "DE"]} />,
      "en",
    );

    expect(countryOptions(html).find(([iso]) => iso === "DE")).toEqual([
      "DE",
      "Germany",
      false,
    ]);
  });

  it("closes Poland when its corridor page is unpublished, from the same flag", async () => {
    vi.doMock("../../src/config/countries.ts", async () => {
      const actual = await vi.importActual<
        typeof import("../../src/config/countries.ts")
      >("../../src/config/countries.ts");
      return {
        ...actual,
        isCorridorPagePublished: (iso2: string) => iso2 !== "PL",
      };
    });
    const { SentencePicker: Flipped } =
      await import("../../src/modules/ui/home/SentencePicker.tsx");
    const html = render(<Flipped locale="en" shopCountries={["PL"]} />, "en");

    expect(countryOptions(html).find(([iso]) => iso === "PL")).toEqual([
      "PL",
      "Poland (not yet)",
      true,
    ]);
  });

  it("renders in every launch locale", () => {
    for (const locale of LOCALES) {
      expect(countryOptions(picker(locale)), locale).toHaveLength(7);
    }
  });
});

describe("`sentenceTarget()` — where a submission lands (A21 clause 4, T-12)", () => {
  const calls: string[] = [];
  const lookups: SentenceLookups = {
    shopRoot: (iso2) => {
      calls.push(`shop:${iso2}`);
      return Promise.resolve(
        iso2 === "PL" ? "/pl/polska/kwiaty" : `/pl/${iso2}/kwiaty`,
      );
    },
    occasionPage: (iso2, key) => {
      calls.push(`occasion:${iso2}:${key}`);
      return Promise.resolve(
        iso2 === "PL" && key === "birthday"
          ? "/pl/polska/kwiaty/kwiaty-na-urodziny"
          : undefined,
      );
    },
  };
  const target = (search: string): Promise<string> =>
    sentenceTarget(
      "pl",
      SentenceQuerySchema.parse(
        Object.fromEntries(new URLSearchParams(search)),
      ),
      lookups,
    );

  it("lands Poland + birthday on Poland's birthday page, with no query string", async () => {
    calls.length = 0;
    await expect(target("country=PL&occasion=birthday")).resolves.toBe(
      "/pl/polska/kwiaty/kwiaty-na-urodziny",
    );
    expect(calls).toEqual(["shop:PL", "occasion:PL:birthday"]);
  });

  it("asks the catalogue by catalogue key, not by tile id", async () => {
    calls.length = 0;
    await target("country=PL&occasion=nameDay");
    expect(calls).toEqual(["shop:PL", "occasion:PL:name_day"]);
  });

  it("falls back to the shop root when the occasion has no page, or none was chosen", async () => {
    await expect(target("country=PL&occasion=nameDay")).resolves.toBe(
      "/pl/polska/kwiaty",
    );
    await expect(target("country=PL")).resolves.toBe("/pl/polska/kwiaty");
    await expect(target("country=PL&occasion=wedding")).resolves.toBe(
      "/pl/polska/kwiaty",
    );
  });

  it("sends an unknown, malformed, missing or not-yet country to the destinations hub", async () => {
    for (const search of [
      "country=XX&occasion=birthday",
      "country=pl&occasion=birthday",
      "country=POL",
      "occasion=birthday",
      "",
      "country=DE&occasion=birthday",
    ]) {
      await expect(target(search), search).resolves.toBe("/pl/wyslij-kwiaty");
    }
  });

  it("sends an open country with no shop root to the hub", async () => {
    await expect(
      sentenceTarget(
        "en",
        { country: "PL", occasion: "birthday" },
        {
          shopRoot: () => Promise.resolve(undefined),
          occasionPage: () =>
            Promise.resolve("/en/poland/flowers/birthday-flowers"),
        },
      ),
    ).resolves.toBe("/en/send-flowers-to");
  });

  it("parses only the two fields, so a relationship never reaches the answer", () => {
    expect(
      SentenceQuerySchema.parse(
        Object.fromEntries(
          new URLSearchParams("country=PL&occasion=birthday&who=mum&name=Ola"),
        ),
      ),
    ).toEqual({ country: "PL", occasion: "birthday" });
  });
});

describe("the promise band (AC-10's trust strip in v2, AC-15)", () => {
  const band = (locale: string): string => render(<ProofRow />, locale);

  it('renders the four facts under the reviewed "Our promise" heading', () => {
    const rendered = text(band("en"));

    expect(PROOF_FACTS).toHaveLength(4);
    expect(band("en")).toMatch(
      /<h2 id="promise-heading"[^>]*>Our promise<\/h2>/,
    );
    for (const fragment of [
      "Fresh-on-arrival guarantee",
      "We redeliver or refund, your choice",
      "The price you see is what we charge",
      "Delivery and VAT already in it",
    ]) {
      expect(rendered, fragment).toContain(fragment);
    }
  });

  it("claims no seven-day term and invents no number", () => {
    const rendered = text(band("en"));

    expect(rendered).not.toMatch(/\d/);
    expect(rendered.toLowerCase()).not.toContain("7-day");
  });

  it("is the inverse surface with four facts and no photo", () => {
    const html = band("en");

    expect(html).toContain("surface-inverse");
    expect([...html.matchAll(/<li/g)]).toHaveLength(4);
    expect(html).not.toContain("<img");
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
    "network",
  ];

  it("uses none of the nine banned words in any locale's home-page copy", () => {
    for (const locale of LOCALES) {
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

  it("claims no delivery in Poland today and no country count", () => {
    const messages = JSON.stringify(loadMessages("en", ["finder", "home"]));
    expect(messages).not.toContain("Poland today");
    expect(messages).not.toMatch(/\b(seven|7) countries\b/i);
  });
});
