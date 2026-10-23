"use client";

/**
 * The lazy client boundary for the consent sheet (spec 004 §5.3, §5.4; TASK-051; spec 004 §14
 * A-founder-2026-10-19d clause 2, TASK-279).
 *
 * The island must not be server-rendered — a server pass would have to guess whether the visitor
 * has already decided, which would make the cached HTML differ between visitors and put a `Vary`
 * on a document that must not have one (§5.4). `useHydrated()` renders nothing on the server and
 * on the hydrating render, then the `React.lazy` island inside a `Suspense`: what
 * `next/dynamic({ ssr: false })` did, without `next/dynamic`'s runtime on every page (TASK-376).
 * The island's chunk is requested right after hydration, as before.
 *
 * **Two modes, decided once on the server** (`prompt`, from `consentSources()` in the locale
 * layout):
 *
 *  - **a consent source is active:** the island is rendered at once and its chunk is requested
 *    after hydration, so the sheet asks on first view (AC-17 (b)), outside the deferred set
 *    (A-founder-2026-10-15b);
 *  - **nothing needs consent (today):** nothing is rendered and the island's chunk is **not
 *    requested on page load** (AC-17 (a)). One delegated listener waits for the first activation of
 *    a `data-fo-consent-reopen` control (the footer's "Cookie settings", the cookie notice's
 *    "Change cookie settings"); that click imports the island, which opens the settings panel with
 *    focus inside it. From then on the island's own listener answers every later activation, so
 *    this one is removed. With JavaScript off the control does nothing, as before (spec 041 §5).
 *
 * This file is the only consent code in the initial client bundle: a props pass-through with one
 * click listener, no message import and no register import. The island and the settings panel
 * arrive as two later chunks. In the second mode the island's chunk is an on-input chunk, so
 * `pnpm budget:client-js` does not charge it to a page load (`ON_INPUT_CHUNK_MARKERS`, by the
 * island's `data-fo-consent-island` marker, while `consentPrompt()` is false).
 */
import { lazy, Suspense, useEffect, useState } from "react";

import { useHydrated } from "../deferred/useHydrated";

import type { ConsentBannerIslandProps } from "./ConsentBannerIsland";

const Island = lazy(async () => import("./ConsentBannerIsland"));

export type ConsentBannerLoaderProps = Omit<ConsentBannerIslandProps, "opener">;

export function ConsentBannerLoader({
  view,
  prompt,
}: ConsentBannerLoaderProps) {
  const hydrated = useHydrated();
  // `undefined` until "Cookie settings" is first activated; then the control itself (or `null`).
  const [opener, setOpener] = useState<HTMLElement | null | undefined>();
  const activated = opener !== undefined;
  const attribute = view.config.reopenAttribute;

  useEffect(() => {
    if (prompt || activated) return undefined;
    const onClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest(`[${attribute}]`);
      if (control === null) return;
      setOpener(control instanceof HTMLElement ? control : null);
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
    };
  }, [prompt, activated, attribute]);

  if (!hydrated) return null;
  if (prompt) {
    return (
      <Suspense fallback={null}>
        <Island prompt view={view} />
      </Suspense>
    );
  }
  if (!activated) return null;
  return (
    <Suspense fallback={null}>
      <Island opener={opener} prompt={false} view={view} />
    </Suspense>
  );
}
