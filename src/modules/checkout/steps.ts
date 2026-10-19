/**
 * The step actions' contract, without Next (spec 010 §5.2 "Server actions and the route", §2,
 * §8, AC-10, AC-11, AC-13, AC-17; §14 A3.1; TASK-203). `actions.ts` wraps each runner in a
 * `'use server'` function that reads the cookie and turns the outcome into a 303 or a re-render.
 *
 * Every runner does the same five things in the same order:
 *
 *  1. **loads the draft by its token** (`loadDraft`): none or expired → `expired` (the page's "not
 *     started or expired" state); already placed → 303 to the confirmation, writing nothing
 *     (§14 AC-52);
 *  2. **re-runs `currentCheckoutMode()`**: `closed` → `closed`, writing nothing;
 *  3. **parses its schema**: errors re-render the same step with message keys and the posted
 *     values, writing nothing (values are never cleared, §5.3);
 *  4. **verifies the quote** (`verifyDraftQuote`): `ok` keeps it; `reissued` stores the fresh
 *     signature silently; `changed` stores the new price and leaves the buyer's last-seen total,
 *     so the notice opens; `tampered` discards it, stores the fresh one and restarts at step 1. A
 *     change the buyer asked for (a date, a tier, an add-on) is priced afresh and becomes the
 *     total the buyer has seen, unless a price notice is open: that stays open, naming the new
 *     total, until the buyer confirms it (`updateSelection`, intent `confirmPrice`);
 *  5. **saves** (`saveStep`, which also moves the 24-hour window and sets the draft's locale to
 *     the request's, §14 A3.1) and answers 303 to the next step — or to step 1 while a price
 *     notice is open, because that is where the buyer confirms it.
 *
 * Nothing personal goes into a URL: the only query is `?step=`. Logs carry `draft_id`, `step`,
 * `mode` and codes, never a value (§8, §11).
 */
import { z } from "zod";

import { CHECKOUT_STEPS, type CheckoutStep } from "@/config/checkout";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { logger } from "@/lib/logger";
import { type Quote, listAddons, listTiers } from "@/modules/catalog";
import { MoneySchema } from "@/modules/i18n";

import {
  type Draft,
  type DraftConnection,
  type DraftPatch,
  loadDraft,
  saveStep,
} from "./draft";
import { type CheckoutFlagReader, currentCheckoutMode } from "./mode";
import {
  type QuoteCheck,
  deriveQuote,
  priceChange,
  selectionOf,
  verifyDraftQuote,
} from "./pricing";
import { CardAndBuyerStepSchema, RecipientStepSchema } from "./schemas";

/* -------------------------------------------------------------------------- */
/* Outcomes                                                                    */
/* -------------------------------------------------------------------------- */

/** One field's issue: a `checkout.error.*` message key and its arguments. */
export interface FieldIssue {
  readonly key: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

/** What the step re-renders with when a post is refused. */
export type StepState =
  | { readonly status: "idle" }
  | { readonly status: "expired" }
  | { readonly status: "closed" }
  | {
      readonly status: "invalid";
      readonly step: CheckoutStep;
      readonly errors: Readonly<Record<string, readonly FieldIssue[]>>;
      readonly values: Readonly<Record<string, string | readonly string[]>>;
    };

/** What a runner decided. `redirect` is a 303; `render` re-renders the posting step. */
export type StepOutcome =
  | { readonly kind: "redirect"; readonly location: string }
  | { readonly kind: "render"; readonly state: StepState };

/** What a runner is handed. */
export interface StepContext {
  /** The request's locale (the page binds it); the draft's `locale_code` follows it. */
  readonly locale: string;
  /** The `fo_checkout` cookie's value, or `null`. */
  readonly token: string | null;
  readonly now?: () => Date;
  readonly connection?: DraftConnection;
  readonly flags?: CheckoutFlagReader;
}

/** The posted form as plain values: repeated keys become arrays, Next's own keys are dropped. */
export function formValues(
  form: FormData,
  arrayKeys: readonly string[] = [],
): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of new Set(form.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = form
      .getAll(key)
      .filter((v): v is string => typeof v === "string");
    values[key] = arrayKeys.includes(key) ? all : (all[0] ?? "");
  }
  for (const key of arrayKeys) values[key] ??= [];
  return values;
}

/** A step URL: the checkout, plus `?step=` for any step but the first. */
export function stepPath(locale: LocaleCode, step: CheckoutStep): string {
  return step === "recipient"
    ? `/${locale}/checkout`
    : `/${locale}/checkout?step=${step}`;
}

