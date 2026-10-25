/**
 * The home to its round-2 artboards, the markup half (spec 004 §14 A20, A21 clauses 1–4, A24
 * clause 1; AC-14, AC-49; TASK-231, TASK-232; `docs/design/wireframes/home-desktop.dc.html`,
 * `home-mobile.dc.html`, `chrome-desktop.dc.html`). The geometry half is
 * `tests/e2e/home-round2.spec.ts`.
 *
 *  - **One italic phrase per drawn heading (TASK-231; spec 004 §14 A-founder-2026-10-14d,
 *    AC-52, T-57's unit half).** Each heading the artboards draw with an
 *    `h1 em`/`h2 em` renders exactly that phrase in `<em>`, and its words are the reviewed words,
 *    in all four locales; the cover's phrase is recoloured sunflower below `md`. Watched red by
 *    taking the `<em>` out of one `en` value.
 *  - **"Continue →" (TASK-231).** The drawn arrow icon, mirrored in RTL, no new string.
 *  - **The country select's ink room (TASK-231).** The class that widens the content box past an
 *    italic's overhang is on the country select (the geometry is the e2e's).
 *  - **The date stamps (TASK-232 item 2).** The second name is its own italic line; no arrow; a
 *    stamp with no page has no lift and is no link, a linked one keeps both; two across from `md`.
 *  - **"Occasions →" (item 3).** Drawn with the page's `indexHref` and only then (A20, AC-14).
 *  - **Popular choices (item 5A, TASK-284)** is one sideways row on the phone (AC-49), five
 *    across from `md`; the row is the tab stop only when no card is a link.
 *  - **The destination chips (item 6)** are one scrolling row below `md` (AC-49).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import en from "../../messages/en.json";
import { listProductPages } from "../../src/modules/catalog";
import { type MessageNamespace, loadMessages } from "../../src/modules/i18n";
import { HomeHero } from "../../src/modules/ui/home/HomeHero.tsx";
import { DestinationsGrid } from "../../src/modules/ui/home/DestinationsGrid.tsx";
import { HomeFaq } from "../../src/modules/ui/home/HomeFaq.tsx";
import { HowItWorks } from "../../src/modules/ui/home/HowItWorks.tsx";
import { OccasionDates } from "../../src/modules/ui/home/OccasionDates.tsx";
import { OccasionTiles } from "../../src/modules/ui/home/OccasionTiles.tsx";
import { ProofRow } from "../../src/modules/ui/home/ProofRow.tsx";
import {
  SELECT_INK_ROOM,
  SentencePicker,
} from "../../src/modules/ui/home/SentencePicker.tsx";
import { TrendingRow } from "../../src/modules/ui/home/TrendingRow.tsx";
import { stampNames } from "../../src/modules/ui/home/OccasionDates.tsx";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;
type Locale = (typeof LOCALES)[number];

const NAMESPACES = Object.keys(en) as MessageNamespace[];

function render(node: React.ReactElement, locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, NAMESPACES)}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

function text(html: string): string {
  return html
    .replaceAll(/<[^>]*>/g, "")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll(/\s+/g, " ")
    .trim();
}

/** The inner markup of the element carrying `id`, up to its closing heading tag. */
function headingById(html: string, id: string): string {
  const match = new RegExp(`id="${id}"[^>]*>(.*?)</h[123]>`, "u").exec(html);
  if (match === null) throw new Error(`no heading #${id}`);
  return match[1] ?? "";
}

/**
 * Each drawn heading: the section, its heading id, the reviewed words and the one italic phrase,
 * per locale. `en-gb` inherits `en`; `de` and `pl` are agent drafts (spec 003 §14 A15) that carry
 * the same markup, one italic phrase each, in their own words.
 */
