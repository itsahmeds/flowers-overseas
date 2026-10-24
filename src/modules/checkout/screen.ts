/**
 * What `/{locale}/checkout` shows for a request (spec 010 §2 "The checkout: three steps on one
 * URL", §5.3, AC-7, AC-8, AC-13, AC-19 render half, AC-30; §14 A-founder-2026-10-22 items 5 and
 * 6, AC-58, AC-59 and AC-60 render halves; TASK-204).
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
} from "./draft";
import { type CheckoutFlagReader, currentCheckoutMode } from "./mode";
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

/** An add-on step 2 offers for the line's destination (AC-11): only priced ones. */
export interface OfferedAddon {
  readonly key: string;
  readonly nameKey: string;
  readonly price: IntegerMoney;
}

export interface StepScreen {
  readonly kind: "step";
  readonly step: CheckoutStep;
  /** The line this screen is for (its position). Step 3 is for the whole basket (`1`). */
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
  /** Step 2: the add-ons on offer; the buyer's fields render on the last line's screen only. */
  readonly addons: readonly OfferedAddon[];
  readonly isLastLine: boolean;
  /** Where "Back to {product}" goes for the current line, when a product page exists. */
  readonly productPath: string | null;
}

export type CheckoutScreen =
  | { readonly kind: "expired" }
  | { readonly kind: "placed" }
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
}

const LINE_PARAM = /^[1-9][0-9]?$/u;

function order(screen: { step: CheckoutStep; line: number }): number {
  return CHECKOUT_STEPS.indexOf(screen.step) * 100 + screen.line;
}

/** The screen the URL asks for, if it is reachable; else the first incomplete one (AC-7). */
export function selectScreen(
  draft: Pick<Draft, "lines" | "buyerSaved">,
  reviewReachable: boolean,
  step: string | undefined,
  line: string | undefined,
): { readonly step: CheckoutStep; readonly line: number } {
  const first = firstIncompleteScreen(draft);
  const furthest =
    first.step === "review" && !reviewReachable
      ? { step: "card" as const, line: draft.lines.at(-1)?.position ?? 1 }
      : first;
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
  const target = { step: wanted, line: wanted === "review" ? 1 : wantedLine };
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
      offered.push({ key: addon.key, nameKey: addon.nameKey, price });
    }
  }
  return offered;
}

/** The screen for a request (the file header). */
export async function checkoutScreen(
  request: ScreenRequest,
): Promise<CheckoutScreen> {
  const now = (request.now ?? (() => new Date()))();
  const lookup = await loadDraft(request.token, now, request.connection);
  if (lookup.status !== "active") return { kind: "expired" };
  const draft = lookup.draft;
  if (draft.purchaseId !== null) return { kind: "placed" };
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
  return {
    kind: "step",
    step: selected.step,
    line: selected.line,
    mode: draft.mode,
    locale,
    lines,
    total: assessed.total,
    notice: assessed.notice,
    buyer: draft.buyer,
    reachable: (() => {
      const first = firstIncompleteScreen(draft);
      return first.step === "review" && !assessed.reviewReachable
        ? { step: "card" as const, line: draft.lines.at(-1)?.position ?? 1 }
        : first;
    })(),
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
    isLastLine: current.position === draft.lines.length,
    productPath: await productPathOf(locale, current.sku, current.countryIso),
  };
}