function redirect(location: string): StepOutcome {
  return { kind: "redirect", location };
}

function render(state: StepState): StepOutcome {
  return { kind: "render", state };
}

function issuesOf(error: z.ZodError): Record<string, FieldIssue[]> {
  const errors: Record<string, FieldIssue[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    const params =
      "params" in issue && issue.params !== undefined
        ? (issue.params as Record<string, unknown>)
        : undefined;
    (errors[field] ??= []).push({
      key: issue.message,
      ...(params === undefined ? {} : { params }),
    });
  }
  return errors;
}

/* -------------------------------------------------------------------------- */
/* The shared prelude and the quote                                            */
/* -------------------------------------------------------------------------- */

type Prelude =
  | { readonly done: StepOutcome }
  | {
      readonly draft: Draft;
      readonly locale: LocaleCode;
      readonly now: Date;
    };

/** Steps 1–2 of every runner: the draft by token, then the mode. */
async function prelude(context: StepContext): Promise<Prelude> {
  const locale = context.locale;
  if (!isLocaleCode(locale)) return { done: render({ status: "expired" }) };
  const now = (context.now ?? (() => new Date()))();
  const lookup = await loadDraft(context.token, now, context.connection);
  if (lookup.status !== "active")
    return { done: render({ status: "expired" }) };
  const { draft } = lookup;
  if (draft.orderId !== null) {
    return { done: redirect(`/${locale}/checkout/done`) };
  }
  const mode = await currentCheckoutMode({
    countryIso: draft.countryIso,
    locale,
    ...(draft.buyer === null
      ? {}
      : { buyerCountry: draft.buyer.residenceCountry }),
    ...(context.flags === undefined ? {} : { flags: context.flags }),
  });
  if (mode === "closed") {
    logger.info(
      { draft_id: draft.id, reason: "mode_closed" },
      "checkout.closed",
    );
    return { done: render({ status: "closed" }) };
  }
  return { draft, locale, now };
}

/** The quote half of a save: what to store, and whether the draft restarts at step 1. */
interface PricedPatch {
  readonly patch: DraftPatch;
  readonly restart: boolean;
}

/**
 * Prices the draft after a step's changes (step 4 of every runner). `selectionChanged` is true
 * when the buyer changed what is priced (a date, a tier, an add-on); the fresh price is then the
 * total the buyer will see next, and no notice opens for it.
 */
async function pricedPatch(
  draft: Draft,
  next: Draft,
  now: Date,
  selectionChanged: boolean,
): Promise<PricedPatch> {
  const check: QuoteCheck = await verifyDraftQuote(draft, now);
  if (check.verdict === "tampered") {
    logger.warn({ draft_id: draft.id }, "checkout.quote_tampered");
  }
  let signed: Quote = check.quote;
  let confirmed = draft.confirmed ?? undefined;
  // A notice already open (or opening now) stays open through the buyer's own change: the buyer
  // confirms the price explicitly, and the notice then names the new total (§2 "Money").
  const noticeOpen =
    check.verdict === "changed" ||
    priceChange({ quote: draft.quote, confirmed: draft.confirmed }) !== null;
  if (selectionChanged) {
    signed = await deriveQuote(selectionOf(next, next.locale), now);
    if (!noticeOpen) {
      confirmed = { amountMinor: signed.totalMinor, currency: signed.currency };
    }
  }
  if (check.verdict === "changed" && draft.confirmed !== null) {
    logger.info(
      {
        draft_id: draft.id,
        from_minor: draft.confirmed.amountMinor,
        to_minor: signed.totalMinor,
        currency: signed.currency,
      },
      "checkout.price_changed",
    );
  }
  return {
    patch: {
      ...(check.verdict === "ok" && !selectionChanged ? {} : { quote: signed }),
      ...(confirmed === undefined ? {} : { confirmed }),
    },
    restart: check.verdict === "tampered",
  };
}

