/**
 * Public barrel for `customers` (customers, recipients, consent). Owned by: spec 019; the
 * guest-checkout writers are spec 010's (§5.2).
 */
export {
  createRecipient,
  GuestCustomerInputSchema,
  normaliseEmail,
  normaliseFullName,
  RecipientInputSchema,
  upsertGuestCustomer,
} from "./writers";
export type {
  CreatedRecipient,
  GuestCustomerInput,
  RecipientInput,
  UpsertedCustomer,
} from "./writers";
