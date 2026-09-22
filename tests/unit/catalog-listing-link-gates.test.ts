/**
 * `listingView()` asks `isPublished()` before it draws a link into a listing **family** (spec 008
 * AC-20, §5.1's rollback, spec 004 §5.1 and AC-14; `/review 98` round 1, required change 3;
 * TASK-113).
 *
 * The defect this pins: with `country-occasion` set to `published: false`, fourteen links into it
 * still rendered (seven from the shop roots' calendars, seven from the Mother's Day hub's picker),
 * so three of AC-20's five flags switched nothing off, and spec 008 §5.1's rollback ("rows back to
 * `published: false`") was a no-op for them. Only `corridorShopEntry()` asked the registry.
 *
 * One case per family. Each one withdraws **that family's** publication alone and asserts that no
 * href anywhere in the view models of the six page types lands in that family's slice of the
 * existence set, **and** that the other families still do. That second half matters: a mock that
 * answered `false` for everything would also leave zero hrefs, and the case would pass for the
 * wrong reason.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type ListingLinkPageType,
  isPublished,
  listingLinkId,
  listingLinkPageTypes,
} from "../../src/config/site-links.ts";

vi.mock("../../src/config/site-links.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/config/site-links.ts")>();
  return { ...actual, isPublished: vi.fn(actual.isPublished) };
});

const { listingPages, listingView } =
  await import("../../src/modules/catalog/listing.ts");
const actual = await vi.importActual<
  typeof import("../../src/config/site-links.ts")
>("../../src/config/site-links.ts");
const publishedMock = vi.mocked(isPublished);

afterEach(() => {
  publishedMock.mockImplementation(actual.isPublished);
});

const FROM = "2026-09-15";
const pages = await listingPages("en");

/**
 * The pages that host every listing link `listingView()` draws: a shop root (tiles, the occasion
 * calendar), a country category (chips, the shop-root link and crumb), the Mother's Day country
 * occasion (chips), a category hub and the Mother's Day occasion hub (the destination pickers), and
 * the occasions index (its entries). Poland first, because it is the registry's first destination.
 */
const HOSTS = [
  pages.find((p) => p.pageType === "countryShopRoot" && p.countryIso === "PL"),
  pages.find((p) => p.pageType === "countryCategory" && p.countryIso === "PL"),
  pages.find(
    (p) =>
      p.pageType === "countryOccasion" &&
      p.countryIso === "PL" &&
      p.slug === "mothers-day",
  ),
  pages.find((p) => p.pageType === "categoryHub"),
  pages.find((p) => p.pageType === "occasionHub" && p.slug === "mothers-day"),
  pages.find((p) => p.pageType === "occasionsIndex"),
];

/** Every link target a view model carries, bar the page's own URL (the `self` and the leaf crumb). */
function linkTargets(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) linkTargets(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const [key, field] of Object.entries(value)) {
      if ((key === "href" || key === "shopRoot") && typeof field === "string") {
        out.push(field);
      } else {
        linkTargets(field, out);
      }
    }
  }
  return out;
}

async function renderedTargets(): Promise<readonly string[]> {
  const targets: string[] = [];
  for (const host of HOSTS) {
    if (host === undefined) throw new Error("a host page is missing");
    const view = await listingView(
      {
        locale: host.locale,
        pageType: host.pageType,
        ...(host.countrySlug === undefined
          ? {}
          : { country: host.countrySlug }),
        ...(host.slug === undefined ? {} : { entity: host.slug }),
      },
      { from: FROM },
    );
    if (view === undefined) throw new Error(`no view for ${host.path}`);
    linkTargets(
      {
        ...view,
        breadcrumb: view.breadcrumb.filter((crumb) => !crumb.current),
        links: { ...view.links, self: undefined },
      },
      targets,
    );
  }
  return targets;
}

/** How many rendered targets fall in each family's slice of the existence set. */
async function countsByFamily(): Promise<Record<ListingLinkPageType, number>> {
  const targets = await renderedTargets();
  const counts = {} as Record<ListingLinkPageType, number>;
  for (const family of listingLinkPageTypes) {
    const members = new Set(
      pages.filter((p) => p.pageType === family).map((p) => p.path),
    );
    counts[family] = targets.filter((target) => members.has(target)).length;
  }
  return counts;
}

function withdraw(family: ListingLinkPageType): void {
  const id = listingLinkId(family);
  publishedMock.mockImplementation((asked) =>
    asked === id ? false : actual.isPublished(asked),
  );
}

describe("listingView() draws a listing link only while its family is published (AC-20)", () => {
  it("links into all four families today, from the six page types", async () => {
    expect(HOSTS.every((host) => host !== undefined)).toBe(true);
    const counts = await countsByFamily();
    for (const family of listingLinkPageTypes) {
      expect(counts[family], family).toBeGreaterThan(0);
    }
  });

  for (const family of listingLinkPageTypes) {
    it(`\`${listingLinkId(family)}\` set to \`published: false\` removes every link into ${family}, and only those`, async () => {
      const before = await countsByFamily();
      withdraw(family);
      const after = await countsByFamily();
      expect(after[family], `links into ${family}`).toBe(0);
      expect(publishedMock).toHaveBeenCalledWith(listingLinkId(family));
      for (const other of listingLinkPageTypes) {
        if (other === family) continue;
        expect(after[other], `links into ${other}`).toBe(before[other]);
      }
    });
  }
});
