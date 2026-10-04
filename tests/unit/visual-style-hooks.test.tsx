/**
 * The hooks the visual stylesheets select still exist (`/break` round 1 hole 4 on PR 170; TASK-179).
 *
 * `tests/visual/*.css` take date- and FX-driven blocks out of the shots' layout by attribute
 * (`[data-fo-date-grid]`, `[data-fo-occasion-dates]`, …). A stylesheet whose selector matches
 * nothing fails silently: the block comes back, its height moves with the calendar, and the shots
 * start failing on dates alone, usually days after the change that renamed the attribute. So:
 *
 *  - every `data-fo-*` attribute a visual stylesheet names is written as a JSX attribute somewhere
 *    under `src/` (comments do not count);
 *  - `product-blocks.css`'s selectors each match an element of the rendered product page in the
 *    state the shot can show, and the date grid is the element that holds the date chips.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type ProductView, productView } from "../../src/modules/catalog";
import { withActivePartnersProvider } from "../../src/modules/geo/partners.ts";
import { loadMessages } from "../../src/modules/i18n";
import { ProductPage } from "../../src/modules/ui/product/ProductPage.tsx";

const repoRoot = resolve(__dirname, "../..");
const VISUAL = join(repoRoot, "tests/visual");

const withoutComments = (code: string): string =>
  code.replaceAll(/\/\*[\s\S]*?\*\//gu, "").replaceAll(/^\s*\/\/.*$/gmu, "");

/** The `data-fo-*` attributes a stylesheet's selectors name, comments removed. */
function hooksOf(css: string): string[] {
  return [
    ...new Set(
      [...withoutComments(css).matchAll(/\[(data-fo-[a-z0-9-]+)/gu)].map(
        (match) => match[1] ?? "",
      ),
    ),
  ].sort();
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx$/u.test(entry.name) ? [path] : [];
  });
}

const STYLESHEETS = readdirSync(VISUAL).filter((name) => name.endsWith(".css"));

const SOURCE = sourceFiles(join(repoRoot, "src"))
  .map((path) => withoutComments(readFileSync(path, "utf8")))
  .join("\n");

describe("every visual stylesheet selects a hook the source still writes", () => {
  it("finds the stylesheets and their hooks (the walk's own check)", () => {
    expect(STYLESHEETS).toContain("product-blocks.css");
    expect(
      hooksOf(readFileSync(join(VISUAL, "product-blocks.css"), "utf8")),
    ).toEqual([
      "data-fo-date-grid",
      "data-fo-fx-notice",
      "data-fo-occasion-dates",
      "data-fo-price-equivalents",
      "data-fo-summary-total",
    ]);
  });

  it.each(STYLESHEETS)("%s", (name) => {
    const hooks = hooksOf(readFileSync(join(VISUAL, name), "utf8"));
    expect(hooks.length, name).toBeGreaterThan(0);
    for (const hook of hooks) {
      // As a JSX attribute (the name, then `=`, whitespace, `/` or `>`), or as a quoted prop key
      // spread onto an element (`{ "data-fo-shop-occasions": true }`).
      expect(
        new RegExp(`(?:\\s|")${hook}(?=[\\s=/>"])`, "u").test(SOURCE),
        `${name}: ${hook}`,
      ).toBe(true);
    }
  });
});

const NAMESPACES = [
  "product",
  "delivery",
  "catalog",
  "corridor",
  "breadcrumb",
  "shop",
  "media",
  "a11y",
  "destinations",
  "occasions",
  "common",
] as const;

async function viewAt(now: Date, live = false): Promise<ProductView> {
  const build = async () =>
    productView(
      { locale: "en", countryIso: "PL", sku: "FO-BQ-001" },
      { parameterised: false, now },
    );
  const view = live
    ? await withActivePartnersProvider(
        { hasActivePartners: (iso2: string) => iso2 === "PL" },
        build,
      )
    : await build();
  if (view === undefined) throw new Error("en/PL/FO-BQ-001 is a page");
  return view;
}

function render(view: ProductView): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale="en"
      messages={loadMessages("en", [...NAMESPACES])}
      timeZone="UTC"
    >
      <ProductPage breadcrumb={null} facts={null} view={view} />
    </NextIntlClientProvider>,
  );
}

describe("`product-blocks.css` matches the product page it is applied to", () => {
  it("the date grid is the element that holds the date chips", async () => {
    const html = render(await viewAt(new Date("2027-03-01T08:00:00Z"), true));
    const grid =
      /<div[^>]*\bdata-fo-date-grid\b[^>]*>([\s\S]*?)<\/fieldset>/u.exec(html);
    expect(grid?.[1]).toMatch(/data-fo-date="2027-03-01"/u);
    expect([...html.matchAll(/\bdata-fo-date-grid\b/gu)]).toHaveLength(1);
  });

  it("the summary total, the equivalents line and the stale-rate sentence each appear in a state the shot can show", async () => {
    // Inside the committed snapshot's window: the line is printed, the sentence is not.
    const fresh = render(await viewAt(new Date("2026-09-09T12:00:00Z")));
    expect(fresh).toMatch(/\bdata-fo-summary-total\b/u);
    expect(fresh).toMatch(/\bdata-fo-price-equivalents\b/u);
    expect(fresh).not.toMatch(/\bdata-fo-fx-notice\b/u);
    // Past it: the sentence is printed, the line is not.
    const stale = render(await viewAt(new Date("2026-09-11T00:00:01Z")));
    expect(stale).toMatch(/\bdata-fo-fx-notice\b/u);
    expect(stale).not.toMatch(/\bdata-fo-price-equivalents\b/u);
  });
});
