/**
 * The inbox list (spec 011 §2 "The list", §5.3; `.fr-group`, `.fr-item`; TASK-210).
 *
 * The signed-in member's assignments in groups, each item the product and tier, the add-ons, the
 * date, the town, what the florist receives and, for an open offer, the time to answer by. The
 * caller names the groups and hands in what is said in each item's lead for every stage other
 * than an open offer (an expired offer's "The time to answer has passed.", a stage chip), so this
 * file renders the walkthrough's screen and the inbox page's list with one component, and the
 * strings only the inbox page shows stay in the inbox page's files (TASK-214).
 *
 * Desktop (a container 56rem wide or more): one row per item on the artboard's five columns.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { formatNumber } from "@/modules/i18n";

import type { FloristAssignmentListItem } from "../../inbox/view.ts";

import { deliveryDateLabel, label, localeCode, tierLabel } from "./format.ts";
import { AnswerBy, ChevronIcon, PayoutLine } from "./parts.tsx";

export interface InboxListGroup {
  /** A stable id (`waiting`, `inProgress`, `delivered`). */
  readonly id: string;
  /** The group's heading, already translated. */
  readonly heading: string;
  readonly items: readonly InboxListEntry[];
}

export interface InboxListEntry {
  readonly item: FloristAssignmentListItem;
  /** The order page, or absent where the item is not a link (an expired offer). */
  readonly href?: string;
  /** The item's lead for any stage but an open offer, whose lead is the answer-by chip. */
  readonly lead?: ReactNode;
  /** Muted: an expired offer or a withdrawn order. */
  readonly muted?: boolean;
}

export interface InboxListProps {
  readonly locale: string;
  readonly title: string;
  /** `h1` on the inbox page; `p` inside the walkthrough's picture of it. */
  readonly titleAs?: "h1" | "p";
  /** Beside the title: the test-order control on a demo member's list (TASK-214). */
  readonly titleAction?: ReactNode;
  readonly groups: readonly InboxListGroup[];
  /** Shown when no group has an item (TASK-214's empty state). */
  readonly empty?: ReactNode;
}

function Item({
  entry,
  locale,
}: {
  readonly entry: InboxListEntry;
  readonly locale: string;
}): ReactElement {
  const t = useTranslations();
  const { item } = entry;
  const addons = item.product.addonNameKeys.map((key) => label(t, key));
  const lead =
    item.stage === "offer" && item.answerBy !== undefined ? (
      <AnswerBy
        instant={item.answerBy}
        timeZone={item.delivery.timeZone}
        locale={locale}
      />
    ) : (
      entry.lead
    );
  const body = (
    <>
      {lead === undefined ? null : (
        <span className="grid justify-items-start @4xl:col-start-1">
          {lead}
        </span>
      )}
      <span className="grid">
        <b
          className={`font-display text-h3 leading-[1.2] font-normal ${entry.muted === true ? "text-ink-2" : ""}`}
        >
          {item.product.name} · {tierLabel(t, item.product.tier)}
        </b>
        {addons.length === 0 ? null : (
          <span className="text-ui text-ink-2 block leading-[1.35]">
            + {addons.join(", ")}
          </span>
        )}
      </span>
      <span className="text-ui text-ink-2 flex flex-wrap gap-x-[6px] leading-[1.35] @4xl:contents">
        <span>
          {t("floristInbox.forDate", {
            date: deliveryDateLabel(
              item.delivery.date,
              locale,
              item.delivery.timeZone,
            ),
          })}
        </span>
        <span className="before:text-ink-3 before:content-['·_'] @4xl:before:content-none">
          <bdi>{item.delivery.town}</bdi>
        </span>
      </span>
      {item.payout === undefined ? (
        <span aria-hidden="true" />
      ) : (
        <PayoutLine payout={item.payout} locale={locale} variant="line" />
      )}
    </>
  );
  const shape = `relative grid min-h-[96px] gap-[4px] rounded-(--radius-photo-s) ps-[18px] pe-[48px] py-[16px] text-inherit no-underline shadow-[inset_0_0_0_1px_var(--color-rule),var(--shadow-xs)] @4xl:min-h-[76px] @4xl:grid-cols-[190px_minmax(0,1.7fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)] @4xl:items-center @4xl:gap-x-[24px] @4xl:rounded-none @4xl:border-b @4xl:border-rule @4xl:pe-[56px] @4xl:shadow-none @4xl:last:border-b-0 ${entry.muted === true ? "bg-paper-2" : "bg-card"}`;
  return entry.href === undefined ? (
    <div className={shape} data-fo-inbox-item={item.stage}>
      {body}
    </div>
  ) : (
    <a className={shape} href={entry.href} data-fo-inbox-item={item.stage}>
      {body}
      <ChevronIcon className="text-ink-3 absolute end-[14px] top-1/2 -mt-[11px] size-[22px]" />
    </a>
  );
}

export function InboxList({
  locale,
  title,
  titleAs = "h1",
  titleAction,
  groups,
  empty,
}: InboxListProps): ReactElement {
  const Title = titleAs;
  const filled = groups.filter((group) => group.items.length > 0);
  return (
    <div className="grid gap-[24px]" data-fo-inbox-list>
      <div className="flex flex-wrap items-center justify-between gap-[12px]">
        <Title className="font-display m-0 text-[34px] leading-[1.08] font-normal tracking-(--tracking-display) @4xl:text-[46px]">
          {title}
        </Title>
        {titleAction}
      </div>
      {filled.length === 0
        ? empty
        : filled.map((group) => (
            <section
              className="grid gap-[10px]"
              aria-label={group.heading}
              key={group.id}
              data-fo-inbox-group={group.id}
            >
              <h2 className="font-body text-ink-2 m-0 flex items-center gap-[8px] text-xs font-bold tracking-(--tracking-label) uppercase">
                {group.heading}
                <span className="bg-ink text-paper inline-grid h-[22px] min-w-[22px] place-items-center rounded-full px-[6px] text-[12px] tracking-normal tabular-nums">
                  {formatNumber(group.items.length, localeCode(locale))}
                </span>
              </h2>
              <div className="@4xl:bg-card grid gap-[10px] @4xl:gap-0 @4xl:overflow-hidden @4xl:rounded-(--radius-photo-s) @4xl:shadow-[inset_0_0_0_1px_var(--color-rule)]">
                {group.items.map((entry) => (
                  <Item
                    entry={entry}
                    locale={locale}
                    key={entry.item.assignmentId}
                  />
                ))}
              </div>
            </section>
          ))}
    </div>
  );
}
