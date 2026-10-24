/**
 * T-19 (markup half), AC-19, AC-6 for idea 6: the route line as the corridor page renders it
 * (spec 042 §5.3.6; TASK-311).
 *
 * `tests/unit/corridor-page.test.tsx`'s pattern: `react-dom/server` over the real messages. What
 * this file pins before a browser is involved:
 *
 *  - exactly one route SVG on the page, `aria-hidden`, not focusable, outside the `<h1>`, with only
 *    the two paths and two circles of the artboard (no `<text>`, `<image>` or `<a>`), at most
 *    1,024 B, mirrored in RTL;
 *  - the same bytes on every country's page and in both states: the component takes no input, so
 *    nothing about the visitor or the destination can reach it (ADR-0006, L13);
 *  - with the switch off the page is the one it was before the diff, and with it on the visible
 *    text and the link set are unchanged (AC-6, L9);
 *  - `src/config/interactions.ts` is the one build-time switch, and nothing on the route line's path
 *    reads a request header.
 *
 * The geometry (inside the first screen, never meeting the H1's box, hidden below `md`) and the
 * draw are a browser's to prove: `tests/e2e/corridor-route-line.spec.ts`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { interactions } from "../../src/config/interactions.ts";
import { type CorridorView, corridorView } from "../../src/modules/geo";
import { CorridorPage } from "../../src/modules/geo/ui/CorridorPage.tsx";
import { CorridorRouteLine } from "../../src/modules/geo/ui/CorridorRouteLine.tsx";
import { loadMessages } from "../../src/modules/i18n";

const repoRoot = resolve(__dirname, "../..");
const FROM = "2026-09-15";

const NAMESPACES = [
  "corridor",
  "breadcrumb",
  "destinations",
  "catalog",
  "common",
  "a11y",
  "media",
] as const;

function render(node: ReactElement, locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, [...NAMESPACES])}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

function view(iso2: string, locale: string): CorridorView {
  const found = corridorView(iso2, locale, { from: FROM });
  if (found === undefined) throw new Error(`${locale}/${iso2} must exist`);
  return found;
}

const SVG = /<svg[^>]*data-fo-route-line[^>]*>[\s\S]*?<\/svg>/g;

/** Every route SVG in a document. */
function routes(html: string): string[] {
  return html.match(SVG) ?? [];
}

/** The document with every route SVG cut out. */
function withoutRoutes(html: string): string {
  return html.replaceAll(SVG, "");
}

function visibleText(html: string): string {
  return html
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)]
    .map((match) => match[1] ?? "")
    .sort();
}

/** The route line's own violations of AC-19's element clauses; empty when it holds. */
function elementViolations(svg: string): string[] {
  const found: string[] = [];
  const open = /^<svg[^>]*>/.exec(svg)?.[0] ?? "";
  if (!/\baria-hidden="true"/.test(open)) found.push("aria-hidden");
  if (!/\bfocusable="false"/.test(open)) found.push("focusable");
  if (!/\bclass="[^"]*\bmirror-in-rtl\b/.test(open))
    found.push("mirror-in-rtl");
  if (Buffer.byteLength(svg, "utf8") > 1024) found.push("bytes");
  if (/<(text|image|a|foreignObject|use)\b/i.test(svg)) found.push("children");
  const children = [
    ...svg.matchAll(/<(path|circle)\b[^>]*data-fo-route="([a-z]+)"/g),
  ].map((match) => `${match[1] ?? ""}:${match[2] ?? ""}`);
  if (children.join(" ") !== "path:dash path:mask circle:you circle:to") {
    found.push(`shape ${children.join(" ")}`);
  }
  // The artboard's paint, as presentation attributes: the 2 px dash of 6 and 7, and the cover's
  // one dash of 1 over `pathLength` 1, so `stroke-dashoffset` 0 hides the whole arc and -1 none.
  const tag = (name: string): string =>
    new RegExp(`<[a-z]+\\b[^>]*data-fo-route="${name}"[^>]*>`).exec(svg)?.[0] ??
    "";
  if (
    !/stroke-dasharray="6 7"/.test(tag("dash")) ||
    !/stroke-width="2"/.test(tag("dash"))
  ) {
    found.push("dash paint");
  }
  if (
    !/pathLength="1"/.test(tag("mask")) ||
    !/stroke-dasharray="1 1"/.test(tag("mask")) ||
    !/stroke-width="7"/.test(tag("mask"))
  ) {
    found.push("mask paint");
  }
  // Inside the tags, nothing but whitespace: a text node would be read with CSS off.
  if (visibleText(svg) !== "") found.push("text");
  return found;
}

