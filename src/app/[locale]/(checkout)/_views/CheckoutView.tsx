/**
 * `/{locale}/checkout`, drawn (spec 010 §2 "The checkout: three steps on one URL", §5.3, §7, §8;
 * AC-7, AC-8 render half, AC-10 render half, AC-12, AC-14 page half, AC-19 render half, AC-32,
 * AC-33; §14 A-founder-2026-10-22 item 5, AC-58, AC-59 and AC-60 render halves, AC-73; TASK-204,
 * TASK-206; artboards `docs/design/wireframes/checkout-{desktop,mobile}.dc.html`).
 *
 * Server components only. The page hands in the screen `checkoutScreen()` decided and the page's
 * one server action; every form is a `StepForm` posting to it, so every step works with
 * JavaScript off. A refused post comes back as a 303 to the same screen with its echo (the
 * `fo_checkout_echo` cookie, `modules/checkout/echo.ts`), which the page hands in here: the same
 * body with the posted values kept and each field's message (AC-14), the sample details filled
 * ("Use sample details", AC-33), or the cap notice (AC-27).
 *
 * The primitives take strings and `Money`; this file resolves every key and formats every value:
 * amounts through `formatMoney`, dates with weekday and month name through `formatDate` (AC-32),
 * names, addresses and the card inside `<bdi>` (the primitives isolate what they render). Nothing
 * here computes money: every amount is a line's quote, read off the screen model.
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

import {
  CHECKOUT_LIMITS,
  PLACE_KIND_LABEL_KEYS,
  PLACE_KINDS,
} from "@/config/checkout";
import {
  CHECKOUT_SAMPLES,
  type CheckoutSample,
} from "@/config/checkout-samples";
import { localeConfig, type LocaleCode } from "@/config/locales";
import { COMPANY, controllerName } from "@/config/company";
import {
  type CheckoutScreen,
  type ScreenLine,
  type StepScreen,
  callingCodeOf,
  internationalPhone,
  residenceCountryCodes,
} from "@/modules/checkout";
import { infoPageExists, infoPagePath } from "@/modules/content";
import {
  countGraphemes,
  formatDate,
  formatDateParts,
  formatMoney,
  formatNumber,
  formatPercentFromBasisPoints,
  formatRegionName,
  MoneySchema,
  sortBy,
} from "@/modules/i18n";
import {
  altFor,
  assetsForProduct,
  isDisplayable,
  MediaAsset,
  PAGE_FRAME,
} from "@/modules/ui";
import {
  checkoutButtonClass,
  DemoBanner,
  ErrorSummary,
  type ErrorSummaryItem,
  InlinePrivacyNotice,
  PriceChangedNotice,
  OrderSummaryMini,
  OrderSummaryPanel,
  type SummaryLine,
  type VatLine,
  PlaceOrderButton,
  RadioChipGroup,
  SelectField,
  StepForm,
  StepProgress,
  StickyTotalBar,
  SampleDetailsButton,
  SubmitButton,
  TextAreaWithCounter,
  TextField,
  COUNT_SLOT,
  CHECKOUT_FORM_FIELDS,
  CHECKOUT_FORM_IDS,
  type CheckoutAction,
  type CheckoutFormIntent,
} from "@/modules/ui/checkout";

/** What a refused post is drawn again with. */
export interface CheckoutEcho {
  readonly values: Readonly<Record<string, string | readonly string[]>>;
  readonly errors: Readonly<
    Record<
      string,
      readonly {
        readonly key: string;
        readonly params?: Readonly<Record<string, unknown>> | undefined;
      }[]
    >
  >;
  /** Counts refused submits, so the error summary takes focus again on each (AC-14). */
  readonly attempt: number;
  /** Step 3's refusal where the buyer stands. */
  readonly refused?: "cap" | "unable" | undefined;
}

type Translate = (key: string, values?: Record<string, unknown>) => string;

async function translators(locale: LocaleCode): Promise<{
  readonly t: Translate;
  readonly all: Translate;
  readonly rich: Awaited<
    ReturnType<typeof getTranslations<"checkout">>
  >["rich"];
}> {
  const checkout = await getTranslations({ locale, namespace: "checkout" });
  const root = await getTranslations({ locale });
  const call = (fn: unknown) => fn as Translate;
  return {
    t: call(checkout),
    all: call(root),
    rich: checkout.rich,
  };
}

const ZONE = "UTC";

