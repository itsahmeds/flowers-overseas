"use client";

/**
 * The consent island (spec 004 §2 "Consent", §5.3, §5.4, §8, AC-17, AC-19, AC-20; TASK-051).
 *
 * The only application JavaScript that decides anything about storage. It reads `fo_consent` after
 * hydration, shows the sheet when there is no decision to honour, writes the cookie on an explicit
 * press, tells Consent Mode what changed, records the decision at `POST /api/consent` and does
 * nothing else. Everything it renders arrives as props (§13 Q13 option (b)), so it imports no
 * translator, no cookie register and no zod — which is what keeps a locale document inside §14
 * A1's budget.
 *
 * ## Contracts, and where each one is kept
 *
 *  - **The cached HTML is identical for every visitor.** The island is imported with
 *    `ssr: false` by `ConsentBannerLoader`, so it has no server pass: no `Vary`, no `Set-Cookie`
 *    on a cached response, one cache entry per path (§5.4; spec 001 AC-15, spec 003 AC-12).
 *  - **It reserves no space and steals no focus.** The sheet is `fixed` (CLS delta 0) and nothing
 *    here calls `focus()` on appearance; the visitor reaches it by continuing to tab, because it
 *    is rendered at the end of the document (AC-17).
 *  - **`Esc` records nothing.** It closes the settings panel if one is open and the sheet
 *    otherwise, writes no cookie and sends no request, so the sheet returns on the next page
 *    view. Dismissal is not consent (§8).
 *  - **A cookie is written only from a press.** The one exception is *deleting* a value that
 *    cannot be parsed — see `clearConsentCookie` for why that is not a decision (AC-19's
 *    "treated as no consent and rewritten").
 *  - **Fails closed.** Every browser read is inside a `try`: a throw in a Client Component's first
 *    render replaces the whole document with the error page (the fault spec 003 `/review 23`
 *    found), so the worst outcome of a hostile cookie, a blocked storage context or a missing
 *    `gtag` is a page with no banner.
 *  - **No PII, no page URL.** The recorded body is `{cid, policyVersion, analytics, marketing,
 *    decidedAt}` and the request is sent with `credentials: "omit"` and
 *    `referrerPolicy: "no-referrer"`, so neither a cookie nor the URL of the page the visitor was
 *    reading reaches the endpoint (§8, `docs/compliance/ropa.md` row 3).
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ConsentBannerView, ConsentSavedView } from "./ConsentBannerView";
import {
  type ConsentChoices,
  type StoredConsent,
  choicesOf,
  clearConsentCookie,
  parseConsentCookie,
  rawCookieValue,
  serialiseConsentCookie,
} from "./consentCookie";
import type { ConsentView } from "./consentTypes";

/**
 * The settings panel, in its own chunk, imported the first time it is opened — "the default path
 * pays for the banner only" (§5.3). `next/dynamic` rather than `React.lazy` on purpose: Next
 * records the boundary in the route's `react-loadable-manifest.json`, which is the file
 * `pnpm budget:client-js` reads, so the chunk is *counted* against the budget even on the paths
 * that never fetch it. A measurement that hid this chunk would be the wrong kind of green.
 */
const SettingsPanel = dynamic(() => import("./ConsentSettingsPanel"), {
  ssr: false,
});

/**
 * The locale suggestion's overlay gate (spec 003 §14 A14; TASK-119).
 *
 * §14 A14 puts the language question **before** the consent question: a consent decision recorded
 * in a language the visitor is about to leave reads as the site ignoring the answer, and two
 * sheets stacked at the bottom of a phone is the interstitial Google penalises. The suggestion's
 * loader sets this attribute on `<html>` during hydration — before any `ssr: false` chunk can
 * resolve, so it is always in place before this island mounts — and fires the event when no
 * language question is pending any more.
 *
 * The two names are **restated** rather than imported: this is a Client Component in
 * `src/modules/ui` and the suggestion's is in `src/modules/i18n`, so the only legal import path
 * between them runs through a public barrel that would pull the locale registry and its validator
 * into this chunk (spec 004 §14 A1, the 70 KB zod regression of `/review 26`).
 * `src/modules/i18n/ui/localeGate.ts` is the other copy and `tests/unit/locale-gate.test.ts` pins
 * the two equal in both directions.
 *
 * **It fails open.** If the event never arrives — a failed chunk, a browser that refused the
 * attribute, a future edit that forgets to release — the timeout below shows the sheet anyway. A
 * language courtesy must never be able to suppress a consent question.
 */
const LOCALE_GATE_ATTRIBUTE = "data-fo-locale-gate";
const LOCALE_GATE_RELEASED_EVENT = "fo:locale-gate-released";
const LOCALE_GATE_FALLBACK_MS = 6_000;

