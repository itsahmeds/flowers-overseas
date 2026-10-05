"use client";

/**
 * The lazy client boundary for the language popup (spec 003 §14 A14 Shape as amended by A16,
 * "lazy-imported after hydration"; TASK-119).
 *
 * `next/dynamic` with `ssr: false` is only valid inside a Client Component, and the popup must not
 * be server-rendered: a server pass would have to guess the visitor's cookie and languages, and
 * the cached HTML would then differ between visitors (spec 003 §5.4, AC-9). So this file is the
 * only popup code in the page's initial client bundle: a props pass-through, plus the fail-open
 * timer that gives the screen back to the consent sheet if the island never runs. The gate itself
 * is pending from the first byte: the layout renders it on `<html>` (`localeGate.ts`).
 */
import dynamic from "next/dynamic";
import { useEffect } from "react";

import type { LanguagePopupIslandProps } from "./LanguagePopupIsland.tsx";
import { guardLocaleGate } from "./localeGate.ts";

const Island = dynamic(async () => import("./LanguagePopupIsland.tsx"), {
  ssr: false,
});

export function LanguagePopupLoader(props: LanguagePopupIslandProps) {
  // The same module `dynamic()` loads (one chunk, one request): released at once if it rejects,
  // and after the timeout if the island never takes the gate (`guardLocaleGate`).
  useEffect(() => guardLocaleGate(import("./LanguagePopupIsland.tsx")), []);
  return <Island {...props} />;
}
