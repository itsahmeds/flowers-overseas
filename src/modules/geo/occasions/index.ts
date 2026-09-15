/**
 * `src/modules/geo/occasions` — the occasion-date evaluator and the per-destination calendar
 * (spec 007 §2 "Occasion dates", AC-21, AC-22, T-22; `plan/03` §9; TASK-089).
 *
 * Re-exported from `src/modules/geo/index.ts`, which is what a page imports. `./schema.ts` is
 * deliberately **not** here — see its header.
 */
export {
  type IsoDate,
  MAX_YEAR,
  MIN_YEAR,
  type OccasionRuleKind,
  easterSunday,
  occasionDate,
} from "./evaluate.ts";
export {
  type DatedOccasion,
  NEXT_OCCASIONS_HORIZON_MONTHS,
  type OccasionCalendarRow,
  committedOccasionCalendar,
  nextOccasions,
  observedUndatedOccasions,
  upcomingOccasions,
} from "./calendar.ts";
