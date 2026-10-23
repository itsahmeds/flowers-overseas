"use client";

/**
 * The lazy client boundary for the consent sheet (spec 004 §5.3, §5.4; TASK-051).
 *
 * The island must not be server-rendered — a server pass would have to guess whether the visitor
 * has already decided, which would make the cached HTML differ between visitors and put a `Vary`
 * on a document that must not have one (§5.4). `useHydrated()` renders nothing on the server and
 * on the hydrating render, then the `React.lazy` island inside a `Suspense`: what
 * `next/dynamic({ ssr: false })` did, without `next/dynamic`'s runtime on every page (TASK-376).
 * The island's chunk is requested right after hydration, as before.
 *
 * This file is the only consent code in the initial client bundle: a props pass-through with no
 * state, no effect, no message import and no register import. The island and the settings panel
 * arrive as two later chunks.
 */
import { lazy, Suspense } from "react";

import { useHydrated } from "../deferred/useHydrated";

import type { ConsentBannerIslandProps } from "./ConsentBannerIsland";

const Island = lazy(async () => import("./ConsentBannerIsland"));

export function ConsentBannerLoader(props: ConsentBannerIslandProps) {
  return useHydrated() ? (
    <Suspense fallback={null}>
      <Island {...props} />
    </Suspense>
  ) : null;
}
