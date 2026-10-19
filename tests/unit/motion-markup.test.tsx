/**
 * T-48 (unit half) / AC-44 (TASK-194): the server markup the motion module reads. The module's
 * own decisions (which click waits, what starts below the fold) are browser behaviour and are
 * asserted in `tests/e2e/motion.spec.ts`.
 *
 *  - motion 3's `pending` button ships with no busy state and its bloom transparent, so the
 *    server's HTML shows no loader; the bloom sits outside the label's box, so the width holds;
 *  - motion 12 on the listing pages: every listing subsection (under the grid) is a section the
 *    module may fade up, and the page's own data hook still lands beside it.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import en from "../../messages/en.json";
import { listProductPages } from "../../src/modules/catalog";
import { ListingSubsection } from "../../src/modules/catalog/ui/ListingChrome.tsx";
import { type MessageNamespace, loadMessages } from "../../src/modules/i18n";
import { Button } from "../../src/modules/ui";
import { TrendingRow } from "../../src/modules/ui/home/TrendingRow.tsx";
import { ProductCard } from "../../src/modules/ui/shop/ProductCard.tsx";
import type { ProductCardView } from "../../src/modules/ui/shop/viewModel.ts";

const NAMESPACES = Object.keys(en) as MessageNamespace[];

describe("motion 3: the pending button's server markup", () => {
  const html = renderToStaticMarkup(
    <Button type="submit" variant="accent" pending>
      Continue
    </Button>,
  );

  it("marks the button for the module and ships it idle", () => {
    expect(html).toContain("data-fo-pending");
    expect(html).not.toContain("aria-busy");
    expect(html).not.toMatch(/\sdisabled(=|\s|>)/);
  });

  it("puts the 22 px bloom outside the label's box, transparent and decorative", () => {
    const bloom =
      /<span aria-hidden="true" class="([^"]+)" data-fo-pending-bloom/.exec(
        html,
      );
    expect(bloom?.[1]).toContain("absolute");
    expect(bloom?.[1]).toContain("start-full");
    expect(bloom?.[1]).toContain("size-[22px]");
    expect(bloom?.[1]).toContain("opacity-0");
    expect(html).toContain('data-fo-bloom="stem"');
    expect(html.match(/data-fo-bloom="petal"/g)).toHaveLength(5);
  });

  it("renders no bloom slot without `pending`, or on a link", () => {
    expect(renderToStaticMarkup(<Button>Go</Button>)).not.toContain(
      "data-fo-pending",
    );
    expect(
      renderToStaticMarkup(
        <Button href="/en" pending>
          Go
        </Button>,
      ),
    ).not.toContain("data-fo-pending");
  });
});

/** Motion 6's pill skin on a rendered `Button`, or the reason it is not the 19e one. */
function pillViolations(html: string): string[] {
  const classes = (/class="([^"]*)"/.exec(html)?.[1] ?? "").split(" ");
  const found: string[] = [];
  if (!classes.includes("fo-pill")) found.push("no layer");
  if (classes.some((name) => /^(hover|active):bg-/.test(name))) {
    found.push("background changes under the pointer");
  }
  if (classes.some((name) => /^transition-(colors|all)$/.test(name))) {
    found.push("colour transition");
  }
  if (classes.some((name) => /scale-\[0\.98\]$/.test(name))) {
    found.push("second press rule");
  }
  return found;
}

describe("motion 6 (A-founder-2026-10-19e (e), (f)): every pill is a `fo-pill`", () => {
  for (const variant of ["primary", "accent", "secondary", "danger"] as const) {
    it(`${variant}: the layer and the press, no background change, no second press`, () => {
      const html = renderToStaticMarkup(
        <Button variant={variant}>Send</Button>,
      );
      expect(pillViolations(html)).toEqual([]);
    });
  }

  it("names the variant's hover colour, and the secondary its active colour inside the ring", () => {
    expect(renderToStaticMarkup(<Button variant="danger">x</Button>)).toContain(
      "[--fo-pill-hover:var(--color-danger-strong)]",
    );
    const secondary = renderToStaticMarkup(
      <Button variant="secondary">x</Button>,
    );
    expect(secondary).toContain(
      "[--fo-pill-hover:var(--color-surface-raised)]",
    );
    expect(secondary).toContain(
      "[--fo-pill-active:var(--color-surface-muted)]",
    );
    expect(secondary).toContain("[--fo-pill-inset:1.5px]");
  });

  // The hover colour per variant, each one the colour it snapped to before (clause 1 (e)).
  const HOVER_COLOUR = {
    primary: "[--fo-pill-hover:var(--color-accent-strong)]",
    accent: "[--fo-pill-hover:var(--color-accent-strong)]",
    secondary: "[--fo-pill-hover:var(--color-surface-raised)]",
    danger: "[--fo-pill-hover:var(--color-danger-strong)]",
  } as const;
  for (const [variant, colour] of Object.entries(HOVER_COLOUR)) {
    it(`${variant}: its layer fades to ${colour}`, () => {
      const classes = (
        /class="([^"]*)"/.exec(
          renderToStaticMarkup(
            <Button variant={variant as keyof typeof HOVER_COLOUR}>x</Button>,
          ),
        )?.[1] ?? ""
      ).split(" ");
      expect(classes).toContain(colour);
    });
  }

  it("gives `quiet` and a disabled pill no layer", () => {
    expect(
      renderToStaticMarkup(<Button variant="quiet">x</Button>),
    ).not.toContain("fo-pill");
    expect(renderToStaticMarkup(<Button disabled>x</Button>)).not.toContain(
      "fo-pill",
    );
  });

  it("goes red with the hover back to a `background-color` change, or a second press", () => {
    expect(
      pillViolations('<button class="fo-pill hover:bg-accent-strong">'),
    ).toEqual(["background changes under the pointer"]);
    expect(
      pillViolations(
        '<button class="fo-pill motion-safe:active:scale-[0.98]">',
      ),
    ).toEqual(["second press rule"]);
    expect(pillViolations('<button class="bg-accent">')).toEqual(["no layer"]);
  });
});

