/**
 * The icon set (spec 004 §2 "Logical CSS and RTL readiness", AC-5; TASK-045).
 *
 * Every icon on the approved canvas, redrawn once here on a **24 unit grid with a 1.6 stroke** and
 * `currentColor`, so a call site sets colour with a text utility and never with a fill. Inline
 * SVG rather than a sprite or an icon package: fourteen icons are ~2 KB of markup inside cached
 * HTML, while an icon dependency is a bundle, a licence and a second design language.
 *
 * **Mirroring is a property of the icon, not of the call site** (§2): `MIRRORED_IN_RTL` names the
 * two direction-carrying icons, `Icon` applies `mirror-in-rtl` from that set, and no consumer can
 * decide differently. That is what makes AC-5's assertion — arrow and chevron flipped under
 * `dir="rtl"`, the wordmark and the check not — a property of the system rather than a review
 * note.
 *
 * Accessibility: an icon is decorative by default (`aria-hidden`, focusable="false"), because it
 * always sits next to its own label in this design. Passing `label` promotes it to
 * `role="img"` with an accessible name — which must come from the message catalogue, like every
 * other string (`fo/no-literal-strings`).
 */
import type { ReactElement } from "react";

/** Every icon the canvas uses, in the order the gallery renders them. */
export const ICON_NAMES = [
  "arrow-end",
  "chevron-end",
  "chevron-down",
  "check",
  "shield-check",
  "search",
  "menu",
  "close",
  "user",
  "truck",
  "basket",
  "calendar",
  "clock",
  "phone",
  "florist",
  "card",
  "document",
  "globe",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/**
 * The direction-carrying icons. An arrow and a chevron point the way the text runs, so they flip
 * under `dir="rtl"`; a clock, a check, a shield, a house and the wordmark do not (§2's explicit
 * list, AC-5).
 */
export const MIRRORED_IN_RTL: ReadonlySet<IconName> = new Set<IconName>([
  "arrow-end",
  "chevron-end",
]);

/** The geometry, keyed by name. `viewBox="0 0 24 24"` for all of them. */
const GEOMETRY: Readonly<Record<IconName, ReactElement>> = {
  "arrow-end": (
    <>
      <path d="M4 12h15" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  "chevron-end": <path d="M9 6l6 6-6 6" />,
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  check: <path d="M5 13l4 4 10-10" />,
  "shield-check": (
    <>
      <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  truck: (
    <>
      <rect x="3" y="7" width="13" height="10" rx="1" />
      <path d="M16 10h3l2 3v4h-5" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="18" cy="18" r="1.6" />
    </>
  ),
  basket: (
    <>
      <path d="M6 7h12l-1 12H7L6 7z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="1" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  phone: (
    <path d="M5 4h4l2 5-3 2a10 10 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
  ),
  florist: (
    <>
      <path d="M3 21h18M5 21V8l7-5 7 5v13" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M3 10h18" />
    </>
  ),
  document: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 2.5 2.5 13 0 16-2.5-3-2.5-13.5 0-16z" />
    </>
  ),
};

export interface IconProps {
  readonly name: IconName;
  /** Rendered size in px on the 24 grid. The canvas uses 12–22; 20 is the default. */
  readonly size?: 12 | 14 | 16 | 18 | 20 | 22 | 24;
  /**
   * Accessible name. Omit for a decorative icon that sits next to its own visible label — the
   * normal case in this design. When given it must be a message-catalogue string.
   */
  readonly label?: string;
  readonly className?: string;
}

export function Icon({
  name,
  size = 20,
  label,
  className,
}: IconProps): ReactElement {
  const mirror = MIRRORED_IN_RTL.has(name) ? "mirror-in-rtl" : "";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${mirror} ${className ?? ""}`.trim()}
      focusable="false"
      {...(label === undefined
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": label })}
    >
      {GEOMETRY[name]}
    </svg>
  );
}
