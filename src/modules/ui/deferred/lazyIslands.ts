/**
 * The design system's interaction islands, in **one** lazy chunk (spec 004 §14
 * A-founder-2026-10-15b, AC-55; TASK-244). `./InteractionLoaders.tsx` `import()`s this module,
 * never the islands themselves, and only at the first interaction with the island's control
 * (`./deferredSet.ts`).
 *
 * Today it holds the home sentence's island alone: the Menu's `Esc` moved into the motion module
 * (TASK-194), which loads after the paint through `./MotionLoader.tsx`. A later interaction
 * island joins this chunk rather than adding a request of its own.
 *
 * Each island keeps its own `performance.mark()` literal, so `tests/e2e/deferred-chunks.spec.ts`
 * finds it in this chunk.
 */
export { SentenceIsland } from "../home/SentenceIsland.tsx";
