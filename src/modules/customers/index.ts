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
