/**
 * The one star shape of the review components (spec 022a §5.3, §6 "CWV"): an inline SVG in a
 * fixed box, so a star row never shifts layout and no image is fetched. Decorative: the row or
 * the radio carries the text alternative.
 */
import type { ReactElement } from "react";

const PATH =
  "M12 2.6l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.5l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8z";

export function StarGlyph({
  filled,
  size = 20,
  className = "",
}: {
  readonly filled: boolean;
  readonly size?: number;
  readonly className?: string;
}): ReactElement {
  return (
    <svg
      aria-hidden="true"
      className={`shrink-0 ${filled ? "fill-ink stroke-ink" : "stroke-ink-3 fill-none"} ${className}`}
      data-fo-star={filled ? "filled" : "empty"}
      focusable="false"
      height={size}
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d={PATH} strokeLinejoin="round" />
    </svg>
  );
}
