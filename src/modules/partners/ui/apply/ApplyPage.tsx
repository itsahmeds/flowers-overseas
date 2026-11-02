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
 * the notice beside it. The form itself is `ApplyForm.tsx`, the page's one client island (its
 * `useActionState` carries the server action's answer, JavaScript on or off; TASK-213): this file
 * resolves every string it draws and hands it the action bound to the locale.
 *
 * Every word is a `forFlorists.apply.*` key, which renders only on this `noindex` page and is
 * therefore outside the unreviewed share (`review-scope.ts`, check 11): nothing on an indexable
 * page imports this file. A server component; its only client JavaScript is the form island.
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import {
  type Company,
  COMPANY,
  controllerName,
  whatsappHref,
} from "@/config/company";
import { COUNTRIES } from "@/config/countries";
import {
  type ApplicationFormState,
  FLORIST_LANGUAGES,
} from "@/config/florists";
import { infoPageExists, infoPagePath, infoPageView } from "@/modules/content";
import { sortBy } from "@/modules/i18n";
import { Button } from "@/modules/ui";

import { label, localeCode } from "../inbox/format.ts";
import { APPLICATION_ERROR_KEYS } from "../../application/schema.ts";
import type { ApplyFormState } from "../../application/state.ts";
import { PageHeadBand } from "../public/PageHead.tsx";

import {
  ApplyForm,
  type ApplyFormAction,
  type ApplyFormCopy,
} from "./ApplyForm.tsx";

export interface ApplyPageProps {
  readonly locale: string;
  readonly form: ApplicationFormState;
  readonly company?: Company;
  /** The server action bound to the locale (TASK-213); absent in unit tests and the gallery. */
  readonly action?: ApplyFormAction;
  /** A refused post's state, drawn without posting (unit tests and the gallery). */
  readonly initialState?: ApplyFormState;
}

type T = Awaited<ReturnType<typeof getTranslations>>;

/** A placeholder no translation contains, swapped for the linked phone number. */
const PHONE_SLOT = "\u0000phone\u0000";

/** "… call or message us on {phoneDisplay}." with the number linked (`tel:`), as the artboard. */
function phoneNotice(t: T, key: string, company: Company): ReactElement {
  const [before = "", after = ""] = label(t, key, {
    phoneDisplay: PHONE_SLOT,
  }).split(PHONE_SLOT);
  return (
    <p className="m-0">
      {before}
      <a
        className="text-link font-bold underline underline-offset-4"
        href={`tel:${company.contact.phoneE164}`}
      >
        {company.contact.phoneDisplay}
      </a>
      {after}
      {company.contact.whatsapp ? (
        <>
          {" "}
          <a
            className="text-link font-bold underline underline-offset-4"
            href={whatsappHref(company.contact)}
          >
            {label(t, "company.support.whatsapp")}
          </a>
        </>
      ) : null}
    </p>
  );
}

/**
 * Every string the form island draws, resolved here (the island carries no catalogue). Each key is
 * written out in full, so `pnpm i18n:check` sees it used.
 */
function applyFormCopy(t: T): ApplyFormCopy {
  const l = (key: string): string => label(t, key);
  return {
    optional: l("forFlorists.apply.optional"),
    errorSummary: l("forFlorists.apply.errorSummary"),
    honeypot: l("forFlorists.apply.honeypot"),
    shopName: {
      label: l("forFlorists.apply.field.shopName.label"),
      help: l("forFlorists.apply.field.shopName.help"),
    },
    contactName: { label: l("forFlorists.apply.field.contactName.label") },
    email: { label: l("forFlorists.apply.field.email.label") },
    phone: {
      label: l("forFlorists.apply.field.phone.label"),
      help: l("forFlorists.apply.field.phone.help"),
    },
    country: {
      label: l("forFlorists.apply.field.country.label"),
      choose: l("forFlorists.apply.field.country.choose"),
    },
    town: { label: l("forFlorists.apply.field.town.label") },
    capacity: {
      label: l("forFlorists.apply.field.capacity.label"),
      help: l("forFlorists.apply.field.capacity.help"),
    },
    area: {
      label: l("forFlorists.apply.field.area.label"),
      help: l("forFlorists.apply.field.area.help"),
    },
    weekends: {
      legend: l("forFlorists.apply.field.weekends.label"),
      options: [
        { value: "yes", label: l("forFlorists.apply.field.weekends.yes") },
        {
          value: "sometimes",
          label: l("forFlorists.apply.field.weekends.sometimes"),
        },
        { value: "no", label: l("forFlorists.apply.field.weekends.no") },
      ],
    },
    registration: {
      label: l("forFlorists.apply.field.registration.label"),
      help: l("forFlorists.apply.field.registration.help"),
    },
    website: { label: l("forFlorists.apply.field.website.label") },
    contactBy: {
      legend: l("forFlorists.apply.field.contactBy.label"),
      options: [
        { value: "email", label: l("forFlorists.apply.field.contactBy.email") },
        {
          value: "whatsapp",
          label: l("forFlorists.apply.field.contactBy.whatsapp"),
        },
        { value: "phone", label: l("forFlorists.apply.field.contactBy.phone") },
      ],
    },
    language: {
      legend: l("forFlorists.apply.field.language.label"),
      options: [
        { value: "en", label: l("forFlorists.apply.field.language.en") },
        { value: "pl", label: l("forFlorists.apply.field.language.pl") },
        { value: "de", label: l("forFlorists.apply.field.language.de") },
      ],
    },
    errors: Object.fromEntries(
      Object.values(APPLICATION_ERROR_KEYS).map((key) => [key, l(key)]),
    ),
  };
}

function ApplyFormSection({
  t,
  locale,
  company,
  action,
  initialState,
}: {
  readonly t: T;
  readonly locale: string;
  readonly company: Company;
  readonly action: ApplyFormAction | undefined;
  readonly initialState: ApplyFormState | undefined;
}): ReactElement {
  const language = (FLORIST_LANGUAGES as readonly string[]).includes(
    locale.slice(0, 2),
  )
    ? locale.slice(0, 2)
    : "en";
  const countries = sortBy(COUNTRIES, localeCode(locale), (country) =>
    label(t, country.nameKey),
  ).map((country) => ({
    value: country.iso2,
    label: label(t, country.nameKey),
  }));
  return (
    <ApplyForm
      {...(action === undefined ? {} : { action })}
      {...(initialState === undefined ? {} : { initialState })}
      copy={applyFormCopy(t)}
      countries={countries}
      defaultLanguage={language}
      failedNotice={phoneNotice(t, "forFlorists.apply.failed", company)}
      tooManyNotice={phoneNotice(t, "forFlorists.apply.tooMany", company)}
      submit={
        <Button
          type="submit"
          className="min-h-[56px] max-md:w-full md:justify-self-start"
        >
          {label(t, "forFlorists.apply.submit")}
        </Button>
      }
    />
  );
}

export async function ApplyPage({
  locale,
  form,
  company = COMPANY,
  action,
  initialState,
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
            // The company, never a person: the site names no one (spec 041 §14
            // A-founder-2026-10-23 clause 4; `controllerName()` is the cookie notice's rule too).
            name: controllerName(company),
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
          <ApplyFormSection
            t={t}
            locale={locale}
            company={company}
            action={action}
            initialState={initialState}
          />
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
