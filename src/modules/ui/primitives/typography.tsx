/**
 * Type primitives (spec 004 §2 "Tokens" type scale, §14 A21 clause 3; typography sheet v2;
 * TASK-045, TASK-175).
 *
 * `Display` (Fraunces roman 400, the `display` utility, for headings — an `<em>` inside one is the
 * single Fraunces 300 italic poppy phrase a heading may carry), `Text` (Alegreya Sans), `Label`
 * (the printed-label voice: 13 px, 700, tracked, uppercase, subtle ink) and `Eyebrow` (the same
 * voice in cornflower, over a section).
 *
 * **The v2 ramp.** Every display size names a step of the typography sheet and renders its
 * `-fluid` `clamp()` between the 390 and the 1440 artboards, with the step's line height and
 * tracking carried by the token (`--text-*-fluid--line-height`). The sizes v1 call sites already
 * use keep their names and move to the nearest v2 step, so every existing page picks up the ramp
 * without a call-site edit: `display` → the listing H1 (84/42), `display-s` → the home section H2
 * (54/32), `2xl` → the page section H2 (44/30), `xl` → legends and promise titles (23), `lg` →
 * card names (21/18). `hero` (90/50) and `title` (68/44) are the home and product H1s.
 *
 * **Optical size.** One roman file ships, pinned at `opsz` 144 (A21 clause 3; the sheet's rule for
 * a single instance: "it pins 144 for the H1 steps and the H2 and smaller steps take the nearest
 * value it can ship"). So no step sets `font-variation-settings`: there is no axis left to set.
 *
 * `level` and `size` are separate on purpose: a document's heading *level* is a structure decision
 * (one `<h1>`, no skipped levels — §5.3) and its *size* is a design decision.
 */
import type { ReactElement, ReactNode } from "react";

import { Icon } from "../icons/Icon.tsx";

export const DISPLAY_SIZES = [
  "hero",
  "display",
  "title",
  "display-s",
  "2xl",
  "xl",
  "lg",
] as const;
export type DisplaySize = (typeof DISPLAY_SIZES)[number];

const DISPLAY_SIZE_CLASS: Readonly<Record<DisplaySize, string>> = {
  hero: "text-hero-fluid",
  display: "text-display-fluid",
  title: "text-title-fluid",
  "display-s": "text-3xl-fluid",
  "2xl": "text-2xl-fluid",
  xl: "text-md",
  lg: "text-h3-s md:text-h3",
};

export interface DisplayProps {
  readonly children: ReactNode;
  readonly size?: DisplaySize;
  /** Heading level, or `p`/`span` for a big line that is not a heading. */
  readonly as?: "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div";
  readonly className?: string;
  readonly id?: string;
}

/** The `display` voice: Fraunces roman 400 at a step of the v2 ramp. */
export function Display({
  children,
  size = "display-s",
  as = "h2",
  className,
  id,
}: DisplayProps): ReactElement {
  const Element = as;
  return (
    <Element
      id={id}
      className={["display", DISPLAY_SIZE_CLASS[size], className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Element>
  );
}

export const TEXT_SIZES = ["lg", "md", "sm", "xs"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_TONES = [
  "default",
  "muted",
  "subtle",
  "accent",
  "danger",
  "inverse",
] as const;
export type TextTone = (typeof TEXT_TONES)[number];

/**
 * `lg` is the lede (18 → 21 px), `md` running text (17 px at 390, 18 px from `md` up), `sm` notes
 * and breadcrumbs (15), `xs` the smallest text the sheet sets (13).
 */
const TEXT_SIZE_CLASS: Readonly<Record<TextSize, string>> = {
  lg: "text-lede-fluid",
  md: "text-body-s md:text-body",
  sm: "text-sm",
  xs: "text-xs",
};

const TEXT_TONE_CLASS: Readonly<Record<TextTone, string>> = {
  default: "text-ink",
  muted: "text-ink-muted",
  subtle: "text-ink-subtle",
  accent: "text-accent",
  danger: "text-danger",
  inverse: "text-on-inverse",
};

export interface TextProps {
  readonly children: ReactNode;
  readonly size?: TextSize;
  readonly tone?: TextTone;
  readonly as?: "p" | "span" | "div" | "li" | "dd" | "dt" | "strong" | "small";
  /** Constrain to `--measure` so a paragraph never runs the full page width. */
  readonly measure?: boolean;
  readonly className?: string;
  readonly id?: string;
}

export function Text({
  children,
  size = "md",
  tone = "default",
  as = "p",
  measure = false,
  className,
  id,
}: TextProps): ReactElement {
  const Element = as;
  return (
    <Element
      id={id}
      className={[
        TEXT_SIZE_CLASS[size],
        TEXT_TONE_CLASS[tone],
        measure ? "max-w-prose" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Element>
  );
}

export interface LabelTextProps {
  readonly children: ReactNode;
  readonly as?: "span" | "div" | "p" | "h2" | "h3" | "dt" | "legend" | "label";
  /** Only with `as="label"`: the id of the control this labels. */
  readonly htmlFor?: string;
  readonly className?: string;
  readonly id?: string;
}

/**
 * The `label` voice: a field's label, a facts list's term, a day name.
 * Uppercased by CSS rather than in the catalogue, so the German and Polish strings stay
 * capitalised correctly in the source and no translator has to type in caps (`plan/03` §5).
 */
export function Label({
  children,
  as = "span",
  htmlFor,
  className,
  id,
}: LabelTextProps): ReactElement {
  const Element = as;
  return (
    <Element
      id={id}
      className={["label", className].filter(Boolean).join(" ")}
      {...(as === "label" && htmlFor !== undefined ? { htmlFor } : {})}
    >
      {children}
    </Element>
  );
}

export interface EyebrowProps {
  readonly children: ReactNode;
  readonly as?: "p" | "span" | "div";
  readonly className?: string;
  readonly id?: string;
}

/**
 * The eyebrow over a section heading: the label voice in cornflower (`--color-eyebrow`). Not a
 * heading — the section's `Display` is — so it is a paragraph by default.
 */
export function Eyebrow({
  children,
  as = "p",
  className,
  id,
}: EyebrowProps): ReactElement {
  const Element = as;
  return (
    <Element
      id={id}
      className={["eyebrow m-0", className].filter(Boolean).join(" ")}
    >
      {children}
    </Element>
  );
}

export const TEXT_LINK_VARIANTS = ["standalone", "inline"] as const;
export type TextLinkVariant = (typeof TEXT_LINK_VARIANTS)[number];

export interface TextLinkProps {
  readonly children: ReactNode;
  readonly href: string;
  /**
   * `standalone`: cornflower 700, a 1.5 px underline 5 px down ("See every bouquet for Poland").
   * `inline`: cornflower 400 underlined at 4 px, inside running text.
   */
  readonly variant?: TextLinkVariant;
  /** Adds the trailing arrow, which flips under `dir="rtl"`. */
  readonly arrow?: boolean;
  readonly className?: string;
  readonly "aria-current"?: "page" | undefined;
}

/** "Cornflower means you can go there" (components sheet v2 "Links"). */
export function TextLink({
  children,
  href,
  variant = "standalone",
  arrow = false,
  className,
  ...aria
}: TextLinkProps): ReactElement {
  return (
    <a
      href={href}
      className={[
        variant === "standalone" ? "link" : "link-inline",
        arrow ? "gap-xs inline-flex items-center" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...aria}
    >
      {children}
      {arrow ? <Icon name="arrow-end" size={16} /> : null}
    </a>
  );
}
