/**
 * Spec 034's basket reminder (TASK-449..452): the sub-module of `checkout`, exported through
 * `modules/checkout/index.ts`.
 */
export {
  type DeliveryWindowFn,
  type DraftEligibilityView,
  hasAvailableLine,
  isAbandoned,
  type ReminderLine,
  reminderLineStates,
} from "./eligibility";
export {
  BASKET_REMINDER_COPY_PREFIX,
  basketReminderOffered,
  defaultReminderFlag,
  type ReminderFlagReader,
  type ReminderGate,
} from "./offer";
export {
  autoPauseCheck,
  type ScanDeps,
  type ScanResult,
  scanAbandonedBaskets,
  shouldAutoPause,
} from "./scan";
export {
  availableLines,
  markReminderFailed,
  type ReminderLineView,
  type SendDeps,
  type SendOutcome,
  sendBasketReminder,
  type SkipReason,
} from "./send";
export {
  mintReminderToken,
  ReminderTokenSchema,
  reminderTokenHash,
} from "./tokens";
