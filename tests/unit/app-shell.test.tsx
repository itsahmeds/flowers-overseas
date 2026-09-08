/**
 * T-05 / AC-5, plus the AC-6 and AC-8 document attributes at the unit layer (TASK-034; replaces
 * the spec 001 shell test of TASK-006).
 *
 * The point of this file is the **seam**: a fake five-locale `LocaleRegistryProvider`, injected
 * *inside* `src/modules/i18n`, changes what the `[locale]` layout renders — same layout, same
 * page, no change to any file under `src/app/`. That is the proof spec 002/012 can hydrate the
 * locale set from Postgres without touching a caller (spec 003 §2 "the no-database seam", §12).
 *
 * `withLocaleRegistry()` is imported from the module path, not from the barrel, because the barrel
 * deliberately does not export it (AC-3, pinned by `i18n-barrel.test.ts`). The injection point is
 * therefore the only one that exists, and it lives in the i18n module.
 *
 * `next-intl/server` is mocked with a translator that resolves against the **real**
 * `messages/en.json` through `loadMessages()`, so the asserted copy is the shipped copy: what is
 * stubbed is Next's per-request plumbing (`setRequestLocale`, the async-context locale), which has
 * no meaning outside a Next render, not the message resolution under test.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import {
  type LocaleConfig,
  loadMessages,
  type MessageNamespace,
  namespacesFor,
} from "../../src/modules/i18n";
import {
  localeRegistryOf,
  staticLocaleRegistry,
  withLocaleRegistry,
} from "../../src/modules/i18n/registry.ts";

vi.mock("next-intl/server", () => ({
  setRequestLocale: (): void => undefined,
  getLocale: (): Promise<string> => Promise.resolve("en"),
  getTranslations: ({
    locale,
    namespace,
  }: {
    locale: string;
    namespace: MessageNamespace;
  }): Promise<(key: string) => string> => {
    const messages = loadMessages(locale, [namespace])[namespace];
    return Promise.resolve((key: string) => {
      let value: unknown = messages;
      for (const part of key.split(".")) {
        value = (value as Record<string, unknown> | undefined)?.[part];
      }
      if (typeof value !== "string") {
        throw new Error(`missing message key: ${namespace}.${key}`);
      }
      return value;
    });
  },
}));

const { default: ChooserLayout, metadata: chooserMetadata } =
  await import("../../src/app/(chooser)/layout");
const { default: ChooserPage, generateMetadata: chooserPageMetadata } =
  await import("../../src/app/(chooser)/page");
const {
  default: LocaleLayout,
  dynamicParams,
  generateStaticParams,
  generateMetadata: localeLayoutMetadata,
} = await import("../../src/app/[locale]/layout");
const { default: LocaleHomePage, generateMetadata: localeHomeMetadata } =
  await import("../../src/app/[locale]/page");
const { default: LocaleError } = await import("../../src/app/[locale]/error");
const { default: GlobalErrorDocument } =
  await import("../../src/app/global-error");
const { default: RootLayout, metadata: rootMetadata } =
  await import("../../src/app/layout");
const { default: NotFoundDocument, generateMetadata: notFoundMetadata } =
  await import("../../src/app/not-found");

/** A five-locale set: the four launch locales plus an RTL locale that does not exist in config. */
const FAKE_FIFTH: LocaleConfig = {
  code: "ar-xb",
  bcp47: "ar-XB",
  name: "Pseudo Arabic",
  nativeName: "Pseudo Arabic",
  dir: "rtl",
  isLaunch: true,
  fallbackCode: "en",
  currencyDefault: "EUR",
  numberingSystem: "latn",
  hreflangAliases: ["ar-XB"],
  pathSegments: {
    destinations: "send-flowers-to",
    shopCategory: "flowers",
    occasions: "occasions",
    product: "product",
    blog: "blog",
    forFlorists: "for-florists",
    legal: "legal",
  },
};

const fiveLocaleRegistry = localeRegistryOf([
  ...staticLocaleRegistry.list(),
  FAKE_FIFTH,
]);

/** The chooser page is `async` (it awaits its catalogue), so it is resolved once, up front. */
const chooserPage = (await ChooserPage()) as ReactElement;

async function renderLocaleDocument(locale: string): Promise<string> {
  const page = (await LocaleHomePage({
    params: Promise.resolve({ locale }),
  })) as ReactElement;
  const document = (await LocaleLayout({
    children: page,
    params: Promise.resolve({ locale }),
  })) as ReactElement;
  return renderToStaticMarkup(document);
}

