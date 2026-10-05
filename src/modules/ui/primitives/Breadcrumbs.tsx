/**
 * `Breadcrumbs` — where you are, in links (components sheet v2 "Breadcrumbs"; spec 007 §2, spec
 * 008 §2; TASK-175).
 *
 * An ordered list inside a labelled `<nav>`: 15 px subtle ink, a hairline-coloured `/` between
 * crumbs (hidden from assistive technology), links in `ink-2` underlined at 4 px, the current page
 * in ink with `aria-current="page"`. A crumb whose page does not exist is **text**, never a
 * disabled link (spec 004 AC-14). The callers (`ListingBreadcrumb`, `CorridorBreadcrumb`) resolve
 * labels and hrefs from their view models; this only draws them.
 *
 * **The phone back link** (spec 004 §14 A24 clause 4 (e), AC-50 and AC-32's phone half; TASK-195).
 * Below `md` the trail gives way to one `‹ Parent` link: the trail's last ancestor, its `href`
 * and its label, with the chevron drawn as `chevron-end` turned to face the start (`-scale-x-100`)
 * so `mirror-in-rtl` turns it back under `dir="rtl"` (the icon carries the mirroring, not a
 * character in copy). Exactly one of the two is displayed at a width; the other is
 * `display: none`, out of the accessibility tree. **The trail stays in the server HTML at every
 * width**, so `BreadcrumbList`, built from the same crumbs, equals it item for item (spec 007
 * AC-15, spec 008 AC-17, spec 041 AC-19). The product page passes `phone="trail"`: no back link,
 * and its trail stays displayed on the phone (TASK-197 places it below the buy section). A trail
 * whose last ancestor has no page draws no back link either (it would be a link to nothing), and
 * keeps its trail on the phone.
 */
import type { ReactElement, ReactNode } from "react";

import { Icon } from "../icons/Icon.tsx";

export interface Crumb {
  /** Stable React key (the crumb's message key). */
  readonly key: string;
  readonly label: ReactNode;
  /** Absent when the crumb's page does not exist yet: rendered as text. */
  readonly href?: string | undefined;
  readonly current?: boolean;
}

/**
 * The one place the breadcrumb's distance from the sticky header is decided (spec 004 §14 A23
 * clause 3, AC-32): its top edge sits `--space-md2`, 20 px, under the header's bottom edge on every
 * page, so no page sets a margin above it. A margin rather than a padding, because AC-32 measures
 * the trail's own box. Below `md`, where the back link stands in for the trail, the box sits 14 px
 * under the header (the phone artboards' `padding-block-start`; A24 clause 4 (e)).
 */
const BREADCRUMB_OFFSET = "mt-(--space-md2)";
const BACK_LINK_OFFSET = "mt-[14px] md:mt-(--space-md2)";

/**
 * What the breadcrumb displays below `md` (A24 clause 4 (e)): the back link on every page type but
 * the product page, which keeps its trail.
 */
export type BreadcrumbsPhone = "back" | "trail";

/**
 * The trail's last ancestor: the crumb before the current page (or the last crumb, for a trail
 * with no current entry). The back link names it and links to it.
 */
export function breadcrumbAncestor(
  crumbs: readonly Crumb[],
): Crumb | undefined {
  const ancestors = crumbs.filter((crumb) => crumb.current !== true);
  return ancestors.at(-1);
}

export interface BreadcrumbsProps {
  readonly crumbs: readonly Crumb[];
  /** The `<nav>`'s accessible name, from the message catalogue (`a11y.breadcrumb`). */
  readonly label: string;
  readonly className?: string;
  /** Below `md`: the back link (default) or the trail (the product page). */
  readonly phone?: BreadcrumbsPhone;
}

export function Breadcrumbs({
  crumbs,
  label,
  className,
  phone = "back",
}: BreadcrumbsProps): ReactElement {
  const ancestor = breadcrumbAncestor(crumbs);
  const back =
    phone === "back" && ancestor?.href !== undefined ? ancestor : undefined;
  return (
    <nav
      aria-label={label}
      className={[back ? BACK_LINK_OFFSET : BREADCRUMB_OFFSET, className]
        .filter(Boolean)
        .join(" ")}
      data-fo-breadcrumb
      data-fo-breadcrumb-phone={back ? "back" : "trail"}
    >
      <ol
        className={`text-ink-subtle m-0 flex list-none flex-wrap items-center gap-[6px] p-0 text-sm ${back ? "max-md:hidden" : ""}`.trim()}
        data-fo-breadcrumb-trail
      >
        {crumbs.map((crumb, index) => (
          <li className="flex items-center gap-[6px]" key={crumb.key}>
            {index === 0 ? null : (
              <span aria-hidden="true" className="text-rule">
                {"/"}
              </span>
            )}
            {crumb.current === true || crumb.href === undefined ? (
              <span
                {...(crumb.current === true
                  ? { "aria-current": "page" as const }
                  : {})}
                className={crumb.current === true ? "text-ink" : undefined}
              >
                {crumb.label}
              </span>
            ) : (
              /* At least 24 px tall: every link in `<main>` clears WCAG 2.2's 24 × 24 target
                 (spec 004 §14 A23 clause 9, AC-43); the text alone is 21 px. */
              <a
                className="text-ink-muted hover:text-link-strong inline-flex min-h-[24px] items-center underline underline-offset-4"
                href={crumb.href}
              >
                {crumb.label}
              </a>
            )}
          </li>
        ))}
      </ol>
      {back ? (
        <a
          className="text-ink-muted hover:text-link-strong inline-flex min-h-(--target-min) items-center gap-[4px] text-sm md:hidden"
          data-fo-back-link
          href={back.href}
        >
          <Icon className="-scale-x-100" name="chevron-end" size={16} />
          {back.label}
        </a>
      ) : null}
    </nav>
  );
}
