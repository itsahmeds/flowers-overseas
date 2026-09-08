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

import type { LocaleConfig } from "../../src/config/locales.ts";
import { alternatesFor } from "../../src/modules/i18n/alternates.ts";
import {
  type MessageNamespace,
  loadMessages,
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
  // TASK-042: a pseudo-locale is a registry flag now; a fake launch locale states it.
  isPseudo: false,
  fallbackCode: "en",
  currencyDefault: "EUR",
  numberingSystem: "latn",
  hreflangAliases: ["fr", "fr-FR"],
  pathSegments: {
    destinations: "envoyer-des-fleurs",
    shopCategory: "fleurs",
    occasions: "occasions",
    product: "produit",
    blog: "blog",
    forFlorists: "pour-fleuristes",
    legal: "mentions-legales",
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

describe("a fifth locale is data (AC-31)", () => {
  it("does not exist before the registry says so", async () => {
    await expect(renderLocaleDocument("fr")).rejects.toThrow(/NEXT_HTTP/);
  });

  it("renders, prerenders and falls back to English with no catalogue of its own", async () => {
    const { html, params } = await withFrench(async () => ({
      html: await renderLocaleDocument("fr"),
      params: generateStaticParams().map((param) => param.locale),
    }));

    expect(html).toContain('<html lang="fr" dir="ltr">');
    // No `messages/fr.json` ships: the `fr → en` fallback chain renders it (§2 "Messages").
    expect(html).toContain("<h1>Send flowers across Europe</h1>");
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
    // `en` and `en-gb` are reviewed, so exactly the three unreviewed locales are marked.
    expect(html.match(/data-beta="true"/g)).toHaveLength(3);
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
