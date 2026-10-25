/**
 * Spec 042 idea 1, the photo morph (motion 14; TASK-307): the server markup half of AC-7 and AC-8.
 * The browser half is `tests/e2e/photo-morph.spec.ts`.
 *
 *  - **The product page opts in, inside both conditions, and names its hero.** `Gallery` renders
 *    exactly one `<style data-fo-morph>`: `@view-transition { navigation: auto }` and the hero
 *    photograph's name, both inside `prefers-reduced-motion: no-preference` and `min-width: 64rem`
 *    (red with the `lg` condition or the `no-preference` one dropped from `MORPH_MEDIA`).
 *  - **The kill switch.** With `INTERACTIONS.morph` off, no `<style>` at all (spec 042 §12).
 *  - **Nothing for a placeholder, nothing unsafe.** The placeholder gallery has no photograph to
 *    name; an asset id outside kebab-case never reaches a stylesheet.
 *  - **No static name on any card** (AC-8: "before any click, no card carries a
 *    `view-transition-name`"), so a product in two home rails cannot abort the transition; and a
 *    card gains no byte (§5.3.0's 60 B per card): its photograph box already carries the asset id
 *    the click names it by, the same id the product page names its hero by.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../messages/en.json";
import { listProductPages } from "../../src/modules/catalog";
import { type MessageNamespace, loadMessages } from "../../src/modules/i18n";
import { TrendingRow } from "../../src/modules/ui/home/TrendingRow.tsx";
import {
  MORPH_ASSET_ID,
  MORPH_MEDIA,
  morphHeroRule,
  morphName,
} from "../../src/modules/ui/motion/morph.ts";
import { Gallery } from "../../src/modules/ui/product/Gallery.tsx";
import { ProductCard } from "../../src/modules/ui/shop/ProductCard.tsx";
import type { ProductCardView } from "../../src/modules/ui/shop/viewModel.ts";

const switches = vi.hoisted(() => ({ morph: true }));
vi.mock("@/config/interactions", () => ({ INTERACTIONS: switches }));

const NAMESPACES = Object.keys(en) as MessageNamespace[];
const HERO = "fo-bq-001-hero";

function render(node: ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale="en"
      messages={loadMessages("en", NAMESPACES)}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

function gallery(assetId = HERO): string {
  return render(
    <Gallery
      gallery={{
        kind: "photos",
        hero: { assetId, alt: "Orange garden roses with eucalyptus" },
        thumbs: [],
      }}
      locale="en"
      priority
      productName="Amber Hour"
    />,
  );
}

const STYLE = /<style data-fo-morph="">([\s\S]*?)<\/style>/g;

beforeEach(() => {
  switches.morph = true;
});

describe("the product page's half (AC-7, AC-8)", () => {
  it("renders one opt-in that names the hero's photograph, inside no-preference and lg", () => {
    const styles = [...gallery().matchAll(STYLE)].map((match) => match[1]);
    expect(styles).toEqual([
      "@media (prefers-reduced-motion:no-preference) and (min-width:64rem){@view-transition{navigation:auto}[data-fo-gallery-image=hero] img{view-transition-name:photo-fo-bq-001-hero;border-radius:var(--radius-photo)}}",
    ]);
    expect(MORPH_MEDIA).toBe(
      "(prefers-reduced-motion:no-preference) and (min-width:64rem)",
    );
  });

  it("names the box the hero's `<img>` sits in by the same asset id", () => {
    const html = gallery();
    expect(html).toMatch(
      /data-fo-gallery-image="hero"[^>]*><div class="photo[^"]*"[^>]*data-fo-media-asset="fo-bq-001-hero"[^>]*><picture[^>]*>[\s\S]*?<img /,
    );
  });

  it("renders nothing with the switch off (spec 042 §12)", () => {
    switches.morph = false;
    expect(gallery()).not.toContain("<style");
    expect(gallery()).not.toContain("view-transition");
  });

  it("renders nothing for the placeholder gallery, which has no photograph", () => {
    const html = render(
      <Gallery
        gallery={{ kind: "placeholder" }}
        locale="en"
        priority
        productName="Amber Hour"
      />,
    );
    expect(html).not.toContain("<style");
  });

  it("never writes an asset id outside kebab-case into a stylesheet", () => {
    for (const id of ["fo-bq-001-hero}a{color:red", "FO-BQ-001", "a b", ""]) {
      expect(MORPH_ASSET_ID.test(id), id).toBe(false);
      expect(morphHeroRule(id), id).toBeUndefined();
    }
    expect(morphName(HERO)).toBe("photo-fo-bq-001-hero");
  });
});

describe("the card's half: no static name, no byte (AC-8, §5.3.0)", () => {
  const card: ProductCardView = {
    productId: "FO-BQ-001",
    name: "Amber Hour",
    photo: {
      kind: "asset",
      assetId: HERO,
      alt: "Orange garden roses with eucalyptus",
      slot: "grid",
    },
    price: { amountMinor: 4590, currency: "EUR" },
    priceLabelKey: "catalog.price.inclusive",
    provenance: "ai",
    equivalents: null,
    slots: null,
    localSpecial: false,
    href: "/en/poland/product/amber-hour",
  };

  it.each([
    ["a moving card", false],
    ["the priority card", true],
  ] as const)(
    "%s carries no name and no morph attribute, and its photograph box carries the asset id",
    (_name, priority) => {
      const html = render(
        <ProductCard card={card} locale="en" priority={priority} />,
      );
      expect(html).not.toContain("view-transition");
      expect(html).not.toContain("data-fo-morph");
      expect(html).toMatch(
        /<a [^>]*href="\/en\/poland\/product\/amber-hour"[\s\S]*data-fo-media-asset="fo-bq-001-hero"/,
      );
    },
  );

  it("the home's trending cards carry no name either", async () => {
    const pages = await listProductPages("en");
    const html = render(<TrendingRow locale="en" productPages={pages} />);
    expect(html).toContain("data-fo-media-asset=");
    expect(html).not.toContain("view-transition");
    expect(html).not.toContain("data-fo-morph");
  });
});
