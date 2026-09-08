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
const { default: ChooserPage } = await import("../../src/app/(chooser)/page");
const { default: ChooserError } = await import("../../src/app/(chooser)/error");
const { default: LocaleLayout, generateStaticParams } =
  await import("../../src/app/[locale]/layout");
const { default: LocaleHomePage } = await import("../../src/app/[locale]/page");
const { default: LocaleError } = await import("../../src/app/[locale]/error");
const { default: RootLayout, metadata: rootMetadata } =
  await import("../../src/app/layout");
const { default: NotFoundDocument } = await import("../../src/app/not-found");

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

describe("the `/` document (spec 003 §5.3, TASK-035 fills it)", () => {
  const html = renderToStaticMarkup(
    <ChooserLayout>
      <ChooserPage />
    </ChooserLayout>,
  );

  it("takes `lang`/`dir` from the x-default locale, with no literal in the file", () => {
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).not.toContain('lang="en-GB"');
  });

  it("still renders no copy, so the axe exception and the visual baseline hold", () => {
    expect(html.replace(/<[^>]*>/g, "").trim()).toBe("");
    expect(renderToStaticMarkup(<ChooserError />)).toBe("<main></main>");
  });

  it("keeps spec 001 AC-15's robots value exactly", () => {
    expect(chooserMetadata.robots).toBe("noindex,nofollow");
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
    expect(
      renderToStaticMarkup(<RootLayout>{<ChooserPage />}</RootLayout>),
    ).toBe("<main></main>");
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
