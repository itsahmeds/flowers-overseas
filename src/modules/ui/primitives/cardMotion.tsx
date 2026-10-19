/**
 * Motion 6's two card layers (spec 004 §14 A-founder-2026-10-19e clause 1 (c), (d); AC-44, T-48;
 * TASK-277; `docs/design/system/motion-premium.dc.html`, the approved column).
 *
 * A moving card (one whose link carries `data-fo-card-motion`, never the priority card) renders
 * exactly one of each, both empty and `aria-hidden`, so the link's accessible name is unchanged:
 *
 *  - `CardMotionFrame` wraps the photograph's clipped box with its **shadow layer**: a sibling of
 *    the clip, outside it and inside the link, so it lifts with the link and fades in with
 *    `opacity` while its `box-shadow` (`--shadow-letter`) never changes;
 *  - `CardMotionLine` is the **name's line**, inside the heading after the name, drawn from the
 *    inline-start.
 *
 * Every value is CSS in `src/app/globals.css` (motion 6 and `@layer components`), keyed on the
 * `data-fo-card-*` attributes; no client byte.
 */
import type { ReactElement, ReactNode } from "react";

/** The attribute a moving card's link carries; the CSS keys every rule of motion 6 on it. */
export const CARD_MOTION_ATTRIBUTE = { "data-fo-card-motion": "" } as const;

/** The photograph's box with the shadow layer beside it, in a positioned box of the same size. */
export function CardMotionFrame({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="relative">
      <span aria-hidden="true" data-fo-card-shadow="" />
      {children}
    </div>
  );
}

/** The name's 1 px line; its heading must be the positioned, name-wide box it sits under. */
export function CardMotionLine(): ReactElement {
  return <span aria-hidden="true" data-fo-card-line="" />;
}

/**
 * The classes a moving card's heading takes so the line is as wide as the name and sits under its
 * last line box: positioned, and only as wide as its text.
 */
export const CARD_MOTION_HEADING = "relative w-fit";
