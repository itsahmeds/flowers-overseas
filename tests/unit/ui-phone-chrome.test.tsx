/**
 * The phone chrome and the phone primitives, repository half (spec 004 §14 A24 clauses 3 and 4;
 * AC-47, AC-48, AC-49, AC-50; T-52 to T-55; TASK-195).
 *
 * What a server render can prove, so that the e2e suites (`tests/e2e/phone-chrome.spec.ts`,
 * `tests/e2e/action-bar.spec.ts`) only measure what needs a browser:
 *
 *  - **the Menu** is a native `<details>`/`<summary>` (it opens with JavaScript off), `md:hidden`,
 *    and holds exactly the header's published links, Send flowers, spec 003's `LocaleSwitcher`
 *    markup, the currency chip's text and label, and the help line, every target 44 px or more;
 *  - **below `md` the header draws two controls**: the strip, the chip row and the pill are
 *    `max-md:hidden`, so only the logo and the summary remain (T-52 red with the strip shown);
 *  - **the back link** names and links the trail's last ancestor, the trail stays in the HTML
 *    and exactly one of the two carries the breakpoint's `hidden` (T-55's contract half);
 *  - **the bar's rules** live in `globals.css`: card white, the safe area in its block size and
 *    padding, the document's foot padded while a bar is on the page, the fixed consent sheet
 *    standing on it (T-53's stylesheet half);
 *  - **the segmented control** is a fieldset with a legend and native radios (or links with
 *    `aria-current`), and **the scroller** scrolls and is focusable when its items are not.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { COMPANY } from "../../src/config/company.ts";
import { listingAlternatePaths } from "../../src/modules/catalog";
import { loadMessages, localePath } from "../../src/modules/i18n";
import {
  type HeaderListingHrefs,
  headerCategoryItems,
  headerListingTargets,
  headerSendHref,
} from "../../src/modules/ui/layout/header-model.ts";
import { SiteHeader } from "../../src/modules/ui/layout/SiteHeader.tsx";
import {
  Breadcrumbs,
  type Crumb,
  breadcrumbAncestor,
} from "../../src/modules/ui/primitives/Breadcrumbs.tsx";
import {
  GalleryDots,
  HorizontalScroller,
} from "../../src/modules/ui/primitives/HorizontalScroller.tsx";
import { SegmentedControl } from "../../src/modules/ui/primitives/SegmentedControl.tsx";
import { StickyActionBar } from "../../src/modules/ui/primitives/StickyActionBar.tsx";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

async function listingHrefsFor(
  locale: (typeof LOCALES)[number],
): Promise<HeaderListingHrefs> {
  const entries = await Promise.all(
    headerListingTargets().map(
      async ({ id, identity }) =>
        [
          id,
          (await listingAlternatePaths({ ...identity, locale }))[locale],
        ] as const,
    ),
  );
  return Object.fromEntries(entries.filter(([, path]) => path !== undefined));
}

const HREFS: Record<string, HeaderListingHrefs> = Object.fromEntries(
  await Promise.all(
    LOCALES.map(
      async (locale) => [locale, await listingHrefsFor(locale)] as const,
    ),
  ),
);

function renderHeader(locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, ["nav", "company", "a11y", "common"])}
      timeZone="UTC"
    >
      <SiteHeader locale={locale} listingHrefs={HREFS[locale] ?? {}} />
    </NextIntlClientProvider>,
  );
}

/** The `<details data-fo-menu>` element, whole. */
function menuOf(html: string): string {
  const match = /<details[^>]*\sdata-fo-menu=""[\s\S]*?<\/details>/u.exec(html);
  if (match === null) throw new Error("no Menu in the header");
  return match[0];
}

/** The opening tag that contains `marker`. */
function tagWith(html: string, marker: string): string {
  const at = html.indexOf(marker);
  if (at < 0) throw new Error(`no ${marker}`);
  const start = html.lastIndexOf("<", at);
  return html.slice(start, html.indexOf(">", at) + 1);
}

