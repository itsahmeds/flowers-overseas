"use client";

/**
 * The consent sheet's markup (spec 004 §5.3, §8, AC-17, AC-20; TASK-051).
 *
 * Split from the island for the reason `LocaleSuggestionBannerView` was: no effect, no storage, no
 * `document`, so every state is rendered and asserted with `react-dom/server` in
 * `tests/unit/consent-islands.test.tsx` instead of in a browser. Every string arrives as a prop
 * (§13 Q13 option (b)) — this file imports no translator and therefore adds no message payload to
 * the client bundle (§14 A1).
 *
 * ## The three decisions this markup makes
 *
 * **Non-modal, and not a dialog.** `role="region"` with `aria-live="polite"`, exactly like the
 * language-suggestion banner: it traps no focus, moves no focus on appearance, dims nothing and
 * blocks nothing (AC-17, WCAG 1.4.13/2.2.2). `docs/design/flows/consent-and-locale.dc.html`
 * sketches a dimmed page with a focus trap, and its own note says the consent sheet is "not yet
 * specified — see docs/design/README.md"; where the artboard and the spec differ, the spec is the
 * contract, and §5.3/AC-17/§8 say "non-modal", "does not steal focus", "blocks no content" and "no
 * cookie wall" three times over. Recorded in the PR body rather than silently resolved.
 *
 * **Equal weight, measured rather than asserted.** The three controls are one component —
 * `Control` below — rendered from the single `CONTROL` class list inside a three-column grid of
 * equal tracks, so their rendered width, font size, weight and colour pair are *identical by
 * construction* and AC-20's computed-style assertion has nothing to catch. The accent green is
 * deliberately unused here: it is the finder's `Continue` colour, and an accented "Accept" beside
 * two ink-on-paper alternatives is the exact dark pattern §8 forbids. Order follows the
 * artboard — refuse, choose, accept — so the cheapest click is never the one that consents.
 *
 * **That one component is written here rather than borrowed from `Button`.** `Button` is a
 * Server-Component primitive with no `onClick`, five variants and a class-computation pass, and
 * pulling it into a client island cost 900 B Brotli of §14 A1's headroom for four variants
 * nothing here uses. `Control` below is the canvas's `.btn.secondary` as one constant string, so
 * the three sheet controls still come from **one** component with **one** class list — which is
 * the property AC-20 needs — at the price of a duplicated skin that
 * `tests/unit/consent-islands.test.tsx` pins against `Button`'s.
 *
 * **Overlay, never reflow.** The wrapper is `fixed`, so the sheet cannot move a painted pixel: the
 * CLS delta is 0 (AC-17). `layer-overlay` is the named z-scale step above `--layer-banner`, which
 * is what paints it over the language suggestion (AC-13) and the sticky header.
 */
import type { ReactElement, ReactNode, Ref } from "react";

import type { ConsentStrings } from "./consentTypes";

/**
 * The attribute the sheet carries, with its state as the value (`shown`, `settings`, `saved`) —
 * the selector the e2e, a11y and visual suites use, so no test ever selects on copy. Written as a
 * constant here and as literal `data-fo-consent*` props below, the way `SiteFooter` writes
 * `data-fo-consent-reopen`: one place to read, and JSX that greps.
 */
export const CONSENT_SHEET_ATTRIBUTE = "data-fo-consent";
/** `data-fo-consent-action="accept|reject|settings|save|close"` names each control. */
export const CONSENT_ACTION_ATTRIBUTE = "data-fo-consent-action";

/**
 * Bottom sheet on mobile, inline card at the inline start on desktop (the artboard's two forms).
 * Logical properties only — `start`/`end`, never `left`/`right` (`fo/no-physical-css`), so the
 * card sits on the correct side of an RTL document with no extra rule.
 */
const SHEET =
  "layer-overlay fixed start-0 end-0 bottom-0 sm:end-auto sm:m-lg sm:max-w-[34rem]";
