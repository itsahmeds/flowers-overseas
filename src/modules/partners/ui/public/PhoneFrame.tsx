/**
 * The phone frame of the walkthrough (spec 011 §2 "The walkthrough", AC-3; artboard
 * `for-florists-walkthrough-*`, `.pf`; TASK-210).
 *
 * A 301 px ink bezel holding the real inbox component at a 360 px phone width, scaled by `zoom`
 * so it wraps as on a phone. The container carries `inert`: nothing inside is focusable, clickable
 * or announced as a control, so a keyboard user tabs past a picture, not a set of dead buttons.
 * The `<figcaption>` says what the screen shows. It mirrors with the page in RTL (logical
 * properties only). Not a design-system primitive: the walkthrough is its only user, so it lives
 * here rather than in `src/modules/ui`.
 */
import type { ReactElement, ReactNode } from "react";

export function PhoneFrame({
  caption,
  children,
}: {
  readonly caption: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <figure
      className="m-0 grid justify-items-center gap-[10px]"
      data-fo-phone-frame
    >
      <div
        className="bg-ink relative h-[560px] w-[301px] rounded-[40px] p-[10px] shadow-(--shadow-letter)"
        inert
        data-fo-phone-screen
      >
        <div className="bg-paper relative h-full overflow-hidden rounded-[30px]">
          <div className="relative h-[calc(540px/0.78)] w-[360px] [zoom:0.78] [&_[data-fo-inbox-dock]]:absolute [&_[data-fo-inbox-dock]]:start-0 [&_[data-fo-inbox-dock]]:end-0 [&_[data-fo-inbox-dock]]:bottom-0 [&_[data-fo-inbox-frame]]:h-full">
            {children}
          </div>
        </div>
      </div>
      <figcaption className="text-ink-3 max-w-[30ch] text-center text-sm leading-(--line-height-tight)">
        {caption}
      </figcaption>
    </figure>
  );
}
