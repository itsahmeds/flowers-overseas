/**
 * One order, at the stage its view carries (spec 011 §2 "The order page", §5.3; artboard
 * `florist-inbox-*`, `.fr-main`; TASK-210).
 *
 * What the florist needs at each moment and nothing else, by construction: the recipient block
 * and the card message render only from a view whose stage carries a recipient (`accepted`,
 * `outForDelivery`, `delivered`), because only those variants of `FloristOrderViewSchema` have
 * one. Before acceptance the facts list shows the town and postcode; after it, the address is the
 * recipient's. The view model has no buyer field, so no screen can print one.
 *
 * The caller (the inbox page, TASK-214; the walkthrough, this task) names the stage in the
 * eyebrow, adds a stage's notice (the expired line, the photo received line, spec 016's withdrawn
 * line) and docks the actions the stage allows in `InboxFrame`; this component draws the order.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import type { FloristOrderView } from "../../inbox/view.ts";

import { tierLabel } from "./format.ts";
import {
  AnswerBy,
  CardMessage,
  ChevronIcon,
  OrderFacts,
  PayoutLine,
  RecipientBlock,
} from "./parts.tsx";

export interface OrderScreenProps {
  readonly view: FloristOrderView;
  readonly locale: string;
  /** The stage's group, already translated ("Waiting for your answer"). */
  readonly eyebrow: string;
  /** Back to the list: a link on the inbox page, text inside the walkthrough's picture. */
  readonly back: { readonly label: string; readonly href?: string };
  /** `h1` on the order page; `p` inside the walkthrough's picture of it. */
  readonly titleAs?: "h1" | "p";
  /** A stage's notice, under the heading (TASK-214, TASK-215). */
  readonly notice?: ReactNode;
  /** The stage's extra block after the notice: the photo, through its signed URL (TASK-215). */
  readonly children?: ReactNode;
}

export function OrderScreen({
  view,
  locale,
  eyebrow,
  back,
  titleAs = "h1",
  notice,
  children,
}: OrderScreenProps): ReactElement {
  const t = useTranslations();
  const Title = titleAs;
  const headingLevel = titleAs === "h1" ? "h2" : "p";
  const backClass =
    "text-link -my-[8px] -mb-[12px] inline-flex min-h-(--target-min) items-center gap-[4px] justify-self-start font-bold no-underline";
  const backContent = (
    <>
      <ChevronIcon back />
      {back.label}
    </>
  );
  const recipient =
    view.stage === "accepted" ||
    view.stage === "outForDelivery" ||
    view.stage === "delivered"
      ? view.recipient
      : undefined;
  return (
    <div className="grid gap-[24px]" data-fo-order-screen={view.stage}>
      {back.href === undefined ? (
        <span className={backClass}>{backContent}</span>
      ) : (
        <a className={backClass} href={back.href}>
          {backContent}
        </a>
      )}
      <div>
        <p className="text-eyebrow m-0 mb-[8px] text-xs font-bold tracking-(--tracking-label) uppercase">
          {eyebrow}
        </p>
        <Title className="font-display m-0 text-[34px] leading-[1.08] font-normal tracking-(--tracking-display)">
          {view.product.name}
        </Title>
        <p className="text-body text-ink-2 m-0 mt-[4px]">
          {tierLabel(t, view.product.tier)}
        </p>
      </div>
      {view.stage === "offer" ? (
        <AnswerBy
          instant={view.answerBy}
          timeZone={view.delivery.timeZone}
          locale={locale}
          size="band"
        />
      ) : null}
      {notice}
      {children}
      {recipient === undefined ? null : (
        <>
          <RecipientBlock recipient={recipient} headingLevel={headingLevel} />
          <CardMessage
            message={recipient.cardMessage}
            headingLevel={headingLevel}
          />
        </>
      )}
      <OrderFacts
        view={view}
        locale={locale}
        showTown={view.stage === "offer" || view.stage === "expired"}
      />
      {view.stage === "withdrawn" ? null : (
        <PayoutLine payout={view.payout} locale={locale} />
      )}
    </div>
  );
}
