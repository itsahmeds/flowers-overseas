/**
 * The icon set (spec 004 §2 "Logical CSS and RTL readiness", AC-5; TASK-045).
 *
 * Every icon on the approved canvas, redrawn once here on a **24 unit grid with a 1.6 stroke** and
 * `currentColor`, so a call site sets colour with a text utility and never with a fill. Inline
 * SVG rather than a sprite or an icon package: thirteen icons are ~2 KB of markup inside cached
 * HTML, while an icon dependency is a bundle, a licence and a second design language.
 *
 * **The set is exactly the canvas's, plus the two mirrored ones** (`/review 27` required change 2;
 * spec §3 rules out "an illustration or icon system beyond the five icons the chrome needs"). Each
 * name below cites the element of `docs/design/homepage-v1/*.dc.html` that draws it;
 * `tests/unit/ui-icons.test.tsx` matches every geometry against that file, so an icon nobody
 * approved cannot enter the set. `arrow-end` and `chevron-end` are the exception and the reason
 * for it is AC-5: the mirroring contract needs a mirrored pair to be observable at all. A
 * component that needs a chevron-down, a close, a clock or a globe adds it in the task that ships
 * that component, against a canvas that shows it.
 *
 * **Design system v2's icons keep their own grid** (TASK-232). `docs/design/system/components.dc.html`
 * ("Line icons, 1.6 stroke") draws the v2 icons on a 34 unit grid; one ships so far, `leaf`, the
 * mark the round-2 notice bar sets before "Fresh-flower promise" (`chrome-desktop.dc.html`), and it
 * is drawn here with the sheet's own geometry and viewBox (`V2_GRID_ICONS`) rather than redrawn,
 * so the provenance test can match it coordinate for coordinate against the sheet.
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

/**
 * Every icon the canvas uses, in the order the gallery renders them, each with the canvas element
 * that draws it.
 */
export const ICON_NAMES = [
  // Direction-carrying pair: no canvas element yet, kept because AC-5's `mirror-in-rtl` contract
  // is only observable with a mirrored icon, and the header/footer links of TASK-048 need them.
  "arrow-end",
  "chevron-end",
  // Hero trust row and trust strip: "7-day freshness guarantee".
  "shield-check",
  // Mobile header search field: "Search flowers, occasions, a city or a country".
  "search",
  // Mobile header: the menu button.
  "menu",
  // Header utility link: "Sign in".
  "user",
  // Header utility link: "My orders".
  "truck",
  // Header utility link: "Basket (0)".
  "basket",
  // Hero booking panel: the "Delivery date" field.
  "calendar",
  // Top utility bar: "Help & WhatsApp".
  "phone",
  // Trust strip: "Made by a florist in their town".
  "florist",
  // Trust strip: "The price you see is final".
  "card",
  // Trust strip: "Photo on delivery".
  "document",
  // v2 (`system/components.dc.html`): the round-2 notice bar's mark before "Fresh-flower promise",
  // and the promise band's guarantee card. A leaf is not direction-carrying: never mirrored.
  "leaf",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/**
 * The direction-carrying icons. An arrow and a chevron point the way the text runs, so they flip
 * under `dir="rtl"`; a shield, a calendar, a house and the wordmark do not (§2's explicit list,
 * AC-5).
 */
export const MIRRORED_IN_RTL: ReadonlySet<IconName> = new Set<IconName>([
  "arrow-end",
  "chevron-end",
]);

/** The icons drawn on design system v2's 34 unit grid (`viewBox="0 0 34 34"`), as the sheet draws them. */
export const V2_GRID_ICONS: ReadonlySet<IconName> = new Set<IconName>(["leaf"]);

/** The geometry, keyed by name: `viewBox="0 0 24 24"`, or 34 for `V2_GRID_ICONS`. */
const GEOMETRY: Readonly<Record<IconName, ReactElement>> = {
  "arrow-end": (
    <>
      <path d="M4 12h15" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  "chevron-end": <path d="M9 6l6 6-6 6" />,
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
  // The header's basket link (spec 010 D10; `chrome-desktop.dc.html` "Header icons", TASK-349).
  basket: (
    <>
      <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="1" />
      <path d="M3 10h18M8 3v4M16 3v4" />
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
  leaf: (
    <>
      <path d="M17 31V15" />
      <path d="M17 15c0-6 4-10 11-11-1 7-5 11-11 11Z" />
      <path d="M17 20c0-5-3-8-9-9 1 5 4 9 9 9Z" />
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
  /** The stroke, 1.6 by default; the header's icon links draw 1.8 (`chrome-*.dc.html`). */
  readonly strokeWidth?: 1.6 | 1.8;
}

export function Icon({
  name,
  size = 20,
  label,
  className,
  strokeWidth = 1.6,
}: IconProps): ReactElement {
  const mirror = MIRRORED_IN_RTL.has(name) ? "mirror-in-rtl" : "";
  return (
    <svg
      width={size}
      height={size}
      viewBox={V2_GRID_ICONS.has(name) ? "0 0 34 34" : "0 0 24 24"}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
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
