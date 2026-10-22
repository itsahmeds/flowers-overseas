/**
 * `WebPage` (spec 011 §6 "Structured data", AC-6; `plan/02` §9: "For florists: WebPage +
 * FAQPage. Not JobPosting"; TASK-210).
 *
 * The page's own name and description (its `seoTitle` and `seoDescription`), its canonical URL
 * and its language: what the `<head>` already says, as data. Never `JobPosting`, `LocalBusiness`,
 * `FloristShop`, `Offer`, `Product`, `AggregateRating`, `Review` or `HowTo` (AC-6).
 */
import { absoluteUrl, type CanonicalOptions } from "../canonical.ts";

import type { JsonLdNode } from "./JsonLd.tsx";

export function webPage(
  page: {
    readonly name: string;
    readonly description: string;
    readonly path: string;
    readonly inLanguage: string;
  },
  options: CanonicalOptions,
): JsonLdNode {
  return {
    "@type": "WebPage",
    name: page.name,
    description: page.description,
    url: absoluteUrl(page.path, options),
    inLanguage: page.inLanguage,
  };
}
