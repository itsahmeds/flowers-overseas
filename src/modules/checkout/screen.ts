/**
 * What `/{locale}/checkout` shows for a request (spec 010 §2 "The checkout", §5.3, AC-7, AC-8,
 * AC-13, AC-19 render half, AC-30; §14 A-founder-2026-10-22 items 5 and 6, AC-58, AC-59 and AC-60
 * render halves; §14 A-founder-2026-10-25a item 1, the four steps, AC-105; TASK-204, TASK-418).
 *
 * `checkoutScreen()` reads the basket by its cookie, re-derives every line at `now`
 * (`assessBasket`) and decides the one screen to draw: the "not started or expired" state, the
 * `closed` state, the confirmation (a placed basket answers it), an empty basket, or one step of
 * one line. `?step=` and `&line=` only **select** a screen already reachable; anything later, or
 * malformed, draws the first incomplete screen instead (AC-7, AC-34, AC-58). The model is plain
 * data: amounts as integer `Money`, dates as ISO strings, message keys, never a formatted string,
 * so the page formats every value with `formatMoney`/`formatDate` in its own locale (AC-32).
 *
 * Read-only: nothing here writes (a `GET` of the page never changes the basket, except that
 * `loadDraft` deletes a draft it finds expired).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { CHECKOUT_STEPS, type CheckoutStep } from "@/config/checkout";
import { type CountryIso2 } from "@/config/countries";
import type { CurrencyCode } from "@/config/currencies";
import { type LocaleCode } from "@/config/locales";
import {
  type IntegerMoney,
  IntegerMoneySchema,
  type Tier,
  addonPriceProjection,
  getProduct,
  listAddons,
  listTiers,
  productAlternatePaths,
} from "@/modules/catalog";
import { checkoutDeliveryWindow } from "@/modules/geo";

import { type AddressFormModel, addressFormModel } from "./address";
import {
  type AssessedLine,
  type BasketAssessment,
  assessBasket,
} from "./basket";
import {
  type BasketLine,
  type Draft,
  type DraftBuyer,
  type DraftConnection,
  type DraftMode,
  loadDraft,
  withDraftConnection,
} from "./draft";
import {
  type AppliedDiscount,
  type DiscountFlagReader,
  type DiscountRefusal,
  discountCodesOn,
  discountFlagOf,
  discountLockMinutes,
  draftDiscountOf,
} from "./discount";
import { type CheckoutFlagReader, currentCheckoutMode } from "./mode";
import { type ReminderGate, basketReminderOffered } from "./reminders/offer";
import {
  type DraftTotals,
  deriveLineQuote,
  lineTotals,
  selectionOf,
} from "./pricing";
import { firstIncompleteScreen } from "./steps";

/** One line as every screen lists it (the summary panel, the review, the basket notice). */
export interface ScreenLine {
  readonly position: number;
  readonly sku: string;
  readonly productName: string;
  readonly tier: Pick<Tier, "labelKey" | "stems"> | null;
  readonly countryIso: CountryIso2;
  readonly deliveryDate: string | null;
  readonly addonKeys: readonly string[];
  /** The amount charged for it now, or `null` when it is unavailable. */
  readonly amount: IntegerMoney | null;
  readonly availability: AssessedLine["availability"];
  readonly totals: DraftTotals | null;
  readonly recipient: BasketLine["recipient"];
  readonly card: BasketLine["card"];
  readonly stepsCompleted: BasketLine["stepsCompleted"];
}

/** One chip of the step 1 calendar (AC-19 render half). */
export interface CalendarDay {
  readonly date: string;
  readonly selectable: boolean;
  /** The line's price on that day minus its price with no date, when positive. */
  readonly surcharge: IntegerMoney | null;
  readonly reasonKey: string | null;
  readonly occasionKeys: readonly string[];
}

/**
 * An add-on step 2 offers for the line's destination (AC-11): only priced ones, and never the
 * printed card, which every bouquet already carries (the card field above it, "Printed on our card
 * · included"). The line under the name is the allergen sentence for food, else the description.
 */
export interface OfferedAddon {
  readonly key: string;
  readonly nameKey: string;
  readonly descriptionKey: string;
  readonly allergenNoteRequired: boolean;
  readonly price: IntegerMoney;
}

