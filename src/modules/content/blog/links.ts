/**
 * Where a blog reference resolves, and what the rules read from the site (spec 044 §2.3, §5.2;
 * TASK-321).
 *
 * Each slice A kind resolves through its own existence predicate and path builder, never a URL
 * typed into a post: `corridor/<iso2>` through spec 007's `corridorLinkHref()`, the two hub kinds
 * through spec 008's `listingExists()` and `listingPath()`, `info/<id>` through spec 041's
 * `infoPageExists()` and `infoPagePath()`, and `post/<id>` through the blog provider. A target
 * that does not exist in the locale now resolves to `null`, so its anchor renders as text.
 */
import { listingExists, slugFor } from "@/modules/catalog";
import {
  corridorContentView,
  corridorLinkHref,
  corridorState,
} from "@/modules/geo";
import { listingPath } from "@/modules/i18n";
import { isCountryIso2 } from "@/config/countries";
import { isLocaleCode } from "@/config/locales";

import { infoPageExists, infoPagePath } from "../pages.ts";
import type { BlogLinkTargets } from "./markdown.ts";
import { blogBodyRefs, type BlogRuleContext } from "./rules/index.ts";
import { BlogLinkRefSchema, type BlogLinkRef } from "./schemas.ts";

/** The path of a post in a locale, or `null` while it does not exist there (the provider's). */
export type BlogPostPathOf = (
  postId: string,
  locale: string,
) => Promise<string | null>;

async function hubPath(
  kind: "occasion" | "category",
  key: string,
  locale: string,
): Promise<string | null> {
  if (!isLocaleCode(locale)) return null;
  const pageType = kind === "occasion" ? "occasionHub" : "categoryHub";
  if (!(await listingExists({ pageType, locale, entityKey: key }))) return null;
  const slug = slugFor(kind, key, locale);
  return slug === undefined ? null : listingPath(locale, { pageType, slug });
}

/** The site's link targets for blog references (`postPath`: the blog provider's). */
export function siteBlogLinkTargets(postPath: BlogPostPathOf): BlogLinkTargets {
  return {
    async pathOf(ref: BlogLinkRef, locale: string): Promise<string | null> {
      switch (ref.kind) {
        case "corridor":
          return isCountryIso2(ref.id)
            ? (corridorLinkHref(ref.id, locale) ?? null)
            : null;
        case "occasion-hub":
          return hubPath("occasion", ref.id, locale);
        case "category-hub":
          return hubPath("category", ref.id, locale);
        case "info":
          return infoPageExists(ref.id, locale)
            ? infoPagePath(ref.id, locale)
            : null;
        case "post":
          return postPath(ref.id, locale);
      }
    },
  };
}

/** The guide text of a corridor page in a locale, where one exists (rule 3, advisor fix 3). */
export function guideTextIn(iso2: string, locale: string): string | undefined {
  if (!isCountryIso2(iso2)) return undefined;
  if (corridorLinkHref(iso2, locale) === undefined) return undefined;
  return corridorContentView(iso2, locale, corridorState(iso2, locale))?.body;
}

/**
 * The rules' context for one revision: which of its references exist in the post's locale now,
 * the locale's other posts, and the tagged countries' corridor guide text.
 */
export async function blogRuleContextFor(
  input: {
    readonly locale: string;
    readonly countries: readonly string[];
    readonly bodyMd: string;
  },
  targets: BlogLinkTargets,
  otherPosts: BlogRuleContext["otherPosts"],
  guideText: (iso2: string, locale: string) => string | undefined = guideTextIn,
): Promise<BlogRuleContext> {
  const existingRefs = new Set<string>();
  for (const text of blogBodyRefs(input.bodyMd)) {
    const ref = BlogLinkRefSchema.parse(text);
    if ((await targets.pathOf(ref, input.locale)) !== null) {
      existingRefs.add(text);
    }
  }
  const corridorGuides = input.countries.flatMap((iso2) => {
    const text = guideText(iso2, input.locale);
    return text === undefined ? [] : [{ iso2, text }];
  });
  return { existingRefs, otherPosts, corridorGuides };
}
