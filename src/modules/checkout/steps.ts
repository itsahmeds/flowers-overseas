/**
 * The step and line actions' contract, without Next (spec 010 §5.2 "Server actions and the
 * route", §2, §8, AC-10, AC-11, AC-13, AC-17; §14 A3.1; §14 A-founder-2026-10-22 items 4, 5 and
 * 7, AC-59 server half, AC-60 server half, AC-61, AC-62, AC-78; TASK-203, TASK-348). `actions.ts`
 * wraps each runner in a `'use server'` function that reads the cookie and turns the outcome into
 * a 303 or a re-render.
 *
 * Every runner does the same things in the same order:
 *
 *  1. **loads the basket by its token** (`loadDraft`): none or expired → `expired` (the page's
 *     "not started or expired" state); already placed → 303 to the confirmation, writing nothing
 *     (§14 AC-52);
 *  2. **finds the line** the form names (`LinePositionSchema`, never trusted beyond the basket's
 *     own lines): a position that is not one of them sends the buyer to the first incomplete
 *     screen, writing nothing;
 *  3. **re-runs `currentCheckoutMode()` for that line's destination**: `closed` → `closed`; a mode
 *     other than the basket's → the basket, where the line shows as unavailable (AC-59);
 *  4. **parses its schema**: errors re-render the same screen with message keys and the posted
 *     values, writing nothing (values are never cleared, §5.3);
 *  5. **verifies the line's quote** in the basket's currency (`verifyLineQuote`): `ok` keeps it;
 *     `reissued` stores the fresh signature silently; `changed` stores the new price and leaves
 *     the buyer's last-seen amount, so the notice opens; `tampered` discards it, stores the fresh
 *     one and restarts the line at step 1. A change the buyer asked for (a date, a tier, an
 *     add-on) is priced afresh and becomes the amount the buyer has seen, unless that line's
 *     notice is open: it stays open, naming the new amount, until `confirmPrice`;
 *  6. **saves the line under a per-line compare-and-set** (`saveLine` with the line as loaded,
 *     TASK-203 hole 17 for every line action), which also moves the 30-day window and sets the
 *     basket's locale to the request's (§14 A3.1), and answers 303 to the next screen, or to the
 *     first line's step 1 whose price notice is open, because that is where the buyer confirms.
 *
 * The screens run step 1 for every line, then step 2 for every line, the buyer's fields on the
 * last line's step 2 only, then step 3 (item 5). Nothing personal goes into a URL: the only query
 * parameters are `step` and `line` (an integer). Logs carry `draft_id`, `position`, `mode` and
 * codes, never a value (§8, AC-78). A redirect carries the basket's line count, so the action
 * refreshes `fo_basket` beside `fo_checkout` (item 7).
 */
import { z } from "zod";

import { CHECKOUT_STEPS, type CheckoutStep } from "@/config/checkout";
import type { CurrencyCode } from "@/config/currencies";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { logger } from "@/lib/logger";
import {
  IntegerMoneySchema,
  type Quote,
  listAddons,
  listTiers,
} from "@/modules/catalog";
import { MoneySchema } from "@/modules/i18n";

import { assessBasket } from "./basket";
import { lineDateStatus } from "./dates";
import {
  type BasketLine,
  type Draft,
  type DraftConnection,
  type DraftPatch,
  type LinePatch,
  LinePatchSchema,
  loadDraft,
  removeLine,
  saveDraft,
  saveLine,
} from "./draft";
import { type CheckoutFlagReader, currentCheckoutMode } from "./mode";
import {
  type QuoteCheck,
  deriveLineQuote,
  linePriceChange,
  selectionOf,
  verifyLineQuote,
} from "./pricing";
import {
  CardAndBuyerStepSchema,
  CardStepSchema,
  LinePositionSchema,
  RecipientStepSchema,
} from "./schemas";

/* -------------------------------------------------------------------------- */
/* Outcomes                                                                    */
/* -------------------------------------------------------------------------- */

