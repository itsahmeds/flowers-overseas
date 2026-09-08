// Invalid fixture: `toLocaleDateString` with no locale and no time zone — in a relay the zone is
// the recipient's, never the server's (spec 003 AC-21, TASK-037). One violation.
export function deliveryLabel(date: Date): string {
  return date.toLocaleDateString();
}
