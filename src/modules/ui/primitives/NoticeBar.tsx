/**
 * `NoticeBar` — the ink strip above the header (components sheet v2 "Notice bar, header, footer";
 * `wireframes/chrome-{desktop,mobile}.dc.html`; spec 004 §14 A20, A21; TASK-175).
 *
 * The **look** only: an inverse band in 14 px type, the note at the inline start (its `<strong>`
 * phrase in sunflower), the utility links at the inline end, centred on a phone. What it says and
 * which links it carries are the header's (TASK-176 swaps `SiteHeader`'s utility strip onto this);
 * every control in it is a link to a page that exists or is absent (A20). `surface-inverse` swaps
 * the focus ring to sunflower, because poppy is 2.90:1 on ink.
 */
import type { ReactElement, ReactNode } from "react";

export interface NoticeBarProps {
  /** The note: one sentence, with its emphasised phrase in `<strong>`. */
  readonly children: ReactNode;
  /** Links at the inline end (help, locales). Hidden below `md`, as the mobile artboard draws. */
  readonly utilities?: ReactNode;
  readonly className?: string;
}

export function NoticeBar({
  children,
  utilities,
  className,
}: NoticeBarProps): ReactElement {
  return (
    <div
      className={[
        "surface-inverse text-fine py-[8px] leading-[1.4] md:py-[9px]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-fo-notice-bar
    >
      <div className="gap-lg max-w-page mx-auto flex items-center justify-center px-(--gutter-s) text-center md:justify-between md:px-(--gutter) md:text-start">
        <p className="[&_strong]:text-on-inverse-accent m-0 [&_strong]:font-bold">
          {children}
        </p>
        {utilities === undefined ? null : (
          <div className="[&_a]:hover:text-on-inverse-accent hidden items-center gap-[20px] whitespace-nowrap md:flex [&_a]:inline-flex [&_a]:min-h-(--target-min) [&_a]:items-center [&_a]:underline [&_a]:underline-offset-[3px]">
            {utilities}
          </div>
        )}
      </div>
    </div>
  );
}
