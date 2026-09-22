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
} from "../../src/modules/i18n";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import {
  localeRegistryOf,
  staticLocaleRegistry,
  withLocaleRegistry,
} from "../../src/modules/i18n/registry.ts";

/**
 * The router params the 500 boundary reads (`src/app/[locale]/error.tsx`). Mutable so the tests
 * below can assert the locale branch, the unknown-segment branch and the no-router branch; `null`
 * is what `useParams()` answers outside a router context, which is a state the failure path must
 * survive.
 */
let routerParams: Record<string, string | string[]> | null = null;

vi.mock("next/navigation", async (importOriginal) => ({
  // Partial: `notFound()` is the real one — `[locale]/page.tsx` calls it for an unroutable
  // segment and this file asserts the `NEXT_HTTP_ERROR_FALLBACK` it throws.
  ...(await importOriginal<typeof import("next/navigation")>()),
  useParams: (): Record<string, string | string[]> | null => routerParams,
}));

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

/**
 * The `meta` strings of the document fallback locale (`en`), which the chooser and the 404 title
 * themselves from — read from the catalogue so a description is asserted as the authored words.
 */
function fallbackMeta(): {
  chooser: { description: string };
  notFound: { description: string };
} {
  const meta = loadMessages("en", ["meta"])["meta"] as {
    chooser: { description: string };
    notFound: { description: string };
  };
  expect(meta.chooser.description).not.toBe("");
  expect(meta.notFound.description).not.toBe("");
  return meta;
}
const { default: NotFoundDocument, generateMetadata: notFoundMetadata } =
  await import("../../src/app/not-found");

/** A five-locale set: the four launch locales plus an RTL locale that does not exist in config. */
const FAKE_FIFTH: LocaleConfig = {
  code: "ar-xb",
  bcp47: "ar-XB",
  formattingTag: "ar-XB",
  name: "Pseudo Arabic",
  nativeName: "Pseudo Arabic",
  dir: "rtl",
  isLaunch: true,
  // TASK-042: a pseudo-locale is a registry flag now; a fake launch locale states it.
  isPseudo: false,
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

/**
 * Wrap a rendered document in a message provider **for this test environment only**.
 *
 * `src/app/[locale]/layout.tsx` mounts no `NextIntlClientProvider` since TASK-085 (spec 004 §14
 * A1 addendum): the provider and its message payload cost 10 705 B Brotli in every locale
 * document's initial script set, and every client island now takes resolved strings as props. In
 * Next, the Server Components below still resolve `useTranslations` through next-intl's
 * server implementation, which the `react-server` export condition selects. Vitest resolves the
 * package under the default condition, so it gets the *client* hook, which needs context — a
 * property of the test runner's module resolution, not of the application. The provider is
 * therefore part of the harness, exactly as `next/font/local` is stubbed in `vitest.config.ts`;
 * that no client module reads a message in production is asserted by
 * `tests/unit/client-message-graph.test.ts`.
 */
async function renderLocaleDocument(locale: string): Promise<string> {
  const page = (await LocaleHomePage({
    params: Promise.resolve({ locale }),
  })) as ReactElement;
  const document = (await LocaleLayout({
    children: page,
    params: Promise.resolve({ locale }),
  })) as ReactElement;
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, MESSAGE_NAMESPACES)}
      timeZone="UTC"
    >
      {document}
    </NextIntlClientProvider>,
  );
}