/** True while a language question is pending or on screen. Fails open on a hostile DOM. */
function localeQuestionPending(): boolean {
  try {
    return document.documentElement.hasAttribute(LOCALE_GATE_ATTRIBUTE);
  } catch {
    return false;
  }
}

const NO_CHOICES: ConsentChoices = { analytics: false, marketing: false };

type Phase = "hidden" | "shown" | "settings" | "saved";

interface GtagWindow {
  gtag?: (...args: unknown[]) => void;
}

/** Consent Mode v2 grants, in the vocabulary the default-denied bootstrap already used. */
function signal(granted: boolean): "granted" | "denied" {
  return granted ? "granted" : "denied";
}

/**
 * `gtag('consent','update',…)` for a decision (AC-19). Called on every decision, including a
 * refusal: the bootstrap declares `wait_for_update`, so a tag that is waiting must be told the
 * answer either way — and an update whose four signals are all `denied` grants nothing, which is
 * the letter of AC-19's "issues no grant". The analytics category maps to `analytics_storage` and
 * the marketing one to the three ad signals; `functionality_storage`, `personalization_storage`
 * and `security_storage` keep the bootstrap's defaults, because no cookie in the register belongs
 * to them.
 */
export function consentUpdate(
  choices: ConsentChoices,
): Record<string, "granted" | "denied"> {
  return {
    analytics_storage: signal(choices.analytics),
    ad_storage: signal(choices.marketing),
    ad_user_data: signal(choices.marketing),
    ad_personalization: signal(choices.marketing),
  };
}

/** The `POST /api/consent` body, which must parse under the server's `ConsentDecisionSchema`. */
export function consentBody(stored: StoredConsent): Record<string, unknown> {
  return {
    cid: stored.cid,
    policyVersion: stored.v,
    analytics: stored.a,
    marketing: stored.m,
    decidedAt: stored.ts,
  };
}

export interface ConsentBannerIslandProps {
  /** Everything resolved on the server: copy, categories, lifetimes, endpoint (see `ConsentView`). */
  readonly view: ConsentView;
}

