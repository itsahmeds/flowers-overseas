"use client";
/**
 * The sort island's loader (spec 043 §14 A-founder-2026-10-22 item 3; TASK-289): a `React.lazy`
 * boundary, so `SortIsland` is its own chunk, fetched after paint by `<AfterPaint
 * island="listing-sort" on="paint">` (`../deferred/deferredSet.ts`). Nothing else imports the
 * island statically (`tests/unit/deferred-set.test.tsx`).
 */
import { lazy } from "react";

import type { SortIslandProps } from "./SortIsland.tsx";

const Sort = lazy(async () =>
  import("./SortIsland.tsx").then((module) => ({
    default: module.SortIsland,
  })),
);

export function SortLoader(props: SortIslandProps) {
  return <Sort {...props} />;
}