function classOf(tag: string): string {
  return /class="([^"]*)"/u.exec(tag)?.[1] ?? "";
}

function hrefsOf(html: string): string[] {
  return [...html.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map(
    (match) => match[1] ?? "",
  );
}

describe("the phone header (AC-47, T-52's contract half)", () => {
  it("is a native disclosure: `<details>` and `<summary>`, from `md` up not drawn", () => {
    const html = renderHeader("en");
    // The attribute itself, not a prefix of `data-fo-menu-summary` (React drops `true`).
    const details = tagWith(html, 'data-fo-menu=""');
    expect(details.startsWith("<details")).toBe(true);
    expect(classOf(details).split(" ")).toContain("md:hidden");
    // Closed on the server: it opens on activation, with or without JavaScript.
    expect(details).not.toMatch(/\sopen\b/u);
    const summary = tagWith(html, "data-fo-menu-summary");
    expect(summary.startsWith("<summary")).toBe(true);
    expect(classOf(summary)).toContain("min-h-(--target-min)");
    expect(menuOf(html)).toMatch(/<summary[^>]*>[\s\S]*Menu<\/summary>/u);
  });

  it("leaves the logo and the summary as the only controls below `md`: the strip, the row and the pill are `max-md:hidden`", () => {
    for (const locale of LOCALES) {
      const html = renderHeader(locale);
      for (const marker of [
        "data-fo-utility",
        'data-fo-header-band="categories"',
        `href="${headerSendHref(locale)}"`,
      ]) {
        expect(
          classOf(tagWith(html, marker)).split(" "),
          `${locale} ${marker}`,
        ).toContain("max-md:hidden");
      }
      // The logo is not hidden at any width.
      expect(classOf(tagWith(html, "data-fo-header-logo"))).not.toMatch(
        /\bhidden\b/u,
      );
    }
  });

  it("holds the header's published links, in the row's order, each 52 px", () => {
    for (const locale of LOCALES) {
      const menu = menuOf(renderHeader(locale));
      const items = [
        ...menu.matchAll(/<a\s[^>]*data-fo-menu-item="([^"]*)"[^>]*>/g),
      ];
      expect(
        items.map((match) => match[1]),
        locale,
      ).toEqual(
        headerCategoryItems(locale, HREFS[locale] ?? {}).map(({ id }) => id),
      );
      for (const match of items) {
        expect(match[0], `${locale} ${match[1] ?? ""}`).toContain(
          "min-h-[52px]",
        );
      }
    }
  });

  it("holds Send flowers, the four-language switcher as spec 003 renders it, the currency chip and the help line", () => {
    for (const locale of LOCALES) {
      const menu = menuOf(renderHeader(locale));
      const hrefs = hrefsOf(menu);
      expect(hrefs, locale).toContain(headerSendHref(locale));
      expect(hrefs, locale).toContain(`tel:${COMPANY.contact.phoneE164}`);
      for (const other of LOCALES.filter((code) => code !== locale)) {
        expect(hrefs, `${locale} → ${other}`).toContain(
          localePath(other, "home"),
        );
      }
      // Spec 003 AC-3: the switcher's own markup, mounted, not restyled at the source.
      const switcher = menu.slice(menu.indexOf("data-fo-menu-switcher"));
      expect(switcher).toMatch(/<nav aria-label="[^"]+"><ul><li>/u);
      expect([...switcher.matchAll(/<li>/g)].length).toBeGreaterThanOrEqual(4);
      expect(switcher).toContain('aria-current="page"');
      // AC-8: the same text and label as the strip's chip.
      const strip = tagWith(renderHeader(locale), "data-fo-header-currency");
      const chip = tagWith(menu, "data-fo-menu-currency");
      expect(/aria-label="([^"]*)"/u.exec(chip)?.[1]).toBe(
        /aria-label="([^"]*)"/u.exec(strip)?.[1],
      );
    }
  });

  it("gives every target in the panel at least 44 px", () => {
    const menu = menuOf(renderHeader("en"));
    const anchors = [...menu.matchAll(/<a\s[^>]*>/g)].map((match) => match[0]);
    // Eight links, Send, three sibling locales, the help line.
    expect(anchors).toHaveLength(8 + 1 + 3 + 1);
    for (const anchor of anchors) {
      const own = classOf(anchor);
      const fromWrapper = /data-fo-menu-switcher/u.test(
        menu.slice(0, menu.indexOf(anchor)),
      );
      expect(
        /min-h-\[52px\]|min-h-\(--target-min\)|min-h-\(--control-send\)/u.test(
          own,
        ) || fromWrapper,
        anchor,
      ).toBe(true);
    }
    expect(menu).toContain("[&amp;_a]:min-h-(--target-min)");
  });

  it("is a panel that scrolls inside itself under the 65 px header", () => {
    const panel = classOf(tagWith(renderHeader("en"), "data-fo-menu-panel"));
    expect(panel).toContain("max-h-[calc(100dvh-65px)]");
    expect(panel).toContain("overflow-y-auto");
    expect(panel).toContain("top-full");
  });
});

