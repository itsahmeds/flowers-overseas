"use client";

/**
 * The lazy client boundary for the locale suggestion dialog (spec 003 §2, §5.3 "Lazy-imported
 * after hydration", §5.4 "Client JS added: the banner island only, dynamically imported", §14 A14;
 * TASK-041, TASK-119).
 *
 * A props pass-through with one effect, and two reasons to exist:
 *
 *  - `next/dynamic` with `ssr: false` is only valid inside a Client Component, and the dialog must
 *    not be server-rendered — a server pass would have to guess the visitor's language or read
 *    their country into the document, which is the one thing ADR-0006 forbids and what would make
 *    the cached HTML differ between visitors (§5.4, AC-7, AC-9). So the boundary lives here rather
 *    than in `src/app/[locale]/layout.tsx`: `app/` stays thin (`plan/01` §5) and the island lands
 *    in its own chunk the browser fetches after hydration.
 *  - it **claims the overlay gate during hydration**, which is before any `ssr: false` chunk can
 *    resolve. That ordering is the whole of §14 A14's "shown before the consent sheet, which waits
 *    for the dialog to close": the consent island reads the flag when it mounts, and by then it is
 *    either set (a language question may be coming) or the suggestion has already answered. The
 *    timeout is the fail-open half — see `localeGate.ts`.
 *
 * This file is the only dialog code in the page's initial client bundle: no state, no locale
 * registry, no message catalogue anywhere in its graph. Everything the island needs arrives as
 * props from `LocaleSuggestionDialog.tsx` — the launch locales, their native names, their
 * `localePath()`-built hrefs, and every string already ICU-resolved in the language it offers. The
 * registry therefore never crosses into the browser and the locale set cannot be reconfigured from
 * a client chunk (AC-3's objection).
 */
import dynamic from "next/dynamic";
import { useEffect } from "react";

import type { LocaleSuggestionDialogIslandProps } from "./LocaleSuggestionDialogIsland.tsx";
import {
  LOCALE_GATE_TIMEOUT_MS,
  claimLocaleGate,
  releaseAbandonedLocaleGate,
} from "./localeGate.ts";

const Island = dynamic(
  async () => import("./LocaleSuggestionDialogIsland.tsx"),
  { ssr: false },
);

export function LocaleSuggestionDialogLoader(
  props: LocaleSuggestionDialogIslandProps,
) {
  useEffect(() => {
    claimLocaleGate();
    // Fail open: if the island's chunk never arrives, the consent sheet must not be held hostage
    // by a language courtesy. The island takes the gate over (`hold`) long before this fires.
    const timer = window.setTimeout(
      releaseAbandonedLocaleGate,
      LOCALE_GATE_TIMEOUT_MS,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return <Island {...props} />;
}
