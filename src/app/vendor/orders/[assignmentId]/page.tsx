/**
 * @purpose GET {base}/orders/{assignmentId}: one florist order, at its stage
 * @spec 011
 *
 * TASK-210's `OrderScreen` fed by `floristOrderView()` under the member's partner context
 * (AC-23, AC-25): another florist's assignment, a declined one, or an id that is not one is a
 * 404 (`notFound()`, the florist tree's own not-found page). The recipient's name, phone and
 * address are in the view, and so in the HTML, only from acceptance until the photo.
 *
 * TASK-215 docks the actions `floristActions()` allows (the events `order_transition` lets a
 * partner write from the order's status, AC-29): Decline beside Accept on an open offer, "Out for
 * delivery" while it is being made, "Delivered, add the photo" on its way, "Add the photo" once
 * delivered without one. Each is a no-JS form post or a link to its step. A refused post comes
 * back with `?notice=` (already answered, changed, expired); a delivered order with its photo
 * shows the photo from the same-origin photo route.
 *
 * Spec 026a AC-6 (TASK-354): Accept is docked only when `canAcceptFor` holds for the order's mode
 * and the shop's status read on this request; a paused shop's open offer docks Decline alone and
 * shows the paused notice under the head (artboard "a paused shop, an open offer").
 */
import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";

import { FLORIST_PATHS } from "@/config/florists";
import { isPausedMember, toDbContext } from "@/lib/auth/florist";
import { floristOrderView } from "@/modules/orders";
import { floristActions } from "@/modules/orders/florist-actions";
import {
  DeliveredPhoto,
  InboxDock,
  InboxNotice,
  listGroupOf,
  OrderScreen,
} from "@/modules/partners";
import { floristTranslator } from "@/modules/partners/auth/copy";
import { Button } from "@/modules/ui";

import { commandContextOf, oneOf, ORDER_NOTICES } from "../../actions";
import { SignedInFrame } from "../../chrome";
import { currentFloristContext } from "../../request";

/** The words of each notice (Appendix A). */
const NOTICE_KEYS = {
  answered: "floristInbox.notice.answered",
  changed: "floristInbox.notice.changed",
  expired: "floristInbox.page.expired",
} as const;

const DOCK_BUTTON = "min-h-[56px] px-[16px]";

export async function generateMetadata(): Promise<Metadata> {
  const context = await currentFloristContext();
  const t = floristTranslator(context?.locale ?? "en");
  return { title: t("floristInbox.orders") };
}

export default async function FloristOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { assignmentId } = await params;
  const notice = oneOf(ORDER_NOTICES, (await searchParams)["notice"]);
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
  const eyebrows = {
    waiting: t("floristInbox.stage.waiting"),
    inProgress: t("floristInbox.stage.inProgress"),
    delivered: t("floristInbox.page.groupDelivered"),
  } as const;
  const stageNotice =
    view.stage === "expired" && notice !== "expired"
      ? t("floristInbox.page.expired")
      : null;
  const pausedOffer =
    view.stage === "offer" &&
    actions.includes("decline") &&
    !actions.includes("accept") &&
    isPausedMember(context);
  const id = view.assignmentId;
  const dock =
    actions.length === 0 ? null : (
      <InboxDock wide={actions.includes("accept")}>
        {actions.includes("decline") ? (
          <Button
            variant="secondary"
            href={FLORIST_PATHS.decline(id)}
            className={DOCK_BUTTON}
          >
            {t("floristInbox.decline")}
          </Button>
        ) : null}
        {actions.includes("accept") ? (
          <form
            method="post"
            action={FLORIST_PATHS.respond(id)}
            className="contents"
          >
            <Button
              type="submit"
              name="response"
              value="accept"
              className={DOCK_BUTTON}
            >
              {t("floristInbox.accept")}
            </Button>
          </form>
        ) : null}
        {actions.includes("outForDelivery") ? (
          <form
            method="post"
            action={FLORIST_PATHS.dispatch(id)}
            className="contents"
          >
            <Button type="submit" className={DOCK_BUTTON}>
              {t("floristInbox.outForDelivery")}
            </Button>
          </form>
        ) : null}
        {actions.includes("delivered") ? (
          <Button href={FLORIST_PATHS.photo(id)} className={DOCK_BUTTON}>
            {t("floristInbox.deliveredAddPhoto")}
          </Button>
        ) : null}
        {actions.includes("addPhoto") ? (
          <Button href={FLORIST_PATHS.photo(id)} className={DOCK_BUTTON}>
            {t("floristInbox.page.addPhoto")}
          </Button>
        ) : null}
      </InboxDock>
    );
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
            <>
              {notice === undefined ? null : (
                <InboxNotice tone="warn">{t(NOTICE_KEYS[notice])}</InboxNotice>
              )}
              {pausedOffer ? (
                <InboxNotice tone="note">
                  {t("floristInbox.paused.notice")}
                </InboxNotice>
              ) : null}
              {stageNotice === null ? null : (
                <p
                  className="bg-paper-2 text-body text-ink-2 m-0 rounded-(--radius-field) px-[16px] py-[12px]"
                  data-fo-order-notice={view.stage}
                >
                  {stageNotice}
                </p>
              )}
              {view.stage === "photoReceived" ? (
                <InboxNotice tone="ok">
                  {t("floristInbox.page.photoReceived")}
                </InboxNotice>
              ) : null}
              {view.stage === "withdrawn" ? (
                <InboxNotice tone="warn">
                  <b>{t("floristInbox.withdrawn.title")}</b>{" "}
                  {t("floristInbox.withdrawn.body")}
                </InboxNotice>
              ) : null}
            </>
          }
        >
          {view.stage === "photoReceived" ? (
            <DeliveredPhoto
              src={FLORIST_PATHS.photoFile(id)}
              alt={t("floristInbox.photo.alt")}
            />
          ) : null}
        </OrderScreen>
      </main>
      {dock}
    </SignedInFrame>
  );
}
