/**
 * `MenuSheet` — the phone header's **Menu** (spec 004 §14 A24 clause 3, AC-47; TASK-195).
 *
 * It reproduces the `details.mnav` of `docs/design/wireframes/chrome-mobile.dc.html` (and the same
 * header on `home-mobile`, `product-mobile` and `country-shop-mobile`): a pill summary with three
 * bars and "Menu", and a paper panel that drops from the header's foot holding
 *
 *  1. the header's published links (spec 008 §14 A14), the same entries the `md`-up row draws,
 *     one 52 px row each in the display face;
 *  2. Send flowers, the full-width send pill;
 *  3. spec 003's `LocaleSwitcher`, mounted with its markup unchanged (spec 003 AC-3), and the
 *     currency as text with its localised label (AC-8: no cookie, the same for every visitor);
 *  4. the help line, the WhatsApp link the notice bar carries from `lg` up.
 *
 * **A native disclosure** (`<details>`/`<summary>`): it opens and closes with JavaScript off, and
 * it is the one control below `md` besides the logo. With JavaScript on, the header's motion module (`MotionIsland`, TASK-194) adds `Esc`
 * (close, focus back on the summary) and renders nothing, so the header's box is the server's
 * (AC-7). Every target in the panel is at least 44 px tall.
 *
 * **The open Menu (spec 004 §14 A-founder-2026-10-19c clause 3, AC-47; TASK-282;
 * `chrome-mobile.dc.html` item 3A).** While it is open the summary shows a close mark and reads the
 * reviewed "Close" (`consent.close`, reused as A-founder-2026-10-18a reused `nav.categories.label`;
 * no new key), so its accessible name is the close label: CSS (`group-open:`), the same with or
 * without JavaScript. With JavaScript on (`html[data-fo-motion]`, `globals.css`) a scrim
 * (`--color-scrim`) dims the page below the header, and the motion module closes the Menu on a tap
 * on it, keeps focus inside the Menu and its summary, and closes it when Send flowers is activated
 * (on the home, Send flowers then scrolls the sentence letter in below the header and focuses its
 * first choice). The scrim is `display: none` until the module has loaded, so with JavaScript off,
 * or before the deferred module arrives, the native `<details>` is all there is.
 *
 * The panel scrolls inside itself (`max-block-size` of the viewport under the 65 px header,
 * `overscroll-contain`): the header is sticky, so a panel taller than the screen would otherwise
 * leave its foot where no scroll can reach it (WCAG 1.4.10, 360 × 640).
 *
 * The entries carry `data-fo-menu-item`, not `data-fo-header-item`, and the switcher and the
 * currency `data-fo-menu-switcher`/`data-fo-menu-currency`: the `md`-up row and the strip keep
 * their own attributes, so a test of one never counts the other.
 */
import type { ReactElement, ReactNode } from "react";

import { Button } from "../primitives/Button.tsx";

export interface MenuSheetLink {
  readonly id: string;
  readonly href: string;
  readonly label: string;
}

export interface MenuSheetProps {
  /** The summary's text, `nav.menu.label`. */
  readonly label: string;
  /** The open summary's text and accessible name: the reviewed "Close" (`consent.close`). */
  readonly closeLabel: string;
  /** The links list's accessible name, the category row's (`nav.categories.label`). */
  readonly navLabel: string;
  /** The header's published entries, in the row's order. */
  readonly links: readonly MenuSheetLink[];
  /** Send flowers: the home's sentence. */
  readonly send: { readonly href: string; readonly label: string };
  /** Spec 003's `LocaleSwitcher`, as the header mounts it. */
  readonly switcher: ReactNode;
  readonly currency: { readonly code: string; readonly label: string };
  readonly help: { readonly href: string; readonly label: string };
  readonly className?: string;
}

