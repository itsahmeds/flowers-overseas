/**
 * The printed-card preview and its field: the product page's one island (spec 004 §14 A21 clauses
 * 3 and 5; spec 009 AC-14 / T-14, the halves that need no browser; TASK-179).
 *
 *  - **No network, no storage, no inline script** — read from the island's source and its whole
 *    import graph, because the failure mode is a transitive import nobody notices.
 *  - **The card message never reaches a URL or a request** — the `<textarea>` has no `name`, so no
 *    form can submit it, and it is the page's only text field.
 *  - **Caveat on this page only** — `fonts/hand.ts` is imported by `PrintedCardPreview` and by
 *    nothing else under `src/`, so no other route's graph carries its `@font-face`.
 *  - **Printed, never handwritten** (T-17's messages half) — in every locale's catalogue.
 *
 * The browser halves (typing mirrors into the preview; the network log while typing) are
 * `tests/e2e/product-card-preview.spec.ts`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ListingBreadcrumb, productView } from "../../src/modules/catalog";
import { DeliveryFacts } from "../../src/modules/geo";
import { loadMessages } from "../../src/modules/i18n";
import { ProductPage } from "../../src/modules/ui";
import { CARD_MESSAGE_MAX } from "../../src/modules/ui/product/ProductPage.tsx";

import { importClosure } from "./support/import-closure.ts";

const repoRoot = resolve(import.meta.dirname, "../..");
const ISLAND = "src/modules/ui/product/CardMessageField.tsx";
const PREVIEW = "src/modules/ui/product/PrintedCardPreview.tsx";
const LOCALES = ["en", "en-gb", "de", "pl"] as const;
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

/** Wednesday 9 September 2026, inside the committed FX snapshot's window. */
const IN_WINDOW = new Date("2026-09-09T07:00:00Z");

async function pageHtml(locale: (typeof LOCALES)[number]): Promise<string> {
  const view = await productView(
    { locale, countryIso: "PL", sku: "FO-BQ-001" },
    { parameterised: false, productLinks: true, now: IN_WINDOW },
  );
  if (view === undefined) throw new Error("Amber Hour to Poland is a page");
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, [...NAMESPACES])}
      timeZone="UTC"
    >
      <ProductPage
        breadcrumb={<ListingBreadcrumb crumbs={view.breadcrumb} />}
        facts={
          <DeliveryFacts
            facts={view.facts}
            locale={view.locale}
            nameKey={view.country.nameKey}
            prices="omit"
          />
        }
        view={view}
      />
    </NextIntlClientProvider>,
  );
}

/** Every `.ts`/`.tsx` file under `src/`. */
function sources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sources(path));
    else if (/\.tsx?$/u.test(entry.name)) files.push(path);
  }
  return files;
}

