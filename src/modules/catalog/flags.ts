/**
 * The feature-flag seam's one resolution rule (spec 005 §12; TASK-064).
 *
 * Spec 005 owns no flag and gates none of its own behaviour; it consumes two scopes spec 002
 * seeds — `addon.wine.{country}` (alcohol licensing) and, from TASK-068, `currency.{code}` — and
 * this file is the single place a flag is *read*. That matters for one reason: when spec 002's
 * `feature_flag` / `feature_flag_scope` tables and spec 012's admin take the authority over, the
 * change is `catalogProviders().flags` in the composition root and nothing else. No caller
 * changes, and no call site grows a second interpretation of what a flag means.
 *
 * **Closed by default.** An unknown or absent key is `false`, never `true`. The consequence is
 * the honest one for the two scopes at hand: a destination whose wine licensing nobody has
 * recorded does not offer wine, and a currency nobody has enabled is not displayed — a flag that
 * failed open would sell alcohol without a licence (`plan/07` §6) or show a price in a currency we
 * cannot charge (spec 005 §13 Q11), which are exactly the failures the flags exist to prevent.
 *
 * Not exported from the barrel: `plan/01` §5 gives no module a general flag API, and spec 005
 * §5.2's export list has no `isFlagEnabled`. Callers ask this module for add-ons and get the ones
 * they may offer (`listAddons()`); they never ask it whether a flag is on.
 */
import { catalogProviders } from "./providers";
import { FlagKeySchema } from "./schemas";

/**
 * Is this flag on for this scope?
 *
 * `false` for an absent row, so the answer is closed by default (above). There is no memoisation:
 * a flag flip must take effect on the next read, and the only cache in front of it is the ISR
 * window plus `cacheTagsFor()` (TASK-069) — a process-local map would outlive an admin flip and
 * keep an unlicensed add-on on sale.
 */
export async function isFlagEnabled(key: string): Promise<boolean> {
  const flagKey = FlagKeySchema.parse(key);
  const rows = await catalogProviders().flags.flags();
  const row = rows.find((candidate) => candidate.key === flagKey);
  return row?.enabled ?? false;
}
