/**
 * The gallery's "Checkout" section: every state of spec 010's fourteen §5.3 primitives (TASK-201;
 * `docs/design/system/components.dc.html` "Checkout"; `docs/design/wireframes/
 * checkout-{desktop,mobile}.dc.html`).
 *
 * **This file is where the checkout's keys are resolved for the gallery**, exactly as the
 * checkout route will resolve them (TASK-204): the primitives take strings and `Money`, never a
 * key (spec 003 §14 A17 clause 2, check 11). So the copy shown here is the copy that ships, read
 * from `messages/*.json`, and the e2e spec drives the islands against it.
 *
 * The live form at the end mounts the two islands (`BlurValidation`, `CardCounter`) and the
 * error-summary demo. It has no submit button and posts nowhere: its values never leave the page.
 */
import type { ReactElement, ReactNode } from "react";

import { useTranslations } from "next-intl";

import type { LocaleCode } from "@/config/locales";
import { CHECKOUT_LIMITS } from "@/config/checkout";
import {
  countGraphemes,
  formatDate,
  formatNumber,
  formatPercentFromBasisPoints,
} from "@/modules/i18n";
import {
  BlurValidation,
  COUNT_SLOT,
  ConfirmationRecap,
  DemoBanner,
  ErrorSummary,
  InlinePrivacyNotice,
  OrderSummaryMini,
  OrderSummaryPanel,
  PlaceOrderButton,
  PriceChangedNotice,
  RadioChipGroup,
  SampleDetailsButton,
  SelectField,
  StepProgress,
  StickyTotalBar,
  SubmitButton,
  type SummaryLine,
  TextAreaWithCounter,
  TextField,
} from "@/modules/ui/checkout";

import { CheckoutErrorDemo } from "./CheckoutErrorDemo.tsx";
import {
  CHECKOUT_CARD_MESSAGE,
  CHECKOUT_CARD_TOO_LONG,
  CHECKOUT_DATE,
  CHECKOUT_FOREIGN_PHONE,
  CHECKOUT_GALLERY_IDS,
  CHECKOUT_REDERIVED_TOTAL,
  CHECKOUT_SAMPLE,
  CHECKOUT_SIGN_AS,
  CHECKOUT_STATES,
  CHECKOUT_STEMS,
  CHECKOUT_STREET_WITHOUT_NUMBER,
  CHECKOUT_TOTAL,
  CHECKOUT_VAT,
  CHECKOUT_VAT_RATE_BP,
  CHECKOUT_ZONE,
} from "./checkout-fixtures.ts";
import { PRODUCT_NAME } from "./product.ts";

const PLACE_KINDS = [
  "home",
  "work",
  "hospital",
  "funeralHome",
  "hotel",
  "cemetery",
  "church",
] as const;

/** The step names' keys, spelled out so `i18n:check`'s usage scan sees each one. */
const STEP_NAME_KEYS = {
  recipient: "progress.recipient",
  card: "progress.card",
  review: "progress.review",
} as const;
const STEP_IDS = ["recipient", "card", "review"] as const;

function State({
  name,
  children,
}: {
  readonly name: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="grid gap-[12px]">
      <p className="text-ink-subtle m-0 text-xs">{name}</p>
      {children}
    </div>
  );
}