/** Saves and decides where the buyer goes next. */
async function saveAndGo(
  context: StepContext,
  draft: Draft,
  locale: LocaleCode,
  now: Date,
  step: CheckoutStep,
  patch: DraftPatch,
  priced: PricedPatch,
  next: CheckoutStep,
  stepsCompleted: number,
): Promise<StepOutcome> {
  const quote = priced.patch.quote ?? draft.quote;
  const confirmed = priced.patch.confirmed ?? draft.confirmed;
  const noticeOpen =
    priceChange({ quote: quote ?? null, confirmed: confirmed ?? null }) !==
    null;
  const saved = await saveStep(
    draft.id,
    {
      ...patch,
      ...priced.patch,
      locale,
      stepsCompleted: priced.restart ? 0 : stepsCompleted,
    },
    now,
    context.connection,
  );
  if (!saved) return render({ status: "expired" });
  logger.info(
    { draft_id: draft.id, step, mode: draft.mode, locale },
    "checkout.step_saved",
  );
  return redirect(
    stepPath(locale, priced.restart || noticeOpen ? "recipient" : next),
  );
}

/* -------------------------------------------------------------------------- */
/* Step 1: saveRecipientStep                                                   */
/* -------------------------------------------------------------------------- */

/** Step 1, "Who are the flowers for?" (§2, AC-8, AC-9, AC-13). */
export async function runRecipientStep(
  context: StepContext,
  form: FormData,
): Promise<StepOutcome> {
  const start = await prelude(context);
  if ("done" in start) return start.done;
  const { draft, locale, now } = start;
  const values = formValues(form);
  const parsed = RecipientStepSchema(draft.countryIso, locale).safeParse(
    values,
  );
  if (!parsed.success) {
    return render({
      status: "invalid",
      step: "recipient",
      errors: issuesOf(parsed.error),
      values,
    });
  }
  const { deliveryDate, ...recipient } = parsed.data;
  const next: Draft = { ...draft, locale, deliveryDate };
  const priced = await pricedPatch(
    draft,
    next,
    now,
    deliveryDate !== draft.deliveryDate,
  );
  return saveAndGo(
    context,
    draft,
    locale,
    now,
    "recipient",
    { deliveryDate, recipient },
    priced,
    "card",
    Math.max(draft.stepsCompleted, 1),
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2: saveCardAndBuyerStep                                                */
/* -------------------------------------------------------------------------- */

/** The add-ons on offer for the destination (AC-11): only those with an active price. */
async function offeredAddonKeys(draft: Draft): Promise<string[]> {
  return (await listAddons(draft.countryIso)).map((addon) => addon.key);
}

/** Step 2, "Your card and your details" (§2, AC-10, AC-11, AC-12). */
export async function runCardAndBuyerStep(
  context: StepContext,
  form: FormData,
): Promise<StepOutcome> {
  const start = await prelude(context);
  if ("done" in start) return start.done;
  const { draft, locale, now } = start;
  if (draft.stepsCompleted < 1) return redirect(stepPath(locale, "recipient"));
  const values = formValues(form, ["addonKeys"]);
  const parsed = CardAndBuyerStepSchema({
    locale,
    offeredAddonKeys: await offeredAddonKeys(draft),
  }).safeParse(values);
  if (!parsed.success) {
    return render({
      status: "invalid",
      step: "card",
      errors: issuesOf(parsed.error),
      values,
    });
  }
  const step = parsed.data;
  const addonKeys = [...step.addonKeys];
  const changed =
    addonKeys.length !== draft.addonKeys.length ||
    addonKeys.some((key, index) => draft.addonKeys[index] !== key);
  const next: Draft = { ...draft, locale, addonKeys };
  const priced = await pricedPatch(draft, next, now, changed);
  return saveAndGo(
    context,
    draft,
    locale,
    now,
    "card",
    {
      addonKeys,
      card: { cardMessage: step.cardMessage, signAs: step.signAs },
      buyer: {
        email: step.email,
        buyerName: step.buyerName,
        buyerPhone: step.buyerPhone,
        residenceCountry: step.residenceCountry,
      },
    },
    priced,
    "review",
    Math.max(draft.stepsCompleted, 2),
  );
}

/* -------------------------------------------------------------------------- */
/* updateSelection                                                             */
/* -------------------------------------------------------------------------- */

const ReturnStepSchema = z.enum(CHECKOUT_STEPS);
const MinorInputSchema = z
  .string()
  .regex(/^\d{1,15}$/u)
  .transform(Number);

/**
 * The summary panel's edits (§2 "An order summary panel … editable inline: changing the tier or an
 * add-on is a submit, recomputed on the server") and the price notice's confirmation (§2 "Money":
 * "asks the buyer to confirm"). `returnStep` is the step the buyer was on.
 */
export const SelectionUpdateSchema = z.discriminatedUnion("intent", [
  z
    .object({
      intent: z.literal("tier"),
      tierKey: z.string().min(1).max(64),
      returnStep: ReturnStepSchema,
    })
    .strict(),
  z
    .object({
      intent: z.literal("addAddon"),
      addonKey: z.string().min(1).max(64),
      returnStep: ReturnStepSchema,
    })
    .strict(),
  z
    .object({
      intent: z.literal("removeAddon"),
      addonKey: z.string().min(1).max(64),
      returnStep: ReturnStepSchema,
    })
    .strict(),
  z
    .object({
      intent: z.literal("date"),
      deliveryDate: z.iso.date(),
      returnStep: ReturnStepSchema,
    })
    .strict(),
  z
    .object({
      intent: z.literal("confirmPrice"),
      seenTotalMinor: MinorInputSchema,
      seenCurrency: MoneySchema.shape.currency,
      returnStep: ReturnStepSchema,
    })
    .strict(),
]);
export type SelectionUpdate = z.infer<typeof SelectionUpdateSchema>;

/** The furthest step the buyer may be sent back to: never past the next incomplete one (§2). */
function reachable(step: CheckoutStep, stepsCompleted: number): CheckoutStep {
  const index = Math.min(CHECKOUT_STEPS.indexOf(step), stepsCompleted);
  return CHECKOUT_STEPS[index] ?? "recipient";
}

/** Tier, add-on, date, or "yes, the new price" (§2, AC-11, AC-17). */
export async function runUpdateSelection(
  context: StepContext,
  form: FormData,
): Promise<StepOutcome> {
  const start = await prelude(context);
  if ("done" in start) return start.done;
  const { draft, locale, now } = start;
  const values = formValues(form);
  const parsed = SelectionUpdateSchema.safeParse(values);
  if (!parsed.success) {
    return render({
      status: "invalid",
      step: "recipient",
      errors: { form: [{ key: "checkout.error.required" }] },
      values,
    });
  }
  const update = parsed.data;
  const back = reachable(update.returnStep, draft.stepsCompleted);
  const invalid = (field: string, key: string): StepOutcome =>
    render({
      status: "invalid",
      step: back,
      errors: { [field]: [{ key }] },
      values,
    });

  if (update.intent === "confirmPrice") {
    const priced = await pricedPatch(draft, draft, now, false);
    const current = priced.patch.quote ?? draft.quote;
    if (
      current === null ||
      priced.restart ||
      current.totalMinor !== update.seenTotalMinor ||
      current.currency !== update.seenCurrency
    ) {
      // The price moved again since the notice was drawn: store what is current and show it.
      return saveAndGo(
        context,
        draft,
        locale,
        now,
        back,
        {},
        priced,
        back,
        draft.stepsCompleted,
      );
    }
    return saveAndGo(
      context,
      draft,
      locale,
      now,
      back,
      {},
      {
        patch: {
          ...priced.patch,
          confirmed: {
            amountMinor: current.totalMinor,
            currency: current.currency,
          },
        },
        restart: false,
      },
      back,
      draft.stepsCompleted,
    );
  }

  let patch: DraftPatch;
  let next: Draft;
  switch (update.intent) {
    case "tier": {
      const tiers = await listTiers(draft.sku);
      if (!tiers.some((tier) => tier.tierKey === update.tierKey)) {
        return invalid("tierKey", "checkout.error.required");
      }
      patch = { tierKey: update.tierKey };
      next = { ...draft, locale, tierKey: update.tierKey };
      break;
    }
    case "addAddon":
    case "removeAddon": {
      const offered = await offeredAddonKeys(draft);
      if (update.intent === "addAddon" && !offered.includes(update.addonKey)) {
        return invalid("addonKeys", "checkout.error.addonUnavailable");
      }
      const addonKeys =
        update.intent === "addAddon"
          ? [
              ...draft.addonKeys.filter((key) => key !== update.addonKey),
              update.addonKey,
            ]
          : draft.addonKeys.filter((key) => key !== update.addonKey);
      patch = { addonKeys };
      next = { ...draft, locale, addonKeys };
      break;
    }
    case "date": {
      patch = { deliveryDate: update.deliveryDate };
      next = { ...draft, locale, deliveryDate: update.deliveryDate };
      break;
    }
  }
  const priced = await pricedPatch(draft, next, now, true);
  return saveAndGo(
    context,
    draft,
    locale,
    now,
    back,
    patch,
    priced,
    back,
    draft.stepsCompleted,
  );
}
