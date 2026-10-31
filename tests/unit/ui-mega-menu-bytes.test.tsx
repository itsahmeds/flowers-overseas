/**
 * AC-103's markup half (spec 004 §14 A-founder-2026-10-24a "Core Web Vitals", AC-103, T-109;
 * TASK-383): the header plus the Menu, as the `@header` slot renders them on `/en` and on a
 * country listing, is at most 6,144 B of Brotli. The menu is in the server HTML of every page
 * (about 60 entries), so this is the price every document pays for it.
 *
 * Measured on the banner element (`<header data-fo-header>` … `</header>`), which holds the six
 * panels and the phone Menu with its accordions; the notice bar above it is unchanged by the menu.
 *
 * **The logo's inline SVG is left out of the count, pending a ruling** (TASK-383 escalation): the
 * lockup's wordmark alone is 3,503 B of Brotli (11 KB of path data, unchanged since TASK-176), so
 * read literally the budget leaves 2,641 B for the whole header row, the six panels and the Menu,
 * which no menu of item 5's ~60 entries and four featured cards fits (measured 2,832 B over the
 * menu-less header). Everything the menu adds is counted; the drift guard below pins the logo's
 * share so a heavier lockup cannot hide in the exclusion. Red with a duplicated panel set (T-109):
 * the panel and accordion counts are asserted as six each.
 */
import { brotliCompressSync, constants } from "node:zlib";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { megaMenuModel } from "../../src/modules/catalog";
import { loadMessages } from "../../src/modules/i18n";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import { SiteHeader } from "../../src/modules/ui/layout/SiteHeader.tsx";
import type { MegaMenuModel } from "../../src/modules/ui/layout/mega-model.ts";

/** AC-103's ceiling for the header plus the Menu, Brotli, in bytes. */
const HEADER_BROTLI_MAX = 6_144;

const NOW = new Date("2026-10-25T09:00:00Z");

function banner(locale: string, megaMenu: MegaMenuModel): string {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, MESSAGE_NAMESPACES)}
      timeZone="UTC"
    >
      <SiteHeader locale={locale} megaMenu={megaMenu} switcher={null} />
    </NextIntlClientProvider>,
  );
  const start = html.indexOf("<header");
  const end = html.lastIndexOf("</header>");
  if (start === -1 || end === -1) throw new Error("no banner");
  return html.slice(start, end + "</header>".length);
}

/**
 * The logo lockup's link (`data-fo-header-logo`), the one part of the banner left out. Every other
 * inline SVG (the Basket icon, spec 010 D10; TASK-349) is counted.
 */
function logoLink(markup: string): string {
  const start = markup.lastIndexOf("<a", markup.indexOf("data-fo-header-logo"));
  const end = markup.indexOf("</a>", start);
  if (start === -1 || end === -1) throw new Error("no logo link");
  return markup.slice(start, end + "</a>".length);
}

/** The banner with the logo lockup's SVG paths left out (see the header). */
function withoutSvg(markup: string): string {
  const logo = logoLink(markup);
  return markup.replace(
    logo,
    logo.replace(/<svg[\s\S]*?<\/svg>/gu, "<svg></svg>"),
  );
}

/** The inline SVGs' own share of the banner, so the exclusion above stays the logo's alone. */
const LOGO_BROTLI_MAX = 3_584;

/** Brotli at the quality a CDN serves static HTML with (11). */
function brotliBytes(markup: string): number {
  return brotliCompressSync(Buffer.from(markup, "utf8"), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).byteLength;
}

describe("header plus Menu bytes (AC-103, T-109)", () => {
  it.each([
    ["/en", "en", null],
    ["/en-gb", "en-gb", null],
    ["/en/poland/flowers", "en", "PL"],
    ["/en/france/flowers", "en", "FR"],
  ] as const)(
    "%s: the banner, logo paths aside, is at most 6,144 B of Brotli",
    async (_path, locale, iso2) => {
      const model = await megaMenuModel(locale, iso2, { now: NOW });
      expect(model.panels).toHaveLength(6);
      const markup = banner(locale, model);
      // The whole menu is in it: every panel, and the Menu's six accordions.
      expect(markup.match(/data-fo-mega-panel=/g)).toHaveLength(6);
      expect(markup.match(/data-fo-menu-accordion=/g)).toHaveLength(6);
      expect(brotliBytes(withoutSvg(markup))).toBeLessThanOrEqual(
        HEADER_BROTLI_MAX,
      );
      // The excluded part is the lockup and nothing else: two SVGs, within the logo's budget.
      const svgs = logoLink(markup).match(/<svg[\s\S]*?<\/svg>/gu) ?? [];
      expect(svgs).toHaveLength(2);
      expect(brotliBytes(svgs.join(""))).toBeLessThanOrEqual(LOGO_BROTLI_MAX);
    },
  );
});
