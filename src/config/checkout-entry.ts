/**
 * The product page's way into checkout, as data an indexable page may import (spec 010 §5.3, the
 * spec 009 amendment, §13 Q1; AC-5; TASK-206).
 *
 * The product page is indexable, so it may not import `src/config/checkout.ts` or
 * `src/modules/checkout/` (spec 003 §14 A17 check 11: those paths may reach checkout copy). What it
 * needs from checkout lives here: where its two submits post, and which deployments offer the
 * demo. `src/config/checkout.ts` re-exports both.
 */
import type { DeploymentEnvironment } from "../lib/env.schema.ts";

/** Where the product page's two submits post (`formaction`, AC-5). */
export const CHECKOUT_START_PATH = "/api/checkout/start";

/**
 * The deployments whose product pages offer "Try a demo order" in the `preview` picker state
 * (§13 Q1). The founder's answer was the default, **everyone**, so every environment is listed;
 * the alternative ("staging only") is this list without `production`, a one-line data change
 * reviewed like any other (`checkoutEntryFor()` reads it at build time, §5.3, §12).
 */
export const DEMO_ENTRY_ENVIRONMENTS: readonly DeploymentEnvironment[] = [
  "development",
  "test",
  "preview",
  "staging",
  "production",
];
