/**
 * The info-page registry (spec 041 §2 "The content model", §5.1, §5.2; TASK-182).
 *
 * The ten trust and legal pages as data: for each id, its family, where its URL lives (a top-level
 * segment key of `locales.data.ts` for the five trust pages and the imprint, or a leaf slug under
 * the `legal` segment for the four legal documents), the site-link row that points at it, the
 * schema types it emits, and whether it waits for the company (`requiresRegistration`, §13 Q1).
 *
 * No database is read and none may be (`pnpm check:no-db`). Whether a page **exists** in a locale
 * is not a fact of this file: it is `infoPageExists()` in `src/modules/content`, which reads the
 * committed content files and `isCompanyRegistered()` (spec 041 AC-2).
 */
import { z } from "zod";

import {
  LAUNCH_LOCALE_DATA,
  PSEUDO_LOCALE_DATA,
  type PathSegmentKey,
} from "./locales.data.ts";

/** The ten page ids of spec 041 §2's table, in its order. */
export const INFO_PAGE_IDS = [
  "how-it-works",
  "guarantee",
  "help",
  "about",
  "delivery",
  "imprint",
  "terms",
  "privacy",
  "cookies",
  "cancellation",
] as const;

export const InfoPageIdSchema = z.enum(INFO_PAGE_IDS);
export type InfoPageId = z.infer<typeof InfoPageIdSchema>;

export const infoPageFamilies = ["trust", "legal"] as const;
export type InfoPageFamily = (typeof infoPageFamilies)[number];

/** The JSON-LD types a page may emit (spec 041 §6 "Schema"). Nothing else is ever emitted. */
export const infoPageSchemaTypes = [
  "BreadcrumbList",
  "FAQPage",
  "Organization",
] as const;
export type InfoPageSchemaType = (typeof infoPageSchemaTypes)[number];

/** An ASCII, lowercase, hyphenated slug: the rule `i18n:check` holds every segment to. */
const LeafSlugSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    "must be ASCII, lowercase and hyphenated (spec 041 §6)",
  );

const InfoPageEntrySchema = z
  .object({
    id: InfoPageIdSchema,
    family: z.enum(infoPageFamilies),
    /** Top-level pages: the `PATH_SEGMENT_KEYS` key whose per-locale value is the URL segment. */
    segmentKey: z
      .enum(["howItWorks", "guarantee", "help", "about", "delivery", "imprint"])
      .optional(),
    /** Legal documents: the leaf slug under the `legal` segment, per locale. */
    leafSlugs: z.record(z.string(), LeafSlugSchema).optional(),
    /**
     * The `site-links.ts` row whose `infoPage` target names this page. Absent for `about`: the
     * canvas draws no footer link to it (spec 041 §2 "Links"); it is reached in-body.
     */
    siteLinkId: z.string().min(1).optional(),
    schemaTypes: z.array(z.enum(infoPageSchemaTypes)).min(1),
    /** `true` for imprint, terms and privacy: no page before `registered` flips (§13 Q1). */
    requiresRegistration: z.boolean(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if ((entry.segmentKey === undefined) === (entry.leafSlugs === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["segmentKey"],
        message: `\`${entry.id}\` needs exactly one of \`segmentKey\` (a top-level page) or \`leafSlugs\` (a legal leaf)`,
      });
    }
    if (!entry.schemaTypes.includes("BreadcrumbList")) {
      ctx.addIssue({
        code: "custom",
        path: ["schemaTypes"],
        message: `\`${entry.id}\` must emit a BreadcrumbList (spec 041 AC-19)`,
      });
    }
  });

export type InfoPageEntry = z.infer<typeof InfoPageEntrySchema>;

const EVERY_LOCALE = [...LAUNCH_LOCALE_DATA, ...PSEUDO_LOCALE_DATA].map(
  (locale) => locale.code,
);

/** One leaf slug per locale; `en`-language and pseudo locales read the English slug. */
function leaves(
  en: string,
  de: string,
  pl: string,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    EVERY_LOCALE.map((code) => [
      code,
      code === "de" ? de : code === "pl" ? pl : en,
    ]),
  );
}