const TRAIL: readonly Crumb[] = [
  { key: "home", label: "Home", href: "/en" },
  { key: "destinations", label: "Destinations", href: "/en/send-flowers-to" },
  { key: "poland", label: "Poland", href: "/en/send-flowers-to/poland" },
  { key: "flowers", label: "Flowers", current: true },
];

function renderTrail(
  crumbs: readonly Crumb[],
  phone?: "back" | "trail",
): string {
  return renderToStaticMarkup(
    <Breadcrumbs
      crumbs={crumbs}
      label="Breadcrumb"
      {...(phone === undefined ? {} : { phone })}
    />,
  );
}

describe("the back link and the trail (AC-50, AC-32's phone half, T-55's contract half)", () => {
  it("names and links the trail's last ancestor", () => {
    expect(breadcrumbAncestor(TRAIL)?.key).toBe("poland");
    const html = renderTrail(TRAIL);
    const back = tagWith(html, "data-fo-back-link");
    expect(back).toContain('href="/en/send-flowers-to/poland"');
    expect(html).toMatch(/data-fo-back-link[^>]*>[\s\S]*?Poland<\/a>/u);
  });

  it("keeps every crumb of the trail in the HTML, hides it below `md` and the back link from `md` up", () => {
    const html = renderTrail(TRAIL);
    const trail = html.slice(
      html.indexOf("data-fo-breadcrumb-trail"),
      html.indexOf("</ol>"),
    );
    for (const crumb of TRAIL) expect(trail).toContain(String(crumb.label));
    expect(
      classOf(tagWith(html, "data-fo-breadcrumb-trail")).split(" "),
    ).toContain("max-md:hidden");
    const back = classOf(tagWith(html, "data-fo-back-link")).split(" ");
    expect(back).toContain("md:hidden");
    expect(back).toContain("min-h-(--target-min)");
  });

  it("sits 14 px under the header below `md` and 20 px from `md` up", () => {
    const nav = classOf(tagWith(renderTrail(TRAIL), "data-fo-breadcrumb"));
    expect(nav.split(" ")).toEqual(
      expect.arrayContaining(["mt-[14px]", "md:mt-(--space-md2)"]),
    );
  });

  it("draws the chevron as the mirrored icon turned to the start, never a character", () => {
    const html = renderTrail(TRAIL);
    const link = html.slice(html.indexOf("data-fo-back-link"));
    const svg = tagWith(link, "<svg");
    expect(classOf(svg)).toContain("mirror-in-rtl");
    expect(classOf(svg)).toContain("-scale-x-100");
    expect(link).not.toMatch(/[‹<]\s*Poland/u);
  });

  it('draws no back link on the product page (`phone="trail"`), and keeps its trail displayed', () => {
    const html = renderTrail(TRAIL, "trail");
    expect(html).not.toContain("data-fo-back-link");
    expect(classOf(tagWith(html, "data-fo-breadcrumb-trail"))).not.toContain(
      "hidden",
    );
  });

  it("draws no back link when the last ancestor has no page, and keeps the trail displayed", () => {
    const html = renderTrail([
      { key: "home", label: "Home", href: "/en" },
      { key: "poland", label: "Poland" },
      { key: "flowers", label: "Flowers", current: true },
    ]);
    expect(html).not.toContain("data-fo-back-link");
    expect(classOf(tagWith(html, "data-fo-breadcrumb-trail"))).not.toContain(
      "hidden",
    );
  });
});

