/**
 * @purpose GET {base}: the florist inbox list (signed in; no session goes to sign-in)
 * @spec 011
 *
 * The signed-in member's assignments in three groups, rendered with TASK-210's `InboxList`
 * inside TASK-212's signed-in frame (artboard `florist-inbox-*`). The data is
 * `listFloristAssignments()` under the member's partner context (AC-23, AC-24); the memberships
 * are read from the database on this request (AC-20). The refresh island keeps an open inbox
 * fresh (AC-26); a member of a `demo` partner outside production gets the test-order control
 * (AC-33). The member's language reaches next-intl through `setRequestLocale`, so TASK-210's
 * components read the same language as the frame. A member of a `paused` shop gets the paused
 * notice under the title (spec 026a AC-6, artboard "Live site · a paused shop").
 */
import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";

import { FLORIST_PATHS, floristsConfig } from "@/config/florists";
import { isDemoMember, isPausedMember, toDbContext } from "@/lib/auth/florist";
import { appEnvironment } from "@/lib/env.schema";
import { listFloristAssignments } from "@/modules/orders";
import { demoRefusedIn } from "@/modules/orders/demo";
import {
  FLORIST_LIST_GROUPS,
  type FloristAssignmentListItem,
  InboxList,
  type InboxListEntry,
  InboxNotice,
  InboxRefresh,
  listGroupOf,
} from "@/modules/partners";
import { floristTranslator } from "@/modules/partners/auth/copy";
import { Button } from "@/modules/ui";

import { SignedInFrame } from "./chrome";
import { currentFloristContext } from "./request";

export async function generateMetadata(): Promise<Metadata> {
  const context = await currentFloristContext();
  const t = floristTranslator(context?.locale ?? "en");
  return { title: t("floristInbox.orders") };
}

type Translator = ReturnType<typeof floristTranslator>;

/** What an item says in its lead for any stage but an open offer (§5.3 "Inbox list"). */
function leadOf(
  item: FloristAssignmentListItem,
  t: Translator,
): Pick<InboxListEntry, "lead" | "muted" | "href"> {
  const href = FLORIST_PATHS.order(item.assignmentId);
  const chip = (text: string) => (
    <span className="bg-paper-2 text-ink-2 inline-flex rounded-full px-[10px] py-[3px] text-sm font-bold">
      {text}
    </span>
  );
  switch (item.stage) {
    case "offer":
      return { href };
    case "expired":
      return {
        lead: (
          <span className="text-ui text-ink-2">
            {t("floristInbox.page.expired")}
          </span>
        ),
        muted: true,
      };
    case "accepted":
      return { href, lead: chip(t("floristInbox.page.beingMade")) };
    case "outForDelivery":
      return { href, lead: chip(t("floristInbox.outForDelivery")) };
    case "delivered":
      return { href, lead: chip(t("floristInbox.page.addPhoto")) };
    case "photoReceived":
      return { href, lead: chip(t("floristInbox.page.groupDelivered")) };
    case "withdrawn":
      // Spec 016 §5.3 (TASK-330): the stage's first sentence is the lead, as the expired line is.
      return {
        href,
        lead: (
          <span className="text-accent-strong text-sm font-bold">
            {t("floristInbox.withdrawn.title")}
          </span>
        ),
        muted: true,
      };
  }
}

export default async function FloristInboxPage(): Promise<ReactElement> {
  const context = await currentFloristContext();
  if (context === null) redirect(FLORIST_PATHS.signIn);
  setRequestLocale(context.locale);
  const t = floristTranslator(context.locale);
  const items = await listFloristAssignments(
    { ...toDbContext(context, randomUUID()), role: "partner" },
    { locale: context.locale },
  );
  const headings = {
    waiting: t("floristInbox.stage.waiting"),
    inProgress: t("floristInbox.stage.inProgress"),
    delivered: t("floristInbox.page.groupDelivered"),
  } as const;
  const groups = FLORIST_LIST_GROUPS.map((id) => ({
    id,
    heading: headings[id],
    items: items
      .filter((item) => listGroupOf(item.stage) === id)
      .map((item) => ({ item, ...leadOf(item, t) })),
  }));
  const testOrder =
    isDemoMember(context) && !demoRefusedIn(appEnvironment(process.env)) ? (
      <form method="post" action={FLORIST_PATHS.testOrder}>
        <Button type="submit" variant="secondary" size="sm">
          {t("floristInbox.page.testOrder")}
        </Button>
      </form>
    ) : undefined;
  return (
    <SignedInFrame t={t} context={context} back={FLORIST_PATHS.base}>
      <main className="@container grid content-start gap-[24px] px-[20px] pt-[20px] pb-[28px] md:px-[56px] md:pt-[36px] md:pb-[64px]">
        <InboxList
          locale={context.locale}
          title={t("floristInbox.orders")}
          titleAction={testOrder}
          notice={
            isPausedMember(context) ? (
              <InboxNotice tone="note">
                {t("floristInbox.paused.notice")}
              </InboxNotice>
            ) : undefined
          }
          groups={groups}
          empty={
            <p className="text-body text-ink-2 m-0" data-fo-inbox-empty>
              {t("floristInbox.page.empty")}
            </p>
          }
        />
        <InboxRefresh
          intervalMs={floristsConfig.inboxRefresh.intervalMs}
          idleStopMs={floristsConfig.inboxRefresh.idleStopMs}
          href={FLORIST_PATHS.base}
          refreshLabel={t("floristInbox.page.refresh")}
          stoppedLine={t("floristInbox.page.refreshStopped")}
        />
      </main>
    </SignedInFrame>
  );
}