const HEADINGS: readonly {
  readonly name: string;
  readonly render: (locale: string) => string;
  readonly id: string;
  readonly words: Partial<Record<Locale, string>> & { en: string };
  readonly em: Partial<Record<Locale, string>> & { en: string };
}[] = [
  {
    name: "hero",
    render: (locale) =>
      render(<HomeHero locale={locale} shopCountries={["PL"]} />, locale),
    id: "hero-heading",
    words: {
      en: "Flowers for someone far away.",
      de: "Blumen für jemanden weit weg.",
      pl: "Kwiaty dla bliskich w innym kraju.",
    },
    em: { en: "far away.", de: "weit weg.", pl: "w innym kraju." },
  },
  {
    name: "Popular choices",
    render: (locale) => render(<TrendingRow locale={locale} />, locale),
    id: "trending-heading",
    words: {
      en: "Popular choices",
      de: "Beliebte Auswahl",
      pl: "Popularne wybory",
    },
    em: { en: "choices", de: "Auswahl", pl: "wybory" },
  },
  {
    name: "dates",
    render: (locale) => render(<OccasionDates locale={locale} />, locale),
    id: "occasion-dates-heading",
    words: {
      en: "Dates worth sending for",
      de: "Tage, an denen sich Blumen lohnen",
      pl: "Daty, na które warto wysłać kwiaty",
    },
    em: { en: "sending for", de: "Blumen lohnen", pl: "warto wysłać kwiaty" },
  },
  {
    name: "occasions",
    render: (locale) => render(<OccasionTiles locale={locale} />, locale),
    id: "occasions-heading",
    words: {
      en: "What is the occasion?",
      de: "Was ist der Anlass?",
      pl: "Jaka to okazja?",
    },
    em: { en: "occasion?", de: "Anlass?", pl: "okazja?" },
  },
  {
    name: "how it works",
    render: (locale) => render(<HowItWorks />, locale),
    id: "how-it-works-heading",
    words: {
      en: "Three people touch your order. None of them is a courier.",
      de: "Drei Menschen haben mit Ihrer Bestellung zu tun. Keiner davon ist ein Kurier.",
      pl: "Twoim zamówieniem zajmują się trzy osoby. Żadna z nich nie jest kurierem.",
    },
    em: {
      en: "None of them is a courier.",
      de: "Keiner davon ist ein Kurier.",
      pl: "Żadna z nich nie jest kurierem.",
    },
  },
  {
    name: "promise",
    render: (locale) => render(<ProofRow />, locale),
    id: "promise-heading",
    words: {
      en: "Our promise",
      de: "Unser Versprechen",
      pl: "Nasza obietnica",
    },
    em: { en: "promise", de: "Versprechen", pl: "obietnica" },
  },
  {
    name: "FAQ",
    render: (locale) => render(<HomeFaq />, locale),
    id: "faq-heading",
    words: {
      en: "Questions people ask first",
      de: "Was Menschen zuerst fragen",
      pl: "O co ludzie pytają najpierw",
    },
    em: { en: "ask first", de: "zuerst fragen", pl: "pytają najpierw" },
  },
  {
    name: "destinations",
    render: (locale) => render(<DestinationsGrid locale={locale} />, locale),
    id: "destinations-heading",
    words: {
      en: "Where we can send flowers",
      de: "Wohin wir Blumen senden können",
      pl: "Dokąd możemy wysłać kwiaty",
    },
    em: { en: "send flowers", de: "Blumen senden", pl: "wysłać kwiaty" },
  },
];

describe("one poppy italic phrase in each drawn home heading (TASK-231; A21 clauses 2–3)", () => {
  for (const heading of HEADINGS) {
    it(`${heading.name}: the reviewed words, the drawn phrase in <em>, in four locales`, () => {
      for (const locale of LOCALES) {
        const inner = headingById(heading.render(locale), heading.id);
        const words = heading.words[locale] ?? heading.words.en;
        const em = heading.em[locale] ?? heading.em.en;
        expect(text(inner), `${heading.name} ${locale}`).toBe(words);
        const ems = [...inner.matchAll(/<em data-fo-em="">(.*?)<\/em>/gu)].map(
          (match) => text(match[1] ?? ""),
        );
        expect(ems, `${heading.name} ${locale}`).toEqual([em]);
      }
    });
  }

  it("recolours the cover's phrase sunflower on the phone, poppy elsewhere", () => {
    const html = render(<HomeHero locale="en" shopCountries={["PL"]} />, "en");
    const h1 = (/<h1[^>]*class="([^"]*)"/u.exec(html)?.[1] ?? "").replaceAll(
      "&amp;",
      "&",
    );
    expect(h1.split(" ")).toContain("max-md:[&_em]:text-on-inverse-accent");
  });

  it("puts the phrase on its own line from 360 to 389 px, the CLS fix (TASK-231)", () => {
    const html = render(<HomeHero locale="en" shopCountries={["PL"]} />, "en");
    const h1 = (/<h1[^>]*class="([^"]*)"/u.exec(html)?.[1] ?? "").replaceAll(
      "&amp;",
      "&",
    );
    expect(h1.split(" ")).toContain("max-[390px]:[&_em]:block");
  });
});

