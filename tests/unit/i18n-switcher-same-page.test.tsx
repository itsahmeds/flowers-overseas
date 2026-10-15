/**
 * The language links keep the page (spec 003 §2 L79 "`localePath()`-built links to the same path
 * in every launch locale, falling back to the locale home; no JS required", §5.3 L194; spec 004
 * §14 A24 AC-47; TASK-233).
 *
 *  1. **`pageAlternatePaths()`**, the source the `@switcher` slot reads: one page of each of the
 *     ten types, asked from English and from the page's own locale, answers with that page's path
 *     in exactly the locales that have it. The Poland guide has no German or Polish page, so its
 *     map is `en` and `en-gb` and nothing else; a path the router refuses answers `{}`.
 *  2. **`LocaleSwitcher` with `paths`**: each sibling link is the page's own path, a locale missing
 *     from the map links its home, and an entry that is not a launch code or not under its own
 *     prefix is dropped, as the popup's are. Only shown locales are linked (spec 003 §14
 *     A-founder-2026-10-14c, TASK-237): the committed registry offers `en` and `en-gb`, and each
 *     case is also run on a registry with every launch locale shown, the data flip's state.
 *  3. **The three mounts**: the header draws the node it is handed in the utility strip and the
 *     phone menu, and the footer in its language row, so the layout's slot reaches all three.
 *
 * What needs a router (the slot mirroring each depth, the links in the served HTML) is
 * `tests/e2e/language-links.spec.ts`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { LOCALES } from "../../src/config/locales.ts";
import { pageAlternatePaths } from "../../src/modules/catalog";
import { LocaleSwitcher, loadMessages } from "../../src/modules/i18n";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import {
  localeRegistryOf,
  withLocaleRegistry,
} from "../../src/modules/i18n/registry.ts";
import { SiteFooter } from "../../src/modules/ui/layout/SiteFooter.tsx";
import { SiteHeader } from "../../src/modules/ui/layout/SiteHeader.tsx";
import { LANGUAGE_LINK_PAGES as PAGES } from "../support/language-links.ts";

/** `/de/polen/blumen` → `["de", ["polen", "blumen"]]`. */
function split(path: string): [string, string[]] {
  const [, locale = "", ...segments] = path.split("/");
  return [locale, segments];
}

describe("pageAlternatePaths(): this page in every locale that has it", () => {
  for (const [type, cluster] of Object.entries(PAGES)) {
    for (const [from, path] of Object.entries(cluster)) {
      it(`${type}, asked from ${path}`, async () => {
        const [locale, segments] = split(path);
        expect(locale).toBe(from);
        expect(await pageAlternatePaths(locale, segments)).toEqual(cluster);
      });
    }
  }

  it("answers nothing for a path the router refuses, so every link falls back to a home", async () => {
    // No German Poland guide is published: the German path is a 404, not a page with a cluster.
    expect(
      await pageAlternatePaths("de", ["blumen-verschicken", "polen"]),
    ).toEqual({});
    expect(await pageAlternatePaths("en", ["flowers"])).toEqual({});
    expect(await pageAlternatePaths("en", ["boom"])).toEqual({});
    expect(
      await pageAlternatePaths("en", ["poland", "product", "no-such-bouquet"]),
    ).toEqual({});
    expect(await pageAlternatePaths("xx", ["send-flowers-to"])).toEqual({});
  });
});

function renderSwitcher(
  locale: string,
  paths?: Readonly<Record<string, string>>,
): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, ["a11y", "common"])}
      timeZone="UTC"
    >
      <LocaleSwitcher locale={locale} {...(paths ? { paths } : {})} />
    </NextIntlClientProvider>,
  );
}

/** Each link's `hreflang` → `href`, in document order. */
function links(html: string): Record<string, string> {
  return Object.fromEntries(
    [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*hrefLang="([^"]+)"/gu)].map(
      ([, href = "", lang = ""]) => [lang, href],
    ),
  );
}

/** Every launch locale shown: the registry once `de` and `pl` are flipped (AC-48's data flip). */
const allShown = localeRegistryOf(
  LOCALES.map((locale) =>
    locale.isLaunch ? { ...locale, shown: true } : locale,
  ),
);

