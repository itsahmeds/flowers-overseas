/** Public barrel for `customers` (customers, recipients, consent). Owned by: spec 019. */
// The guest-checkout writers are spec 010's (§5.2, TASK-202).
export {
  createRecipient,
  GuestCustomerInputSchema,
  normaliseEmail,
  normaliseFullName,
  RecipientInputSchema,
  upsertGuestCustomer,
} from "./writers";
// Spec 034's basket reminder consent (§5.2, AC-8; TASK-449).
export {
  appendContactConsent,
  BasketReminderConsentInputSchema,
  recordBasketReminderConsent,
} from "./consent";
export type {
  BasketReminderConsentInput,
  BasketReminderConsentResult,
} from "./consent";
export type {
  CreatedRecipient,
  GuestCustomerInput,
  RecipientInput,
  UpsertedCustomer,
} from "./writers";
// Spec 018 §14 A-founder-2026-10-22 C.7.2, C.7.3 (TASK-352): the buyer account's details,
// preferences and saved recipients. The checkout seam is `./checkout-profile` (it reads the
// buyer session), imported by path so this barrel stays free of the sign-in surface.
export {
  AccountDetailsSchema,
  DetailsInputSchema,
  listSavedRecipients,
  readAccountDetails,
  recipientSaveOffer,
  removeSavedRecipient,
  SAVED_RECIPIENT_LIMIT,
  SavedRecipientSchema,
  saveDetails,
  saveRecipientFromOrder,
  UNSAVEABLE_PLACE_KINDS,
  markSavedRecipientUsed,
} from "./buyer-account";
export type {
  AccountDetails,
  AccountExecutor,
  AccountRunner,
  DetailsInput,
  SavedRecipient,
  SaveOffer,
  SaveRecipientOutcome,
} from "./buyer-account";
// Spec 018 §14 A-founder-2026-10-22 C.7.4 (TASK-353): occasion reminders, their own consent, the
// one-click stop and the daily send.
export {
  createReminder,
  dueReminders,
  isCalendarDay,
  mintUnsubscribeToken,
  OCCASION_KEYS,
  OCCASION_REMINDER_LIMIT,
  OccasionReminderSchema,
  readReminders,
  REMINDER_LEAD_DAYS,
  ReminderInputSchema,
  reminderTargets,
  reminderUnsubscribeLinkToken,
  removeReminder,
  runOccasionReminders,
  setReminderConsent,
  unsubscribeReminders,
} from "./reminders";
export type {
  CreateReminderOutcome,
  DueReminder,
  OccasionKey,
  OccasionReminder,
  OccasionReminderJobDeps,
  OccasionReminderRun,
  ReminderChannel,
  ReminderInput,
  ReminderLeadDays,
  ReminderRunners,
  ReminderState,
  ReminderTarget,
} from "./reminders";
// The one-click `POST /api/reminders/unsubscribe` (RFC 8058; TASK-353).
export {
  REMINDER_UNSUBSCRIBE_HEADERS,
  reminderOneClickMethodNotAllowed,
  reminderOneClickResponse,
} from "./reminder-http";
export { systemAccountRunner } from "./system-runner";
