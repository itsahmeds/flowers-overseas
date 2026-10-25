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
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { bannedVoiceWordsIn } from "../../src/config/voice.ts";
import { loadMessages } from "../../src/modules/i18n";
import { DestinationsGrid } from "../../src/modules/ui/home/DestinationsGrid.tsx";
import { HomeFaq } from "../../src/modules/ui/home/HomeFaq.tsx";
import { HOME_BLEED, HomeHero } from "../../src/modules/ui/home/HomeHero.tsx";
import { HomeComingUp } from "../../src/modules/ui/home/HomeComingUp.tsx";
import { HomeOccasionTabs } from "../../src/modules/ui/home/HomeOccasionTabs.tsx";
import { HomePriceWords } from "../../src/modules/ui/home/HomePriceWords.tsx";
import { HomeSelection } from "../../src/modules/ui/home/HomeSelection.tsx";
import type { HomeView } from "../../src/modules/ui/home/home-view.ts";
import { HowItWorks } from "../../src/modules/ui/home/HowItWorks.tsx";
import { PROOF_FACTS, ProofRow } from "../../src/modules/ui/home/ProofRow.tsx";
import { ReviewsSection } from "../../src/modules/ui/home/ReviewsSection.tsx";
import { SentencePicker } from "../../src/modules/ui/home/SentencePicker.tsx";
import {
  SENTENCE_FIELDS,
  SENTENCE_WHO,
  type SentenceLookups,
  SentenceQuerySchema,
  sentenceAction,
  sentenceTarget,
} from "../../src/modules/ui/home/sentence-model.ts";
import { setMediaManifest } from "../../src/modules/ui/media/manifest.ts";

import { dayCountIn } from "../support/day-count.ts";

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
  "faq",
  "media",
  "a11y",
  "common",
  "shop",
  "catalog",
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

/** The picker as `homeView()` hands it in: two buttons, two datalist names. */
const PICKER: HomeView["picker"] = {
  action: "/api/choose/en",
  chips: [
    { code: "fr", name: "France" },
    { code: "pl", name: "Poland" },
  ],
  datalist: ["France", "Poland"],
};

const hero = (locale: string, notOpen = true): string =>
  render(
    <HomeHero locale={locale} picker={PICKER} notOpen={notOpen} />,
    locale,
  );

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

/** The `<option>`s of one select, as `[value, text, attributes]`, in document order. */
function optionsOf(html: string, selectId: string): [string, string, string][] {
  const start = html.indexOf(`<select id="${selectId}"`);
  const select = html.slice(start, html.indexOf("</select>", start));
  return [
    ...select.matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g),
  ].map((match) => [
    match[1] ?? "",
    (match[3] ?? "").replaceAll("&#x27;", "'"),
    match[2] ?? "",
  ]);
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

