/**
 * The values the delivery calendar produces, and the vocabularies they are drawn from (spec 009
 * §2 "The date picker and the cutoff/holiday engine", §5.2, AC-7, AC-8; TASK-123).
 *
 * **Zod-free on purpose**, and it is the same decision `src/modules/geo/occasions` took: the
 * calendar is pure arithmetic over a build-time JSON import, and pulling a parser through the
 * module barrel would put zod into the render path of every page that shows a date (the bytes
 * spec 004 spent TASK-046 removing). `./schemas.ts` holds the zod boundary and is imported by
 * path, once, by a caller that genuinely has untrusted rows — spec 002's importer, spec 012's
 * admin, a later route parsing `?date=`.
 */
import type { Money } from "../../i18n/index.ts";
import type { IsoDate } from "../occasions/index.ts";

export type { SeedCountryHoliday as CountryHoliday } from "../../../../seed/schema/holidays.ts";

/**
 * Why a date cannot be chosen, **in precedence order** — the first that applies is the one
 * rendered, and every consumer reads this array rather than restating the order.
 *
 * The first five are AC-7's enumeration, ordered from the buyer's own position outwards: the day
 * has gone, then today's cutoff has gone, then the destination's calendar (a public holiday is
 * the specific fact about that day, so it outranks the weekly rules), then the Sunday rule, then
 * the general delivery-weekday rule. A Sunday that is also a public holiday says "public
 * holiday", because that is the sentence a buyer learns something from; the Sunday rule is a
 * standing fact they can read once in the delivery facts.
 *
 * `notOrderable` is last and is not a fact about the destination's calendar at all: it is the
 * `preview` state saying that no date can be taken yet (§13 Q6, "the preview grid's closed chips
 * share one sentence"), and it applies only where none of the five does. `DeliveryWindowSchema`
 * refuses it in any other state.
 */
export const deliveryReasonKeys = [
  "delivery.reason.beforeEarliest",
  "delivery.reason.pastCutoff",
  "delivery.reason.publicHoliday",
  "delivery.reason.sundayClosed",
  "delivery.reason.notDeliveryDay",
  "delivery.reason.notOrderable",
] as const;

export type DeliveryReasonKey = (typeof deliveryReasonKeys)[number];

/** The reason that exists only in `preview`. */
export const NOT_ORDERABLE_REASON = "delivery.reason.notOrderable" as const;

/** The five reasons AC-7 enumerates: facts about the destination's calendar. */
export const CALENDAR_REASON_KEYS: readonly DeliveryReasonKey[] =
  deliveryReasonKeys.filter((key) => key !== NOT_ORDERABLE_REASON);

/** The three states of §2's table, decided by `pickerState()` and by nothing else. */
export const pickerStates = ["unavailable", "preview", "live"] as const;
export type PickerState = (typeof pickerStates)[number];

/**
 * One sentence per state, as a message key: the picker is never rendered wordlessly, and which
 * sentence it is, is data rather than a branch in a component (spec 009 §2's states table).
 *
 * The strings themselves are TASK-126's, in four locales; nothing here may hold a user-facing
 * literal (`CLAUDE.md`).
 */
export const PICKER_NOTICE_KEYS: Readonly<Record<PickerState, string>> = {
  unavailable: "delivery.picker.unavailable",
  preview: "delivery.picker.preview",
  live: "delivery.picker.live",
};

/**
 * One day in the grid — "a value, not a rendering decision" (§2).
 *
 * `reasonKey` is present exactly when `selectable` is `false`, which is what makes "exactly one
 * reason per unselectable date" a property of the shape: one optional field holds at most one
 * value, and the choice between two applicable rules is `calendar.ts`'s documented precedence.
 * `occasionKeys` is always present and may be empty — an absent array and an empty one would be
 * two ways to say "no occasion here".
 */
export interface DeliveryDate {
  readonly date: IsoDate;
  readonly selectable: boolean;
  readonly reasonKey?: DeliveryReasonKey | undefined;
  /** Spec 005's `dateSurcharges()` amount for this day, exact, printed before selection. */
  readonly surcharge?: Money | undefined;
  readonly occasionKeys: readonly string[];
}

/** The grid the page renders, with the state that decides what it is allowed to say. */
export interface DeliveryWindow {
  readonly state: PickerState;
  /** The destination's IANA zone. Absent exactly when there is no `operations` block. */
  readonly timeZone?: string | undefined;
  /** The authored `HH:mm` cutoff in that zone — absolute, never a countdown (§13 Q4). */
  readonly cutoffLocal?: string | undefined;
  readonly dates: readonly DeliveryDate[];
  readonly noticeKey: string;
}