export interface StepScreen {
  readonly kind: "step";
  readonly step: CheckoutStep;
  /** The line this screen is for (its position). Steps 3 and 4 are for the whole basket (`1`). */
  readonly line: number;
  readonly mode: DraftMode;
  readonly locale: LocaleCode;
  readonly lines: readonly ScreenLine[];
  readonly total: IntegerMoney | null;
  /** The basket's price-changed notice: what the buyer last saw, and the total now. */
  readonly notice: BasketAssessment["notice"];
  readonly buyer: DraftBuyer | null;
  /** The furthest screen reachable; the progress links only to steps before it. */
  readonly reachable: { readonly step: CheckoutStep; readonly line: number };
  readonly reviewReachable: boolean;
  /** Step 1: the line's address form and its calendar. */
  readonly address: AddressFormModel | null;
  readonly calendar: readonly CalendarDay[];
  /** Step 2: the add-ons on offer for the line. The buyer's fields are step 3's alone. */
  readonly addons: readonly OfferedAddon[];
  /** Where "Back to {product}" goes for the current line, when a product page exists. */
  readonly productPath: string | null;
  /**
   * Spec 047 (TASK-447): the code applied to the basket. When set, `total` is the discounted
   * total (what is charged) and `discount.subtotal` the sum of the lines.
   */
  readonly discount: AppliedDiscount | null;
  /** The applied code stopped applying since it was applied (ended, used up): why. */
  readonly discountLost: {
    readonly code: string | null;
    readonly refusal: DiscountRefusal;
  } | null;
  /**
   * Step 4's code control: `null` when `checkout.discount_codes` is off for the basket (or on any
   * other step); else whether the field is locked and for how many minutes.
   */
  readonly discountControl: { readonly lockedMinutes: number | null } | null;
  /**
   * Spec 034 (AC-7): step 3's basket-reminder box, `null` or absent when not offered (flag off, a
   * key unreviewed in the locale, env missing). `checked` is the draft's own consent; a refused
   * post's echo decides instead on its re-render.
   */
  readonly basketReminder?: { readonly checked: boolean } | null;
}

export type CheckoutScreen =
  | { readonly kind: "expired" }
  | { readonly kind: "placed" }
  /**
   * Spec 013 §5.2 (TASK-262): a `test` or `live` basket placed but not paid (a decline, a
   * refresh, a failed 3DS): step 3 again, rebuilt from the purchase's orders.
   */
  | { readonly kind: "unpaid"; readonly mode: "test" | "live" }
  | { readonly kind: "empty" }
  | {
      readonly kind: "closed";
      readonly countryIso: CountryIso2 | null;
      readonly productPath: string | null;
    }
  | StepScreen;

export interface ScreenRequest {
  readonly locale: LocaleCode;
  readonly token: string | null;
  /** `?step=` and `?line=` as they arrived; never trusted. */
  readonly step?: string | undefined;
  readonly line?: string | undefined;
  readonly now?: () => Date;
  readonly connection?: DraftConnection;
  readonly flags?: CheckoutFlagReader;
  readonly discountFlag?: DiscountFlagReader;
  /** Spec 034: the box's flag and review gate (injected by the suites). */
  readonly reminderGate?: ReminderGate;
}

const LINE_PARAM = /^[1-9][0-9]?$/u;

function order(screen: { step: CheckoutStep; line: number }): number {
  return CHECKOUT_STEPS.indexOf(screen.step) * 100 + screen.line;
}

/**
 * The furthest screen a buyer may stand on: the first incomplete one, except that step 4 is not
 * reachable while a line is unavailable or unpriced, so step 3 "Your details" is then the
 * furthest (§14 A-founder-2026-10-25a item 1).
 */
function furthestScreen(
  draft: Pick<Draft, "lines" | "buyerSaved">,
  reviewReachable: boolean,
): { readonly step: CheckoutStep; readonly line: number } {
  const first = firstIncompleteScreen(draft);
  return first.step === "review" && !reviewReachable
    ? { step: "details", line: 1 }
    : first;
}

/**
 * The screen the URL asks for, if it is reachable; else the first incomplete one (AC-7, AC-105):
 * `?step=review` with a line's step 1 incomplete draws that step 1, and `?step=details` with a
 * line's step 2 incomplete draws that step 2.
 */
export function selectScreen(
  draft: Pick<Draft, "lines" | "buyerSaved">,
  reviewReachable: boolean,
  step: string | undefined,
  line: string | undefined,
): { readonly step: CheckoutStep; readonly line: number } {
  const furthest = furthestScreen(draft, reviewReachable);
  const wanted = (CHECKOUT_STEPS as readonly string[]).includes(step ?? "")
    ? (step as CheckoutStep)
    : step === undefined
      ? null
      : "invalid";
  if (wanted === "invalid") return furthest;
  const wantedLine =
    line === undefined ? 1 : LINE_PARAM.test(line) ? Number(line) : Number.NaN;
  if (
    Number.isNaN(wantedLine) ||
    !draft.lines.some((candidate) => candidate.position === wantedLine)
  ) {
    return furthest;
  }
  if (wanted === null) {
    // `/checkout` with no step: the first incomplete screen, so a returning buyer resumes.
    return furthest;
  }
  // Steps 3 and 4 are once per order: they have no line of their own.
  const perOrder = wanted === "details" || wanted === "review";
  const target = { step: wanted, line: perOrder ? 1 : wantedLine };
  return order(target) <= order(furthest) ? target : furthest;
}

