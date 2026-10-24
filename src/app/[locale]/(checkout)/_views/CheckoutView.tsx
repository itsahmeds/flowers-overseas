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
  type CalendarDay,
  type CheckoutScreen,
  type ScreenLine,
  type StepScreen,
  residenceCountryCodes,
} from "@/modules/checkout";
import {
  countGraphemes,
  formatDate,
  formatMoney,
  formatNumber,
  formatPercentFromBasisPoints,
  formatRegionName,
  MoneySchema,
  sortBy,
} from "@/modules/i18n";
import {
  checkoutButtonClass as buttonClass,
  DemoBanner,
  ErrorSummary,
  type ErrorSummaryItem,
  InlinePrivacyNotice,
  PriceChangedNotice,
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

function calendarLabel(dayOf: CalendarDay, locale: LocaleCode): string {
  const date = formatDate(day(dayOf.date), locale, "deliveryDate", ZONE);
  return dayOf.surcharge === null
    ? date
    : `${date} · ${formatMoney(dayOf.surcharge, locale, { signDisplay: "always" })}`;
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
  const placeKind = valueOf(echo, "placeKind", saved?.placeKind);
  const fields = screen.address?.fields ?? [];
  return (
    <>
      <RadioChipGroup
        id={fieldId("deliveryDate")}
        legend={
          screen.mode === "live" ? t("date.legend") : t("demo.dateHeading")
        }
        name="deliveryDate"
        options={selectable.map((entry) => ({
          value: entry.date,
          label: calendarLabel(entry, locale),
        }))}
        required
        {...(date === "" ? {} : { defaultValue: date })}
        {...(errorOf(echo, all, "deliveryDate") === undefined
          ? {}
          : { error: errorOf(echo, all, "deliveryDate") })}
      />
      {fields.map((field) => {
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
            {...(field.required ? {} : { optionalLabel: optional })}
            {...(name === "phone" ? { hint: t("recipient.phoneReason") } : {})}
            {...(error === undefined ? {} : { error })}
            {...(warning === undefined ? {} : { warning })}
          />
        );
      })}
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
        optionalLabel={optional}
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
          <legend className="text-ink mb-[6px] p-0 text-sm font-bold">
            {t("addons.legend")}
          </legend>
          <ul className="m-0 grid list-none gap-[8px] p-0">
            {screen.addons.map((addon) => {
              const name = all(addon.nameKey);
              const price = formatMoney(addon.price, locale);
              const chosen = line.addonKeys.includes(addon.key);
              return (
                <li
                  className="border-rule flex min-h-[44px] items-center justify-between gap-[12px] border-b py-[6px]"
                  data-fo-addon={addon.key}
                  key={addon.key}
                >
                  <span className="text-ui">
                    {name} <span className="text-ink-muted num">{price}</span>
                  </span>
                  <button
                    aria-label={
                      chosen
                        ? t("addons.removeLabel", { name })
                        : t("addons.addLabel", { name, price })
                    }
                    aria-pressed={chosen}
                    className={buttonClass(chosen ? "primary" : "ghost", "sm")}
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
          <legend className="text-ink mb-[6px] p-0 text-sm font-bold">
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
            defaultValue={valueOf(echo, "buyerPhone", buyer?.buyerPhone ?? "")}
            id={fieldId("buyerPhone")}
            inputMode="tel"
            label={t("buyer.phone")}
            name="buyerPhone"
            optionalLabel={optional}
            type="tel"
            {...error("buyerPhone")}
          />
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
  const row =
    "grid gap-[4px] border-rule border-b py-[12px] md:grid-cols-[160px_minmax(0,1fr)_auto] md:gap-x-[16px]";
  const link =
    "text-link hover:text-link-strong inline-flex min-h-[44px] items-center font-bold underline underline-offset-4";
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
            <dl className="m-0">
              <div className={row}>
                <dt className="text-ink-muted text-sm">
                  {t("review.bouquet")}
                </dt>
                <dd className="m-0">
                  <bdi>{line.productName}</bdi> · {tierText(all, line)}
                </dd>
                <dd className="m-0" />
              </div>
              <div className={row}>
                <dt className="text-ink-muted text-sm">{t("review.date")}</dt>
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
                <dt className="text-ink-muted text-sm">
                  {t("review.recipient")}
                </dt>
                <dd className="m-0 grid">
                  <bdi>{recipient?.fullName ?? ""}</bdi>
                  <bdi>{address}</bdi>
                  <span>
                    <bdi>{recipient?.phone.national ?? ""}</bdi>
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
                <dt className="text-ink-muted text-sm">{t("review.card")}</dt>
                <dd className="m-0 grid">
                  {line.card === null || line.card.cardMessage === "" ? (
                    t("review.noCard")
                  ) : (
                    <>
                      <bdi className="whitespace-pre-line">
                        {line.card.cardMessage}
                      </bdi>
                      {line.card.signAs === "" ? null : (
                        <bdi>{line.card.signAs}</bdi>
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
                <dt className="text-ink-muted text-sm">{t("review.addons")}</dt>
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
                  <dt className="text-ink-muted text-sm">
                    {t("review.amount")}
                  </dt>
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
      {routing(intent, screen)}
      {hidden("line", String(line.position))}
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
      <SubmitButton className="max-md:hidden md:justify-self-start">
        {screen.step === "recipient"
          ? t("action.toCard")
          : t("action.toReview")}
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
        <PlaceOrderButton
          label={t("demo.place")}
          pendingLabel={t("demo.placing")}
        />
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
    "bg-card shadow-letter rounded-letter grid gap-[18px] px-[34px] pt-[30px] pb-[32px] max-md:px-[18px]";

  return (
    <>
      {screen.mode === "demo" ? (
        <DemoBanner body={t("demo.bannerBody")} title={t("demo.bannerTitle")} />
      ) : null}
      <div className="grid gap-[24px] py-[24px]" data-fo-checkout={screen.step}>
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
        <div className="grid items-start gap-[32px] lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 gap-[18px]">
            <h1 className="display text-ink m-0 text-[30px] leading-[1.1] md:text-[38px]">
              {t(STEP_TITLES[screen.step])}
            </h1>
            {screen.step === "recipient" && screen.line === 1 && others > 0 ? (
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
                  confirmLabel={(amount) => t("price.confirm", { new: amount })}
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
                      <SubmitButton className="md:justify-self-start" size="sm">
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
              <div className={formFrame}>
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
            {screen.productPath === null || line === undefined ? null : (
              <p className="m-0">
                <a
                  className="text-link hover:text-link-strong inline-flex min-h-[44px] items-center font-bold underline underline-offset-4"
                  href={screen.productPath}
                >
                  {t("action.back", { product: line.productName })}
                </a>
              </p>
            )}
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
                        formatDate(
                          day(line.deliveryDate),
                          locale,
                          "deliveryDate",
                          ZONE,
                        ),
                      ]),
                ],
              }}
              lines={summary.lines}
              locale={locale}
              title={t("summary.title")}
              total={total}
              totalLabel={t("summary.total")}
              {...(screen.step !== "recipient" &&
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
          action={
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
          }
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
  const link =
    "text-link hover:text-link-strong inline-flex min-h-[44px] items-center font-bold underline underline-offset-4";
  return (
    <div
      className="grid max-w-[640px] gap-[16px] py-[48px]"
      data-fo-checkout={screen.kind}
    >
      {screen.kind === "closed" ? (
        <>
          <h1 className="display text-ink m-0 text-[30px] leading-[1.1]">
            {t("closed.title", {
              country:
                screen.countryIso === null
                  ? ""
                  : countryName(all, screen.countryIso),
            })}
          </h1>
          <p className="text-ui m-0">{t("closed.opensSoon")}</p>
          <p className="m-0">
            <a className={link} href={screen.productPath ?? `/${locale}`}>
              {t("closed.back")}
            </a>
          </p>
        </>
      ) : (
        <>
          <h1 className="display text-ink m-0 text-[30px] leading-[1.1]">
            {t("expired.title")}
          </h1>
          <p className="m-0">
            <a className={link} href={`/${locale}`}>
              {t("expired.link")}
            </a>
          </p>
        </>
      )}
    </div>
  );
}
