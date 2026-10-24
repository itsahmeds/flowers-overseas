"use client";

/**
 * The loader of the motion module (`../motion/MotionIsland.tsx`, TASK-194), which also carries the
 * header and phone Menu's `Esc` (spec 004 AC-47): the deferred set's `motions` entry (spec 004
 * §14 A-founder-2026-10-15b clauses 1 and 2, as A-founder-2026-10-19a clause 3 binds it; AC-55;
 * TASK-244).
 *
 * `SiteHeader` mounts it inside `<AfterPaint island="motions" on="paint">`, so the one `import()`
 * below runs after the window's `load`, a frame and an idle callback, or at the first pointer
 * press, focus or input anywhere (`./paintSignal.ts`). Until then every control still works
 * natively (clause 3): a link navigates (motion 1's bloom is only a loader), a form submits
 * (motion 3's pending state is only a mark), the Menu is a `<details>`; and the press or focus
 * that reaches the Menu first is what loads its `Esc`, before an `Esc` can follow.
 *
 * `React.lazy`, not `next/dynamic` (TASK-376): `AfterPaint` already renders this only on the client
 * and inside a `Suspense`, which is all `ssr: false` added, and dropping `next/dynamic` from every
 * loader took its runtime (~1.3 KB Brotli) out of every page. This chunk is part of every page
 * load, so `budget:client-js` charges it there: it is a paint island of `./deferredSet.ts`. The
 * User Timing mark is written here, when the chunk has arrived, so the motion module itself is
 * unchanged; `tests/e2e/deferred-chunks.spec.ts` reads it.
 */
import { lazy } from "react";

const Motion = lazy(async () =>
  import("../motion/MotionIsland.tsx").then((module) => {
    try {
      performance.mark("fo:deferred:motions");
    } catch {
      // No User Timing is no reason to lose the motions.
    }
    return { default: module.MotionIsland };
  }),
);

export function MotionLoader() {
  return <Motion />;
}