export function ConsentBannerIsland({ view }: ConsentBannerIslandProps) {
  const { config, strings, categories } = view;
  const headlineId = useId();
  const idPrefix = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  /** Whatever opened the sheet last, so focus can go back where it came from. */
  const trigger = useRef<HTMLElement | null>(null);

  // The stored decision is the island's **initial** state, read lazily on mount — the pattern and
  // the reasoning of `LocaleSuggestionBannerIsland`: this component has no server pass to
  // disagree with, and an effect would render twice for no benefit.
  const [stored, setStored] = useState<StoredConsent | null>(() => {
    try {
      return parseConsentCookie(document.cookie, {
        name: config.cookieName,
        policyVersion: config.policyVersion,
      });
    } catch {
      return null;
    }
  });
  const [phase, setPhase] = useState<Phase>(() =>
    stored === null ? "shown" : "hidden",
  );
  /**
   * Whether a language question is still pending (spec 003 §14 A14). Read once, on mount, and
   * cleared by the suggestion's event, by the fallback timer, or by the visitor reopening the
   * sheet themselves — in which case there is plainly no dialog in front of it.
   */
  const [localeGated, setLocaleGated] = useState<boolean>(
    localeQuestionPending,
  );
  const [choices, setChoices] = useState<ConsentChoices>(() =>
    stored === null ? NO_CHOICES : choicesOf(stored),
  );

  const secure = (): boolean => window.location.protocol === "https:";

  /** Move focus back to the control that opened the sheet, but only if the sheet holds it. */
  const restoreFocus = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof Node && sheet.current?.contains(active) === true) {
      trigger.current?.focus();
    }
  }, []);

  const close = useCallback(() => {
    restoreFocus();
    setPhase("hidden");
  }, [restoreFocus]);

  // A value we could not parse is deleted rather than left to rot in the browser (AC-19). One
  // pass, on mount: nothing is stored in its place and no request is sent, so no decision is
  // recorded by this effect.
  useEffect(() => {
    if (stored !== null) return;
    try {
      if (rawCookieValue(document.cookie, config.cookieName) === null) return;
      document.cookie = clearConsentCookie({
        name: config.cookieName,
        secure: secure(),
      });
    } catch {
      // A blocked storage context. The banner is showing anyway, which is the safe answer.
    }
    // Mount only: `stored` changes when a decision is made, and a decision writes its own value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The other half of the gate: wait for the language dialog, but never for long (see above).
  useEffect(() => {
    if (!localeGated) return undefined;
    const release = (): void => {
      setLocaleGated(false);
    };
    window.addEventListener(LOCALE_GATE_RELEASED_EVENT, release);
    const timer = window.setTimeout(release, LOCALE_GATE_FALLBACK_MS);
    return () => {
      window.removeEventListener(LOCALE_GATE_RELEASED_EVENT, release);
      window.clearTimeout(timer);
    };
  }, [localeGated]);

  /**
   * Withdrawal, from every page (§8, AC-9). Delegated from the document rather than bound to the
   * footer's button, so the control works wherever it is rendered — the colophon, the component
   * gallery, and whatever spec 007's cookie policy adds — and so this island never imports
   * `SiteFooter` (which would drag the footer, the link registry and zod into its chunk). The
   * attribute is `SiteFooter`'s exported constant, handed over in `config` by the Server
   * Component, so the two tasks still share exactly one string.
   */
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest(`[${config.reopenAttribute}]`);
      if (control === null) return;
      trigger.current = control instanceof HTMLElement ? control : null;
      // An explicit press: whatever the gate says, there is no dialog in front of this sheet.
      setLocaleGated(false);
      setPhase("shown");
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
    };
  }, [config.reopenAttribute]);

  /**
   * `Esc` records nothing, ever (AC-17, §8). It steps back one layer at a time: from the settings
   * panel to the sheet — returning focus to the control that opened it, so a keyboard visitor is
   * not left on a detached node — and from the sheet to nothing. Two presses to leave an open
   * panel is the standard nested-layer behaviour and the only version in which focus survives.
   */
  useEffect(() => {
    if (phase === "hidden") return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (phase === "settings") {
        restoreFocus();
        setPhase("shown");
        return;
      }
      close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [phase, close, restoreFocus]);

  const decide = useCallback(
    (next: ConsentChoices) => {
      const decided: StoredConsent = {
        v: config.policyVersion,
        a: next.analytics,
        m: next.marketing,
        ts: new Date().toISOString(),
        // Reused across a change of mind, so the record proves this browser's consent history
        // rather than reading as two unrelated visitors. `crypto.randomUUID()` is available in
        // every secure context, `http://localhost` included; the server refuses anything that is
        // not a UUID (`ConsentDecisionSchema`).
        cid: stored?.cid ?? crypto.randomUUID(),
      };
      // Any acceptance — including analytics-only from the panel — is kept for 12 months; a
      // refusal for 6, so it is revisited sooner than an acceptance (§8, the register's
      // `secondsOnReject`).
      const accepted = next.analytics || next.marketing;
      try {
        document.cookie = serialiseConsentCookie(decided, {
          name: config.cookieName,
          maxAgeSeconds: accepted
            ? config.acceptMaxAgeSeconds
            : config.rejectMaxAgeSeconds,
          secure: secure(),
        });
      } catch {
        // Storage blocked: the decision still reaches Consent Mode and the record below, and the
        // sheet returns next page view. Better than a thrown handler on a press.
      }
      try {
        (window as GtagWindow).gtag?.("consent", "update", consentUpdate(next));
      } catch {
        // No tag, or a tag that threw. Neither changes what the visitor decided.
      }
      try {
        void fetch(config.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(consentBody(decided)),
          cache: "no-store",
          // No cookie and no `Referer`: the record is unlinkable and carries no page URL (§8).
          credentials: "omit",
          referrerPolicy: "no-referrer",
          keepalive: true,
        }).catch(() => undefined);
      } catch {
        // A refused `fetch` must not lose the visitor's choice; the cookie is already written.
      }
      restoreFocus();
      setStored(decided);
      setChoices(next);
      setPhase("saved");
    },
    [config, stored, restoreFocus],
  );

  if (phase === "hidden") return null;
  // The language question owns the screen first (spec 003 §14 A14). Nothing is decided, written or
  // recorded here: the sheet is simply not painted yet, and the effect above puts it back.
  if (localeGated) return null;

  if (phase === "saved") {
    return (
      <ConsentSavedView
        headlineId={headlineId}
        onClose={close}
        sheetRef={sheet}
        strings={strings}
      />
    );
  }

  return (
    <ConsentBannerView
      headlineId={headlineId}
      onAccept={() => {
        decide({ analytics: true, marketing: true });
      }}
      onOpenSettings={() => {
        trigger.current = settingsButton.current;
        setPhase("settings");
      }}
      onReject={() => {
        decide(NO_CHOICES);
      }}
      settingsRef={settingsButton}
      sheetRef={sheet}
      strings={strings}
    >
      {phase === "settings" ? (
        <SettingsPanel
          categories={categories}
          choices={choices}
          idPrefix={idPrefix}
          onSave={() => {
            decide(choices);
          }}
          onToggle={(category, on) => {
            setChoices((current) => ({ ...current, [category]: on }));
          }}
          strings={strings}
          takeFocus
        />
      ) : undefined}
    </ConsentBannerView>
  );
}

export default ConsentBannerIsland;