describe("idea 6: the route line on the corridor page (AC-19)", () => {
  const html = render(<CorridorPage view={view("PL", "en-gb")} />, "en-gb");
  const found = routes(html);

  it("draws exactly one route SVG", () => {
    expect(found).toHaveLength(1);
  });

  it("is decorative, the artboard's two paths and two dots, and at most 1,024 B", () => {
    const [svg = ""] = found;
    expect(elementViolations(svg)).toEqual([]);
    expect(Buffer.byteLength(svg, "utf8")).toBeLessThanOrEqual(1024);
    expect(svg).toContain('viewBox="0 0 180 120"');
  });

  it("sits beside the <h1>, never inside it, in the hero grid", () => {
    const h1 = /<h1[\s\S]*?<\/h1>/.exec(html)?.[0] ?? "";
    expect(h1).not.toBe("");
    expect(h1).not.toContain("data-fo-route-line");
    // The first-screen grid is its containing block: positioned, and the route its last child,
    // after the H1, the dates and the intro.
    const hero =
      /<div[^>]*data-fo-corridor-first-screen[^>]*>/.exec(html)?.[0] ?? "";
    expect(hero).toMatch(/\bclass="relative /);
    expect(html.indexOf("data-fo-route-line")).toBeGreaterThan(
      html.indexOf("data-fo-corridor-first-dates"),
    );
    const at = html.indexOf("data-fo-route-line");
    expect(
      html.slice(html.indexOf("</svg>", at), html.indexOf("</svg>", at) + 12),
    ).toBe("</svg></div>");
    expect(html.indexOf("data-fo-route-line")).toBeLessThan(
      html.indexOf("data-fo-corridor-facts"),
    );
  });

  it("goes red on each mutation T-19 names for the element", () => {
    const [svg = ""] = found;
    expect(
      elementViolations(svg.replace("</svg>", "<text>you</text></svg>")),
    ).toEqual(expect.arrayContaining(["children", "text"]));
    expect(elementViolations(svg.replace(' aria-hidden="true"', ""))).toEqual([
      "aria-hidden",
    ]);
    expect(elementViolations(svg.replace("mirror-in-rtl", ""))).toEqual([
      "mirror-in-rtl",
    ]);
    expect(elementViolations(svg.replace('pathLength="1"', ""))).toEqual([
      "mask paint",
    ]);
    expect(
      elementViolations(
        svg.replace("</svg>", `<path d="M0 0${" L1 1".repeat(200)}"/></svg>`),
      ),
    ).toContain("bytes");
  });
});

describe("the same bytes for every visitor and every destination (AC-19, ADR-0006)", () => {
  it("renders one identical SVG on all fourteen guide pages", () => {
    const shapes = new Set<string>();
    let pages = 0;
    for (const locale of ["en", "en-gb"]) {
      for (const iso2 of ["PL", "DE", "FR", "ES", "IT", "RO", "NL"]) {
        const page = routes(
          render(<CorridorPage view={view(iso2, locale)} />, locale),
        );
        expect(page, `${locale}/${iso2}`).toHaveLength(1);
        shapes.add(page[0] ?? "");
        pages += 1;
      }
    }
    expect(pages).toBe(14);
    expect([...shapes]).toEqual([renderToStaticMarkup(<CorridorRouteLine />)]);
  });

  it("takes no props, so no country, locale or header can reach it", () => {
    expect(CorridorRouteLine.length).toBe(0);
    const source = readFileSync(
      resolve(repoRoot, "src/modules/geo/ui/CorridorRouteLine.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(
      /next\/headers|cookies\(|headers\(|useLocale|useTranslations/,
    );
  });

  it("is the same SVG in the live state", () => {
    const guide = view("PL", "en");
    const live: CorridorView = { ...guide, state: "live" };
    expect(routes(render(<CorridorPage view={live} />, "en"))).toEqual(
      routes(render(<CorridorPage view={guide} />, "en")),
    );
  });
});

describe("text and links unchanged (AC-6 for the corridor page)", () => {
  const html = render(<CorridorPage view={view("PL", "en-gb")} />, "en-gb");

  it("adds no visible text and no link", () => {
    expect(visibleText(html)).toBe(visibleText(withoutRoutes(html)));
    expect(hrefs(html)).toEqual(hrefs(withoutRoutes(html)));
    expect(hrefs(html).length).toBeGreaterThan(5);
  });
});

describe("the build-time switch (spec 042 §12)", () => {
  it("is on, and is a plain boolean in `src/config/interactions.ts`", () => {
    expect(interactions.routeLine).toBe(true);
  });

  it("draws nothing when it is off, and the hero is otherwise the same markup", async () => {
    const on = render(<CorridorPage view={view("PL", "en-gb")} />, "en-gb");
    vi.resetModules();
    vi.doMock("../../src/config/interactions.ts", () => ({
      interactions: { routeLine: false },
    }));
    const { CorridorPage: Off } =
      await import("../../src/modules/geo/ui/CorridorPage.tsx");
    const off = render(<Off view={view("PL", "en-gb")} />, "en-gb");
    vi.doUnmock("../../src/config/interactions.ts");
    expect(routes(off)).toEqual([]);
    expect(off).toBe(withoutRoutes(on));
  });
});
