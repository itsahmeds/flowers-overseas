/**
 * `Photo` — the photography **placeholder** (spec 004 §2 "Locale-home skeleton" and "Image
 * conventions", `plan/10` §3's honesty rule, AC-10; TASK-045).
 *
 * Every photo box on the approved canvas renders through this component, and in Phase 0 it renders
 * the `--color-photo` token gradient with its uppercase caption and **no `<img>`**: the founder has
 * supplied no imagery, spec 006 generates it, and a demo that shows a photograph it does not have
 * is the one thing `plan/10` §3 forbids outright. The caption is not decoration either — it says
 * what the slot will hold, which is what makes the placeholder honest rather than empty.
 *
 * The box reserves its aspect ratio now, so when 006 lands imagery the LCP element changes from
 * text to image with **no layout shift and no template edit** (§2). `Media` — the wrapper with
 * the per-slot `sizes` and the R2 loader seam, TASK-052's — slots in here, and `dataset` is the
 * one prop it added: the slot name, its `sizes` and its per-locale alt text, recorded on the box
 * that is standing in for the image.
 *
 * States in `/dev/components`: the four named ratios, and caption / no-caption.
 */
import type { ReactElement, ReactNode } from "react";

/** The aspect ratios the canvas uses. Named, so a call site cannot invent a fifth. */
export const PHOTO_RATIOS = [
  "hero",
  "landscape",
  "portrait",
  "square",
] as const;
export type PhotoRatio = (typeof PHOTO_RATIOS)[number];

const RATIO_CLASS: Readonly<Record<PhotoRatio, string>> = {
  hero: "aspect-[3/2]",
  landscape: "aspect-[4/3]",
  portrait: "aspect-[3/4]",
  square: "aspect-square",
};

export interface PhotoProps {
  /**
   * What the slot will hold, from the message catalogue. Rendered as the canvas's uppercase
   * caption. Omitted only where the surrounding copy already says it.
   */
  readonly caption?: ReactNode;
  readonly ratio?: PhotoRatio;
  readonly className?: string;
  /**
   * Where a `Media` element goes once spec 006 has imagery. Empty in Phase 0 — and deliberately
   * not an `<img>` with a placeholder `src`.
   */
  readonly children?: ReactNode;
  /**
   * `data-*` attributes for the box, added by TASK-052 so `Media` can record on the placeholder
   * itself which slot it is rendering, that slot's `sizes` string and its per-locale alt text.
   * Typed to the `data-` prefix, so this cannot become a general attribute escape hatch.
   */
  readonly dataset?: Readonly<Record<`data-${string}`, string>>;
}

export function Photo({
  caption,
  ratio = "landscape",
  className,
  children,
  dataset,
}: PhotoProps): ReactElement {
  return (
    <div
      className={["photo", RATIO_CLASS[ratio], "w-full", className]
        .filter(Boolean)
        .join(" ")}
      {...dataset}
    >
      {children}
      {caption === undefined ? null : <span>{caption}</span>}
    </div>
  );
}

/**
 * `Placeholder` — the canvas's `.ph` bar: an inline grey stub standing in for data that does not
 * exist yet (a florist count, a price, a review score). It renders **no number**, which is the
 * point: Phase 0 AC 6 forbids inventing one, and a visible stub is how the design shows a slot
 * without faking its content.
 *
 * It is decorative and `aria-hidden`, because a screen-reader user must not be told "56 pixels of
 * grey"; the surrounding copy carries the explanation.
 */
export interface PlaceholderProps {
  readonly width?: "sm" | "md" | "lg";
  readonly className?: string;
}

export function Placeholder({
  width = "md",
  className,
}: PlaceholderProps): ReactElement {
  const size = {
    sm: "min-w-[44px] h-[12px]",
    md: "min-w-[56px] h-[14px]",
    lg: "min-w-[96px] h-[14px]",
  }[width];
  return (
    <span
      aria-hidden
      className={[
        "bg-surface-muted inline-block rounded-sm align-middle",
        size,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
