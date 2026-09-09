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
import {
  CATEGORY_ROW_LINK_IDS,
  MASTHEAD_LINK_IDS,
  SEARCH_LINK_ID,
  SITE_LINKS,
  SITE_LINK_GROUPS,
  SiteLinkGroupRegistrySchema,
  SiteLinkRegistrySchema,
  SiteLinkSchema,
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
      expect(link.target.kind, link.id).toBe("pending");
      expect(isPublished(link.id), link.id).toBe(false);
    }
  });

  it("publishes the locale home and nothing else in Phase 0", () => {
    const published = SITE_LINKS.filter((link) => link.published).map(
      (link) => link.id,
    );
    expect(published).toEqual(["locale-home"]);
    expect(isPublished("locale-home")).toBe(true);
    expect(isPublished("terms")).toBe(false);
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
      expect(canvas, `${link.id} → ${label}`).toContain(`>${label}<`);
    }
    expect(canvas).toContain("Search flowers, occasions, a city or a country");
    // The basket label is the one plural-ready label: the canvas prints its empty state.
    expect(messageAt("nav.basket")).toBe("Basket ({count, number})");
    expect(canvas).toContain(">Basket (0)<");
  });
});
