/**
 * Site-link registry (spec 004 §2 "Everything data-gated is config", §5.1, §12; TASK-047).
 *
 * Every navigation target the founder-approved chrome draws — the masthead's account cluster, the
 * category row's end cluster, the four footer link columns and the legal row of
 * `docs/design/homepage-v1/homepage-desktop.dc.html` — with **the spec that publishes it** and a
 * `published` flag. It is the answer to spec 004 AC-14: a target whose page does not exist yet is
 * a row here with `published: false`, and `SiteHeader`/`SiteFooter` (TASK-048/TASK-049) render an
 * unpublished target as **text, never as a link**. So Phase 0 ships zero internal links to a
 * non-200 URL, and 007/008/010/011/019 turn text into navigation by flipping data.
 *
 * `isPublished(linkId)` is the only consumer path for the flag (spec 004 §5.1's contract: one
 * predicate). As in spec 003 §12 and in `countries.ts`, the config-file flag is a bounded, stated
 * deviation from `CLAUDE.md`'s "go-live is a data flip in admin, never a code change" while spec
 * 002 is parked: spec 012's admin plus spec 002's `feature_flag` take the authority over with no
 * call-site change.
 *
 * No database is read here and none may be (`pnpm check:no-db`, spec 004 AC-2). No user-facing
 * string is stored either: a link carries `labelKey`, a `nav.*`/`footer.*`/`common.*` message key
 * resolved through the catalogue (`CLAUDE.md`, spec 004 §7).
 *
 * **How a target resolves.** Two honest shapes and nothing else:
 *
 *  - `{ kind: "route", pageType }` — the URL exists as a *route shape* today: `pageType` is one of
 *    `localePath()`'s page types, so `src/config/locales.ts` already fixes the localised segment
 *    (`/de/blumen-verschicken`, `/pl/regulamin`, `/{locale}/legal/*`). Spec 004 §2 calls these
 *    "reserved as unpublished targets": the segment is settled, the page is not.
 *  - `{ kind: "pending" }` — no route shape exists yet; `owningSpec` is the only thing that says
 *    where it will come from.
 *
 * A `published: true` link may not be `pending`, which is refined below: publishing a link with
 * no route is exactly the AC-14 failure this registry exists to prevent.
 */
import { z } from "zod";

import { PATH_SEGMENT_KEYS } from "./locales.data.ts";

/**
 * `localePath()`'s page types (`src/modules/i18n/routing.ts`'s `PageType`), restated from the
 * same constant the router builds them from. `src/config` deliberately imports no module, so the
 * union is rebuilt here and `tests/unit/site-links-config.test.ts` asserts the two agree.
 */
export const linkPageTypes = ["home", ...PATH_SEGMENT_KEYS] as const;
export type LinkPageType = (typeof linkPageTypes)[number];

/** A dotted message key (`nav.search.label`, `footer.link.terms`, `common.homeLink`). */
const MessageKeySchema = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+$/,
    "must be a dotted message key such as `footer.link.terms`",
  );

/** The spec that publishes a target, as its three-digit id (`007`, `011`, `019`). */
const OwningSpecSchema = z
  .string()
  .regex(/^0\d{2}$/, "must be a three-digit spec id such as `007`");

export const SiteLinkTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("route"), pageType: z.enum(linkPageTypes) })
    .strict(),
  z.object({ kind: z.literal("pending") }).strict(),
]);

export type SiteLinkTarget = z.infer<typeof SiteLinkTargetSchema>;

/** Where a link is drawn. `for-florists` is the one entry the canvas draws on both surfaces. */
export const siteLinkSurfaces = ["header", "footer"] as const;
export type SiteLinkSurface = (typeof siteLinkSurfaces)[number];

export const SiteLinkSchema = z
  .object({
    /** Stable id: what `isPublished()` is called with and what AC-14's crawl reports. */
    id: z
      .string()
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "must be a lowercase, hyphen-separated link id",
      ),
    labelKey: MessageKeySchema,
    /** Optional help/description copy (the search field's `aria-describedby` sentence). */
    descriptionKey: MessageKeySchema.optional(),
    target: SiteLinkTargetSchema,
    /** May this be rendered as a link? `false` → the chrome renders its label as text (AC-14). */
    published: z.boolean(),
    owningSpec: OwningSpecSchema,
    surfaces: z.array(z.enum(siteLinkSurfaces)).min(1),
  })
  .strict()
  .superRefine((link, ctx) => {
    if (link.published && link.target.kind === "pending") {
      ctx.addIssue({
        code: "custom",
        path: ["published"],
        message: `link \`${link.id}\` is published with a pending target: spec ${link.owningSpec} has not built a route for it, so rendering it as a link would be an internal link to a non-200 URL (spec 004 AC-14)`,
      });
    }
  });

/** A link as the schema parses it (`id` is any shape-valid id). */
export type ParsedSiteLink = z.infer<typeof SiteLinkSchema>;

/**
 * A link as the application reads it: `id` narrowed to the configured set, so iterating
 * `SITE_LINKS` and calling `isPublished(link.id)` needs no cast.
 */
