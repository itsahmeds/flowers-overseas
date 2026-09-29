export const sql = await import("postgres");
export const stripe = require("stripe");
export * from "resend";
import type { X } from "@mollie/api-client";
export type { X };
export const drizzle = () => import("drizzle-orm/postgres-js");
