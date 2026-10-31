/**
 * `Breadcrumbs` — where you are, in links (components sheet v2 "Breadcrumbs"; spec 007 §2, spec
 * 008 §2; TASK-175).
 *
 * An ordered list inside a labelled `<nav>`: 15 px subtle ink, a hairline-coloured `/` after each
 * crumb but the last (hidden from assistive technology; `CRUMB`), links in `ink-2` underlined at 4 px, the current page
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
 * and its trail stays displayed on the phone (TASK-197 places it below the buy section). The back
 * link goes to the last ancestor **with a page**; only a trail with no linked ancestor at all keeps
 * its trail on the phone.
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
 * The country listings' quiet trail (spec 043 §14 A-founder-2026-10-22 item 1, revised
 * 2026-10-24; `.lh-crumbs`): 16 px under the header from `md` up (14 below), `--text-fine` in
 * `--color-ink-3`, no underline at rest and one under the hovered or focused crumb, the current
 * crumb in ink-2, the separator in `--color-border-strong`; below `md` the parent crumb only, as a
 * back link at `--text-fine`.
 *
 * - The trail is one 20 px line, as drawn: each link keeps its 24 px target (WCAG 2.2 SC 2.5.8)
 *   and gives 2 px back on each side, so the target overlaps the line's leading.
 * - The artboards draw the back link in a 32 px row; spec 004 AC-50 wants its box 44 px tall. The
 *   box is 44 px from the same top edge, its label centred in the upper 32 px, and its lower 12 px
 *   lie over the H1's top margin and leading (`-mb-[12px]`, raised with `z-[1]` so that strip
 *   still takes the tap): the page reads as drawn and the target is the full 44 px.
 */
const QUIET = {
  offset: "mt-[14px] md:mt-[16px]",
  trail: "text-ink-subtle text-fine leading-[20px]",
  crumb:
    "flex items-center gap-[6px] after:text-border-strong after:content-['/'_/_''] last:after:content-none",
  link: "text-ink-subtle hover:text-ink focus-visible:text-ink -my-[2px] inline-flex min-h-[24px] items-center no-underline underline-offset-4 hover:underline focus-visible:underline",
  current: "text-ink-muted",
  back: "text-ink-subtle hover:text-ink relative z-[1] -mb-[12px] flex w-fit min-h-(--target-min) items-center gap-[6px] pb-[12px] text-fine md:hidden",
} as const;

/**
 * One crumb and the separator that **follows** it (TASK-249, QA Q1-22). The `/` closes the crumb
 * before it rather than opening the one after it, so where the trail wraps the separator ends a
 * line and never starts one: no line can read "/ Amber Hour". `li` is a flex row without wrap, so
 * the separator cannot part from its crumb; the `ol` wraps only between `li`s. Drawn as generated
 * content with empty alternative text (`content: "/" / ""`): a character in the flow, not a
 * chevron that must mirror in RTL, and silent to assistive technology, as the `aria-hidden` span it
 * replaces was. Not in `textContent` either, so every `<li>` holds its crumb's label and nothing
 * else (the `BreadcrumbList` equality tests read it). The last crumb draws none. On one line the
 * pixels are the old ones: 6 px from the crumb inside the `li`, 6 px to the next across the `ol`.
 */
const CRUMB =
  "flex items-center gap-[6px] after:text-rule after:content-['/'_/_''] last:after:content-none";

/**
 * What the breadcrumb displays below `md` (A24 clause 4 (e)): the back link on every page type but
 * the product page, which keeps its trail.
 */
export type BreadcrumbsPhone = "back" | "trail";

/**
 * The trail's last ancestor **that has a page**: the nearest crumb above the current page with an
 * `href`. A text crumb (a level with no page, like the category hub's "Flowers") is passed over,
 * so the back link always goes somewhere real (review ruling, PR 208: the category hub shows
 * `‹ Home`). The back link names it and links to it.
 */
export function breadcrumbAncestor(
  crumbs: readonly Crumb[],
): Crumb | undefined {
  return crumbs
    .filter((crumb) => crumb.current !== true && crumb.href !== undefined)
    .at(-1);
}

export interface BreadcrumbsProps {
  readonly crumbs: readonly Crumb[];
  /** The `<nav>`'s accessible name, from the message catalogue (`a11y.breadcrumb`). */
  readonly label: string;
  readonly className?: string;
  /** Below `md`: the back link (default) or the trail (the product page). */
  readonly phone?: BreadcrumbsPhone;
  /** `quiet`: the country listings' head (spec 043 item 1). */
  readonly tone?: "default" | "quiet";
}

export function Breadcrumbs({
  crumbs,
  label,
  className,
  phone = "back",
  tone = "default",
}: BreadcrumbsProps): ReactElement {
  const quiet = tone === "quiet";
  const ancestor = breadcrumbAncestor(crumbs);
  const back =
    phone === "back" && ancestor?.href !== undefined ? ancestor : undefined;
  return (
    <nav
      aria-label={label}
      className={[
        quiet ? QUIET.offset : back ? BACK_LINK_OFFSET : BREADCRUMB_OFFSET,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-fo-breadcrumb
      data-fo-breadcrumb-phone={back ? "back" : "trail"}
    >
      <ol
        className={`${quiet ? QUIET.trail : "text-ink-subtle text-sm"} m-0 flex list-none flex-wrap items-center gap-[6px] p-0 ${back ? "max-md:hidden" : ""}`.trim()}
        data-fo-breadcrumb-trail
      >
        {crumbs.map((crumb) => (
          <li className={quiet ? QUIET.crumb : CRUMB} key={crumb.key}>
            {crumb.current === true || crumb.href === undefined ? (
              <span
                {...(crumb.current === true
                  ? { "aria-current": "page" as const }
                  : {})}
                className={
                  crumb.current === true
                    ? quiet
                      ? QUIET.current
                      : "text-ink"
                    : undefined
                }
              >
                {crumb.label}
              </span>
            ) : (
              /* At least 24 px tall: every link in `<main>` clears WCAG 2.2's 24 × 24 target
                 (spec 004 §14 A23 clause 9, AC-43); the text alone is 21 px. */
              <a
                className={
                  quiet
                    ? QUIET.link
                    : "text-ink-muted hover:text-link-strong inline-flex min-h-[24px] items-center underline underline-offset-4"
                }
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
          className={
            quiet
              ? QUIET.back
              : "text-ink-muted hover:text-link-strong inline-flex min-h-(--target-min) items-center gap-[4px] text-sm md:hidden"
          }
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