/** An ISO date at noon UTC, so no zone moves it to another day. */
function day(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

const STEP_INDEX = { recipient: 0, card: 1, review: 2 } as const;
const STEP_NAMES = {
  recipient: "progress.recipient",
  card: "progress.card",
  review: "progress.review",
} as const;
const STEP_TITLES = {
  recipient: "step.recipient",
  card: "step.card",
  review: "step.review",
} as const;

/** The form card's heading: Fraunces with its one italic phrase (`.form-letter h1`). */
const TITLE =
  "display text-ink m-0 text-(length:--text-2xl-fluid) leading-[1.08]";

/** The `<em>` of a rich title. */
function emphasis(chunks: ReactNode): ReactElement {
  return <em>{chunks}</em>;
}

/**
 * The line's photograph for the summary (the listing card's rule, spec 006 AC-18): the first
 * displayable asset with alt text in this locale, or nothing (the panel draws its placeholder).
 */
function linePhoto(line: ScreenLine, locale: LocaleCode): ReactElement | null {
  for (const asset of assetsForProduct(line.sku)) {
    if (
      altFor(asset.id, locale) !== undefined &&
      isDisplayable(asset.id, locale)
    ) {
      return (
        <MediaAsset
          assetId={asset.id}
          locale={locale}
          productName={line.productName}
          ratio="card"
          slot="thumb"
        />
      );
    }
  }
  return null;
}

function fieldId(name: string): string {
  return `co-${name}`;
}

function hidden(name: string, value: string): ReactElement {
  return <input name={name} type="hidden" value={value} />;
}

/** The routing fields of a form (`form-fields.ts`). */
function routing(
  intent: CheckoutFormIntent,
  screen: Pick<StepScreen, "locale" | "step" | "line">,
): ReactElement {
  return (
    <>
      {hidden(CHECKOUT_FORM_FIELDS.intent, intent)}
      {hidden(CHECKOUT_FORM_FIELDS.locale, screen.locale)}
      {hidden(CHECKOUT_FORM_FIELDS.step, screen.step)}
      {hidden(CHECKOUT_FORM_FIELDS.line, String(screen.line))}
    </>
  );
}

function valueOf(
  echo: CheckoutEcho | undefined,
  name: string,
  saved: string | undefined,
): string {
  const posted = echo?.values[name];
  if (typeof posted === "string") return posted;
  return saved ?? "";
}

function errorOf(
  echo: CheckoutEcho | undefined,
  all: Translate,
  name: string,
): string | undefined {
  const issue = echo?.errors[name]?.[0];
  if (issue === undefined) return undefined;
  return all(issue.key, { ...issue.params });
}

function tierText(all: Translate, line: ScreenLine): string {
  if (line.tier === null) return "";
  return line.tier.stems === null
    ? all(line.tier.labelKey)
    : all(line.tier.labelKey, { count: line.tier.stems });
}

function countryName(all: Translate, iso: string): string {
  return all(`destinations.${iso.toLowerCase()}.name`);
}

/** The buyer's country of residence the locale suggests (§2 step 2): its region, if it has one. */
function residenceDefault(locale: LocaleCode): string {
  const region = /-([A-Z]{2})$/u.exec(localeConfig(locale).bcp47)?.[1];
  return region ?? "";
}

/* -------------------------------------------------------------------------- */
/* Step 1                                                                       */
/* -------------------------------------------------------------------------- */

/** Reasons a day tile's note can state without a time or a city (the rest stay unstated). */
const NOTED_REASONS = new Set([
  "delivery.reason.publicHoliday",
  "delivery.reason.sundayClosed",
  "delivery.reason.notDeliveryDay",
]);

/** The legend and day tiles of step 1 (`.s10-cal`, `.s10-day`; AC-19 render half, AC-32). */
function CalendarTiles({
  screen,
  line,
  selected,
  error,
  t,
  all,
}: {
  readonly screen: StepScreen;
  readonly line: ScreenLine;
  readonly selected: string;
  readonly error: string | undefined;
  readonly t: Translate;
  readonly all: Translate;
}): ReactElement {
  const locale = screen.locale;
  const country = countryName(all, line.countryIso);
  const errorId = `${fieldId("deliveryDate")}-error`;
  const notes = screen.calendar.filter(
    (entry) =>
      !entry.selectable &&
      entry.reasonKey !== null &&
      NOTED_REASONS.has(entry.reasonKey),
  );
  return (
    <fieldset
      className="m-0 grid min-w-0 border-0 p-0"
      id={fieldId("deliveryDate")}
      {...(error === undefined
        ? {}
        : { "aria-describedby": errorId, "aria-invalid": true })}
    >
      <legend className="text-ink mb-[10px] p-0 text-sm font-bold">
        {screen.mode === "live" ? t("date.legend") : t("demo.dateHeading")}
      </legend>
      {error === undefined ? null : (
        <p className="text-danger m-0 mb-[8px] text-sm font-bold" id={errorId}>
          {error}
        </p>
      )}
      <div
        className="grid grid-cols-7 gap-[8px] max-md:-mx-[18px] max-md:auto-cols-[74px] max-md:grid-flow-col max-md:grid-cols-none max-md:overflow-x-auto max-md:px-[18px] max-md:pb-[4px]"
        data-fo-calendar=""
      >
        {screen.calendar.map((entry) => {
          const parts = formatDateParts(
            day(entry.date),
            locale,
            ZONE,
            "deliveryDate",
          );
          const price =
            entry.surcharge === null
              ? t("summary.included")
              : formatMoney(entry.surcharge, locale, { signDisplay: "always" });
          return (
            <label
              className={`group rounded-field text-ink-2 relative grid min-h-[76px] justify-items-center gap-[2px] px-[4px] pt-[8px] pb-[9px] text-center text-xs ${
                entry.selectable
                  ? "bg-card has-checked:bg-selected has-checked:text-on-selected cursor-pointer shadow-[inset_0_0_0_1.5px_var(--color-rule)] has-checked:shadow-none has-focus-visible:outline-[2.5px] has-focus-visible:outline-offset-[3px] has-focus-visible:outline-solid"
                  : "bg-paper-2 text-ink-3 shadow-[inset_0_0_0_1px_var(--color-rule)]"
              }`}
              data-fo-day={entry.date}
              key={entry.date}
            >
              <input
                className="absolute size-px opacity-0"
                defaultChecked={entry.date === selected}
                disabled={!entry.selectable}
                name="deliveryDate"
                required
                type="radio"
                value={entry.date}
              />
              <span className="sr-only">
                {formatDate(day(entry.date), locale, "calendarDate", ZONE)}
                {entry.selectable ? `, ${price}` : ""}
              </span>
              <span aria-hidden="true">{parts.weekday}</span>
              <b
                aria-hidden="true"
                className={`font-display text-[20px] leading-[1.15] font-(--font-weight-display) ${
                  entry.selectable
                    ? "text-ink group-has-checked:text-on-selected"
                    : "text-ink-3 line-through"
                }`}
              >
                {parts.day}
              </b>
              <i
                aria-hidden="true"
                className={`text-[12px] not-italic ${
                  !entry.selectable
                    ? "invisible"
                    : entry.surcharge === null
                      ? "text-included group-has-checked:text-on-selected font-bold"
                      : "text-ink-2 group-has-checked:text-on-selected font-bold"
                }`}
              >
                {entry.selectable ? price : t("summary.included")}
              </i>
            </label>
          );
        })}
      </div>
      {notes.map((entry) => (
        <p
          className="text-ink-2 m-0 mt-[8px] text-sm leading-(--line-height-tight)"
          key={entry.date}
        >
          {t("date.offNote", {
            date: formatDate(day(entry.date), locale, "deliveryDate", ZONE),
            reason: all(entry.reasonKey ?? "", { country }),
          })}
        </p>
      ))}
    </fieldset>
  );
}

/** Address fields, with postcode and town side by side from `md` (`.f2`). */
function pairedFields<T extends { readonly field: string }>(
  fields: readonly T[],
): (T | readonly [T, T])[] {
  const out: (T | readonly [T, T])[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const next = fields[index + 1];
    if (field === undefined) continue;
    if (field.field === "postcode" && next?.field === "city") {
      out.push([field, next] as const);
      index += 1;
    } else out.push(field);
  }
  return out;
}

async function RecipientFields({
  screen,
  line,
  echo,
}: {
  readonly screen: StepScreen;
  readonly line: ScreenLine;
  readonly echo: CheckoutEcho | undefined;
}): Promise<ReactElement> {
  const { t, all } = await translators(screen.locale);
  const locale = screen.locale;
  const saved = line.recipient;
  const optional = t("field.optional");
  const country = countryName(all, line.countryIso);
  const selectable = screen.calendar.filter((entry) => entry.selectable);
  const savedDate =
    line.deliveryDate !== null &&
    selectable.some((entry) => entry.date === line.deliveryDate)
      ? line.deliveryDate
      : undefined;
  const date = valueOf(echo, "deliveryDate", savedDate);
  // "A home" is preselected (the artboard's state): most flowers go to a home, and the choice
  // stays one tap away.
  const placeKind = valueOf(echo, "placeKind", saved?.placeKind ?? "home");
  const fields = screen.address?.fields ?? [];
  const example = screen.address?.example;
  const callingCode = callingCodeOf(line.countryIso);
  const placeholderOf = (name: string): string | undefined =>
    name === "fullName"
      ? t("field.namePlaceholder")
      : name === "street"
        ? example?.street
        : name === "postcode"
          ? example?.postcode
          : name === "phone" && callingCode !== null
            ? `+${callingCode}`
            : undefined;
  const fieldOf = (field: (typeof fields)[number]): ReactElement => {
    const name = field.field;
    const savedValue =
      name === "fullName"
        ? saved?.fullName
        : name === "phone"
          ? saved?.phone.national
          : saved?.address[name];
    const error = errorOf(echo, all, name);
    const warning =
      name === "phone" &&
      error === undefined &&
      echo === undefined &&
      saved?.phone.nonLocal === true
        ? t("recipient.phoneNonLocal", { country })
        : undefined;
    const placeholder = placeholderOf(name);
    return (
      <TextField
        autoComplete={field.autocomplete ?? "off"}
        bidiIsolate={name !== "phone" && name !== "postcode"}
        clientMessages={{ required: t("error.required") }}
        defaultValue={valueOf(echo, name, savedValue)}
        id={fieldId(name)}
        inputMode={field.inputMode}
        key={name}
        label={all(field.labelKey)}
        name={name}
        required={field.required}
        type={name === "phone" ? "tel" : "text"}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(field.required ? {} : { optionalLabel: optional })}
        {...(name === "phone" ? { hint: t("recipient.phoneReason") } : {})}
        {...(error === undefined ? {} : { error })}
        {...(warning === undefined ? {} : { warning })}
      />
    );
  };
  return (
    <>
      <div className="grid gap-[14px]">
        {pairedFields(fields).map((entry) =>
          "field" in entry ? (
            fieldOf(entry)
          ) : (
            <div
              className="grid items-start gap-[12px] md:grid-cols-2 md:gap-x-[16px] md:gap-y-[14px]"
              key={`${entry[0].field}-${entry[1].field}`}
            >
              {fieldOf(entry[0])}
              {fieldOf(entry[1])}
            </div>
          ),
        )}
        <RadioChipGroup
          id={fieldId("placeKind")}
          legend={t("placeKind.legend")}
          name="placeKind"
          options={PLACE_KINDS.map((kind) => ({
            value: kind,
            label: all(PLACE_KIND_LABEL_KEYS[kind]),
          }))}
          required
          {...(placeKind === "" ? {} : { defaultValue: placeKind })}
          {...(errorOf(echo, all, "placeKind") === undefined
            ? {}
            : { error: errorOf(echo, all, "placeKind") })}
        />
        <TextField
          defaultValue={valueOf(echo, "deliveryNote", saved?.deliveryNote)}
          hint={t("recipient.deliveryNoteHint", {
            max: formatNumber(CHECKOUT_LIMITS.deliveryNote, locale),
          })}
          id={fieldId("deliveryNote")}
          label={t("recipient.deliveryNote")}
          name="deliveryNote"
          optionalLabel={optional}
          {...(errorOf(echo, all, "deliveryNote") === undefined
            ? {}
            : { error: errorOf(echo, all, "deliveryNote") })}
        />
      </div>
      <CalendarTiles
        all={all}
        error={errorOf(echo, all, "deliveryDate")}
        line={line}
        screen={screen}
        selected={date}
        t={t}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2                                                                       */
/* -------------------------------------------------------------------------- */

async function CardAndBuyerFields({
  screen,
  line,
  echo,
}: {
  readonly screen: StepScreen;
  readonly line: ScreenLine;
  readonly echo: CheckoutEcho | undefined;
}): Promise<ReactElement> {
  const { t, all } = await translators(screen.locale);
  const locale = screen.locale;
  const optional = t("field.optional");
  const card = valueOf(echo, "cardMessage", line.card?.cardMessage);
  const signAs = valueOf(echo, "signAs", line.card?.signAs);
  const count = countGraphemes(card, locale);
  const buyer = screen.buyer;
  const residence = valueOf(
    echo,
    "residenceCountry",
    buyer?.residenceCountry ?? residenceDefault(locale),
  );
  const countries = residenceCountryCodes().map((code) => ({
    value: code,
    label: formatRegionName(code, locale),
  }));
  const sorted = sortBy(countries, locale, (entry) => entry.label);
  const error = (name: string): { error?: string } => {
    const message = errorOf(echo, all, name);
    return message === undefined ? {} : { error: message };
  };
  return (
    <>
      <TextAreaWithCounter
        count={count}
        counterTemplate={t("card.counter", {
          count: COUNT_SLOT,
          max: formatNumber(CHECKOUT_LIMITS.cardMessage, locale),
        })}
        defaultValue={card}
        formattedCount={formatNumber(count, locale)}
        hint={t("card.blank")}
        id={fieldId("cardMessage")}
        label={t("card.label")}
        max={CHECKOUT_LIMITS.cardMessage}
        name="cardMessage"
        optionalLabel={optional}
        preview={{
          label: t("card.previewLabel"),
          printed: t("card.preview"),
          signatureFieldId: fieldId("signAs"),
          ...(signAs === "" ? {} : { signature: signAs }),
        }}
        {...error("cardMessage")}
      />
      <TextField
        defaultValue={signAs}
        hint={t("card.signAsHint", {
          max: formatNumber(CHECKOUT_LIMITS.signAs, locale),
        })}
        id={fieldId("signAs")}
        label={t("card.signAs")}
        maxLength={CHECKOUT_LIMITS.signAs}
        name="signAs"
        bidiIsolate
        {...error("signAs")}
      />
      {/* The add-ons the line keeps go with the save; "Add" and "Remove" are the side form's. */}
      {line.addonKeys.map((key) => (
        <input key={key} name="addonKeys" type="hidden" value={key} />
      ))}
      {screen.addons.length === 0 ? null : (
        <fieldset
          className="m-0 grid gap-[10px] border-0 p-0"
          data-fo-checkout-addons=""
        >
          <legend className="text-ink mb-[8px] p-0 text-sm font-bold">
            {t("addons.legend")}
          </legend>
          <ul className="border-rule m-0 grid list-none border-t p-0">
            {screen.addons.map((addon) => {
              const name = all(addon.nameKey);
              const price = formatMoney(addon.price, locale);
              const chosen = line.addonKeys.includes(addon.key);
              return (
                <li
                  className="border-rule text-ui grid min-h-[60px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-[16px] border-b py-[8px]"
                  data-fo-addon={addon.key}
                  key={addon.key}
                >
                  <span>
                    {name}
                    <small className="text-ink-3 block text-xs">
                      {addon.allergenNoteRequired
                        ? all("catalog.addon.allergen")
                        : all(addon.descriptionKey)}
                    </small>
                  </span>
                  <bdi className="num">{price}</bdi>
                  <button
                    aria-label={
                      chosen
                        ? t("addons.removeLabel", { name })
                        : t("addons.addLabel", { name, price })
                    }
                    aria-pressed={chosen}
                    className={`inline-grid min-h-[var(--target-min)] min-w-[76px] cursor-pointer place-items-center rounded-full border-0 px-[14px] text-sm font-bold ${
                      chosen
                        ? "bg-selected text-on-selected"
                        : "text-ink bg-transparent shadow-[inset_0_0_0_1.5px_var(--color-ink)]"
                    }`}
                    form={CHECKOUT_FORM_IDS.addons}
                    name={chosen ? "removeAddon" : "addAddon"}
                    type="submit"
                    value={addon.key}
                  >
                    {chosen ? t("addons.remove") : t("addons.add")}
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
      {screen.isLastLine ? (
        <fieldset
          className="m-0 grid gap-[14px] border-0 p-0"
          data-fo-checkout-buyer=""
        >
          <legend className="text-ink mb-[4px] p-0 text-sm font-bold">
            {t("buyer.legend")}
          </legend>
          <TextField
            autoComplete="email"
            clientMessages={{
              required: t("error.required"),
              format: t("error.emailInvalid"),
            }}
            defaultValue={valueOf(echo, "email", buyer?.email)}
            id={fieldId("email")}
            inputMode="email"
            label={t("buyer.email")}
            name="email"
            required
            type="email"
            {...error("email")}
          />
          <div className="grid items-start gap-[12px] md:grid-cols-2 md:gap-x-[16px] md:gap-y-[14px]">
            <TextField
              autoComplete="name"
              bidiIsolate
              clientMessages={{ required: t("error.required") }}
              defaultValue={valueOf(echo, "buyerName", buyer?.buyerName)}
              id={fieldId("buyerName")}
              label={t("buyer.fullName")}
              name="buyerName"
              required
              {...error("buyerName")}
            />
            <TextField
              autoComplete="tel"
              defaultValue={valueOf(
                echo,
                "buyerPhone",
                buyer?.buyerPhone ?? "",
              )}
              id={fieldId("buyerPhone")}
              inputMode="tel"
              label={t("buyer.phone")}
              name="buyerPhone"
              optionalLabel={optional}
              type="tel"
              {...error("buyerPhone")}
            />
          </div>
          <SelectField
            autoComplete="country"
            id={fieldId("residenceCountry")}
            label={t("buyer.country")}
            name="residenceCountry"
            options={
              residence === ""
                ? [{ value: "", label: t("buyer.country") }, ...sorted]
                : sorted
            }
            required
            defaultValue={residence}
            {...error("residenceCountry")}
          />
        </fieldset>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 3                                                                       */
/* -------------------------------------------------------------------------- */

async function ReviewList({
  screen,
}: {
  readonly screen: StepScreen;
}): Promise<ReactElement> {
  const { t, all } = await translators(screen.locale);
  const locale = screen.locale;
  const many = screen.lines.length > 1;
  const change = (step: "recipient" | "card", line: number): string =>
    line === 1 ? `?step=${step}` : `?step=${step}&line=${String(line)}`;
  // The board's `.s10-sum`: caps term, value, a quiet "Change"; on a phone the term sits above.
  const row =
    "text-ui grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-[12px] gap-y-[2px] border-rule border-b border-solid py-[11px] md:grid-cols-[150px_minmax(0,1fr)_auto] md:gap-x-[16px]";
  const term =
    "text-ink-3 col-span-full text-xs font-bold tracking-[0.1em] uppercase md:col-span-1";
  const link =
    "text-link hover:text-link-strong inline-flex min-h-(--target-min) items-center text-sm underline underline-offset-4 -my-[12px]";
  return (
    <div className="grid gap-[24px]" data-fo-review="">
      {screen.lines.map((line) => {
        const recipient = line.recipient;
        const address = recipient
          ? [
              ...Object.entries(recipient.address)
                .filter(([key]) => key !== "postcode" && key !== "city")
                .map(([, value]) => value),
              [recipient.address["postcode"], recipient.address["city"]]
                .filter(Boolean)
                .join(" "),
            ]
              .filter((part) => part !== "")
              .join(", ")
          : "";
        const addons =
          line.totals?.lines.flatMap((entry) =>
            entry.kind === "addon" ? [entry] : [],
          ) ?? [];
        return (
          <section
            aria-labelledby={`co-review-${String(line.position)}`}
            data-fo-review-line={line.position}
            key={line.position}
          >
            <h2
              className={many ? "text-ui m-0 mb-[4px] font-bold" : "sr-only"}
              id={`co-review-${String(line.position)}`}
            >
              {t("step.deliveryOf", {
                n: formatNumber(line.position, locale),
                total: formatNumber(screen.lines.length, locale),
              })}
            </h2>
            <dl className="border-rule m-0 border-t border-solid">
              <div className={row}>
                <dt className={term}>{t("review.bouquet")}</dt>
                <dd className="m-0">
                  <bdi>{line.productName}</bdi> · {tierText(all, line)}
                </dd>
                <dd className="m-0" />
              </div>
              <div className={row}>
                <dt className={term}>{t("review.date")}</dt>
                <dd className="m-0">
                  {line.deliveryDate === null
                    ? ""
                    : formatDate(
                        day(line.deliveryDate),
                        locale,
                        "calendarDate",
                        ZONE,
                      )}
                </dd>
                <dd className="m-0">
                  <a className={link} href={change("recipient", line.position)}>
                    {t("review.change")}
                  </a>
                </dd>
              </div>
              <div className={row}>
                <dt className={term}>{t("review.recipient")}</dt>
                <dd className="m-0 grid">
                  <bdi>{recipient?.fullName ?? ""}</bdi>
                  <bdi>{address}</bdi>
                  <span>
                    <bdi>
                      {recipient === null
                        ? ""
                        : internationalPhone(recipient.phone.e164)}
                    </bdi>
                    {recipient === null
                      ? ""
                      : ` · ${all(PLACE_KIND_LABEL_KEYS[recipient.placeKind])}`}
                  </span>
                </dd>
                <dd className="m-0">
                  <a className={link} href={change("recipient", line.position)}>
                    {t("review.change")}
                  </a>
                </dd>
              </div>
              <div className={row}>
                <dt className={term}>{t("review.card")}</dt>
                <dd className="m-0">
                  {line.card === null || line.card.cardMessage === "" ? (
                    t("review.noCard")
                  ) : (
                    <>
                      <bdi className="whitespace-pre-line">
                        {line.card.cardMessage}
                      </bdi>
                      {line.card.signAs === "" ? null : (
                        <>
                          {" "}
                          <bdi>{line.card.signAs}</bdi>
                        </>
                      )}
                    </>
                  )}
                </dd>
                <dd className="m-0">
                  <a className={link} href={change("card", line.position)}>
                    {t("review.change")}
                  </a>
                </dd>
              </div>
              <div className={row}>
                <dt className={term}>{t("review.addons")}</dt>
                <dd className="m-0">
                  {addons.length === 0
                    ? t("review.none")
                    : addons
                        .map(
                          (entry) =>
                            `${all(`catalog.addon.${entry.addonKey}.name`)} ${formatMoney(entry.amount, locale)}`,
                        )
                        .join(" · ")}
                </dd>
                <dd className="m-0">
                  <a className={link} href={change("card", line.position)}>
                    {t("review.change")}
                  </a>
                </dd>
              </div>
              {many && line.amount !== null ? (
                <div className={row}>
                  <dt className={term}>{t("review.amount")}</dt>
                  <dd className="num m-0 font-bold">
                    {formatMoney(line.amount, locale)}
                  </dd>
                  <dd className="m-0" />
                </div>
              ) : null}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The step form's body                                                         */
/* -------------------------------------------------------------------------- */

/** The step form's content, with a refused post's echo when there is one. */
export async function CheckoutStepBody({
  screen,
  echo,
}: {
  readonly screen: StepScreen;
  readonly echo?: CheckoutEcho;
}): Promise<ReactElement> {
  const { t, all, rich } = await translators(screen.locale);
  const locale = screen.locale;
  const line =
    screen.lines.find((candidate) => candidate.position === screen.line) ??
    screen.lines[0];
  if (line === undefined) return <></>;
  const many = screen.lines.length > 1;
  const errorItems: ErrorSummaryItem[] = Object.entries(echo?.errors ?? {})
    .filter(([, issues]) => issues.length > 0)
    .map(([name, issues]) => {
      const issue = issues[0];
      const label =
        name === "deliveryDate"
          ? t("date.legend")
          : name === "placeKind"
            ? t("placeKind.legend")
            : name === "deliveryNote"
              ? t("recipient.deliveryNote")
              : name === "cardMessage"
                ? t("card.label")
                : name === "signAs"
                  ? t("card.signAs")
                  : name === "email"
                    ? t("buyer.email")
                    : name === "buyerName"
                      ? t("buyer.fullName")
                      : name === "buyerPhone"
                        ? t("buyer.phone")
                        : name === "residenceCountry"
                          ? t("buyer.country")
                          : (() => {
                              const field = screen.address?.fields.find(
                                (candidate) => candidate.field === name,
                              );
                              return field === undefined
                                ? ""
                                : all(field.labelKey);
                            })();
      return {
        fieldId: fieldId(name),
        text: t("error.summaryItem", {
          field: label,
          message:
            issue === undefined ? "" : all(issue.key, { ...issue.params }),
        }),
      };
    });
  const intent: CheckoutFormIntent =
    screen.step === "recipient" ? "recipient" : "card";
  const continueLabel =
    screen.step === "recipient" ? t("action.toCard") : t("action.toReview");
  const privacy = rich("privacy.demoNotice", {
    period: process.env["APP_ENV"] === "production" ? "hours24" : "days7",
    controllerLine: all("company.controller", {
      name: controllerName(COMPANY),
      phone: COMPANY.contact.phoneDisplay,
    }),
    b: (chunks: ReactNode) => <b>{chunks}</b>,
  });

  return (
    <div className="grid gap-[18px]">
      <h1 className={TITLE}>
        {rich(STEP_TITLES[screen.step], { em: emphasis })}
      </h1>
      {routing(intent, screen)}
      {hidden("line", String(line.position))}
      {/* The form's default button, first in tree order, so Enter in a field continues rather
          than pressing "Use sample details" (HTML implicit submission). */}
      <button
        aria-hidden="true"
        className="sr-only"
        tabIndex={-1}
        type="submit"
      >
        {continueLabel}
      </button>
      {errorItems.length === 0 ? null : (
        <ErrorSummary
          attempt={echo?.attempt ?? 0}
          id="co-errors"
          items={errorItems}
          title={t("error.summaryTitle")}
        />
      )}
      {many ? (
        <p className="text-ink-muted m-0 text-sm" data-fo-delivery-of="">
          {t("step.deliveryOf", {
            n: formatNumber(line.position, locale),
            total: formatNumber(screen.lines.length, locale),
          })}
          {" · "}
          <bdi>{line.productName}</bdi>
        </p>
      ) : null}
      {screen.step === "recipient" && screen.mode === "demo" ? (
        <InlinePrivacyNotice
          action={<SampleDetailsButton label={t("demo.useSample")} />}
          message={privacy}
        />
      ) : null}
      {screen.step === "recipient" ? (
        <RecipientFields echo={echo} line={line} screen={screen} />
      ) : (
        <CardAndBuyerFields echo={echo} line={line} screen={screen} />
      )}
      {/* On a phone the sticky bar carries Continue (the mobile boards draw none in the form). */}
      <SubmitButton className="justify-self-start after:content-['_→'] max-lg:hidden">
        {continueLabel}
      </SubmitButton>
    </div>
  );
}

/** The sample details for the line's destination (`checkout-samples.ts`, AC-33). */
export function sampleValues(screen: StepScreen): Record<string, string> {
  const line = screen.lines.find(
    (candidate) => candidate.position === screen.line,
  );
  const sample =
    line === undefined
      ? undefined
      : (
          CHECKOUT_SAMPLES as unknown as Readonly<
            Record<string, CheckoutSample>
          >
        )[line.countryIso];
  if (sample === undefined) return {};
  const firstDate = screen.calendar.find((entry) => entry.selectable)?.date;
  return screen.step === "recipient"
    ? {
        ...Object.fromEntries(
          Object.entries(sample.recipient.fields).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ),
        placeKind: sample.recipient.placeKind,
        deliveryNote: sample.recipient.deliveryNote,
        ...(firstDate === undefined ? {} : { deliveryDate: firstDate }),
      }
    : {
        email: sample.buyer.email,
        buyerName: sample.buyer.buyerName,
        buyerPhone: sample.buyer.buyerPhone,
        residenceCountry: sample.buyer.residenceCountry,
      };
}

/* -------------------------------------------------------------------------- */
/* The place area (step 3)                                                      */
/* -------------------------------------------------------------------------- */

/** Step 3's place control, or the refusal in its place (AC-27, AC-28, AC-33). */
export async function PlaceArea({
  screen,
  refused,
}: {
  readonly screen: StepScreen;
  readonly refused?: "cap" | "unable";
}): Promise<ReactElement> {
  const { t } = await translators(screen.locale);
  const total = screen.total;
  return (
    <div className="grid gap-[10px]">
      {routing("place", screen)}
      {total === null ? null : (
        <>
          {hidden("seenTotalMinor", String(total.amountMinor))}
          {hidden("seenCurrency", total.currency)}
        </>
      )}
      {refused === undefined ? null : (
        <p
          className="bg-blush text-ink rounded-field m-0 px-[14px] py-[12px] text-sm"
          data-fo-place-refused={refused}
          role="alert"
        >
          {refused === "cap" ? t("demo.cap") : t("error.unable")}
        </p>
      )}
      {refused === "cap" ? null : (
        // On a phone the sticky bar carries the place button (the mobile step 3 board).
        <div className="max-lg:hidden">
          <PlaceOrderButton
            label={t("demo.place")}
            pendingLabel={t("demo.placing")}
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The page                                                                     */
/* -------------------------------------------------------------------------- */

function summaryFor(
  screen: StepScreen,
  all: Translate,
  t: Translate,
): { lines: SummaryLine[]; vat: VatLine[] } {
  const locale = screen.locale;
  if (screen.lines.length === 1) {
    const line = screen.lines[0];
    const product = line?.totals?.lines.find(
      (entry) => entry.kind === "product",
    );
    const rate =
      product === undefined
        ? ""
        : formatPercentFromBasisPoints(product.vatRateBp, locale);
    return {
      lines: [
        ...(line?.totals?.lines ?? []).map((entry, index): SummaryLine => ({
          id: `l${String(index)}`,
          label:
            entry.kind === "product"
              ? tierText(all, line as ScreenLine)
              : all(`catalog.addon.${entry.addonKey}.name`),
          amount: { kind: "money", money: entry.amount },
        })),
        {
          id: "delivery",
          label: t("summary.delivery"),
          amount: { kind: "included" },
        },
        ...(screen.step === "review"
          ? []
          : [
              {
                id: "vat",
                label: t("summary.vat", { rate }),
                amount: { kind: "included" } as const,
              },
            ]),
      ],
      vat: vatLines(screen, t),
    };
  }
  return {
    lines: [
      ...screen.lines.map((line): SummaryLine => ({
        id: `d${String(line.position)}`,
        label: `${t("step.deliveryOf", {
          n: formatNumber(line.position, locale),
          total: formatNumber(screen.lines.length, locale),
        })} · ${line.productName}`,
        amount:
          line.amount === null
            ? { kind: "included" }
            : { kind: "money", money: line.amount },
      })),
      {
        id: "delivery",
        label: t("summary.delivery"),
        amount: { kind: "included" },
      },
    ],
    vat: vatLines(screen, t),
  };
}

/** The VAT inside the total, by rate, summed over every delivery (§14 A-founder-2026-10-22 item 5). */
function vatLines(screen: StepScreen, t: Translate): VatLine[] {
  const byRate = new Map<number, { vatMinor: number; currency: string }>();
  for (const line of screen.lines) {
    for (const split of line.totals?.vat ?? []) {
      const entry = byRate.get(split.rateBp);
      byRate.set(split.rateBp, {
        vatMinor: (entry?.vatMinor ?? 0) + split.vatMinor,
        currency: line.totals?.total.currency ?? "",
      });
    }
  }
  return [...byRate.entries()]
    .sort(([left], [right]) => right - left)
    .map(([rateBp, entry]) => ({
      id: `vat-${String(rateBp)}`,
      label: t("summary.vatOf", {
        rate: formatPercentFromBasisPoints(rateBp, screen.locale),
      }),
      money: MoneySchema.parse({
        amountMinor: entry.vatMinor,
        currency: entry.currency,
      }),
    }));
}

/** A step of the checkout: banner, progress, the step's form, the summary, the phone's bar. */
export async function CheckoutStepPage({
  screen,
  action,
  echo,
}: {
  readonly screen: StepScreen;
  readonly action: CheckoutAction;
  /** A refused post's echo, already matched to this screen by the page. */
  readonly echo?: CheckoutEcho;
}): Promise<ReactElement> {
  const { t, all, rich } = await translators(screen.locale);
  const locale = screen.locale;
  const current = STEP_INDEX[screen.step];
  const reachable = STEP_INDEX[screen.reachable.step];
  const line =
    screen.lines.find((candidate) => candidate.position === screen.line) ??
    screen.lines[0];
  const steps = (["recipient", "card", "review"] as const).map((id, index) => ({
    id,
    name: t(STEP_NAMES[id]),
    ...(index < current && index <= reachable
      ? { href: index === 0 ? "?step=recipient" : `?step=${id}` }
      : {}),
  }));
  const summary = summaryFor(screen, all, t);
  const total = screen.total;
  const gone =
    line?.availability.status === "date_gone" ? line.availability : null;
  const goneDay =
    gone === null || line?.deliveryDate == null
      ? undefined
      : screen.calendar.find((entry) => entry.date === line.deliveryDate);
  const reasonKey =
    goneDay?.reasonKey !== null &&
    goneDay?.reasonKey !== undefined &&
    goneDay.reasonKey !== "delivery.reason.pastCutoff"
      ? goneDay.reasonKey
      : "delivery.reason.beforeEarliest";
  const others = screen.lines.length - 1;
  const formFrame =
    "bg-card shadow-letter rounded-letter grid gap-[18px] px-[34px] pt-[30px] pb-[32px] max-md:gap-[14px] max-md:px-[18px] max-md:pt-[22px] max-md:pb-[24px]";

  const photo = line === undefined ? null : linePhoto(line, locale);
  const guaranteeHref = infoPageExists("guarantee", locale)
    ? infoPagePath("guarantee", locale)
    : null;
  const promise = (
    <>
      {all("nav.utility.guarantee")}
      {guaranteeHref === null ? null : (
        <>
          {" · "}
          <a
            className="text-link hover:text-link-strong underline underline-offset-4"
            href={guaranteeHref}
          >
            {t("summary.guaranteeLink")}
          </a>
        </>
      )}
    </>
  );

  return (
    <>
      {screen.mode === "demo" ? (
        <DemoBanner
          body={t("demo.bannerBody")}
          innerClassName={PAGE_FRAME}
          title={t("demo.bannerTitle")}
        />
      ) : null}
      <div className={`${PAGE_FRAME} pb-[56px]`} data-fo-checkout={screen.step}>
        <div className="grid items-start gap-[28px] pt-[16px] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-[56px] lg:pt-[28px]">
          <div className="min-w-0">
            <StepProgress
              compactLabel={t("progress.compact", {
                current: formatNumber(current + 1, locale),
                total: formatNumber(3, locale),
                name: t(STEP_NAMES[screen.step]),
              })}
              current={current}
              label={t("progress.label")}
              locale={locale}
              steps={steps}
            />
            {total === null || line === undefined ? null : (
              <OrderSummaryMini
                label={t("summary.mini", { product: line.productName })}
                locale={locale}
                total={total}
              />
            )}
            <div className="grid gap-[18px]">
              {screen.step === "recipient" &&
              screen.line === 1 &&
              others > 0 ? (
                <p
                  className="bg-paper-3 rounded-field text-ui m-0 px-[14px] py-[12px]"
                  data-fo-also-in-basket=""
                  role="note"
                >
                  {t("basket.alsoInBasket", { count: others })}
                </p>
              ) : null}
              {screen.notice === null ? null : (
                <StepForm action={action} id={CHECKOUT_FORM_IDS.price}>
                  {routing("selection", screen)}
                  {hidden("intent", "confirmPrice")}
                  {hidden("seenCurrency", screen.notice.current.currency)}
                  {hidden("returnStep", screen.step)}
                  {hidden("line", String(screen.line))}
                  <PriceChangedNotice
                    confirmLabel={(amount) =>
                      t("price.confirm", { new: amount })
                    }
                    current={screen.notice.current}
                    locale={locale}
                    message={(amounts) =>
                      rich("price.changed", {
                        old: amounts.previous,
                        new: amounts.current,
                        b: (chunks: ReactNode) => <b>{chunks}</b>,
                      })
                    }
                    previous={screen.notice.previous}
                  />
                </StepForm>
              )}
              {gone === null || line === undefined ? null : (
                <StepForm action={action} id={CHECKOUT_FORM_IDS.nextDate}>
                  {routing("useNextDate", screen)}
                  {hidden("line", String(line.position))}
                  {hidden("returnTo", "checkout")}
                  <div
                    className="bg-blush text-ink rounded-field grid gap-[10px] px-[14px] py-[12px]"
                    data-fo-date-gone=""
                    role="alert"
                  >
                    <p className="m-0">
                      {t("date.gone", {
                        date:
                          line.deliveryDate === null
                            ? ""
                            : formatDate(
                                day(line.deliveryDate),
                                locale,
                                "calendarDate",
                                ZONE,
                              ),
                        country: countryName(all, line.countryIso),
                        reason: all(reasonKey, {
                          country: countryName(all, line.countryIso),
                        }),
                        next:
                          gone.next === null
                            ? ""
                            : formatDate(
                                day(gone.next),
                                locale,
                                "calendarDate",
                                ZONE,
                              ),
                      })}
                    </p>
                    {gone.next === null ? null : (
                      <>
                        {hidden("deliveryDate", gone.next)}
                        <SubmitButton
                          className="md:justify-self-start"
                          size="sm"
                        >
                          {t("date.useNext", {
                            next: formatDate(
                              day(gone.next),
                              locale,
                              "deliveryDate",
                              ZONE,
                            ),
                          })}
                        </SubmitButton>
                      </>
                    )}
                  </div>
                </StepForm>
              )}
              {screen.step === "review" ? (
                <div
                  className={`${formFrame} max-lg:rounded-b-none max-lg:pb-[8px]!`}
                >
                  <h1 className={TITLE}>
                    {rich(STEP_TITLES.review, { em: emphasis })}
                  </h1>
                  <ReviewList screen={screen} />
                </div>
              ) : (
                <StepForm
                  action={action}
                  className={formFrame}
                  id={CHECKOUT_FORM_IDS.step}
                >
                  <CheckoutStepBody
                    screen={screen}
                    {...(echo === undefined ? {} : { echo })}
                  />
                </StepForm>
              )}
              {screen.step === "card" && line !== undefined ? (
                <StepForm action={action} id={CHECKOUT_FORM_IDS.addons}>
                  {routing("selection", screen)}
                  {hidden("returnStep", "card")}
                  {hidden("line", String(line.position))}
                </StepForm>
              ) : null}
            </div>
          </div>
          {total === null || line === undefined ? null : (
            <OrderSummaryPanel
              id="co-summary"
              includedLabel={t("summary.included")}
              item={{
                name: line.productName,
                details: [
                  tierText(all, line),
                  ...(line.deliveryDate === null
                    ? []
                    : [
                        [
                          formatDate(
                            day(line.deliveryDate),
                            locale,
                            "deliveryDate",
                            ZONE,
                          ),
                          line.recipient?.address["city"],
                        ]
                          .filter((part) => part !== undefined && part !== "")
                          .join(" · "),
                      ]),
                ],
                ...(photo === null ? {} : { image: photo }),
              }}
              lineLabels={screen.step === "review" ? "plain" : "caps"}
              // On a phone steps 1 and 2 show only the mini summary; step 3 continues the review
              // card with the lines and the total, no title or photo (the mobile boards).
              className={
                screen.step === "review"
                  ? "max-lg:shadow-letter max-lg:z-1 max-lg:-mt-[28px] max-lg:rounded-t-none max-lg:bg-none max-lg:px-[18px] max-lg:pt-0"
                  : "max-lg:hidden"
              }
              {...(screen.step === "review"
                ? { headClassName: "max-lg:hidden" }
                : {})}
              // Step 3's panel ends with the place control (the board draws no promise line).
              {...(screen.step === "review" ? {} : { footer: promise })}
              lines={summary.lines}
              locale={locale}
              title={t("summary.title")}
              total={total}
              totalLabel={t("summary.total")}
              // Step 2 echoes the card; step 3's review list already shows it (the boards).
              {...(screen.step === "card" &&
              line.card !== null &&
              line.card.cardMessage !== ""
                ? {
                    card: {
                      message: line.card.cardMessage,
                      ...(line.card.signAs === ""
                        ? {}
                        : { signature: line.card.signAs }),
                    },
                  }
                : {})}
              {...(screen.step === "review"
                ? {
                    vatLines: summary.vat,
                    currencyLine: t("price.currencyLine", {
                      buyerCurrency: total.currency,
                    }),
                    action: (
                      <StepForm action={action} id={CHECKOUT_FORM_IDS.place}>
                        <PlaceArea
                          screen={screen}
                          {...(echo?.refused === undefined
                            ? {}
                            : { refused: echo.refused })}
                        />
                      </StepForm>
                    ),
                  }
                : {})}
            />
          )}
        </div>
      </div>
      {total === null ? null : (
        <StickyTotalBar
          locale={locale}
          total={total}
          totalLabel={t("summary.total")}
          // The daily cap leaves no place control, in the panel or here (AC-27).
          {...(screen.step === "review" && echo?.refused === "cap"
            ? {}
            : {
                action: (
                  <SubmitButton
                    form={
                      screen.step === "review"
                        ? CHECKOUT_FORM_IDS.place
                        : CHECKOUT_FORM_IDS.step
                    }
                    size="bar"
                  >
                    {screen.step === "recipient"
                      ? t("action.toCard")
                      : screen.step === "card"
                        ? t("action.toReview")
                        : t("demo.place")}
                  </SubmitButton>
                ),
              })}
        />
      )}
    </>
  );
}

/** The states with no form: not started or expired, closed, empty (AC-3, AC-13). */
export async function CheckoutStatePage({
  screen,
  locale,
}: {
  readonly screen: Exclude<CheckoutScreen, StepScreen | { kind: "placed" }>;
  readonly locale: LocaleCode;
}): Promise<ReactElement> {
  const { t, all } = await translators(locale);
  // The board's `.s10-msg`: the sentence, then one ghost button back.
  const h1 =
    "display text-ink m-0 text-[30px] leading-[1.12] md:text-(length:--text-3xl-fluid)";
  const back = checkoutButtonClass("ghost", "sm", "max-md:w-full");
  return (
    <div className={PAGE_FRAME} data-fo-checkout={screen.kind}>
      <div className="grid max-w-[640px] justify-items-start gap-[18px] py-[40px] md:pt-[72px] md:pb-[32px]">
        {screen.kind === "closed" ? (
          <>
            <h1 className={h1}>
              {t("closed.title", {
                country:
                  screen.countryIso === null
                    ? ""
                    : countryName(all, screen.countryIso),
              })}
            </h1>
            <p className="text-ink-2 m-0 max-w-[52ch]">
              {t("closed.opensSoon")}
            </p>
            <a className={back} href={screen.productPath ?? `/${locale}`}>
              {t("closed.back")}
            </a>
          </>
        ) : (
          <>
            <h1 className={h1}>{t("expired.title")}</h1>
            <a className={back} href={`/${locale}`}>
              {t("expired.link")}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
