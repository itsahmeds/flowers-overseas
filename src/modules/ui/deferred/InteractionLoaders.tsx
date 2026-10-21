"use client";

/**
 * The loaders of the design system's interaction islands (spec 004 §14 A-founder-2026-10-15b,
 * AC-55; TASK-244): today the home sentence's possessive (§14 A21 clause 4). The Menu's `Esc`
 * lives in the motion module (TASK-194), loaded after the paint by `./MotionLoader.tsx`.
 *
 * Each is mounted inside `<AfterPaint island="…" on="interaction" control="…">`
 * (`SentencePicker`), so the one `import()` below runs only at the first pointer press, focus or
 * input on the island's control (`./deferredSet.ts`). The sentence is a complete form without its
 * island, and a "who" changed in that same interaction is read back when the island mounts
 * (`SentenceIsland` syncs once when it starts).
 *
 * `React.lazy`, not `next/dynamic`: `AfterPaint` already renders these only on the client and
 * inside a `Suspense`, and a chunk loaded only on input is outside the page-load budget that
 * `budget:client-js` models from `next/dynamic` (`./deferredSet.ts`). One file and one `import()`
 * for every interaction island, and one lazy chunk (`./lazyIslands.ts`): this file is in every
 * document's initial chunk, inside the 131,072 B budget.
 */
import { lazy } from "react";

import type { SentenceIslandProps } from "../home/SentenceIsland.tsx";

const islands = async () => import("./lazyIslands.ts");

const Sentence = lazy(async () =>
  islands().then((module) => ({ default: module.SentenceIsland })),
);

export function SentenceLoader(props: SentenceIslandProps) {
  return <Sentence {...props} />;
}
