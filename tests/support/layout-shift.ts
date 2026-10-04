/**
 * Layout shifts by their source: the zero-shift assertions of AC-7, AC-28 and AC-17 measure the
 * shifts their own subject causes, not the page's total (TASK-177, escalation 7, orchestrator
 * ruling 2026-10-04).
 *
 * Until the v2 home, every layout shift on a locale home came from the header or a banner, so a
 * page-wide total was the subject's total. The v2 home's sentence picker is set in Fraunces, which
 * A21 clause 3 forbids preloading on the home, so its selects re-measure when the webfont swaps in
 * (metric-matched fallbacks keep that small, never zero). The page-wide total then read the
 * sentence's swap as a header or banner shift. These helpers keep every entry the browser reports
 * with the nodes it names as its sources (`LayoutShift.sources`, at most five per entry), so each
 * test sums only the entries its subject can cause. The sentence's own swap has a test of its own
 * in `tests/e2e/home.spec.ts`, which bounds it.
 *
 * An entry with no sources (the moved node is gone) is counted by `shiftOutside`, never dropped:
 * a test that excludes a region still sees what it cannot attribute.
 */
import type { BrowserContext, Page } from "@playwright/test";

/** The sentence picker's form (`SentencePicker`, `data-fo-sentence`). */
export const SENTENCE_REGION = "[data-fo-sentence]";

/** Record every layout shift, with its source nodes, from the first paint onwards. */
export async function recordLayoutShifts(
  target: Page | BrowserContext,
): Promise<void> {
  await target.addInitScript(() => {
    interface Recorded {
      readonly value: number;
      readonly nodes: readonly (Node | null)[];
    }
    const store = window as unknown as { __foShifts: Recorded[] };
    store.__foShifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
          sources?: readonly { node: Node | null }[];
        };
        if (shift.hadRecentInput) continue;
        store.__foShifts.push({
          value: shift.value,
          nodes: (shift.sources ?? []).map((source) => source.node),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

/**
 * The summed value of the entries at least one of whose sources lies inside an element matching
 * `selector`. Use it for a subject that is a region (the header).
 */
export async function shiftInside(
  page: Page,
  selector: string,
): Promise<number> {
  return page.evaluate((inside) => {
    const store = window as unknown as {
      __foShifts?: { value: number; nodes: (Node | null)[] }[];
    };
    const element = (node: Node | null): Element | null =>
      node === null
        ? null
        : node.nodeType === Node.ELEMENT_NODE
          ? (node as Element)
          : node.parentElement;
    return (store.__foShifts ?? [])
      .filter((entry) =>
        entry.nodes.some((node) => element(node)?.closest(inside) != null),
      )
      .reduce((total, entry) => total + entry.value, 0);
  }, selector);
}

/**
 * The summed value of the entries that are not wholly inside an element matching `selector`: an
 * entry counts if any source lies outside it, or if it names no source. Use it for a subject that
 * moves the page (a banner, a sheet), excluding a region whose shift another test owns.
 */
export async function shiftOutside(
  page: Page,
  selector: string,
): Promise<number> {
  return page.evaluate((excluded) => {
    const store = window as unknown as {
      __foShifts?: { value: number; nodes: (Node | null)[] }[];
    };
    const element = (node: Node | null): Element | null =>
      node === null
        ? null
        : node.nodeType === Node.ELEMENT_NODE
          ? (node as Element)
          : node.parentElement;
    return (store.__foShifts ?? [])
      .filter(
        (entry) =>
          entry.nodes.length === 0 ||
          entry.nodes.some((node) => element(node)?.closest(excluded) == null),
      )
      .reduce((total, entry) => total + entry.value, 0);
  }, selector);
}
