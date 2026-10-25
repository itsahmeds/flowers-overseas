/**
 * The country chooser page (spec 004 §14 A-founder-2026-10-24a item 3, AC-77, AC-78;
 * `docs/design/wireframes/choose-country-desktop.dc.html` and `-mobile`; TASK-385).
 *
 * A normal page, never a modal or an interstitial: the route's header, then `<main>` with the
 * chooser's form, whose label is the page's `<h1>`. No `role="dialog"`, no `aria-modal`, no
 * product card and no price. It works with JavaScript off, and it never forwards on its own: with a
 * remembered country it answers 200 with "Continue to {country}" first.
 *
 * The no-match state (a typed name that names no registry country) adds, under the form, the line
 * with what was typed, "Did you mean" with the closest names, and every shop country grouped by
 * the registry's region, each a path-form link (`/{locale}/{chooseSegment}/{iso2}/{next}`) with
 * `rel="nofollow"`. A registry country outside the shop set shows the same grouped list until
 * TASK-395's not-live page replaces that state.
 *
 * Every string is a message key; country and region names come from the registry's keys.
 */
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import type { LocaleCode } from "@/config/locales";
import { formatList } from "@/modules/i18n";
import { Container, CountryPicker } from "@/modules/ui";

import type { ChooserCountryView, ChooserPageView } from "../chooser-choice";

import { localeCode, registryLabel } from "./labels";

export interface ChooserPageProps {
  readonly view: ChooserPageView;
}

/** Private-use markers a list of names is formatted around, so each name can become a link. */
const OPEN = "";
const CLOSE = "";

/** "Spain, Sweden or Slovakia", with each name a link, in the locale's own list grammar. */
function linkedList(
  countries: readonly ChooserCountryView[],
  locale: LocaleCode,
): ReactNode[] {
  const text = formatList(
    countries.map((_, index) => `${OPEN}${String(index)}${CLOSE}`),
    locale,
    "disjunction",
  );
  return text
    .split(new RegExp(`${OPEN}(\\d+)${CLOSE}`, "u"))
    .map((part, index) => {
      if (index % 2 === 0) return part;
      const country = countries[Number(part)];
      return country === undefined ? null : (
        <a
          key={country.code}
          className="link"
          href={country.href}
          rel="nofollow"
          data-fo-choose-closest={country.code}
        >
          {country.name}
        </a>
      );
    });
}

export function ChooserPage({ view }: ChooserPageProps): ReactElement {
  const t = useTranslations();
  const locale = localeCode(useLocale());
  const { state } = view;
  return (
    <Container
      as="main"
      id="main"
      className="pt-[24px] pb-[48px] md:pt-[40px] md:pb-[80px]"
      data-fo-chooser={state.kind}
    >
      <div
        className={`grid max-w-[720px] ${state.kind === "noMatch" ? "gap-[18px]" : "gap-[22px]"}`}
      >
        <CountryPicker
          action={view.action}
          variant="page"
          idPrefix="ch"
          label={t("home.picker.label")}
          searchLabel={t("home.picker.search")}
          submitLabel={t("home.picker.submit")}
          rememberLine={t("shop.choose.remember")}
          continueTo={
            view.remembered === undefined
              ? undefined
              : {
                  code: view.remembered.code,
                  name: view.remembered.name,
                  label: t("shop.choose.continue", {
                    country: view.remembered.name,
                  }),
                }
          }
          chips={view.chips}
          datalist={view.datalist}
          typed={state.kind === "noMatch" ? state.query : undefined}
        />
        {state.kind === "noMatch" ? (
          <div
            role="status"
            className="rounded-field border-danger bg-blush text-ink grid gap-[6px] border-s-[4px] border-solid px-[16px] py-[14px] text-sm"
            data-fo-choose-no-match=""
          >
            <b>{t("shop.choose.noMatch", { query: state.query })}</b>
            {view.closest.length === 0 ? null : (
              <span>
                {t.rich("shop.choose.closest", {
                  countries: () => linkedList(view.closest, locale),
                })}
              </span>
            )}
          </div>
        ) : null}
      </div>
      {view.regions.length === 0 ? null : (
        <section
          aria-labelledby="ch-all"
          className="mt-[28px]"
          data-fo-choose-all=""
        >
          <h2 id="ch-all" className="eyebrow mb-[8px]">
            {t("shop.choose.all")}
          </h2>
          <div className="grid grid-cols-1 gap-[20px] md:grid-cols-3 md:gap-[32px]">
            {view.regions.map((region) => (
              <div key={region.region}>
                <h3 className="text-ink-3 mb-[4px] block text-xs font-bold tracking-[0.12em] uppercase">
                  {registryLabel(t, region.headingKey)}
                </h3>
                <ul className="m-0 grid list-none gap-[2px] p-0">
                  {region.countries.map((country) => (
                    <li key={country.code}>
                      <a
                        className="border-rule text-ink text-ui flex min-h-(--target-min) items-center border-b border-solid no-underline"
                        href={country.href}
                        rel="nofollow"
                        data-fo-choose-country={country.code}
                      >
                        {country.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
