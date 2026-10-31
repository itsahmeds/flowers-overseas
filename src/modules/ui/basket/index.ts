/**
 * The basket's design-system components (spec 010 §14 A-founder-2026-10-22 items 5, 6 and 8;
 * `docs/design/system/components.dc.html` "Basket and accounts"; TASK-349): `BasketLine`,
 * `BasketSummary`, `RemoveLineButton`, `BasketCountBadge`, `DeliveryOfIndicator`,
 * `AlsoInBasketNotice`, the header count's `fillBasketCount` and the page's `BasketRefresh`.
 *
 * **Imported by path** (`@/modules/ui/basket`), never through `@/modules/ui`, for
 * `../checkout/index.ts`'s reason: `BasketRefresh` is a client module, and a client module
 * reachable from the main barrel is bundled into every route that imports it. The header imports
 * `./BasketCountBadge.tsx` directly, and the motion module `./basket-count.ts`.
 *
 * **Copy arrives as props.** No file here names a checkout message key (spec 003 §14 A17 check
 * 11): the basket page in `src/modules/checkout/ui/` resolves them.
 */
export { AlsoInBasketNotice } from "./AlsoInBasketNotice.tsx";
export type { AlsoInBasketNoticeProps } from "./AlsoInBasketNotice.tsx";
export { BASKET_COUNT_COOKIE, fillBasketCount } from "./basket-count.ts";
export { BASKET_BADGE_CLASS, BasketCountBadge } from "./BasketCountBadge.tsx";
export type { BasketCountBadgeProps } from "./BasketCountBadge.tsx";
export { BasketLine } from "./BasketLine.tsx";
export type { BasketLineProps, BasketLineState } from "./BasketLine.tsx";
export { BasketRefresh } from "./BasketRefresh.tsx";
export type { BasketRefreshProps } from "./BasketRefresh.tsx";
export { BasketSummary } from "./BasketSummary.tsx";
export type { BasketSummaryProps } from "./BasketSummary.tsx";
export { DeliveryOfIndicator } from "./DeliveryOfIndicator.tsx";
export type { DeliveryOfIndicatorProps } from "./DeliveryOfIndicator.tsx";
export { REMOVE_LINK_CLASS, RemoveLineButton } from "./RemoveLineButton.tsx";
export type {
  BasketFormAction,
  RemoveLineButtonProps,
} from "./RemoveLineButton.tsx";
