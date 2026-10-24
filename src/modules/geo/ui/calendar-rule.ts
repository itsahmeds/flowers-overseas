/**
 * The calendar's Rule column in words (spec 007 §14 A11 (a), AC-30; spec 004 §14 A23 clause 6,
 * Appendix A id A11; TASK-189).
 *
 * The column printed `fixed`, `easter_offset` and `nth_weekday` in a code font: the evaluator's
 * identifiers, the only monospace text on the site. It now prints the three approved sentences,
 * and the other rule kinds reuse the one that is true of them (A11 (a)):
 *
 *  - `fixed` → "Same date every year";
 *  - `easter_offset`, `lent_sunday`, `orthodox_easter_offset` → "Moves with Easter" (each moves
 *    with an Easter);
 *  - `nth_weekday`, `last_weekday` → "A set weekday of the month" (the last Sunday of May is a set
 *    weekday of the month);
 *  - `none` → no words: its row has no date, so the Rule cell is empty and no new string exists.
 *
 * **One exhaustive `switch`**, whose `default` narrows the kind to `never`: the day an eighth kind
 * joins `OccasionRuleSchema`, `pnpm typecheck` fails here until someone decides which approved
 * sentence is true of it (or asks the founder for a new one). The keys are written out as
 * fully-qualified literals because `pnpm i18n:check`'s usage scan reads literals.
 */
import type { OccasionRuleKind } from "../occasions/index.ts";

/** The three approved Rule-column sentences, as message keys. */
export type CalendarRuleKey =
  | "corridor.calendar.ruleFixed"
  | "corridor.calendar.ruleEaster"
  | "corridor.calendar.ruleWeekday";

/** The Rule cell's message key for a rule kind, or `undefined` for a `none` row (an empty cell). */
export function calendarRuleKey(
  kind: OccasionRuleKind,
): CalendarRuleKey | undefined {
  switch (kind) {
    case "fixed":
      return "corridor.calendar.ruleFixed";
    case "easter_offset":
    case "lent_sunday":
    case "orthodox_easter_offset":
      return "corridor.calendar.ruleEaster";
    case "nth_weekday":
    case "last_weekday":
      return "corridor.calendar.ruleWeekday";
    case "none":
      return undefined;
    /* c8 ignore next 4 -- unreachable by type: an unmapped kind fails `typecheck` here. */
    default: {
      const unmapped: never = kind;
      return unmapped;
    }
  }
}
