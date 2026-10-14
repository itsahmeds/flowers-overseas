/**
 * One page of each of the ten page types the language links must keep (TASK-233): that page's path
 * in every launch locale that has it, read from the shipped catalogue and written out here so a
 * test asserts the one value rather than recomputing it. The Poland guide has no German or Polish
 * page (`corridorAlternatePaths()` lists `en` and `en-gb`), which is the case that falls back to
 * the locale home. Shared by `tests/unit/i18n-switcher-same-page.test.tsx` and
 * `tests/e2e/language-links.spec.ts`.
 */

/** Each launch locale's home: the fallback where a locale has no such page (spec 003 §2 L79). */
export const LOCALE_HOMES: Readonly<Record<string, string>> = {
  en: "/en",
  "en-gb": "/en-gb",
  de: "/de",
  pl: "/pl",
};

/** Each launch locale's BCP 47 tag, as the switcher writes it into `hreflang`. */
export const LOCALE_TAGS: Readonly<Record<string, string>> = {
  en: "en",
  "en-gb": "en-GB",
  de: "de",
  pl: "pl",
};

export const LANGUAGE_LINK_PAGES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  home: { en: "/en", "en-gb": "/en-gb", de: "/de", pl: "/pl" },
  destinationsHub: {
    en: "/en/send-flowers-to",
    "en-gb": "/en-gb/send-flowers-to",
    de: "/de/blumen-verschicken",
    pl: "/pl/wyslij-kwiaty",
  },
  guide: {
    en: "/en/send-flowers-to/poland",
    "en-gb": "/en-gb/send-flowers-to/poland",
  },
  shopRoot: {
    en: "/en/poland/flowers",
    "en-gb": "/en-gb/poland/flowers",
    de: "/de/polen/blumen",
    pl: "/pl/polska/kwiaty",
  },
  category: {
    en: "/en/poland/flowers/hand-tied-bouquets",
    "en-gb": "/en-gb/poland/flowers/hand-tied-bouquets",
    de: "/de/polen/blumen/blumenstraeusse",
    pl: "/pl/polska/kwiaty/bukiety",
  },
  occasion: {
    en: "/en/poland/occasions/mothers-day",
    "en-gb": "/en-gb/poland/occasions/mothers-day",
    de: "/de/polen/anlaesse/muttertag",
    pl: "/pl/polska/okazje/dzien-matki",
  },
  occasionHub: {
    en: "/en/occasions/birthday",
    "en-gb": "/en-gb/occasions/birthday",
    de: "/de/anlaesse/geburtstag",
    pl: "/pl/okazje/urodziny",
  },
  categoryHub: {
    en: "/en/flowers/roses",
    "en-gb": "/en-gb/flowers/roses",
    de: "/de/blumen/rosen",
    pl: "/pl/kwiaty/roze",
  },
  occasionsIndex: {
    en: "/en/occasions",
    "en-gb": "/en-gb/occasions",
    de: "/de/anlaesse",
    pl: "/pl/okazje",
  },
  product: {
    en: "/en/poland/product/small-kindness",
    "en-gb": "/en-gb/poland/product/small-kindness",
    de: "/de/polen/produkt/small-kindness",
    pl: "/pl/polska/produkt/small-kindness",
  },
};
