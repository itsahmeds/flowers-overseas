/**
 * Every client module the checkout ships (spec 010 §5.4, AC-38; TASK-201), as one entry for
 * `tests/unit/checkout-ui-islands.test.ts` to bundle and weigh. A new island in
 * `src/modules/ui/checkout/` is added here, and the test fails until it is (it lists the
 * directory's `"use client"` files and compares).
 */
export { BlurValidation } from "../../../src/modules/ui/checkout/BlurValidation.tsx";
export { CardCounter } from "../../../src/modules/ui/checkout/CardCounter.tsx";
export { FocusOnMount } from "../../../src/modules/ui/checkout/FocusOnMount.tsx";
export { PlaceOrderButton } from "../../../src/modules/ui/checkout/PlaceOrderButton.tsx";
