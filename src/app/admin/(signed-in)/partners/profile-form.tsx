/**
 * @purpose The florist profile form, for create and edit (AC-15)
 * @spec 012
 *
 * Legal name, city label, country, notification channel, contact email and phone, payout
 * currency and orders a day, two columns on the desktop and one at 390 (`.ad-form`). The
 * countries and currencies are the reference tables' rows, so a new country is a data row and
 * never a code change. Each field shows its own refusal from the last save; the phone hint names
 * the calling code of the florist's country.
 */
import type { ReactElement } from "react";

import { adminT } from "@/modules/admin";
import { partnerCallingCode } from "@/modules/partners";
import { AdminButton } from "@/modules/ui/admin/AdminControls";
import {
  AdminField,
  adminControlClass,
  adminFieldAria,
} from "@/modules/ui/admin/AdminData";
import { AdminQuiet } from "@/modules/ui/admin/AdminRecord";

import { type PartnerResult, fieldError } from "./view";

export interface ProfileValues {
  readonly legalName: string;
  readonly cityLabel: string;
  readonly countryIso2: string;
  readonly notificationChannel: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly payoutCurrency: string;
  readonly capacityPerDay: string;
}

export function ProfileForm({
  action,
  values,
  hidden,
  countries,
  currencies,
  result,
  submitLabel,
  note,
  withCode = false,
}: {
  readonly action: (formData: FormData) => Promise<void>;
  readonly values: ProfileValues;
  readonly hidden: Readonly<Record<string, string>>;
  readonly countries: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly currencies: readonly string[];
  readonly result: PartnerResult;
  readonly submitLabel: string;
  readonly note?: string;
  readonly withCode?: boolean;
}): ReactElement {
  const error = (field: string): string | undefined =>
    fieldError(result, "profile", field);
  const code = partnerCallingCode(values.countryIso2);
  const text = (
    field: keyof ProfileValues | "code",
    label: string,
    options: {
      readonly full?: boolean;
      readonly type?: "text" | "email" | "tel";
      readonly hint?: string | undefined;
      readonly inputMode?: "numeric";
      readonly value?: string;
    } = {},
  ): ReactElement => {
    const id = `partner-${field}`;
    const fieldErrorText = error(field);
    return (
      <AdminField
        id={id}
        label={label}
        hint={options.hint}
        error={fieldErrorText}
        full={options.full ?? false}
      >
        <input
          id={id}
          name={field}
          type={options.type ?? "text"}
          defaultValue={
            options.value ?? (field === "code" ? "" : values[field])
          }
          {...(options.inputMode === undefined
            ? {}
            : { inputMode: options.inputMode })}
          {...adminFieldAria(id, options.hint, fieldErrorText)}
          className={adminControlClass(fieldErrorText !== undefined)}
        />
      </AdminField>
    );
  };
  const select = (
    field: "countryIso2" | "notificationChannel" | "payoutCurrency",
    label: string,
    options: readonly { readonly value: string; readonly label: string }[],
  ): ReactElement => {
    const id = `partner-${field}`;
    const fieldErrorText = error(field);
    return (
      <AdminField id={id} label={label} error={fieldErrorText}>
        <select
          id={id}
          name={field}
          defaultValue={values[field]}
          {...adminFieldAria(id, undefined, fieldErrorText)}
          className={adminControlClass(fieldErrorText !== undefined)}
        >
          {values[field] === "" ? (
            <option value="">{adminT("admin.partners.profile.choose")}</option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </AdminField>
    );
  };
  return (
    <form
      action={action}
      className="bg-card grid grid-cols-1 gap-x-[16px] gap-y-[14px] rounded-[12px] px-[16px] py-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)] md:grid-cols-2 md:px-[20px] md:py-[18px]"
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {withCode
        ? text("code", adminT("admin.partners.new.code"), {
            full: true,
            hint: adminT("admin.partners.new.codeHint"),
          })
        : null}
      {text("legalName", adminT("admin.partners.profile.legalName"), {
        full: true,
      })}
      {text("cityLabel", adminT("admin.partners.profile.cityLabel"))}
      {select(
        "countryIso2",
        adminT("admin.partners.profile.country"),
        countries,
      )}
      {select("notificationChannel", adminT("admin.partners.profile.channel"), [
        { value: "email", label: adminT("admin.partners.channel.email") },
        {
          value: "whatsapp",
          label: adminT("admin.partners.channel.whatsapp"),
        },
      ])}
      {text("contactEmail", adminT("admin.partners.profile.contactEmail"), {
        type: "email",
      })}
      {text("contactPhone", adminT("admin.partners.profile.contactPhone"), {
        type: "tel",
        hint:
          code === undefined
            ? undefined
            : adminT("admin.partners.profile.phoneHint", {
                callingCode: code,
              }),
      })}
      {select(
        "payoutCurrency",
        adminT("admin.partners.profile.currency"),
        currencies.map((currency) => ({ value: currency, label: currency })),
      )}
      {text("capacityPerDay", adminT("admin.partners.profile.capacity"), {
        inputMode: "numeric",
      })}
      <div className="col-span-full flex flex-wrap items-center gap-[10px]">
        <AdminButton>{submitLabel}</AdminButton>
        {note === undefined ? null : <AdminQuiet>{note}</AdminQuiet>}
      </div>
    </form>
  );
}