const CSS = readFileSync(
  resolve(import.meta.dirname, "../../src/app/globals.css"),
  "utf8",
);

/** The body of the first block that opens with `selector {`. */
function block(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  let depth = 0;
  for (let index = CSS.indexOf("{", start); index < CSS.length; index += 1) {
    if (CSS[index] === "{") depth += 1;
    if (CSS[index] === "}") depth -= 1;
    if (depth === 0) return CSS.slice(start, index + 1);
  }
  throw new Error(`unclosed ${selector}`);
}

describe("the sticky action bar (AC-48, T-53's stylesheet half)", () => {
  it("is opaque card white, fixed to the foot, with the safe area in its block size and its block-end padding", () => {
    const bar = block("@utility action-bar");
    expect(bar).toContain("position: fixed;");
    expect(bar).toContain("inset-block-end: 0;");
    expect(bar).toContain("background-color: var(--color-card);");
    expect(bar).toMatch(
      /block-size: calc\(76px \+ env\(safe-area-inset-bottom\)\);/u,
    );
    expect(bar).toMatch(
      /padding-block: 10px calc\(14px \+ env\(safe-area-inset-bottom\)\);/u,
    );
    // Hidden by a transform, so showing or hiding it moves no layout.
    expect(bar).toMatch(
      /\[data-fo-action-bar="hidden"\][^}]*translate: 0 100%/u,
    );
  });

  it("pads the document's foot by the bar plus the safe area, and stands the fixed consent sheet on it, below `md`", () => {
    const phone = block("@media (width < 48rem)");
    expect(phone).toMatch(
      /body:has\(\[data-fo-action-bar\]\) \{\s*padding-block-end: calc\(76px \+ env\(safe-area-inset-bottom\)\);/u,
    );
    expect(phone).toMatch(
      /body:has\(\[data-fo-action-bar\]\) \[data-fo-consent-sheet="fixed"\] \{\s*inset-block-end: calc\(76px \+ env\(safe-area-inset-bottom\)\);/u,
    );
  });

  it("renders the action and the caller's price, phone only, and formats nothing", () => {
    const html = renderToStaticMarkup(
      <StickyActionBar price={{ amount: "€55.90", caption: "Medium" }}>
        <a href="#buy">Continue</a>
      </StickyActionBar>,
    );
    const root = classOf(tagWith(html, "data-fo-action-bar"));
    expect(root.split(" ")).toEqual(
      expect.arrayContaining(["action-bar", "md:hidden"]),
    );
    expect(html).toContain('data-fo-action-bar="shown"');
    expect(html).toMatch(/data-fo-action-bar-price[\s\S]*€55\.90/u);
    expect(html).toContain('href="#buy"');
    const source = readFileSync(
      resolve(
        import.meta.dirname,
        "../../src/modules/ui/primitives/StickyActionBar.tsx",
      ),
      "utf8",
    );
    expect(source).not.toMatch(/formatMoney\(|Intl\./u);
  });

  it("marks the hidden state for the stylesheet", () => {
    const html = renderToStaticMarkup(
      <StickyActionBar hidden>
        <a href="#buy">Continue</a>
      </StickyActionBar>,
    );
    expect(html).toContain('data-fo-action-bar="hidden"');
  });
});

const OPTIONS = [
  { value: "s", label: "Small", detail: "9 stems" },
  { value: "m", label: "Medium", detail: "15 stems" },
  { value: "l", label: "Large", detail: "25 stems" },
] as const;

describe("the segmented control (AC-49, T-54's contract half)", () => {
  it("is a fieldset with a legend and one native radio per option, the selection `checked`", () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        legend="Size"
        name="tier"
        options={OPTIONS}
        selected="m"
      />,
    );
    expect(html).toMatch(/^<fieldset[^>]*><legend[^>]*>Size<\/legend>/u);
    const radios = [...html.matchAll(/<input[^>]*>/g)].map((match) => match[0]);
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio).toContain('type="radio"');
      expect(radio).toContain('name="tier"');
    }
    expect(radios.filter((radio) => /\schecked=""/u.test(radio))).toEqual([
      expect.stringContaining('value="m"'),
    ]);
    for (const label of [...html.matchAll(/<label[^>]*>/g)]) {
      expect(label[0]).toContain("min-h-[52px]");
    }
  });

  it("in its link form marks only the selected option `aria-current`", () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        legend="Size"
        options={OPTIONS.map((option) => ({
          ...option,
          href: `?tier=${option.value}`,
        }))}
        selected="l"
      />,
    );
    expect(html).not.toContain("<input");
    const links = [...html.matchAll(/<a[^>]*>/g)].map((match) => match[0]);
    expect(links).toHaveLength(3);
    expect(links.filter((link) => link.includes("aria-current"))).toEqual([
      expect.stringContaining('href="?tier=l"'),
    ]);
    for (const link of links) expect(link).toContain("min-h-[52px]");
  });
});

