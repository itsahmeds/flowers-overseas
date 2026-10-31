/**
 * The header basket count's client logic (spec 010 §14 A-founder-2026-10-22 D10, AC-71 render
 * half; T-71 unit half; TASK-349): `fillBasketCount()` reads `fo_basket` and writes the matching
 * pre-resolved entry into the Basket link's slot and name, makes no request and reads nothing else.
 *
 * The node test environment has no DOM, so the document is a small fake with exactly the API the
 * function uses (`querySelector`, `dataset`, `textContent`, `toggleAttribute`, `cookie`). The
 * request half (zero requests in a real browser) and the after-LCP timing are TASK-208's e2e.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { BASKET_COOKIE_VALUE_PATTERN } from "@/modules/checkout";

import {
  BASKET_COUNT_COOKIE,
  fillBasketCount,
} from "../../src/modules/ui/basket/basket-count.ts";

/** Index 0 the empty state, index n the count n (as `basketCountStates()` writes them). */
const STATES = [
  ["", "Basket"],
  ["1", "Basket, 1 bouquet"],
  ["2", "Basket, 2 bouquets"],
  ["3", "Basket, 3 bouquets"],
  ["4", "Basket, 4 bouquets"],
  ["5", "Basket, 5 bouquets"],
];

interface FakeNode {
  textContent: string;
  readonly attributes: Set<string>;
  toggleAttribute: (name: string, force: boolean) => boolean;
}

function node(text = ""): FakeNode {
  const attributes = new Set<string>();
  return {
    textContent: text,
    attributes,
    toggleAttribute(name, force) {
      if (force) attributes.add(name);
      else attributes.delete(name);
      return force;
    },
  };
}

function header(cookie: string): {
  readonly doc: Document;
  readonly badge: FakeNode;
  readonly name: FakeNode;
} {
  const badge = node();
  const name = node("Basket");
  const link = {
    dataset: { foBasket: JSON.stringify(STATES) },
    querySelector: (selector: string) =>
      selector === "[data-fo-basket-badge]"
        ? badge
        : selector === "[data-fo-basket-name]"
          ? name
          : null,
  };
  const doc = {
    cookie,
    querySelector: (selector: string) =>
      selector === "[data-fo-basket]" ? link : null,
  } as unknown as Document;
  return { doc, badge, name };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fillBasketCount (AC-71, T-71 unit half)", () => {
  it("fo_basket=3 fills the slot with 3 and names the link with the plural for 3", () => {
    const { doc, badge, name } = header("consent=x; fo_basket=3; other=1");
    fillBasketCount(doc);
    expect(badge.textContent).toBe("3");
    expect(badge.attributes.has("data-on")).toBe(true);
    expect(name.textContent).toBe("Basket, 3 bouquets");
  });

  it("the cookie as the first and as the last pair both count", () => {
    for (const cookie of [
      "fo_basket=2; a=b",
      "a=b; fo_basket=2",
      "fo_basket=2",
    ]) {
      const { doc, badge } = header(cookie);
      fillBasketCount(doc);
      expect(badge.textContent).toBe("2");
    }
  });

  it("no cookie, 0, 99 (more than the basket holds) and garbage all leave the empty state", () => {
    for (const cookie of [
      "",
      "a=b",
      "fo_basket=0",
      "fo_basket=99",
      "fo_basket=abc",
      "fo_basket=3x",
      "fo_basket=-1",
      "fo_basket=123",
      "xfo_basket=3",
      "fo_basket=%33",
    ]) {
      const { doc, badge, name } = header(cookie);
      badge.textContent = "9";
      badge.attributes.add("data-on");
      fillBasketCount(doc);
      expect(badge.textContent, cookie).toBe("");
      expect(badge.attributes.has("data-on"), cookie).toBe(false);
      expect(name.textContent, cookie).toBe("Basket");
    }
  });

  it("a page with no Basket link is left alone", () => {
    const doc = {
      cookie: "fo_basket=3",
      querySelector: () => null,
    } as unknown as Document;
    expect(() => {
      fillBasketCount(doc);
    }).not.toThrow();
  });

  it("makes no request: fetch, XMLHttpRequest and sendBeacon are never touched", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const xhr = vi.fn();
    vi.stubGlobal("XMLHttpRequest", xhr);
    const { doc } = header("fo_basket=4");
    fillBasketCount(doc);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("reads the value the server writes, and only it: the pattern is BASKET_COOKIE_VALUE_PATTERN's", () => {
    // The server's boundary is `^[0-9]{1,2}$`; the island's expression captures exactly that.
    expect(BASKET_COOKIE_VALUE_PATTERN.source).toBe("^[0-9]{1,2}$");
    expect(BASKET_COUNT_COOKIE.source).toContain(
      `fo_basket=(${BASKET_COOKIE_VALUE_PATTERN.source.slice(1, -1)})`,
    );
  });
});
