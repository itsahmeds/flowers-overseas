/**
 * The checkout's design-system primitives (spec 010 §5.3, §5.4; AC-14 component half, AC-38 island
 * half, AC-39 component half; `docs/design/system/components.dc.html` "Checkout"; TASK-201).
 *
 * **Imported by path** (`@/modules/ui/checkout`), never through `@/modules/ui`. Three of these
 * files are client islands (`CardCounter`, `BlurValidation`, `FocusOnMount`) and one is a client
 * component (`PlaceOrderButton`). A client module reachable from the main barrel is bundled into
 * the document JavaScript of every route that imports the barrel (the `ConsentGallery` measurement
 * in `../index.ts`), and every document layout imports it. Only the checkout route and the
 * gallery import this file.
 *
 * **Copy arrives as props.** No file here names a message key or calls `next-intl`: spec 003 §14
 * A17 clause 2 (check 11) refuses checkout keys reached from `src/modules/ui/`, and the
 * islands may not carry a catalogue (§5.4). The checkout route resolves the keys and passes the
 * strings; amounts arrive as `Money` and are formatted here by `formatMoney`.
 *
 * **The islands** (AC-38): `CardCounter` (counter and preview), `BlurValidation` (on-blur
 * messages), `FocusOnMount` (the error summary's focus) and `PlaceOrderButton`'s `useFormStatus`,
 * 4 096 B Brotli together at most, no network request, no inline script
 * (`tests/unit/checkout-ui-islands.test.ts`).
 */
export { BlurValidation } from "./BlurValidation.tsx";
export type { BlurValidationProps } from "./BlurValidation.tsx";
export { ConfirmationRecap } from "./ConfirmationRecap.tsx";
export type { ConfirmationRecapProps } from "./ConfirmationRecap.tsx";
export { COUNT_SLOT } from "./counter-slot.ts";
export { DemoBanner } from "./DemoBanner.tsx";
export type { DemoBannerProps } from "./DemoBanner.tsx";
export { ErrorSummary } from "./ErrorSummary.tsx";
export type { ErrorSummaryItem, ErrorSummaryProps } from "./ErrorSummary.tsx";
export { describedBy, fieldMessageIds } from "./FieldMessages.tsx";
export type { FieldMessageContent } from "./FieldMessages.tsx";
export {
  InlinePrivacyNotice,
  PRICE_CONFIRM_FIELD,
  PriceChangedNotice,
} from "./Notices.tsx";
export type {
  InlinePrivacyNoticeProps,
  PriceChangedNoticeProps,
} from "./Notices.tsx";
export { OrderSummaryMini, OrderSummaryPanel } from "./OrderSummaryPanel.tsx";
export type {
  OrderSummaryItem,
  OrderSummaryMiniProps,
  OrderSummaryPanelProps,
  SummaryAmount,
  SummaryLine,
  VatLine,
} from "./OrderSummaryPanel.tsx";
export { PlaceOrderButton } from "./PlaceOrderButton.tsx";
export type { PlaceOrderButtonProps } from "./PlaceOrderButton.tsx";
export { RadioChipGroup } from "./RadioChipGroup.tsx";
export type {
  RadioChipGroupProps,
  RadioChipOption,
} from "./RadioChipGroup.tsx";
export { SelectField } from "./SelectField.tsx";
export type { SelectFieldProps, SelectOption } from "./SelectField.tsx";
export { StepProgress } from "./StepProgress.tsx";
export type { StepProgressProps, StepProgressStep } from "./StepProgress.tsx";
export { StickyTotalBar } from "./StickyTotalBar.tsx";
export type { StickyTotalBarProps } from "./StickyTotalBar.tsx";
export {
  SAMPLE_INTENT,
  SampleDetailsButton,
  SubmitButton,
} from "./SubmitButton.tsx";
export type {
  FormActionValue,
  SampleDetailsButtonProps,
  SubmitButtonProps,
} from "./SubmitButton.tsx";
export { TextAreaWithCounter } from "./TextAreaWithCounter.tsx";
export type {
  CardPreviewContent,
  TextAreaWithCounterProps,
} from "./TextAreaWithCounter.tsx";
export { TextField } from "./TextField.tsx";
export type { ClientFieldMessages, TextFieldProps } from "./TextField.tsx";
