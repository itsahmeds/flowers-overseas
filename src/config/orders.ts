/**
 * @purpose Order timing rules: the destination-local hour production starts on the delivery date
 * @spec 013
 *
 * Spec 002 §14 A10.1 and spec 013 §5.2 "Production start on the delivery morning" (the founder's
 * "2 B" of 2026-10-14; TASK-258). An order a florist accepted days ahead stays `paid` (the buyer
 * sees "confirmed" and may still cancel for free) until this wall-clock time on its delivery date
 * in the destination's zone, when `payments.production_start` writes row 16 (`in_production`).
 *
 * One constant, read by `productionStartAt` and its tests. Changing it is a config change with its
 * test, never a schema change. `HH:mm`, 24-hour, destination-local.
 *
 * No database here (`pnpm check:no-db` scans `src/config`).
 */
export const PRODUCTION_START_LOCAL_TIME = "06:00";