/** Network, storage and code-loading APIs the island may not touch (spec 009 AC-14). */
const FORBIDDEN = [
  /\bfetch\s*\(/u,
  /\bXMLHttpRequest\b/u,
  /\bWebSocket\b/u,
  /\bEventSource\b/u,
  /\bsendBeacon\b/u,
  /\bimport\s*\(/u,
  /\blocalStorage\b/u,
  /\bsessionStorage\b/u,
  /\bdocument\.cookie\b/u,
  /\bhistory\.(push|replace)State\b/u,
  /\blocation\.(href|assign|replace|search|hash)\b/u,
  /dangerouslySetInnerHTML/u,
];

describe("spec 009 AC-14 / T-14: the island makes no network access and adds no inline script", () => {
  it("is a client component whose whole import graph touches no network, storage or loader", () => {
    const source = readFileSync(join(repoRoot, ISLAND), "utf8");
    expect(source.trimStart().startsWith('"use client";')).toBe(true);
    const closure = importClosure(join(repoRoot, ISLAND));
    // React is the only thing it imports: no `next-intl`, no zod, no barrel.
    expect([...closure.packages]).toEqual(["react"]);
    expect([...closure.files]).toEqual([join(repoRoot, ISLAND)]);
    for (const file of closure.files) {
      const code = readFileSync(file, "utf8")
        // Comments name the APIs the island refuses; only code counts.
        .replace(/\/\*[\s\S]*?\*\//gu, "")
        .replace(/(^|[^:])\/\/.*$/gmu, "$1");
      for (const pattern of FORBIDDEN) {
        expect(pattern.exec(code)?.[0], `${file}: ${String(pattern)}`).toBe(
          undefined,
        );
      }
    }
  });

  it("is the only client component the product page's own directory adds", () => {
    const dir = join(repoRoot, "src/modules/ui/product");
    const clients = readdirSync(dir).filter((name) =>
      readFileSync(join(dir, name), "utf8")
        .trimStart()
        .startsWith('"use client"'),
    );
    expect(clients).toEqual(["CardMessageField.tsx"]);
  });
});

describe("A21 clause 5: the card message has no name and goes nowhere", () => {
  it("renders exactly one text field, a `<textarea>` with no `name`, in four locales", async () => {
    for (const locale of LOCALES) {
      const html = await pageHtml(locale);
      const fields = [
        ...html.matchAll(/<(textarea|input(?![^>]*type="radio"))\b[^>]*>/gu),
      ];
      expect(
        fields.map((field) => field[1]),
        locale,
      ).toEqual(["textarea"]);
      const textarea = fields[0]?.[0] ?? "";
      expect(textarea, locale).not.toMatch(/\sname=/u);
      expect(textarea, locale).toContain(
        `maxLength="${String(CARD_MESSAGE_MAX)}"`,
      );
      // Visible text names it (WCAG 1.3.1): the step's legend, through `aria-labelledby`.
      const labelledBy =
        /\baria-labelledby="([^"]+)"/u.exec(textarea)?.[1] ?? "!";
      expect(html, locale).toMatch(
        new RegExp(`<legend[^>]*id="${labelledBy}"[^>]*>`, "u"),
      );
      // No inline script is rendered by the page component.
      expect(html, locale).not.toMatch(/<script\b/u);
    }
  });

  it("draws the preview with the sample sentence and the printed label, shown once per width", async () => {
    const html = await pageHtml("en");
    const en = loadMessages("en", ["product", "catalog"]) as {
      product: { card: { printed: string } };
      catalog: { addon: { card: { description: string } } };
    };
    const previews = [...html.matchAll(/data-fo-card-preview/gu)];
    expect(previews).toHaveLength(2);
    expect(
      html.split(`>${en.catalog.addon.card.description}<`).length,
    ).toBeGreaterThanOrEqual(3);
    expect(html.split(`>${en.product.card.printed}<`)).toHaveLength(3);
    // One wrapper hidden below `lg`, the other from `lg` up: never both on screen.
    expect(html).toMatch(
      /class="[^"]*\bhidden\b[^"]*\blg:block\b[^"]*"><figure[^>]*data-fo-card-preview/u,
    );
    expect(html).toMatch(
      /class="[^"]*\blg:hidden\b[^"]*"><figure[^>]*data-fo-card-preview/u,
    );
  });
});

describe("A21 clause 3: Caveat is reachable from the printed-card preview only", () => {
  it("imports `fonts/hand.ts` from `PrintedCardPreview` and from no other source file", () => {
    const importers = sources(join(repoRoot, "src"))
      .filter((file) =>
        /from\s+["'][^"']*fonts\/hand(\.ts)?["']/u.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => relative(repoRoot, file));
    expect(importers).toEqual([PREVIEW]);
  });

  it("sets the hand face on the message line only", () => {
    const source = readFileSync(join(repoRoot, PREVIEW), "utf8").replace(
      /\/\*[\s\S]*?\*\//gu,
      "",
    );
    expect([...source.matchAll(/\bfont-hand\b/gu)]).toHaveLength(1);
    expect(source).toMatch(/className="font-hand[^"]*"\s+data-fo-card-text/u);
  });
});

describe("A21 clause 5 / spec 004 T-17 (messages half): cards are printed, never handwritten", () => {
  it("has no “handwritten” or “hand-written” in any locale's messages", () => {
    for (const locale of LOCALES) {
      const raw = readFileSync(
        join(repoRoot, "messages", `${locale}.json`),
        "utf8",
      );
      expect(/hand-?written/iu.exec(raw)?.[0], locale).toBe(undefined);
    }
  });

  it("names the card add-on “Printed card” in `en`", () => {
    const en = loadMessages("en", ["catalog"]) as {
      catalog: { addon: { card: { name: string; description: string } } };
    };
    expect(en.catalog.addon.card.name).toBe("Printed card");
    expect(en.catalog.addon.card.description).toMatch(/printed/iu);
  });
});
