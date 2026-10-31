/**
 * Spec 016's routing rules (§5.2 "Routing functions"; TASK-327): who may be offered an order, in
 * what order, when the offer goes out and must be answered, and when an untaken order ends. All
 * pure; the jobs that read the database and write the events are spec 016 task 1b's.
 */
export {
  CanServeInputSchema,
  CatalogRowSchema,
  CoverageRowSchema,
  createCanServe,
  effectiveAcceptanceBp,
  effectiveRatingBp,
  eligibleCandidates,
  EXCLUSION_RULES,
  ownerOfOrder,
  PARTNER_STATUS_FOR_MODE,
  PARTNER_STATUSES,
  PartnerStatusSchema,
  rankCandidates,
  RoutedModeSchema,
  RoutingLineSchema,
  RoutingOrderSchema,
  RoutingPartnerSchema,
  servability,
} from "./candidates";
export type {
  CanServeInput,
  CanServeResult,
  Candidate,
  CatalogRow,
  CoverageReader,
  CoverageRow,
  Eligibility,
  EligibilityContext,
  ExclusionRule,
  PartnerStatus,
  RoutedMode,
  RoutingLine,
  RoutingOrder,
  RoutingPartner,
} from "./candidates";
export {
  expectedFirstOfferAt,
  graceEnd,
  offerWindow,
  routingDeadline,
} from "./windows";
export type { FirstOfferInput, OfferWindow, RoutingDestination } from "./windows";
