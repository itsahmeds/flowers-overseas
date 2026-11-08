/**
 * @purpose The founder alerts' numbers: quiet hours, storm caps, escalation, resolve, monitors
 * @spec 025
 *
 * Spec 025 §5.5 and §5.2's monitor table as data (TASK-488, TASK-489). Every number the alert
 * module compares against lives here, so a changed threshold is one edit and every test reads the
 * same constant. Times are minutes or seconds as named; nothing here is a date.
 */

/** Pushover's API limits (https://pushover.net/api), enforced by `PushMessageSchema`. */
export const PUSHOVER_LIMITS = {
  titleMax: 250,
  messageMax: 1024,
  urlMax: 512,
  retryMinSeconds: 30,
  expireMaxSeconds: 10_800,
} as const;

/** Spec 025 §5.5 "Severity meaning": the emergency priority's repeat and expiry. */
export const EMERGENCY_RETRY_SECONDS = 120;
export const EMERGENCY_EXPIRE_SECONDS = 3600;

/** The Pushover priority per severity (P3 never pushes) and for resolve notices. */
export const PUSH_PRIORITY = {
  P1: 2,
  P2: 1,
  resolve: -1,
} as const;

/**
 * Spec 025 §5.5 (a) and (b): an order-scoped alert whose `act_by` falls before quiet end plus this
 * many minutes cannot wait for the morning.
 */
export const QUIET_OVERRIDE_MINUTES = 60;

/** Spec 025 §5.5 "Storm control": per environment, in any rolling window. */
export const STORM_WINDOW_MINUTES = 15;
export const STORM_PUSH_CAP = 10;
export const STORM_EMAIL_CAP = 20;

/** Spec 025 §5.5 "Channel failure" and §5.2 `alerts.dispatch`: retries of a 5xx or no answer. */
export const CHANNEL_RETRIES = 3;
export const CHANNEL_RETRY_DELAY_MS = 5000;
/** One Pushover or heartbeat request's timeout. */
export const PUSHOVER_TIMEOUT_MS = 10_000;
export const HEARTBEAT_TIMEOUT_MS = 5000;

/** Spec 025 §5.5 "Escalation". */
export const ESCALATE_AFTER_MINUTES = 15;
export const MAX_PAGES_PER_DAY = 3;
export const RECEIPT_POLL_MINUTES = 2;
export const BUMP_BEFORE_ACT_BY_MINUTES = 60;
export const REMINDER_AFTER_MINUTES = 240;

/** Spec 025 §5.5 "Resolve". */
export const CLEAR_RUNS_TO_RESOLVE = 2;
export const REOPEN_WITHIN_MINUTES = 30;
/** A reopened P2 or P3 does not push again until this long after its last push. */
export const REOPEN_PUSH_QUIET_MINUTES = 240;

/** Spec 025 AC-27: the heartbeat is sent only when `alerts.monitor` completed this recently. */
export const HEARTBEAT_MONITOR_FRESH_MINUTES = 5;

/** Spec 025 Q9: the daily summary's local hour in the configured zone. */
export const DAILY_SUMMARY_HOUR = 8;

/** Spec 025 §5.2 monitor table (TASK-489). */
export const MONITOR = {
  webhookWindowMinutes: 10,
  webhookMinFailed: 2,
  /** Basis points: 2 %. The count must be **above** this share. */
  webhookFailedShareBp: 200,
  notAcceptedAfterMinutes: 120,
  notAcceptedSameDayAfterMinutes: 60,
  notAcceptedP1BeforeDeadlineMinutes: 180,
  dispatchP2LocalHour: 13,
  dispatchP1LocalHour: 16,
  /** `order.dispatch_at_risk`'s act-by: this local hour on the delivery date. */
  dispatchActByLocalHour: 18,
  notDeliveredLocalHour: 20,
  photoMissingP3AfterMinutes: 120,
  photoMissingP2AfterMinutes: 1440,
  backlogMinutes: 10,
  failedSpikeWindowMinutes: 60,
  failedSpikeCount: 5,
  probeTimeoutMs: 10_000,
  probeUserAgent: "fo-probe/1",
  fxAgingWeekdayHours: 24,
  bounceWindowHours: 24,
  bounceMinSends: 25,
  /** Basis points: 4 %. Hard bounces must be **above** this share. */
  bounceShareBp: 400,
  complaintP2Count: 2,
  neonP3Percent: 70,
  neonP2Percent: 90,
  backupMaxAgeHours: 36,
} as const;

/** Where an alert email's runbook link points: the repository's files on `main` (§5.3). */
export const RUNBOOK_BASE_URL =
  "https://github.com/itsahmeds/flowers-overseas/blob/main";
