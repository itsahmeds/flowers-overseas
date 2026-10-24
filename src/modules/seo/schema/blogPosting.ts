/**
 * `BlogPosting` for a blog post (spec 044 §6 "Schema", AC-11; TASK-322).
 *
 * Built from the page's own view model, field for field, so the markup can only say what the
 * page shows: `headline` is the `<h1>`, `description` the visible excerpt (never the SEO
 * description, which is head-only), `author.name` the visible byline name, `datePublished` and
 * `dateModified` the visible `<time datetime>` values (`dateModified` is the published date when
 * no "Updated" line renders), `inLanguage` the document's `lang`, `mainEntityOfPage` the canonical,
 * `image` the rendered cover's URL only when a cover renders, and `publisher` the Organization by
 * name and logo only. Never `Product`, `Offer`, `Review`, `AggregateRating`, `FAQPage` or
 * `LocalBusiness` (§6): a post carries no commerce.
 */
import type { Company } from "../../../config/company.ts";
import { absoluteUrl, type CanonicalOptions } from "../canonical.ts";

import type { JsonLdNode } from "./JsonLd.tsx";
import { ORGANIZATION_LOGO_PATH } from "./organization.ts";

export interface BlogPostingInput {
  /** The `<h1>` text. */
  readonly headline: string;
  /** The visible excerpt. */
  readonly description: string;
  /** The visible byline name. */
  readonly authorName: string;
  /** The visible "Published" `<time datetime>`. */
  readonly datePublished: string;
  /** The visible "Updated" `<time datetime>`, or the published one when none renders. */
  readonly dateModified: string;
  /** `<html lang>`. */
  readonly inLanguage: string;
  /** The page's absolute canonical. */
  readonly canonical: string;
  /** The rendered cover's absolute URL, only when a cover renders (TASK-324). */
  readonly image?: string | undefined;
}

export function blogPosting(
  input: BlogPostingInput,
  company: Company,
  options: CanonicalOptions,
): JsonLdNode {
  for (const [field, value] of [
    ["headline", input.headline],
    ["description", input.description],
    ["author.name", input.authorName],
  ] as const) {
    if (value.trim() === "") {
      throw new TypeError(
        `BlogPosting.${field} resolved to nothing: the markup would claim text the page does not show (spec 044 AC-11)`,
      );
    }
  }
  return {
    "@type": "BlogPosting",
    headline: input.headline,
    description: input.description,
    author: { "@type": "Person", name: input.authorName },
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    inLanguage: input.inLanguage,
    mainEntityOfPage: input.canonical,
    ...(input.image === undefined ? {} : { image: input.image }),
    publisher: {
      "@type": "Organization",
      name: company.tradingName,
      logo: absoluteUrl(ORGANIZATION_LOGO_PATH, options),
    },
  };
}
