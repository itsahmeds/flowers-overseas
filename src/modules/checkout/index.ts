/** Public barrel for `checkout` (the checkout: mode, steps, schemas, address forms, phones). Owned by: spec 010. */

/**
 * Checkout's import path (spec 010; TASK-200).
 *
 * TASK-200 ships the database-free core: the one decision of what a checkout may do
 * (`checkoutMode`, `legalReadiness`, `checkoutEntryFor`), the boundary schemas of the start route
 * and the three steps, the recipient form model, phone parsing and the checkout's one currency.
 * TASK-203 adds drafts (`draft.ts`), the `fo_checkout` cookie, pricing over the quote
 * (`pricing.ts`), the start route's contract (`start.ts`) and the step actions (`steps.ts`,
 * `actions.ts`); placement and the payment-step seam arrive with TASK-205, behind this same barrel.
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

// TASK-203: drafts, the start route, the step actions, quote issue and verification.
export {
  type CheckoutFlagReader,
  type CheckoutModeRequest,
  currentCheckoutMode,
} from "./mode";
export {
  CHECKOUT_COOKIE_ATTRIBUTES,
  CHECKOUT_COOKIE_MAX_AGE_SECONDS,
  CHECKOUT_COOKIE_NAME,
  checkoutCookieHeader,
  draftTokenFromCookieHeader,
  draftTokenHash,
  isDraftToken,
} from "./cookie";
export {
  CreateDraftInputSchema,
  DraftBuyerSchema,
  DraftCardSchema,
  DraftPatchSchema,
  DraftRecipientSchema,
  createDraft,
  draftExpiryAt,
  draftModes,
  expireDrafts,
  loadDraft,
  saveStep,
  type CreateDraftInput,
  type Draft,
  type DraftBuyer,
  type DraftCard,
  type DraftConnection,
  type DraftLookup,
  type DraftMode,
  type DraftPatch,
  type DraftRecipient,
  type StepsCompleted,
} from "./draft";
export {
  ADDON_TIER_PREFIX,
  deriveQuote,
  draftTotals,
  priceChange,
  selectionOf,
  verifyDraftQuote,
  type DraftLine,
  type DraftTotals,
  type NoticeAmount,
  type QuoteCheck,
  type QuoteSelection,
} from "./pricing";
export {
  isSameOrigin,
  methodNotAllowed as checkoutMethodNotAllowed,
  startCheckout,
  type StartDependencies,
} from "./start";
export {
  SelectionUpdateSchema,
  formValues,
  runCardAndBuyerStep,
  runRecipientStep,
  runUpdateSelection,
  stepPath,
  type FieldIssue,
  type SelectionUpdate,
  type StepContext,
  type StepOutcome,
  type StepState,
} from "./steps";
export {
  saveCardAndBuyerStep,
  saveRecipientStep,
  updateSelection,
} from "./actions";