const CARD: ProductCardView = {
  productId: "FO-BQ-001",
  name: "Amber Hour",
  photo: { kind: "placeholder", slot: "grid" },
  price: { amountMinor: 4590, currency: "EUR" },
  priceLabelKey: "catalog.price.inclusive",
  provenance: "ai",
  href: "/en/poland/product/amber-hour",
};

function renderCard(priority: boolean): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale="en"
      messages={loadMessages("en", ["shop", "catalog", "media", "a11y"])}
      timeZone="UTC"
    >
      <ProductCard card={CARD} locale="en" priority={priority} />
    </NextIntlClientProvider>,
  );
}

/** How many of each motion 6 part a card's markup carries, and whether they are hidden. */
function cardParts(html: string) {
  return {
    motion: (html.match(/<a [^>]*data-fo-card-motion=""/g) ?? []).length,
    shadows: (
      html.match(/<span aria-hidden="true" data-fo-card-shadow="">/g) ?? []
    ).length,
    lines: (html.match(/<span aria-hidden="true" data-fo-card-line="">/g) ?? [])
      .length,
    anyShadow: html.includes("data-fo-card-shadow"),
    anyLine: html.includes("data-fo-card-line"),
  };
}

describe("motion 6's card layers (A-founder-2026-10-19e (c), (d); T-48 unit)", () => {
  it("a moving card renders one shadow layer and one line, both aria-hidden", () => {
    const html = renderCard(false);
    expect(cardParts(html)).toEqual({
      motion: 1,
      shadows: 1,
      lines: 1,
      anyShadow: true,
      anyLine: true,
    });
    // The line sits in the heading, after the name; the name draws no `text-decoration` too.
    expect(html).toMatch(
      /<bdi>Amber Hour<\/bdi><span aria-hidden="true" data-fo-card-line=""><\/span><\/h2>/,
    );
    expect(html).not.toContain("group-hover:underline");
    // The heading is the positioned, name-wide box the line sits under (clause 1 (d)).
    expect(html).toMatch(
      /<h2 class="[^"]*\brelative w-fit\b[^"]*"><bdi>Amber Hour<\/bdi>/,
    );
    // The shadow layer is the sibling just before the photograph's clipped box.
    expect(html).toMatch(
      /<div class="relative"><span aria-hidden="true" data-fo-card-shadow=""><\/span><div class="photo overflow-hidden/,
    );
  });

  it("the priority card renders neither, no `data-fo-card-motion`, and keeps its underline", () => {
    const html = renderCard(true);
    expect(cardParts(html)).toEqual({
      motion: 0,
      shadows: 0,
      lines: 0,
      anyShadow: false,
      anyLine: false,
    });
    expect(html).toContain("group-hover:underline");
  });

  it("the home's trending cards move when they link, and only then (TASK-277)", async () => {
    const pages = await listProductPages("en");
    const render = (node: React.ReactElement): string =>
      renderToStaticMarkup(
        <NextIntlClientProvider
          locale="en"
          messages={loadMessages("en", NAMESPACES)}
          timeZone="UTC"
        >
          {node}
        </NextIntlClientProvider>,
      );
    const linked = cardParts(
      render(<TrendingRow locale="en" productPages={pages} />),
    );
    expect(linked).toEqual({
      motion: 5,
      shadows: 5,
      lines: 5,
      anyShadow: true,
      anyLine: true,
    });
    const linkedHtml = render(<TrendingRow locale="en" productPages={pages} />);
    expect(
      linkedHtml.match(/<h3 class="[^"]*\brelative w-fit\b[^"]*">/g),
    ).toHaveLength(5);
    expect(cardParts(render(<TrendingRow locale="en" />))).toEqual({
      motion: 0,
      shadows: 0,
      lines: 0,
      anyShadow: false,
      anyLine: false,
    });
  });
});

describe("motion 12 on the listing pages: each subsection under the grid", () => {
  it("carries `data-fo-reveal` beside the page's own hook, and no start state", () => {
    const html = renderToStaticMarkup(
      <ListingSubsection
        dataHook={{ "data-fo-shop-intro": true }}
        heading="How it reaches Poland"
        id="intro"
      >
        <p>Body</p>
      </ListingSubsection>,
    );
    expect(html).toMatch(/<section[^>]* data-fo-reveal=""[^>]*>/u);
    expect(html).toContain('data-fo-shop-intro="true"');
    expect(html).not.toContain("pending");
  });
});
