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
  "inline-flex min-h-(--control-md) cursor-pointer items-center justify-center gap-[10px] rounded-full px-[28px] text-body-s font-bold leading-[1.1] whitespace-nowrap select-none";
export const NOTICE_ACTION_PRIMARY = `${NOTICE_ACTION_BASE} bg-accent text-on-accent fo-pill [--fo-pill-hover:var(--color-accent-strong)]`;
export const NOTICE_ACTION_SECONDARY = `${NOTICE_ACTION_BASE} bg-transparent text-ink shadow-[inset_0_0_0_1.5px_var(--color-ink)] fo-pill [--fo-pill-hover:var(--color-surface-raised)] [--fo-pill-active:var(--color-surface-muted)] [--fo-pill-inset:1.5px]`;

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

/**
 * The letter: card white, the letter shadow, 640 px at most. **Not tilted**: round 2 tilts
 * nothing (spec 004 §14 A24 clauses 2 and 6; the `errors-*` round-2 artboards; TASK-191), so the
 * letter's computed rotation is 0 on the 404 and on both 500s.
 */
export const NOTICE_LETTER =
  "bg-card shadow-letter rounded-letter relative mx-auto flex w-full max-w-[640px] flex-col px-[22px] pt-[34px] pb-[30px] md:px-[56px] md:pt-[52px] md:pb-[46px]";

/*
 * The 404 as round 2 draws it (`errors-{desktop,mobile}.dc.html`; spec 004 §14 A24 clause 6,
 * AC-40 as rebound; TASK-191): the logo alone in a ruled header (no navigation, no footer), and a
 * `<main>` that fills the rest of the first viewport on the raised paper, with the letter centred
 * over its one decoration, the faint dashed route (an `aria-hidden` inline SVG, static: motion 13
 * is TASK-194's). No stamp, no postmark, no airmail edge.
 */

/**
 * The page: `PAGE_FRAME` (so the logo and the document sit on every page's frame, AC-31), the
 * header bar, then the document under it.
 */
export const NOTICE_404_PAGE =
  "mx-auto flex min-h-svh w-full max-w-[calc(var(--container-page)+2*var(--gutter))] flex-col px-(--gutter-s) md:px-(--gutter)";

/** The header bar: 64 px on a phone and 82 from `md`; the logo alone. */
export const NOTICE_404_HEADER =
  "flex h-[65px] flex-none items-center md:h-[83px]";

/** The header's inner box (the frame is the page's own). */
export const NOTICE_404_HEADER_FRAME = "flex items-center";

/**
 * The document: the raised paper painted to the viewport's edges (a 100vmax spread clipped to the
 * block, the hub bands' device), the header's rule on its top edge, and at least the viewport
 * minus the header tall (AC-40), with the letter centred.
 */
export const NOTICE_404_MAIN =
  "border-rule bg-surface-raised relative grid min-h-[calc(100svh-65px)] place-items-center overflow-hidden border-t pt-[40px] pb-[56px] shadow-[0_0_0_100vmax_var(--color-surface-raised)] [clip-path:inset(0_-100vmax)] md:min-h-[calc(100svh-83px)] md:pt-[48px] md:pb-[72px]";

/** The letter's box inside the document, above the route. */
export const NOTICE_404_FRAME = "relative z-[1] w-full";

/** The dashed route behind the letter: the cornflower link colour, faint, never a target. */
export const NOTICE_404_ROUTE =
  "text-sky pointer-events-none absolute inset-0 h-full w-full opacity-55";

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
