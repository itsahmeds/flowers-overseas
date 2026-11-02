/**
 * The checkout's header (spec 010 §5.3; TASK-204; artboards `checkout-{desktop,mobile}.dc.html`):
 * the logo and, from `md`, the help line, nothing else. No navigation, no notice bar, no
 * language row: a buyer in the middle of an order has one way forward and one way to ask.
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { COMPANY, whatsappHref } from "@/config/company";
import { type LocaleCode } from "@/config/locales";
import { Mark, PAGE_FRAME, Wordmark } from "@/modules/ui";

export async function CheckoutHeader({
  locale,
}: {
  readonly locale: LocaleCode;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale });
  const { contact, tradingName } = COMPANY;
  return (
    <header
      className="border-rule bg-surface border-b"
      data-fo-checkout-header=""
    >
      <div
        className={`flex min-h-[64px] items-center gap-(--space-sm2) xl:min-h-[82px] xl:gap-(--space-lg2) ${PAGE_FRAME}`}
      >
        <a
          className="text-logo-ink inline-flex min-h-(--target-min) min-w-0 items-center gap-[10px]"
          href={`/${locale}`}
        >
          <Mark className="h-[28px] w-[28px] flex-none xl:h-[38px] xl:w-[38px]" />
          <Wordmark
            className="h-[19px] min-w-0 shrink xl:h-[25px]"
            label={tradingName}
          />
        </a>
        <a
          className="text-link hover:text-link-strong ms-auto inline-flex min-h-(--target-min) items-center underline decoration-[1.5px] underline-offset-[5px] max-md:hidden"
          href={whatsappHref(contact)}
        >
          {t("company.support.label")} {contact.phoneDisplay}
        </a>
      </div>
    </header>
  );
}
