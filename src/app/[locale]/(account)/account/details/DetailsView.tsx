/**
 * `account-details-*` (spec 018 §14 A-founder-2026-10-22 C.7.2, C.13; AC-53; TASK-352): the
 * account frame with Your details current, the H1, the details form (`DetailsForm`, the one
 * island) and, as a separate card, "Sign out on all devices" with a ghost button, so it is never
 * pressed by accident beside Save. The country list is every country (ADR-0006: residence decides
 * invoicing and payment methods, never access), sorted by its name in the page's language; the
 * languages are the launch locales by their own names; the currencies the switcher offers, as
 * "GBP · British pound". Every word from the catalogues.
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { launchLocales, localeConfig, type LocaleCode } from "@/config/locales";
import { PHASE_0_DISPLAY_CURRENCIES } from "@/modules/catalog/static";
import { residenceCountryCodes } from "@/modules/checkout";
import { formatCurrencyName, formatRegionName, sortBy } from "@/modules/i18n";
import { buttonClass } from "@/modules/ui/checkout/styles";

import { AccountShell } from "../_parts/AccountShell";
import { saveDetailsAction, signOutEverywhereAction } from "./actions";
import type { DetailsValues } from "./details-fields";
import { DetailsForm } from "./DetailsForm";

const CARD =
  "bg-card grid gap-[14px] rounded-(--radius-letter) px-[16px] pt-[20px] pb-[22px] shadow-(--shadow-letter) md:gap-[18px] md:px-[30px] md:pt-[26px] md:pb-[28px]";

export async function DetailsView({
  locale,
  email,
  defaults,
}: {
  readonly locale: LocaleCode;
  readonly email: string;
  readonly defaults: DetailsValues;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "account" });
  const c = await getTranslations({ locale, namespace: "checkout" });
  const countries = sortBy(
    residenceCountryCodes().map((code) => ({
      value: code,
      label: formatRegionName(code, locale),
    })),
    locale,
    (entry) => entry.label,
  );
  const languages = launchLocales.map((code) => ({
    value: code,
    label: localeConfig(code).nativeName,
  }));
  const currencies = PHASE_0_DISPLAY_CURRENCIES.map((code) => ({
    value: code,
    label: t("details.currencyOption", {
      code,
      name: formatCurrencyName(code, locale),
    }),
  }));
  return (
    <AccountShell current="details" locale={locale}>
      <div className="grid gap-[22px]" data-fo-account="details">
        <h1 className="display text-2xl-fluid m-0 leading-[1.08] max-md:text-(length:--text-2xl-s)">
          {t("details.title")}
        </h1>
        <DetailsForm
          action={saveDetailsAction.bind(null, locale)}
          countries={countries}
          currencies={currencies}
          defaults={defaults}
          email={email}
          labels={{
            email: c("buyer.email"),
            emailNote: t("details.emailNote"),
            name: c("buyer.fullName"),
            phone: c("buyer.phone"),
            optional: c("field.optional"),
            country: c("buyer.country"),
            language: t("details.language"),
            currency: t("details.currency"),
            save: t("details.save"),
            saved: t("details.saved"),
            summaryTitle: c("error.summaryTitle"),
          }}
          languages={languages}
        />
        <section
          aria-labelledby="details-sign-out-everywhere"
          className={CARD}
          data-fo-account-sign-out-everywhere=""
        >
          <h2
            className="display m-0 text-lg leading-[1.15]"
            id="details-sign-out-everywhere"
          >
            {t("details.signOutEverywhere")}
          </h2>
          <p className="text-ink-2 m-0 text-sm leading-[1.45]">
            {t("details.signOutEverywhereNote")}
          </p>
          <form
            action={signOutEverywhereAction.bind(null, locale)}
            className="flex flex-wrap items-center gap-x-[18px] gap-y-[10px]"
          >
            <button
              className={buttonClass("ghost", "sm", "px-[24px] max-md:flex-1")}
              type="submit"
            >
              {t("details.signOutEverywhere")}
            </button>
          </form>
        </section>
      </div>
    </AccountShell>
  );
}
