/**
 * Spec 016's routing jobs, for the worker's job table (§5.2 "Jobs", "The `routing` outbox
 * handler"; TASK-328, TASK-329, TASK-330): `order.route`, `assignment.remind`,
 * `assignment.timeout`, `assignment.photo_remind`, `routing.sla_watch`, `order.no_partner_expire`,
 * the `routing` outbox handler (withdrawal included), and `manualReroute`, `rerouteCandidates`
 * and `noPartnerGrace` for spec 020a.
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
export { expireNoPartner, NO_PARTNER_EXPIRY_ACTOR } from "./expiry";
export type {
  NoPartnerCancel,
  NoPartnerExpireDeps,
  NoPartnerExpireOutcome,
} from "./expiry";
export {
  PHOTO_REMIND_AFTER_MINUTES,
  registerRoutingOutbox,
  ROUTING_STEPS,
  routingOutboxHandler,
} from "./handler";
export type {
  RoutingHandlerDeps,
  RoutingStep,
  RoutingStepDeps,
} from "./handler";
export {
  graceEndOf,
  readExhaustion,
  routingAutoOn,
  scheduleNoPartnerExpiry,
} from "./no-partner";
export type { Exhaustion } from "./no-partner";
export { manualReroute } from "./reroute";
export { noPartnerGrace, rerouteCandidates } from "./reroute-candidates";
export type {
  EarlierAnswer,
  NoPartnerGrace,
  RerouteCandidate,
  RerouteReadOptions,
} from "./reroute-candidates";
export type {
  ManualRerouteOptions,
  ManualRerouteRefusal,
  ManualRerouteResult,
} from "./reroute";
export {
  lockAndRecount,
  lockRoutingFacts,
  readRoutingPartners,
  resolveRoutingDeps,
  routeOrder,
  writeOffer,
} from "./route";
export type {
  ExhaustionReason,
  OfferInput,
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
export {
  isWithdrawalEvent,
  NOT_WITHDRAWN_FROM,
  WITHDRAWN_AFTER_ACCEPTANCE,
  WITHDRAWN_REASON,
  withdrawOnStop,
} from "./withdrawal";
export type { WithdrawalEvent, WithdrawalOutcome } from "./withdrawal";
