/**
 * Public barrel for `risk`: fraud pre-checks before money moves, the scoring core and the copy
 * guard (spec 021; TASK-493). The gate before routing, the review queue, early fraud warnings and
 * the evidence pack join it in TASK-494 and the later tasks of spec 021 §12.
 *
 * `risk` imports only the public barrels of `orders` and `ops`; it never imports `payments`
 * (spec 013's pay step calls `prePayCheck` and owns `endPaymentAttempts`, and the job layer hands
 * `attemptStats` to the card-testing detector), so no import cycle exists. No row of a risk table
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
export { RISK_ACTOR, type RiskDeps, type RiskTransaction } from "./context.ts";
export { type DeadlineOrder, reviewDeadline } from "./deadline.ts";
export { type DisposableLists, isDisposableEmail } from "./disposable.ts";
export {
  type AttemptStats,
  type CardTestingDeps,
  type CardTestingOutcome,
  cardTestingSuspected,
  detectCardTesting,
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
