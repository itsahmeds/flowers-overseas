"use client";

/**
 * The language-suggestion island (spec 003 §2 "Suggestion banner", §5.3, §5.4, §8, AC-12, AC-28,
 * §13 Q4/Q9; TASK-041).
 *
 * ADR-0006 in its positive form. The visitor is never redirected, never geolocated and never
 * served a different document: they get the URL they asked for, and *after* hydration this island
 * offers a link to the same page in the language their browser says they prefer. Everything it
 * decides from is client-side — `navigator.languages` and `document.cookie` — so no response
 * varies by request header, there is no `Vary: Accept-Language`, no bot-UA branch and no
 * `Set-Cookie` on a cached page (§5.4, AC-12; spec 001 AC-15 preserved).
 *
 * The decision itself is not here: it is `decideSuggestion()` in `../hints.ts`, a pure function of
 * `{ urlLocale, languages, cookie, dismissed, candidates }`. That split is what makes AC-28's
 * matrix a unit test (`tests/unit/i18n-hints.test.ts`) rather than five browser runs, and it
 * leaves this file with only the parts that genuinely need a browser: two reads, one render, one
 * cookie write.
 *
 * Accessibility (§8, WCAG 2.2.2 / 1.4.13):
 *
 *  - **Reserves no layout space.** The wrapper is `fixed`, so inserting it after hydration cannot
 *    move anything already painted: the CLS delta is 0, which AC-28 measures in the browser.
 *  - **Non-modal.** `role="region"` with an `aria-labelledby` heading, *not* `role="dialog"`: it
 *    blocks nothing, traps no focus and needs no escape hatch to the page behind it. Focus is
 *    never moved on appearance — nothing calls `focus()` — so a keyboard visitor mid-page is not
 *    interrupted; the banner is reachable by continuing to tab, because it is the last thing in
 *    the document.
 *  - **`aria-live="polite"`** announces it once, at the next graceful pause, without stealing the
 *    reading position (§5.3).
 *  - **`Esc` dismisses it**, and so does the dismiss button, satisfying 2.2.2's "dismissible"
 *    without a timeout: the visitor can always get the corner of the viewport back.
 *  - Both other controls are real, activatable elements: "Switch" is an `<a href>` built by
 *    `localePath()` on the server, so it works with a middle click, a long press and a keyboard,
 *    and — should the click handler never run — it still navigates. It carries `lang`/`hrefLang`
 *    for the target language so a screen reader pronounces "Deutsch" in German (WCAG 3.1.2).
 *
 * The `fo_locale` cookie (§13 Q4) is written **only** from a click: "Switch" writes the target,
 * "Stay" writes the current locale, and the banner never returns for either. Dismiss (and `Esc`)
 * deliberately writes **no** cookie — see the header of `dismiss()`.
 */
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useState } from "react";

import {
  type SuggestionCandidate,
  type SuggestionDecision,
  decideSuggestion,
  serialiseLocaleCookie,
} from "../hints.ts";

export interface LocaleSuggestionBannerIslandProps {
  /** The locale of the URL being viewed, from the path segment and nothing else. */
  locale: string;
  /** The launch locales in registry order, projected and linked by the Server Component parent. */
  candidates: readonly SuggestionCandidate[];
}

/**
 * The per-tab dismissal flag. `sessionStorage`, not a cookie, and that is the decision §2 leaves
 * open (it names the overlay "dismissible" and says only that *both actions* — Switch and Stay —
 * write `fo_locale`):
 *
 *  - Dismiss is a "not now", not a language choice. Writing `fo_locale` for it would record a
 *    choice the visitor did not make, and `fo_locale` is the value the currency default and every
 *    later locale decision reads.
 *  - It is per-tab and non-persistent, so it stores no preference at all and stays inside the
 *    same strictly-necessary/functional basis as the cookie (§8, `plan/04` §11) — no consent gate,
 *    nothing to declare beyond the cookie register entry.
 *  - "It never reappears" (§2) is therefore kept exactly for the two actions §2 attaches it to,
 *    while the dismiss button keeps its WCAG 2.2.2 meaning for this visit.
 *
 * Recorded as a deviation-free reading of a silent spec in the PR body.
 */
const DISMISSED_KEY = "fo_locale_suggestion_dismissed";

