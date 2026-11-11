/**
 * The in-process steps `invalidate()` (`./cache.ts`) awaits **before** it revalidates anything
 * (spec 012b §2.2, AC-3; TASK-294): the served country registry is a process-wide snapshot of the
 * `country` table, so a `country:{iso2}` invalidation must re-read it first, or the page Next
 * regenerates next would be rendered from the old row and cached for an hour. A hook that throws
 * is logged by `invalidate()` as an origin failure; the purge still runs.
 *
 * Its own module, with no import, because `instrumentation.ts` registers the registry's hook at
 * boot (`src/modules/geo/db/runtime.ts`) and must not pull `./cache.ts`, which reaches the
 * catalogue barrel and the UI's fonts, into the instrumentation bundle.
 */
export type BeforeInvalidateHook = (tags: readonly string[]) => Promise<void>;

/**
 * On `globalThis`, because Next compiles `instrumentation.ts` and each route separately, and a
 * module-level set would be one copy per bundle.
 */
const HOOKS_SLOT = Symbol.for("flowers-overseas.before-invalidate-hooks");

function hooks(): Set<BeforeInvalidateHook> {
  return ((globalThis as { [HOOKS_SLOT]?: Set<BeforeInvalidateHook> })[
    HOOKS_SLOT
  ] ??= new Set<BeforeInvalidateHook>());
}

/** Register `hook` for every later `invalidate()` call in this process; the return removes it. */
export function onBeforeInvalidate(hook: BeforeInvalidateHook): () => void {
  hooks().add(hook);
  return () => {
    hooks().delete(hook);
  };
}

/** Await every registered hook with `tags`; true when one of them threw. */
export async function runBeforeInvalidateHooks(
  tags: readonly string[],
): Promise<boolean> {
  let failed = false;
  for (const hook of hooks()) {
    try {
      await hook(tags);
    } catch {
      failed = true;
    }
  }
  return failed;
}
