/**
 * Destinations the go-live preflight refuses because of EU restrictive measures (`plan/07` §9:
 * "Destinations under EU sanctions are `disabled`"; spec 012b §2.8; TASK-300).
 *
 * A data list, read by one predicate (`isSanctionedDestination`): adding or removing a code is a
 * reviewed change of this file, never a branch in code. It names the countries under broad EU
 * trade restrictions at the time of writing; none of them is a destination in
 * `src/config/countries.ts`, so today the condition only ever holds. The founder confirms the list
 * with the lawyer before the first non-EU destination is added (`docs/tasks/TASK-300.md`).
 */
import { z } from "zod";

const Iso2ListSchema = z.array(z.string().regex(/^[A-Z]{2}$/u));

export const SANCTIONED_DESTINATIONS: readonly string[] = Object.freeze(
  Iso2ListSchema.parse(["BY", "IR", "KP", "RU"]),
);

/** Whether `iso2` is on the list. */
export function isSanctionedDestination(iso2: string): boolean {
  return SANCTIONED_DESTINATIONS.includes(iso2);
}