describe("the hero band, v3 (spec 004 §14 A-founder-2026-10-24a item 4.2; TASK-386)", () => {
  it("renders exactly one `<h1>`, and it is the reviewed headline", () => {
    const html = hero("en");

    expect([...html.matchAll(/<h1/g)]).toHaveLength(1);
    // The reviewed words, with the one italic phrase in `<em>` (TASK-231; spec 004 §14 A21), and
    // after its words motion 5's decorative underline (TASK-283), which adds no text.
    expect(html).toMatch(
      /<h1[^>]*>Flowers for someone <em data-fo-em="">far away\.<svg aria-hidden="true"[^>]*><path [^>]*><\/path><\/svg><\/em><\/h1>/,
    );
  });

  it("renders the eyebrow and the founder-reviewed proposition, byte for byte", () => {
    const rendered = text(hero("en"));

    expect(rendered).toContain("International flower delivery");
    // The founder, 2026-10-04: "dont say will just keep makes". The reviewed present-tense
    // sentence stays exactly as attested on 2026-09-09.
    expect(rendered).toContain(
      "Our florist in your recipient's town makes it and hands it over in person. We never ship a box.",
    );
    expect(rendered).not.toMatch(/\bwill make\b/u);
  });

  it("holds the picker: a GET form to the chooser with the shop buttons, the field and the remember line", () => {
    const html = hero("en");
    const form = /<form [^>]*>/u.exec(html)?.[0] ?? "";

    expect(form).toContain('action="/api/choose/en"');
    expect(form).toContain('method="get"');
    expect(form).toContain("data-fo-home-picker");
    // No history hook on the home: Back from the shop root returns here.
    expect(form).not.toContain("data-fo-choose=");
    expect(
      [...html.matchAll(/data-fo-choose-chip="([a-z]{2})"/gu)].map((m) => m[1]),
    ).toStrictEqual(["fr", "pl"]);
    const field = /<input [^>]*type="search"[^>]*>/u.exec(html)?.[0] ?? "";
    expect(field).toContain('name="to"');
    expect(field).toContain('list="fo-countries"');
    expect(text(html)).toContain("Where should the flowers go?");
    expect(text(html)).toContain("Show prices");
    expect(text(html)).toContain(
      "We will remember this country on this device. Change it any time under Sending to.",
    );
    // The header's "Send flowers" still lands on it.
    expect([...html.matchAll(/ id="send"/g)]).toHaveLength(1);
  });

  it("states that ordering is not open, and the no-money line once, beside the picker", () => {
    const html = hero("en");

    expect([...html.matchAll(/data-fo-no-money=""/gu)]).toHaveLength(1);
    expect(text(html)).toContain(
      "We show no price on this page, because the price depends on where the flowers are going.",
    );
    expect(html).toContain("data-fo-home-state");
    // With a destination open, the state line is data and leaves.
    expect(hero("en", false)).not.toContain("data-fo-home-state");
  });

  it("makes the photograph the LCP candidate from `md` up only, with one preload carrying that `media`", () => {
    const html = hero("en");

    expect(html).toContain('data-fo-media-asset="home-hero"');
    expect(html).toContain('fetchPriority="high"');
    expect([...html.matchAll(/rel="preload"/g)]).toHaveLength(1);
    expect(html).toMatch(
      /rel="preload"[^>]*media="\(min-width: 48rem\)"|media="\(min-width: 48rem\)"[^>]*rel="preload"/u,
    );
    // Below `md` the box is not drawn: no photograph above the first product on a phone.
    const box =
      /<div class="([^"]*)" data-fo-home-photo=/u.exec(html)?.[1] ?? "";
    expect(box.split(/\s+/u)).toEqual(
      expect.arrayContaining(["max-md:hidden", "h-[370px]"]),
    );
  });

  it("falls back to the captioned box and no `<img>` when the dataset has no photograph", () => {
    const previous = setMediaManifest({ assets: [], variants: [], alt: {} });
    try {
      const html = hero("en");

      expect(html).not.toContain("<img");
      expect(html).toContain('data-fo-media-slot="hero"');
      expect(html).toMatch(/data-fo-media-placeholder="[^"]+"/u);
    } finally {
      setMediaManifest(previous);
    }
  });

  it("draws one card with the airmail edge, the picker, and no round-1 device (A24 clause 7)", () => {
    const html = hero("en");

    expect([...html.matchAll(/airmail-edge/gu)]).toHaveLength(1);
    expect(html).toMatch(/<form [^>]*class="airmail-edge[^"]*"/u);
    expect(html).not.toContain("data-fo-postmark");
    expect(html).not.toContain("--tilt-");
  });

  it("puts the hero on the page frame: the logo's edge at every width (AC-31)", async () => {
    const layout = await import("../../src/modules/ui/primitives/layout.tsx");
    expect(layout.PAGE_FRAME).toContain(
      "max-w-[calc(var(--container-page)+2*var(--gutter))]",
    );
    expect(hero("en")).toContain(HOME_BLEED);
    expect(HOME_BLEED).toBe(
      "px-(--gutter-s) md:px-[max(var(--gutter),calc((100%-var(--container-page))/2))]",
    );
  });

  it("renders in every launch locale, with no sentence picker", () => {
    for (const locale of LOCALES) {
      const html = hero(locale);
      expect([...html.matchAll(/<h1/g)], locale).toHaveLength(1);
      expect(html, locale).not.toContain("data-fo-sentence");
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
    // The founder's heading (copy batch, 2026-10-04).
    expect(picker("en")).toMatch(
      /<h2 id="send-heading"[^>]*>Start with who it(?:&#x27;|')s for<\/h2>/,
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

  it.each([
    ["de", "Polen", "Deutschland (not yet)"],
    ["pl", "Polska", "Niemcy (not yet)"],
  ])(
    '%s: Poland open, and every other country says "not yet" in words, not by greying alone (H1)',
    (locale, poland, germany) => {
      const options = countryOptions(picker(locale));

      expect(options.find(([iso]) => iso === "PL")).toEqual([
        "PL",
        poland,
        false,
      ]);
      expect(options.find(([iso]) => iso === "DE")).toEqual([
        "DE",
        germany,
        true,
      ]);
      const closed = options.filter(([, , disabled]) => disabled);
      expect(closed).toHaveLength(6);
      for (const [iso, label] of closed) {
        expect(label, iso).toMatch(/ \(not yet\)$/u);
      }
    },
  );

  /**
   * The whole value → label map of the who select, per catalogue (PR 174 breaker round 2, hole 1).
   * In de and pl the partner option is the select's `other` case (A22 (i): no "partner" there),
   * so `other` is not a neutral fallback in those catalogues: every id is pinned to its own words,
   * and a swapped pair, a lost case or a new id that fell through to `other` goes red.
   */
  const WHO_LABELS: Record<
    (typeof LOCALES)[number],
    Record<(typeof SENTENCE_WHO)[number]["id"], string>
  > = {
    en: {
      mum: "my mum",
      dad: "my dad",
      grandma: "my grandma",
      grandad: "my grandad",
      partner: "my partner",
      friend: "a friend",
      someoneILove: "someone I love",
    },
    "en-gb": {
      mum: "my mum",
      dad: "my dad",
      grandma: "my grandma",
      grandad: "my grandad",
      partner: "my partner",
      friend: "a friend",
      someoneILove: "someone I love",
    },
    de: {
      mum: "meine Mama",
      dad: "meinen Papa",
      grandma: "meine Oma",
      grandad: "meinen Opa",
      partner: "meinen Schatz",
      friend: "jemanden aus dem Freundeskreis",
      someoneILove: "einen lieben Menschen",
    },
    pl: {
      mum: "mojej mamy",
      dad: "mojego taty",
      grandma: "mojej babci",
      grandad: "mojego dziadka",
      partner: "mojej drugiej połówki",
      friend: "przyjaciela lub przyjaciółki",
      someoneILove: "ukochanej osoby",
    },
  };

  describe.each(LOCALES)("%s: the who select", (locale) => {
    const options = (): Map<string, string> =>
      new Map(
        optionsOf(picker(locale), "send-who").map(([value, label]) => [
          value,
          label,
        ]),
      );

    it.each(SENTENCE_WHO.map(({ id }) => id))(
      "renders %s with its own pinned words",
      (id) => {
        expect(options().get(id)).toBe(WHO_LABELS[locale][id]);
      },
    );

    it("offers every id once, each with distinct words", () => {
      const map = options();
      expect([...map.keys()]).toEqual(SENTENCE_WHO.map(({ id }) => id));
      expect(new Set(map.values()).size).toBe(SENTENCE_WHO.length);
    });
  });

  it("closes Poland too when its shop root does not exist here", () => {
    const options = countryOptions(picker("en", []));

    expect(options.filter(([, , disabled]) => disabled)).toHaveLength(7);
  });

  it("reads as the founder's sentence: Send flowers to [who] in [country] for [occasion].", () => {
    const html = picker("en");

    expect(html).toMatch(
      /<p[^>]*>Send flowers to <span[^>]*>(?:(?!<\/p>)[\s\S])*?<select id="send-who"[\s\S]*?<\/select><\/span> in <span[^>]*>[\s\S]*?<select id="send-country"[\s\S]*?<\/select><\/span> for <span[^>]*>[\s\S]*?<select id="send-occasion"[\s\S]*?<\/select><\/span>\.<\/p>/,
    );
  });

  it("offers the founder's people, unnamed and never submitted, labelled by the heading", () => {
    const html = picker("en");
    const select = /<select id="send-who"[^>]*>/.exec(html)?.[0] ?? "";

    expect(select).not.toContain(" name=");
    expect(select).toContain('aria-labelledby="send-heading"');
    expect(
      optionsOf(html, "send-who").map(([value, label]) => [value, label]),
    ).toEqual([
      ["mum", "my mum"],
      ["dad", "my dad"],
      ["grandma", "my grandma"],
      ["grandad", "my grandad"],
      ["partner", "my partner"],
      ["friend", "a friend"],
      ["someoneILove", "someone I love"],
    ]);
    expect(html).toMatch(/<option value="mum"[^>]* selected=""/);
  });

  it("labels the occasions for the default person, so the sentence reads right with JavaScript off", () => {
    expect(
      optionsOf(picker("en"), "send-occasion").map(([value, label]) => [
        value,
        label,
      ]),
    ).toEqual([
      ["birthday", "her birthday"],
      ["nameDay", "her name day"],
      ["anniversary", "her anniversary"],
      ["sympathy", "a loss"],
      ["justBecause", "no reason at all"],
      ["newBaby", "a new baby"],
    ]);
  });

  it("labels a partner's occasions in the natural form: their birthday, their anniversary", () => {
    const html = render(
      <>
        {/* The island's swap, done on the server: the partner's pronoun picks the forms. */}
        <SentencePicker locale="en" shopCountries={SHOPS} />
      </>,
      "en",
    );
    const options = optionsOf(html, "send-occasion");
    const theirOf = (value: string): string | undefined =>
      /data-label-their="([^"]*)"/.exec(
        options.find(([id]) => id === value)?.[2] ?? "",
      )?.[1];

    expect(theirOf("birthday")).toBe("their birthday");
    expect(theirOf("anniversary")).toBe("their anniversary");
    expect(theirOf("sympathy")).toBe("a loss");
  });

  it("carries every possessive form for the island to swap, from one ICU select", () => {
    const birthday = optionsOf(picker("en"), "send-occasion")[0]?.[2] ?? "";

    expect(birthday).toContain('data-label-her="her birthday"');
    expect(birthday).toContain('data-label-his="his birthday"');
    expect(birthday).toContain('data-label-their="their birthday"');
    // Each person names the form their occasions take.
    expect(
      optionsOf(picker("en"), "send-who").map(([value, , attributes]) => [
        value,
        /data-pronoun="([a-z]+)"/.exec(attributes)?.[1],
      ]),
    ).toEqual([
      ["mum", "her"],
      ["dad", "his"],
      ["grandma", "her"],
      ["grandad", "his"],
      ["partner", "their"],
      ["friend", "their"],
      ["someoneILove", "their"],
    ]);
  });

  it("orders the selects the way each language reads (pl: who, occasion, country)", () => {
    const html = picker("pl");
    const order = [...html.matchAll(/<select id="(send-[a-z]+)"/g)].map(
      (match) => match[1],
    );

    expect(order).toEqual(["send-who", "send-occasion", "send-country"]);
    expect(optionsOf(html, "send-occasion")[0]?.[1]).toBe("na jej urodziny");
  });

  it("mounts one island that reads only the DOM: no copy, no storage, no network", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/modules/ui/home/SentenceIsland.tsx", "utf8"),
    );

    expect(source.trimStart().startsWith('"use client";')).toBe(true);
    for (const forbidden of [
      "next-intl",
      "fetch(",
      "sessionStorage",
      "localStorage",
      "document.cookie",
      "XMLHttpRequest",
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    expect(source).toMatch(/import \{ useEffect \} from "react";/);
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

  it('renders three facts under the reviewed "Our promise" heading, the guarantee as the founder worded it', () => {
    const rendered = text(band("en"));

    expect(PROOF_FACTS).toHaveLength(3);
    expect(band("en")).toMatch(
      /<h2 id="promise-heading"[^>]*>Our <em data-fo-em="">promise<\/em><\/h2>/,
    );
    expect(rendered).toContain("Fresh-flower promise");
    expect(rendered).toContain(
      "If your flowers don't arrive fresh and in good condition, send us a photo within 72 hours of delivery and we'll replace them or refund you in full.",
    );
  });

  it("promises no day count and invents no number beyond the guarantee's 72 hours", () => {
    const rendered = text(band("en"));

    expect(rendered.replace("72 hours", "")).not.toMatch(/\d/);
    // Every locale, with the widened matcher: spelled numbers, words between, week words (H4).
    for (const locale of LOCALES) {
      expect(dayCountIn(text(band(locale))), locale).toBeUndefined();
    }
  });

  it("is round 2's three cards on paper, the guarantee first on leaf-wash, and no photo (TASK-196)", () => {
    const html = band("en");

    expect(html).not.toContain("surface-inverse");
    expect([...html.matchAll(/<li/g)]).toHaveLength(3);
    expect(
      /<li class="([^"]*)"[^>]*data-fo-trust-claim="guarantee"/u.exec(
        html,
      )?.[1],
    ).toContain("bg-leaf-wash");
    expect(html).not.toContain("<img");
  });

  it("draws as many desktop columns as it has facts, so no empty cell shows the rule colour", () => {
    // Baseline run 37171984787: with the price fact gone, a four-column grid left a blank
    // ink-muted cell at the inline end of the band.
    const list = /<ul class="([^"]*)"/.exec(band("en"))?.[1] ?? "";

    expect(list.split(/\s+/).filter((c) => /grid-cols-\d/.test(c))).toEqual([
      "grid-cols-1",
      `md:grid-cols-${String(PROOF_FACTS.length)}`,
    ]);
  });
});

