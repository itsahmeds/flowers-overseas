/**
 * The brand mark (spec 004 §2 "Layout primitives and chrome", §13 Q1; TASK-045).
 *
 * The origin-stem-bloom mark the founder approved on the canvas, rendered **inline** so it is part
 * of the cached HTML with no extra request and so its two colours come from the tokens rather than
 * from baked-in hex — `content/brand/mark.svg` is the production asset and carries hex equivalents
 * for anything outside the app (a favicon, an email, a partner pack), while this component is what
 * the site renders. `tests/unit/mark.test.tsx` pins the two against each other geometry by
 * geometry, so the file and the component cannot drift.
 *
 * Never mirrored in RTL (§2's explicit list, AC-5): a wordmark and a logo keep their direction.
 *
 * The mark is decorative when it sits inside a link that already has an accessible name (the
 * header's home link renders the wordmark next to it), and `label` promotes it to `role="img"`
 * with a name from the message catalogue for the one case that needs it.
 */
import type { ReactElement } from "react";

export interface MarkProps {
  /** Rendered size in px; the mark is drawn on a 48 unit grid. */
  readonly size?: number;
  /** Accessible name from the message catalogue. Omit when a sibling already names the link. */
  readonly label?: string;
  readonly className?: string;
}

export function Mark({ size = 40, label, className }: MarkProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      focusable="false"
      {...(label === undefined
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": label })}
    >
      {/* The origin: where the order starts. */}
      <circle cx="8" cy="40" r="3" fill="var(--color-accent)" />
      {/* The stem: the relay across the map. */}
      <path
        d="M8 40 C 20 40, 26 34, 30 22"
        stroke="var(--color-ink)"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      {/* The bloom: five petals and an accent heart. */}
      <g
        transform="translate(31 16)"
        stroke="var(--color-ink)"
        strokeWidth="2.2"
        fill="none"
      >
        <circle cx="0" cy="-6" r="4" />
        <circle cx="5.7" cy="-1.9" r="4" />
        <circle cx="3.5" cy="4.9" r="4" />
        <circle cx="-3.5" cy="4.9" r="4" />
        <circle cx="-5.7" cy="-1.9" r="4" />
        <circle cx="0" cy="0" r="2" fill="var(--color-accent)" stroke="none" />
      </g>
    </svg>
  );
}
