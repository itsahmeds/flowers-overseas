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
 *  - **`published` is `true` for the locale home only**, because it is the only page that exists
 *    in Phase 0 — the reason the footer renders headings and text rather than links.
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
  SITE_LINKS,
  SITE_LINK_GROUPS,
  SiteLinkGroupRegistrySchema,
  SiteLinkRegistrySchema,
  SiteLinkSchema,
  corridorLinkId,
  groupLinks,
  isPublished,
  isSiteLinkId,
  linkPageTypes,
  siteLink,
} from "../../src/config/site-links.ts";
import { PAGE_TYPES, localePath } from "../../src/modules/i18n/routing.ts";

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

  it("publishes the hub and the seven corridor targets, and nothing else (AC-20)", () => {
    const published = SITE_LINKS.filter((link) => link.published).map(
      (link) => link.id,
    );
    // Spec 007 AC-20 verbatim: `site-links.ts` publishes `destinationsHub` (the `destinations`
    // row — ids are hyphen-case) and the corridor targets, and nothing else. Every other id is
    // still text on every surface, which is what keeps spec 004 AC-14 true.
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
    ]);
    expect(isPublished("locale-home")).toBe(true);
    expect(isPublished("terms")).toBe(false);
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
