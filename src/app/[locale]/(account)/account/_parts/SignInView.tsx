/**
 * `/{locale}/account` without a buyer session (`account-sign-in-*`; spec 018 §14 C.5, C.15,
 * AC-24, AC-48, AC-51; TASK-344): one white letter, 480 px, centred. "Your account", the
 * sentence, the email field and "Email me a link", then "You never need an account to order." The
 * form posts the address, the page's locale and an admitted return path to
 * `/api/auth/buyer/request`, which answers every address with the same `303` to `?state=sent`.
 *
 * States, from `?state=` alone: `sent` (the same page for every address: the sentence and the
 * guest note, no form), `expired` and `signed-out` (a notice above the form), `invalid` (the field
 * error, linked by `aria-describedby`). No address is ever in a URL.
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { LocaleCode } from "@/config/locales";
import { BUYER_AUTH_PATHS } from "@/lib/auth/buyer";
import {
  FIELD,
  FIELD_ERROR,
  FIELD_ERROR_MARK,
  FIELD_LABEL,
  INPUT,
  buttonClass,
} from "@/modules/ui/checkout/styles";
import { PAGE_FRAME } from "@/modules/ui/primitives/layout";

export type SignInPageState = "sent" | "expired" | "signed-out" | "invalid";

const LETTER =
  "bg-card mx-auto grid w-full max-w-[480px] gap-[16px] rounded-(--radius-letter) px-[20px] pt-[26px] pb-[28px] shadow-(--shadow-letter) md:px-[36px] md:pt-[34px] md:pb-[36px]";
const NOTICE =
  "bg-paper-2 rounded-field text-ui text-ink m-0 px-[16px] py-[12px]";
const ERROR_ID = "account-email-error";

export async function SignInView({
  locale,
  state,
  returnTo,
}: {
  readonly locale: LocaleCode;
  readonly state: SignInPageState | undefined;
  /** An admitted return path (`isBuyerReturnPath`), carried in the form. */
  readonly returnTo: string | undefined;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "auth" });
  const invalid = state === "invalid";
  return (
    <main
      className={`${PAGE_FRAME} pt-[28px] pb-[64px] md:pt-[64px]`}
      data-fo-account="sign-in"
      data-fo-account-state={state ?? "form"}
      id="main"
    >
      <div className={LETTER}>
        <h1 className="display text-3xl-fluid m-0 leading-[1.08]">
          {t("account.title")}
        </h1>
        {state === "sent" ? (
          <p className="text-ink-2 m-0" role="status">
            {t("account.sent")}
          </p>
        ) : (
          <>
            {state === "expired" ? (
              <p className={NOTICE} role="status">
                {t("account.expired")}
              </p>
            ) : null}
            {state === "signed-out" ? (
              <p className={NOTICE} role="status">
                {t("account.signedOut")}
              </p>
            ) : null}
            {state === "expired" ? null : (
              <p className="text-ink-2 m-0">{t("account.intro")}</p>
            )}
            <form
              action={BUYER_AUTH_PATHS.request}
              className="grid gap-[16px]"
              method="post"
            >
              <input name="locale" type="hidden" value={locale} />
              {returnTo === undefined ? null : (
                <input name="return" type="hidden" value={returnTo} />
              )}
              <div className={FIELD}>
                <label className={FIELD_LABEL} htmlFor="account-email">
                  {t("account.email")}
                </label>
                <input
                  aria-describedby={invalid ? ERROR_ID : undefined}
                  aria-invalid={invalid ? true : undefined}
                  autoComplete="email"
                  className={INPUT}
                  id="account-email"
                  inputMode="email"
                  maxLength={254}
                  name="email"
                  required
                  type="email"
                />
                {invalid ? (
                  <p className={FIELD_ERROR} id={ERROR_ID}>
                    <span aria-hidden="true" className={FIELD_ERROR_MARK} />
                    {t("account.emailInvalid")}
                  </p>
                ) : null}
              </div>
              <button
                className={buttonClass("primary", "md", "w-full")}
                type="submit"
              >
                {t("account.submit")}
              </button>
            </form>
          </>
        )}
        <p className="text-ink-3 m-0 text-sm">{t("account.guestNote")}</p>
      </div>
    </main>
  );
}
