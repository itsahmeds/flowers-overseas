/**
 * `Chip` (spec 004 §2, §5.3; components sheet v2 "Chips, status and notes"; TASK-045, TASK-175).
 *
 * Three tones, each with one job (the sheet's mapping of v1's `CHIP_TONES`):
 *
 *  - `neutral` — the white link chip: a 44 px pill on the card white with a hairline inset, the
 *    one a category row, a sibling row or a "see the flowers" link is drawn as. With
 *    `aria-current="page"` it is the **current** chip: cornflower fill, white text (selection is
 *    fill *and* the `aria-current` state, never colour alone).
 *  - `accent` — the poppy chip, at most one per region.
 *  - `muted` — the status chip: small uppercase label on the cream band with a dot; `live` turns
 *    the dot leaf ("Delivering"), otherwise it is subtle ink ("Guide · not delivering yet"). The
 *    word says which status it is; the dot only repeats it (§5.3).
 *
 * Text only, server-rendered; `href` makes it an `<a>`, otherwise a `<span>`.
 */
import type { ReactElement, ReactNode } from "react";

export const CHIP_TONES = ["neutral", "accent", "muted"] as const;
export type ChipTone = (typeof CHIP_TONES)[number];

const PILL =
  "inline-flex flex-none items-center gap-sm min-h-(--target-min) px-[18px] rounded-full whitespace-nowrap font-medium no-underline";

const TONE_CLASS: Readonly<Record<ChipTone, string>> = {
  neutral: `${PILL} bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-rule)] aria-[current=page]:bg-selected aria-[current=page]:text-on-selected aria-[current=page]:shadow-none`,
  accent: `${PILL} bg-accent text-on-accent`,
  muted:
    "inline-flex items-center gap-[6px] rounded-full bg-surface-raised px-[12px] py-xs text-xs font-bold tracking-[0.08em] uppercase text-ink-muted shadow-[inset_0_0_0_1px_var(--color-rule)] before:size-[7px] before:rounded-full before:content-['']",
};

/** The neutral link chip's pointer state: a 1.5 px subtle-ink inset. Written literally (Tailwind scans text). */
const LINK_HOVER =
  "hover:shadow-[inset_0_0_0_1.5px_var(--color-ink-3)] hover:text-ink";

export interface ChipProps {
  readonly children: ReactNode;
  readonly tone?: ChipTone;
  /** Renders an `<a>`: the chip is navigation rather than a marker. */
  readonly href?: string;
  /** `muted` only: the leaf dot of a live status. */
  readonly live?: boolean;
  /**
   * Accessible name when the visible text is an abbreviation (a currency code, a locale code).
   * `| undefined` is explicit because `exactOptionalPropertyTypes` is on and callers pass the
   * value through from data where it may legitimately be absent.
   */
  readonly "aria-label"?: string | undefined;
  /** The current chip of a row (`neutral` draws it in the selected fill). */
  readonly "aria-current"?: "page" | undefined;
  readonly className?: string;
}

export function Chip({
  children,
  tone = "neutral",
  href,
  live = false,
  className,
  ...aria
}: ChipProps): ReactElement {
  const classes = [
    TONE_CLASS[tone],
    tone === "muted" ? (live ? "before:bg-stem" : "before:bg-ink-subtle") : "",
    href !== undefined && tone === "neutral" ? LINK_HOVER : "",
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