describe("the horizontal scroller and the gallery dots (AC-49, T-54's contract half)", () => {
  const items = ["a", "b", "c"].map((key) => ({ key, node: key }));

  it("scrolls sideways, is named, and calls itself no carousel", () => {
    const html = renderToStaticMarkup(
      <HorizontalScroller itemsFocusable items={items} label="Dates" />,
    );
    const root = tagWith(html, "data-fo-scroller");
    expect(classOf(root).split(" ")).toContain("overflow-x-auto");
    expect(classOf(root)).not.toMatch(/overflow-(?:x-)?hidden/u);
    expect(root).toContain('aria-label="Dates"');
    expect(html).not.toContain("aria-roledescription");
    // Items that can take focus: the row itself does not.
    expect(root).not.toContain("tabindex");
  });

  it("takes focus itself when no item can", () => {
    const html = renderToStaticMarkup(
      <HorizontalScroller itemsFocusable={false} items={items} label="Dates" />,
    );
    expect(tagWith(html, "data-fo-scroller")).toContain('tabindex="0"');
  });

  it("draws dots only as in-page links with 24 × 24 targets, and none for one image", () => {
    const links = [
      { href: "#p1", label: "Photo 1" },
      { href: "#p2", label: "Photo 2" },
    ] as const;
    const html = renderToStaticMarkup(
      <GalleryDots current={1} label="Photos" links={links} />,
    );
    const anchors = [...html.matchAll(/<a[^>]*>/g)].map((match) => match[0]);
    expect(anchors).toHaveLength(2);
    for (const anchor of anchors) {
      expect(anchor).toMatch(/href="#p\d"/u);
      expect(classOf(anchor).split(" ")).toEqual(
        expect.arrayContaining(["h-[24px]", "w-[24px]"]),
      );
    }
    expect(anchors.filter((anchor) => anchor.includes("aria-current"))).toEqual(
      [expect.stringContaining('href="#p2"')],
    );
    expect(
      renderToStaticMarkup(
        <GalleryDots current={0} label="Photos" links={links.slice(0, 1)} />,
      ),
    ).toBe("");
  });
});
