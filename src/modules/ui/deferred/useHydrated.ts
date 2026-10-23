/**
 * `useHydrated()` — `false` on the server and on the hydrating render, `true` from the render React
 * schedules right after hydration (and at once on a client-side mount). It is what
 * `next/dynamic({ ssr: false })` did for the consent loader, without `next/dynamic`'s runtime in
 * every page's initial script set (spec 004 §14 A-founder-2026-10-23; TASK-376).
 *
 * `useSyncExternalStore` with a server snapshot of `false` is React's own way to render one thing
 * in the server HTML and during hydration, then the client value with no hydration mismatch and no
 * extra effect. Nothing ever changes after that, so the store has no subscription.
 */
import { useSyncExternalStore } from "react";

function subscribe(): () => void {
  return () => undefined;
}

export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
