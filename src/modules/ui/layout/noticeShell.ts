/**
 * The notice shell's class list, as plain strings and **nothing else** (spec 004 §5.3, AC-12;
 * TASK-055).
 *
 * Three documents render the same notice: the 404, the localised 500 boundary and the
 * last-resort 500 document (`/` has none since spec 003 §14 A16: it is a 308 to `/en`). Two of
 * them may not share a *component*:
 *
 *  - `src/app/[locale]/error.tsx` and `src/app/global-error.tsx` are Client Components, because
 *    Next requires an error boundary to be one, and whatever they import is compiled into a client
 *    chunk that Next attaches to every document — the growth vector `error-copy.data.ts` and
 *    `error-document.ts` exist to keep closed (spec 004 §14 A1, TASK-046, TASK-085). A React
 *    component from `src/modules/ui` would drag the design system's islands in behind it.
 *
 * So the *markup* is written per document and the **skin is this module**: no import, no JSX, no
 * runtime — a handful of Tailwind class strings that Tailwind's source scan picks up from `src/**`
 * exactly as it picks up a `className` in a component (`ConsentBannerView`'s `CONTROL` is the same
 * trade). One edit changes all three documents, `tests/unit/ui-notice-shell.test.ts` asserts the
 * file imports nothing, and `tests/unit/error-document.test.ts`'s siblings assert each document
 * actually uses it, so they cannot drift into looking like different sites.
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
 * The header's lockup, at the v2 header's own metrics (`SiteHeader`: 28/38 px mark, the wordmark
 * 19/25 px tall), so the 404 and the 500 read as the same site as `/en`.
 */
export const NOTICE_LOCKUP =
  "gap-[10px] text-logo-ink flex min-h-(--target-min) items-center";
export const NOTICE_MARK = "h-[28px] w-[28px] md:h-[38px] md:w-[38px]";
/** The outlined `Wordmark`'s block size: the 404 (a server document). */
export const NOTICE_WORDMARK_OUTLINED = "h-[19px] md:h-[25px]";
/**
 * The wordmark in live type, for the two 500 boundaries only: they are Client Components, and the
 * outlined wordmark's 11 KB of paths would ride into a client chunk on every document (§14 A1).
 */
export const NOTICE_WORDMARK =
  "display text-[19px] tracking-[0.04em] md:text-[25px]";

/** The `.label` voice — 11 px, 600, tracked, uppercase, subtle ink — as the document's metadata. */
export const NOTICE_META = "label";

/** The `display` voice at the v2 error/product H1 step (`--text-title-fluid`): the one `<h1>`. */
export const NOTICE_HEADING = "display text-title-fluid";

/** Body copy at the measure, in the muted ink the canvas gives prose. */
export const NOTICE_BODY =
  "text-ink-muted max-w-prose text-body-s md:text-body";

/** The block that holds the metadata, the heading and the body. */
export const NOTICE_BLOCK = "gap-sm flex flex-col";

/** The action row: wraps rather than overflows a 320 px viewport. */
export const NOTICE_ACTIONS = "gap-md flex flex-wrap items-center";

/**
 * The two actions, as v2's poppy pill and ink-outline pill — the skin `Button`'s `primary` and
 * `secondary` variants render, written out here for the two documents that may not import
 * `Button` (see the header). `tests/unit/ui-notice-shell.test.ts` pins them against `Button`'s own
 * class list, so a change to the design system reaches the failure pages too.
 */
export const NOTICE_ACTION_BASE =
  "inline-flex min-h-(--control-md) cursor-pointer items-center justify-center gap-[10px] rounded-full px-[28px] text-body-s font-bold leading-[1.1] whitespace-nowrap transition-colors motion-fast ease-standard select-none";
export const NOTICE_ACTION_PRIMARY = `${NOTICE_ACTION_BASE} bg-accent text-on-accent hover:bg-accent-strong active:bg-accent-strong active:translate-y-px`;
export const NOTICE_ACTION_SECONDARY = `${NOTICE_ACTION_BASE} bg-transparent text-ink shadow-[inset_0_0_0_1.5px_var(--color-ink)] hover:bg-surface-raised active:bg-surface-muted active:translate-y-px`;

/*
 * The v2 error letter (`docs/design/wireframes/errors-{desktop,mobile}.dc.html`; TASK-179): the
 * 404 and the two 500s are a white letter, tilted, on the paper ground under the lockup — the
 * status as the eyebrow, the `<h1>` at the title step, one sentence and the two actions. The
 * column above is `NoticeDocument`'s mode without a letter. Three of the artboard's marks are
 * left out on purpose: the airmail edge (spec 004 §14 A21 clause 2 allows it in three places
 * only), the postmark (an SVG a client boundary would ship on every document) and the italic
 * split of the heading (a copy change in every locale).
 */

/** The page: the lockup at the top, the letter centred under it. */
export const NOTICE_LETTER_MAIN =
  "mx-auto flex min-h-dvh w-full max-w-[calc(var(--container-page)+2*var(--gutter))] flex-col gap-[56px] px-(--gutter-s) pt-[24px] pb-[72px] md:gap-[112px] md:px-(--gutter) md:pb-[160px]";

/** The letter: card white, the letter shadow and tilt, 640 px at most. */
export const NOTICE_LETTER =
  "bg-card shadow-letter rounded-letter mx-auto flex w-full max-w-[640px] rotate-(--tilt-letter-s) flex-col px-[24px] py-[40px] md:rotate-(--tilt-letter) md:px-[56px] md:pt-[56px] md:pb-[48px]";

/** The status code, in the cornflower eyebrow voice. */
export const NOTICE_LETTER_META = "eyebrow m-0 mb-[14px]";

/**
 * The `<h1>` at the v2 title step: 44 px on a phone, 68 at the 1440 artboard, at the title's own
 * 0.98 leading and -0.025em tracking (the artboard's `.h1t`). `text-title-s`/`text-title` carry a
 * size and no leading, so a two-line "Something went wrong" took the body's 1.55.
 */
export const NOTICE_LETTER_HEADING = "display text-title-fluid m-0";

/** The one sentence, in the lede voice. */
export const NOTICE_LETTER_BODY =
  "text-ink-muted text-body md:text-[21px] m-0 mt-[18px] max-w-[40ch] leading-[1.5]";

/** The two actions, 32 px under the sentence. */
export const NOTICE_LETTER_ACTIONS =
  "mt-[32px] flex flex-wrap items-center gap-[12px]";