async function productPathOf(
  locale: LocaleCode,
  sku: string,
  countryIso: CountryIso2,
): Promise<string | null> {
  const paths = await productAlternatePaths({ sku, countryIso }).catch(
    () => ({}) as Readonly<Record<string, string>>,
  );
  return paths[locale] ?? null;
}

/** The step 1 calendar for a line, with each day's surcharge in the basket's currency. */
async function calendarFor(
  line: BasketLine,
  currency: CurrencyCode | null,
  locale: LocaleCode,
  now: Date,
): Promise<CalendarDay[]> {
  const window = checkoutDeliveryWindow({
    countryIso: line.countryIso,
    from: now,
  });
  let base: number | null = null;
  const selection = { ...selectionOf(line), addonKeys: [] as string[] };
  if (currency !== null) {
    base = await deriveLineQuote(
      { ...selection, deliveryDate: null },
      currency,
      locale,
      now,
    )
      .then((quote) => quote.totalMinor)
      .catch(() => null);
  }
  const days: CalendarDay[] = [];
  for (const day of window.dates) {
    let surcharge: IntegerMoney | null = null;
    if (
      day.selectable &&
      base !== null &&
      currency !== null &&
      day.surcharge !== undefined
    ) {
      const priced = await deriveLineQuote(
        { ...selection, deliveryDate: day.date },
        currency,
        locale,
        now,
      ).catch(() => null);
      if (priced !== null && priced.totalMinor > base) {
        surcharge = IntegerMoneySchema.parse({
          amountMinor: priced.totalMinor - base,
          currency: priced.currency,
        });
      }
    }
    days.push({
      date: day.date,
      selectable: day.selectable,
      surcharge,
      reasonKey: day.reasonKey ?? null,
      occasionKeys: day.occasionKeys,
    });
  }
  return days;
}

async function offeredAddons(
  line: BasketLine,
  currency: CurrencyCode | null,
  locale: LocaleCode,
  now: Date,
): Promise<OfferedAddon[]> {
  const offered: OfferedAddon[] = [];
  for (const addon of await listAddons(line.countryIso)) {
    // The printed card is included with every bouquet; it is never an add-on to choose.
    if (addon.kind === "stationery") continue;
    let price: IntegerMoney | null = null;
    if (currency !== null) {
      // The add-on's own price in the basket's currency: the quote with it minus without it.
      const withIt = await deriveLineQuote(
        { ...selectionOf(line), addonKeys: [addon.key] },
        currency,
        locale,
        now,
      ).catch(() => null);
      const without = await deriveLineQuote(
        { ...selectionOf(line), addonKeys: [] },
        currency,
        locale,
        now,
      ).catch(() => null);
      if (withIt !== null && without !== null) {
        price = IntegerMoneySchema.parse({
          amountMinor: withIt.totalMinor - without.totalMinor,
          currency: withIt.currency,
        });
      }
    } else {
      const projection = await addonPriceProjection(
        addon.key,
        line.countryIso,
        locale,
        {
          now,
        },
      ).catch(() => null);
      price = projection?.displayPrice ?? null;
    }
    if (price !== null) {
      offered.push({
        key: addon.key,
        nameKey: addon.nameKey,
        descriptionKey: addon.descriptionKey,
        allergenNoteRequired: addon.allergenNoteRequired,
        price,
      });
    }
  }
  return offered;
}

const StatusRow = z.object({ status: z.string() });

/** Every order of the purchase is still `placed`: placed, not paid (spec 013 §5.2). */
async function purchaseUnpaid(
  purchaseId: string,
  connection: DraftConnection | undefined,
): Promise<boolean> {
  const rows = await withDraftConnection(connection, (executor) =>
    executor.execute(
      sql`SELECT status FROM "order" WHERE purchase_id = ${purchaseId}`,
    ),
  );
  const statuses = rows.map((row) => StatusRow.parse(row).status);
  return statuses.length > 0 && statuses.every((status) => status === "placed");
}

