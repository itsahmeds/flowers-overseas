import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { COMPANY, whatsappHref } from "@/config/company";
import {
  documentFallbackLocale,
  localePath,
  routableLocale,
} from "@/modules/i18n";
// Deep imports, as `src/app/not-found.tsx` does: the barrel re-exports client islands.
import { Mark } from "@/modules/ui/icons/Mark";
import { Wordmark } from "@/modules/ui/icons/Wordmark";
import { PAGE_FRAME } from "@/modules/ui/primitives/layout";

/**
 * @purpose Tracking page header
 * @spec 018
 *
 * The header of `/{locale}/track/{token}` and its not-working page (spec 018 §5.3;
 * `docs/design/wireframes/track-order-desktop.dc.html` and `-mobile`; TASK-338): the quiet header
 * the boards draw for the post-purchase pages, the logo linked to the locale home and, from `md`,
 * "Help & WhatsApp" with the number (on a phone the page's own dock carries it). No navigation,
 * no basket, no language links: a language link would print the token under four locales.
 *
 * The help link opens `https://wa.me/` with the number and no `text` (spec 041 §14
 * A-founder-2026-10-14d clause 3), never `tel:`.
 */
export default async function TrackHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale: requested } = await params;
  const locale = (routableLocale(requested) ?? documentFallbackLocale()).code;
  const t = await getTranslations({ locale, namespace: "company" });
  return (
    <header
      className="bg-paper border-rule border-b border-solid"
      data-fo-track-header=""
    >
      <div
        className={`${PAGE_FRAME} flex min-h-[64px] items-center gap-(--space-lg2) xl:min-h-[82px]`}
      >
        <a
          className="text-logo-ink inline-flex min-h-(--target-min) min-w-0 items-center gap-[10px]"
          href={localePath(locale, "home")}
        >
          <Mark className="h-[28px] w-[28px] flex-none xl:h-[38px] xl:w-[38px]" />
          <Wordmark
            className="h-[19px] min-w-0 shrink xl:h-[25px]"
            label={COMPANY.tradingName}
          />
        </a>
        <a
          className="link ms-auto max-md:hidden"
          href={whatsappHref(COMPANY.contact)}
        >
          {t("support.label")} {COMPANY.contact.phoneDisplay}
        </a>
      </div>
    </header>
  );
}
