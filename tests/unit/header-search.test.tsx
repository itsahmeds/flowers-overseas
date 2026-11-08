/**
 * The header search (spec 045 §2.1 as amended by §14 A-founder-2026-11-08a items 1 and 2; AC-1's
 * markup half, AC-2's form half, AC-34, and the unit halves of AC-38, AC-41, AC-42 and AC-43;
 * T-01, T-34, T-38, T-41, T-42, T-43; TASK-404, TASK-520).
 *
 * The header is rendered exactly as the `@header` slot renders it: `pageDestination()` reads the
 * route's segments, `megaMenuModel()` builds the menu in that context, and `SiteHeader` draws it
 * against the real catalogues. The five AC-1 pages: two country URLs (`/en/poland/flowers`,
 * `/de/polen/blumen`) and three without a country (`/en`, `/pl/kwiaty/roze`,
 * `/en-gb/occasions/birthday`). What only a browser can show (the opened panel at 1440 and 768,
 * the 64 px row at 390, submitting with JavaScript off, the served-body hashes across cookies and
 * headers, the route table against `main`) is the e2e suite's, carried forward in the brief.
 *
 * Countries are test data here; nothing under `src/` names one.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SEARCH_LINK_ID, siteLink } from "../../src/config/site-links.ts";
import {
  ChooserPage,
  chooserPageView,
  megaMenuModel,
  pageDestination,
} from "../../src/modules/catalog";
import { loadMessages } from "../../src/modules/i18n";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import {
  HEADER_BAND_HEIGHTS,
  HEADER_SEARCH_FIELD_WIDTH,
  HEADER_STICKY_HEIGHTS,
  headerSearchForm,
  headerSearchHref,
} from "../../src/modules/ui/layout/header-model.ts";
import { SiteHeader } from "../../src/modules/ui/layout/SiteHeader.tsx";

const ROOT = join(import.meta.dirname, "..", "..");
const NOW = new Date("2026-10-25T09:00:00Z");

type Messages = { nav: { search: { label: string; submit: string } } };
const messages = (locale: string) =>
  loadMessages(locale, MESSAGE_NAMESPACES) as unknown as Messages &
    Record<string, unknown>;

/** A page as the `@header` slot sees it: the locale and the route's segments. */
async function header(
  locale: string,
  segments: readonly string[],
  searchValue?: { q: string; to: string | undefined },
): Promise<string> {
  const destination = await pageDestination(
    locale as Parameters<typeof pageDestination>[0],
    segments,
  );
  const megaMenu = await megaMenuModel(locale, destination ?? null, {
    now: NOW,
  });
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={messages(locale)}
      timeZone="UTC"
    >
      <SiteHeader
        locale={locale}
        megaMenu={megaMenu}
        {...(searchValue === undefined ? {} : { searchValue })}
      />
    </NextIntlClientProvider>,
  );
}

/** The element that opens at `start` (a `<details>` or a `<form>`), up to its own close tag. */
function element(html: string, start: number, tag: string): string {
  const pattern = new RegExp(`<${tag}\\b|</${tag}>`, "gu");
  pattern.lastIndex = start;
  let depth = 0;
  for (
    let match = pattern.exec(html);
    match !== null;
    match = pattern.exec(html)
  ) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  throw new Error(`unclosed <${tag}>`);
}

function forms(html: string): string[] {
  return [...html.matchAll(/<form\b/gu)].map((match) =>
    element(html, match.index, "form"),
  );
}

