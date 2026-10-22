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
import { describe, expect, it, vi } from "vitest";

import { ListingBreadcrumb, productView } from "../../src/modules/catalog";
import { loadMessages } from "../../src/modules/i18n";
import { CARD_MESSAGE_MAX } from "../../src/config/card-message.ts";
import {
  CARD_MESSAGE_MAX as CHECKOUT_CARD_MESSAGE_MAX,
  CHECKOUT_LIMITS,
} from "../../src/config/checkout.ts";
import { ProductPage } from "../../src/modules/ui/product/ProductPage.tsx";

import { importClosure } from "./support/import-closure.ts";

const repoRoot = resolve(import.meta.dirname, "../..");
const ISLAND = "src/modules/ui/product/CardMessageField.tsx";
const PREVIEW = "src/modules/ui/product/PrintedCardPreview.tsx";
const GRAPHEMES = "src/modules/ui/checkout/graphemes.ts";
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
    // React is the only package it imports: no `next-intl`, no zod, no barrel. Its one local
    // import is checkout's dependency-free grapheme count (spec 004 AC-51: one way to count).
    expect([...closure.packages]).toEqual(["react"]);
    expect([...closure.files].sort()).toEqual(
      [join(repoRoot, ISLAND), join(repoRoot, GRAPHEMES)].sort(),
    );
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
      // No `maxLength`: it counts UTF-16 units and would refuse a 200-grapheme message with an
      // emoji in it; the island counts graphemes (spec 004 AC-51).
      expect(textarea, locale).not.toMatch(/maxLength=/iu);
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

  it("draws the preview once, beside the field in the card section, with the sample sentence and the printed label as its caption (v3, TASK-197; spec 042 motion 15, TASK-308)", async () => {
    const html = await pageHtml("en");
    const en = loadMessages("en", ["product", "catalog"]) as {
      product: { card: { printed: string } };
      catalog: { addon: { card: { description: string } } };
    };
    // v3 draws the preview beside the field (`.pv-card`), at every width: one figure, not a
    // shown/hidden pair.
    const previews = [...html.matchAll(/data-fo-card-preview/gu)];
    expect(previews).toHaveLength(1);
    const figure =
      /<figure[^>]*data-fo-card-preview[^>]*>[\s\S]*?<\/figure>/u.exec(
        html,
      )?.[0];
    expect(figure).toBeDefined();
    // The sample is the figure's own first line, before the words line, and shown (not hidden
    // from assistive technology) while the field is empty.
    expect(figure).toContain(
      `<p class="font-hand m-0 text-[22px] leading-[1.25] font-[500] wrap-anywhere whitespace-pre-line col-start-1 row-start-1 text-ink-3" data-fo-card-sample="true">${en.catalog.addon.card.description}</p>`,
    );
    // The literal, not the catalogue's current value: A21 clause 5's label as the founder approved
    // it (`/break` round 1 hole 2 on PR 170).
    expect(en.product.card.printed).toBe("Printed on our card · included");
    // Spec 042's band: the label moves from under the field into the card's caption, once.
    expect(html.split(`>${en.product.card.printed}<`)).toHaveLength(2);
    expect(figure).toMatch(
      new RegExp(
        `<figcaption[^>]*>${en.product.card.printed}</figcaption></figure>$`,
        "u",
      ),
    );
    // Inside the card section, after the field in the source, and never hidden at a width; on
    // the phone it is drawn first (above the field, so the keyboard never hides it).
    const card = html.slice(html.indexOf("data-fo-pdp-card"));
    expect(card.indexOf("data-fo-card-preview")).toBeGreaterThan(
      card.indexOf("<textarea"),
    );
    expect(figure).toMatch(/^<figure class="[^"]* max-md:order-first"/u);
    expect(html).not.toMatch(
      /class="[^"]*(lg:)?hidden[^"]*"><figure[^>]*data-fo-card-preview/u,
    );
  });

  it("gives the island an empty words line keyed to the field, after the sample, in four locales (spec 042 AC-10)", async () => {
    for (const locale of LOCALES) {
      const html = await pageHtml(locale);
      const lines =
        /<div class="grid"( data-fo-card-swap="")?>([\s\S]*?)<\/div>/u.exec(
          html.slice(html.indexOf("data-fo-card-preview")),
        );
      expect(lines?.[1], locale).toBe(' data-fo-card-swap=""');
      // The sample, then the words: the island writes into the `<bdi>` of the line it finds by
      // `[data-fo-card-text]` and marks the line before it; `globals.css` swaps the two on that.
      expect(lines?.[2], locale).toMatch(
        /^<p class="[^"]*" data-fo-card-sample="true">[^<]+<\/p><p class="[^"]*" data-fo-card-text="true"><bdi data-fo-mirror="pdp-card-message" dir="auto"><\/bdi><\/p>$/u,
      );
      // No signature line on the product page.
      expect(html, locale).not.toContain("data-fo-card-signature");
    }
  });
});