export function CheckoutGallery({
  locale,
}: {
  readonly locale: LocaleCode;
}): ReactElement {
  const t = useTranslations("checkout");
  const c = useTranslations("confirmation");
  const d = useTranslations("destinations");
  const tier = useTranslations("catalog.tier");
  const sample = CHECKOUT_SAMPLE.recipient.fields;
  const required = t("error.required");
  const optional = t("field.optional");
  const tierLabel = tier("stems", { count: CHECKOUT_STEMS });
  const deliveryDate = formatDate(
    CHECKOUT_DATE,
    locale,
    "deliveryDate",
    CHECKOUT_ZONE,
  );
  const longDate = formatDate(CHECKOUT_DATE, locale, "dayMonth", CHECKOUT_ZONE);
  const rate = formatPercentFromBasisPoints(CHECKOUT_VAT_RATE_BP, locale);
  const city = sample.city ?? "";
  const counter = (max: number): string =>
    t("card.counter", { count: COUNT_SLOT, max: formatNumber(max, locale) });
  const cardMax = CHECKOUT_LIMITS.cardMessage;
  const counted = (text: string) => {
    const count = countGraphemes(text, locale);
    return { count, formattedCount: formatNumber(count, locale) };
  };
  const steps = (current: number) =>
    STEP_IDS.map((id, index) => ({
      id,
      name: t(STEP_NAME_KEYS[id]),
      ...(index < current ? { href: `?step=${id}` } : {}),
    }));
  const compact = (current: number) =>
    t("progress.compact", {
      current: formatNumber(current + 1, locale),
      total: formatNumber(3, locale),
      name: t(STEP_NAME_KEYS[STEP_IDS[current] ?? "recipient"]),
    });
  const lines: readonly SummaryLine[] = [
    {
      id: "bouquet",
      label: tierLabel,
      amount: { kind: "money", money: CHECKOUT_TOTAL },
    },
    {
      id: "delivery",
      label: t("summary.delivery"),
      amount: { kind: "included" },
    },
    {
      id: "vat",
      label: t("summary.vat", { rate }),
      amount: { kind: "included" },
    },
  ];
  const panel = {
    locale,
    title: t("summary.title"),
    totalLabel: t("summary.total"),
    includedLabel: t("summary.included"),
    item: {
      name: PRODUCT_NAME,
      details: [tierLabel, `${deliveryDate} · ${city}`],
    },
    lines,
    total: CHECKOUT_TOTAL,
  };
  const privacy = t.rich("privacy.demoNotice", {
    period: "hours24",
    controllerLine: "",
    b: (chunks) => <b>{chunks}</b>,
  });
  const errorItems = [
    {
      fieldId: CHECKOUT_GALLERY_IDS.name,
      text: t("error.summaryItem", {
        field: t("address.fullName"),
        message: required,
      }),
    },
    {
      fieldId: CHECKOUT_GALLERY_IDS.postcode,
      text: t("error.summaryItem", {
        field: t("address.postcode"),
        message: t("error.postcodeFormat", { example: "00-001" }),
      }),
    },
  ];
  const ids = CHECKOUT_GALLERY_IDS;

  return (
    <div className="grid gap-[40px]">
      <State name={CHECKOUT_STATES.banner}>
        <DemoBanner body={t("demo.bannerBody")} title={t("demo.bannerTitle")} />
      </State>

      <State name={CHECKOUT_STATES.progress}>
        {[0, 1, 2].map((current) => (
          <StepProgress
            compactLabel={compact(current)}
            current={current}
            key={current}
            label={t("progress.label")}
            locale={locale}
            steps={steps(current)}
          />
        ))}
      </State>

      <State name={CHECKOUT_STATES.textField}>
        <div className="grid max-w-[560px] gap-[14px]">
          <TextField
            autoComplete="name"
            bidiIsolate
            id="gallery-tf-default"
            label={t("address.fullName")}
            name="tf-default"
            required
          />
          <TextField
            autoComplete="address-line1"
            defaultValue={sample.street}
            forceFocus
            id="gallery-tf-focus"
            label={t("address.street")}
            name="tf-focus"
            required
          />
          <TextField
            autoComplete="address-line1"
            defaultValue={CHECKOUT_STREET_WITHOUT_NUMBER}
            error={t("error.required")}
            id="gallery-tf-error"
            label={t("address.street")}
            name="tf-error"
            required
          />
          <TextField
            defaultValue={sample.city}
            disabled
            id="gallery-tf-disabled"
            label={t("address.city")}
            name="tf-disabled"
            required
          />
          <TextField
            autoComplete="tel"
            defaultValue={sample.phone}
            hint={t("recipient.phoneReason")}
            id="gallery-tf-hint"
            inputMode="tel"
            label={t("address.phone")}
            name="tf-hint"
            required
            type="tel"
          />
          <TextField
            autoComplete="tel"
            defaultValue={CHECKOUT_FOREIGN_PHONE}
            hint={t("recipient.phoneReason")}
            id="gallery-tf-warning"
            inputMode="tel"
            label={t("address.phone")}
            name="tf-warning"
            required
            type="tel"
            warning={t("recipient.phoneNonLocal", { country: d("pl.name") })}
          />
          <TextField
            autoComplete="tel"
            id="gallery-tf-optional"
            inputMode="tel"
            label={t("buyer.phone")}
            name="tf-optional"
            optionalLabel={optional}
            type="tel"
          />
        </div>
      </State>

      <State name={CHECKOUT_STATES.select}>
        <div className="grid max-w-[560px] gap-[14px]">
          {[false, true].map((withError) => (
            <SelectField
              autoComplete="country"
              defaultValue="pl"
              id={`gallery-select-${String(withError)}`}
              key={String(withError)}
              label={t("buyer.country")}
              name={`select-${String(withError)}`}
              options={(["pl", "de", "fr"] as const).map((iso) => ({
                value: iso,
                label: d(`${iso}.name`),
              }))}
              required
              {...(withError ? { error: t("error.countryInvalid") } : {})}
            />
          ))}
        </div>
      </State>

      <State name={CHECKOUT_STATES.radio}>
        {[false, true].map((withError) => (
          <RadioChipGroup
            id={`gallery-place-${String(withError)}`}
            key={String(withError)}
            legend={t("placeKind.legend")}
            name={`place-${String(withError)}`}
            options={PLACE_KINDS.map((kind) => ({
              value: kind,
              label: t(`placeKind.${kind}`),
            }))}
            required
            {...(withError
              ? { error: t("error.placeKindInvalid") }
              : { defaultValue: "home" })}
          />
        ))}
      </State>

      <State name={CHECKOUT_STATES.textArea}>
        <div className="grid max-w-[640px] gap-[24px]">
          <TextAreaWithCounter
            counterTemplate={counter(cardMax)}
            hint={t("card.blank")}
            id="gallery-card-blank"
            label={t("card.label")}
            max={cardMax}
            name="card-blank"
            optionalLabel={optional}
            {...counted("")}
          />
          <TextAreaWithCounter
            counterTemplate={counter(cardMax)}
            defaultValue={CHECKOUT_CARD_MESSAGE}
            hint={t("card.blank")}
            id="gallery-card-typed"
            label={t("card.label")}
            max={cardMax}
            name="card-typed"
            optionalLabel={optional}
            preview={{
              label: t("card.previewLabel"),
              printed: t("card.preview"),
              signature: CHECKOUT_SIGN_AS,
            }}
            {...counted(CHECKOUT_CARD_MESSAGE)}
          />
          <TextAreaWithCounter
            counterTemplate={counter(cardMax)}
            defaultValue={CHECKOUT_CARD_TOO_LONG}
            error={t("error.tooLong", { max: cardMax })}
            id="gallery-card-over"
            label={t("card.label")}
            max={cardMax}
            name="card-over"
            optionalLabel={optional}
            {...counted(CHECKOUT_CARD_TOO_LONG)}
          />
        </div>
      </State>

      <State name={CHECKOUT_STATES.errors}>
        <div className="max-w-[640px]">
          <ErrorSummary
            focusOnMount={false}
            id="gallery-errors-static"
            items={errorItems}
            title={t("error.summaryTitle")}
          />
        </div>
      </State>

      <State name={CHECKOUT_STATES.notices}>
        <div className="grid max-w-[640px] gap-[14px]">
          <PriceChangedNotice
            confirmLabel={(current) => t("price.confirm", { new: current })}
            current={CHECKOUT_REDERIVED_TOTAL}
            locale={locale}
            message={(amounts) =>
              t.rich("price.changed", {
                old: amounts.previous,
                new: amounts.current,
                b: (chunks) => <b>{chunks}</b>,
              })
            }
            previous={CHECKOUT_TOTAL}
          />
          <InlinePrivacyNotice
            action={<SampleDetailsButton label={t("demo.useSample")} />}
            message={privacy}
          />
        </div>
      </State>

      <State name={CHECKOUT_STATES.place}>
        <div className="grid max-w-[360px] gap-[12px]">
          <PlaceOrderButton
            label={t("demo.place")}
            pendingLabel={t("demo.placing")}
          />
          <PlaceOrderButton
            forcePending
            label={t("demo.place")}
            pendingLabel={t("demo.placing")}
          />
        </div>
      </State>

      <State name={CHECKOUT_STATES.panel}>
        <div className="grid items-start gap-[24px] lg:grid-cols-3">
          <OrderSummaryPanel {...panel} id="gallery-summary-1" />
          <OrderSummaryPanel
            {...panel}
            card={{
              message: CHECKOUT_CARD_MESSAGE,
              signature: CHECKOUT_SIGN_AS,
            }}
            id="gallery-summary-2"
          />
          <OrderSummaryPanel
            {...panel}
            action={
              <PlaceOrderButton
                label={t("demo.place")}
                pendingLabel={t("demo.placing")}
              />
            }
            currencyLine={t("price.currencyLine", {
              buyerCurrency: CHECKOUT_TOTAL.currency,
              destinationCurrency: "PLN",
            })}
            id="gallery-summary-3"
            lines={lines.filter((line) => line.id !== "vat")}
            vatLines={[
              {
                id: "vat-800",
                label: t("summary.vatOf", { rate }),
                money: CHECKOUT_VAT,
              },
            ]}
          />
        </div>
        <div className="max-w-[390px]">
          <OrderSummaryMini
            label={t("summary.mini", { product: PRODUCT_NAME })}
            locale={locale}
            total={CHECKOUT_TOTAL}
          />
        </div>
      </State>

      <State name={CHECKOUT_STATES.sticky}>
        <div className="grid gap-[12px]">
          <StickyTotalBar
            action={
              <SubmitButton form={ids.inert} size="bar">
                {t("action.toCard")}
              </SubmitButton>
            }
            inPlace
            locale={locale}
            total={CHECKOUT_TOTAL}
            totalLabel={t("summary.total")}
          />
          <StickyTotalBar
            action={
              <SubmitButton form={ids.inert} size="bar">
                {t("action.toReview")}
              </SubmitButton>
            }
            inPlace
            locale={locale}
            total={CHECKOUT_TOTAL}
            totalLabel={t("summary.total")}
          />
          <StickyTotalBar
            inPlace
            locale={locale}
            total={CHECKOUT_REDERIVED_TOTAL}
            totalLabel={t("summary.total")}
          />
        </div>
      </State>

      <State name={CHECKOUT_STATES.confirmation}>
        <div className="max-w-[440px]">
          <ConfirmationRecap
            card={{
              message: CHECKOUT_CARD_MESSAGE,
              signature: CHECKOUT_SIGN_AS,
            }}
            date={longDate}
            item={{ name: PRODUCT_NAME, details: [tierLabel] }}
            labels={{
              recipient: c("recap.recipient"),
              date: c("recap.date"),
              card: c("recap.card"),
            }}
            locale={locale}
            note={c("recap.nothingCharged")}
            recipient={{
              name: sample.fullName ?? "",
              address: `${sample.street ?? ""}, ${sample.postcode ?? ""} ${city}`,
            }}
            title={t("summary.title")}
            total={CHECKOUT_TOTAL}
            totalLabel={t("summary.total")}
          />
        </div>
      </State>

      <State name={CHECKOUT_STATES.live}>
        <form
          className="bg-card shadow-letter rounded-letter grid max-w-[640px] gap-[18px] px-[34px] pt-[30px] pb-[32px] max-md:px-[18px]"
          id={ids.form}
          noValidate
        >
          <CheckoutErrorDemo
            buttonId={ids.showErrors}
            buttonLabel={CHECKOUT_STATES.showErrors}
            items={errorItems}
            summaryId={ids.summary}
            title={t("error.summaryTitle")}
          />
          <TextField
            autoComplete="name"
            bidiIsolate
            clientMessages={{ required }}
            id={ids.name}
            label={t("address.fullName")}
            name="fullName"
            required
          />
          <TextField
            autoComplete="postal-code"
            clientMessages={{
              required,
              format: t("error.postcodeFormat", { example: "00-001" }),
            }}
            id={ids.postcode}
            inputMode="numeric"
            label={t("address.postcode")}
            name="postcode"
            pattern="\d{2}-?\d{3}"
            required
          />
          <TextAreaWithCounter
            counterTemplate={counter(cardMax)}
            hint={t("card.blank")}
            id={ids.card}
            label={t("card.label")}
            max={cardMax}
            name="cardMessage"
            optionalLabel={optional}
            preview={{
              label: t("card.previewLabel"),
              printed: t("card.preview"),
              signatureFieldId: ids.signAs,
            }}
            {...counted("")}
          />
          <TextField
            hint={t("card.signAsHint", { max: CHECKOUT_LIMITS.signAs })}
            id={ids.signAs}
            label={t("card.signAs")}
            maxLength={CHECKOUT_LIMITS.signAs}
            name="signAs"
            optionalLabel={optional}
          />
          <TextField
            autoComplete="email"
            clientMessages={{ required, format: t("error.emailInvalid") }}
            id="gallery-checkout-email"
            inputMode="email"
            label={t("buyer.email")}
            name="email"
            required
            type="email"
          />
          <TextField
            autoComplete="name"
            id="gallery-checkout-buyer"
            label={t("buyer.fullName")}
            name="buyerName"
            required
          />
          <BlurValidation formId={ids.form} />
        </form>
      </State>
    </div>
  );
}
