/**
 * Page-metadata helpers (spec 007 §2, §6, AC-9 / AC-10; TASK-090, composed by TASK-091/092).
 *
 * The rule engine decides; this file is the only place that turns a decision into the `Metadata`
 * object a route exports, so a page cannot print a directive the engine did not produce or a
 * canonical the builder did not build.
 *
 * `robotsMeta()` returns the directive **string** rather than Next's `{ index, follow }` object on
 * purpose: Next renders the object as `noindex, follow` (with a space) and the string verbatim, and
 * spec 007 AC-9 asserts the rendered `<meta name="robots">` against the same literal the engine,
 * the sitemap and the e2e header assertion use. One literal, no serialisation to reason about.
 *
 * `pageMetadata()` composes the four things every localised page of spec 007 needs and nothing
 * else: title, description, the robots directive and the self-referencing canonical (emitted on
 * `noindex` pages **unchanged** — AC-10; a canonical answers "which of these duplicate URLs is the
 * original", a question a `noindex` page still has). The hreflang cluster is optional here and is
 * owned by AC-11 (TASK-091/094 pass `alternatesFor()`'s output through `hreflangLanguages()`), so
 * this helper can never invent an alternate.
 *
 * Titles and descriptions are **not** truncated: `seoTitle` ≤60 and `seoDescription` ≤155 are
 * enforced at authoring time by `pnpm corridor:check` (spec 007 AC-2), where the author can fix the
 * copy. Silently cutting a title here would hide a content failure behind an ellipsis. What the
 * helper does refuse is an empty pair: a document with no title is a WCAG 2.4.2 failure, and a
 * prerender-time throw is where that must surface.
 */
import type { Metadata } from "next";

import type { HreflangAlternate } from "../i18n/index.ts";

import type { RobotsDirective } from "./indexability.ts";

/** The authoring limits `corridor:check` enforces, exported so one number defines each (AC-2). */
export const SEO_TITLE_MAX_LENGTH = 60;
export const SEO_DESCRIPTION_MAX_LENGTH = 155;

/** The `<meta name="robots">` content for a directive. See the header on the string form. */
export function robotsMeta(directive: RobotsDirective): Metadata["robots"] {
  return directive;
}

/**
 * `alternatesFor()`'s output as Next's `alternates.languages` record. Later entries for the same
 * `hreflang` value would overwrite earlier ones; the cluster never contains a duplicate value
 * (spec 003 §6), and a test pins that this helper preserves every entry it is given.
 */
export function hreflangLanguages(
  alternates: readonly HreflangAlternate[],
): Record<string, string> {
  return Object.fromEntries(
    alternates.map((alternate) => [alternate.hreflang, alternate.href]),
  );
}

export interface PageMetadataInput {
  /** Localised `<title>`, from a `meta.*` message key or an authored `seoTitle`. */
  readonly title: string;
  /** Localised `<meta name="description">`. */
  readonly description: string;
  /** The engine's answer for this page (`indexability()` / `pageIndexability()`). */
  readonly directive: RobotsDirective;
  /** The self-referencing canonical from `canonicalFor()` — emitted whatever the directive. */
  readonly canonical: string;
  /** The page's hreflang cluster, when it has one (AC-11). Omitted ⇒ no `languages` key. */
  readonly alternates?: readonly HreflangAlternate[];
}

/** The `Metadata` fragment a spec 007 route exports. */
export function pageMetadata({
  title,
  description,
  directive,
  canonical,
  alternates,
}: PageMetadataInput): Metadata {
  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  if (trimmedTitle === "" || trimmedDescription === "") {
    throw new TypeError(
      "a page needs a non-empty title and description (WCAG 2.4.2; spec 007 §6)",
    );
  }
  return {
    title: trimmedTitle,
    description: trimmedDescription,
    robots: robotsMeta(directive),
    alternates: {
      canonical,
      ...(alternates === undefined
        ? {}
        : { languages: hreflangLanguages(alternates) }),
    },
  };
}