/** The search forms only (the mega menu's facet entries are GET forms too). */
function searchForms(html: string): string[] {
  return forms(html).filter((form) =>
    form.slice(0, form.indexOf(">")).includes('role="search"'),
  );
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`, "u").exec(tag)?.[1];
}

const PAGES = [
  { locale: "en", segments: [], iso2: undefined },
  { locale: "en", segments: ["poland", "flowers"], iso2: "pl" },
  { locale: "de", segments: ["polen", "blumen"], iso2: "pl" },
  { locale: "pl", segments: ["kwiaty", "roze"], iso2: undefined },
  { locale: "en-gb", segments: ["occasions", "birthday"], iso2: undefined },
] as const;

const SEARCH_PATH: Record<string, string> = {
  en: "/en/search",
  "en-gb": "/en-gb/search",
  de: "/de/suche",
  pl: "/pl/szukaj",
};
describe("the search site link and the header model (AC-34)", () => {
  it("publishes `search` for spec 045 as a route of page type `search`", () => {
    const link = siteLink(SEARCH_LINK_ID);
    expect(link.published).toBe(true);
    expect(link.owningSpec).toBe("045");
    expect(link.target).toEqual({ kind: "route", pageType: "search" });
  });

  it("headerSearchHref: the search path, with `?to=` only for a destination", () => {
    expect(headerSearchHref("de")).toBe("/de/suche");
    expect(headerSearchHref("de", null)).toBe("/de/suche");
    expect(headerSearchHref("en", "PL")).toBe("/en/search?to=pl");
    expect(headerSearchHref("pl", "DE")).toBe("/pl/szukaj?to=de");
  });

  it("headerSearchForm: the search path on every page, with `to` only for a destination (AC-34, AC-38)", () => {
    expect(headerSearchForm("en", "PL")).toEqual({
      action: "/en/search",
      to: "pl",
    });
    expect(headerSearchForm("de", null)).toEqual({
      action: "/de/suche",
      to: undefined,
    });
    for (const [locale, path] of Object.entries(SEARCH_PATH)) {
      expect(headerSearchForm(locale)?.action, locale).toBe(path);
      expect(headerSearchForm(locale)?.action).not.toContain("/search/");
    }
  });

  it("reserves the two-row header: 122 on a phone, 114 from md at every width (AC-41, AC-42)", () => {
    expect(HEADER_STICKY_HEIGHTS).toEqual({
      phone: 122,
      mobile: 114,
      desktop: 114,
    });
    expect(HEADER_BAND_HEIGHTS.searchPhone).toBe(56);
    expect(
      HEADER_BAND_HEIGHTS.mastheadMobile +
        1 +
        HEADER_BAND_HEIGHTS.searchPhone +
        1,
    ).toBe(HEADER_STICKY_HEIGHTS.phone);
    expect(
      HEADER_BAND_HEIGHTS.mastheadDesktop +
        1 +
        HEADER_BAND_HEIGHTS.categoryMobile +
        1,
    ).toBe(HEADER_STICKY_HEIGHTS.desktop);
    expect(HEADER_SEARCH_FIELD_WIDTH).toEqual({ min: 240, max: 480 });
  });
});

describe("the header field on AC-1's five pages (AC-38, AC-41, AC-42)", () => {
  it.each(PAGES)(
    "$locale /$segments: one visible field, no details, no phone link, the Menu's form",
    async ({ locale, segments, iso2 }) => {
      const html = await header(locale, segments);
      const { label, submit } = messages(locale).nav.search;

      // No search `<details>`, no icon summary, no phone row link (AC-41, AC-42).
      expect(html).not.toContain("data-fo-header-search=");
      expect(html).not.toContain('data-fo-header-item="search"');

      // The field's wrapper: below md the full-width second row, from md the masthead's column 2.
      const wrapStart = html.indexOf("data-fo-header-search-field");
      expect(wrapStart).toBeGreaterThan(0);
      const wrapTag = html.slice(
        html.lastIndexOf("<div", wrapStart),
        html.indexOf(">", wrapStart) + 1,
      );
      for (const cls of [
        "col-span-full",
        "row-start-2",
        "md:col-start-2",
        "md:row-start-1",
        "border-t",
        "min-h-[57px]",
      ]) {
        expect(wrapTag, cls).toContain(cls);
      }
      // It is not inside any <details> (visible with no interaction): every <details> before it is closed.
      const before = html.slice(0, wrapStart);
      expect((before.match(/<details\b/gu) ?? []).length).toBe(
        (before.match(/<\/details>/gu) ?? []).length,
      );
      // In DOM order after the logo and before the end cluster and the Basket (AC-41).
      expect(html.indexOf("data-fo-header-logo")).toBeLessThan(wrapStart);
      const basket = html.indexOf('data-fo-header-item="basket"');
      if (basket >= 0) expect(wrapStart).toBeLessThan(basket);

      const form = searchForms(html.slice(wrapStart))[0] ?? "";
      const formTag = form.slice(0, form.indexOf(">") + 1);
      expect(attr(formTag, "role")).toBe("search");
      expect(attr(formTag, "method")).toBe("get");
      expect(attr(formTag, "action")).toBe(SEARCH_PATH[locale]);
      const inputs = [...form.matchAll(/<input[^>]*>/gu)].map(
        (match) => match[0],
      );
      const field = inputs.filter((tag) => attr(tag, "type") === "search");
      expect(field).toHaveLength(1);
      const q = field[0] ?? "";
      expect(attr(q, "name")).toBe("q");
      expect(attr(q, "maxLength")).toBe("80");
      expect(attr(q, "autoComplete")).toBe("off");
      expect(attr(q, "enterKeyHint")).toBe("search");
      expect(attr(q, "placeholder")).toBe(label);
      // A prebuilt page's field has no value (AC-43).
      expect(attr(q, "value")).toBeUndefined();
      expect(form).toContain(
        `<label class="sr-only" for="${attr(q, "id") ?? "-"}">${label}</label>`,
      );
      const hidden = inputs.filter((tag) => attr(tag, "type") === "hidden");
      expect(
        hidden.map((tag) => [attr(tag, "name"), attr(tag, "value")]),
      ).toEqual(iso2 === undefined ? [] : [["to", iso2]]);
      if (iso2 !== undefined) {
        expect(form.indexOf('type="search"')).toBeLessThan(
          form.indexOf('type="hidden"'),
        );
      }
      // The submit: a 44 px ink circle named by `nav.search.submit`.
      const buttons = [
        ...form.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/gu),
      ];
      expect(buttons).toHaveLength(1);
      expect(attr(buttons[0]?.[1] ?? "", "type")).toBe("submit");
      expect(attr(buttons[0]?.[1] ?? "", "class")).toContain(
        "size-(--target-min)",
      );
      expect(buttons[0]?.[2]).toContain(
        `<span class="sr-only">${submit}</span>`,
      );

      // The opened Menu holds the same form (its own field id).
      const menuStart = html.search(/<details[^>]*\sdata-fo-menu=""/u);
      const menu = element(html, menuStart, "details");
      const menuForms = searchForms(menu);
      expect(menuForms).toHaveLength(1);
      const same = (markup: string): string =>
        markup.replaceAll("menu-search", "X").replaceAll("header-search", "X");
      expect(same(menuForms[0] ?? "")).toBe(same(form));

      // The header's search forms are the field and the Menu's; nothing posts to the chooser.
      expect(searchForms(html)).toHaveLength(2);
      expect(html).not.toMatch(/method="post"/iu);
      expect(html).not.toMatch(
        /\/(choose-country|land-waehlen|wybierz-kraj)\/search/u,
      );
    },
  );

  it("on the results page the field holds the words and the searched `to` (AC-43)", async () => {
    const html = await header("en", [], { q: "roses <b>", to: "pl" });
    const form =
      searchForms(html.slice(html.indexOf("data-fo-header-search-field")))[0] ??
      "";
    expect(form).toContain('value="roses &lt;b&gt;"');
    expect(form).toContain('<input type="hidden" name="to" value="pl"/>');
    const empty = await header("en", [], { q: "", to: undefined });
    const emptyForm =
      searchForms(
        empty.slice(empty.indexOf("data-fo-header-search-field")),
      )[0] ?? "";
    expect(emptyForm).not.toMatch(/\svalue=/u);
    expect(empty).not.toContain("autofocus");
  });

  it("draws the same markup whatever the page's destination word, from the URL only", async () => {
    // `fo_dest`, a cookie or a header cannot reach `SiteHeader`: its only inputs are the locale
    // and the menu the route's segments build. Two renders of one page are one document.
    expect(await header("en", ["poland", "flowers"])).toBe(
      await header("en", ["poland", "flowers"]),
    );
    const source = readFileSync(
      join(ROOT, "src", "modules", "ui", "layout", "HeaderSearch.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/["']use client["']/u);
    expect(source).not.toMatch(/cookies\(|headers\(|fo_dest|document\.cookie/u);
  });
});

describe("the chooser keeps the words (spec 045 §2.1, §2.4 item 3; TASK-404)", () => {
  it("carries `q` as a hidden field of the choice form, never in a link", async () => {
    const view = await chooserPageView(
      "en",
      { locale: "en", kind: "search" },
      { kind: "ask" },
      { remembered: undefined, chips: 4 },
    );
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="en"
        messages={messages("en")}
        timeZone="UTC"
      >
        <ChooserPage carry={[{ name: "q", value: "roses <b>" }]} view={view} />
      </NextIntlClientProvider>,
    );
    const form = forms(html)[0] ?? "";
    expect(attr(form.slice(0, form.indexOf(">") + 1), "action")).toBe(
      view.action,
    );
    expect(form).toContain(
      '<input type="hidden" name="q" value="roses &lt;b&gt;"/>',
    );
    for (const [, href = ""] of html.matchAll(/href="([^"]*)"/gu)) {
      expect(href).not.toMatch(/[?&]q=/u);
    }
  });
});