describe('"Continue →" and the country select (TASK-231)', () => {
  const html = render(
    <SentencePicker locale="en" shopCountries={["PL"]} />,
    "en",
  );

  it("draws the arrow icon after Continue, decorative and mirrored in RTL", () => {
    const button =
      /<button[^>]*type="submit"[^>]*>(.*?)<\/button>/u.exec(html)?.[1] ?? "";
    expect(text(button)).toBe("Continue");
    expect(button).toMatch(
      /Continue<svg[^>]*class="mirror-in-rtl[^"]*"[^>]*aria-hidden="true"/u,
    );
    expect(button).toContain('<path d="M13 6l6 6-6 6"></path>');
  });

  it("gives the country select its ink room, and only the selects", () => {
    expect(SELECT_INK_ROOM).toBe(
      "[inline-size:calc-size(fit-content,_size_+_0.25em)]",
    );
    const country =
      /<select[^>]*data-fo-sentence-country[^>]*>/u.exec(html)?.[0] ?? "";
    const classes = /class="([^"]*)"/u.exec(country)?.[1]?.split(" ") ?? [];
    expect(classes).toContain(SELECT_INK_ROOM);
    expect(classes).toContain("[field-sizing:content]");
    expect(classes).toContain("pe-[24px]");
  });
});

describe("the date stamps (TASK-232 item 2)", () => {
  it("splits a reviewed name at its ` · ` and leaves a single name whole", () => {
    expect(stampNames("Wigilia · Christmas Eve")).toEqual({
      name: "Wigilia",
      second: "Christmas Eve",
    });
    expect(stampNames("Andrzejki")).toEqual({
      name: "Andrzejki",
      second: undefined,
    });
  });

  it("sets the second name on its own italic line, with no arrow, in four locales", () => {
    for (const locale of LOCALES) {
      const html = render(
        <OccasionDates
          locale={locale}
          hubHrefs={{ all_saints: "/x", christmas: "/y", womens_day: "/z" }}
        />,
        locale,
      );
      const seconds = [
        ...html.matchAll(
          /<span class="([^"]*)" data-fo-stamp-second="true">([^<]*)<\/span>/gu,
        ),
      ];
      // `de` names the Polish day and its German name; `pl` needs no second name for its own
      // days, so only All Saints' Day, excluded from drafting (spec 003 §14 A15 clause 4), keeps
      // its English first name and Polish second one there.
      const expected: Readonly<Record<string, readonly string[]>> = {
        de: [
          "Wszystkich Świętych",
          "Andreasnacht",
          "Heiligabend",
          "Dzień Kobiet",
        ],
        pl: ["Wszystkich Świętych"],
      };
      expect(
        seconds.map((match) => match[2]),
        locale,
      ).toEqual(
        expected[locale] ?? [
          "Wszystkich Świętych",
          "St Andrew&#x27;s Eve",
          "Christmas Eve",
          "Dzień Kobiet",
        ],
      );
      for (const match of seconds) {
        expect(match[1]?.split(" "), locale).toEqual(
          expect.arrayContaining([
            "font-display",
            "italic",
            "font-(--font-weight-display-em)",
          ]),
        );
      }
      expect(html, locale).not.toContain(" · ");
      expect(html, locale).not.toContain("→");
      expect(html, locale).not.toContain("content-[");
    }
  });

  it("gives a linked stamp its lift and a stamp with no page none, and no link", () => {
    const html = render(
      <OccasionDates
        locale="en"
        hubHrefs={{ all_saints: "/en/occasions/all-saints-day" }}
      />,
      "en",
    );
    const item = (id: string): string =>
      new RegExp(
        `<li[^>]*data-fo-occasion-date="${id}"[^>]*>.*?</li>`,
        "u",
      ).exec(html)?.[0] ?? "";
    expect(item("allSaints")).toContain('href="/en/occasions/all-saints-day"');
    expect(item("allSaints")).toMatch(/^<li class="drop-shadow-\[/u);
    expect(item("allSaints")).toContain('data-fo-stamp-linked="true"');
    for (const id of ["andrzejki", "wigilia", "womensDay"]) {
      expect(item(id), id).not.toContain("href=");
      expect(item(id), id).not.toContain("drop-shadow");
      expect(item(id), id).toContain('data-fo-stamp-linked="false"');
    }
  });

  it("lays the stamps two across from `md`, four from `lg`, the drawn five from `xl`", () => {
    const list =
      /<ul class="([^"]*)"/u.exec(
        render(<OccasionDates locale="en" />, "en"),
      )?.[1] ?? "";
    const classes = list.split(" ");
    expect(classes).toEqual(
      expect.arrayContaining([
        "md:grid-cols-2",
        "lg:grid-cols-4",
        "xl:grid-cols-5",
      ]),
    );
    expect(classes).not.toContain("md:grid-cols-5");
  });
});

