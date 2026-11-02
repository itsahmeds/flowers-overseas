/**
 * Spec 016's routing jobs, for the worker's job table (§5.2 "Jobs", "The `routing` outbox
 * handler"; TASK-328): `order.route`, `assignment.remind`, `assignment.timeout`,
 * `assignment.photo_remind`, `routing.sla_watch`, and the `routing` outbox handler.
 *
 * Not in `./index.ts` (the pure rules) nor in the `orders` barrel: importing this registers the
 * router's event schemas (`assignment.timed_out`, `order.manual_reroute`) and spec 011's, which
 * only the processes that route orders need, the way `../close` registers its own.
 */
export {
  photoRemind,
  remindAssignment,
  SLA_OVERDUE_MINUTES,
  SLA_WATCH_BATCH,
  timeoutAssignment,
  watchRoutingSla,
} from "./assignment-jobs";
export type {
  AssignmentJobDeps,
  JobNotifier,
  PhotoRemindOutcome,
  RemindOutcome,
  TimeoutOutcome,
} from "./assignment-jobs";
export { createRoutingDeclineEffect, routingDeclineEffect } from "./effect";
export type { DeclineContext, RoutingDeclineEffect } from "./effect";
export {
  ASSIGNMENT_TIMEOUT_ACTOR,
  AssignmentTimedOutV1,
  ORDER_ROUTE_ACTOR,
  OrderManualRerouteV1,
  ROUTING_WRITTEN_EVENTS,
} from "./events";
export {
  PHOTO_REMIND_AFTER_MINUTES,
  registerRoutingOutbox,
  ROUTING_STEPS,
  routingOutboxHandler,
} from "./handler";
export type { RoutingHandlerDeps, RoutingStep } from "./handler";
export {
  lockRoutingFacts,
  readRoutingPartners,
  resolveRoutingDeps,
  routeOrder,
} from "./route";
export type {
  ExhaustionReason,
  RouteOutcome,
  RouteSkipReason,
  RoutingAlert,
  RoutingDeps,
  RoutingFacts,
  RoutingTransaction,
} from "./route";
export {
  createPgBossRoutingScheduler,
  pgBossRoutingScheduler,
  ROUTING_REQUEST_ID,
  RoutingJobSchema,
  routingJobKey,
} from "./schedule";
export type { RoutingJob, RoutingScheduler } from "./schedule";
