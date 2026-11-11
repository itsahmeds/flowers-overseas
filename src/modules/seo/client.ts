/**
 * @purpose Client-safe entry to seo: the constants a `"use client"` graph may read (TASK-522)
 * @spec 004
 *
 * `eslint/modules.js` lets another module import `client.ts` as it lets it import `index.ts`.
 * Everything here is import-free, so an island that reads it ships no locale registry, no zod and
 * no Next metadata type.
 */
export { CHOOSER_LINK_REL } from "./link-rel.ts";