export const InfoPageRegistrySchema = z
  .array(InfoPageEntrySchema)
  .superRefine((entries, ctx) => {
    const ids = entries.map((entry) => entry.id);
    for (const id of INFO_PAGE_IDS) {
      if (!ids.includes(id)) {
        ctx.addIssue({
          code: "custom",
          path: [],
          message: `the registry has no row for \`${id}\``,
        });
      }
    }
    // A leaf slug is unique within its locale (spec 041 §5.1, AC-4).
    const seen = new Map<string, string>();
    entries.forEach((entry, index) => {
      for (const [locale, slug] of Object.entries(entry.leafSlugs ?? {})) {
        const key = `${locale}/${slug}`;
        const owner = seen.get(key);
        if (owner !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: [index, "leafSlugs", locale],
            message: `leaf slug \`${slug}\` is already used by \`${owner}\` in locale \`${locale}\``,
          });
        }
        seen.set(key, entry.id);
      }
    });
  });

const infoPages: readonly z.input<typeof InfoPageEntrySchema>[] = [
  {
    id: "how-it-works",
    family: "trust",
    segmentKey: "howItWorks",
    siteLinkId: "how-it-works",
    schemaTypes: ["BreadcrumbList"],
    requiresRegistration: false,
  },
  {
    id: "guarantee",
    family: "trust",
    segmentKey: "guarantee",
    siteLinkId: "guarantee",
    schemaTypes: ["BreadcrumbList"],
    requiresRegistration: false,
  },
  {
    id: "help",
    family: "trust",
    segmentKey: "help",
    siteLinkId: "help-and-contact",
    schemaTypes: ["BreadcrumbList", "FAQPage"],
    requiresRegistration: false,
  },
  {
    id: "about",
    family: "trust",
    segmentKey: "about",
    schemaTypes: ["BreadcrumbList", "Organization"],
    requiresRegistration: false,
  },
  {
    id: "delivery",
    family: "trust",
    segmentKey: "delivery",
    siteLinkId: "delivery-times",
    schemaTypes: ["BreadcrumbList"],
    requiresRegistration: false,
  },
  {
    id: "imprint",
    family: "legal",
    segmentKey: "imprint",
    siteLinkId: "imprint",
    schemaTypes: ["BreadcrumbList"],
    requiresRegistration: true,
  },
  {
    id: "terms",
    family: "legal",
    leafSlugs: leaves("terms", "agb", "regulamin"),
    siteLinkId: "terms",
    schemaTypes: ["BreadcrumbList"],
    requiresRegistration: true,
  },
  {
    id: "privacy",
    family: "legal",
    leafSlugs: leaves("privacy", "datenschutz", "polityka-prywatnosci"),
    siteLinkId: "privacy",
    schemaTypes: ["BreadcrumbList"],
    requiresRegistration: true,
  },
  {
    id: "cookies",
    family: "legal",
    leafSlugs: leaves("cookies", "cookies", "cookies"),
    siteLinkId: "cookies",
    schemaTypes: ["BreadcrumbList"],
    requiresRegistration: false,
  },
  {
    id: "cancellation",
    family: "legal",
    leafSlugs: leaves("cancellation", "widerruf", "odstapienie-od-umowy"),
    siteLinkId: "withdrawal-and-refunds",
    schemaTypes: ["BreadcrumbList"],
    requiresRegistration: false,
  },
];

/** Parsed at module load: a malformed registry throws on first import, never at request time. */
export const INFO_PAGES: readonly InfoPageEntry[] =
  InfoPageRegistrySchema.parse(infoPages);

const byId = new Map<string, InfoPageEntry>(
  INFO_PAGES.map((entry) => [entry.id, entry]),
);

/** One page's row. Total over `InfoPageId`: the registry refinement guarantees every id. */
export function infoPage(id: InfoPageId): InfoPageEntry {
  const entry = byId.get(id);
  if (entry === undefined) throw new Error(`no info page row for \`${id}\``);
  return entry;
}

/** The trust family, in registry order. */
export const TRUST_PAGE_IDS = INFO_PAGES.filter(
  (entry) => entry.family === "trust",
).map((entry) => entry.id);

/**
 * Where the page lives below `/{locale}`: the `PATH_SEGMENT_KEYS` key of a top-level page, or the
 * `legal` key and the leaf slug of a legal document. `localePath()` composes it (spec 041 §6).
 */
export function infoPageLocation(
  id: InfoPageId,
  locale: string,
):
  | { readonly segmentKey: PathSegmentKey; readonly leaf?: undefined }
  | { readonly segmentKey: "legal"; readonly leaf: string } {
  const entry = infoPage(id);
  if (entry.segmentKey !== undefined) return { segmentKey: entry.segmentKey };
  const leaf = entry.leafSlugs?.[locale];
  if (leaf === undefined) {
    throw new Error(`info page \`${id}\` has no leaf slug in \`${locale}\``);
  }
  return { segmentKey: "legal", leaf };
}
