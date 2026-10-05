/**
 * `Breadcrumbs` — where you are, in links (components sheet v2 "Breadcrumbs"; spec 007 §2, spec
 * 008 §2; TASK-175).
 *
 * An ordered list inside a labelled `<nav>`: 15 px subtle ink, a hairline-coloured `/` between
 * crumbs (hidden from assistive technology), links in `ink-2` underlined at 4 px, the current page
 * in ink with `aria-current="page"`. A crumb whose page does not exist is **text**, never a
 * disabled link (spec 004 AC-14). The callers (`ListingBreadcrumb`, `CorridorBreadcrumb`) resolve
 * labels and hrefs from their view models; this only draws them.
 */
import type { ReactElement, ReactNode } from "react";

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
 * the trail's own box. Below `md` the phone back link replaces the trail (A24 clause 4 (e), TASK-195).
 */
const BREADCRUMB_OFFSET = "mt-(--space-md2)";

export interface BreadcrumbsProps {
  readonly crumbs: readonly Crumb[];
  /** The `<nav>`'s accessible name, from the message catalogue (`a11y.breadcrumb`). */
  readonly label: string;
  readonly className?: string;
}

export function Breadcrumbs({
  crumbs,
  label,
  className,
}: BreadcrumbsProps): ReactElement {
  return (
    <nav
      aria-label={label}
      className={[BREADCRUMB_OFFSET, className].filter(Boolean).join(" ")}
      data-fo-breadcrumb
    >
      <ol className="text-ink-subtle m-0 flex list-none flex-wrap items-center gap-[6px] p-0 text-sm">
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
    </nav>
  );
}
