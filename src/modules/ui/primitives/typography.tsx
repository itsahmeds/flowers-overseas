/**
 * Type primitives (spec 004 §2 "Tokens" type scale, TASK-045).
 *
 * Four components cover every piece of text in the design: `Display` (Newsreader, the canvas's
 * `.display` utility, for headings), `Text` (IBM Plex Sans body copy at four sizes) and `Label`
 * (the canvas's `.label` voice — 11 px, 600, tracked, uppercase, subtle ink — which is the visual
 * signature of the whole design and appears above every section — and, with `as="label"`, is also the `<label>` of a field, because
 * that is what the canvas draws).
 *
 * `level` and `size` are separate on purpose: a document's heading *level* is a structure decision
 * (one `<h1>`, no skipped levels — §5.3) and its *size* is a design decision, and conflating them
 * is how a page ends up with three `<h1>`s because the designer wanted three big lines.
 */
import type { ReactElement, ReactNode } from "react";

export const DISPLAY_SIZES = [
  "display",
  "display-s",
  "2xl",
  "xl",
  "lg",
] as const;
export type DisplaySize = (typeof DISPLAY_SIZES)[number];

const DISPLAY_SIZE_CLASS: Readonly<Record<DisplaySize, string>> = {
  display: "text-display",
  "display-s": "text-display-s",
  "2xl": "text-2xl",
  xl: "text-xl",
  lg: "text-lg",
};

export interface DisplayProps {
  readonly children: ReactNode;
  readonly size?: DisplaySize;
  /** Heading level, or `p`/`span` for a big line that is not a heading. */
  readonly as?: "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div";
  readonly className?: string;
  readonly id?: string;
}

/** The canvas's `.display` voice: Newsreader 500, tight tracking. */
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

const TEXT_SIZE_CLASS: Readonly<Record<TextSize, string>> = {
  lg: "text-lg",
  md: "text-md",
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
 * The canvas's `.label`: the printed-label voice above a section, on a chip and over a photo.
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
