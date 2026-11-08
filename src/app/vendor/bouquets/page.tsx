/**
 * @purpose GET {base}/bouquets: the florist's own bouquets and what they receive (signed in; read only)
 * @spec 030b
 *
 * Spec 030b §14.2 C, §14.5 (AC-52 to AC-56; TASK-444; artboards `florist-bouquets-*`). The
 * member's context through the florist request's `requireFloristContext` equivalent (no session,
 * or no membership the policy admits at this request, goes to sign-in, AC-55); the rows are
 * `floristBouquets(ctx)` under the member's partner context; the cards are printed in the member's
 * language. A member of a `paused` shop gets spec 026a's paused notice. "Ask for a change" is a
 * `mailto:` to `company.supportEmail`; with no mailbox the support line prints instead (§13 Q25).
 *
 * Rendered per request (the florist layout is `force-dynamic`); `X-Robots-Tag: noindex` and
 * `Cache-Control: private, no-store` come from `floristHeaderRules()` for everything under the
 * base. Server components only: no client island and no `<form>` in the page's own body.
 */
import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";

import { COMPANY } from "@/config/company";
import { FLORIST_PATHS } from "@/config/florists";
import { isPausedMember } from "@/lib/auth/florist";
import { loadMessages } from "@/modules/i18n";
import { InboxNotice } from "@/modules/partners";
import { floristTranslator } from "@/modules/partners/auth/copy";
import { floristBouquets } from "@/modules/partners/portal/bouquets";
import {
  type BouquetTranslator,
  bouquetCards,
} from "@/modules/partners/portal/view";
import { BouquetList } from "@/modules/partners/ui/portal/BouquetList";

import { SignedInFrame } from "../chrome";
import { currentFloristContext } from "../request";

export async function generateMetadata(): Promise<Metadata> {
  const context = await currentFloristContext();
  const t = floristTranslator(context?.locale ?? "en");
  return { title: t("floristInbox.bouquets.title") };
}

export default async function FloristBouquetsPage(): Promise<ReactElement> {
  const context = await currentFloristContext();
  if (context === null) redirect(FLORIST_PATHS.signIn);
  setRequestLocale(context.locale);
  const t = floristTranslator(context.locale);
  const labels = createTranslator({
    locale: context.locale,
    messages: loadMessages(context.locale, ["floristInbox", "catalog"]),
  }) as unknown as BouquetTranslator;
  const rows = await floristBouquets(context, { requestId: randomUUID() });
  const supportEmail = COMPANY.supportEmail;
  const cards = bouquetCards(rows, {
    t: labels,
    locale: context.locale,
    supportEmail,
  });
  return (
    <SignedInFrame
      t={t}
      context={context}
      back={FLORIST_PATHS.bouquets}
      section="bouquets"
    >
      <main className="@container grid content-start gap-[24px] px-[20px] pt-[20px] pb-[28px] md:px-[56px] md:pt-[36px] md:pb-[64px]">
        <BouquetList
          locale={context.locale}
          title={t("floristInbox.bouquets.title")}
          intro={t("floristInbox.bouquets.intro")}
          notice={
            isPausedMember(context) ? (
              <InboxNotice tone="note">
                {t("floristInbox.paused.notice")}
              </InboxNotice>
            ) : undefined
          }
          cards={cards}
          empty={t("floristInbox.bouquets.empty")}
          {...(supportEmail === undefined
            ? {
                supportLine: t("floristInbox.bouquets.supportLine", {
                  support: COMPANY.contact.phoneDisplay,
                }),
              }
            : {})}
        />
      </main>
    </SignedInFrame>
  );
}
