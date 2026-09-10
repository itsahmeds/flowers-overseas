"use client";

/**
 * The lazy client boundary for the suggestion banner (spec 003 §2, §5.3 "Lazy-imported after
 * hydration", §5.4 "Client JS added: the banner island only, dynamically imported"; TASK-041).
 *
 * Three lines of code and one reason to exist: `next/dynamic` with `ssr: false` is only valid
 * inside a Client Component, and the banner must not be server-rendered — a server pass would
 * have to guess the visitor's languages, which is the one thing ADR-0006 forbids, and it would
 * make the cached HTML differ between visitors (§5.4, AC-9). So the boundary lives here rather
 * than in `src/app/[locale]/layout.tsx`: `app/` stays thin (`plan/01` §5), the layout renders one
 * Server Component, and the island lands in its own chunk that the browser fetches after
 * hydration.
 *
 * This file itself is the only banner code in the page's initial client bundle: a props
 * pass-through with no state, no effect, no import of the locale registry and — since TASK-085 —
 * no message catalogue anywhere in its graph. Everything the island needs arrives as props from
 * `LocaleSuggestionBanner.tsx`: the launch locales, their native names, their `localePath()`-built
 * hrefs, and every string already ICU-resolved by `suggestionCopy()`. So the registry never
 * crosses into the browser, the locale set cannot be reconfigured from a client chunk (AC-3's
 * objection), and no provider is needed to translate the banner (spec 004 §14 A1 addendum).
 */
import dynamic from "next/dynamic";

import type { LocaleSuggestionBannerIslandProps } from "./LocaleSuggestionBannerIsland.tsx";

const Island = dynamic(
  async () => import("./LocaleSuggestionBannerIsland.tsx"),
  { ssr: false },
);

export function LocaleSuggestionBannerLoader(
  props: LocaleSuggestionBannerIslandProps,
) {
  return <Island {...props} />;
}
