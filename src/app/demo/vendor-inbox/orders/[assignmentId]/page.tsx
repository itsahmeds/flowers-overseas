/**
 * @purpose GET {base}/orders/{assignmentId}: one florist order, at its stage
 * @spec 011
 *
 * TASK-210's `OrderScreen` fed by `floristOrderView()` under the member's partner context
 * (AC-23, AC-25): another florist's assignment, a declined one, or an id that is not one is a
 * 404 (`notFound()`, the florist tree's own not-found page). The recipient's name, phone and
 * address are in the view, and so in the HTML, only from acceptance until the photo. The actions
 * (accept, decline, out for delivery, delivered, the photo) are TASK-215's; this page reads.
 */
import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";

import { FLORIST_PATHS } from "@/config/florists";
import { toDbContext } from "@/lib/auth/florist";
import { floristOrderView } from "@/modules/orders";
import { listGroupOf, OrderScreen } from "@/modules/partners";
import { floristTranslator } from "@/modules/partners/auth/copy";

import { SignedInFrame } from "../../chrome";
import { currentFloristContext } from "../../request";

export async function generateMetadata(): Promise<Metadata> {
  const context = await currentFloristContext();
  const t = floristTranslator(context?.locale ?? "en");
  return { title: t("floristInbox.orders") };
}

export default async function FloristOrderPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}): Promise<ReactElement> {
  const { assignmentId } = await params;
  const context = await currentFloristContext();
  if (context === null) redirect(FLORIST_PATHS.signIn);
  setRequestLocale(context.locale);
  const t = floristTranslator(context.locale);
  const view = await floristOrderView(
    { ...toDbContext(context, randomUUID()), role: "partner" },
    assignmentId,
    { locale: context.locale },
  );
  if (view === null) notFound();
  const eyebrows = {
    waiting: t("floristInbox.stage.waiting"),
    inProgress: t("floristInbox.stage.inProgress"),
    delivered: t("floristInbox.page.groupDelivered"),
  } as const;
  const noticeText =
    view.stage === "expired"
      ? t("floristInbox.page.expired")
      : view.stage === "photoReceived"
        ? t("floristInbox.page.photoReceived")
        : null;
  return (
    <SignedInFrame
      t={t}
      context={context}
      back={FLORIST_PATHS.order(view.assignmentId)}
    >
      <main className="@container grid content-start gap-[24px] px-[20px] pt-[20px] pb-[28px] md:mx-auto md:w-full md:max-w-[720px] md:px-[56px] md:pt-[36px] md:pb-[64px]">
        <OrderScreen
          view={view}
          locale={context.locale}
          eyebrow={eyebrows[listGroupOf(view.stage)]}
          back={{ label: t("floristInbox.orders"), href: FLORIST_PATHS.base }}
          notice={
            noticeText === null ? undefined : (
              <p
                className="bg-paper-2 text-body text-ink-2 m-0 rounded-(--radius-field) px-[16px] py-[12px]"
                data-fo-order-notice={view.stage}
              >
                {noticeText}
              </p>
            )
          }
        />
      </main>
    </SignedInFrame>
  );
}
