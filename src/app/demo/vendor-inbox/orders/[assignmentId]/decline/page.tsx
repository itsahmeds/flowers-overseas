/**
 * @purpose GET {base}/orders/{assignmentId}/decline: why the florist declines (AC-28)
 * @spec 011
 *
 * The declining state of the artboard (`florist-inbox-*`, "declining: the reason, then Decline the
 * order"): the five reasons of the closed list, the first chosen, and "Decline the order", posted
 * with no JavaScript to `respondToOffer` (TASK-215). Offered only while the offer is open and the
 * machine lets the florist decline it; otherwise back to the order. Another florist's assignment
 * is a 404.
 */
import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";

import { FLORIST_PATHS } from "@/config/florists";
import { toDbContext } from "@/lib/auth/florist";
import { floristOrderView } from "@/modules/orders";
import {
  DECLINE_REASONS,
  type DeclineReason,
  floristActions,
} from "@/modules/orders/florist-actions";
import { DeclineStep, InboxDock } from "@/modules/partners";
import { floristTranslator } from "@/modules/partners/auth/copy";
import { Button } from "@/modules/ui";

import { commandContextOf } from "../../../actions";
import { SignedInFrame } from "../../../chrome";
import { currentFloristContext } from "../../../request";

/** Appendix A's reasons, in the closed list's order. */
const REASON_KEYS = {
  capacity: "floristInbox.declineReason.capacity",
  out_of_area: "floristInbox.declineReason.out_of_area",
  product_unavailable: "floristInbox.declineReason.product_unavailable",
  closed: "floristInbox.declineReason.closed",
  other: "floristInbox.declineReason.other",
} as const satisfies Readonly<Record<DeclineReason, string>>;

export async function generateMetadata(): Promise<Metadata> {
  const context = await currentFloristContext();
  const t = floristTranslator(context?.locale ?? "en");
  return { title: t("floristInbox.declineWhy") };
}

export default async function FloristDeclinePage({
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
  const actions = await floristActions(
    commandContextOf(context),
    view.assignmentId,
  );
  if (!actions.includes("decline")) {
    redirect(FLORIST_PATHS.order(view.assignmentId));
  }
  return (
    <SignedInFrame
      t={t}
      context={context}
      back={FLORIST_PATHS.decline(view.assignmentId)}
    >
      <form method="post" action={FLORIST_PATHS.respond(view.assignmentId)}>
        <input type="hidden" name="response" value="decline" />
        <main className="@container grid content-start gap-[24px] px-[20px] pt-[20px] pb-[28px] md:mx-auto md:w-full md:max-w-[720px] md:px-[56px] md:pt-[36px] md:pb-[64px]">
          <DeclineStep
            backHref={FLORIST_PATHS.order(view.assignmentId)}
            backLabel={view.product.name}
            legend={t("floristInbox.declineWhy")}
            options={DECLINE_REASONS.map((reason) => ({
              value: reason,
              label: t(REASON_KEYS[reason]),
            }))}
          />
        </main>
        <InboxDock>
          <Button type="submit" className="min-h-[56px] px-[16px]">
            {t("floristInbox.declineSubmit")}
          </Button>
        </InboxDock>
      </form>
    </SignedInFrame>
  );
}
