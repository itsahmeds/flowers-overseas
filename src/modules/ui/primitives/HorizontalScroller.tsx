/**
 * `HorizontalScroller` and `GalleryDots` — the phone's sideways rows (spec 004 §14 A24 clause 4
 * (c), AC-49; TASK-195; used by the date row, the chip rows and the phone gallery in TASK-187,
 * TASK-188 and TASK-197).
 *
 * **It actually scrolls.** The artboards draw these rows with `overflow: hidden`; that is drawing
 * shorthand and does not bind. Here the row is `overflow-x: auto` with `scroll-snap` on its items,
 * so every item is reachable by touch (a swipe) and by keyboard (Tab to a focusable item scrolls
 * it into view). A row with **no focusable child** (a strip of photographs, a row of facts) is
 * itself focusable (`tabindex="0"`) so the arrow keys scroll it, and it is named, which is what
 * axe's `scrollable-region-focusable` asks for. The caller says which by `itemsFocusable`, because
 * only the caller knows what it put inside.
 *
 * Below `md` the row bleeds to the screen's edges by the phone gutter and pads itself by the same
 * amount, so its first item starts on the page's frame and the page itself never scrolls sideways
 * (AC-43). Nothing auto-advances and nothing is called a carousel (no `aria-roledescription`).
 *
 * `GalleryDots` draws the phone gallery's dots **only as real in-page links**, one per image, each
 * a 24 × 24 target around an 8 px dot, the current one filled and marked `aria-current`. With no
 * images to link to, draw no dots (A20: nothing that looks clickable and does nothing).
 */
import type { ReactElement, ReactNode } from "react";

export interface HorizontalScrollerProps {
  /** The row's accessible name, from the message catalogue. */
  readonly label: string;
  /** One node per item, in order; each becomes an `<li>`. */
  readonly items: readonly { readonly key: string; readonly node: ReactNode }[];
  /**
   * Whether every item holds a focusable element (a link, a radio). When `false` the row itself
   * takes `tabindex="0"` so a keyboard can scroll it.
   */
  readonly itemsFocusable: boolean;
  /** Bleed to the phone's screen edges (the chip and date rows); default `true`. */
  readonly bleed?: boolean;
  readonly className?: string;
}

export function HorizontalScroller({
  label,
  items,
  itemsFocusable,
  bleed = true,
  className,
}: HorizontalScrollerProps): ReactElement {
  return (
    <ul
      aria-label={label}
      className={[
        "m-0 flex snap-x snap-mandatory [scrollbar-width:none] list-none gap-[8px] overflow-x-auto overscroll-x-contain p-0",
        bleed
          ? "max-md:-mx-(--gutter-s) max-md:scroll-px-(--gutter-s) max-md:px-(--gutter-s)"
          : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-fo-scroller
      {...(itemsFocusable ? {} : { tabIndex: 0 })}
    >
      {items.map((item) => (
        <li className="flex-none snap-start" key={item.key}>
          {item.node}
        </li>
      ))}
    </ul>
  );
}

export interface GalleryDotsProps {
  /** The dots' accessible name, from the message catalogue. */
  readonly label: string;
  /** One per image: the in-page `#id` of its figure and its accessible name. */
  readonly links: readonly {
    readonly href: `#${string}`;
    readonly label: string;
  }[];
  /** The index of the image in view. */
  readonly current: number;
  readonly className?: string;
}

export function GalleryDots({
  label,
  links,
  current,
  className,
}: GalleryDotsProps): ReactElement | null {
  if (links.length < 2) return null;
  return (
    <nav
      aria-label={label}
      className={["flex justify-center", className].filter(Boolean).join(" ")}
      data-fo-gallery-dots
    >
      {links.map((link, index) => (
        <a
          {...(index === current ? { "aria-current": "true" as const } : {})}
          aria-label={link.label}
          className="group grid h-[24px] w-[24px] place-items-center"
          href={link.href}
          key={link.href}
        >
          <span
            aria-hidden="true"
            className={`block h-[8px] w-[8px] rounded-full ${index === current ? "bg-ink" : "bg-ink-subtle"}`}
          />
        </a>
      ))}
    </nav>
  );
}
