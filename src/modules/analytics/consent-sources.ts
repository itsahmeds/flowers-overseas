/**
 * The one reader that decides whether anything on the site needs consent (spec 004 §14
 * A-founder-2026-10-19d clause 1, AC-21 as amended; TASK-279).
 *
 * It answers two questions from one environment and the cookie register:
 *
 *  - `ga4MeasurementId`: the GA4 id the tag loads with, exactly `ga4MeasurementId(env)` (a
 *    well-formed `G-…` id, or `undefined` for a blank or malformed value);
 *  - `active`: the non-essential categories with an **active source**, in register order
 *    (`cookieCategories`). `analytics` is active when that id is defined or any `analytics` row of
 *    the register is `status: "set"`; `marketing` is active when any `marketing` row is `set`. No
 *    ad tag is wired today; a spec that adds one adds its env reader here, in the PR that adds the
 *    tag's loader.
 *
 * The locale layout calls this once per document render and takes both the tag's id and the
 * consent banner's `prompt` (true exactly when `active` is non-empty) from the one result, so the
 * tag and the question about it can never disagree. While `active` is empty the banner does not
 * mount and its chunk is not requested on load (clause 2): on today's data the site stores only
 * essential cookies, and the footer's "Cookie settings" still opens the settings panel.
 *
 * The flip is data: setting `NEXT_PUBLIC_GA4_MEASUREMENT_ID` and rebuilding, or a register row
 * turning `set` (runbook `docs/runbooks/analytics-consent.md` §1, §2). Pure, so the register is a
 * parameter for the unit table's fixtures; production passes nothing and gets the real one.
 *
 * Imported by relative `.ts` paths so `node scripts/client-js-budget.ts` can read the same answer:
 * the budget leaves the consent island's chunk out of the page load exactly when `consentPrompt()`
 * is false (`onInputChunkMarkers()`), so the two cannot disagree either.
 */
import {
  COOKIE_REGISTRY,
  type CookieCategory,
  type CookieRegistryEntry,
  cookieCategories,
} from "../../config/cookies.ts";
import { type EnvSource, ga4MeasurementId } from "../../lib/env.schema.ts";

/** A category a visitor is asked about: every category but `essential`. */
export type ConsentCategory = Exclude<CookieCategory, "essential">;

export interface ConsentSources {
  /** The GA4 id the tag loads with, or `undefined` when none is configured. */
  readonly ga4MeasurementId: string | undefined;
  /** The non-essential categories with an active source, in register order. */
  readonly active: readonly ConsentCategory[];
}

function hasSetRow(
  register: readonly CookieRegistryEntry[],
  category: ConsentCategory,
): boolean {
  return register.some(
    (entry) => entry.category === category && entry.status === "set",
  );
}

export function consentSources(
  env: EnvSource,
  register: readonly CookieRegistryEntry[] = COOKIE_REGISTRY,
): ConsentSources {
  const id = ga4MeasurementId(env);
  const sourced: Record<ConsentCategory, boolean> = {
    analytics: id !== undefined || hasSetRow(register, "analytics"),
    marketing: hasSetRow(register, "marketing"),
  };
  const active = cookieCategories.filter(
    (category): category is ConsentCategory =>
      category !== "essential" && sourced[category],
  );
  return { ga4MeasurementId: id, active };
}

/** Whether the consent banner asks on first view: exactly when a category is active. */
export function consentPrompt(sources: ConsentSources): boolean {
  return sources.active.length > 0;
}
