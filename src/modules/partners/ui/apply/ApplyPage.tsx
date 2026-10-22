/**
 * The application page (spec 011 §2 "The application form", §5.3 "Apply", §8, AC-10; artboards
 * `for-florists-apply-desktop.dc.html` and `-mobile.dc.html`, `.ap-*`, `.fm-*`; TASK-210 draws
 * both states, TASK-213 makes the form live).
 *
 * `applicationForm: "off"` (Phase 0 until the production database has §5.1's migration): **no
 * `<form>`**, the contact-first block with the phone (`tel:`) and WhatsApp (`wa.me`) links from
 * `company.ts`, and the notice at collection beside it. `"on"`: the form of §2, every field with
 * its visible label, its help text tied by `aria-describedby` and its `autocomplete` token (§8),
 * the honeypot hidden from assistive technology and the tab order, and "what happens next" and
 * the notice beside it. A plain `<form method="post">`: TASK-213 adds the server action and the
 * error, failed and too-many states.
 *
 * Every word is a `forFlorists.apply.*` key, which renders only on this `noindex` page and is
 * therefore outside the unreviewed share (`review-scope.ts`, check 11): nothing on an indexable
 * page imports this file. A server component with no client JavaScript.
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

import { type Company, COMPANY, whatsappHref } from "@/config/company";
import { COUNTRIES } from "@/config/countries";
import type { ApplicationFormState } from "@/config/florists";
import { infoPageExists, infoPagePath, infoPageView } from "@/modules/content";
import { sortBy } from "@/modules/i18n";
import { Button } from "@/modules/ui";

import { label, localeCode } from "../inbox/format.ts";
import { PageHeadBand } from "../public/PageHead.tsx";

export interface ApplyPageProps {
  readonly locale: string;
  readonly form: ApplicationFormState;
  readonly company?: Company;
}

type T = Awaited<ReturnType<typeof getTranslations>>;

const FIELD = "grid min-w-0 content-start gap-[6px]";
const LABEL = "text-ui text-ink font-bold";
const HINT = "text-ink-2 m-0 text-sm leading-(--line-height-tight)";
const INPUT =
  "bg-card text-ui text-ink min-h-[50px] w-full rounded-(--radius-field) border-(length:--rule-field) border-field-edge px-[14px] focus-visible:outline-(--focus-ring) focus-visible:outline-offset-2";

/** One labelled input with its help text, tied by `aria-describedby` (§8). */
function Field({
  id,
  label: fieldLabel,
  help,
  optional,
  wide = false,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly help?: string | undefined;
  readonly optional?: string | undefined;
  readonly wide?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      className={`${FIELD} ${wide ? "md:col-span-2" : ""}`}
      data-fo-apply-field={id}
    >
      <label className={LABEL} htmlFor={id}>
        {fieldLabel}
        {optional === undefined ? null : (
          <span className="text-ink-3 font-normal"> {optional}</span>
        )}
      </label>
      {children}
      {help === undefined ? null : (
        <p className={HINT} id={`${id}-help`}>
          {help}
        </p>
      )}
    </div>
  );
}

