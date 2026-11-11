/**
 * @purpose Tells an implementer's self-approval from the orchestrator's recorded one (TASK-522)
 *
 * An implementer ships new copy `reviewed: false`; approving it is the founder's act, recorded by
 * the orchestrator under the founder's blanket approval of 2026-10-31 (spec 003
 * A-founder-2026-10-31a) with a `record-approval-NNN.py` script, whose `reviewedBy` says so. A test
 * that pins "unreviewed" therefore holds for a key that is either still unreviewed or carries that
 * exact record, and for nothing else.
 */
export interface ReviewRecord {
  readonly reviewed?: boolean;
  readonly reviewedBy?: string;
}

const DELEGATED =
  /^founder \(delegated\), \d{4}-\d{2}-\d{2}: recorded by the orchestrator with record-approval-\d+\.py /u;

/** True for `reviewed: false`, or for `reviewed: true` with the orchestrator's delegated record. */
export function unreviewedOrDelegated(
  record: ReviewRecord | undefined,
): boolean {
  if (record === undefined) return false;
  if (record.reviewed === false) return true;
  return record.reviewed === true && DELEGATED.test(record.reviewedBy ?? "");
}