describe("the `/` locale chooser (AC-7, AC-25)", () => {
  const html = renderToStaticMarkup(
    <ChooserLayout>{chooserPage}</ChooserLayout>,
  );

  it("takes `lang`/`dir` from the x-default locale, with no literal in the file", () => {
    expect(html).toContain('<html lang="en" dir="ltr" class=');
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
      // TASK-055 gave each row the endonym in the `.display` voice and the path it leads to in
      // the `.label` voice; the two attributes AC-7 asks for are still on the `<a>` itself.
      expect(html).toContain(`lang="${bcp47}" hrefLang="${bcp47}">`);
      expect(html).toContain(`>${nativeName}</span>`);
    }
    expect(html).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
  });

  it("names its navigation landmark and its heading from the catalogue", () => {
    expect(html).toContain('<nav aria-label="Languages">');
    expect(html).toMatch(
      /<h1 class="display text-display-s">Choose your language<\/h1>/,
    );
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
    // The authored string, not `String(…).length > 0`, which `undefined` passes (TASK-143).
    expect(metadata.description).toBe(fallbackMeta().chooser.description);
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
    // TASK-052: the placeholder `<h1>` is gone — the locale home's heading is `home.hero.heading`,
    // rendered by `HomeHero`. Its *copy* is not assertable here and deliberately so: this helper
    // renders the layout, so the only catalogue in scope is the harness provider's
    // `MESSAGE_NAMESPACES` (see `renderLocaleDocument`), and the heading is the page's, resolved
    // through `src/modules/i18n/request.ts` in a real render. What this file pins is the
    // document's structure — one `<h1>`, inside `main`, plus the `a11y` copy of the layout; the
    // heading's text is asserted in `tests/unit/ui-home.test.tsx` and `tests/e2e/home.spec.ts`.
    expect([...html.matchAll(/<h1/g)]).toHaveLength(1);
    expect(html).toContain('<main id="main">');
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
    // The masthead lockup of spec 004's header links to the locale home (AC-7), so `/de` appears
    // exactly once on the `/de` document — and **not** from the switcher, whose current entry is
    // the `<span aria-current="page">` asserted above (spec 003 §5.3).
    expect(html.match(/href="\/de"/g)).toHaveLength(1);
    expect(html).toContain('lang="pl" hrefLang="pl">Polski</a>');
  });

  it("gives every locale a non-empty localised title and description (AC-25)", async () => {
    for (const locale of ["en", "en-gb", "de", "pl"]) {
      const metadata = await localeHomeMetadata({
        params: Promise.resolve({ locale }),
      });

      // The locale's own authored strings, not "non-empty" (TASK-143): the old form was
      // `String(metadata.title).length > 0`, which `undefined` satisfies — `String(undefined)` is
      // nine characters — so a page exporting no title at all passed. What it cannot yet tell
      // apart is "localised" from "English everywhere": `de` and `pl` still carry the English
      // `meta.home` strings in Phase 0, so the two states coincide until they are translated.
      const meta = loadMessages(locale, ["meta"])["meta"] as {
        home: { title: string; description: string };
      };
      expect(meta.home.title, locale).not.toBe("");
      expect(metadata.title, locale).toBe(meta.home.title);
      expect(metadata.description, locale).toBe(meta.home.description);
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

    expect(html).toContain('<html lang="en" dir="ltr" class=');
    expect(html).toMatch(
      /<h1 class="display text-display-s">Page not found<\/h1>/,
    );
    // The `.label` metadata line is the status this document is served with (TASK-055).
    expect(html).toContain(">404</p>");
    // The way back is built by `localePath()`, the single URL builder (AC-13).
    expect(html).toContain('href="/en"');
  });
});

/**
 * TASK-085: the boundary is a Client Component that no provider wraps any more (spec 004 §14 A1
 * addendum), so its copy comes from `error-copy.data.ts` keyed by the URL's locale, which
 * `useParams()` reads. The mock at the top of this file is what lets both branches be asserted:
 * a locale segment, and no router context at all.
 */
describe("the localised 500 boundary (TASK-085: strings as data, no provider)", () => {
  const renderBoundary = (): string =>
    renderToStaticMarkup(<LocaleError reset={(): void => undefined} />);

  it("renders the URL locale's own copy, with no message provider in sight", () => {
    routerParams = { locale: "en-gb" };

    const html = renderBoundary();

    expect(html).toMatch(
      /<h1 class="display text-display-s">Something went wrong<\/h1>/,
    );
    expect(html).toContain("Try again");
    // `en-gb`'s thin override, so this is the *locale's* copy and not the x-default's: the one
    // observable difference between the two catalogues on this page.
    expect(html).toContain("apologise");
  });

  it("renders the x-default copy when the segment is unknown or there is no router", () => {
    routerParams = { locale: "xx" };
    expect(renderBoundary()).toContain("apologize");

    routerParams = null;
    expect(renderBoundary()).toContain("apologize");
    expect(renderBoundary()).toContain(">Something went wrong</h1>");
  });

  it("renders the same four strings `loadMessages` resolves for that locale", () => {
    routerParams = { locale: "de" };
    const messages = loadMessages("de", ["errors"]).errors.serverError;

    const html = renderBoundary();

    expect(html).toContain(`>${messages.heading}</h1>`);
    expect(html).toContain(messages.body);
    expect(html).toContain(messages.retry);
  });
});

describe("the 404's metadata (AC-25)", () => {
  it("titles the document from the catalogue", async () => {
    const metadata = await notFoundMetadata();

    expect(metadata.title).toBe("Page not found — Flowers Overseas");
    // The authored string, not `String(…).length > 0`, which `undefined` passes (TASK-143).
    expect(metadata.description).toBe(fallbackMeta().notFound.description);
  });
});

describe("the global 500 document (spec 003 §5.3, AC-25)", () => {
  const html = renderToStaticMarkup(
    <GlobalErrorDocument reset={(): void => undefined} />,
  );

  it("is an x-default document with `lang`, `dir` and a localised title", () => {
    // No font class here, unlike the other three documents: `src/app/global-error.tsx` is the
    // client-data chain TASK-046 owns (spec 004 §2's zod-free locale data), so TASK-045 left the
    // file untouched and the 500 page renders in the fallback stack. Noted in both PRs.
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain(
      "<title>Something went wrong — Flowers Overseas</title>",
    );
  });

  it("reads its copy from the catalogue, never from a literal", () => {
    expect(html).toContain(">Something went wrong</h1>");
    expect(html).toContain("Try again");
    // TASK-055: and the way out, so a retry that fails again is not the only control on the page.
    expect(html).toContain(">Home</a>");
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

    expect(html).toContain('<html lang="ar-XB" dir="rtl" class=');
    // No catalogue ships for the fake locale: the `en` fallback chain renders it (AC-31).
    // One `<h1>` (its copy is `home.hero.heading`, out of this helper's catalogue scope — see
    // the note above).
    expect([...html.matchAll(/<h1/g)]).toHaveLength(1);
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
