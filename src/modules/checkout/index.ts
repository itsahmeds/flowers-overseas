/** Public barrel for `checkout` (the checkout: mode, steps, schemas, address forms, phones). Owned by: spec 010. */

/**
 * Checkout's import path (spec 010; TASK-200).
 *
 * TASK-200 ships the database-free core: the one decision of what a checkout may do
 * (`checkoutMode`, `legalReadiness`, `checkoutEntryFor`), the boundary schemas of the start route
 * and the three steps, the recipient form model, phone parsing and the checkout's one currency.
 * Drafts, pricing over the quote, placement, the payment-step seam and the server actions arrive
 * with TASK-203 onwards, behind this same barrel.
 *
 * `CHECKOUT_FLAG_KEYS` and `stripeKeyKind()` are deliberately **not** exported (spec 010 AC-1,
 * `/break 201` hole 1): they are the inputs of the mode decision, and a file that could import
 * them could decide a mode outside `mode.ts`. TASK-203 wires the flag and key reads inside
 * `mode.ts`; `tests/unit/checkout-mode.test.ts` fails on any other file that names them.
 */
export {
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
