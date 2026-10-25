/**
 * T-31 / AC-31 (TASK-039): "a new locale is data" — the `plan/09` promise, tested.
 *
 * A fifth locale (`fr`, fallback `en`, **no catalogue file**) is added through the registry hook
 * inside `src/modules/i18n` and nothing else. The assertions are the four halves of AC-31:
 *
 *  1. it **works**: `/fr` renders as a document with `lang="fr"`, its English fallback copy and
 *     the switcher, and it appears in `generateStaticParams`;
 *  2. it is **non-indexable**: `unreviewedShare("fr")` is 1, so `isLocaleIndexable("fr")` is
 *     false — English under a French URL is duplicate thin content (§6);
 *  3. it is **beta-tagged**: the switcher marks it without a caller computing anything;
 *  4. it is **absent from `alternatesFor()`**, so it claims to be nobody's French alternate.
 *
 * AC-31's "with no change under `src/app/` or `src/modules/`" is asserted literally: the test
 * hashes every file under both trees before and after the fifth locale renders and requires the
 * two manifests to be identical. The fake registry writes nothing, needs no new file and edits
 * none — which is the whole claim. (The *pre-existing* files of this branch are irrelevant to it:
 * the assertion is about what adding a locale costs, not about what the repository contains.)
 *
 * The `next-intl/server` mock is the app-shell test's: what is stubbed is Next's per-request
 * plumbing, never message resolution, so the copy asserted below is the shipped copy.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import type { LocaleConfig } from "../../src/config/locales.ts";
import { alternatesFor } from "../../src/modules/i18n/alternates.ts";
import { CANONICAL_HOST, sitemapLocales } from "../../src/modules/seo";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import {
  type MessageNamespace,
  type MessageSource,
  loadMessages,
  repoMessageSource,
  withMessageSource,
} from "../../src/modules/i18n/messages.ts";
import {
  localeRegistryOf,
  staticLocaleRegistry,
  withLocaleRegistry,
} from "../../src/modules/i18n/registry.ts";
import {
  isLocaleIndexable,
  localeBetaTag,
  resetReviewCache,
  unreviewedShare,
} from "../../src/modules/i18n/review.ts";

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

const { default: LocaleLayout, generateStaticParams } =
  await import("../../src/app/[locale]/layout");
const { default: LocaleHomePage } = await import("../../src/app/[locale]/page");

const repoRoot = resolve(__dirname, "../..");

/** The fifth locale, exactly as `src/config/locales.ts` would author it — and nothing else. */
const FRENCH: LocaleConfig = {
  code: "fr",
  bcp47: "fr",
  formattingTag: "fr",
  name: "French",
  nativeName: "Français",
  dir: "ltr",
  isLaunch: true,
  // Spec 003 §14 A-founder-2026-10-14c: `shown` is required; a fake launch locale states it.
  shown: true,
  // TASK-042: a pseudo-locale is a registry flag now; a fake launch locale states it.
  isPseudo: false,
  fallbackCode: "en",
  currencyDefault: "EUR",
  numberingSystem: "latn",
  hreflangAliases: ["fr", "fr-FR"],
  chooseSegment: "choisir-un-pays",
  pathSegments: {
    destinations: "envoyer-des-fleurs",
    shopCategory: "fleurs",
    occasions: "occasions",
    product: "produit",
    blog: "blog",
    forFlorists: "pour-fleuristes",
    legal: "mentions-legales",
    howItWorks: "comment-ca-marche",
    guarantee: "garantie",
    help: "aide",
    about: "a-propos",
    delivery: "livraison-et-paiement",
    imprint: "mentions",
    search: "recherche",
  },
};

const fiveLocales = localeRegistryOf([...staticLocaleRegistry.list(), FRENCH]);

/** sha256 of every file under `dir`, keyed by repo-relative path. */
function manifest(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile()) {
        out[relative(repoRoot, path)] = createHash("sha256")
          .update(readFileSync(path))
          .digest("hex");
      }
    }
  };
  walk(join(repoRoot, dir));
  return out;
}

async function withFrench<T>(body: () => T | Promise<T>): Promise<T> {
  resetReviewCache();
  try {
    return await withLocaleRegistry(fiveLocales, body);
  } finally {
    resetReviewCache();
  }
}

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

