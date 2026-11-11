/**
 * `RatingStars` (spec 022a §5.3, §8 "Accessibility"; TASK-373): five stars in a fixed box, the
 * first `Math.round(value)` filled from the inline start (the row keeps its order in RTL, §7), and
 * one text alternative for the row ("Rated 4 out of 5"), passed in already translated.
 */
import type { ReactElement } from "react";

import { StarGlyph } from "./star";

export interface RatingStarsProps {
  /** 1 to 5; an average rounds to the nearest whole star. */
  readonly value: number;
  /** The row's text alternative, e.g. "Rated 4 out of 5". */
  readonly label: string;
  readonly size?: number;
}

export function RatingStars({
  value,
  label,
  size = 18,
}: RatingStarsProps): ReactElement {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-[2px]"
      data-fo-rating={filled}
      dir="ltr"
      role="img"
      style={{ blockSize: size, inlineSize: size * 5 + 8 }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <StarGlyph filled={n <= filled} key={n} size={size} />
      ))}
    </span>
  );
}
