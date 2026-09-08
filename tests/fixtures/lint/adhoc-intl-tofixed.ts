// Invalid fixture: `toFixed` rounds in binary floating point and emits `.` regardless of locale —
// the path a rounding error takes into a displayed price (spec 003 AC-21, §8, TASK-037).
// One violation.
export function share(ratio: number): string {
  return ratio.toFixed(2);
}
