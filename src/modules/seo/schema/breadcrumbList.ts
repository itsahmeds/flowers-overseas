/**
 * `BreadcrumbList`, built from the **same crumb array the page renders** (spec 007 §2 "Schema",
 * §5.2 L65, AC-15; T-16; `plan/02` §9; TASK-093).
 *
 * The corridor page and the all-destinations hub both carry `breadcrumb: readonly CorridorCrumb[]`
 * in their view model, `CorridorBreadcrumb` renders exactly that array, and this builder consumes
 * exactly that array. There is therefore no second description of the trail anywhere — which is
 * what AC-15 means by "items equal to the visible breadcrumb in order and label", and why
 * `tests/unit/seo-schema.test.tsx` asserts it against the *rendered* `<li>`s rather than against a
 * hand-written expectation.
 *
 * Two deliberate properties:
 *
 *  - **A crumb that is not a link announces no `item`.** Two crumbs render as text rather than as
 *    an anchor: the leaf, which carries `aria-current="page"` and is never a link, and (before
 *    TASK-092 published the hub) any crumb whose target is unpublished, because linking it would be
 *    a link to a 404. Structured data that named a URL the page refuses to link would be the same
 *    claim by another route, so `item` is emitted exactly where the trail renders an `<a href>` —
 *    which is also what Google asks for, the final item's URL being optional.
 *  - **A trail of fewer than two crumbs emits nothing.** One item is not a trail: it would tell a
 *    crawler the page's parent is itself.
 *
 * The label is resolved by the caller — the page passes the very translator its components use, so
 * the JSON-LD label and the visible label come from one message key and one catalogue (`CLAUDE.md`:
 * no literal user-facing strings; spec 007 §7: country names come from `nameKey`). An empty label
 * is refused rather than emitted: a `ListItem` with no name is a silent defect in a prerendered
 * route, and a throw is a build failure where a wrong trail should be caught (the `canonicalFor()`
 * precedent).
 */
import { absoluteUrl, type CanonicalOptions } from "../canonical.ts";

import type { JsonLdNode } from "./JsonLd.tsx";

/** One crumb of the visible trail: the view model's shape, structurally (`CorridorCrumb`). */
export interface BreadcrumbCrumb {
  /** The message key the visible label is rendered from — never a literal. */
  readonly labelKey: string;
  /** The path the crumb links to, or `undefined` when it renders as text. */
  readonly href: string | undefined;
  /** The page itself: rendered with `aria-current="page"` and never as a link. */
  readonly current: boolean;
}

/** Resolves a dotted registry/message key to the label the page shows. */
export type BreadcrumbLabel = (key: string) => string;

/** The smallest trail worth announcing: a parent and the page itself. */
export const BREADCRUMB_MIN_ITEMS = 2;

export function breadcrumbList(
  crumbs: readonly BreadcrumbCrumb[],
  label: BreadcrumbLabel,
  options: CanonicalOptions,
): JsonLdNode | undefined {
  if (crumbs.length < BREADCRUMB_MIN_ITEMS) return undefined;

  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => {
      const name = label(crumb.labelKey);
      if (name.trim() === "") {
        throw new TypeError(
          `breadcrumb label for \`${crumb.labelKey}\` resolved to nothing: a ListItem without a name claims a trail the page does not show (spec 007 AC-15)`,
        );
      }
      return {
        "@type": "ListItem",
        position: index + 1,
        name,
        ...(crumb.href === undefined || crumb.current
          ? {}
          : { item: absoluteUrl(crumb.href, options) }),
      };
    }),
  };
}