/** The gallery's in-flow variant of `SHEET`: same surface, no viewport anchoring. */
const INLINE_SHEET = "relative max-w-[34rem]";
/**
 * The surface. `max-h-[85dvh] overflow-y-auto` is not decoration: with eleven register rows open,
 * the panel is taller than a 390x844 phone, and a `fixed` sheet anchored to the bottom pushes its
 * own top off the screen where nothing can scroll it back (WCAG 1.4.10 Reflow). Capping it and
 * scrolling *inside* the sheet keeps every row and every control reachable at 320 px and at 200%
 * text; `overscroll-contain` stops that scroll from running on to the page behind it.
 */
const PANEL =
  "bg-surface border-border-strong text-ink max-h-[85dvh] overflow-y-auto overscroll-contain border-t p-md shadow-md sm:rounded-sm sm:border";

/**
 * The canvas's `.btn.secondary`, verbatim and once: ink on paper, a strong hairline, 50 px tall
 * (44 px at `sm`), medium weight, tracked 0.02em. Identical for all three sheet controls, which
 * is what makes AC-20's computed-style assertion pass by construction.
 */
const CONTROL =
  "inline-flex min-h-[50px] w-full cursor-pointer items-center justify-center rounded-sm border border-border-strong bg-surface px-[26px] text-md font-medium tracking-[0.02em] text-ink transition-colors motion-fast ease-standard select-none hover:border-border-emphasis active:bg-surface-muted";
/** The `saved` state's dismiss control: the same skin, one step smaller, not full width. */
export const CONSENT_CONTROL_SM =
  "inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-sm border border-border-strong bg-surface px-md text-sm font-medium tracking-[0.02em] text-ink transition-colors motion-fast ease-standard select-none hover:border-border-emphasis active:bg-surface-muted";

interface ControlProps {
  readonly action: string;
  readonly label: string;
  readonly onClick: () => void;
  readonly small?: boolean | undefined;
  readonly controlRef?: Ref<HTMLButtonElement> | undefined;
}

function Control({
  action,
  label,
  onClick,
  small = false,
  controlRef,
}: ControlProps): ReactElement {
  return (
    <button
      className={small ? CONSENT_CONTROL_SM : CONTROL}
      data-fo-consent-action={action}
      onClick={onClick}
      ref={controlRef}
      type="button"
    >
      {label}
    </button>
  );
}

export interface ConsentSheetProps {
  readonly state: "shown" | "settings" | "saved";
  readonly labelledBy: string;
  readonly children: ReactNode;
  readonly sheetRef?: Ref<HTMLDivElement> | undefined;
  /**
   * Gallery only (`/dev/components`): render in flow instead of fixed to the viewport, so seven
   * states can be photographed in one document instead of stacking on top of each other. The
   * same escape hatch, with the same "nothing outside the gallery may pass it" rule, as
   * `Button`'s `forceState`.
   */
  readonly inline?: boolean | undefined;
}

/** The positioned surface every state shares, so all three paint in the same place. */
export function ConsentSheet({
  state,
  labelledBy,
  children,
  sheetRef,
  inline = false,
}: ConsentSheetProps): ReactElement {
  return (
    <div className={inline ? INLINE_SHEET : SHEET} ref={sheetRef}>
      <section
        aria-labelledby={labelledBy}
        aria-live="polite"
        className={PANEL}
        role="region"
        data-fo-consent={state}
      >
        {children}
      </section>
    </div>
  );
}

/**
 * The body copy, split into its authored paragraphs on the blank line in the catalogue value
 * (TASK-056; AC-24's LCP assertion).
 *
 * Measured, not styled by taste. The sheet is an `ssr: false` island, so everything it paints
 * appears **after** hydration — 2.36 s of render delay on Lighthouse's throttled mobile profile.
 * As one 187-character block the body measured 20 748 px² against the hero `H1`'s 16 461 px², so
 * it was the page's *largest* contentful paint and `/de` reported LCP 2.66–2.82 s against a
 * 2 000 ms budget, while the page's own main content — the `H1` — had been on screen since FCP
 * (1.06 s). Two paragraphs are two text blocks (≈11.5 KB px² and ≈9.2 KB px²), so the LCP element
 * is the heading again and the number describes when the main content appeared instead of when a
 * compliance overlay did.
 *
 * What this does **not** do is make the sheet itself paint sooner; only server-rendering it would,
 * and AC-17/§5.4 require the opposite (no consent markup in the cached document). That is recorded
 * as an open decision on TASK-056 rather than taken here. `tests/e2e/lcp.spec.ts` is the guard: it
 * fails if any text block in the sheet grows past the heading again — which a real German or
 * Polish translation of this copy could do.
 *
 * The separator is a blank line in the message value, so a translator controls the break in their
 * own language and no code guesses at sentence boundaries.
 */
