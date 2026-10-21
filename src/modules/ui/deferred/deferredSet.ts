/**
 * The deferred set: every client island whose chunk waits for the LCP paint (spec 004 §14
 * A-founder-2026-10-15b clauses 1 and 2, AC-55, T-60; TASK-244).
 *
 * **The rule (clause 1).** A client chunk that is not needed to paint the LCP element is neither
 * requested nor finished before that paint. Lighthouse's simulation counts every request that
 * finished before the observed LCP as an LCP dependency, so a small island that wins the race
 * against the hero photograph can cost the page up to a second of simulated LCP (TASK-235
 * `## Result` C3). The islands below load after the paint, on idle, or at the first interaction.
 *
 * **The mechanism** (recorded in `docs/tasks/TASK-244.md` `## Result`). The server component that
 * mounts an island's loader wraps it in `<AfterPaint island="…" on="…">` (`./AfterPaint.tsx`).
 * `AfterPaint` renders nothing until `whenReady()` (`./paintSignal.ts`) fires, so until then the
 * loader's `import()` never runs and the island's chunk is not requested:
 *
 *  - `trigger: "paint"`: after the window's `load`, one animation frame and the idle period after
 *    it (the LCP element has painted), or at the first interaction anywhere. For an island that
 *    acts by itself, each with its own `next/dynamic` loader and chunk: the language popup, and
 *    the motion module (TASK-194), which also carries the header and phone Menu's `Esc` (AC-47;
 *    it replaced TASK-195's `MenuEscape`). The press or focus that reaches the Menu before idle is
 *    a first interaction, so the `Esc` has loaded before it can follow (spec 004 §14
 *    A-founder-2026-10-19a clause 3 brings the module under this rule).
 *  - `trigger: "interaction"`: at the first pointer press, focus or input on the island's
 *    own control only. For an island that matters only once the visitor acts: the home
 *    sentence's possessive, in one chunk (`./lazyIslands.ts`) through `React.lazy`.
 *
 * **Why the second kind exists: the budget.** Lighthouse counts each request's headers (about
 * 380 B) on top of its Brotli body against the 131,072 B script budget (spec 004 §14 A1), so a
 * chunk fetched on every page load costs a request even when it is small. A chunk fetched only on
 * input is not part of a page load nobody
 * touches, which is what Lighthouse and `tests/e2e/client-js-budget.spec.ts` measure, and
 * `budget:client-js` models page-load chunks from `next/dynamic`, so these loaders use
 * `React.lazy` and stay out of a model that would charge a chunk the browser never fetches.
 *
 * Every control keeps a native fallback for a tap before its island (clause 3): the Menu is a
 * `<details>`, the language links are `<a>`, the home's sentence is a plain form.
 *
 * **What is not here, and why.** See `NOT_DEFERRED` below: the consent banner (clause 2: escalate,
 * never delay, if it is ever found in the race), the framework's error boundaries (clause 1's
 * "needed"), and every other client module with its reason.
 *
 * Read by `tests/unit/deferred-set.test.tsx` (each entry by name, its loader, its mount and the
 * absence of any static import of its module) and by `tests/e2e/deferred-chunks.spec.ts` (each
 * chunk's resource-timing start against the LCP render time on every audited URL).
 *
 * **No client module may import a value from this file** (`AfterPaint` takes the types only):
 * each entry's `marker` is the string the e2e looks for to find the island's chunk, so it must
 * ship in the island's chunk and nowhere else.
 */

/** Every island id the set declares. */
export type DeferredIslandId = "motions" | "language-popup" | "home-sentence";

/** When an island may load (`./paintSignal.ts`). */
export type DeferredTrigger = "paint" | "interaction";

export interface DeferredIsland {
  readonly id: DeferredIslandId;
  /**
   * `deferred`: built to clause 1 here. `reserved`: declared before its module exists; its task
   * adds the module, the loader and the mount when it lands (clause 4).
   */
  readonly status: "deferred" | "reserved";
  /** When it loads. `null` while reserved: its task chooses. */
  readonly trigger: DeferredTrigger | null;
  /**
   * For `trigger: "interaction"`: the selector of the control whose first interaction loads it
   * (clause 1: "the first interaction with its control"). `null` otherwise.
   */
  readonly control: string | null;
  /** What it is and which clause names it. */
  readonly what: string;
  /** The task that owns the island's module. */
  readonly task: string;
  /** The island's module, repo-relative: its chunk is the one that waits. `null` while reserved. */
  readonly module: string | null;
  /**
   * The module the loader `import()`s: the entry of the lazy chunk that carries `module`. The
   * module itself, or `./lazyIslands.ts`, the design system's one lazy chunk.
   */
  readonly chunk: string | null;
  /** The `"use client"` file holding the `import()` of `chunk`. */
  readonly loader: string | null;
  /** The server component that renders `<AfterPaint island={id}>` around the loader. */
  readonly mountedBy: string | null;
  /**
   * The element `mountedBy` renders inside `<AfterPaint>`: the loader, or the server component
   * that renders it. It is rendered nowhere else.
   */
  readonly mounts: string | null;
  /**
   * A string literal written in `module` and in no other client module under `src/`: the e2e
   * finds the island's chunk by it. The popup's is an attribute it already renders and the
   * motions' the Menu selector their `Esc` closes (no byte added to either page-load chunk); the
   * interaction islands' is their `performance.mark()` name.
   */
  readonly marker: string;
}

