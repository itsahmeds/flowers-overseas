/**
 * The two accessibility primitives (spec 004 §2 "Layout primitives and chrome", §5.3, AC-5;
 * TASK-045).
 *
 * `VisuallyHidden` is the only sanctioned way to hide text from sight and keep it for a screen
 * reader; `display: none` and `visibility: hidden` remove it from both, and a negative-margin
 * recipe copied per component is how one of them ends up broken. Tailwind's `sr-only` is that
 * recipe, written once, and it is direction-agnostic.
 *
 * `SkipLink` is the first focusable element of every document (WCAG 2.4.1). Spec 003 shipped it as
 * a bare `<a href="#main">` in `[locale]/layout.tsx`; this gives it the **visible focused state**
 * §2 asks for — off-screen until focused, then a paper card with the focus ring at the block start
 * of the page. The target id stays `#main`, so the existing layouts and the a11y suite do not
 * change.
 */
import type { ReactElement, ReactNode } from "react";

export interface VisuallyHiddenProps {
  readonly children: ReactNode;
  /** `span` by default; `div` when the hidden content is block-level (a table caption, a legend). */
  readonly as?: "span" | "div" | "legend" | "h2" | "h3";
  /**
   * Only for a heading that names a landmark: the `aria-labelledby` target. A `<section>` whose
   * only heading is visually hidden — the trust strip of TASK-053, which the artboards draw with
   * no visible heading — still has to be able to point at it.
   */
  readonly id?: string;
}

export function VisuallyHidden({
  children,
  as = "span",
  id,
}: VisuallyHiddenProps): ReactElement {
  const Element = as;
  return (
    <Element className="sr-only" {...(id === undefined ? {} : { id })}>
      {children}
    </Element>
  );
}

export interface SkipLinkProps {
  /** The link text, from the `a11y` namespace. */
  readonly children: ReactNode;
  /** Fragment target. `#main` — every document's `<main id="main">`. */
  readonly href?: string;
}

export function SkipLink({
  children,
  href = "#main",
}: SkipLinkProps): ReactElement {
  return (
    <a
      href={href}
      className="focus-visible:start-md focus-visible:top-md focus-visible:layer-overlay focus-visible:border-border-strong focus-visible:bg-surface focus-visible:px-md focus-visible:text-md focus-visible:text-ink sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:inline-flex focus-visible:min-h-[44px] focus-visible:items-center focus-visible:rounded-sm focus-visible:border"
    >
      {children}
    </a>
  );
}

/**
 * The live-region pattern (spec 003 `/review 23`'s deferred note, closed by TASK-055; spec 004 §2,
 * §8, AC-13; `docs/architecture.md` §2).
 *
 * Spec 003 left one accessibility decision to the design system: *"a permanently mounted
 * `role="status"` region is the reliable live-announcement pattern"*. It is not a preference. A
 * live region that is inserted into the DOM together with its content is announced by some
 * assistive technologies and silently ignored by others, because the accessibility tree has no
 * "before" to compare the change against; a region that is already mounted, and empty, when its
 * content arrives is announced by all of them. Every element of this product whose content appears
 * or changes after the document was painted — the language suggestion, the consent sheet's saved
 * confirmation, and later the price, the date and the delivery cutoff §8 names — mounts the
 * container first and fills it second.
 *
 * The rules, which this component is:
 *
 *  - `role="status"`, not `aria-live` on an ad-hoc `<div>`: the implicit politeness is `polite`
 *    and the implicit `aria-atomic` is `true`, so the whole message is read rather than the words
 *    that happened to change. Both are written out anyway, because an explicit contract survives a
 *    refactor that a default does not.
 *  - **Permanently mounted**, which is the caller's part of the bargain: render `<LiveRegion>`
 *    unconditionally and put the *content* behind the condition, never the region.
 *  - **Reserves no space**: the element is empty until it is not, and a positioned caller (an
 *    overlay) styles it with the layer utilities rather than a raw `z-index`.
 *  - It **never takes focus** and it is not a `dialog`: an announcement interrupts nothing (WCAG
 *    4.1.3, 2.2.2).
 *
 * The language-suggestion banner is the pattern's reference implementation and cannot import this
 * component — it lives in `src/modules/i18n` and is a Client Component, so the cross-module import
 * would have to go through this module's public barrel, which re-exports the design system's
 * islands and would put all of them in the banner's chunk (spec 004 §14 A1; the same measurement
 * that made `(chooser)/layout.tsx` deep-import `@/modules/ui/fonts`). It renders the same three
 * attributes instead, and `tests/unit/i18n-suggestion-banner.test.tsx` asserts them against what
 * this component renders, so "the same pattern" is a test rather than a claim.
 */
export interface LiveRegionProps {
  /** The announcement, or nothing at all. The region itself is always rendered. */
  readonly children?: ReactNode;
  readonly className?: string;
  /**
   * The `data-*` hook a test or a sibling selects the region by, so nothing selects on copy.
   * Values are kebab-case names of what the region is for (`locale-suggestion`).
   */
  readonly name: string;
}

export function LiveRegion({
  children,
  className,
  name,
}: LiveRegionProps): ReactElement {
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={className}
      data-fo-live-region={name}
      role="status"
    >
      {children}
    </div>
  );
}