describe('"Occasions →" (TASK-232 item 3; A20, AC-14)', () => {
  it("links the occasions index beside the heading when the page hands it in", () => {
    const html = render(
      <OccasionTiles locale="en" indexHref="/en/occasions" />,
      "en",
    );
    const link =
      /<a href="\/en\/occasions"[^>]*>(.*?)<\/a>/u.exec(html)?.[1] ?? "";
    expect(text(link)).toBe("Occasions");
    expect(link).toContain('class="mirror-in-rtl');
  });

  it("draws nothing, as text or link, without it", () => {
    for (const locale of LOCALES) {
      const html = render(<OccasionTiles locale={locale} />, locale);
      expect(html, locale).not.toMatch(
        /href="[^"]*\/(?:occasions|anlaesse|okazje)"/u,
      );
      expect(html, locale).not.toContain("mirror-in-rtl");
    }
  });
});

describe("the phone rows (TASK-232 items 5 and 6)", () => {
  /**
   * Item 5A (TASK-284; TASK-252 "all A", founder 2026-10-19; AC-49): below `md` Popular choices
   * is one row that scrolls sideways, each card 44 % of the row with a 14 px gap, bled to the
   * screen's edges by the gutter; from `md` one row of five, unchanged. The geometry is the e2e's.
   */
  it("lays Popular choices out as one sideways row below `md` and five across from `md`", async () => {
    const pages = await listProductPages("en");
    const html = render(<TrendingRow locale="en" productPages={pages} />, "en");
    const list = /<ul([^>]*)>/u.exec(html)?.[1] ?? "";
    const classes = (/class="([^"]*)"/u.exec(list)?.[1] ?? "").split(" ");
    expect(classes).toEqual(
      expect.arrayContaining([
        "grid",
        "max-md:grid-flow-col",
        "max-md:auto-cols-[44%]",
        "max-md:gap-x-[14px]",
        "max-md:overflow-x-auto",
        "max-md:snap-x",
        "max-md:snap-mandatory",
        "max-md:-mx-(--gutter-s)",
        "max-md:px-(--gutter-s)",
        "max-md:scroll-px-(--gutter-s)",
        "md:grid-cols-5",
        "md:gap-x-[24px]",
      ]),
    );
    // No two-column grid left behind on the phone (the blank half row of five in two columns).
    expect(classes).not.toContain("grid-cols-2");
    // Named by the section's own heading; every card is a link, so the row takes no tab stop.
    expect(list).toContain('aria-labelledby="trending-heading"');
    expect(list).not.toContain("tabindex");
    // Nothing is called a carousel (AC-36).
    expect(html).not.toContain("aria-roledescription");
    const items = [...html.matchAll(/<li class="([^"]*)"/gu)].map(
      (match) => match[1] ?? "",
    );
    expect(items).toHaveLength(5);
    for (const item of items)
      expect(item.split(" ")).toContain("max-md:snap-start");
    // The drawn name size in the scroller (`.M .grid5.scroll5 .card h3`, 19 px), `h3` from `md`.
    const names = [...html.matchAll(/<h3 class="([^"]*)"/gu)].map((match) =>
      (match[1] ?? "").split(" "),
    );
    expect(names).toHaveLength(5);
    for (const name of names) {
      expect(name).toEqual(
        expect.arrayContaining(["text-[19px]", "md:text-h3"]),
      );
      expect(name).not.toContain("text-h3-s");
    }
  });

  it("makes the row itself the keyboard's stop when no card is a link (AC-49)", () => {
    const list =
      /<ul([^>]*)>/u.exec(render(<TrendingRow locale="en" />, "en"))?.[1] ?? "";
    expect(list).toContain('tabindex="0"');
    expect(list).toContain('aria-labelledby="trending-heading"');
  });

  it("scrolls the destination chips in one row below `md`, named by the heading", () => {
    const html = render(<DestinationsGrid locale="en" />, "en");
    const list =
      /<ul([^>]*data-fo-destination-chips[^>]*)>/u.exec(html)?.[1] ?? "";
    expect(list).toContain('aria-labelledby="destinations-heading"');
    const classes = /class="([^"]*)"/u.exec(list)?.[1]?.split(" ") ?? [];
    expect(classes).toEqual(
      expect.arrayContaining([
        "flex",
        "max-md:overflow-x-auto",
        "md:flex-wrap",
      ]),
    );
    expect(classes).not.toContain("flex-wrap");
  });
});

