"use client";

/**
 * The locale suggestion island (spec 003 §2 "Suggestion banner" as amended by **§14 A14**, §5.3,
 * §5.4, §8, AC-12, AC-28, §13 Q4/Q9; TASK-041, TASK-119).
 *
 * ADR-0006 in its positive form, and the founder's ruling of 2026-09-16 inside it. The visitor is
 * never redirected and never served a different document: they get the URL they asked for, and
 * *after* hydration this island offers — in a popup they answer once — the same page in the
 * language their browser, or failing that their country, suggests. Nothing here can navigate on
 * its own: the only way to another locale is the visitor pressing a real `<a href>`.
 *
 * ## What the browser does, in order
 *
 *  1. **Decide from the browser alone.** `decideSuggestion()` in `../hints.ts` is a pure function
 *     of `{ urlLocale, languages, cookie, candidates }`; a recorded `fo_locale`, a matching
 *     language or an unknown URL locale all end here with nothing shown, and no request is made.
 *  2. **Ask `/api/geo` only when that found nothing** (`noBetterLocale`). That is §14 A14's order —
 *     `navigator.languages` first, the edge country header second — and it means a visitor whose
 *     browser names a launch locale is never geolocated at all. The fetch is `no-store`, carries
 *     no cookie and no `Referer`, aborts after two seconds, and its answer (a two-letter country
 *     code) is used once, in memory, and stored nowhere (`docs/compliance/ropa.md`).
 *  3. **Open a native `<dialog>` modally**, which is what gives the popup its focus trap, its
 *     `Esc` handling, its backdrop and its top-layer paint without a line of trapping code of our
 *     own. `Esc` is *stay*: `onCancel` records the current locale exactly as the button does, so
 *     the question is never asked twice however it is answered (§14 A14 "two actions only").
 *  4. **Restore focus** to whatever had it before the dialog opened, after moving it to the
 *     primary action on open (§14 A14, WCAG 2.4.3).
 *
 * ## The contracts that are not visible in the markup
 *
 *  - **Zero CLS.** The dialog renders only while it is open, and an open modal `<dialog>` paints
 *    in the top layer, out of flow: it cannot move a pixel that is already on screen (AC-28).
 *  - **The cached HTML is identical for every visitor.** This module is imported with `ssr: false`
 *    by `LocaleSuggestionDialogLoader`, so it has no server pass: no `Vary`, no `Set-Cookie` on a
 *    page, one cache entry per path (§5.4, AC-7, AC-9, AC-12).
 *  - **It fails closed.** Every browser read is inside a `try`. A throw in a Client Component's
 *    first render unwinds to the root and replaces the document with the error page — the fault
 *    spec 003 `/review 23` found — and a language courtesy is never worth a page.
 *  - **It fails open for consent.** The overlay gate it holds (`localeGate.ts`) is released on
 *    every terminal path, including the ones that render nothing, so the consent sheet can never
 *    be suppressed by this island.
 *  - **`data-fo-banner` is kept as the test hook** although the component is now a dialog: it is
 *    the selector the e2e, a11y and visual suites of four other specs use to assert that *no*
 *    suggestion is on screen, and renaming it would edit those files for no behavioural gain.
 */
import {
  type ReactElement,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  type SuggestionCandidate,
  type SuggestionDecision,
  decideSuggestion,
  serialiseLocaleCookie,
} from "../hints.ts";

import { holdLocaleGate, releaseLocaleGate } from "./localeGate.ts";
import type {
  SuggestionCopy,
  SuggestionTargetCopy,
} from "./suggestionTypes.ts";

export interface LocaleSuggestionDialogIslandProps {
  /** The locale of the URL being viewed, from the path segment and nothing else. */
  locale: string;
  /** The launch locales in registry order, projected and linked by the Server Component parent. */
  candidates: readonly SuggestionCandidate[];
  /** Every string this island renders, resolved and ICU-formatted by that same parent. */
  copy: SuggestionCopy;
}

/** The country endpoint: `no-store`, country code only, nothing stored (spec 003 §14 A14). */
const GEO_ENDPOINT = "/api/geo";

/**
 * How long the country hint may take before the island gives up on it. Two seconds is longer than
 * an edge route needs and short enough to stay well inside the loader's fail-open timeout, so the
 * consent sheet's worst case is bounded by this number rather than by a stalled connection.
 */
const GEO_TIMEOUT_MS = 2_000;

/**
 * The one cookie write in the module. `location.protocol` is the browser's own answer to "am I in
 * development": `http://localhost` gets no `Secure` (the browser would drop the cookie and the
 * dialog would reappear forever), every deployed origin is https and gets it (§13 Q4).
 */
function writeLocaleCookie(locale: string): void {
  try {
    document.cookie = serialiseLocaleCookie(locale, {
      secure: window.location.protocol === "https:",
    });
  } catch {
    // Storage blocked, or a locale the enum refuses. The dialog still closes; it will ask again
    // on the next page view, which is a better outcome than a thrown click handler.
  }
}

