import Stripe from "stripe";
import type { StripeType } from "stripe";
export * from "stripe";
export const load = () => import("stripe");
export { Stripe };
export type { StripeType };
