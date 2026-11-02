/**
 * The product page's entry into checkout (spec 010 §5.3, the spec 009 amendment, §5.4, AC-5;
 * TASK-206): a pure function of the picker state and the deployment, decided without a database.
 *
 * It lives in `geo`, beside `pickerState`, and not in `modules/checkout`: the product page is
 * indexable, and spec 003 §14 A17 check 11 refuses an indexable page that imports a file under
 * the checkout paths. `modules/checkout` re-exports it.
 */
import { z } from "zod";

import { DEMO_ENTRY_ENVIRONMENTS } from "@/config/checkout-entry";
import {
  type DeploymentEnvironment,
  deploymentEnvironments,
} from "@/lib/env.schema";

import { type PickerState, pickerStates } from "./types.ts";

/** What the product page's price summary offers (spec 010 §5.3, the spec 009 amendment). */
export const checkoutEntries = ["none", "demo", "continue"] as const;
export type CheckoutEntry = (typeof checkoutEntries)[number];

/** The build-time facts about a deployment the entry depends on (§5.4, §12). */
export interface CheckoutDeployment {
  readonly environment: DeploymentEnvironment;
}

/**
 * The product page's entry into checkout, decided without a database so the cached page stays
 * byte-identical for every visitor (spec 010 §5.3, §5.4, AC-5):
 *
 *  - `unavailable` → `none`: no control at all;
 *  - `preview` → `demo` ("Try a demo order") where the deployment offers the demo
 *    (`DEMO_ENTRY_ENVIRONMENTS`, §13 Q1), otherwise `none`;
 *  - `live` → `continue` ("Continue, {total}").
 *
 * A button drawn here can still lead to the `closed` state: `checkoutMode()` decides at the start
 * route, so a flag flipped after the page was cached is honoured on the click.
 */
export function checkoutEntryFor(
  pickerState: PickerState,
  deployment: CheckoutDeployment,
): CheckoutEntry {
  const state = z.enum(pickerStates).parse(pickerState);
  const environment = z
    .enum(deploymentEnvironments)
    .parse(deployment.environment);
  if (state === "live") return "continue";
  if (state === "preview" && DEMO_ENTRY_ENVIRONMENTS.includes(environment)) {
    return "demo";
  }
  return "none";
}
