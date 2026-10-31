/**
 * Photographed products first, and a wordless placeholder (spec 043 §5.2, §5.3 F, **AC-13**,
 * **AC-14**, T-13, T-14's unit half; spec 008 §14 A-founder-2026-10-20a, AC-9 and AC-6 as amended;
 * TASK-290).
 *
 *  1. `photoFirst()` is a stable partition (T-13's fixture: five items, photographs at 2 and 4).
 *  2. Every product list in default order puts every photographed product before every product
 *     without one, each group in spec 005's order: the country listings (whole set before paging),
 *     the hubs, the product page's related row and the home's product row. On the committed plants
 *     page Peace Lily and Olive Sapling are the last two cards.
 *  3. The price sorts are **not** partitioned: they equal the price order of spec 005's order.
 *  4. The placeholder box of a card with no photograph is `aria-hidden="true"` and holds no text,
 *     and the card keeps its name and its price.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * While `bypass.on` is true, every caller's `photoFirst()` returns its input unchanged: the order
 * the lists had before TASK-290, i.e. spec 005's order as the catalogue computes it. The tests
 * read that order this way rather than re-deriving it, so "each group keeps spec 005's order" is
 * compared against the implementation's own spec 005 order.
 */
const bypass = vi.hoisted(() => ({ on: false }));
vi.mock("../../src/modules/ui/shop/photoFirst.ts", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../src/modules/ui/shop/photoFirst.ts")
    >();
  return {
    photoFirst: <T extends { readonly photo: { readonly kind: string } }>(
      items: readonly T[],
    ): T[] => (bypass.on ? [...items] : actual.photoFirst(items)),
  };
});

import {
  type ListingView,
  listingView,
  photoFirst,
  productView,
  topProductsForPrebuild,
} from "../../src/modules/catalog";
import { CountryCategoryPage } from "../../src/modules/catalog/ui/CountryCategoryPage.tsx";
import { formatMoney, loadMessages } from "../../src/modules/i18n";
import {
  committedMediaManifest,
  setMediaManifest,
} from "../../src/modules/ui/media/manifest.ts";

const FROM = "2026-09-09";
const FRESH = new Date("2026-09-09T12:00:00Z");

afterEach(() => {
  setMediaManifest(committedMediaManifest);
  bypass.on = false;
});

/** `body`'s result with every `photoFirst()` bypassed: spec 005's order, unpartitioned. */
async function unpartitioned<T>(body: () => Promise<T>): Promise<T> {
  bypass.on = true;
  try {
    return await body();
  } finally {
    bypass.on = false;
  }
}

function render(node: ReactElement, locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, [
        "shop",
        "catalog",
        "media",
        "a11y",
        "common",
        "breadcrumb",
        "destinations",
        "occasions",
        "nav",
        "home",
      ])}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

type Identity = Parameters<typeof listingView>[0];

async function view(
  identity: Identity,
  options: Parameters<typeof listingView>[1] = {},
): Promise<ListingView> {
  const resolved = await listingView(identity, { from: FROM, ...options });
  if (resolved === undefined) {
    throw new Error(`${JSON.stringify(identity)} must resolve`);
  }
  return resolved;
}

/** Every card of a country listing, all pages, in the order the pages show them. */
async function allItems(
  identity: Identity,
  sort?: "default" | "price-asc" | "price-desc",
): Promise<ListingView["items"][number][]> {
  const first = await view(identity, { now: FRESH, ...(sort ? { sort } : {}) });
  const rest = await Promise.all(
    Array.from({ length: first.pageCount - 1 }, (_, index) =>
      view(identity, {
        now: FRESH,
        page: index + 2,
        ...(sort ? { sort } : {}),
      }),
    ),
  );
  return [first, ...rest].flatMap((page) => [...page.items]);
}

/** The expected default order: spec 005's, then the stable partition. */
function partitioned(
  order: readonly string[],
  photographed: ReadonlySet<string>,
): string[] {
  return [
    ...order.filter((sku) => photographed.has(sku)),
    ...order.filter((sku) => !photographed.has(sku)),
  ];
}

