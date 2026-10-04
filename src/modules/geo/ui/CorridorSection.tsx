/**
 * `CorridorSection` — the country guide's one section shape (`docs/design/wireframes/
 * corridor-country-{desktop,mobile}.dc.html`, "Every section a 4fr∶7fr pair (heading left,
 * content right), gap 72, 72 between sections (mobile one column, 48)"; TASK-179).
 *
 * The heading column carries an optional eyebrow, the `<h2>` and an optional small note; the
 * content column carries the section's body. One component, so the guide's ten sections cannot
 * drift into ten rhythms.
 */
import type { ReactElement, ReactNode } from "react";

/** The `h2.h2s` voice of the v2 artboards. */
export const CORRIDOR_H2 = "display text-2xl-s md:text-2xl m-0 leading-[1.08]";

/** The guide's prose voice: 19 px (17 on a phone) in `ink-2` at the measure. */
export const CORRIDOR_PROSE =
  "text-ink-muted max-w-prose text-body-s md:text-[19px] grid gap-md";

export interface CorridorSectionProps {
  readonly id: string;
  readonly heading: ReactNode;
  readonly eyebrow?: ReactNode;
  /** A small note under the heading (the calendar's "These are Poland's dates…"). */
  readonly note?: ReactNode;
  readonly children: ReactNode;
  /** The section's `data-fo-corridor-*` marker, which the suites find it by. */
  readonly marker: `data-fo-corridor-${string}`;
}

export function CorridorSection({
  id,
  heading,
  eyebrow,
  note,
  children,
  marker,
}: CorridorSectionProps): ReactElement {
  return (
    <section
      aria-labelledby={id}
      className="pt-[48px] md:pt-[72px]"
      {...{ [marker]: true }}
    >
      <div className="grid items-start gap-[24px] md:grid-cols-[4fr_7fr] md:gap-[72px]">
        <div>
          {eyebrow === undefined ? null : (
            <span className="eyebrow mb-[14px] block">{eyebrow}</span>
          )}
          <h2 className={CORRIDOR_H2} id={id}>
            {heading}
          </h2>
          {note === undefined ? null : (
            <p className="text-ink-muted m-0 mt-[16px] max-w-[40ch] text-sm leading-[1.4]">
              {note}
            </p>
          )}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}
