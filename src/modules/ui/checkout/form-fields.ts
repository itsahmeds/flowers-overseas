/**
 * The routing fields every checkout form posts beside its own (spec 010 §5.2; TASK-204). The
 * page's one server action reads them to know what was posted and which screen to draw again,
 * then strips them before the step's own `.strict()` schema sees the form. None is personal and
 * none reaches a URL.
 */
export const CHECKOUT_FORM_FIELDS = {
  /** What the form does: `recipient`, `card`, `selection`, `useNextDate` or `place`. */
  intent: "_do",
  locale: "_locale",
  step: "_step",
  line: "_line",
} as const;

export const CHECKOUT_FORM_INTENTS = [
  "recipient",
  "card",
  "selection",
  "useNextDate",
  "place",
] as const;
export type CheckoutFormIntent = (typeof CHECKOUT_FORM_INTENTS)[number];

/** The step forms' and the side forms' ids (the sticky bar's submit names its form). */
export const CHECKOUT_FORM_IDS = {
  step: "co-step",
  addons: "co-addons",
  price: "co-price",
  nextDate: "co-next-date",
  place: "co-place",
} as const;

/** The page's one action: it answers every post with a 303, so it returns nothing. */
export type CheckoutAction = (form: FormData) => Promise<void>;
