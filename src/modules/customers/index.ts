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