describe("the `/` locale chooser (AC-7, AC-25)", () => {
  const html = renderToStaticMarkup(
    <ChooserLayout>{chooserPage}</ChooserLayout>,
  );

  it("takes `lang`/`dir` from the x-default locale, with no literal in the file", () => {
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).not.toContain('lang="en-GB" dir');
  });

  it("renders one crawlable link per launch locale, in registry order", () => {
    const hrefs = [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(hrefs).toEqual(["/en", "/en-gb", "/de", "/pl"]);
  });

  it("labels every link with its `nativeName` and declares its language twice", () => {
    // AC-7 asks for `hreflang` *and* `lang` on each link, and `plan/03` §2 for language names
    // rather than flags. React 19 serialises the `hrefLang` prop with its JSX spelling; HTML
    // attribute names are case-insensitive, so the browser and every crawler read `hreflang`
    // (asserted through the DOM in `tests/e2e/shell.spec.ts`).
    for (const { bcp47, nativeName } of staticLocaleRegistry.list()) {
      expect(html).toContain(
        `lang="${bcp47}" hrefLang="${bcp47}">${nativeName}</a>`,
      );
    }
    expect(html).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
  });

  it("names its navigation landmark and its heading from the catalogue", () => {
    expect(html).toContain('<nav aria-label="Languages">');
    expect(html).toContain("<h1>Choose your language</h1>");
    expect(html).toContain("Choose a language to continue.");
  });

  it("is the only `follow` document in Phase 0, and still `noindex`", async () => {
    // The layout keeps the group default; the page overrides it, and page metadata wins.
    expect(chooserMetadata.robots).toBe("noindex,nofollow");
    expect((await chooserPageMetadata()).robots).toBe("noindex,follow");
  });

  it("has a non-empty localised `<title>` and description (AC-25)", async () => {
    const metadata = await chooserPageMetadata();

    expect(metadata.title).toBe("Flowers Overseas — choose your language");
    expect(String(metadata.description).length).toBeGreaterThan(0);
  });

  it("contains no Client Component boundary, so `/` needs no JavaScript", () => {
    // The `(chooser)` group ships `layout.tsx` and `page.tsx` and nothing else: its spec 001
    // `error.tsx` was deleted in TASK-035 and `src/app/global-error.tsx` answers instead.
    expect(
      readdirSync(resolve(__dirname, "../../src/app/(chooser)")).sort(),
    ).toEqual(["layout.tsx", "page.tsx"]);
  });
});

describe("the `[locale]` document (AC-6)", () => {
  it("renders `lang`/`dir` from the locale's bcp47 and direction", async () => {
    expect(await renderLocaleDocument("en")).toContain('<html lang="en"');
    expect(await renderLocaleDocument("en-gb")).toContain('<html lang="en-GB"');
    expect(await renderLocaleDocument("de")).toContain('<html lang="de"');
    const pl = await renderLocaleDocument("pl");
    expect(pl).toContain('<html lang="pl"');
    expect(pl).toContain('dir="ltr"');
  });

  it("renders the shipped `meta` and `a11y` copy, never a literal", async () => {
    const html = await renderLocaleDocument("en");
    expect(html).toContain("<h1>Send flowers across Europe</h1>");
    expect(html).toContain("Skip to content");
  });

  it("renders the locale switcher: three links out and the current locale marked", async () => {
    const html = await renderLocaleDocument("de");

    // §6 "Internal links": every locale root links to the other three, so the Phase 0 crawl graph
    // is complete. The current locale is a `<span aria-current="page">`, not a link.
    expect(html).toContain('<nav aria-label="Change language">');
    expect(html).toContain(
      '<span aria-current="page" lang="de">Deutsch</span>',
    );
    for (const href of ['href="/en"', 'href="/en-gb"', 'href="/pl"']) {
      expect(html).toContain(href);
    }
    expect(html).not.toContain('href="/de"');
    expect(html).toContain('lang="pl" hrefLang="pl">Polski</a>');
  });

  it("gives every locale a non-empty localised title and description (AC-25)", async () => {
    for (const locale of ["en", "en-gb", "de", "pl"]) {
      const metadata = await localeHomeMetadata({
        params: Promise.resolve({ locale }),
      });

      expect(String(metadata.title).length, locale).toBeGreaterThan(0);
      expect(String(metadata.description).length, locale).toBeGreaterThan(0);
    }
  });

  it("keeps the segment's `noindex,nofollow` default and a fallback title", async () => {
    // The fallback title is what the 500 boundary document uses: `error.tsx` is a Client
    // Component and cannot export metadata (AC-25).
    const metadata = await localeLayoutMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(metadata.robots).toBe("noindex,nofollow");
    expect(metadata.title).toBe("Something went wrong — Flowers Overseas");
  });

  it("refuses an unknown segment centrally, on the layout (AC-8)", () => {
    // The `/review 15` carry-forward: one gate for the whole subtree, so a page added by spec 004
    // cannot forget the export and fabricate `/fr/about` as a duplicate of the English URL.
    expect(dynamicParams).toBe(false);
  });

  it("prerenders the launch locales only", () => {
    expect(generateStaticParams()).toEqual([
      { locale: "en" },
      { locale: "en-gb" },
      { locale: "de" },
      { locale: "pl" },
    ]);
  });
});

