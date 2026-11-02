/**
 * `DemoBanner` — "This is a demo order." on every demo screen (spec 010 §5.3 "Checkout shell":
 * "Banner is server-rendered, non-dismissible, first in `<main>`"; Appendix A
 * `demo.bannerTitle` (checkout catalogue), `bannerBody`; `docs/design/wireframes/checkout-desktop.dc.html`
 * `.guard.s10-banner`; TASK-201).
 *
 * A server component with **no control of any kind**: it cannot be closed, hidden or remembered
 * as dismissed. The page places it first in `<main>` (TASK-204); `role="note"` keeps it out of
 * the landmark list while a screen reader still reads it first.
 */
import type { ReactElement } from "react";

export interface DemoBannerProps {
  /** `demo.bannerTitle` (checkout catalogue). */
  readonly title: string;
  /** `demo.bannerBody` (checkout catalogue). */
  readonly body: string;
  readonly className?: string;
  /** The line's own frame, so its text aligns with the page's content column. */
  readonly innerClassName?: string;
}

export function DemoBanner({
  title,
  body,
  className,
  innerClassName,
}: DemoBannerProps): ReactElement {
  return (
    <div
      className={[
        "bg-paper-3 border-rule text-ink-2 border-b border-solid py-[8px] text-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-fo-demo-banner=""
      role="note"
    >
      <p className={["m-0", innerClassName].filter(Boolean).join(" ")}>
        <strong className="text-ink font-bold">{title}</strong> {body}
      </p>
    </div>
  );
}