/**
 * T-57's unit half (spec 004 §14 A-founder-2026-10-14d clauses 1, 3 and 4, AC-52; TASK-231): the
 * marker is the only change. Each marked `en` value, with its `<em>` and `</em>` removed, is the
 * base value byte for byte, carries exactly one pair, and keeps its review record as it was
 * (`reviewed`, `reviewedBy`, `reviewedAt`; only `sourceHash` follows the value). `de` and `pl`
 * carry one pair each. Watched red with one word inside a marked value changed.
 */
describe("the marker keeps the approval (AC-52; T-57)", () => {
  const read = (file: string): Record<string, unknown> =>
    JSON.parse(
      readFileSync(resolve(__dirname, `../../messages/${file}`), "utf8"),
    ) as Record<string, unknown>;
  const at = (tree: Record<string, unknown>, key: string): unknown =>
    key
      .split(".")
      .reduce<unknown>(
        (node, part) =>
          typeof node === "object" && node !== null
            ? (node as Record<string, unknown>)[part]
            : undefined,
        tree,
      );
  const strip = (value: string): string =>
    value.replace("<em>", "").replace("</em>", "");
  const pairs = (value: string): number =>
    [...value.matchAll(/<em>[^<]*<\/em>/gu)].length;

  /** The base value and its review record, as `main` held them before the marker. */
  const MARKED: readonly (readonly [string, string, string, string])[] = [
    [
      "home.hero.heading",
      "Flowers for someone far away.",
      "founder",
      "2026-09-09T00:00:00Z",
    ],
    [
      "home.trending.heading",
      "Popular choices",
      'founder (2026-10-03 chat, "ok go with popular choices"; docs/decisions-log.md "The trending row reads Popular choices"; transcribed by TASK-140)',
      "2026-10-03T00:00:00Z",
    ],
    [
      "home.dates.heading",
      "Dates worth sending for",
      "founder (docs/design/homepage-v1 artboards, round 2 and round 6; TASK-053)",
      "2026-09-11T00:00:00Z",
    ],
    [
      "home.occasions.heading",
      "What is the occasion?",
      "founder (docs/design/homepage-v1 artboards, round 2 and round 6; TASK-053)",
      "2026-09-11T00:00:00Z",
    ],
    [
      "home.howItWorks.heading",
      "Three people touch your order. None of them is a courier.",
      "founder (docs/design/homepage-v1 artboards, round 2 and round 6; TASK-053)",
      "2026-09-11T00:00:00Z",
    ],
    [
      "trust.heading",
      "Our promise",
      "frontend-implementer (spec 004 §2 trust strip, §14 A4 unpublished-target copy, /review 41 caption; TASK-053)",
      "2026-09-11T00:00:00Z",
    ],
    [
      "faq.heading",
      "Questions people ask first",
      "founder (docs/design/homepage-v1 artboards, round 2 and round 6; TASK-053)",
      "2026-09-11T00:00:00Z",
    ],
    [
      "destinationsHub.h1",
      "Where we can send flowers",
      "founder (docs/design/wireframes/all-destinations-desktop.dc.html and -mobile, 2026-09-15 design round; transcribed by TASK-092)",
      "2026-09-16T00:00:00Z",
    ],
  ];

  const catalogue = read("en.json");
  const meta = read("en.meta.json") as Record<
    string,
    { reviewed?: boolean; reviewedBy?: string; reviewedAt?: string }
  >;

  it.each(MARKED)(
    "`%s`: the words are the base value, one pair, the review record unchanged",
    (key, base, reviewedBy, reviewedAt) => {
      const value = at(catalogue, key);
      expect(typeof value).toBe("string");
      expect(strip(value as string)).toBe(base);
      expect(pairs(value as string)).toBe(1);
      expect(meta[key]?.reviewed).toBe(true);
      expect(meta[key]?.reviewedBy).toBe(reviewedBy);
      expect(meta[key]?.reviewedAt).toBe(reviewedAt);
    },
  );

  it("`de` and `pl` carry exactly one pair in each marked value", () => {
    for (const file of ["de.json", "pl.json"]) {
      const drafts = read(file);
      for (const [key] of MARKED) {
        expect(pairs(at(drafts, key) as string), `${file} ${key}`).toBe(1);
      }
    }
  });

  it("puts no `<em>` in any other `en` value (clause 1)", () => {
    const marked = new Set(MARKED.map(([key]) => key));
    const walk = (node: unknown, path: string): string[] =>
      typeof node === "string"
        ? node.includes("<em>") && !marked.has(path)
          ? [path]
          : []
        : Object.entries(node as Record<string, unknown>).flatMap(
            ([key, child]) => walk(child, path === "" ? key : `${path}.${key}`),
          );
    expect(walk(catalogue, "")).toEqual([]);
  });
});
