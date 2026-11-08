/**
 * The pure contract rules (spec 030b §14.2 A "Profile terms follow the file", "Reminders", §14.4;
 * AC-39, AC-42; TASK-442): `contractFlags` and `contractReminderDue`.
 *
 * Dates are calendar days in the florist's country zone; "today" is computed by the caller from
 * an injected clock, so the rules are testable across midnight and DST nights.
 */
import { instantToWallClock } from "@/modules/i18n";

/** The closed set of flags a florist's documents can raise, in display order. */
export const CONTRACT_FLAGS = [
  "no_agreement",
  "no_dpa",
  "terms_mismatch",
  "review_due",
  "review_passed",
] as const;
export type ContractFlag = (typeof CONTRACT_FLAGS)[number];

/** A current document, as the flags read it. */
export interface CurrentDocument {
  readonly docKind: "agreement" | "dpa_addendum" | "annex";
  readonly templateVersion: string;
  readonly signedOn: string;
  readonly includesDpa: boolean;
  readonly reviewOn: string | null;
  readonly noticeDays: number;
}

export interface FlagFacts {
  /** Current (not superseded) documents of the florist. */
  readonly current: readonly CurrentDocument[];
  /** Spec 012's profile terms. */
  readonly termsSignedAt: string | null;
  readonly termsVersion: string | null;
  /** Today in the florist's country zone (`YYYY-MM-DD`). */
  readonly today: string;
}

/** `YYYY-MM-DD` minus `days` (calendar arithmetic in UTC, no zone involved). */
export function minusDays(day: string, days: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - days);
  return at.toISOString().slice(0, 10);
}

/** Today's calendar day in `zone` at `now`. */
export function todayInZone(zone: string, now: Date): string {
  return instantToWallClock(now, zone).slice(0, 10);
}

/** `due` from the first day of the notice window to the review date, `passed` after it. */
export function reviewState(
  document: Pick<CurrentDocument, "reviewOn" | "noticeDays">,
  today: string,
): "due" | "passed" | null {
  if (document.reviewOn === null) return null;
  if (today > document.reviewOn) return "passed";
  if (today >= minusDays(document.reviewOn, document.noticeDays)) return "due";
  return null;
}

/** `contractFlags(partnerId)`'s rule over the florist's current documents. */
export function contractFlags(facts: FlagFacts): ContractFlag[] {
  const agreement = facts.current.find((d) => d.docKind === "agreement");
  const addendum = facts.current.find((d) => d.docKind === "dpa_addendum");
  const flags = new Set<ContractFlag>();
  if (agreement === undefined) flags.add("no_agreement");
  if (addendum === undefined && agreement?.includesDpa !== true) {
    flags.add("no_dpa");
  }
  if (
    agreement !== undefined &&
    (facts.termsVersion !== agreement.templateVersion ||
      facts.termsSignedAt !== agreement.signedOn)
  ) {
    flags.add("terms_mismatch");
  }
  for (const document of [agreement, addendum]) {
    if (document === undefined) continue;
    const state = reviewState(document, facts.today);
    if (state === "due") flags.add("review_due");
    if (state === "passed") flags.add("review_passed");
  }
  return CONTRACT_FLAGS.filter((flag) => flags.has(flag));
}

/**
 * `contractReminderDue(row, zone, now)`: which founder email a current document's review date
 * asks for at `now` in `zone`, or `null`.
 */
export function contractReminderDue(
  row: Pick<CurrentDocument, "reviewOn" | "noticeDays">,
  zone: string,
  now: Date,
): "due" | "passed" | null {
  return reviewState(row, todayInZone(zone, now));
}
