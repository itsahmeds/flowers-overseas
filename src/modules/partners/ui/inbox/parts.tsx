/**
 * The florist inbox's building blocks (spec 011 §5.3; artboards `florist-inbox-mobile.dc.html`
 * and `-desktop.dc.html`, `.fr-*`; TASK-210).
 *
 * Server components with no client JavaScript and no literal copy: every word is a
 * `floristInbox.*` message key, a reused reviewed key (`nav.menu.label`, `nav.category.addOns`,
 * `infoPages.contact.phone`) or the view model's data. Logical properties only. The icons are the
 * artboard's own strokes, `aria-hidden`: the text beside each one carries its meaning.
 *
 * Phone first. The screens sit in a size container (`@container`), so the walkthrough's phone
 * frame renders the phone layout on any viewport and the inbox page widens with its own column,
 * never with the window.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { Mark, Wordmark } from "@/modules/ui";

import type { FloristOrderView, FloristRecipient } from "../../inbox/view.ts";

import {
  answerByLabel,
  deliveryDateLabel,
  label,
  moneyLabel,
} from "./format.ts";

const ICON = "size-[20px] shrink-0";

/** A clock: the time to answer by. */
export function ClockIcon({
  className = ICON,
}: {
  readonly className?: string;
}): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** A chevron pointing at the inline end; mirrored in RTL. */
export function ChevronIcon({
  back = false,
  className = ICON,
}: {
  readonly back?: boolean;
  readonly className?: string;
}): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${className} rtl:-scale-x-100`}
    >
      <path d={back ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

function PhoneIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[18px] shrink-0"
    >
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </svg>
  );
}

export function CameraIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-mark size-[40px]"
    >
      <path d="M5 13h7l3-4h10l3 4h7v19H5z" />
      <circle cx="20" cy="22" r="6" />
    </svg>
  );
}

export interface InboxFrameProps {
  readonly children: ReactNode;
  /** The logo's link: the inbox list. Absent on the walkthrough, where the screen is a picture. */
  readonly homeHref?: string;
  /** What the Menu opens (language, sign out): the inbox page's (TASK-214). */
  readonly menuPanel?: ReactNode;
  /** A notice under the header: the demo notice on a demo member's pages (TASK-214). */
  readonly notice?: ReactNode;
  /** The actions docked at the thumb. */
  readonly dock?: ReactNode;
  /** The dock's two-column form (Decline beside Accept). */
  readonly dockWide?: boolean;
}

/**
 * The florist screen: the minimal header (logo and Menu), an optional notice, the content and
 * the docked actions (`.fr`, `.fr-hdr`, `.fr-main`, `.fr-dock`).
 */
export function InboxFrame({
  children,
  homeHref,
  menuPanel,
  notice,
  dock,
  dockWide = false,
}: InboxFrameProps): ReactElement {
  const t = useTranslations();
  const logo = (
    <>
      <Mark size={28} />
      <Wordmark className="h-[18px]" />
    </>
  );
  return (
    <div className="bg-paper text-ink @container" data-fo-inbox-frame>
      <header className="bg-paper border-rule flex min-h-[60px] items-center gap-[12px] border-b px-(--gutter-s)">
        {homeHref === undefined ? (
          <span className="inline-flex items-center gap-[8px]">{logo}</span>
        ) : (
          <a className="inline-flex items-center gap-[8px]" href={homeHref}>
            {logo}
          </a>
        )}
        <details className="relative ms-auto" data-fo-inbox-menu>
          <summary className="text-ui inline-flex min-h-(--target-min) cursor-pointer list-none items-center gap-[10px] rounded-full px-[16px] font-bold shadow-[inset_0_0_0_1.5px_var(--color-ink)] [&::-webkit-details-marker]:hidden">
            <span
              aria-hidden="true"
              className="relative h-[12px] w-[18px] border-y-2 border-current after:absolute after:start-0 after:end-0 after:top-[3px] after:border-t-2 after:border-current after:content-['']"
            />
            {t("nav.menu.label")}
          </summary>
          {menuPanel}
        </details>
      </header>
      {notice}
      <div className="grid content-start gap-[24px] px-(--gutter-s) pt-[20px] pb-[28px]">
        {children}
      </div>
      {dock === undefined ? null : (
        <div
          className={`bg-paper border-rule sticky bottom-0 z-20 grid gap-[10px] border-t px-(--gutter-s) pt-[12px] pb-[16px] shadow-(--shadow-sticky) ${dockWide ? "grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]" : "auto-cols-[minmax(0,1fr)] grid-flow-col"}`}
          data-fo-inbox-dock
        >
          {dock}
        </div>
      )}
    </div>
  );
}

/** The time to answer by, as the list's chip or the order page's band. */
export function AnswerBy({
  instant,
  timeZone,
  locale,
  size = "chip",
}: {
  readonly instant: string;
  readonly timeZone: string;
  readonly locale: string;
  readonly size?: "chip" | "band";
}): ReactElement {
  const t = useTranslations("floristInbox");
  const text = t("answerBy", {
    time: answerByLabel(instant, locale, timeZone),
  });
  return size === "chip" ? (
    <span className="bg-blush text-accent-strong inline-flex items-center gap-[6px] justify-self-start rounded-full py-[3px] ps-[8px] pe-[10px] text-sm font-bold tabular-nums">
      <ClockIcon className="size-[16px] shrink-0" />
      {text}
    </span>
  ) : (
    <p className="bg-blush text-accent-strong text-body m-0 flex items-center gap-[10px] rounded-(--radius-field) px-[16px] py-[12px] font-bold tabular-nums">
      <ClockIcon />
      {text}
    </p>
  );
}

/** "You receive" and the amount (`.fr-pay`, or the list's `.pay` line). */
export function PayoutLine({
  payout,
  locale,
  variant = "band",
}: {
  readonly payout: { readonly amountMinor: number; readonly currency: string };
  readonly locale: string;
  readonly variant?: "band" | "line";
}): ReactElement {
  const t = useTranslations("floristInbox");
  const amount = moneyLabel(payout, locale);
  if (variant === "line") {
    return (
      <span className="text-ui text-included font-bold">
        {t.rich("youReceive", {
          payout: amount,
          strong: (chunks) => <>{chunks}</>,
        })}
      </span>
    );
  }
  return (
    <p className="bg-leaf-wash text-ink m-0 flex items-baseline justify-between gap-[12px] rounded-(--radius-field) px-[16px] py-[14px] font-bold">
      {t.rich("youReceive", {
        payout: amount,
        strong: (chunks) => (
          <strong className="font-display text-md text-ink font-normal lining-nums">
            {chunks}
          </strong>
        ),
      })}
    </p>
  );
}

const DT = "text-xs font-bold tracking-[0.1em] uppercase text-ink-3 m-0";
const FACT_ROW =
  "border-rule grid grid-cols-[124px_minmax(0,1fr)] items-baseline gap-x-[14px] gap-y-[2px] border-b py-[12px]";

/**
 * The facts list (`.fr-facts`): the delivery date, the add-ons and, before acceptance, the town
 * and postcode. After acceptance the address is the recipient block's, not a fact.
 */
export function OrderFacts({
  view,
  locale,
  showTown,
}: {
  readonly view: FloristOrderView;
  readonly locale: string;
  readonly showTown: boolean;
}): ReactElement {
  const t = useTranslations();
  const addons = view.product.addonNameKeys.map((key) => label(t, key));
  return (
    <dl className="border-rule m-0 grid border-t" data-fo-order-facts>
      <div className={FACT_ROW}>
        <dt className={DT}>{t("floristInbox.deliveryDate")}</dt>
        <dd className="text-body-s m-0">
          {deliveryDateLabel(
            view.delivery.date,
            locale,
            view.delivery.timeZone,
          )}
        </dd>
      </div>
      {addons.length === 0 ? null : (
        <div className={FACT_ROW}>
          <dt className={DT}>{t("nav.category.addOns")}</dt>
          <dd className="text-body-s m-0">{addons.join(", ")}</dd>
        </div>
      )}
      {showTown ? (
        <div className={FACT_ROW}>
          <dt className={DT}>{t("floristInbox.address")}</dt>
          <dd className="text-body-s m-0">
            <bdi>
              {view.delivery.postcode} {view.delivery.town}
            </bdi>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

/** The recipient (`.fr-sec` + `.fr-rcpt`): only a view that carries one can render it. */
export function RecipientBlock({
  recipient,
  headingLevel = "h2",
}: {
  readonly recipient: FloristRecipient;
  readonly headingLevel?: "h2" | "p";
}): ReactElement {
  const t = useTranslations();
  const Heading = headingLevel;
  const row = "border-rule grid gap-[2px] border-b py-[12px] last:border-b-0";
  return (
    <section className="grid gap-[10px]" data-fo-recipient>
      <Heading className="font-display text-md m-0 leading-[1.2] font-normal">
        {t("floristInbox.recipient")}
      </Heading>
      <dl className="bg-card m-0 grid rounded-(--radius-photo-s) px-[16px] py-[4px] shadow-[inset_0_0_0_1px_var(--color-rule)]">
        <div className={row}>
          <dt className={DT}>{t("floristInbox.recipient")}</dt>
          <dd className="font-display text-h3 m-0">
            <bdi>{recipient.fullName}</bdi>
          </dd>
        </div>
        <div className={row}>
          <dt className={DT}>{t("infoPages.contact.phone")}</dt>
          <dd className="m-0">
            <a
              className="text-link inline-flex min-h-(--target-min) items-center gap-[8px] font-bold tabular-nums underline-offset-4"
              href={`tel:${recipient.phoneE164}`}
            >
              <PhoneIcon />
              <bdi>{recipient.phoneE164}</bdi>
            </a>
          </dd>
        </div>
        <div className={row}>
          <dt className={DT}>{t("floristInbox.address")}</dt>
          <dd className="text-body-s m-0 leading-[1.4]">
            {recipient.addressLines.map((line) => (
              <bdi className="block" key={line}>
                {line}
              </bdi>
            ))}
          </dd>
        </div>
        {recipient.deliveryNote === undefined ? null : (
          <div className={row}>
            <dt className={DT}>{t("floristInbox.deliveryNote")}</dt>
            <dd className="text-body-s m-0 leading-[1.4]">
              {recipient.deliveryNote}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

/** The card message to print, in the buyer's words (`.fr-cardmsg`). */
export function CardMessage({
  message,
  headingLevel = "h2",
}: {
  readonly message: string;
  readonly headingLevel?: "h2" | "p";
}): ReactElement {
  const t = useTranslations("floristInbox");
  const Heading = headingLevel;
  return (
    <section className="grid gap-[10px]" data-fo-card-message>
      <Heading className="font-display text-md m-0 leading-[1.2] font-normal">
        {t("cardMessage")}
      </Heading>
      <blockquote className="bg-card font-display text-h3 m-0 rounded-(--radius-letter) px-[20px] py-[18px] leading-[1.35] font-(--font-weight-display-em) italic shadow-(--shadow-paper)">
        <bdi>{message}</bdi>
      </blockquote>
    </section>
  );
}
