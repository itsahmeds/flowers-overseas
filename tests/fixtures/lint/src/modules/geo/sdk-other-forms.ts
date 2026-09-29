export const sql = await import("postgres");
export const stripe = require("stripe");
export * from "resend";
import type { X } from "@mollie/api-client";
export type { X };
export const drizzle = () => import("drizzle-orm/postgres-js");
// /break 117 hole 5: a no-substitution template specifier, and the type-only `import("…")`.
export const tpl = () => import(`stripe`);
export type Client = import("resend").Resend;
export type Mod = typeof import("@sentry/nextjs");
