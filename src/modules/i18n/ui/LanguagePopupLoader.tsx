"use client";

/**
 * The lazy client boundary for the language popup (spec 003 §14 A14 Shape as amended by A16,
 * "lazy-imported after hydration"; TASK-119).
 *
 * The popup must not be server-rendered: a server pass would have to guess the visitor's cookie and
 * languages, and the cached HTML would then differ between visitors (spec 003 §5.4, AC-9). It is
 * not: `AfterPaint` renders this loader only on the client, inside a `Suspense`, so a
 * `React.lazy` import is enough and `next/dynamic`'s runtime stays off every page (TASK-376). So
 * this file is the only popup code in the page's initial client bundle: a props pass-through, plus the fail-open
 * timer that gives the screen back to the consent sheet if the island never runs. The gate itself
 * is pending from the first byte: the layout renders it on `<html>` (`localeGate.ts`).
 *
 * **After the LCP paint** (spec 004 §14 A-founder-2026-10-15b, AC-55; TASK-244): the layout mounts
 * `LanguagePopup` inside `<AfterPaint island="language-popup" on="paint">` (`src/modules/ui`), so this
 * loader renders, and its `import()` runs, only after the LCP has painted, on idle or at the first
 * interaction. The fail-open timer starts then too. Nothing may import the island statically
 * (`tests/unit/deferred-set.test.tsx`).
 */
import { type ComponentType, lazy, useEffect } from "react";

import type { LanguagePopupIslandProps } from "./LanguagePopupIsland.tsx";
import { guardLocaleGate, withGateRelease } from "./localeGate.ts";

// The one `import()` of the island. A rejected chunk releases the consent gate at once and renders
// nothing (`withGateRelease`), rather than reaching the page's error boundary.
const Island = lazy<ComponentType<LanguagePopupIslandProps>>(async () =>
  withGateRelease(import("./LanguagePopupIsland.tsx")),
);

export function LanguagePopupLoader(props: LanguagePopupIslandProps) {
  // The island never took the gate (its chunk never arrived, or never ran): give the screen back
  // to the consent sheet after the timeout (`guardLocaleGate`).
  useEffect(() => guardLocaleGate(), []);
  return <Island {...props} />;
}
