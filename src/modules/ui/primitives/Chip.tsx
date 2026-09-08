/**
 * `Chip` (spec 004 §2, §5.3; TASK-045).
 *
 * The small bordered token the canvas uses for the currency indicator (`EUR`), the locale
 * indicator and a destination's status (`live`, `guide · waiting list`). Text only — a chip is
 * never the sole carrier of meaning and never colour-only: the status variants change the border
 * and the ink, and the *word* is what says which status it is (§5.3).
 *
 * Four states in `/dev/components`: `neutral`, `accent`, `muted` and `interactive` (the one case
 * where a chip is a link — a published destination in the picker).
 */
import type { ReactElement, ReactNode } from "react";

export const CHIP_TONES = ["neutral", "accent", "muted"] as const;
export type ChipTone = (typeof CHIP_TONES)[number];

const TONE_CLASS: Readonly<Record<ChipTone, string>> = {
  neutral: "border-border-strong text-ink",
  accent: "border-accent text-accent",
  muted: "border-transparent bg-surface-muted text-ink-muted",
};

export interface ChipProps {
  readonly children: ReactNode;
  readonly tone?: ChipTone;
  /** Renders an `<a>`: the chip is navigation rather than a marker. */
  readonly href?: string;
  /**
   * Accessible name when the visible text is an abbreviation (a currency code, a locale code).
   * `| undefined` is explicit because `exactOptionalPropertyTypes` is on and callers pass the
   * value through from data where it may legitimately be absent.
   */
  readonly "aria-label"?: string | undefined;
  readonly className?: string;
}

export function Chip({
  children,
  tone = "neutral",
  href,
  className,
  ...aria
}: ChipProps): ReactElement {
  const classes = [
    "inline-flex items-center gap-xs rounded-sm border border-solid px-sm py-xs text-sm",
    TONE_CLASS[tone],
    href === undefined ? "" : "hover:border-accent hover:text-accent",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href !== undefined) {
    return (
      <a className={classes} href={href} {...aria}>
        {children}
      </a>
    );
  }
  return (
    <span className={classes} {...aria}>
      {children}
    </span>
  );
}