export function bodyParagraphs(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
}

export interface ConsentBannerViewProps {
  readonly strings: ConsentStrings;
  /** The `id` of the headline, so the region is named by what a reader sees. */
  readonly headlineId: string;
  readonly onAccept: () => void;
  readonly onReject: () => void;
  readonly onOpenSettings: () => void;
  readonly settingsRef?: Ref<HTMLButtonElement> | undefined;
  readonly sheetRef?: Ref<HTMLDivElement> | undefined;
  /** Gallery only: see `ConsentSheetProps`. */
  readonly inline?: boolean | undefined;
  /** The lazily imported settings panel, or nothing when it is closed. */
  readonly children?: ReactNode | undefined;
}

export function ConsentBannerView({
  strings,
  headlineId,
  onAccept,
  onReject,
  onOpenSettings,
  settingsRef,
  sheetRef,
  inline,
  children,
}: ConsentBannerViewProps): ReactElement {
  return (
    <ConsentSheet
      inline={inline}
      labelledBy={headlineId}
      sheetRef={sheetRef}
      state={children === undefined ? "shown" : "settings"}
    >
      <h2
        className="text-ink-subtle text-xs font-medium tracking-[0.14em] uppercase"
        id={headlineId}
      >
        {strings.headline}
      </h2>
      {bodyParagraphs(strings.body).map((paragraph) => (
        <p className="text-ink-muted mt-sm max-w-prose text-sm" key={paragraph}>
          {paragraph}
        </p>
      ))}
      {children}
      {/* Three equal tracks, three full-width buttons of one variant: equal rendered width, font
          size, weight and contrast, by construction (AC-20). `minmax(0,1fr)` rather than `1fr`
          so a long German label wraps inside its track instead of widening it (§7). */}
      <div className="mt-md gap-sm grid grid-cols-1 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
        <Control action="reject" label={strings.reject} onClick={onReject} />
        <Control
          action="settings"
          controlRef={settingsRef}
          label={strings.settings}
          onClick={onOpenSettings}
        />
        <Control action="accept" label={strings.accept} onClick={onAccept} />
      </div>
    </ConsentSheet>
  );
}

export interface ConsentSavedViewProps {
  readonly strings: ConsentStrings;
  readonly headlineId: string;
  readonly onClose: () => void;
  readonly sheetRef?: Ref<HTMLDivElement> | undefined;
  /** Gallery only: see `ConsentSheetProps`. */
  readonly inline?: boolean | undefined;
}

/**
 * The `saved` state of §5.3: one confirmation line and a control that removes it. It carries the
 * live region's `role="status"` through the shared `ConsentSheet` (`aria-live="polite"`), so the
 * decision is announced without stealing the reading position, and it is dismissible, so nothing
 * of the page stays covered (WCAG 1.4.13). No timer dismisses it: a message that disappears on
 * its own is one a slow reader never read.
 */
export function ConsentSavedView({
  strings,
  headlineId,
  onClose,
  sheetRef,
  inline,
}: ConsentSavedViewProps): ReactElement {
  return (
    <ConsentSheet
      inline={inline}
      labelledBy={headlineId}
      sheetRef={sheetRef}
      state="saved"
    >
      <p className="text-ink text-sm" id={headlineId}>
        {strings.saved}
      </p>
      <div className="mt-md">
        <Control action="close" label={strings.close} onClick={onClose} small />
      </div>
    </ConsentSheet>
  );
}