describe("the home says nothing about VAT or delivery being included, but the one no-money line (founder, 2026-10-04; spec 004 §14 A-founder-2026-10-24a item 2)", () => {
  // "Every price includes VAT and delivery. dont write this on home": the home shows no price,
  // so no section of it may carry an inclusion claim, in any locale. One sentence is the later
  // ruling's: item 2 puts the reviewed `shop.hub.noMoney` once on every country-less page, the
  // home included ("Choose a destination and every price you see there includes VAT and
  // delivery"), which explains the absence rather than claiming a price. It is the one
  // `[data-fo-no-money]` element and is taken out before the sweep. The header's utility strip is
  // the chrome's (TASK-176) and is not rendered here.
  const views = new Map<string, HomeView>();
  beforeAll(async () => {
    const { homeView } = await import("../../src/modules/catalog/home.ts");
    for (const locale of LOCALES) views.set(locale, await homeView(locale));
  });
  const viewOf = (locale: string): HomeView => {
    const view = views.get(locale);
    if (view === undefined) throw new Error(`no view for ${locale}`);
    return view;
  };
  const withoutNoMoney = (html: string): string =>
    html.replace(/<p [^>]*data-fo-no-money=""[^>]*>[^<]*<\/p>/u, "");
  const home = (locale: string, withDates = true): string => {
    const view = viewOf(locale);
    return render(
      <>
        <HomeHero locale={locale} picker={view.picker} notOpen={view.notOpen} />
        <HomeSelection selection={view.selection} />
        <HomeOccasionTabs occasions={view.occasions} />
        <HomePriceWords bands={view.priceBands} />
        {withDates ? <HomeComingUp comingUp={view.comingUp} /> : null}
        <ReviewsSection locale={locale} />
        <DestinationsGrid locale={locale} />
        <HowItWorks short />
        <HomeFaq />
      </>,
      locale,
    );
  };

  /**
   * A token denylist per locale, over the rendered text (PR 174 breaker H3): any word that taxes,
   * VAT, an inclusion or a delivery charge would need, not a list of sentences someone might
   * write. The home's own copy is free to say "delivered" and "delivery": the founder's guarantee
   * does ("72 hours of delivery"), so delivery is denied only in the charge and inclusion forms.
   */
  const PRICE_TALK: Record<(typeof LOCALES)[number], RegExp> = {
    en: /\b(?:vat|tax|taxes|taxed|duty|duties|delivery (?:charge|fee|cost)s?|shipping|postage|includ\w* (?:\w+ )?delivery|delivery(?:'s| is| are)? included)\b/iu,
    "en-gb":
      /\b(?:vat|tax|taxes|taxed|duty|duties|delivery (?:charge|fee|cost)s?|shipping|postage|includ\w* (?:\w+ )?delivery|delivery(?:'s| is| are)? included)\b/iu,
    de: /MwSt|Mehrwertsteuer|Steuer|Abgabe|inkl\.|inklusive|inbegriffen|einschließlich|enthalten|zzgl|zuzüglich|Endpreis|Gesamtpreis|Versand|Zustellung|Porto|Gebühr|Lieferung(?:skosten)?\b|Lieferkosten/iu,
    pl: /\bVAT\b|podat|dostaw|wliczon|w cenie|opłat|koszt|zawiera(?:ją)? (?:dostaw|VAT)/iu,
  };

  it("renders no tax, VAT or delivery-charge word in any of the four locales (H3)", () => {
    for (const locale of LOCALES) {
      const html = home(locale);
      expect([...html.matchAll(/data-fo-no-money=""/gu)], locale).toHaveLength(
        1,
      );
      const rendered = text(withoutNoMoney(html));
      expect(rendered, locale).not.toMatch(PRICE_TALK[locale]);
      // The sections are really there, so the absence is not an empty render.
      expect(rendered.length, locale).toBeGreaterThan(1500);
    }
  });

  it("renders none of the price-claim messages, in any locale", () => {
    for (const locale of LOCALES) {
      const messages = loadMessages(locale, ["catalog", "nav"]) as {
        catalog: { price: Record<string, string> };
        nav: { utility: Record<string, string> };
      };
      const rendered = text(withoutNoMoney(home(locale)));
      const claims = [
        messages.nav.utility.pricesInclude ?? "",
        messages.catalog.price.inclusive ?? "",
      ];
      for (const claim of claims) {
        expect(claim, locale).not.toBe("");
        expect(rendered, `${locale}: ${claim}`).not.toContain(claim);
      }
    }
  });

  /**
   * The whole home, in the page's order, less "Coming up" (PR 174 breaker round 2, hole 4): its
   * occasions print real dates ("Fri 25 Dec"), which a day-count matcher reads as a count.
   * Everything else a reader sees on the home is swept.
   */
  it("promises no day count anywhere on the home, in any locale (hole 4)", () => {
    for (const locale of LOCALES) {
      // Element by element: a card's "… each one" beside the "Birthday" tab is two elements, not
      // a count of days, so a tag boundary breaks a match ("|" is no separator the matcher reads).
      const rendered = text(home(locale, false).replaceAll(/<[^>]*>/gu, " | "));
      expect(rendered.length, locale).toBeGreaterThan(1500);
      expect(dayCountIn(rendered), locale).toBeUndefined();
    }
  });

  it("the denylist bites on the breaker's sentences and spares the guarantee's own words", () => {
    expect("Lieferung und Steuern inklusive").toMatch(PRICE_TALK.de);
    expect("Cena obejmuje dostawę i podatek").toMatch(PRICE_TALK.pl);
    expect("delivery and tax included").toMatch(PRICE_TALK.en);
    expect("Prices include delivery and VAT").toMatch(PRICE_TALK.en);
    // PR 174 breaker round 3, hole 1.
    expect("every price includes local delivery and duties").toMatch(
      PRICE_TALK.en,
    );
    expect("Delivery's included.").toMatch(PRICE_TALK["en-gb"]);
    // PR 174 breaker round 2, hole 2: the paraphrases.
    expect("Endpreis: Zustellung und Abgaben inbegriffen.").toMatch(
      PRICE_TALK.de,
    );
    expect("Kurier i wszystkie opłaty w cenie.").toMatch(PRICE_TALK.pl);
    expect(
      "send us a photo within 72 hours of delivery and we'll replace them",
    ).not.toMatch(PRICE_TALK.en);
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
      // Spec 004 §14 A22: the who option "my partner" is the one sanctioned use of "partner";
      // it is set aside by the voice register's own exception, scoped to its key.
      const home = messages.home as Record<string, unknown> & {
        sentence: Record<string, string>;
      };
      const who = home.sentence.who ?? "";
      expect(
        bannedVoiceWordsIn(who, { locale, messageKey: "home.sentence.who" }),
        `${locale}: home.sentence.who`,
      ).toStrictEqual([]);
      const serialised = JSON.stringify({
        ...messages,
        home: { ...home, sentence: { ...home.sentence, who: "" } },
      }).toLowerCase();
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