export const DEFERRED_ISLANDS: readonly DeferredIsland[] = [
  {
    id: "motions",
    status: "deferred",
    trigger: "paint",
    control: null,
    what: "the motions (spec 004 §14 A23 clause 11, AC-44) and, inside the same module, the header and phone Menu enhancement: Esc closes the Menu (§14 A24 clause 3, AC-47)",
    task: "TASK-194",
    module: "src/modules/ui/motion/MotionIsland.tsx",
    chunk: "src/modules/ui/motion/MotionIsland.tsx",
    loader: "src/modules/ui/deferred/MotionLoader.tsx",
    mountedBy: "src/modules/ui/layout/SiteHeader.tsx",
    mounts: "MotionLoader",
    marker: "details[data-fo-menu][open]",
  },
  {
    id: "language-popup",
    status: "deferred",
    trigger: "paint",
    control: null,
    what: "the first-visit language popup (spec 003 §14 A14 as amended by A16)",
    task: "TASK-119",
    module: "src/modules/i18n/ui/LanguagePopupIsland.tsx",
    chunk: "src/modules/i18n/ui/LanguagePopupIsland.tsx",
    loader: "src/modules/i18n/ui/LanguagePopupLoader.tsx",
    mountedBy: "src/app/[locale]/layout.tsx",
    mounts: "LanguagePopup",
    marker: "data-fo-language-popup",
  },
  {
    id: "home-sentence",
    status: "deferred",
    trigger: "interaction",
    control: "#send",
    what: "the home sentence's possessive (spec 004 §14 A21 clause 4): off the first screen's paint path",
    task: "TASK-177",
    module: "src/modules/ui/home/SentenceIsland.tsx",
    chunk: "src/modules/ui/deferred/lazyIslands.ts",
    loader: "src/modules/ui/deferred/InteractionLoaders.tsx",
    mountedBy: "src/modules/ui/home/SentencePicker.tsx",
    mounts: "SentenceLoader",
    marker: "fo:deferred:home-sentence",
  },
];

/**
 * Every other `"use client"` module under `src/`, with the reason it is not in the set. A new
 * client module must be added either to `DEFERRED_ISLANDS` or here, or
 * `tests/unit/deferred-set.test.tsx` fails: clause 2's "every other island that is not on the
 * first screen's paint path" is a list a reviewer can read, not a search.
 */
export const NOT_DEFERRED: Readonly<Record<string, string>> = {
  "src/modules/ui/deferred/AfterPaint.tsx":
    "the mechanism itself: it must run at hydration to start the wait",
  "src/app/global-error.tsx":
    "the root error boundary: the framework attaches it to every document (clause 1's runtime)",
  "src/app/[locale]/error.tsx":
    "the localised error boundary: the framework attaches it to every localised document (clause 1's runtime)",
  "src/app/[locale]/boom/BoomIsland.tsx":
    "the AC-26 test route's throw: not a page a visitor reaches",
  "src/app/(dev)/dev/components/CheckoutErrorDemo.tsx":
    "the /dev gallery: not a public page",
  "src/modules/ui/consent/ConsentGallery.tsx":
    "the /dev gallery: not a public page",
  "src/modules/ui/consent/ConsentBannerLoader.tsx":
    "the consent banner: clause 2 keeps it out of the set (escalate if it races, never delay it)",
  "src/modules/ui/consent/ConsentBannerIsland.tsx":
    "the consent banner: clause 2 keeps it out of the set",
  "src/modules/ui/consent/ConsentBannerView.tsx":
    "the consent banner's view, inside its island's chunk: clause 2",
  "src/modules/ui/consent/ConsentSettingsPanel.tsx":
    "the consent settings panel, loaded by the banner on demand: clause 2",
  "src/modules/ui/checkout/BlurValidation.tsx":
    "a checkout island: mounted on no public page yet (spec 010; only /dev); clause 4 applies when a checkout page mounts it",
  "src/modules/ui/checkout/CardCounter.tsx":
    "a checkout island: mounted on no public page yet (spec 010; only /dev); clause 4 applies when a checkout page mounts it",
  "src/modules/ui/checkout/FocusOnMount.tsx":
    "a checkout island: mounted on no public page yet (spec 010; only /dev); clause 4 applies when a checkout page mounts it",
  "src/modules/ui/checkout/PlaceOrderButton.tsx":
    "a checkout island: mounted on no public page yet (spec 010; only /dev); clause 4 applies when a checkout page mounts it",
  "src/modules/ui/admin/AdminConfirmSwitch.tsx":
    "the flags page's typed-key confirm switch (TASK-220): admin only, not a public page, no LCP budget",
  "src/modules/ui/product/CardMessageField.tsx":
    "the product page's card field: on no audited URL, and its buy section belongs to PR 239 (TASK-228); clause 4's new row is the orchestrator's",
};
