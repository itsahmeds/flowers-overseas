/**
 * The client-safe barrel of `analytics` (plan/01 §5; spec 023 §5.2; TASK-492): what a
 * `"use client"` module of another module may import. Only the first-load loader and the type of
 * the API the deferred chunk publishes; nothing here reaches the server side of the module.
 */
export { analyticsGranted, startAnalyticsIfGranted } from "./client/loader";
export type { ClientApi } from "./client/deferred";
