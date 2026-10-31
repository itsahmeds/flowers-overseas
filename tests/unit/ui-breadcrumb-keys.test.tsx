/**
 * The trail's React keys are unique (TASK-380; spec 004 AC-50, spec 009 §14 reading order).
 *
 * A product trail holds two crumbs labelled with the shared message key `breadcrumb.entity` (the
 * category and the product itself). The trail once keyed each `li` by that message key, so React
 * logged "Encountered two children with the same key, `breadcrumb.entity`" and could drop or
 * reorder a crumb on re-render. This reads the keys off the element tree the component returns
 * (React's own key, not a rendered attribute) and the server HTML, in DOM order.
 */
import { Children, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Breadcrumbs,
  type Crumb,
} from "../../src/modules/ui/primitives/Breadcrumbs.tsx";

/** A product trail: home, a category, the product; the last two share `breadcrumb.entity`. */
const PRODUCT_TRAIL: readonly Crumb[] = [
  { key: "breadcrumb.home", label: "Home", href: "/en" },
  { key: "breadcrumb.entity", label: "Roses", href: "/en/flowers/roses" },
  { key: "breadcrumb.entity", label: "Amber Hour", current: true },
];

/** The React keys of the trail's `li`s, in order, from the element tree `Breadcrumbs` returns. */
function itemKeys(crumbs: readonly Crumb[]): (string | null)[] {
  const nav = Breadcrumbs({ crumbs, label: "Breadcrumb", phone: "trail" });
  const ol = Children.toArray(
    (nav.props as { children: unknown }).children as never,
  ).find(
    (child): child is ReactElement<{ children: unknown }> =>
      isValidElement(child) && child.type === "ol",
  );
  if (ol === undefined) throw new Error("the trail has no <ol>");
  const items = ol.props.children as readonly ReactElement[];
  return items.map((item) => item.key);
}

describe("the trail keys each crumb uniquely (TASK-380)", () => {
  it("gives the three crumbs of a two-entity trail three distinct keys", () => {
    const keys = itemKeys(PRODUCT_TRAIL);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
  });

  it("keys no crumb by its message key alone", () => {
    for (const key of itemKeys(PRODUCT_TRAIL)) {
      expect(key).not.toBe("breadcrumb.entity");
    }
  });

  it("renders both entity crumbs, in trail order", () => {
    const html = renderToStaticMarkup(
      <Breadcrumbs crumbs={PRODUCT_TRAIL} label="Breadcrumb" phone="trail" />,
    );
    const items = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) =>
      (m[1] ?? "").replace(/<[^>]+>/g, ""),
    );
    expect(items).toEqual(["Home", "Roses", "Amber Hour"]);
    expect(html).toContain('href="/en/flowers/roses"');
    expect(html).toContain(
      '<span aria-current="page" class="text-ink">Amber Hour</span>',
    );
  });
});
