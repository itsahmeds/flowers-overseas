/** Public barrel for `checkout` (the checkout: mode, steps, schemas, address forms, phones). Owned by: spec 010. */

/**
 * The only import path into the checkout module (spec 010 §5.2; TASK-200).
 *
 * TASK-200 ships the database-free core: the one decision of what a checkout may do
 * (`checkoutMode`, `legalReadiness`, `checkoutEntryFor`), the boundary schemas of the start route
 * and the three steps, the recipient form model, phone parsing and the checkout's one currency.
 * Drafts, pricing over the quote, placement, the payment-step seam and the server actions arrive
 * with TASK-203 onwards, behind this same barrel.
 */
export {
  CHECKOUT_FLAG_KEYS,
  CheckoutModeInputsSchema,
  PHASE_0_LEGAL_SOURCES,
  addressFormatKinds,
  checkoutEntries,
  checkoutEntryFor,
  checkoutMode,
  checkoutModes,
  legalDocumentKinds,
  legalReadiness,
  legalReadinessReport,
  legalReadinessTerms,
  legalRegimeFor,
  legalRegimes,
  stripeKeyKind,
  stripeKeyKinds,
  type AddressFormatKind,
  type CheckoutDeployment,
  type CheckoutEntry,
  type CheckoutMode,
  type CheckoutModeInputs,
  type LegalDocumentKind,
  type LegalDocumentStatus,
  type LegalReadinessSources,
  type LegalReadinessTerm,
  type LegalRegime,
  type StripeKeyKind,
} from "./mode";
export {
  CHECKOUT_ERROR_KEYS,
  CardAndBuyerStepSchema,
  CheckoutStartSchema,
  PHONE_NON_LOCAL_KEY,
  RecipientStepSchema,
  ReviewStepSchema,
  type CheckoutStart,
  type RecipientStep,
  type ReviewStep,
} from "./schemas";
export {
  addressFormModel,
  type AddressFieldModel,
  type AddressFormModel,
  type AddressFormStatus,
  type AddressInputMode,
} from "./address";
export {
  parseBuyerPhone,
  parseRecipientPhone,
  phoneRejections,
  type ParsedPhone,
  type PhoneRejection,
  type PhoneResult,
} from "./phone";
export { checkoutCurrency } from "./currency";