function shownAll<T>(body: () => T): Promise<T> {
  return withLocaleRegistry(allShown, body);
}

describe("LocaleSwitcher with this page's paths", () => {
  it("links each shown locale to the page itself, and the current locale is not a link", async () => {
    const html = renderSwitcher("en", PAGES["product"]);
    expect(links(html)).toEqual({
      "en-GB": "/en-gb/poland/product/small-kindness",
    });
    expect(html).toContain('<span aria-current="page" lang="en">English');
    expect(
      links(await shownAll(() => renderSwitcher("en", PAGES["product"]))),
    ).toEqual({
      "en-GB": "/en-gb/poland/product/small-kindness",
      de: "/de/polen/produkt/small-kindness",
      pl: "/pl/polska/produkt/small-kindness",
    });
  });

  it("links a locale with no such page to its home (the guide in German and Polish)", async () => {
    expect(links(renderSwitcher("en-gb", PAGES["guide"]))).toEqual({
      en: "/en/send-flowers-to/poland",
    });
    expect(
      links(await shownAll(() => renderSwitcher("en-gb", PAGES["guide"]))),
    ).toEqual({
      en: "/en/send-flowers-to/poland",
      de: "/de",
      pl: "/pl",
    });
  });

  it("drops an entry that is not a launch locale or not under its own prefix", async () => {
    const paths = {
      "en-gb": "/de/blumen",
      de: "https://example.com/de",
      fr: "/fr/fleurs",
      pl: "/pl/okazje",
    };
    expect(links(renderSwitcher("en", paths))).toEqual({ "en-GB": "/en-gb" });
    expect(links(await shownAll(() => renderSwitcher("en", paths)))).toEqual({
      "en-GB": "/en-gb",
      de: "/de",
      pl: "/pl/okazje",
    });
  });

  it("links the shown homes on a hidden locale's page, and marks no entry current (AC-46)", async () => {
    // `/de` is reached by URL only: its switcher lists the shown locales and not the page's own.
    const html = renderSwitcher("de");
    expect(links(html)).toEqual({ en: "/en", "en-GB": "/en-gb" });
    expect(html).not.toContain("aria-current");
    expect(html).not.toMatch(/lang="(?:de|pl)"/u);
    expect(links(await shownAll(() => renderSwitcher("de")))).toEqual({
      en: "/en",
      "en-GB": "/en-gb",
      pl: "/pl",
    });
  });
});

describe("the three mounts draw the switcher the layout hands them", () => {
  const marker = (
    <LocaleSwitcher locale="en" paths={PAGES["occasionHub"] ?? {}} />
  );

  function inProvider(node: React.ReactNode): string {
    return renderToStaticMarkup(
      <NextIntlClientProvider
        locale="en"
        messages={loadMessages("en", MESSAGE_NAMESPACES)}
        timeZone="UTC"
      >
        {node}
      </NextIntlClientProvider>,
    );
  }

  it("the utility strip and the phone menu", () => {
    const html = inProvider(<SiteHeader locale="en" switcher={marker} />);
    const strip = html.split("data-fo-header-switcher")[1] ?? "";
    expect(strip).toContain('href="/en-gb/occasions/birthday"');
    // Twice in the header: the strip and the menu sheet, and never a British home link.
    expect(html.match(/href="\/en-gb\/occasions\/birthday"/gu)).toHaveLength(2);
    expect(html).not.toContain('href="/en-gb"');
    // `de` and `pl` are hidden: no language link of theirs in any mount.
    expect(html).not.toMatch(/hrefLang="(?:de|pl)"/u);
  });

  it("the footer language row", () => {
    const html = inProvider(<SiteFooter locale="en" switcher={marker} />);
    const row = html.split("data-fo-footer-languages")[1] ?? "";
    expect(row).toContain('href="/en-gb/occasions/birthday"');
    expect(html).not.toContain('href="/en-gb"');
    expect(html).not.toMatch(/hrefLang="(?:de|pl)"/u);
  });
});
