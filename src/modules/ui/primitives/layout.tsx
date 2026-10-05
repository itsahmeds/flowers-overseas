/**
 * Layout primitives (spec 004 §2 "Layout primitives and chrome", §12 task 1/3; TASK-045).
 *
 * "No component ships a bespoke margin: spacing comes from the parent primitive, which is what
 * stops six later specs from inventing six vertical rhythms" (§2). So these five components own
 * every gap, inline padding and max width in the application, they take their values from the
 * canvas spacing scale by name, and they are written in logical properties only — `fo/no-physical-css`
 * has no physical utility to object to because there is none to write (AC-5).
 *
 * `as` lets a caller keep the right landmark or heading level without a wrapper `<div>`: a `Stack`
 * can be the `<main>`, a `Row` can be a `<nav>`. It is deliberately a small union of the elements
 * this design uses rather than `keyof JSX.IntrinsicElements`, so a primitive cannot become a
 * generic element factory.
 */
import type { ReactElement, ReactNode } from "react";

/** The canvas spacing scale, by name (`--spacing-*` in `globals.css`). */
export const GAPS = [
  "none",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
] as const;
export type Gap = (typeof GAPS)[number];

const GAP_CLASS: Readonly<Record<Gap, string>> = {
  none: "gap-0",
  xs: "gap-xs",
  sm: "gap-sm",
  md: "gap-md",
  lg: "gap-lg",
  xl: "gap-xl",
  "2xl": "gap-2xl",
  "3xl": "gap-3xl",
};

const PAD_BLOCK_CLASS: Readonly<Record<Gap, string>> = {
  none: "py-0",
  xs: "py-xs",
  sm: "py-sm",
  md: "py-md",
  lg: "py-lg",
  xl: "py-xl",
  "2xl": "py-2xl",
  "3xl": "py-3xl",
};

type LayoutElement =
  | "div"
  | "section"
  | "article"
  | "aside"
  | "header"
  | "footer"
  | "main"
  | "nav"
  | "ul"
  | "ol"
  | "li"
  | "form"
  | "fieldset"
  | "dl";

interface BaseProps {
  readonly as?: LayoutElement;
  readonly className?: string;
  readonly children?: ReactNode;
  /** Only for a landmark: `<nav>`/`<section>` need an accessible name from the catalogue. */
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
  readonly id?: string;
}

function render(
  as: LayoutElement,
  className: string,
  props: Omit<BaseProps, "as" | "className">,
): ReactElement {
  const Element = as;
  const { children, ...rest } = props;
  return (
    <Element className={className} {...rest}>
      {children}
    </Element>
  );
}

/**
 * The page frame (spec 004 §14 A23 clause 2): a 1,328 px content column (`--container-page`) inside
 * the `--gutter` of 56 px from `md` up and `--gutter-s` of 20 px below it, centred on a screen wider
 * than the 1,440 px artboard. The header, the footer and every page's `Container` use this one
 * string, so the inline-start edge of `<main>`'s content equals the header logo's at every width
 * (x 56 at 1,440, x 20 at 390; AC-31). The max width is the *outer* box (column plus both gutters),
 * which is what makes the column, not the box, 1,328 px wide.
 */
export const PAGE_FRAME =
  "mx-auto w-full max-w-[calc(var(--container-page)+2*var(--gutter))] px-(--gutter-s) md:px-(--gutter)";

/** The three widths this design uses: the full canvas grid, the prose measure, and narrow forms. */
export const CONTAINER_WIDTHS = ["page", "prose", "narrow"] as const;
export type ContainerWidth = (typeof CONTAINER_WIDTHS)[number];

const WIDTH_CLASS: Readonly<Record<ContainerWidth, string>> = {
  // The header's frame: 1,328 px of content inside the gutters.
  page: PAGE_FRAME,
  // `--measure`: the maximum comfortable line length (§2), centred, with the page gutters.
  prose: "mx-auto w-full max-w-prose px-(--gutter-s) md:px-(--gutter)",
  narrow: "mx-auto w-full max-w-[560px] px-(--gutter-s) md:px-(--gutter)",
};

export interface ContainerProps extends BaseProps {
  readonly width?: ContainerWidth;
}

/**
 * The page frame, or a centred measure inside the same gutters. The one place a page width and a
 * page's inline padding are decided: no page sets its own (A23 clause 2).
 */