export type SiteLink = Omit<ParsedSiteLink, "id"> & { id: SiteLinkId };

export const SiteLinkRegistrySchema = z
  .array(SiteLinkSchema)
  .min(1)
  .superRefine((links, ctx) => {
    const seen = new Set<string>();
    links.forEach((link, index) => {
      if (seen.has(link.id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `duplicate link id \`${link.id}\``,
        });
      }
      seen.add(link.id);
    });
  });

/**
 * Every target the approved chrome draws, in the canvas's own order: masthead first, then the
 * category row's end cluster, then the footer columns and the legal row.
 *
 * Owning specs follow `plan/09`'s numbering: `007` corridor + info pages (including the legal
 * documents, which are lawyer-gated per `plan/13` B4), `008` shop and search, `010` checkout and
 * the basket, `011` the for-florists landing, `019` the customer account. The locale home is the
 * only published entry, because it is the only page that exists.
 */
const siteLinks = [
  {
    id: "locale-home",
    labelKey: "common.homeLink",
    target: { kind: "route", pageType: "home" },
    published: true,
    owningSpec: "003",
    surfaces: ["header"],
  },
  {
    id: "search",
    labelKey: "nav.search.label",
    descriptionKey: "nav.search.help",
    target: { kind: "pending" },
    published: false,
    owningSpec: "008",
    surfaces: ["header"],
  },
  {
    id: "sign-in",
    labelKey: "nav.account.signIn",
    target: { kind: "pending" },
    published: false,
    owningSpec: "019",
    surfaces: ["header"],
  },
  {
    id: "my-orders",
    labelKey: "nav.account.orders",
    target: { kind: "pending" },
    published: false,
    owningSpec: "019",
    surfaces: ["header"],
  },
  {
    id: "basket",
    labelKey: "nav.basket",
    target: { kind: "pending" },
    published: false,
    owningSpec: "010",
    surfaces: ["header"],
  },
  {
    id: "for-florists",
    labelKey: "nav.forFlorists",
    target: { kind: "route", pageType: "forFlorists" },
    published: false,
    owningSpec: "011",
    surfaces: ["header", "footer"],
  },
  {
    id: "destinations",
    labelKey: "footer.link.destinations",
    target: { kind: "route", pageType: "destinations" },
    published: false,
    owningSpec: "007",
    surfaces: ["footer"],
  },
  {
    id: "occasions",
    labelKey: "footer.link.occasions",
    target: { kind: "route", pageType: "occasions" },
    published: false,
    owningSpec: "008",
    surfaces: ["footer"],
  },
  {
    id: "delivery-times",
    labelKey: "footer.link.deliveryTimes",
    target: { kind: "pending" },
    published: false,
    owningSpec: "007",
    surfaces: ["footer"],
  },
  {
    id: "guarantee",
    labelKey: "footer.link.guarantee",
    target: { kind: "pending" },
    published: false,
    owningSpec: "007",
    surfaces: ["footer"],
  },
  {
    id: "how-it-works",
    labelKey: "footer.link.howItWorks",
    target: { kind: "pending" },
    published: false,
    owningSpec: "007",
    surfaces: ["footer"],
  },
  {
    id: "help-and-contact",
    labelKey: "footer.link.helpAndContact",
    target: { kind: "pending" },
    published: false,
    owningSpec: "007",
    surfaces: ["footer"],
  },
  {
    id: "imprint",
    labelKey: "footer.link.imprint",
    target: { kind: "route", pageType: "legal" },
    published: false,
    owningSpec: "007",
    surfaces: ["footer"],
  },
  {
    id: "terms",
    labelKey: "footer.link.terms",
    target: { kind: "route", pageType: "legal" },
    published: false,
    owningSpec: "007",
    surfaces: ["footer"],
  },
  {
    id: "privacy",
    labelKey: "footer.link.privacy",
    target: { kind: "route", pageType: "legal" },
    published: false,
    owningSpec: "007",
    surfaces: ["footer"],
  },
  {
    id: "cookies",
    labelKey: "footer.link.cookies",
    target: { kind: "route", pageType: "legal" },
    published: false,
    owningSpec: "007",
    surfaces: ["footer"],
  },
  {
    id: "withdrawal-and-refunds",
    labelKey: "footer.link.withdrawal",
    target: { kind: "route", pageType: "legal" },
    published: false,
    owningSpec: "007",
    surfaces: ["footer"],
  },
] as const;

/** Parsed at module load: a malformed registry throws on first import, never at request time. */
export const SITE_LINKS = SiteLinkRegistrySchema.parse(
  siteLinks,
) as readonly SiteLink[];

/** The closed set of link ids, as a literal union: an unknown id is a type error. */
export type SiteLinkId = (typeof siteLinks)[number]["id"];

const byId = new Map<string, SiteLink>(
  SITE_LINKS.map((link) => [link.id, link]),
);

/** Look a link up by id. Throws on an unknown id: the link set is closed data. */
export function siteLink(id: SiteLinkId): SiteLink {
  const link = byId.get(id);
  if (link === undefined) {
    throw new Error(`unknown site link id: ${id}`);
  }
  return link;
}

