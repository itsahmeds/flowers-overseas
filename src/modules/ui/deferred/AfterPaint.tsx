"use client";

/**
 * `AfterPaint` — holds a deferred island's loader back until the LCP has painted, or until the
 * first interaction (spec 004 §14 A-founder-2026-10-15b clause 1, AC-55; TASK-244). The set, the
 * rule and the mechanism are in `./deferredSet.ts`.
 *
 * It renders **nothing** on the server and on the hydrating render, so the document and its first
 * paint are what they were (clause 3: the first-paint baselines, CLS, no indexable content on the
 * client). When `whenReady()` fires it renders its children, the island's loader, inside a
 * `Suspense` with no fallback: only then does the loader's `import()` run and the island's chunk
 * get requested.
 *
 * `on`: `"paint"` (after the paint, on idle, or at the first interaction) for an island that must
 * act by itself (the language popup), `"interaction"` with a `control` selector for one that only
 * matters once the visitor acts on that control. `island` names the entry in the set; the type is imported, never a value, so no entry's
 * marker reaches this chunk (see `./deferredSet.ts`).
 */
import { type ReactNode, Suspense, useEffect, useState } from "react";

import type { DeferredIslandId, DeferredTrigger } from "./deferredSet.ts";
import { whenReady } from "./paintSignal.ts";

/**
 * The entry's `trigger` and `control`, as one type: an interaction island always names its
 * control, a paint island never does, so `control` alone tells `whenReady()` which wait it is.
 */
export type AfterPaintProps = {
  /** The entry in `DEFERRED_ISLANDS` this loader belongs to. */
  readonly island: DeferredIslandId;
  /** The island's loader, as the server component mounts it. */
  readonly children: ReactNode;
} & (
  | { readonly on: Extract<DeferredTrigger, "paint">; readonly control?: never }
  | {
      readonly on: Extract<DeferredTrigger, "interaction">;
      /** The selector of the element whose first interaction loads the island. */
      readonly control: string;
    }
);

export function AfterPaint({ control, children }: AfterPaintProps): ReactNode {
  const [ready, setReady] = useState(false);
  useEffect(
    () =>
      whenReady(
        () => {
          setReady(true);
        },
        window,
        control,
      ),
    [control],
  );
  // No wrapper element: the popup's `<dialog>` must not sit inside a box it did not ask for.
  return ready ? <Suspense fallback={null}>{children}</Suspense> : null;
}
