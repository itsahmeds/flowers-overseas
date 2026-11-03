/**
 * @purpose Tracking lookup page body and form
 * @spec 018
 *
 * The lookup (spec 018 §5.3 `track`, AC-8; `track-order-desktop.dc.html` and `-mobile`, "the
 * lookup" and "the lookup after submission"; TASK-339): "Find your order", the sentence, and the
 * form letter with the order reference and the email you ordered with. After a submission the
 * page adds the one sent message, "If that order exists, we have emailed its link to the address
 * it was placed with.", in a `role="status"` box: the same words for a match, a wrong email, an
 * unknown reference and an over-limit request, because the page is drawn from `sent` alone.
 *
 * `LookupForm` is the form on its own, so the not-working page (TASK-338) offers the same one;
 * both pages await it and place the element, as every async part of these bodies is placed. It
 * posts to `lookupTrackingAction` (`./actions.ts`), a server action bound to the page's locale:
 * the fields travel in the body, never in the address, and the form works with JavaScript off.
 * Server Components only; every word from the `trackLookup` catalogue.
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { LocaleCode } from "@/config/locales";
import {
  FIELD,
  FIELD_LABEL,
  INPUT,
  buttonClass,
} from "@/modules/ui/checkout/styles";
import { PAGE_FRAME } from "@/modules/ui/primitives/layout";

import { lookupTrackingAction } from "./actions";

export async function LookupForm({
  locale,
}: {
  readonly locale: LocaleCode;
}): Promise<ReactElement> {
  const form = await getTranslations({ locale, namespace: "trackLookup" });
  return (
    <form
      action={lookupTrackingAction.bind(null, locale)}
      className="bg-card mb-[56px] grid max-w-[560px] gap-[14px] rounded-(--radius-letter) px-[18px] pt-[22px] pb-[24px] shadow-(--shadow-letter) md:gap-[18px] md:px-[34px] md:pt-[30px] md:pb-[32px]"
      data-fo-track-lookup=""
    >
      <div className={FIELD}>
        <label className={FIELD_LABEL} htmlFor="track-reference">
          {form("reference")}
        </label>
        <input
          autoCapitalize="characters"
          autoComplete="off"
          className={INPUT}
          id="track-reference"
          maxLength={12}
          name="reference"
          placeholder={form("referencePlaceholder")}
          required
          spellCheck={false}
          type="text"
        />
      </div>
      <div className={FIELD}>
        <label className={FIELD_LABEL} htmlFor="track-email">
          {form("email")}
        </label>
        <input
          autoComplete="email"
          className={INPUT}
          id="track-email"
          inputMode="email"
          maxLength={254}
          name="email"
          placeholder={form("emailPlaceholder")}
          required
          type="email"
        />
      </div>
      <div>
        <button className={buttonClass("primary", "md")} type="submit">
          {form("submit")}
        </button>
      </div>
    </form>
  );
}

/** The lookup page's `<main>`: the message, the sent box after a submission, the form. */
export async function LookupPageView({
  locale,
  sent,
}: {
  readonly locale: LocaleCode;
  readonly sent: boolean;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "trackLookup" });
  return (
    <main className={PAGE_FRAME} data-fo-track="lookup" id="main">
      <div className="grid max-w-[640px] justify-items-start gap-[16px] pt-[32px] pb-[16px] md:pt-[56px] md:pb-[24px]">
        <h1 className="display text-3xl-fluid m-0 leading-[1.12]">
          {t("title")}
        </h1>
        <p className="text-ink-2 m-0 max-w-[52ch]">{t("body")}</p>
        {sent ? (
          <div
            className="bg-leaf-wash rounded-field text-ui grid gap-[8px] px-[18px] py-[16px]"
            data-fo-track-sent=""
            role="status"
          >
            <p className="text-ink-2 m-0 max-w-[52ch]">{t("sent")}</p>
          </div>
        ) : null}
      </div>
      {await LookupForm({ locale })}
    </main>
  );
}