/** `sessionStorage` throws in a partitioned or storage-blocked context; a `null` is not an error. */
function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    window.sessionStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // A visitor with storage disabled sees the banner again next navigation. That is a worse
    // experience than intended and a better one than a thrown error inside a click handler.
  }
}

/**
 * The one write in the module. `location.protocol` is the browser's own answer to "am I in
 * development": `http://localhost` gets no `Secure` (the browser would drop the cookie and the
 * banner would reappear forever), every deployed origin is https and gets it (§13 Q4).
 */
function writeLocaleCookie(locale: string): void {
  document.cookie = serialiseLocaleCookie(locale, {
    secure: window.location.protocol === "https:",
  });
}

export function LocaleSuggestionBannerIsland({
  locale,
  candidates,
}: LocaleSuggestionBannerIslandProps) {
  // The decision is the island's **initial** state, computed lazily on mount. Reading
  // `navigator` and `document` during the first render is safe here and only here: the dynamic
  // import in `LocaleSuggestionBannerLoader.tsx` is `ssr: false`, so this component has no
  // server pass to disagree with and no hydration to mismatch — which is also what keeps the
  // cached HTML identical for every visitor (§5.4). Doing it in an effect instead would set
  // state synchronously on mount and render twice for no benefit (`react-hooks/
  // set-state-in-effect`), and the state is still what changes when the visitor acts.
  const [decision, setDecision] = useState<SuggestionDecision>(() =>
    decideSuggestion({
      urlLocale: locale,
      languages: window.navigator.languages,
      cookie: document.cookie,
      dismissed: readDismissed(),
      candidates,
    }),
  );

  const dismiss = useCallback(() => {
    rememberDismissed();
    setDecision({ show: false, reason: "dismissed" });
  }, []);

  const shown = decision.show;

  useEffect(() => {
    if (!shown) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [shown, dismiss]);

  if (!decision.show) return null;
  const candidate = decision.target;

  return (
    <LocaleSuggestionBannerView
      target={candidate}
      onStay={() => {
        writeLocaleCookie(locale);
        setDecision({ show: false, reason: "cookie" });
      }}
      // No `preventDefault()`: the cookie is written synchronously and the browser then follows
      // the link itself. A JS-driven `location.assign()` would be a redirect in all but name.
      onSwitch={() => {
        writeLocaleCookie(candidate.code);
      }}
      onDismiss={dismiss}
    />
  );
}

export interface LocaleSuggestionBannerViewProps {
  target: SuggestionCandidate;
  onSwitch: () => void;
  onStay: () => void;
  onDismiss: () => void;
}

/**
 * The markup, split out so it can be rendered and asserted without a browser
 * (`tests/unit/i18n-suggestion-banner.test.tsx`): no effects, no storage, no `document`.
 *
 * Styling is the minimum that makes an overlay legible and is direction-agnostic
 * (`start-0`/`end-0`, never `left`/`right` — `fo/no-physical-css`); spec 004 restyles it without
 * touching the markup or the ARIA.
 */
export function LocaleSuggestionBannerView({
  target: candidate,
  onSwitch,
  onStay,
  onDismiss,
}: LocaleSuggestionBannerViewProps) {
  const t = useTranslations("banner");
  const headlineId = useId();
  const language = candidate.nativeName;

  return (
    <div className="fixed start-0 end-0 bottom-0 z-50">
      <section
        aria-labelledby={headlineId}
        aria-live="polite"
        className="m-2 flex flex-wrap items-center gap-3 border p-3"
        data-fo-banner="shown"
        role="region"
      >
        <p id={headlineId}>{t("headline", { language })}</p>
        <a
          className="underline"
          data-fo-banner-action="switch"
          href={candidate.href}
          hrefLang={candidate.bcp47}
          lang={candidate.bcp47}
          onClick={onSwitch}
        >
          {t("switch", { language })}
        </a>
        <button
          className="underline"
          data-fo-banner-action="stay"
          onClick={onStay}
          type="button"
        >
          {t("stay")}
        </button>
        <button
          aria-label={t("dismiss")}
          className="ms-auto"
          data-fo-banner-action="dismiss"
          onClick={onDismiss}
          type="button"
        >
          {/* No letters, so `fo/no-literal-strings` is satisfied and no locale needs a key for
              it; the accessible name comes from `banner.dismiss` on the button above. */}
          <span aria-hidden="true">✕</span>
        </button>
      </section>
    </div>
  );
}

export default LocaleSuggestionBannerIsland;