/** One field's issue: a `checkout.error.*` message key and its arguments. */
export interface FieldIssue {
  readonly key: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

/** What the screen re-renders with when a post is refused. */
export type StepState =
  | { readonly status: "idle" }
  | { readonly status: "expired" }
  | { readonly status: "closed" }
  | {
      readonly status: "invalid";
      readonly step: CheckoutStep;
      readonly line: number;
      readonly errors: Readonly<Record<string, readonly FieldIssue[]>>;
      readonly values: Readonly<Record<string, string | readonly string[]>>;
    };

/**
 * What a runner decided. `redirect` is a 303, with the basket's line count when the basket is
 * still open (the action writes `fo_basket` from it; `0` deletes it); `render` re-renders the
 * posting screen.
 */
export type StepOutcome =
  | {
      readonly kind: "redirect";
      readonly location: string;
      readonly basketCount?: number;
    }
  | { readonly kind: "render"; readonly state: StepState };

/** What a runner is handed. */
export interface StepContext {
  /** The request's locale (the page binds it); the basket's `locale_code` follows it. */
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

/**
 * A screen's URL: the checkout, plus `?step=` for any step but the first and `&line=` for any
 * line but the first, so a one-line basket's URLs are exactly TASK-203's (AC-58).
 */
export function stepPath(
  locale: LocaleCode,
  step: CheckoutStep,
  line = 1,
): string {
  if (line === 1) {
    return step === "recipient"
      ? `/${locale}/checkout`
      : `/${locale}/checkout?step=${step}`;
  }
  return `/${locale}/checkout?step=${step}&line=${String(line)}`;
}

/** The basket page. Never a query string: notices travel in `pending_notice`. */
export function basketPath(locale: LocaleCode): string {
  return `/${locale}/basket`;
}

/** The first screen not yet saved: step 1 of every line, then step 2 of every line, then 3. */
export function firstIncompleteScreen(draft: {
  readonly lines: readonly Pick<BasketLine, "position" | "stepsCompleted">[];
  readonly buyerSaved: boolean;
}): { readonly step: CheckoutStep; readonly line: number } {
  const recipient = draft.lines.find((line) => line.stepsCompleted < 1);
  if (recipient !== undefined) {
    return { step: "recipient", line: recipient.position };
  }
  const card = draft.lines.find((line) => line.stepsCompleted < 2);
  if (card !== undefined) return { step: "card", line: card.position };
  const last = draft.lines.at(-1);
  if (!draft.buyerSaved && last !== undefined) {
    return { step: "card", line: last.position };
  }
  return { step: "review", line: 1 };
}

function redirect(location: string, basketCount?: number): StepOutcome {
  return basketCount === undefined
    ? { kind: "redirect", location }
    : { kind: "redirect", location, basketCount };
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

/** The form's values without the routing keys the step schemas do not know. */
function withoutKeys(
  values: Record<string, string | string[]>,
  keys: readonly string[],
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!keys.includes(key)) out[key] = value;
  }
  return out;
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

/** Step 1 of every runner: the basket by token. */
async function prelude(context: StepContext): Promise<Prelude> {
  const locale = context.locale;
  if (!isLocaleCode(locale)) return { done: render({ status: "expired" }) };
  const now = (context.now ?? (() => new Date()))();
  const lookup = await loadDraft(context.token, now, context.connection);
  if (lookup.status !== "active") {
    return { done: render({ status: "expired" }) };
  }
  const { draft } = lookup;
  if (draft.purchaseId !== null) {
    return { done: redirect(`/${locale}/checkout/done`, 0) };
  }
  return { draft, locale, now };
}

type LinePrelude =
  | { readonly done: StepOutcome }
  | { readonly line: BasketLine; readonly currency: CurrencyCode };

/** Steps 2 and 3 of every line runner: the posted line, then its destination's mode. */
async function linePrelude(
  context: StepContext,
  draft: Draft,
  locale: LocaleCode,
  posted: unknown,
): Promise<LinePrelude> {
  const position = LinePositionSchema.safeParse(posted);
  const line = position.success
    ? draft.lines.find((candidate) => candidate.position === position.data)
    : undefined;
  if (line === undefined) {
    // An emptied basket has no screen to send the buyer to: its page is the basket's empty state.
    if (draft.lines.length === 0) {
      return { done: redirect(basketPath(locale), 0) };
    }
    const first = firstIncompleteScreen(draft);
    return {
      done: redirect(
        stepPath(locale, first.step, first.line),
        draft.lines.length,
      ),
    };
  }
  const mode = await currentCheckoutMode({
    countryIso: line.countryIso,
    locale,
    ...(draft.buyer === null
      ? {}
      : { buyerCountry: draft.buyer.residenceCountry }),
    ...(context.flags === undefined ? {} : { flags: context.flags }),
  });
  if (mode === "closed") {
    logger.info(
      { draft_id: draft.id, position: line.position, code: "mode_closed" },
      "checkout.closed",
    );
    return { done: render({ status: "closed" }) };
  }
  const currency = (draft.currency ??
    line.quote?.currency ??
    null) as CurrencyCode | null;
  if (mode !== draft.mode || currency === null) {
    // Marked unavailable on the basket (AC-59); nothing is written here.
    return { done: redirect(basketPath(locale), draft.lines.length) };
  }
  return { line, currency };
}

/** The quote half of a line save: what to store, and whether the line restarts at step 1. */
interface PricedPatch {
  readonly patch: LinePatch;
  readonly restart: boolean;
}

/**
 * Prices a line after its changes (step 5 of every runner). `selectionChanged` is true when the
 * buyer changed what is priced (a date, a tier, an add-on); the fresh price is then the amount
 * the buyer will see next, and no notice opens for it unless one is already open on the line.
 * `null` when the line can no longer be priced in the basket's currency (it is then unavailable
 * on the basket, AC-59).
 */
async function pricedPatch(
  line: BasketLine,
  next: BasketLine,
  currency: CurrencyCode,
  locale: LocaleCode,
  now: Date,
  selectionChanged: boolean,
  draftId: string,
): Promise<PricedPatch | null> {
  let check: QuoteCheck;
  let signed: Quote;
  try {
    check = await verifyLineQuote(line, currency, locale, now);
    signed = check.quote;
    if (selectionChanged) {
      signed = await deriveLineQuote(selectionOf(next), currency, locale, now);
    }
  } catch {
    return null;
  }
  if (check.verdict === "tampered") {
    logger.warn(
      { draft_id: draftId, position: line.position, code: "quote_tampered" },
      "checkout.quote_tampered",
    );
  }
  // A notice already open (or opening now) stays open through the buyer's own change: the buyer
  // confirms the price explicitly, and the notice then names the new amount (§2 "Money").
  const noticeOpen =
    check.verdict === "changed" ||
    linePriceChange({ quote: line.quote, lastSeen: line.lastSeen }) !== null;
  const lastSeen =
    selectionChanged && !noticeOpen
      ? { amountMinor: signed.totalMinor, currency: signed.currency }
      : undefined;
  if (check.verdict === "changed") {
    logger.info(
      { draft_id: draftId, position: line.position, code: "price_changed" },
      "checkout.price_changed",
    );
  }
  return {
    patch: {
      ...(check.verdict === "ok" && !selectionChanged ? {} : { quote: signed }),
      ...(lastSeen === undefined ? {} : { lastSeen }),
    },
    restart: check.verdict === "tampered",
  };
}

/** The steps a line has saved, as the draft reads them. */
const LineStepsSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

/** The line as it will be after `patch`, for deciding the next screen. */
function applied(line: BasketLine, raw: LinePatch): BasketLine {
  const patch = LinePatchSchema.parse(raw);
  return {
    ...line,
    ...(patch.stepsCompleted === undefined
      ? {}
      : { stepsCompleted: LineStepsSchema.parse(patch.stepsCompleted) }),
    ...(patch.quote === undefined ? {} : { quote: patch.quote }),
    ...(patch.lastSeen === undefined
      ? {}
      : { lastSeen: IntegerMoneySchema.parse(patch.lastSeen) }),
  };
}

/** Saves one line and decides where the buyer goes next. */
async function saveLineAndGo(
  context: StepContext,
  draft: Draft,
  locale: LocaleCode,
  now: Date,
  line: BasketLine,
  here: { readonly step: CheckoutStep; readonly returnTo?: "basket" },
  patch: LinePatch,
  priced: PricedPatch,
  stepsCompleted: number,
  draftPatch: DraftPatch = {},
): Promise<StepOutcome> {
  const full: LinePatch = {
    ...patch,
    ...priced.patch,
    stepsCompleted: priced.restart ? 0 : stepsCompleted,
  };
  const saved = await saveLine(
    draft.id,
    line.position,
    full,
    now,
    context.connection,
    line,
    { ...draftPatch, locale },
  );
  const count = draft.lines.length;
  // Gone, placed, or this line changed by another request since it was loaded: write nothing and
  // reload the screen, which shows the basket as it now is.
  if (!saved) {
    return redirect(
      here.returnTo === "basket"
        ? basketPath(locale)
        : stepPath(locale, here.step, line.position),
      count,
    );
  }
  logger.info(
    {
      draft_id: draft.id,
      position: line.position,
      step: here.step,
      mode: draft.mode,
    },
    "checkout.step_saved",
  );
  if (here.returnTo === "basket") return redirect(basketPath(locale), count);
  const after = draft.lines.map((candidate) =>
    candidate.position === line.position ? applied(candidate, full) : candidate,
  );
  // The first line whose notice is open is where the buyer confirms (§2 "Money").
  const noticeLine = after.find(
    (candidate) =>
      linePriceChange({
        quote: candidate.quote,
        lastSeen: candidate.lastSeen,
      }) !== null,
  );
  if (priced.restart || noticeLine !== undefined) {
    return redirect(
      stepPath(locale, "recipient", (noticeLine ?? line).position),
      count,
    );
  }
  const next = firstIncompleteScreen({
    lines: after,
    buyerSaved: draftPatch.buyerSaved ?? draft.buyerSaved,
  });
  return redirect(stepPath(locale, next.step, next.line), count);
}

/* -------------------------------------------------------------------------- */
/* Step 1: saveRecipientStep                                                   */
/* -------------------------------------------------------------------------- */

/** Step 1 of one line, "Who are the flowers for?" (§2, AC-8, AC-9, AC-13; item 5). */
export async function runRecipientStep(
  context: StepContext,
  form: FormData,
): Promise<StepOutcome> {
  const start = await prelude(context);
  if ("done" in start) return start.done;
  const { draft, locale, now } = start;
  const values = formValues(form);
  const found = await linePrelude(context, draft, locale, values["line"]);
  if ("done" in found) return found.done;
  const { line, currency } = found;
  const parsed = RecipientStepSchema(line.countryIso, locale).safeParse(
    withoutKeys(values, ["line"]),
  );
  if (!parsed.success) {
    return render({
      status: "invalid",
      step: "recipient",
      line: line.position,
      errors: issuesOf(parsed.error),
      values,
    });
  }
  const { deliveryDate, ...recipient } = parsed.data;
  const next: BasketLine = { ...line, deliveryDate };
  const priced = await pricedPatch(
    line,
    next,
    currency,
    locale,
    now,
    deliveryDate !== line.deliveryDate,
    draft.id,
  );
  if (priced === null) {
    return redirect(basketPath(locale), draft.lines.length);
  }
  return saveLineAndGo(
    context,
    draft,
    locale,
    now,
    line,
    { step: "recipient" },
    { deliveryDate, recipient },
    priced,
    Math.max(line.stepsCompleted, 1),
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2: saveCardAndBuyerStep                                                */
/* -------------------------------------------------------------------------- */

/** The add-ons on offer for the line's destination (AC-11): only those with an active price. */
async function offeredAddonKeys(line: BasketLine): Promise<string[]> {
  return (await listAddons(line.countryIso)).map((addon) => addon.key);
}

function sameKeys(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((key, index) => right[index] === key)
  );
}

/**
 * Step 2 of one line, "Your card and your details" (§2, AC-10, AC-11, AC-12; item 5): the card
 * and the line's add-ons, and on the **last** line's screen the buyer's fields too.
 */
export async function runCardAndBuyerStep(
  context: StepContext,
  form: FormData,
): Promise<StepOutcome> {
  const start = await prelude(context);
  if ("done" in start) return start.done;
  const { draft, locale, now } = start;
  const values = formValues(form, ["addonKeys"]);
  const found = await linePrelude(context, draft, locale, values["line"]);
  if ("done" in found) return found.done;
  const { line, currency } = found;
  if (line.stepsCompleted < 1) {
    return redirect(
      stepPath(locale, "recipient", line.position),
      draft.lines.length,
    );
  }
  const isLast = line.position === draft.lines.length;
  const schemaContext = {
    locale,
    offeredAddonKeys: await offeredAddonKeys(line),
  };
  const posted = withoutKeys(values, ["line"]);
  let step: {
    readonly cardMessage: string;
    readonly signAs: string;
    readonly addonKeys: readonly string[];
  };
  let draftPatch: DraftPatch = {};
  if (isLast) {
    const parsed = CardAndBuyerStepSchema(schemaContext).safeParse(posted);
    if (!parsed.success) {
      return render({
        status: "invalid",
        step: "card",
        line: line.position,
        errors: issuesOf(parsed.error),
        values,
      });
    }
    step = parsed.data;
    draftPatch = {
      buyer: {
        email: parsed.data.email,
        buyerName: parsed.data.buyerName,
        buyerPhone: parsed.data.buyerPhone,
        residenceCountry: parsed.data.residenceCountry,
      },
      buyerSaved: true,
    };
  } else {
    const parsed = CardStepSchema(schemaContext).safeParse(posted);
    if (!parsed.success) {
      return render({
        status: "invalid",
        step: "card",
        line: line.position,
        errors: issuesOf(parsed.error),
        values,
      });
    }
    step = parsed.data;
  }
  const addonKeys = [...step.addonKeys];
  const next: BasketLine = { ...line, addonKeys };
  const priced = await pricedPatch(
    line,
    next,
    currency,
    locale,
    now,
    !sameKeys(addonKeys, line.addonKeys),
    draft.id,
  );
  if (priced === null) {
    return redirect(basketPath(locale), draft.lines.length);
  }
  return saveLineAndGo(
    context,
    draft,
    locale,
    now,
    line,
    { step: "card" },
    {
      addonKeys,
      card: { cardMessage: step.cardMessage, signAs: step.signAs },
    },
    priced,
    2,
    draftPatch,
  );
}

/* -------------------------------------------------------------------------- */
/* updateSelection, updateLine, useNextDate                                    */
/* -------------------------------------------------------------------------- */

const ReturnStepSchema = z.enum(CHECKOUT_STEPS);
const MinorInputSchema = z
  .string()
  .regex(/^\d{1,15}$/u)
  .transform(Number);

/**
 * The summary panel's edits of one line (§2 "An order summary panel … editable inline: changing
 * the tier or an add-on is a submit, recomputed on the server") and the price notice's
 * confirmation for the whole basket (§2 "Money": "asks the buyer to confirm"; AC-61).
 * `returnStep` is the step the buyer was on; `line` (posted beside it) names the line edited.
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

/** The furthest screen the buyer may be sent back to: never past the first incomplete one (§2). */
function reachable(
  draft: Draft,
  step: CheckoutStep,
  line: number,
): { readonly step: CheckoutStep; readonly line: number } {
  const first = firstIncompleteScreen(draft);
  const order = (screen: { step: CheckoutStep; line: number }): number =>
    CHECKOUT_STEPS.indexOf(screen.step) * 100 + screen.line;
  return order({ step, line }) <= order(first) ? { step, line } : first;
}

/**
 * "Yes, the new price" for the whole basket (AC-61): when the total the buyer saw on the notice
 * is the basket's current total, every available line's last-seen amount becomes its current
 * quote (stored), and the basket's confirmed total becomes that total. When the price moved again
 * since the notice was drawn, the current quotes are stored and the notice shows them.
 */
async function confirmPrice(
  context: StepContext,
  draft: Draft,
  locale: LocaleCode,
  now: Date,
  seen: { readonly amountMinor: number; readonly currency: string },
  back: { readonly step: CheckoutStep; readonly line: number },
): Promise<StepOutcome> {
  const assessed = await assessBasket(draft, {
    locale,
    now,
    ...(context.flags === undefined ? {} : { flags: context.flags }),
  });
  const total = assessed.total;
  const agreed =
    total !== null &&
    total.amountMinor === seen.amountMinor &&
    total.currency === seen.currency;
  let restartAt: number | null = null;
  for (const entry of assessed.lines) {
    if (entry.check === null || entry.availability.status === "unavailable") {
      continue;
    }
    const store = entry.check.verdict !== "ok";
    const restart = entry.check.verdict === "tampered";
    const confirm = agreed && entry.notice !== null && !restart;
    if (!store && !confirm) continue;
    const saved = await saveLine(
      draft.id,
      entry.line.position,
      {
        ...(store ? { quote: entry.check.quote } : {}),
        ...(restart ? { stepsCompleted: 0 } : {}),
        ...(confirm
          ? {
              lastSeen: {
                amountMinor: entry.check.quote.totalMinor,
                currency: entry.check.quote.currency,
              },
            }
          : {}),
      },
      now,
      context.connection,
      entry.line,
      { locale },
    );
    if (!saved) {
      return redirect(
        stepPath(locale, back.step, back.line),
        draft.lines.length,
      );
    }
    // A tampered quote restarts its line at step 1 (AC-17), and nothing is confirmed over it.
    if (restart) restartAt ??= entry.line.position;
  }
  if (restartAt !== null) {
    logger.warn(
      { draft_id: draft.id, position: restartAt, code: "quote_tampered" },
      "checkout.quote_tampered",
    );
    return redirect(
      stepPath(locale, "recipient", restartAt),
      draft.lines.length,
    );
  }
  if (!agreed) {
    // The price moved again since the notice was drawn (or the buyer posted another amount): the
    // notice stays open, on the first line that has one, where the buyer confirms (§2 "Money").
    const open = assessed.lines.find(
      (entry) =>
        entry.notice !== null && entry.availability.status !== "unavailable",
    );
    return redirect(
      open === undefined
        ? stepPath(locale, back.step, back.line)
        : stepPath(locale, "recipient", open.line.position),
      draft.lines.length,
    );
  }
  await saveDraft(draft.id, { confirmed: total }, now, context.connection);
  logger.info(
    { draft_id: draft.id, mode: draft.mode, code: "price_confirmed" },
    "checkout.price_confirmed",
  );
  return redirect(stepPath(locale, back.step, back.line), draft.lines.length);
}

/** Tier, add-on, date of one line, or "yes, the new price" for the basket (§2, AC-11, AC-17). */
export async function runUpdateSelection(
  context: StepContext,
  form: FormData,
): Promise<StepOutcome> {
  const start = await prelude(context);
  if ("done" in start) return start.done;
  const { draft, locale, now } = start;
  const values = formValues(form);
  const parsed = SelectionUpdateSchema.safeParse(withoutKeys(values, ["line"]));
  const position = LinePositionSchema.safeParse(values["line"]);
  if (!parsed.success) {
    return render({
      status: "invalid",
      step: "recipient",
      line: position.success ? position.data : 1,
      errors: { form: [{ key: "checkout.error.required" }] },
      values,
    });
  }
  const update = parsed.data;
  const back = reachable(
    draft,
    update.returnStep,
    position.success ? position.data : 1,
  );

  if (update.intent === "confirmPrice") {
    return confirmPrice(
      context,
      draft,
      locale,
      now,
      { amountMinor: update.seenTotalMinor, currency: update.seenCurrency },
      back,
    );
  }

  const found = await linePrelude(context, draft, locale, values["line"]);
  if ("done" in found) return found.done;
  const { line, currency } = found;
  const invalid = (field: string, key: string): StepOutcome =>
    render({
      status: "invalid",
      step: back.step,
      line: line.position,
      errors: { [field]: [{ key }] },
      values,
    });

  let patch: LinePatch;
  let next: BasketLine;
  switch (update.intent) {
    case "tier": {
      const tiers = await listTiers(line.sku);
      if (!tiers.some((tier) => tier.tierKey === update.tierKey)) {
        return invalid("tierKey", "checkout.error.required");
      }
      patch = { tierKey: update.tierKey };
      next = { ...line, tierKey: update.tierKey };
      break;
    }
    case "addAddon":
    case "removeAddon": {
      const offered = await offeredAddonKeys(line);
      if (update.intent === "addAddon" && !offered.includes(update.addonKey)) {
        return invalid("addonKeys", "checkout.error.addonUnavailable");
      }
      const addonKeys =
        update.intent === "addAddon"
          ? [
              ...line.addonKeys.filter((key) => key !== update.addonKey),
              update.addonKey,
            ]
          : line.addonKeys.filter((key) => key !== update.addonKey);
      patch = { addonKeys };
      next = { ...line, addonKeys };
      break;
    }
    case "date": {
      patch = { deliveryDate: update.deliveryDate };
      next = { ...line, deliveryDate: update.deliveryDate };
      break;
    }
  }
  const priced = await pricedPatch(
    line,
    next,
    currency,
    locale,
    now,
    true,
    draft.id,
  );
  if (priced === null) {
    return redirect(basketPath(locale), draft.lines.length);
  }
  return saveLineAndGo(
    context,
    draft,
    locale,
    now,
    line,
    { step: back.step },
    patch,
    priced,
    line.stepsCompleted,
  );
}

/** Where a basket-page action returns: the basket, or the line's own screen. */
const ReturnToSchema = z.enum(["basket", "checkout"]).default("basket");

/** `updateLine` (item 4): a line's size and its whole add-on set, from the basket page. */
export const UpdateLineSchema = z
  .object({
    tierKey: z.string().min(1).max(64),
    addonKeys: z.array(z.string().min(1).max(64)),
    returnTo: ReturnToSchema,
  })
  .strict();

/** The basket page's edit of one line's tier and add-ons (item 4). */
export async function runUpdateLine(
  context: StepContext,
  form: FormData,
): Promise<StepOutcome> {
  const start = await prelude(context);
  if ("done" in start) return start.done;
  const { draft, locale, now } = start;
  const values = formValues(form, ["addonKeys"]);
  const found = await linePrelude(context, draft, locale, values["line"]);
  if ("done" in found) return found.done;
  const { line, currency } = found;
  const parsed = UpdateLineSchema.safeParse(withoutKeys(values, ["line"]));
  const tiers = parsed.success ? await listTiers(line.sku) : [];
  const offered = parsed.success ? await offeredAddonKeys(line) : [];
  if (
    !parsed.success ||
    !tiers.some((tier) => tier.tierKey === parsed.data.tierKey) ||
    parsed.data.addonKeys.some((key) => !offered.includes(key)) ||
    new Set(parsed.data.addonKeys).size !== parsed.data.addonKeys.length
  ) {
    return render({
      status: "invalid",
      step: "recipient",
      line: line.position,
      errors: { form: [{ key: "checkout.error.addonUnavailable" }] },
      values,
    });
  }
  const { tierKey, addonKeys, returnTo } = parsed.data;
  const next: BasketLine = { ...line, tierKey, addonKeys };
  const changed =
    tierKey !== line.tierKey || !sameKeys(addonKeys, line.addonKeys);
  const priced = await pricedPatch(
    line,
    next,
    currency,
    locale,
    now,
    changed,
    draft.id,
  );
  if (priced === null) {
    return redirect(basketPath(locale), draft.lines.length);
  }
  return saveLineAndGo(
    context,
    draft,
    locale,
    now,
    line,
    returnTo === "basket"
      ? { step: "recipient", returnTo: "basket" }
      : { step: "recipient" },
    { tierKey, addonKeys },
    priced,
    line.stepsCompleted,
  );
}

/** `useNextDate` (D8, AC-60): the date the "Use {next}" submit showed, for that one line. */
export const UseNextDateSchema = z
  .object({
    deliveryDate: z.iso.date(),
    returnTo: ReturnToSchema,
  })
  .strict();

/**
 * "Use {next}" (AC-60): sets the posted date on exactly the posted line, when that date is a
 * selectable chip of the line's checkout calendar **now**; otherwise nothing is written and the
 * screen re-renders with the date that is next now. The line is priced for the new date.
 */
export async function runUseNextDate(
  context: StepContext,
  form: FormData,
): Promise<StepOutcome> {
  const start = await prelude(context);
  if ("done" in start) return start.done;
  const { draft, locale, now } = start;
  const values = formValues(form);
  const found = await linePrelude(context, draft, locale, values["line"]);
  if ("done" in found) return found.done;
  const { line, currency } = found;
  const parsed = UseNextDateSchema.safeParse(withoutKeys(values, ["line"]));
  const back =
    parsed.success && parsed.data.returnTo === "checkout"
      ? stepPath(locale, "recipient", line.position)
      : basketPath(locale);
  if (
    !parsed.success ||
    lineDateStatus(line.countryIso, parsed.data.deliveryDate, now).status !==
      "ok"
  ) {
    return redirect(back, draft.lines.length);
  }
  const deliveryDate = parsed.data.deliveryDate;
  const next: BasketLine = { ...line, deliveryDate };
  const priced = await pricedPatch(
    line,
    next,
    currency,
    locale,
    now,
    true,
    draft.id,
  );
  if (priced === null) {
    return redirect(basketPath(locale), draft.lines.length);
  }
  return saveLineAndGo(
    context,
    draft,
    locale,
    now,
    line,
    parsed.data.returnTo === "basket"
      ? { step: "recipient", returnTo: "basket" }
      : { step: "recipient" },
    { deliveryDate },
    priced,
    line.stepsCompleted,
  );
}

/* -------------------------------------------------------------------------- */
/* removeLine                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Remove (D8, item 6, AC-57's server half): deletes exactly the posted line, if it is still the
 * line the basket showed, renumbers the rest, and answers 303 to the basket with the new count
 * (`fo_basket` is deleted at zero, item 7).
 */
export async function runRemoveLine(
  context: StepContext,
  form: FormData,
): Promise<StepOutcome> {
  const start = await prelude(context);
  if ("done" in start) return start.done;
  const { draft, locale, now } = start;
  const values = formValues(form);
  const position = LinePositionSchema.safeParse(values["line"]);
  const line = position.success
    ? draft.lines.find((candidate) => candidate.position === position.data)
    : undefined;
  if (line === undefined) {
    return redirect(basketPath(locale), draft.lines.length);
  }
  const left = await removeLine(
    draft.id,
    line.position,
    now,
    context.connection,
    line,
  );
  if (left === null) return redirect(basketPath(locale), draft.lines.length);
  logger.info(
    { draft_id: draft.id, position: line.position, mode: draft.mode },
    "checkout.basket_line_removed",
  );
  return redirect(basketPath(locale), left);
}