/** True when the string is one of the configured link ids (boundary parsing helper). */
export function isSiteLinkId(id: string): id is SiteLinkId {
  return byId.has(id);
}

/**
 * **The** predicate over `published` (spec 004 §5.1). The chrome asks this and nothing else; a
 * caller that reads `link.published` directly is what code review is for.
 */
export function isPublished(id: SiteLinkId): boolean {
  return siteLink(id).published;
}

export const SiteLinkGroupSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "must be a lowercase, hyphen-separated group id",
      ),
    /** Column heading, or the accessible name of a row the canvas draws without one. */
    headingKey: MessageKeySchema,
    surface: z.enum(siteLinkSurfaces),
    linkIds: z.array(z.string()).min(1),
  })
  .strict();

export type SiteLinkGroup = z.infer<typeof SiteLinkGroupSchema>;

export const SiteLinkGroupRegistrySchema = z
  .array(SiteLinkGroupSchema)
  .min(1)
  .superRefine((groups, ctx) => {
    const seenGroup = new Set<string>();
    const owner = new Map<string, string>();
    groups.forEach((group, index) => {
      if (seenGroup.has(group.id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `duplicate group id \`${group.id}\``,
        });
      }
      seenGroup.add(group.id);
      group.linkIds.forEach((linkId, linkIndex) => {
        const link = byId.get(linkId);
        if (link === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [index, "linkIds", linkIndex],
            message: `group \`${group.id}\` lists unknown link id \`${linkId}\``,
          });
          return;
        }
        if (!link.surfaces.includes(group.surface)) {
          ctx.addIssue({
            code: "custom",
            path: [index, "linkIds", linkIndex],
            message: `link \`${linkId}\` is grouped on the \`${group.surface}\` but declares surfaces [${link.surfaces.join(", ")}]`,
          });
        }
        const existing = owner.get(`${group.surface}/${linkId}`);
        if (existing !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: [index, "linkIds", linkIndex],
            message: `link \`${linkId}\` is already in the \`${existing}\` group on the ${group.surface}`,
          });
        }
        owner.set(`${group.surface}/${linkId}`, group.id);
      });
    });
  });

/**
 * The footer's link columns, verbatim from the canvas's Ft4 dense colophon: **Sending**
 * (Destinations · Occasions · Delivery times and cutoffs · The guarantee), **Company** (How it
 * works · For florists · Help and contact · Imprint) and the legal row (Terms · Privacy ·
 * Cookies · Withdrawal and refunds), which the canvas draws without a visible heading — so its
 * `headingKey` is the accessible name TASK-049 gives the row.
 *
 * The canvas's two remaining footer columns are deliberately absent: the occasion-reminder signup
 * and the payment colophon carry no links, and TASK-049 owns both (the payment methods land as
 * their own `available: false` config, spec 004 §8's third-party-trademark rule).
 */
const siteLinkGroups = [
  {
    id: "sending",
    headingKey: "footer.group.sending",
    surface: "footer",
    linkIds: ["destinations", "occasions", "delivery-times", "guarantee"],
  },
  {
    id: "company",
    headingKey: "footer.group.company",
    surface: "footer",
    linkIds: ["how-it-works", "for-florists", "help-and-contact", "imprint"],
  },
  {
    id: "legal",
    headingKey: "footer.group.legal",
    surface: "footer",
    linkIds: ["terms", "privacy", "cookies", "withdrawal-and-refunds"],
  },
] as const;

/** Parsed at module load, after `SITE_LINKS`: a group naming an unknown link throws on import. */
export const SITE_LINK_GROUPS: readonly SiteLinkGroup[] =
  SiteLinkGroupRegistrySchema.parse(siteLinkGroups);

export type SiteLinkGroupId = (typeof siteLinkGroups)[number]["id"];

/**
 * The masthead's account cluster, in the canvas's order (`Sign in` · `My orders` ·
 * `Basket (0)`). A list rather than a group because the canvas gives it no heading and TASK-048
 * must not invent one.
 */
export const MASTHEAD_LINK_IDS = [
  "sign-in",
  "my-orders",
  "basket",
] as const satisfies readonly SiteLinkId[];

/** The category row's end cluster: `For florists` (the locale switcher beside it is spec 003's). */
export const CATEGORY_ROW_LINK_IDS = [
  "for-florists",
] as const satisfies readonly SiteLinkId[];

/** The search form's target (spec 008 wires the backend; in Phase 0 the form is inert). */
export const SEARCH_LINK_ID = "search" satisfies SiteLinkId;

/** The links of a group, in the canvas's order. Filtering by `isPublished()` is the caller's. */
export function groupLinks(id: SiteLinkGroupId): readonly SiteLink[] {
  const group = SITE_LINK_GROUPS.find((candidate) => candidate.id === id);
  if (group === undefined) {
    throw new Error(`unknown site link group id: ${id}`);
  }
  return group.linkIds.map((linkId) => siteLink(linkId as SiteLinkId));
}
