/**
 * Public barrel for `risk`: fraud pre-checks before money moves, the scoring core and the copy
 * guard (spec 021; TASK-493), the gate before routing and the review queue (TASK-494). Early
 * fraud warnings and the evidence pack join it in TASK-495.
 *
 * `risk` imports only the public barrels of `orders`, `geo` and `ops`; it never imports
 * `payments` (spec 013's pay step calls `prePayCheck` and owns `endPaymentAttempts`; the job layer
 * and the admin actions hand it `attemptStats`, `riskFactsFor` and `cancelOrder`), so no import
 * cycle exists. No row of a risk table
 * holds an email, fingerprint, address or name; no log line carries one.
 *
 * Owned by: spec 021.
 */
export {
  ACCUSATION_PATTERNS,
  type AccusationLocale,
  type AccusationPattern,
  accusationMatches,
} from "./copy-guard.ts";
export {
  type AdminRiskContext,
  RISK_ACTOR,
  type RiskDeps,
  type RiskTransaction,
  adminRiskTransaction,
} from "./context.ts";
export {
  type Assessment,
  FACTS_RETRY_MS,
  type RiskFactsInput,
  type RiskFactsSource,
  assess,
  isPeakDay,
} from "./assess.ts";
export { addToBlocklist, orderHashes } from "./blocklist.ts";
export {
  OrderRiskHeldV1,
  OrderRiskReleasedV1,
  registerRiskEvents,
} from "./events.ts";
export { type GateDeps, riskGatedRouting } from "./gate.ts";
export {
  DECIDED_WINDOW_DAYS,
  type ReviewView,
  type RiskPanelView,
  listDecidedReviews,
  listOpenReviews,
  openReviewCount,
  reviewBuyer,
  reviewDetail,
  riskPanelFor,
  topSignals,
} from "./queue.ts";
export {
  ADMIN_DECISION_REASONS,
  type AdminDecisionReason,
  type DeadlineDefaultDeps,
  type DeadlineOutcome,
  type DecideReviewDeps,
  REASONS_BY_DECISION,
  REVIEW_DECISIONS,
  REVIEW_STATUSES,
  RISK_DEADLINE_ACTOR,
  type ReviewDecision,
  type ReviewDecisionInput,
  type ReviewDecisionResult,
  ReviewDecisionSchema,
  type ReviewStatus,
  type RiskCancel,
  applyDeadlineDefault,
  decideReview,
  openReviewFor,
  releasedAt,
} from "./reviews.ts";
export {
  type IdentityHashes,
  recordIdentities,
  velocityCounts,
} from "./velocity.ts";
export { type DeadlineOrder, reviewDeadline } from "./deadline.ts";
export { type DisposableLists, isDisposableEmail } from "./disposable.ts";
export {
  type AttemptStats,
  type CardTestingDeps,
  type CardTestingOutcome,
  type ReviewDeadlineCounts,
  type ReviewDeadlineDeps,
  cardTestingSuspected,
  detectCardTesting,
  runReviewDeadlines,
} from "./monitor.ts";
export {
  type AddressInput,
  type IdentityKind,
  RISK_HASH_KEY_BYTES,
  emailHash,
  identityHash,
  normaliseAddress,
  normaliseEmail,
} from "./normalise.ts";
export {
  type PrePayRefusal,
  type PrePayVerdict,
  PrePayVerdictSchema,
  activePause,
  prePayCheck,
} from "./prepay.ts";
export {
  RadarFactsSchema,
  type RadarFacts,
  type RiskDecision,
  type RiskInputV1,
  RiskInputV1Schema,
  type RiskScore,
  type RiskSignals,
  RiskSignalsV1Schema,
  bandFor,
  isHighScore,
  scoreOrder,
} from "./score.ts";
export { cardMessageMatches, ibanChecksumValid } from "./signals.ts";
