"use client";

/**
 * The throw that reaches `src/app/[locale]/error.tsx` (spec 004 AC-26, AC-27; TASK-056).
 *
 * It throws in an **effect**, not in render, and that is the whole design of this file. Measured
 * on Next 16.3.4: an error raised while the server renders `/{locale}/boom` — in the page, or in
 * the server pass of a Client Component — is answered with the *global* document
 * (`<html id="__next_error__">`, `src/app/global-error.tsx`), because the failure happens before
 * the segment's boundary exists in the stream. `/dev/boom` deliberately exercises exactly that
 * path. This file exercises the other one: a document that was served, hydrated and then failed,
 * which is how a visitor actually meets the localised boundary — and it is the boundary that
 * carries the locale's `lang`/`dir`, its copy and its way home.
 *
 * So the route answers **200** with the locale document, and the boundary replaces it a frame
 * later. A suite therefore waits for the boundary rather than for a status.
 */
import { useEffect } from "react";

/** A constant: no request data, no PII in the message a log line or Sentry would carry (§8). */
export const BOOM_ISLAND_MESSAGE =
  "/{locale}/boom threw on purpose after hydration: the localised 500 boundary needs a reachable route (spec 004 AC-26)";

export function BoomIsland() {
  useEffect(() => {
    throw new Error(BOOM_ISLAND_MESSAGE);
  }, []);
  return null;
}
