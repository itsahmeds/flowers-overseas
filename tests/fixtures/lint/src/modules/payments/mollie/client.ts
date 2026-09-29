import createMollieClient from "@mollie/api-client";
import type { MollieType } from "@mollie/api-client";
export * from "@mollie/api-client";
export const load = () => import("@mollie/api-client");
export { createMollieClient };
export type { MollieType };
