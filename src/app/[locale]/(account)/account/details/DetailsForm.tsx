"use client";

/**
 * The details form (`account-details-*` "the form", "validation errors", "saved"; spec 018 §14
 * C.7.2, C.16 accessibility; AC-53; TASK-352). An island only because `useActionState` keeps a
 * refused post's values and errors on the page: with JavaScript off, Next renders the page again
 * with the action's answer, so the form works either way.
 *
 * One white letter, two columns of fields from `md`, one on the phone: the email read-only with
 * its note across both columns, then name, phone ("optional"), country of residence, the email
 * language and the currency, native selects. The error summary takes focus and links to each
 * field; each field's message is tied by `aria-describedby`. "Saved." is a polite status line.
 * Every word arrives translated from the server component; this file holds none.
 */
import { useActionState, type ReactElement } from "react";

import { ErrorSummary } from "@/modules/ui/checkout/ErrorSummary";
import {
  SelectField,
  type SelectOption,
} from "@/modules/ui/checkout/SelectField";
import {
  FIELD,
  FIELD_HINT,
  FIELD_LABEL,
  INPUT,
  buttonClass,
} from "@/modules/ui/checkout/styles";
import { TextField } from "@/modules/ui/checkout/TextField";

import {
  detailsFieldId,
  type DetailsField,
  type DetailsFormState,
  type DetailsValues,
} from "./details-fields";

export interface DetailsFormLabels {
  readonly email: string;
  readonly emailNote: string;
  readonly name: string;
  readonly phone: string;
  readonly optional: string;
  readonly country: string;
  readonly language: string;
  readonly currency: string;
  readonly save: string;
  readonly saved: string;
  readonly summaryTitle: string;
}

export interface DetailsFormProps {
  readonly action: (
    state: DetailsFormState,
    form: FormData,
  ) => Promise<DetailsFormState>;
  readonly email: string;
  readonly defaults: DetailsValues;
  readonly labels: DetailsFormLabels;
  readonly countries: readonly SelectOption[];
  readonly languages: readonly SelectOption[];
  readonly currencies: readonly SelectOption[];
}

const INITIAL: DetailsFormState = {
  status: "idle",
  attempt: 0,
  values: null,
  errors: [],
};

const CARD =
  "bg-card grid gap-[14px] rounded-(--radius-letter) px-[16px] pt-[20px] pb-[22px] shadow-(--shadow-letter) md:gap-[18px] md:px-[30px] md:pt-[26px] md:pb-[28px]";

export function DetailsForm({
  action,
  email,
  defaults,
  labels,
  countries,
  languages,
  currencies,
}: DetailsFormProps): ReactElement {
  const [state, formAction] = useActionState(action, INITIAL);
  const values = state.values ?? defaults;
  const errorOf = (field: DetailsField): { error?: string } => {
    const found = state.errors.find((item) => item.field === field);
    return found === undefined ? {} : { error: found.message };
  };
  const summary = state.errors.map((item) => ({
    fieldId: item.fieldId,
    text: item.summary,
  }));
  return (
    <form
      action={formAction}
      className="grid gap-[16px]"
      data-fo-account-details=""
      key={state.attempt}
      noValidate
    >
      {state.status === "saved" ? (
        <p
          className="text-ink m-0 font-bold"
          data-fo-account-saved=""
          role="status"
        >
          {labels.saved}
        </p>
      ) : null}
      <ErrorSummary
        attempt={state.attempt}
        id="details-errors"
        items={summary}
        title={labels.summaryTitle}
      />
      <div className={CARD}>
        <div className="grid gap-[16px] md:grid-cols-2 md:gap-x-[20px]">
          <div className={`${FIELD} md:col-span-2`}>
            <label className={FIELD_LABEL} htmlFor="details-email">
              {labels.email}
            </label>
            <input
              aria-describedby="details-email-note"
              className={`${INPUT} bg-paper-2 border-dashed`}
              id="details-email"
              readOnly
              type="email"
              value={email}
            />
            <p className={FIELD_HINT} id="details-email-note">
              {labels.emailNote}
            </p>
          </div>
          <TextField
            autoComplete="name"
            bidiIsolate
            defaultValue={values.buyerName}
            id={detailsFieldId("buyerName")}
            label={labels.name}
            name="buyerName"
            required
            {...errorOf("buyerName")}
          />
          <TextField
            autoComplete="tel"
            defaultValue={values.buyerPhone}
            id={detailsFieldId("buyerPhone")}
            inputMode="tel"
            label={labels.phone}
            name="buyerPhone"
            optionalLabel={labels.optional}
            type="tel"
            {...errorOf("buyerPhone")}
          />
          <SelectField
            autoComplete="country"
            defaultValue={values.residenceCountry}
            id={detailsFieldId("residenceCountry")}
            label={labels.country}
            name="residenceCountry"
            options={
              values.residenceCountry === ""
                ? [{ value: "", label: labels.country }, ...countries]
                : countries
            }
            required
            {...errorOf("residenceCountry")}
          />
          <SelectField
            defaultValue={values.preferredLocale}
            id={detailsFieldId("preferredLocale")}
            label={labels.language}
            name="preferredLocale"
            options={languages}
            required
            {...errorOf("preferredLocale")}
          />
          <SelectField
            defaultValue={values.preferredCurrency}
            id={detailsFieldId("preferredCurrency")}
            label={labels.currency}
            name="preferredCurrency"
            options={currencies}
            required
            {...errorOf("preferredCurrency")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-[18px] gap-y-[10px]">
          <button
            className={buttonClass("primary", "sm", "px-[24px] max-md:flex-1")}
            type="submit"
          >
            {labels.save}
          </button>
        </div>
      </div>
    </form>
  );
}
