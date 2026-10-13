/**
 * The gallery's fixtures for spec 010's checkout primitives (TASK-201; `docs/design/wireframes/
 * checkout-{desktop,mobile}.dc.html`).
 *
 * The figures are the board's: £45.90 all-in, VAT 8 % (£3.40) inside it, and £46.20 as the
 * example of a re-derived quote. Every amount enters through `MoneySchema`, so a drifted fixture
 * throws here rather than rendering a wrong price. The recipient and buyer are TASK-200's Polish
 * sample (`checkout-samples.ts`), the source the "Use sample details" button fills from; the card
 * text is the board's. Nothing here reads a draft, the catalogue or the database.
 */
import { CHECKOUT_LIMITS } from "@/config/checkout";
import { CHECKOUT_SAMPLES } from "@/config/checkout-samples";
import { type Money, MoneySchema } from "@/modules/i18n";

const gbp = (amountMinor: number): Money =>
  MoneySchema.parse({ amountMinor, currency: "GBP" });

export const CHECKOUT_TOTAL = gbp(4590);
export const CHECKOUT_REDERIVED_TOTAL = gbp(4620);
export const CHECKOUT_VAT = gbp(340);
/** 8 % in basis points, for `formatPercentFromBasisPoints`. */
export const CHECKOUT_VAT_RATE_BP = 800;
export const CHECKOUT_STEMS = 18;

/** Thursday 8 October 2026, noon in Warsaw: the board's chosen demo date. */
export const CHECKOUT_DATE = new Date("2026-10-08T10:00:00Z");
export const CHECKOUT_ZONE = "Europe/Warsaw";

export const CHECKOUT_SAMPLE = CHECKOUT_SAMPLES.PL;

export const CHECKOUT_CARD_MESSAGE = "Happy birthday Mama!";
export const CHECKOUT_SIGN_AS = "Love, Anna";
/** A card of 205 graphemes: the over-limit state. */
export const CHECKOUT_CARD_TOO_LONG =
  `${"Happy birthday! ".repeat(12)}Lots of love`.padEnd(
    CHECKOUT_LIMITS.cardMessage + 5,
    "x",
  );

/** A non-local recipient phone (Ofcom's drama range): the warning state. */
export const CHECKOUT_FOREIGN_PHONE = "+44 7700 900123";
/** A street with no number: the board's error state. */
export const CHECKOUT_STREET_WITHOUT_NUMBER = "Przykładowa";

/** The ids the gallery's live form uses; the e2e spec reads them. */
export const CHECKOUT_GALLERY_IDS = {
  form: "gallery-checkout-form",
  /** Names no form: the gallery's static submits (the sticky bar's) must post nothing. */
  inert: "gallery-checkout-no-form",
  summary: "gallery-checkout-errors",
  showErrors: "gallery-checkout-show-errors",
  name: "gallery-checkout-name",
  postcode: "gallery-checkout-postcode",
  card: "gallery-checkout-card",
  signAs: "gallery-checkout-sign-as",
} as const;

/** The gallery's own state labels: developer-facing identifiers, like `./catalog.ts`'s. */
export const CHECKOUT_STATES = {
  textField:
    "TextField · default · focus · error · disabled · with hint · with warning",
  select: "SelectField · default · error",
  radio: "RadioChipGroup · chosen · error",
  textArea: "TextAreaWithCounter · blank · typed with preview · over the limit",
  errors: "ErrorSummary · static (no focus on load) · live (takes focus)",
  showErrors: "Show the error state",
  progress: "StepProgress · step 1 · step 2 · step 3",
  panel:
    "OrderSummaryPanel · step 1 · step 2 · step 3 in demo · OrderSummaryMini",
  sticky:
    "StickyTotalBar · step 1 · step 2 · without action (drawn in place, not fixed)",
  banner: "DemoBanner",
  notices: "PriceChangedNotice · InlinePrivacyNotice with SampleDetailsButton",
  place: "PlaceOrderButton · default · pending",
  confirmation: "ConfirmationRecap · demo",
  live: "Live form: on-blur validation and the card counter (islands)",
} as const;
