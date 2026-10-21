/**
 * @purpose The corridor hero's decorative route line (042-6)
 * @spec 042
 *
 * Spec 042 idea 6, the route line (§5.3.6, AC-19, AC-5; §13 Q8, every default; TASK-311;
 * `docs/design/system/motion-interactions.dc.html` motion 18, the spec 042 band of
 * `docs/design/wireframes/corridor-country-desktop.dc.html`).
 *
 * One inline SVG, the artboard's viewBox and path: a dashed arc from an unfilled, unlabelled
 * origin dot (you, wherever you are) to a filled destination dot. It takes **no props on
 * purpose**: the sender's country is unknown on a cached page and is never read from IP, a geo
 * header or `Accept-Language` (ADR-0006, spec 042 L13), and the H1 beside it already names the
 * destination, so every visitor and every country's page gets these same bytes.
 *
 * Decorative only: `aria-hidden`, not focusable, no `<text>`, `<image>` or link. The second copy
 * of the path is the mask, in the page colour over `pathLength` 1 (a dash of 1 and a gap of 1, so
 * one dash covers the whole arc), that `globals.css` unrolls once
 * (`[data-fo-route-line]`); at rest, under reduced motion and without CSS animation it is rolled
 * away, so the route is drawn. The same rules place it in the gap between the H1's column and the
 * lead photo slot, hide it below `md`, and `mirror-in-rtl` keeps the origin at the inline-start.
 */
import type { ReactElement } from "react";

/** The artboard's arc, from the origin (10, 104) to the destination (168, 22). */
const ARC = "M10 104C46 34 112 8 168 22";

export function CorridorRouteLine(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="mirror-in-rtl"
      data-fo-route-line=""
      fill="none"
      focusable="false"
      strokeLinecap="round"
      viewBox="0 0 180 120"
    >
      <path
        d={ARC}
        data-fo-route="dash"
        stroke="currentColor"
        strokeDasharray="6 7"
        strokeWidth="2"
      />
      <path
        d={ARC}
        data-fo-route="mask"
        pathLength={1}
        strokeDasharray="1 1"
        strokeWidth="7"
      />
      <circle cx="10" cy="104" data-fo-route="you" r="5" strokeWidth="1.5" />
      <circle cx="168" cy="22" data-fo-route="to" fill="currentColor" r="5" />
    </svg>
  );
}