describe("photoFirst() is a stable partition (T-13)", () => {
  const item = (id: number, photo: boolean) => ({
    id,
    photo: { kind: photo ? "asset" : "placeholder" },
  });

  it("five items with photographs at positions 2 and 4: 2, 4, then 1, 3, 5", () => {
    const input = [
      item(1, false),
      item(2, true),
      item(3, false),
      item(4, true),
      item(5, false),
    ];
    expect(photoFirst(input).map((entry) => entry.id)).toEqual([2, 4, 1, 3, 5]);
    // The input is not mutated.
    expect(input.map((entry) => entry.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns an all-photograph list and an all-placeholder list in input order", () => {
    const photos = [item(3, true), item(1, true), item(2, true)];
    const boxes = [item(3, false), item(1, false), item(2, false)];
    expect(photoFirst(photos).map((entry) => entry.id)).toEqual([3, 1, 2]);
    expect(photoFirst(boxes).map((entry) => entry.id)).toEqual([3, 1, 2]);
    expect(photoFirst([])).toEqual([]);
  });
});

describe("country listings in default order: photographs first, spec 005's order inside each group (AC-13)", () => {
  const PLANTS: Identity = {
    locale: "en",
    pageType: "countryCategory",
    country: "poland",
    entity: "plants",
  };

  it("the plants page ends with Peace Lily and Olive Sapling, the two without a photograph", async () => {
    const items = await allItems(PLANTS);
    expect(items.map((card) => card.name).slice(-2)).toEqual([
      "Peace Lily",
      "Olive Sapling",
    ]);
    expect(items.slice(-2).map((card) => card.photo.kind)).toEqual([
      "placeholder",
      "placeholder",
    ]);
    expect(
      items.slice(0, -2).every((card) => card.photo.kind === "asset"),
    ).toBe(true);
  });

  it.each([
    ["the plants page", PLANTS],
    [
      "the shop root (seven pages)",
      { locale: "en", pageType: "countryShopRoot", country: "poland" },
    ],
    [
      "en-gb roses",
      {
        locale: "en-gb",
        pageType: "countryCategory",
        country: "poland",
        entity: "roses",
      },
    ],
  ] as const)(
    "%s: equals spec 005's order, partitioned",
    async (_, identity) => {
      const items = await allItems(identity as Identity);
      const photographed = new Set(
        items
          .filter((card) => card.photo.kind === "asset")
          .map((card) => card.productId),
      );
      const order = (
        await unpartitioned(() => allItems(identity as Identity))
      ).map((card) => card.productId);
      expect(items.map((card) => card.productId)).toEqual(
        partitioned(order, photographed),
      );
    },
  );

  it.each(["price-asc", "price-desc"] as const)(
    "%s is the price order of spec 005's order, not partitioned",
    async (sort) => {
      const items = await allItems(PLANTS, sort);
      const order = (await unpartitioned(() => allItems(PLANTS))).map(
        (card) => card.productId,
      );
      const price = new Map(
        items.map((card) => [card.productId, Number(card.price.amountMinor)]),
      );
      const direction = sort === "price-asc" ? 1 : -1;
      const expected = [...order].sort(
        (left, right) =>
          direction * ((price.get(left) ?? 0) - (price.get(right) ?? 0)),
      );
      expect(items.map((card) => card.productId)).toEqual(expected);
      // The control: the plants page has a placeholder that a partition would move.
      expect(items.some((card) => card.photo.kind === "placeholder")).toBe(
        true,
      );
      expect(expected).not.toEqual(
        partitioned(
          expected,
          new Set(
            items
              .filter((card) => card.photo.kind === "asset")
              .map((card) => card.productId),
          ),
        ),
      );
    },
  );
});

describe("hub grids: photographs first (AC-13)", () => {
  it("the plants hub ends with the two plants without a photograph, each group in the hub's order", async () => {
    const hub = await view({
      locale: "en",
      pageType: "categoryHub",
      entity: "plants",
    });
    const kinds = hub.hubItems.map((card) => card.photo.kind);
    const firstBox = kinds.indexOf("placeholder");
    expect(firstBox).toBeGreaterThan(0);
    expect(kinds.slice(firstBox).every((kind) => kind === "placeholder")).toBe(
      true,
    );
    expect(hub.hubItems.slice(firstBox).map((card) => card.name)).toEqual([
      "Olive Sapling",
      "Peace Lily",
    ]);
    // The hub's order is the locale's collation of the name, inside each group.
    const names = hub.hubItems.slice(0, firstBox).map((card) => card.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });
});

/** The committed manifest without the assets of `skus`: those products show the placeholder. */
function withoutPhotographs(skus: readonly string[]): void {
  const drop = new Set(skus);
  setMediaManifest({
    ...committedMediaManifest,
    assets: committedMediaManifest.assets.filter(
      (asset) => asset.productSku === undefined || !drop.has(asset.productSku),
    ),
  });
}

describe("the product page's related row: photographs first, before the six are picked (AC-13)", () => {
  it("passes over the two first-ranked products when they have no photograph", async () => {
    const ranked = (await topProductsForPrebuild("PL", "en", 500)).map(
      (product) => product.sku,
    );
    const subject = ranked[10];
    // The rank the related row reads (`relatedFor`: spec 005's order over every deliverable
    // product), before any partition.
    if (subject === undefined) throw new Error("ranked list too short");
    const before = await productView(
      { locale: "en", countryIso: "PL", sku: subject },
      { parameterised: false, now: FRESH },
    );
    const firstTwo = before?.related.slice(0, 2).map((card) => card.productId);
    expect(firstTwo).toHaveLength(2);

    withoutPhotographs(firstTwo ?? []);
    const after = await productView(
      { locale: "en", countryIso: "PL", sku: subject },
      { parameterised: false, now: FRESH },
    );
    const related = after?.related ?? [];
    expect(related).toHaveLength(before?.related.length ?? -1);
    expect(related.every((card) => card.photo.kind === "asset")).toBe(true);
    expect(related.map((card) => card.productId)).not.toContain(firstTwo?.[0]);
    // The rest keep spec 005's order: the row is the next photographed products, in rank order.
    const expected = ranked
      .filter((sku) => sku !== subject && !(firstTwo ?? []).includes(sku))
      .slice(0, related.length);
    expect(related.map((card) => card.productId)).toEqual(expected);
  });
});

// The home's product row left with TrendingRow (spec 004 §14 A-founder-2026-10-24a item 4.3;
// TASK-386): "Our selection" is the core range in "Our order", the founder's rank, so no
// photograph partition applies to it (spec 045 §2.5 supersedes spec 043 AC-13 there).

describe("the placeholder box: no words, aria-hidden, the card keeps its name and price (AC-14)", () => {
  it("on /en/poland/flowers/plants", async () => {
    const plants = await view(
      {
        locale: "en",
        pageType: "countryCategory",
        country: "poland",
        entity: "plants",
      },
      { now: FRESH },
    );
    const html = render(<CountryCategoryPage view={plants} />, "en");
    expect(html).not.toMatch(/Photography to supply/iu);
    const cards = html.split("data-fo-product-card=").slice(1);
    const boxes = cards.filter((card) =>
      card.includes("data-fo-media-placeholder="),
    );
    expect(boxes).toHaveLength(2);
    for (const [index, card] of cards.entries()) {
      const item = plants.items[index];
      if (item === undefined || item.photo.kind !== "placeholder") continue;
      expect(card).toMatch(
        /<div[^>]*data-fo-media-placeholder="no-asset"[^>]*aria-hidden="true"[^>]*><\/div>/u,
      );
      expect(card).toContain(item.name);
      expect(card.replaceAll(" ", " ")).toContain(
        formatMoney(item.price, "en").replaceAll(" ", " "),
      );
    }
  });
});