/** The screen for a request (the file header). */
export async function checkoutScreen(
  request: ScreenRequest,
): Promise<CheckoutScreen> {
  const now = (request.now ?? (() => new Date()))();
  const lookup = await loadDraft(request.token, now, request.connection);
  if (lookup.status !== "active") return { kind: "expired" };
  const draft = lookup.draft;
  if (draft.purchaseId !== null) {
    if (
      (draft.mode === "test" || draft.mode === "live") &&
      (await purchaseUnpaid(draft.purchaseId, request.connection))
    ) {
      return { kind: "unpaid", mode: draft.mode };
    }
    return { kind: "placed" };
  }
  if (draft.lines.length === 0) return { kind: "empty" };
  const locale = request.locale;
  const assessed = await assessBasket(draft, {
    locale,
    now,
    ...(request.flags === undefined ? {} : { flags: request.flags }),
  });
  // Every line closed: the destination stopped taking orders (AC-3).
  if (
    assessed.lines.every(
      (entry) =>
        entry.availability.status === "unavailable" &&
        (entry.availability.reason === "closed" ||
          entry.availability.reason === "mode"),
    )
  ) {
    const first = draft.lines[0];
    const mode =
      first === undefined
        ? "closed"
        : await currentCheckoutMode({
            countryIso: first.countryIso,
            locale,
            ...(request.flags === undefined ? {} : { flags: request.flags }),
          });
    if (mode === "closed") {
      return {
        kind: "closed",
        countryIso: first?.countryIso ?? null,
        productPath:
          first === undefined
            ? null
            : await productPathOf(locale, first.sku, first.countryIso),
      };
    }
  }

  const selected = selectScreen(
    draft,
    assessed.reviewReachable,
    request.step,
    request.line,
  );
  const lines: ScreenLine[] = [];
  for (const entry of assessed.lines) {
    const line = entry.line;
    const product = await getProduct(line.sku).catch(() => null);
    const tiers = await listTiers(line.sku).catch(() => [] as readonly Tier[]);
    const tier = tiers.find((candidate) => candidate.tierKey === line.tierKey);
    lines.push({
      position: line.position,
      sku: line.sku,
      productName: product?.name ?? line.sku,
      tier:
        tier === undefined
          ? null
          : { labelKey: tier.labelKey, stems: tier.stems },
      countryIso: line.countryIso,
      deliveryDate: line.deliveryDate,
      addonKeys: line.addonKeys,
      amount: entry.availability.status === "unavailable" ? null : entry.amount,
      availability: entry.availability,
      totals:
        entry.availability.status === "unavailable"
          ? null
          : await lineTotals(
              entry.check === null
                ? line
                : { ...line, quote: entry.check.quote },
              locale,
              now,
            ),
      recipient: line.recipient,
      card: line.card,
      stepsCompleted: line.stepsCompleted,
    });
  }
  const current =
    draft.lines.find((line) => line.position === selected.line) ??
    draft.lines[0];
  if (current === undefined) return { kind: "empty" };
  const currency = (draft.currency ??
    current.quote?.currency ??
    null) as CurrencyCode | null;
  const address =
    selected.step === "recipient" ? addressFormModel(current.countryIso) : null;

  // Spec 047 (TASK-447): the applied code on the basket as it stands (an advisory count; the
  // binding one is at placement), and step 4's control.
  const deliveries = lines.flatMap((entry) =>
    entry.totals === null
      ? []
      : [{ position: entry.position, totals: entry.totals }],
  );
  const codesOn = await discountCodesOn(
    draft.lines.map((entry) => entry.countryIso),
    discountFlagOf(request),
  );
  const { applied, lockedMinutes } = await withDraftConnection(
    request.connection,
    async (executor) => ({
      applied:
        codesOn && assessed.total !== null
          ? await draftDiscountOf(executor, draft, deliveries, now)
          : null,
      lockedMinutes:
        codesOn && selected.step === "review"
          ? await discountLockMinutes(executor, draft.id, now)
          : null,
    }),
  );
  const discount = applied?.kind === "applied" ? applied.discount : null;
  return {
    kind: "step",
    step: selected.step,
    line: selected.line,
    mode: draft.mode,
    locale,
    lines,
    total: discount?.total ?? assessed.total,
    notice: assessed.notice,
    buyer: draft.buyer,
    reachable: furthestScreen(draft, assessed.reviewReachable),
    reviewReachable: assessed.reviewReachable,
    address: address?.status === "open" ? address : null,
    calendar:
      selected.step === "recipient"
        ? await calendarFor(current, currency, locale, now)
        : [],
    addons:
      selected.step === "card"
        ? await offeredAddons(current, currency, locale, now)
        : [],
    productPath: await productPathOf(locale, current.sku, current.countryIso),
    discount,
    discountLost:
      applied?.kind === "refused"
        ? { code: applied.code, refusal: applied.refusal }
        : null,
    discountControl:
      codesOn && selected.step === "review" ? { lockedMinutes } : null,
    basketReminder:
      selected.step === "details" &&
      (await basketReminderOffered(locale, request.reminderGate))
        ? { checked: (draft.reminderConsentAt ?? null) !== null }
        : null,
  };
}