export function Container({
  width = "page",
  as = "div",
  className,
  ...rest
}: ContainerProps): ReactElement {
  return render(
    as,
    [WIDTH_CLASS[width], className].filter(Boolean).join(" "),
    rest,
  );
}

export interface StackProps extends BaseProps {
  readonly gap?: Gap;
  /** Block padding, for a section that owns its vertical rhythm. */
  readonly padBlock?: Gap;
  readonly align?: "start" | "center" | "end" | "stretch";
}

/** Vertical rhythm from the spacing scale, and the only vertical rhythm there is. */
export function Stack({
  gap = "md",
  padBlock = "none",
  align = "stretch",
  as = "div",
  className,
  ...rest
}: StackProps): ReactElement {
  const alignment = {
    start: "items-start",
    center: "items-center",
    end: "items-end",
    stretch: "items-stretch",
  }[align];
  return render(
    as,
    [
      "flex flex-col",
      GAP_CLASS[gap],
      PAD_BLOCK_CLASS[padBlock],
      alignment,
      className,
    ]
      .filter(Boolean)
      .join(" "),
    rest,
  );
}

export interface RowProps extends BaseProps {
  readonly gap?: Gap;
  readonly align?: "start" | "center" | "end" | "baseline" | "stretch";
  readonly justify?: "start" | "center" | "end" | "between";
  /** `Row` does not wrap; `Cluster` is the wrapping variant. */
  readonly wrap?: boolean;
}

/** Inline arrangement. Uses `justify-start`/`end`, which are writing-mode aware (AC-5). */
export function Row({
  gap = "md",
  align = "center",
  justify = "start",
  wrap = false,
  as = "div",
  className,
  ...rest
}: RowProps): ReactElement {
  const alignment = {
    start: "items-start",
    center: "items-center",
    end: "items-end",
    baseline: "items-baseline",
    stretch: "items-stretch",
  }[align];
  const justification = {
    start: "justify-start",
    center: "justify-center",
    end: "justify-end",
    between: "justify-between",
  }[justify];
  return render(
    as,
    [
      "flex",
      wrap ? "flex-wrap" : "flex-nowrap",
      GAP_CLASS[gap],
      alignment,
      justification,
      className,
    ]
      .filter(Boolean)
      .join(" "),
    rest,
  );
}

/**
 * A `Row` that wraps — the shape every category row, tag list and footer link column needs, and
 * the reason the category row of TASK-048 wraps rather than truncates (German compounds, `en-XA`).
 */
export function Cluster({ gap = "sm", ...rest }: RowProps): ReactElement {
  return <Row gap={gap} wrap {...rest} />;
}

export interface GridProps extends BaseProps {
  readonly gap?: Gap;
  /**
   * Columns at the mobile and desktop artboards. 2-up mobile / 4-up desktop is the card grid.
   *
   * `1-aside` is the artboards' band shape: stacked on mobile, and on desktop a fixed 300 px
   * heading column beside a fluid one (`homepage-desktop.dc.html`'s "Coming up in Poland" band).
   * It lives here rather than at the call site because §2's rule is that no component ships a
   * bespoke grid — the width is the drawing's, written once.
   */
  readonly columns?: "1-2" | "2-4" | "1-3" | "2-3" | "2-5" | "2-6" | "1-aside";
}

const COLUMN_CLASS: Readonly<
  Record<NonNullable<GridProps["columns"]>, string>
> = {
  "1-2": "grid-cols-1 md:grid-cols-2",
  "2-4": "grid-cols-2 md:grid-cols-4",
  "1-3": "grid-cols-1 md:grid-cols-3",
  "2-3": "grid-cols-2 md:grid-cols-3",
  // The trending row (five cards on the desktop artboard) and the occasion grid (six), both
  // 2-up on the mobile artboard.
  "2-5": "grid-cols-2 md:grid-cols-5",
  "2-6": "grid-cols-2 md:grid-cols-6",
  "1-aside": "grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)]",
};

/** The card grid (§2: 2-up mobile, 4-up desktop) and its four siblings. */
export function Grid({
  gap = "md",
  columns = "2-4",
  as = "div",
  className,
  ...rest
}: GridProps): ReactElement {
  return render(
    as,
    ["grid", COLUMN_CLASS[columns], GAP_CLASS[gap], className]
      .filter(Boolean)
      .join(" "),
    rest,
  );
}
