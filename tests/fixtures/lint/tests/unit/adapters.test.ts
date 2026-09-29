// T-61 (spec 001 AC-57): `tests/**` may import every package (tests mock and exercise adapters).
import * as Sentry from "@sentry/nextjs";
import postgres from "postgres";
import Stripe from "stripe";
import type { X } from "@mollie/api-client";
export * from "resend";
export const load = () => import("drizzle-orm/postgres-js");
export { Sentry, postgres, Stripe };
export type { X };
