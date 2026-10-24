/**
 * The close (spec 022a §2 "The close", §5.2; TASK-369): `closeDueAt`, the `order.closed` payload
 * schema and the `order.close_sweep` run. Importing this module registers `OrderClosedV1`.
 */
export {
  CLOSABLE_STATUSES,
  ClosableStatusSchema,
  OrderClosedV1,
} from "./events";
export type { ClosableStatus } from "./events";
export { CLOSE_DELAY_MS, closeDueAt } from "./due";
export type { CloseFacts } from "./due";
export {
  CLOSE_ACTOR,
  CLOSE_BACKLOG_ALERT,
  CLOSE_BACKLOG_ALERT_THRESHOLD,
  CLOSE_SWEEP_LIMIT,
  CloseSweepError,
  OPEN_REFUND_STATUSES,
  runCloseSweep,
} from "./sweep";
export type {
  CloseOutcome,
  CloseSweepCounts,
  CloseSweepOptions,
  SweepTransaction,
} from "./sweep";