/** The country `GET /api/geo` reports, or `null` for every failure mode there is. */
async function fetchCountry(): Promise<string | null> {
  try {
    const response = await fetch(GEO_ENDPOINT, {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const country = (body as { country?: unknown }).country;
    return typeof country === "string" ? country : null;
  } catch {
    return null;
  }
}

export function LocaleSuggestionDialogIsland({
  locale,
  candidates,
  copy,
}: LocaleSuggestionDialogIslandProps) {
  // The decision is the island's **initial** state, computed lazily on mount: reading `navigator`
  // and `document` during the first render is safe here and only here, because the dynamic import
  // is `ssr: false`, so this component has no server pass to disagree with and no hydration to
  // mismatch — which is also what keeps the cached HTML identical for every visitor (§5.4).
  const [decision, setDecision] = useState<SuggestionDecision>(() => {
    try {
      return decideSuggestion({
        urlLocale: locale,
        languages: window.navigator.languages,
        cookie: document.cookie,
        candidates,
      });
    } catch {
      return { show: false, reason: "error" };
    }
  });
  /** Whether the country hint has been asked for; it is asked at most once per document. */
  const [askedForCountry, setAskedForCountry] = useState(false);

  const dialog = useRef<HTMLDialogElement>(null);
  const primary = useRef<HTMLAnchorElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const headlineId = useId();

  const awaitingCountry = !decision.show
    ? decision.reason === "noBetterLocale" && !askedForCountry
    : false;

  // The second hint. Runs only on the one branch §14 A14 allows it on, and only once.
  useEffect(() => {
    if (!awaitingCountry) return undefined;
    let cancelled = false;
    void fetchCountry().then((country) => {
      if (cancelled) return;
      setAskedForCountry(true);
      try {
        setDecision(
          decideSuggestion({
            urlLocale: locale,
            languages: window.navigator.languages,
            cookie: document.cookie,
            country,
            candidates,
          }),
        );
      } catch {
        setDecision({ show: false, reason: "error" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [awaitingCountry, locale, candidates]);

  // The overlay gate: held while a question is pending or on screen, released the moment there is
  // a final answer — including "nothing to suggest" (`localeGate.ts`; §14 A14's sequencing).
  useEffect(() => {
    if (decision.show || awaitingCountry) {
      holdLocaleGate();
      return;
    }
    releaseLocaleGate();
  }, [decision, awaitingCountry]);

  // Open it modally, and move focus to the primary action (§14 A14). `showModal()` is what puts
  // the dialog in the top layer, dims the page through `::backdrop`, traps focus and turns `Esc`
  // into a `cancel` event — four behaviours we would otherwise have to write and test ourselves.
  useEffect(() => {
    const node = dialog.current;
    if (node === null || !decision.show) return;
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    try {
      if (!node.open) node.showModal();
      primary.current?.focus();
    } catch {
      // A browser that refuses `showModal()` (or a test environment without the top layer) still
      // has the dialog in the DOM with its content readable; nothing else depends on the call.
    }
  }, [decision.show]);

  /** Record a choice, close the popup and hand focus back. Both actions end here. */
  const choose = useCallback((chosen: string) => {
    writeLocaleCookie(chosen);
    try {
      dialog.current?.close();
    } catch {
      // Already closed.
    }
    previouslyFocused.current?.focus();
    setDecision({ show: false, reason: "cookie" });
  }, []);

  if (!decision.show) return null;

  const targetCopy: SuggestionTargetCopy | undefined =
    copy.targets[decision.target.code];
  // Fail closed for the same reason the `useState` initialiser catches: the copy and the
  // candidates are projected from the same registry by the same Server Component, so a missing
  // entry is unreachable — and if it ever becomes reachable, no dialog beats a blank one.
  if (targetCopy === undefined) return null;

  // "You seem to be in Germany…" when the country produced the suggestion and we have that
  // country's sentence; otherwise the language-only wording. The fallback is a real case, not a
  // defensive one: every country the table does not name maps to the x-default locale, and
  // resolving a sentence for all 249 of them would be absurd for a one-line courtesy.
  const headline =
    decision.source === "country" && decision.country !== undefined
      ? (targetCopy.headlineByCountry[decision.country] ?? targetCopy.headline)
      : targetCopy.headline;

  return (
    <LocaleSuggestionDialogView
      continueRef={primary}
      dialogRef={dialog}
      headline={headline}
      headlineId={headlineId}
      onContinue={() => {
        // No `preventDefault()`: the cookie is written synchronously and the browser then follows
        // the link itself. A JS-driven `location.assign()` would be a redirect in all but name.
        writeLocaleCookie(decision.target.code);
      }}
      onStay={() => {
        choose(locale);
      }}
      stayLabel={copy.stay}
      switchLabel={targetCopy.continueLabel}
      target={decision.target}
    />
  );
}

export interface LocaleSuggestionDialogViewProps {
  target: SuggestionCandidate;
  /** The resolved headline, in the target language. */
  headline: string;
  headlineId: string;
  /** `suggestion.continue`, in the target language. */
  switchLabel: string;
  /** `suggestion.stay`, in the language of the page behind the dialog. */
  stayLabel: string;
  onContinue: () => void;
  onStay: () => void;
  dialogRef?: Ref<HTMLDialogElement>;
  continueRef?: Ref<HTMLAnchorElement>;
}

/**
 * The popup itself (spec 003 §14 A14 "Shape"), drawn in
 * `docs/design/system/components.dc.html` at both widths.
 *
 * **Mobile: a bottom sheet capped at 35 % of the viewport.** That number is Google's
 * intrusive-interstitial rule for a first visit from search, not a taste: above it the page behind
 * stops being readable and the URL becomes a ranking liability, which is priority #1 in
 * `CLAUDE.md`. **Desktop: a centred card** over the dimmed page, which is what `::backdrop` paints.
 *
 * **Two actions, and they are not equals in meaning but are in weight.** "Continue in Deutsch" is a
 * real `<a href>` built by `localePath()` on the server — it works with a middle click, a long
 * press and a keyboard, and if the click handler never runs it still navigates — and it carries
 * `lang`/`hrefLang` so a screen reader pronounces the language's own name correctly (WCAG 3.1.2).
 * "Stay in English" is a `<button>` in the current locale's language, because staying is not a
 * navigation. Both wear the same skin: a popup whose "yes" is prettier than its "no" is a dark
 * pattern, and §8 forbids it here exactly as AC-20 does for the consent sheet.
 *
 * Split from the island so every state can be rendered and asserted with `react-dom/server`
 * (`tests/unit/i18n-suggestion-dialog.test.tsx`): no effects, no storage, no `document`, no
 * translator — every string arrives as a prop, already ICU-resolved on the server.
 *
 * Direction-agnostic throughout (`start`/`end`, `ms-`/`me-`, never `left`/`right` —
 * `fo/no-physical-css`).
 */
export function LocaleSuggestionDialogView({
  target,
  headline,
  headlineId,
  switchLabel,
  stayLabel,
  onContinue,
  onStay,
  dialogRef,
  continueRef,
}: LocaleSuggestionDialogViewProps): ReactElement {
  return (
    <dialog
      aria-labelledby={headlineId}
      className={DIALOG}
      data-fo-banner="shown"
      data-fo-locale-dialog="shown"
      onCancel={(event) => {
        // `Esc` is "stay" (§14 A14), so it records the current locale instead of closing the
        // dialog unanswered — which would ask the same question again on the next page view.
        event.preventDefault();
        onStay();
      }}
      ref={dialogRef}
    >
      <div className={PANEL}>
        <p className="text-md" id={headlineId} lang={target.bcp47}>
          {headline}
        </p>
        <div className="gap-sm flex flex-wrap items-center">
          <a
            className={CONTROL}
            data-fo-banner-action="continue"
            href={target.href}
            hrefLang={target.bcp47}
            lang={target.bcp47}
            onClick={onContinue}
            ref={continueRef}
          >
            {switchLabel}
          </a>
          <button
            className={CONTROL}
            data-fo-banner-action="stay"
            onClick={onStay}
            type="button"
          >
            {stayLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * The popup's frame. The UA stylesheet's border, padding and background are reset here and the
 * surface is drawn on the panel inside, so the two forms differ only in where the box sits:
 *
 *  - **mobile** — full width at the block end (`mt-auto`), capped at 35 dvh, with the top corners
 *    rounded: a compact bottom sheet that leaves the page visible above it;
 *  - **`sm:` and up** — a 28 rem card centred by the UA's `margin: auto`.
 *
 * `scrim-backdrop` is the dim, painted by the browser's own `::backdrop` in the top layer, so
 * nothing in the document needs a z-index and the named layer scale is untouched.
 */
const DIALOG =
  "me-0 ms-0 mt-auto mb-0 w-full max-w-full rounded-t-md border-0 bg-transparent p-0 scrim-backdrop sm:m-auto sm:w-[28rem] sm:max-w-[calc(100%-2rem)] sm:rounded-sm";

/** The surface: the consent sheet's three semantic tokens, its hairline, radius and shadow. */
const PANEL =
  "bg-surface border-border-strong text-ink gap-md p-md flex max-h-[35dvh] flex-col justify-center overflow-y-auto overscroll-contain rounded-t-md border shadow-md sm:max-h-[80dvh] sm:rounded-sm";

/**
 * The canvas's `.btn.secondary` at the small size, verbatim and once, for **both** controls — the
 * same skin and the same reasoning as `ConsentBannerView`'s `CONTROL`: one class list, so neither
 * action of this dialog can end up looking more inviting than the other, and 44 px of tap target
 * (§5.3, §8). Written here rather than imported from `src/modules/ui` because a Client Component
 * in `src/modules/i18n` may only cross the module boundary through that module's public barrel,
 * which would put the design system's islands in this chunk (spec 004 §14 A1).
 */
const CONTROL =
  "border-border-strong bg-surface text-ink hover:border-border-emphasis active:bg-surface-muted px-md text-sm inline-flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-sm border font-medium tracking-[0.02em] transition-colors motion-fast ease-standard select-none";

export default LocaleSuggestionDialogIsland;