/** A radio group as the artboard's pills (`.fm-opts`), with its legend. */
function Choice({
  name,
  legend,
  options,
  defaultValue,
}: {
  readonly name: string;
  readonly legend: string;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly defaultValue?: string;
}): ReactElement {
  return (
    <fieldset
      className="m-0 grid min-w-0 content-start gap-[6px] border-0 p-0 md:col-span-2"
      data-fo-apply-field={name}
    >
      <legend className={`${LABEL} p-0`}>{legend}</legend>
      <div className="flex flex-wrap gap-[8px]">
        {options.map((option) => (
          <label
            className="bg-card text-ui inline-flex min-h-(--target-min) cursor-pointer items-center gap-[10px] rounded-full ps-[14px] pe-[18px] shadow-[inset_0_0_0_1.5px_var(--color-rule)] has-checked:shadow-[inset_0_0_0_2px_var(--color-selected)]"
            key={option.value}
          >
            <input
              className="accent-selected size-[18px]"
              type="radio"
              name={name}
              value={option.value}
              required
              defaultChecked={option.value === defaultValue}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ApplyForm({
  t,
  locale,
}: {
  readonly t: T;
  readonly locale: string;
}): ReactElement {
  const optional = label(t, "forFlorists.apply.optional");
  const language = ["en", "pl", "de"].includes(locale.slice(0, 2))
    ? locale.slice(0, 2)
    : "en";
  const countries = sortBy(COUNTRIES, localeCode(locale), (country) =>
    label(t, country.nameKey),
  );
  return (
    <form
      className="bg-card grid gap-[20px] rounded-(--radius-photo) px-[18px] pt-[20px] pb-[24px] shadow-[inset_0_0_0_1px_var(--color-rule),var(--shadow-sm)] md:col-span-7 md:gap-[24px] md:px-[34px] md:pt-[32px] md:pb-[34px]"
      method="post"
      noValidate
      data-fo-apply-form
    >
      <div className="grid grid-cols-1 gap-[20px] md:grid-cols-2">
        <Field
          id="ap-shop"
          label={label(t, "forFlorists.apply.field.shopName.label")}
          help={label(t, "forFlorists.apply.field.shopName.help")}
          wide
        >
          <input
            className={INPUT}
            id="ap-shop"
            name="businessName"
            autoComplete="organization"
            required
            maxLength={200}
            aria-describedby="ap-shop-help"
          />
        </Field>
        <Field
          id="ap-name"
          label={label(t, "forFlorists.apply.field.contactName.label")}
        >
          <input
            className={INPUT}
            id="ap-name"
            name="contactName"
            autoComplete="name"
            required
            maxLength={200}
          />
        </Field>
        <Field
          id="ap-email"
          label={label(t, "forFlorists.apply.field.email.label")}
        >
          <input
            className={INPUT}
            id="ap-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </Field>
        <Field
          id="ap-phone"
          label={label(t, "forFlorists.apply.field.phone.label")}
          help={label(t, "forFlorists.apply.field.phone.help")}
        >
          <input
            className={INPUT}
            id="ap-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            aria-describedby="ap-phone-help"
          />
        </Field>
        <Field
          id="ap-country"
          label={label(t, "forFlorists.apply.field.country.label")}
        >
          <select
            className={INPUT}
            id="ap-country"
            name="country"
            autoComplete="country"
            required
            defaultValue=""
          >
            <option value="" disabled>
              {label(t, "forFlorists.apply.field.country.choose")}
            </option>
            {countries.map((country) => (
              <option key={country.iso2} value={country.iso2}>
                {label(t, country.nameKey)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="ap-town"
          label={label(t, "forFlorists.apply.field.town.label")}
        >
          <input
            className={INPUT}
            id="ap-town"
            name="town"
            autoComplete="address-level2"
            required
            maxLength={120}
          />
        </Field>
        <Field
          id="ap-capacity"
          label={label(t, "forFlorists.apply.field.capacity.label")}
          help={label(t, "forFlorists.apply.field.capacity.help")}
        >
          <input
            className={INPUT}
            id="ap-capacity"
            name="capacityPerDay"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            required
            aria-describedby="ap-capacity-help"
          />
        </Field>
        <Field
          id="ap-area"
          label={label(t, "forFlorists.apply.field.area.label")}
          help={label(t, "forFlorists.apply.field.area.help")}
          wide
        >
          <textarea
            className={`${INPUT} min-h-[96px] py-[12px]`}
            id="ap-area"
            name="deliveryArea"
            required
            maxLength={1000}
            rows={3}
            aria-describedby="ap-area-help"
          />
        </Field>
        <Choice
          name="weekendDelivery"
          legend={label(t, "forFlorists.apply.field.weekends.label")}
          options={[
            {
              value: "yes",
              label: label(t, "forFlorists.apply.field.weekends.yes"),
            },
            {
              value: "sometimes",
              label: label(t, "forFlorists.apply.field.weekends.sometimes"),
            },
            {
              value: "no",
              label: label(t, "forFlorists.apply.field.weekends.no"),
            },
          ]}
        />
        <Field
          id="ap-registration"
          label={label(t, "forFlorists.apply.field.registration.label")}
          help={label(t, "forFlorists.apply.field.registration.help")}
          optional={optional}
        >
          <input
            className={INPUT}
            id="ap-registration"
            name="registrationNumber"
            autoComplete="off"
            maxLength={60}
            aria-describedby="ap-registration-help"
          />
        </Field>
        <Field
          id="ap-website"
          label={label(t, "forFlorists.apply.field.website.label")}
          optional={optional}
        >
          <input
            className={INPUT}
            id="ap-website"
            name="website"
            type="url"
            inputMode="url"
            autoComplete="url"
            maxLength={300}
          />
        </Field>
        <Choice
          name="contactPreference"
          legend={label(t, "forFlorists.apply.field.contactBy.label")}
          options={[
            {
              value: "email",
              label: label(t, "forFlorists.apply.field.contactBy.email"),
            },
            {
              value: "whatsapp",
              label: label(t, "forFlorists.apply.field.contactBy.whatsapp"),
            },
            {
              value: "phone",
              label: label(t, "forFlorists.apply.field.contactBy.phone"),
            },
          ]}
        />
        <Choice
          name="language"
          legend={label(t, "forFlorists.apply.field.language.label")}
          defaultValue={language}
          options={[
            {
              value: "en",
              label: label(t, "forFlorists.apply.field.language.en"),
            },
            {
              value: "pl",
              label: label(t, "forFlorists.apply.field.language.pl"),
            },
            {
              value: "de",
              label: label(t, "forFlorists.apply.field.language.de"),
            },
          ]}
        />
      </div>
      {/* The honeypot (§2 "Abuse controls"): hidden from sight, assistive technology and the tab
          order; a filled value answers as success and writes nothing (TASK-213). */}
      <div className="hidden" aria-hidden="true">
        <label>
          {label(t, "forFlorists.apply.honeypot")}
          <input name="hp" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Button
        type="submit"
        className="min-h-[56px] max-md:w-full md:justify-self-start"
      >
        {label(t, "forFlorists.apply.submit")}
      </Button>
    </form>
  );
}

export async function ApplyPage({
  locale,
  form,
  company = COMPANY,
}: ApplyPageProps): Promise<ReactElement> {
  const t = await getTranslations({ locale });
  const landing = infoPageView("for-florists", locale);
  const phone = company.contact.phoneDisplay;
  const privacyHref = infoPageExists("privacy", locale)
    ? infoPagePath("privacy", locale)
    : undefined;
  const crumbs = [
    {
      key: "home",
      label: t("common.homeLink"),
      href: `/${locale}`,
      current: false,
    },
    {
      key: "for-florists",
      label: t("nav.forFlorists"),
      href: infoPagePath("for-florists", locale),
      current: false,
    },
    { key: "apply", label: t("forFlorists.apply.crumb"), current: true },
  ];
  const notice = (
    <section className="grid gap-[8px]" data-fo-apply-notice>
      <h2 className="font-display text-h3 m-0 leading-[1.25] font-normal">
        {t("forFlorists.apply.notice.heading")}
      </h2>
      <p className="text-ui text-ink-2 m-0 leading-[1.5]">
        {privacyHref === undefined ? (
          t("forFlorists.apply.notice.controller", {
            representativeName: company.representative.name,
            phoneDisplay: phone,
          })
        ) : (
          <a
            className="text-link font-bold underline underline-offset-4"
            href={privacyHref}
          >
            {t("forFlorists.apply.notice.privacyLink")}
          </a>
        )}
      </p>
      <p className="text-ui text-ink-2 m-0 leading-[1.5]">
        {t("forFlorists.apply.notice.body", { phoneDisplay: phone })}
      </p>
    </section>
  );
  return (
    <div data-fo-florist-apply={form}>
      <PageHeadBand
        crumbs={crumbs}
        h1={t("forFlorists.apply.h1")}
        intro={t("forFlorists.apply.intro")}
        untranslated={landing?.untranslated ?? false}
      />
      <div className="mx-auto grid w-full max-w-[calc(var(--container-page)+2*var(--gutter))] grid-cols-1 items-start gap-y-[28px] px-(--gutter-s) pt-[24px] pb-[48px] md:grid-cols-12 md:gap-x-[clamp(24px,2.22vw,32px)] md:px-(--gutter) md:pt-[40px] md:pb-[32px]">
        {form === "on" ? (
          <ApplyForm t={t} locale={locale} />
        ) : (
          <div
            className="bg-card grid gap-[18px] rounded-(--radius-photo) px-[20px] py-[22px] shadow-[inset_0_0_0_1px_var(--color-rule),var(--shadow-sm)] md:col-span-7 md:px-[34px] md:py-[32px]"
            data-fo-apply-off
          >
            <p className="font-display text-md m-0 max-w-[34ch] leading-[1.4]">
              {t("forFlorists.apply.formOff", { phoneDisplay: phone })}
            </p>
            <div className="flex flex-wrap gap-[12px]">
              <Button
                href={`tel:${company.contact.phoneE164}`}
                className="max-md:w-full"
              >
                {phone}
              </Button>
              {company.contact.whatsapp ? (
                <Button
                  href={whatsappHref(company.contact)}
                  variant="secondary"
                  className="max-md:w-full"
                >
                  {t("company.support.whatsapp")}
                </Button>
              ) : null}
            </div>
          </div>
        )}
        <aside className="grid gap-[28px] md:sticky md:top-[24px] md:col-span-4 md:col-start-9">
          {form === "on" ? (
            <section className="bg-sage-wash grid gap-[8px] rounded-(--radius-photo) px-[22px] pt-[22px] pb-[24px]">
              <h2 className="font-display text-h3 text-ink m-0 leading-[1.25] font-normal">
                {t("forFlorists.apply.next.heading")}
              </h2>
              <p className="text-ui text-ink m-0 leading-[1.5]">
                {t("forFlorists.apply.next.body")}
              </p>
            </section>
          ) : null}
          {notice}
        </aside>
      </div>
    </div>
  );
}