describe("spec 004 AC-51 / T-56 (unit half): one 200-grapheme card limit, shared with checkout", () => {
  it("is one exported constant equal to 200, and checkout's card limit is that constant", () => {
    expect(CARD_MESSAGE_MAX).toBe(200);
    expect(CHECKOUT_LIMITS.cardMessage).toBe(CARD_MESSAGE_MAX);
    expect(CHECKOUT_CARD_MESSAGE_MAX).toBe(CARD_MESSAGE_MAX);
    // `checkout.ts` takes the number from the shared file rather than restating it.
    const checkout = readFileSync(
      join(repoRoot, "src/config/checkout.ts"),
      "utf8",
    );
    expect(checkout).toMatch(/cardMessage:\s*CARD_MESSAGE_MAX,/u);
  });

  it("the page's counter reads the shared limit, in every locale", async () => {
    for (const locale of LOCALES) {
      const html = await pageHtml(locale);
      const counter =
        /<p[^>]*id="pdp-card-message-count"[^>]*>([\s\S]*?)<\/p>/u.exec(
          html,
        )?.[1] ?? "";
      expect(counter.replace(/<!-- -->/gu, ""), locale).toBe(
        `0 / ${String(CARD_MESSAGE_MAX)}`,
      );
    }
  });

  it("no product-page source holds a card limit of its own: 400 appears nowhere, and the island imports no number", () => {
    const dir = join(repoRoot, "src/modules/ui/product");
    for (const name of readdirSync(dir)) {
      const code = readFileSync(join(dir, name), "utf8");
      expect(/\b400\b/u.exec(code)?.[0], name).toBe(undefined);
    }
    const page = readFileSync(join(dir, "ProductPage.tsx"), "utf8");
    expect(page).toMatch(
      /import \{ CARD_MESSAGE_MAX \} from "@\/config\/card-message";/u,
    );
    expect(page).not.toMatch(/const CARD_MESSAGE_MAX\b/u);
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

  it("sets the hand face on the card's lines of words only: the sample, the words, the signature (A-founder-2026-10-20c clause 1)", async () => {
    const source = readFileSync(join(repoRoot, PREVIEW), "utf8").replace(
      /\/\*[\s\S]*?\*\//gu,
      "",
    );
    // One class string carries the face, and only the three lines use it.
    expect([...source.matchAll(/\bfont-hand\b/gu)]).toHaveLength(1);
    const html = await pageHtml("en");
    const hand = [
      ...html.matchAll(/<(\w+)\b[^>]*class="[^"]*\bfont-hand\b[^"]*"[^>]*>/gu),
    ];
    expect(hand.map((tag) => /data-fo-card-(\w+)/u.exec(tag[0])?.[1])).toEqual([
      "sample",
      "text",
    ]);
    // Never a heading, a label, a button or a price on the page.
    for (const tag of hand) expect(tag[1]).toBe("p");
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

describe("spec 042 §12: the card preview's build switch", () => {
  const render = async (cardPreviewMotion: boolean): Promise<string> => {
    vi.resetModules();
    vi.doMock("../../src/config/interactions.ts", () => ({
      interactions: { cardPreviewMotion },
    }));
    const { PrintedCardPreview } =
      await import("../../src/modules/ui/product/PrintedCardPreview.tsx");
    vi.doUnmock("../../src/config/interactions.ts");
    return renderToStaticMarkup(
      <PrintedCardPreview
        caption="Printed on our card · included"
        messageFieldId="pdp-card-message"
        sample="Your message, printed on our card and tucked into the bouquet."
      />,
    );
  };

  it("marks the cell for the crossfade when on, and leaves the swap instant (no mark) when off", async () => {
    const on = await render(true);
    const off = await render(false);
    expect(on).toContain('<div class="grid" data-fo-card-swap="">');
    expect(off).toContain('<div class="grid">');
    expect(off).not.toContain("data-fo-card-swap");
    // Off changes nothing else: the same card, sample, words line and caption.
    expect(off).toBe(on.replace(' data-fo-card-swap=""', ""));
  });

  it("ships on", async () => {
    const { interactions } = await import("../../src/config/interactions.ts");
    expect(interactions.cardPreviewMotion).toBe(true);
  });
});
