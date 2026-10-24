/**
 * The header's Basket link (spec 010 §14 A-founder-2026-10-22 D10, items 8 and 12; AC-70, AC-71
 * render half, AC-73 basket half; T-70 unit half, T-71 unit half, T-73 plurals; TASK-349).
 *
 * Rendered with `react-dom/server` against the real `messages/*.json`, as `ui-site-header.test.tsx`
 * does. What is a fact about the markup is here: one link to `/{locale}/basket` with
 * `rel="nofollow"`, the `nav.basket` name, an empty slot of a fixed 20 x 20 px, the same bytes for
 * every visitor, and the pre-resolved states the island writes (the `nav.basketCount` plural,
 * `Intl` digits). The browser halves (badge after the LCP mark, zero requests in the request log,
 * CLS 0, the crawl) are TASK-208's e2e and Lighthouse.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NextIntlClientProvider, createTranslator } from "next-intl";

import { BASKET_MAX_LINES } from "../../src/config/basket.ts";
import { isPublished, siteLink } from "../../src/config/site-links.ts";
import { loadMessages } from "../../src/modules/i18n";
import { BASKET_BADGE_CLASS } from "../../src/modules/ui/basket/BasketCountBadge.tsx";
import { headerBasketHref } from "../../src/modules/ui/layout/header-model.ts";
import {
  SiteHeader,
  basketCountStates,
} from "../../src/modules/ui/layout/SiteHeader.tsx";

const ROOT = join(import.meta.dirname, "..", "..");
const LOCALES = ["en", "en-gb", "de", "pl"] as const;

function render(locale: string, basketCurrent = false): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, ["nav", "company", "a11y", "common"])}
      timeZone="UTC"
    >
      <SiteHeader basketCurrent={basketCurrent} locale={locale} />
    </NextIntlClientProvider>,
  );
}

/** Every `<a …>` opening tag carrying the basket's header marker. */
function basketLinks(html: string): string[] {
  return [
    ...html.matchAll(/<a\b[^>]*data-fo-header-item="basket"[^>]*>/gu),
  ].map((match) => match[0]);
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}="([^"]*)"`, "u").exec(tag);
  return match?.[1]
    ?.replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#x27;", "'");
}

/** The link element, from its opening tag to its `</a>`. */
function basketElement(html: string): string {
  const start = html.indexOf('data-fo-header-item="basket"');
  const open = html.lastIndexOf("<a", start);
  return html.slice(open, html.indexOf("</a>", start) + 4);
}

function plTranslator() {
  return createTranslator({
    locale: "pl",
    messages: loadMessages("pl", ["nav"]),
    namespace: "nav",
  });
}

describe("AC-70: one Basket link, the same for every visitor", () => {
  it("is published with the basket page as its target (a data flip, no code branch)", () => {
    expect(isPublished("basket")).toBe(true);
    expect(siteLink("basket").target).toEqual({
      kind: "transactional",
      page: "basket",
    });
    for (const locale of LOCALES) {
      expect(headerBasketHref(locale)).toBe(`/${locale}/basket`);
    }
  });

  it("draws exactly one link per header, to /{locale}/basket, rel=nofollow, named `nav.basket`, with an empty fixed slot", () => {
    for (const locale of LOCALES) {
      const html = render(locale);
      const links = basketLinks(html);
      expect(links, locale).toHaveLength(1);
      const [tag = ""] = links;
      expect(attribute(tag, "href")).toBe(`/${locale}/basket`);
      expect(attribute(tag, "rel")).toBe("nofollow");
      expect(attribute(tag, "aria-current")).toBeUndefined();
      const element = basketElement(html);
      const name = loadMessages(locale, ["nav"]) as { nav: { basket: string } };
      expect(element).toContain(
        `<span class="sr-only" data-fo-basket-name="">${name.nav.basket}</span>`,
      );
      // The slot: present, empty, not switched on, 20 x 20 px, placed absolutely over the icon.
      expect(element).toContain(
        `<span aria-hidden="true" class="${BASKET_BADGE_CLASS}" data-fo-basket-badge=""></span>`,
      );
      expect(BASKET_BADGE_CLASS).toContain("size-[20px]");
      expect(BASKET_BADGE_CLASS).toContain("absolute");
      expect(BASKET_BADGE_CLASS.split(" ")).not.toContain("relative");
    }
  });

  it("the en name is exactly 'Basket', with no figure in the server HTML", () => {
    const element = basketElement(render("en"));
    expect(element).toContain(">Basket</span>");
    expect(element).not.toMatch(/data-fo-basket-badge="">[^<]/u);
    expect(element).not.toContain("data-on");
  });

  it("is marked as the current page on the basket only", () => {
    const [tag = ""] = basketLinks(render("en", true));
    expect(attribute(tag, "aria-current")).toBe("page");
  });

  it("renders the same bytes twice and reads no request: no cookie, header or search parameter in its files", () => {
    for (const locale of LOCALES) {
      expect(render(locale)).toBe(render(locale));
    }
    for (const file of [
      "src/modules/ui/layout/SiteHeader.tsx",
      "src/modules/ui/layout/header-model.ts",
      "src/modules/ui/basket/BasketCountBadge.tsx",
      "src/app/[locale]/route-header.tsx",
      "src/app/[locale]/@header/(checkout)/basket/page.tsx",
    ]) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source, file).not.toMatch(/next\/headers|cookies\(|searchParams/u);
      expect(source, file).not.toContain('"use client"');
    }
  });
});

