/**
 * The notice shell's class list, as plain strings and **nothing else** (spec 004 §5.3, AC-12;
 * TASK-055).
 *
 * Four documents render the same one-column notice: the `/` chooser, the 404, the localised 500
 * boundary and the last-resort 500 document. Three of them may not share a *component*:
 *
 *  - `src/app/[locale]/error.tsx` and `src/app/global-error.tsx` are Client Components, because
 *    Next requires an error boundary to be one, and whatever they import is compiled into a client
 *    chunk that Next attaches to every document — the growth vector `error-copy.data.ts` and
 *    `error-document.ts` exist to keep closed (spec 004 §14 A1, TASK-046, TASK-085). A React
 *    component from `src/modules/ui` would drag the design system's islands in behind it.
 *  - the same is true in reverse for `/`: the chooser must reach no client module at all, which is
 *    why `(chooser)/layout.tsx` deep-imports `@/modules/ui/fonts` instead of the barrel.
 *
 * So the *markup* is written per document and the **skin is this module**: no import, no JSX, no
 * runtime — a handful of Tailwind class strings that Tailwind's source scan picks up from `src/**`
 * exactly as it picks up a `className` in a component (`ConsentBannerView`'s `CONTROL` is the same
 * trade). One edit changes all four documents, `tests/unit/ui-notice-shell.test.ts` asserts the
 * file imports nothing, and `tests/unit/error-document.test.ts`'s siblings assert each document
 * actually uses it, so the three cannot drift into looking like three different sites.
 *
 * Everything here is logical (`ms-`/`me-`, `start`/`end`, `px`/`py`), so the shell is correct under
 * `dir="rtl"` with no second rule (`fo/no-physical-css`, AC-5), and every colour is a semantic
 * token (`fo/no-raw-color`, AC-1).
 */

/**
 * The centred `--measure` column every notice document is (§2's `--measure`, exposed by Tailwind
 * as `max-w-prose` so the token and the utility cannot drift). `min-h-dvh` because these documents
 * carry no header and no footer: without it the column floats at the top of a tall viewport.
 */
export const NOTICE_MAIN =
  "mx-auto flex min-h-dvh w-full max-w-prose flex-col gap-xl px-md py-2xl md:px-2xl";

/**
 * The masthead's lockup, at the masthead's own metrics (`SiteHeader`: 26/40 px mark, 19/26 px
 * wordmark, 0.04em tracking) so the chooser, the 404 and the 500 read as the same site as `/en`.
 */
export const NOTICE_LOCKUP = "gap-sm md:gap-md flex items-center";
export const NOTICE_MARK = "h-[26px] w-[26px] md:h-[40px] md:w-[40px]";
export const NOTICE_WORDMARK =
  "display text-[19px] tracking-[0.04em] md:text-[26px]";

/** The `.label` voice — 11 px, 600, tracked, uppercase, subtle ink — as the document's metadata. */
export const NOTICE_META = "label";

/** The `.display` voice at the `--text-display-s` step: the one `<h1>` of the document. */
export const NOTICE_HEADING = "display text-display-s";

/** Body copy at the measure, in the muted ink the canvas gives prose. */
export const NOTICE_BODY = "text-ink-muted max-w-prose text-md";

/** The block that holds the metadata, the heading and the body. */
export const NOTICE_BLOCK = "gap-sm flex flex-col";

/** The action row: wraps rather than overflows a 320 px viewport. */
export const NOTICE_ACTIONS = "gap-md flex flex-wrap items-center";

/**
 * The two actions, as the canvas's `.btn` and `.btn.secondary` — the same skin `Button`'s
 * `primary` and `secondary` variants render, written out here for the two documents that may not
 * import `Button` (see the header). `tests/unit/ui-notice-shell.test.ts` pins them against
 * `Button`'s own class list, so a change to the design system reaches the failure pages too.
 */
export const NOTICE_ACTION_BASE =
  "inline-flex min-h-[50px] cursor-pointer items-center justify-center gap-sm rounded-sm border px-[26px] text-md font-medium tracking-[0.02em] transition-colors motion-fast ease-standard select-none";
export const NOTICE_ACTION_PRIMARY = `${NOTICE_ACTION_BASE} bg-surface-inverse text-on-inverse border-transparent hover:bg-ink-muted active:bg-ink`;
export const NOTICE_ACTION_SECONDARY = `${NOTICE_ACTION_BASE} bg-surface text-ink border-border-strong hover:border-border-emphasis hover:text-ink active:bg-surface-muted`;

/**
 * The chooser's locale list — `docs/design/wireframes/locale-chooser-desktop.dc.html`'s two-column
 * bordered grid, collapsing to one column below `sm` so a 320 px viewport gets full-width rows.
 * The hairline is drawn on the block-start and inline-start of the list and the block-end and
 * inline-end of each cell, which is the wireframe's construction and is direction-agnostic.
 */
export const NOTICE_LOCALE_LIST =
  "border-rule grid list-none grid-cols-1 border-t border-s p-0 sm:grid-cols-2";
/**
 * The list item, which is the grid cell. `flex` so its single child fills it: without it a row
 * whose neighbour wrapped to two lines (`English (UK)` at 390 px) leaves a blank strip of paper
 * under the shorter one, and the hairline grid stops looking like a grid.
 */
export const NOTICE_LOCALE_ITEM = "flex";
/** One row: the endonym and the path it leads to, 44 px minimum tap target (§5.3, §8). */
export const NOTICE_LOCALE_LINK =
  "border-rule bg-surface-raised gap-md p-lg hover:bg-surface-muted flex w-full min-h-[44px] items-baseline justify-between border-b border-e transition-colors motion-fast ease-standard";
/** The language, in its own language, in the `.display` voice at the `--text-xl` step. */
export const NOTICE_LOCALE_NAME = "display text-xl";
/**
 * The path, in the `.label` voice **minus its uppercase**: `.label` would print `/EN-GB`, and a
 * URL is not a word — the locale segments of `src/config/locales.ts` are lowercase and the page
 * must not suggest otherwise. `whitespace-nowrap` for the same reason: `/en-gb` is one token.
 */
export const NOTICE_LOCALE_PATH =
  "text-ink-subtle text-xs font-medium tracking-[0.14em] whitespace-nowrap";
