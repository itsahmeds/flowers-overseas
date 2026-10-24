/**
 * `photoFirst()` — photographed products first (spec 043 §5.2, §5.3 F, **AC-13**; spec 008 §14
 * A-founder-2026-10-20a, AC-9 as amended; TASK-290).
 *
 * A **stable partition**: the items whose photo is an approved asset (`kind: "asset"`, the branch
 * the card renders a photograph on), in input order, then the rest, in input order. Nothing else
 * moves, so each group keeps spec 005's order and a list with no placeholder is returned as it came.
 *
 * Every product list passes its items through it after spec 005's default order: the country
 * listings and the hubs (before paging, so page 1 holds the photographs), the home's product row
 * and the product page's related row. The two price sorts never do: a price order is the price
 * order (AC-13). It lives in the design system, beside the card whose `photo` it reads, so the
 * home row can use it too; `modules/catalog` re-exports it from its barrel (§5.2). Pure.
 */
export function photoFirst<
  T extends { readonly photo: { readonly kind: string } },
>(items: readonly T[]): T[] {
  const photographed: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    (item.photo.kind === "asset" ? photographed : rest).push(item);
  }
  return [...photographed, ...rest];
}
