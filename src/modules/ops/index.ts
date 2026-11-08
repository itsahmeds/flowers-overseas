/**
 * Public barrel for `ops`: founder alerts, their log, escalation, monitors and the daily summary
 * (spec 025; TASK-488, TASK-489).
 *
 * The one way to raise an alert is `raiseAlert` (or `raiseLegacyAlert`, the synchronous shape the
 * older call sites used). `captureAlert` (`src/lib/sentry.ts`) is called from this module only,
 * so every alert has a severity, a row and a channel decision as well as its Sentry event (AC-1).
 */
export {
  ALERT_NAMES,
  ALERT_REGISTRY,
  AlertDefinitionSchema,
  AlertNameSchema,
  type ActByRule,
  type AlertComponent,
  type AlertDefinition,
  type AlertName,
  type ResolveMode,
  type Severity,
  alertDefinition,
  alertTitleKey,
  baseSeverity,
  isAlertName,
  moreSevere,
  raiseOneLevel,
} from "./registry.ts";
export {
  ALERT_CONTEXT_KEYS,
  AlertActorSchema,
  AlertContextSchema,
  AlertInputSchema,
  AlertSettingSchema,
  DEFAULT_ALERT_SETTING,
  ResolveAlertSchema,
  isTimeZone,
  type AlertContext,
  type AlertInput,
  type AlertSetting,
} from "./schemas.ts";
export { type AlertSubject, fingerprintOf } from "./fingerprint.ts";
export {
  type QuietDecision,
  type QuietSubject,
  inQuietHours,
  localDate,
  localInstant,
  pagePriority,
  quietEndAfter,
  quietHoursDecision,
} from "./quiet-hours.ts";
export {
  AlertInputError,
  type ClearResult,
  type LegacyAlertRaiser,
  type RaiseOutcome,
  type RaiseResult,
  alertRaiser,
  clearCondition,
  contextFrom,
  inputFromFields,
  raiseAlert,
  raiseLegacyAlert,
} from "./raise.ts";
export { acknowledgeAlert, resolveAlert, type AckDeps } from "./actions.ts";
export {
  type CapturedPush,
  type CapturingPushChannel,
  PUSHOVER_API,
  type PushChannel,
  type PushMessage,
  PushMessageSchema,
  type PushResult,
  PushoverReceiptSchema,
  PushoverSendResponseSchema,
  type ReceiptStatus,
  capturingPushChannel,
  pushoverChannel,
} from "./pushover.ts";
export {
  type AlertEmail,
  type AlertFacts,
  type MessageOptions,
  type OpsTranslate,
  alertTitle,
  alertUrl,
  buildAlertEmail,
  buildGroupPush,
  buildPushMessage,
  buildStormEmail,
} from "./messages.ts";
export {
  type AlertMailer,
  type DispatchDeps,
  type DispatchOutcome,
  dispatchAlert,
  pushAllowed,
  resetDispatchWarnings,
} from "./dispatch.ts";
export {
  type DispatchJob,
  type DispatchQueue,
  type OpsDeps,
  type OpsExecutor,
  type OpsTransaction,
  type SentryAlert,
} from "./context.ts";
export { OPS_LOG_FIELDS, allowlisted } from "./log.ts";
export {
  type EscalateCounts,
  type EscalateDeps,
  runEscalation,
} from "./escalate.ts";
export {
  type CheckOutcome,
  type DeadlineRule,
  type MonitorCounts,
  type MonitorDeps,
  type ProbeMemory,
  type ProbeResult,
  bounceRateFires,
  complaintSeverity,
  dispatchRiskSeverity,
  errorRateFires,
  fxState,
  neonSeverity,
  notAcceptedSeverity,
  notDeliveredDue,
  photoMissingSeverity,
  probeUrl,
  runMonitor,
  siteDecision,
  weekdayHoursBetween,
} from "./monitor.ts";
export {
  type SummaryDeps,
  type SummaryResult,
  runDailySummary,
} from "./summary.ts";
export {
  type QueueReader,
  heartbeat,
  lastMonitorCompletion,
  resetHeartbeatNotes,
  tickHeartbeat,
} from "./heartbeat.ts";