describe("AC-71 render half: the states the island writes are resolved on the server", () => {
  it("carries index 0 (empty) to BASKET_MAX_LINES, figure through Intl and name through nav.basketCount", () => {
    const [tag = ""] = basketLinks(render("en"));
    const states = JSON.parse(attribute(tag, "data-fo-basket") ?? "[]") as [
      string,
      string,
    ][];
    expect(states).toHaveLength(BASKET_MAX_LINES + 1);
    expect(states[0]).toEqual(["", "Basket"]);
    expect(states[1]).toEqual(["1", "Basket, 1 bouquet"]);
    expect(states[3]).toEqual(["3", "Basket, 3 bouquets"]);
    expect(states[BASKET_MAX_LINES]).toEqual([
      String(BASKET_MAX_LINES),
      `Basket, ${String(BASKET_MAX_LINES)} bouquets`,
    ]);
  });

  it("basketCountStates formats each figure with the locale's digits", () => {
    const states = basketCountStates("ar-XB", "e", (n) => `n${String(n)}`);
    expect(states[0]).toEqual(["", "e"]);
    expect(states[2]?.[0]).toBe(new Intl.NumberFormat("ar-XB").format(2));
    expect(states[2]?.[1]).toBe("n2");
  });
});

describe("AC-73 basket half: Polish plural forms (T-73)", () => {
  it("nav.basketCount in pl for 1, 2, 5 and 22", () => {
    const t = plTranslator();
    expect(t("basketCount", { count: 1 })).toBe("Koszyk, 1 bukiet");
    expect(t("basketCount", { count: 2 })).toBe("Koszyk, 2 bukiety");
    expect(t("basketCount", { count: 5 })).toBe("Koszyk, 5 bukietów");
    expect(t("basketCount", { count: 22 })).toBe("Koszyk, 22 bukiety");
  });

  it("the pl header carries the few and many forms", () => {
    const [tag = ""] = basketLinks(render("pl"));
    const states = JSON.parse(attribute(tag, "data-fo-basket") ?? "[]") as [
      string,
      string,
    ][];
    expect(states[2]?.[1]).toBe("Koszyk, 2 bukiety");
    expect(states[5]?.[1]).toBe("Koszyk, 5 bukietów");
  });

  it("checkout.basket.unavailableSummary in pl for 1, 2, 5 and 22", () => {
    const t = createTranslator({
      locale: "pl",
      messages: loadMessages("pl", ["checkout"]),
      namespace: "checkout.basket",
    });
    expect(t("unavailableSummary", { count: 1 })).toBe(
      "Jeden bukiet w koszyku jest już niedostępny. Usuń go, aby kontynuować.",
    );
    expect(t("unavailableSummary", { count: 2 })).toBe(
      "2 bukiety w koszyku są już niedostępne. Usuń je, aby kontynuować.",
    );
    expect(t("unavailableSummary", { count: 5 })).toBe(
      "5 bukietów w koszyku jest już niedostępnych. Usuń je, aby kontynuować.",
    );
    expect(t("unavailableSummary", { count: 22 })).toBe(
      "22 bukiety w koszyku są już niedostępne. Usuń je, aby kontynuować.",
    );
  });
});
