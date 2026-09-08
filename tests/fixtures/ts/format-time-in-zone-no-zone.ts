// Fixture for AC-17 / T-17 (TASK-036): `formatTimeInZone` and `formatDate` take a **required**
// IANA zone, because in a relay "local time" is ambiguous (spec 003 §2, §5.3; plan/03 §10).
// This file MUST fail `tsc -p tsconfig.fixtures.json` with TS2554 (Expected 3-4 arguments, but
// got 2) and TS2554 (Expected 4 arguments, but got 3). Excluded from `pnpm typecheck`.
import { formatDate, formatTimeInZone } from "../../../src/modules/i18n";

const cutoff = new Date("2027-02-14T13:00:00Z");

// No suppression directive appears in this file on purpose: the fixture's job is to fail the
// compile, and a directive would suppress the very error being asserted.
export const zoneless: string = formatTimeInZone(cutoff, "pl");
export const zonelessDate: string = formatDate(cutoff, "pl", "deliveryDate");