describe("a fifth locale is data (AC-31)", () => {
  it("does not exist before the registry says so", async () => {
    await expect(renderLocaleDocument("fr")).rejects.toThrow(/NEXT_HTTP/);
  });

  it("renders, prerenders and falls back to English with no catalogue of its own", async () => {
    const { html, params } = await withFrench(async () => ({
      html: await renderLocaleDocument("fr"),
      params: generateStaticParams().map((param) => param.locale),
    }));

    expect(html).toContain('<html lang="fr" dir="ltr" class=');
    // No `messages/fr.json` ships: the `fr → en` fallback chain renders it (§2 "Messages").
    // The fallback chain is what is under test, not the copy: `fr` has no catalogue, so the
    // document renders from `en` — visible here as the layout's `a11y` copy.
    expect([...html.matchAll(/<h1/g)]).toHaveLength(1);
    expect(html).toContain("Skip to content");
    expect(params).toEqual(["en", "en-gb", "de", "pl", "fr"]);
  });

  it("is non-indexable and beta-tagged, because English is not French", async () => {
    const answers = await withFrench(() => ({
      share: unreviewedShare("fr"),
      indexable: isLocaleIndexable("fr"),
      beta: localeBetaTag("fr"),
    }));

    expect(answers).toEqual({ share: 1, indexable: false, beta: true });
  });

  it("marks itself beta in the switcher with no caller computing a share", async () => {
    const html = await withFrench(() => renderLocaleDocument("en"));

    expect(html).toContain('lang="fr" hrefLang="fr">Français</a>');
    expect(html).toContain('<span class="ms-1" data-beta="true">Beta</span>');
    // `en` and `en-gb` are reviewed and `de`/`pl` are hidden (spec 003 §14
    // A-founder-2026-10-14c), so exactly the one shown unreviewed locale is marked — **per
    // switcher**. The header strip, the phone Menu and the footer each mount `LocaleSwitcher`, so
    // the ratio is what this asserts, not the raw count.
    const switchers = html.match(/aria-label="Change language"/g)?.length ?? 0;
    expect(switchers).toBeGreaterThan(0);
    expect(html.match(/data-beta="true"/g)).toHaveLength(switchers);
  });

  it("claims to be nobody's alternate while it is unreviewed", async () => {
    const pages = await withFrench(() =>
      alternatesFor(
        { pageType: "home" },
        { baseUrl: "https://flowersoverseas.com" },
      ),
    );

    expect(JSON.stringify(pages)).not.toContain("fr");
    expect(pages.map((page) => page.url)).toEqual([
      "https://flowersoverseas.com/en",
      "https://flowersoverseas.com/en-gb",
    ]);
  });

  it("costs no file under `src/app/` or `src/modules/`", async () => {
    const before = {
      app: manifest("src/app"),
      modules: manifest("src/modules"),
    };

    await withFrench(() => renderLocaleDocument("fr"));

    expect({
      app: manifest("src/app"),
      modules: manifest("src/modules"),
    }).toEqual(before);
  });

  it("leaves the static registry exactly as it was", () => {
    expect(generateStaticParams()).toHaveLength(4);
    expect(isLocaleIndexable("fr")).toBe(false);
  });
});

/**
 * AC-48 / T-48's integration half (spec 003 §14 A-founder-2026-10-14c clause 4): showing a hidden
 * locale again is a data flip. `de` with every key reviewed, then `shown: true` in a fixture
 * registry: the switcher gains its link and `isLocaleIndexable("de")` turns true, and no file under
 * `src/app/` or `src/modules/` changes — the AC-31 harness above, applied to `shown`.
 */
describe("showing `de` again is data (AC-48)", () => {
  const reviewedDe: MessageSource = {
    catalogue: (locale) => repoMessageSource.catalogue(locale),
    meta: (locale) => {
      const meta = repoMessageSource.meta(locale);
      if (locale !== "de" || meta === undefined) return meta;
      return Object.fromEntries(
        Object.entries(meta).map(([key, record]) => [
          key,
          {
            ...record,
            source: "human" as const,
            reviewed: true,
            reviewedBy: "native reviewer",
            reviewedAt: "2026-10-15T00:00:00Z",
          },
        ]),
      );
    },
  };
  const deShown = (shown: boolean) =>
    localeRegistryOf(
      staticLocaleRegistry
        .list()
        .map((locale) =>
          locale.code === "de" ? { ...locale, shown } : locale,
        ),
    );

  async function underFlip<T>(
    shown: boolean,
    body: () => T | Promise<T>,
  ): Promise<T> {
    resetReviewCache();
    try {
      return await withLocaleRegistry(deShown(shown), () =>
        withMessageSource(reviewedDe, body),
      );
    } finally {
      resetReviewCache();
    }
  }

  it("adds the German link to the switcher and makes `de` indexable, with no file changed", async () => {
    const before = {
      app: manifest("src/app"),
      modules: manifest("src/modules"),
    };
    const GERMAN_LINK = 'lang="de" hrefLang="de">Deutsch</a>';

    const observe = async () => ({
      html: await renderLocaleDocument("en"),
      indexable: isLocaleIndexable("de"),
      hreflang: alternatesFor(
        { pageType: "home" },
        { baseUrl: `https://${CANONICAL_HOST}` },
      ).map((page) => page.url.slice(`https://${CANONICAL_HOST}/`.length)),
      sitemaps: sitemapLocales({
        environment: "production",
        siteUrl: `https://${CANONICAL_HOST}`,
      }),
    });
    const hidden = await underFlip(false, observe);
    const shown = await underFlip(true, observe);

    // Hidden: a fully reviewed `de` is still offered nowhere and indexed nowhere (AC-47).
    expect(hidden.indexable).toBe(false);
    expect(hidden.html).not.toContain(GERMAN_LINK);
    expect(hidden.hreflang).toEqual(["en", "en-gb"]);
    expect(hidden.sitemaps).toEqual(["en", "en-gb"]);
    // Shown: the same tree, one flag apart.
    expect(shown.indexable).toBe(true);
    expect(shown.html).toContain(GERMAN_LINK);
    expect(shown.hreflang).toEqual(["en", "en-gb", "de"]);
    // The sitemaps read the same gate; `de` has no published corridor guide, so no German URL
    // is indexable yet and the index still announces the English locales only.
    expect(shown.sitemaps).toEqual(["en", "en-gb"]);
    expect({
      app: manifest("src/app"),
      modules: manifest("src/modules"),
    }).toEqual(before);
  });

  it("leaves the static registry hiding `de` afterwards", () => {
    expect(staticLocaleRegistry.get("de")?.shown).toBe(false);
    expect(isLocaleIndexable("de")).toBe(false);
  });
});
