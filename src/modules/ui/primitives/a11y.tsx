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
  readonly as?: "span" | "div" | "legend" | "h2";
}

export function VisuallyHidden({
  children,
  as = "span",
}: VisuallyHiddenProps): ReactElement {
  const Element = as;
  return <Element className="sr-only">{children}</Element>;
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
