/**
 * **The picker's state and its horizon** — the two facts about the delivery calendar that are
 * read from *outside* it (spec 009 §2's states table, §5.2, §11, AC-2, AC-8; spec 004 §14 A19;
 * TASK-123, moved here by TASK-124).
 *
 * `calendar.ts` owns the arithmetic; this file owns the two answers the rest of the repository
 * asks without wanting a grid:
 *
 *  - **`pickerState()`** — `unavailable` / `preview` / `live`. The chrome's cutoff copy
 *    (`deliveryDatesOpen()` in `src/config/countries.ts`, spec 004 §14 A19) and `pnpm seed:check`'s
 *    picker-state summary (§11) read it, and so does the grid.
 *  - **`NEXT_AVAILABLE_HORIZON_DAYS`** — how far ahead the picker will look for an open day.
 *    `pnpm seed:check`'s holiday-coverage rule (AC-2) defines "in-window" as exactly this horizon,
 *    so a year of holiday data cannot run out under a date the calendar would offer.
 *
 * **Why a file of its own.** Both readers above are loaded by plain `node` (`node seed/check.ts`,
 * and every script that imports `src/config/countries.ts`), and `calendar.ts` cannot be: it reaches
 * the `i18n` barrel through `zone.ts`, which re-exports `.tsx` components. This file imports only
 * the country registry, the partners seam and the zod-free vocabularies, so it loads anywhere.
 * `calendar.ts` re-exports both names unchanged, so no import site moved.
 *
 * **The cycle with `src/config/countries.ts` is deliberate and inert**: the registry calls
 * `pickerState()` from inside `deliveryDatesOpen()`, and this file calls `countryConfig()` from
 * inside `pickerState()`. Neither is called while either module is being evaluated, so whichever
 * loads first finishes before the other's function is first invoked.
 */
import { type CountryIso2, countryConfig } from "../../../config/countries.ts";

import { hasActivePartners } from "../partners.ts";

import type { PickerState } from "./types.ts";

/**
 * How far `nextAvailableDate` looks before giving up. A year and a day: a destination whose
 * `deliveryDays` and holidays leave no open day inside a full year is a data fault, and `null`
 * ("no date is known") is the honest answer rather than an unbounded loop.
 *
 * It is also the window `pnpm seed:check` requires holiday rows for (spec 009 AC-2, the
 * `holiday-coverage` rule): a destination that renders a calendar must carry holiday rows for
 * every calendar year this horizon reaches, or the grid would offer a closed day as open
 * (`/review 97`'s finding: with 2027 rows only, 1 January 2028 was offered).
 */
export const NEXT_AVAILABLE_HORIZON_DAYS = 366;

/** The two facts §2's states table is a function of, and the only two. */
export interface PickerStateTerms {
  /** The destination's `operations` block is complete: a cutoff somebody agreed to. */
  readonly operationsComplete: boolean;
  /** A florist is taking our orders there (`hasActivePartners`). */
  readonly activePartners: boolean;
}

/**
 * The pure rule of §2's table, in one place (§5.2: "`pickerState()` is a pure function of
 * (`operations` present, `hasActivePartners`) and is the **single** place the three states are
 * decided").
 *
 * No `operations` → `unavailable`: no dates, no cutoff, no calendar. There is deliberately no
 * global default cutoff (§13 Q3), because an assumed 14:00 is exactly the plausible invention
 * this project's gates exist to prevent.
 */
export function pickerStateFrom(terms: PickerStateTerms): PickerState {
  if (!terms.operationsComplete) return "unavailable";
  return terms.activePartners ? "live" : "preview";
}

/**
 * The state of one destination's picker: the single answer the page, the chrome copy of spec 004
 * §14 A19 and `pnpm seed:check`'s picker-state summary all read.
 */
export function pickerState(iso2: CountryIso2): PickerState {
  return pickerStateFrom({
    operationsComplete: countryConfig(iso2).operations !== undefined,
    activePartners: hasActivePartners(iso2),
  });
}
