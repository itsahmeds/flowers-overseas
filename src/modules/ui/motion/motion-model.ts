/**
 * The motion module's contract: its attributes, its timings and the pure decisions it makes (spec
 * 004 §14 A23 clause 11, A24 clause 9, AC-44; TASK-194; `docs/design/system/motion.dc.html`).
 *
 * Plain TypeScript with no `"use client"`, so a server component (the header, the sentence) and the
 * client module (`./MotionIsland.tsx`) read the same strings, and the unit suite can test the
 * decisions without a browser. Every attribute here is written by the client module only: none of
 * them is in the server's HTML, so a first load, a reload, a JavaScript-off load and a crawler see
 * every section, every image and no loader (A24 clause 9 (f), (g)).
 */

/** On `<html>` once the module runs: the gate every hidden start state sits behind (motion 12). */
export const MOTION_ROOT_ATTRIBUTE = "data-fo-motion";

/** On `<html>` while a navigation the reader started has not painted after 150 ms (motion 1). */
export const NAV_ATTRIBUTE = "data-fo-nav";
export const NAV_PENDING = "pending";
/** How long a navigation may take before the bloom shows (motion 1's trigger). */
export const NAV_DELAY_MS = 150;

/** On a form's primary submit, rendered by `Button`'s `pending` (motion 3). */
export const PENDING_BUTTON_SELECTOR = "button[data-fo-pending]";

/** The home's sentence form and the attribute that plays its shimmer once (motion 4). */
export const SENTENCE_SELECTOR = "form[data-fo-sentence]";
export const SHIMMER_ATTRIBUTE = "data-fo-shimmer";
export const SHIMMER_DELAY_MS = 800;

/** A section that fades up as it enters (motion 12): `pending` (hidden) then `in`. */
export const REVEAL_ATTRIBUTE = "data-fo-reveal";
/** A below-the-fold image that fades in when it loads (motion 11): `pending` then `in`. */
export const FADE_ATTRIBUTE = "data-fo-fade";

/** The part of a click the navigation decision reads. */
export interface ClickFacts {
  readonly button: number;
  readonly defaultPrevented: boolean;
  readonly modified: boolean;
  /** The anchor's resolved `href`, or `null` when the click was not on a link. */
  readonly href: string | null;
  /** `target` and `download` on the anchor. */
  readonly target: string;
  readonly download: boolean;
}

/**
 * Does this click start a navigation of this tab to another document of this site? Only then may
 * the bloom wait for it (motion 1). A new tab, a download, a modified click, another origin, a
 * `tel:`/`mailto:` link and a jump inside the same page (`#send`) are not navigations of this tab.
 */
export function startsNavigation(facts: ClickFacts, current: string): boolean {
  if (facts.href === null) return false;
  if (facts.button !== 0 || facts.modified || facts.defaultPrevented) {
    return false;
  }
  if (facts.download) return false;
  if (facts.target !== "" && facts.target !== "_self") return false;
  let next: URL;
  let here: URL;
  try {
    next = new URL(facts.href, current);
    here = new URL(current);
  } catch {
    return false;
  }
  if (next.protocol !== "https:" && next.protocol !== "http:") return false;
  if (next.origin !== here.origin) return false;
  // Same document, another fragment: the browser scrolls, nothing loads.
  if (
    next.pathname === here.pathname &&
    next.search === here.search &&
    next.hash !== ""
  ) {
    return false;
  }
  return true;
}

/**
 * May a section or an image take a hidden start state? Never when it intersects the first viewport
 * at load (A24 clause 9 (g)): its block-start edge must be at or below the viewport's foot.
 */
export function startsBelowFold(top: number, viewportHeight: number): boolean {
  return top >= viewportHeight;
}