/** The switcher's row, styled from the wrapper so `src/modules/i18n` stays untouched (AC-3). */
const SWITCHER =
  "[&_ul]:m-0 [&_ul]:flex [&_ul]:list-none [&_ul]:flex-wrap [&_ul]:items-center [&_ul]:gap-x-[10px] [&_ul]:p-0 [&_li]:inline-flex [&_li]:items-center [&_li]:gap-[4px] [&_a]:inline-flex [&_a]:min-h-(--target-min) [&_a]:items-center [&_[aria-current]]:inline-flex [&_[aria-current]]:min-h-(--target-min) [&_[aria-current]]:items-center [&_[aria-current]]:font-bold [&_[data-beta]]:ms-0 [&_[data-beta]]:text-xs [&_[data-beta]]:tracking-[0.08em] [&_[data-beta]]:uppercase [&_[data-beta]]:opacity-80";

export function MenuSheet({
  label,
  closeLabel,
  navLabel,
  links,
  send,
  switcher,
  currency,
  help,
  className,
}: MenuSheetProps): ReactElement {
  return (
    <details
      className={["group", className].filter(Boolean).join(" ")}
      // Written here, not imported from `../motion/MotionIsland.tsx`: an export of a `"use client"` module
      // is a client reference on the server, not its value, and the attribute would be lost.
      data-fo-menu=""
    >
      <summary
        className="text-ink text-ui inline-flex min-h-(--target-min) cursor-pointer list-none items-center gap-[10px] rounded-full px-[16px] font-bold shadow-[inset_0_0_0_1.5px_var(--color-ink)] select-none [&::-webkit-details-marker]:hidden"
        data-fo-menu-summary
      >
        {/* The artboard's `.bars`: three 2 px strokes in an 18 × 12 box, drawn, not a glyph. */}
        <span
          aria-hidden="true"
          className="relative block h-[12px] w-[18px] border-y-2 border-current group-open:hidden after:absolute after:start-0 after:end-0 after:top-[3px] after:border-t-2 after:border-current after:content-['']"
        />
        {/* Open: the artboard's `.aa-x`, two 2 px strokes crossed in a 14 × 14 box. */}
        <span
          aria-hidden="true"
          className="relative hidden h-[14px] w-[14px] group-open:block before:absolute before:start-[6px] before:top-0 before:bottom-0 before:rotate-45 before:border-s-2 before:border-current before:content-[''] after:absolute after:start-[6px] after:top-0 after:bottom-0 after:-rotate-45 after:border-s-2 after:border-current after:content-['']"
          data-fo-menu-close-mark=""
        />
        {/* One of the two labels is `display: none`, so the summary's accessible name is the
            visible one: "Menu" closed, the close label open (AC-47). */}
        <span className="group-open:hidden">{label}</span>
        <span className="hidden group-open:inline" data-fo-menu-close="">
          {closeLabel}
        </span>
      </summary>
      {/* The scrim under the open panel, over the page below the header (65 px on the phone).
          `display: none` until the motion module marks the page (`globals.css`): a tap on it
          closes the Menu only where that module runs. */}
      <div
        aria-hidden="true"
        className="bg-scrim fixed start-0 end-0 top-[65px] bottom-0 hidden"
        data-fo-menu-scrim=""
      />
      <div
        className="bg-surface border-rule absolute start-0 end-0 top-full grid max-h-[calc(100dvh-65px)] gap-[16px] overflow-y-auto overscroll-contain border-b px-(--gutter-s) pt-[8px] pb-[24px] shadow-md"
        data-fo-menu-panel
      >
        <nav aria-label={navLabel}>
          <ul className="m-0 grid list-none p-0">
            {links.map((link) => (
              <li key={link.id}>
                <a
                  className="display text-h3 border-rule flex min-h-[52px] items-center border-b"
                  data-fo-menu-item={link.id}
                  href={link.href}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <Button href={send.href} size="send">
          {send.label}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-x-[14px] gap-y-[8px] text-sm">
          <div className={SWITCHER} data-fo-menu-switcher>
            {switcher}
          </div>
          <span aria-label={currency.label} data-fo-menu-currency>
            {currency.code}
          </span>
        </div>
        <p className="m-0 text-sm">
          <a
            className="inline-flex min-h-(--target-min) items-center"
            data-fo-menu-help
            href={help.href}
          >
            {help.label}
          </a>
        </p>
      </div>
    </details>
  );
}