describe("the app-root layout (spec 003 §5.3's accepted alternative)", () => {
  it("renders no document of its own, so each leaf renders its own language", () => {
    // Same children, no `<html>`/`<body>` added: the root is a pass-through, so the chooser's
    // own markup is the entire response.
    expect(renderToStaticMarkup(<RootLayout>{chooserPage}</RootLayout>)).toBe(
      renderToStaticMarkup(chooserPage),
    );
  });

  it("carries the `noindex,nofollow` default every document inherits", () => {
    expect(rootMetadata.robots).toBe("noindex,nofollow");
  });
});

describe("the 404 document (AC-8)", () => {
  it("declares the x-default locale and renders catalogue copy, not a literal", async () => {
    const html = renderToStaticMarkup(
      (await NotFoundDocument()) as ReactElement,
    );

    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain("<h1>Page not found</h1>");
    // The way back is built by `localePath()`, the single URL builder (AC-13).
    expect(html).toContain('href="/en"');
  });
});

describe("the localised 500 boundary", () => {
  it("reads its copy from the client provider's namespace subset", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="en"
        messages={loadMessages("en", namespacesFor("localeDocument"))}
      >
        <LocaleError reset={(): void => undefined} />
      </NextIntlClientProvider>,
    );

    expect(html).toContain("<h1>Something went wrong</h1>");
    expect(html).toContain("Try again");
  });
});

describe("the 404's metadata (AC-25)", () => {
  it("titles the document from the catalogue", async () => {
    const metadata = await notFoundMetadata();

    expect(metadata.title).toBe("Page not found — Flowers Overseas");
    expect(String(metadata.description).length).toBeGreaterThan(0);
  });
});

describe("the global 500 document (spec 003 §5.3, AC-25)", () => {
  const html = renderToStaticMarkup(
    <GlobalErrorDocument reset={(): void => undefined} />,
  );

  it("is an x-default document with `lang`, `dir` and a localised title", () => {
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain(
      "<title>Something went wrong — Flowers Overseas</title>",
    );
  });

  it("reads its copy from the catalogue, never from a literal", () => {
    expect(html).toContain("<h1>Something went wrong</h1>");
    expect(html).toContain("Try again");
  });

  it("stays unindexable even on the failure path", () => {
    expect(html).toContain('name="robots" content="noindex,nofollow"');
  });
});

describe("the AC-5 registry seam", () => {
  it("404s an unconfigured locale with the static registry", async () => {
    await expect(renderLocaleDocument("ar-xb")).rejects.toThrow(/NEXT_HTTP/);
  });

  it("renders that same locale, RTL, once a fake five-locale provider is injected", async () => {
    const html = await withLocaleRegistry(fiveLocaleRegistry, () =>
      renderLocaleDocument("ar-xb"),
    );

    expect(html).toContain('<html lang="ar-XB" dir="rtl">');
    // No catalogue ships for the fake locale: the `en` fallback chain renders it (AC-31).
    expect(html).toContain("<h1>Send flowers across Europe</h1>");
  });

  it("adds the fifth locale to `generateStaticParams` with no change under `src/app/`", async () => {
    const params = await withLocaleRegistry(fiveLocaleRegistry, () =>
      generateStaticParams(),
    );

    expect(params.map((param) => param.locale)).toContain("ar-xb");
  });

  it("restores the static registry afterwards", () => {
    expect(generateStaticParams()).toHaveLength(4);
  });
});
