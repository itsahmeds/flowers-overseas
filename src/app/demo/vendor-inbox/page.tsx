/**
 * @purpose GET {base}: the florist inbox (signed in; no session goes to sign-in)
 * @spec 011
 *
 * The signed-in landing of the florist sign-in (TASK-212): the frame of artboard
 * `florist-inbox-*` (header, menu with language and sign-out, the demo line) and the "Orders"
 * heading. The memberships are read from the database on this request (AC-20). The list itself,
 * its groups and the refresh island are TASK-214's.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";

import { FLORIST_PATHS } from "@/config/florists";
import { floristTranslator } from "@/modules/partners/auth/copy";

import { SignedInFrame } from "./chrome";
import { currentFloristContext } from "./request";

export async function generateMetadata(): Promise<Metadata> {
  const context = await currentFloristContext();
  const t = floristTranslator(context?.locale ?? "en");
  return { title: t("floristInbox.orders") };
}

export default async function FloristInboxPage(): Promise<ReactElement> {
  const context = await currentFloristContext();
  if (context === null) redirect(FLORIST_PATHS.signIn);
  const t = floristTranslator(context.locale);
  return (
    <SignedInFrame t={t} context={context} back={FLORIST_PATHS.base}>
      <main className="grid content-start gap-[24px] px-[20px] pt-[20px] pb-[28px] md:px-[56px] md:pt-[36px] md:pb-[64px]">
        <h1 className="font-display tracking-display text-ink text-[34px] leading-[1.08] md:text-[46px]">
          {t("floristInbox.orders")}
        </h1>
      </main>
    </SignedInFrame>
  );
}
