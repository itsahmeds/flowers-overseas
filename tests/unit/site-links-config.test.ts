/**
 * `src/config/site-links.ts` (spec 004 §2 "Everything data-gated is config", §5.1, §5.3, AC-14;
 * TASK-047).
 *
 * The registry's whole purpose is that the chrome never renders a link to a page that does not
 * exist, so the assertions are about resolvability and about the flag:
 *
 *  - **every target resolves to a known route or names an owning spec.** A `route` target's
 *    `pageType` must be one `localePath()` accepts, and `localePath()` must build a path for it in
 *    every launch locale; a `pending` target must name the spec that will build it and must not be
 *    published. That is spec 004 AC-14 expressed as a property of the data instead of a promise
 *    about the components.
 *  - **`published` names exactly the pages that exist.** It began as the locale home alone; spec
 *    007 added the destinations hub and the seven corridor targets (TASK-092), and spec 008
 *    **AC-20** adds the five ids spec 007 reserved — the occasions index and the four listing
 *    families. The published set is asserted as a *list*, so publishing a sixth id, or forgetting
 *    one of the five, is a failing test rather than a link to a 404 in production.
 *  - **a `listing` target is a family, not a URL.** `listingLinkPageTypes` is restated from
 *    `ListingPageType`, and the two are asserted to agree here for `linkPageTypes`' reason:
 *    `src/config` imports no module, so a rename in the catalogue must surface as a diff.
 *  - **the labels are the founder-approved copy**: every label key resolves in `messages/en.json`
 *    to a string the canvas actually prints (`docs/design/homepage-v1/homepage-desktop.dc.html`),
 *    which is what stops a later edit from inventing footer wording.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { launchLocales } from "../../src/config/locales.ts";
import { COUNTRY_CODES } from "../../src/config/countries.ts";
import {
  CATEGORY_ROW_LINK_IDS,
  CORRIDOR_LINKS,
  MASTHEAD_LINK_IDS,
  SEARCH_LINK_ID,
  SHOP_LINK_IDS,
  SITE_LINKS,
  SITE_LINK_GROUPS,
  SiteLinkGroupRegistrySchema,
  SiteLinkRegistrySchema,
  SiteLinkSchema,
  corridorLinkId,
  groupLinks,
  isPublished,
  isSiteLinkId,
  linkLabelKey,
  linkPageTypes,
  listingLinkId,
  listingLinkPageTypes,
  siteLink,
} from "../../src/config/site-links.ts";
import { PAGE_TYPES, localePath } from "../../src/modules/i18n/routing.ts";
import { listingPageTypes } from "../../src/modules/catalog/types.ts";

const messages = JSON.parse(
  readFileSync(resolve(__dirname, "../../messages/en.json"), "utf8"),
) as Record<string, unknown>;

const canvas = readFileSync(
  resolve(__dirname, "../../docs/design/homepage-v1/homepage-desktop.dc.html"),
  "utf8",
);

function messageAt(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      messages,
    );
}

const valid = {
  id: "example",
  labelKey: "footer.link.terms",
  target: { kind: "pending" as const },
  published: false,
  owningSpec: "007",
  surfaces: ["footer" as const],
};

describe("src/config/site-links.ts", () => {
  it("restates `localePath()`'s page types exactly", () => {
    expect([...linkPageTypes].sort()).toEqual([...PAGE_TYPES].sort());
  });

  it("resolves every target to a known route or to an owning spec (AC-14)", () => {
    for (const link of SITE_LINKS) {
      expect(link.owningSpec, link.id).toMatch(/^0\d{2}$/);
      if (link.target.kind === "route") {
        expect(PAGE_TYPES, link.id).toContain(link.target.pageType);
        for (const locale of launchLocales) {
          const path = localePath(locale, link.target.pageType);
          expect(path, `${link.id}/${locale}`).toMatch(
            new RegExp(`^/${locale}(?:/[a-z0-9-]+)*$`),
          );
        }
        continue;
      }
      if (link.target.kind === "listing") {
        // A family names a listing page type and nothing else: there is no single path to check,
        // because every member carries a slug. What *is* checkable here is that the name is one
        // the catalogue knows — the drift guard `linkPageTypes` gets one test up.
        expect(listingPageTypes, link.id).toContain(link.target.pageType);
        expect(link.owningSpec, link.id).toBe("008");
        continue;
      }
      if (link.target.kind === "corridor") {
        // A corridor target names a destination the country registry knows; the URL itself is
        // built per locale from that registry's slug, never from this one (spec 007 AC-20).
        expect(COUNTRY_CODES, link.id).toContain(link.target.iso2);
        expect(link.labelKey, link.id).toBe(
          `destinations.${link.target.iso2.toLowerCase()}.name`,
        );
        continue;
      }
      expect(link.target.kind, link.id).toBe("pending");
      expect(isPublished(link.id), link.id).toBe(false);
    }
  });

  it("publishes the hub, the corridor targets and spec 008's five ids, and nothing else (AC-20)", () => {
    const published = SITE_LINKS.filter((link) => link.published).map(
      (link) => link.id,
    );
    // Spec 007 AC-20 plus spec 008 **AC-20**: the locale home, `destinationsHub` (the
    // `destinations` row — ids are hyphen-case), the seven corridor targets and the five ids spec
    // 007 §2 reserved. Every other id is still text on every surface, which is what keeps spec
    // 004 AC-14 true. The list is exact in both directions: a sixth published id fails here, and
    // so does a missing one.
    expect(published).toEqual([
      "locale-home",
      "destinations",
      "corridor-pl",
      "corridor-de",
      "corridor-fr",
      "corridor-es",
      "corridor-it",
      "corridor-ro",
      "corridor-nl",
      "country-shop-root",
      "country-category",
      "country-occasion",
      "occasion-hub",
    ]);
    expect(isPublished("locale-home")).toBe(true);
    expect(isPublished("terms")).toBe(false);
  });

  it("names the five ids spec 007 reserved, and publishes the four whose routes serve (AC-20)", () => {
    expect([...SHOP_LINK_IDS]).toEqual([
      "occasions",
      "country-shop-root",
      "country-category",
      "country-occasion",
      "occasion-hub",
    ]);
    for (const id of SHOP_LINK_IDS) {
      expect(siteLink(id).owningSpec, id).toBe("008");
    }
    // The four whose route already serves: the three country-scoped families the day TASK-110/111
    // merged, the occasion hub the day TASK-112 did. `occasions` — the index itself — is the one
    // id whose page this task builds, and it is published in the commit that adds its route, not
    // before: a footer link to `/en/occasions` while that URL answers 404 is exactly the defect
    // spec 004 AC-14 forbids.
    for (const id of SHOP_LINK_IDS.filter((each) => each !== "occasions")) {
      expect(isPublished(id), id).toBe(true);
    }
  });

  it("draws no listing family on a chrome surface, so `linkLabelKey()` is total", () => {
    // The one thing that could reach a header or a footer with no label is a family in a group,
    // in the masthead cluster, in the category row or in the search slot. None is, and this is
    // where that stays true: `linkLabelKey()` throws rather than print "undefined", and the throw
    // has to be unreachable through the committed registry for that to be a safety net and not a
    // production 500 (spec 008 AC-20; TASK-113).
    const drawn = new Set<string>([
      ...SITE_LINK_GROUPS.flatMap((group) => [...group.linkIds]),
      ...MASTHEAD_LINK_IDS,
      ...CATEGORY_ROW_LINK_IDS,
      SEARCH_LINK_ID,
    ]);
    for (const link of SITE_LINKS) {
      if (link.target.kind !== "listing") {
        expect(linkLabelKey(link), link.id).toBe(link.labelKey);
        continue;
      }
      expect(drawn.has(link.id), link.id).toBe(false);
      expect(() => linkLabelKey(link)).toThrow(/listing family/u);
    }
  });

  it("refuses a family with a label, and a drawn link without one", () => {
    const family = {
      id: "country-shop-root",
      target: { kind: "listing", pageType: "countryShopRoot" },
      published: true,
      owningSpec: "008",
      surfaces: ["listing"],
    };
    expect(SiteLinkSchema.safeParse(family).success).toBe(true);
    expect(
      SiteLinkSchema.safeParse({ ...family, labelKey: "footer.link.occasions" })
        .success,
    ).toBe(false);
    expect(
      SiteLinkSchema.safeParse({
        id: "terms",
        target: { kind: "route", pageType: "terms" },
        published: false,
        owningSpec: "011",
        surfaces: ["footer"],
      }).success,
    ).toBe(false);
  });

  it("restates the catalogue's listing page types, and maps each family to one id", () => {
    // Four of the six: the destination-less **category hub** and the occasions index are absent
    // by design — the index is a plain `route` target (one URL per locale), and the category hub
    // has no reserved id at all in spec 008 §2's link plan.
    expect(
      [...listingLinkPageTypes].every((type) =>
        listingPageTypes.includes(type),
      ),
    ).toBe(true);
    expect([...listingLinkPageTypes]).toEqual([
      "countryShopRoot",
      "countryCategory",
      "countryOccasion",
      "occasionHub",
    ]);
    const ids = listingLinkPageTypes.map((type) => listingLinkId(type));
    expect(new Set(ids).size, "one id per family").toBe(ids.length);
    for (const [index, id] of ids.entries()) {
      const target = siteLink(id).target;
      expect(target.kind, id).toBe("listing");
      if (target.kind === "listing") {
        expect(target.pageType, id).toBe(listingLinkPageTypes[index]);
      }
    }
  });

  it("names one corridor link per destination, and resolves it by country code", () => {
    expect(CORRIDOR_LINKS.map((link) => link.id)).toEqual(
      COUNTRY_CODES.map((iso2) => `corridor-${iso2.toLowerCase()}`),
    );
    for (const iso2 of COUNTRY_CODES) {
      expect(corridorLinkId(iso2), iso2).toBe(`corridor-${iso2.toLowerCase()}`);
      expect(isPublished(corridorLinkId(iso2)), iso2).toBe(true);
    }
    // A country with no row cannot be linked: the same closed-set answer `siteLink()` gives.
    expect(() => corridorLinkId("PT")).toThrow(/PT/);
  });

  it("refuses a corridor target whose code is not an ISO 3166-1 alpha-2 form", () => {
    for (const iso2 of ["pl", "POL", "P1"]) {
      expect(
        SiteLinkSchema.safeParse({
          ...valid,
          target: { kind: "corridor", iso2 },
        }).success,
        iso2,
      ).toBe(false);
    }
  });

  it("refuses a published link with a pending target", () => {
    const result = SiteLinkSchema.safeParse({ ...valid, published: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/non-200 URL/);
    }
    expect(
      SiteLinkSchema.safeParse({
        ...valid,
        published: true,
        target: { kind: "route", pageType: "home" },
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed row and a duplicate id", () => {
    for (const [field, patch] of [
      ["id", { id: "Terms" }],
      ["labelKey", { labelKey: "Terms" }],
      ["owningSpec", { owningSpec: "7" }],
      ["surfaces", { surfaces: [] }],
      ["surfaces", { surfaces: ["sidebar"] }],
      ["target", { target: { kind: "route", pageType: "checkout" } }],
    ] as const) {
      const result = SiteLinkSchema.safeParse({ ...valid, ...patch });
      expect(result.success, JSON.stringify(patch)).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.map((issue) => issue.path.join(".")).join(" "),
          JSON.stringify(patch),
        ).toContain(field);
      }
    }
    expect(SiteLinkRegistrySchema.safeParse([valid, valid]).success).toBe(
      false,
    );
  });

  it("looks a link up by id and rejects an unknown one", () => {
    expect(isSiteLinkId("basket")).toBe(true);
    expect(isSiteLinkId("nope")).toBe(false);
    // @ts-expect-error — an unknown id is a type error as well as a runtime throw.
    expect(() => siteLink("nope")).toThrow(/nope/);
  });

  it("carries the canvas's four footer columns and legal row", () => {
    expect(SITE_LINK_GROUPS.map((group) => group.id)).toEqual([
      "sending",
      "company",
      "legal",
    ]);
    expect(groupLinks("sending").map((link) => link.id)).toEqual([
      "destinations",
      "occasions",
      "delivery-times",
      "guarantee",
    ]);
    expect(groupLinks("company").map((link) => link.id)).toEqual([
      "how-it-works",
      "for-florists",
      "help-and-contact",
      "imprint",
    ]);
    expect(groupLinks("legal").map((link) => link.id)).toEqual([
      "terms",
      "privacy",
      "cookies",
      "withdrawal-and-refunds",
    ]);
    for (const group of SITE_LINK_GROUPS) {
      expect(typeof messageAt(group.headingKey), group.id).toBe("string");
    }
  });

  it("refuses a group that names an unknown link, a wrong surface or a link twice", () => {
    const base = {
      id: "extra",
      headingKey: "footer.group.legal",
      surface: "footer" as const,
      linkIds: ["terms"],
    };
    expect(
      SiteLinkGroupRegistrySchema.safeParse([{ ...base, linkIds: ["nope"] }])
        .success,
    ).toBe(false);
    expect(
      SiteLinkGroupRegistrySchema.safeParse([
        { ...base, surface: "header", linkIds: ["terms"] },
      ]).success,
    ).toBe(false);
    expect(
      SiteLinkGroupRegistrySchema.safeParse([base, { ...base, id: "again" }])
        .success,
    ).toBe(false);
  });

  it("carries the masthead cluster, the category-row cluster and the search target", () => {
    expect([...MASTHEAD_LINK_IDS]).toEqual(["sign-in", "my-orders", "basket"]);
    expect([...CATEGORY_ROW_LINK_IDS]).toEqual(["for-florists"]);
    expect(siteLink(SEARCH_LINK_ID).descriptionKey).toBe("nav.search.help");
    for (const id of [...MASTHEAD_LINK_IDS, ...CATEGORY_ROW_LINK_IDS]) {
      expect(siteLink(id).surfaces, id).toContain("header");
    }
  });

  it("labels every link with a message key that resolves to founder-approved copy", () => {
    for (const link of SITE_LINKS) {
      // A `listing` **family** has no label, by schema: it is the permission to link into a set
      // of URLs whose members are named by their own entity or their own destination, and no
      // surface prints the family's name (spec 008 AC-20; TASK-113). The `labelKey` refinement
      // asserted above is what makes the absence deliberate rather than a forgotten field.
      if (link.labelKey === undefined) {
        expect(link.target.kind, link.id).toBe("listing");
        continue;
      }
      const label = messageAt(link.labelKey);
      expect(typeof label, link.labelKey).toBe("string");
      if (link.descriptionKey !== undefined) {
        expect(typeof messageAt(link.descriptionKey), link.descriptionKey).toBe(
          "string",
        );
      }
    }
    // The labels the canvas prints, verbatim (the home link and the search help line are the two
    // it draws differently: a logo lockup and an `aria-describedby` sentence).
    for (const link of SITE_LINKS) {
      if (["locale-home", "search", "basket"].includes(link.id)) continue;
      // A `listing` **family** is not drawn on the homepage canvas at all, and carries no label
      // to look for (spec 008 AC-20, AC-27).
      if (link.labelKey === undefined) continue;
      const label = messageAt(link.labelKey) as string;
      // A row gated on `anyDeliveryDatesOpen()` is not drawn (spec 004 §14 A19; TASK-120): the
      // artboard carries a TASK-120 comment in its place, so the drawing states the absence.
      if (link.requiresDeliveryDates) {
        expect(canvas, link.id).toContain("TASK-120");
        continue;
      }
      expect(canvas, `${link.id} → ${label}`).toContain(`>${label}<`);
    }
    expect(canvas).toContain("Search flowers, occasions, a city or a country");
    // The basket label is the one plural-ready label: the canvas prints its empty state.
    expect(messageAt("nav.basket")).toBe("Basket ({count, number})");
    expect(canvas).toContain(">Basket (0)<");
  });
});
