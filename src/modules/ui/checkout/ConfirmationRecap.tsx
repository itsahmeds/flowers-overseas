/**
 * `ConfirmationRecap` — "Your order" on the demo confirmation (spec 010 §5.3 "Confirmation";
 * `docs/design/wireframes/confirmation-{desktop,mobile}.dc.html` demo state, `.recap.plain`,
 * `.s10-rcpt`; TASK-201; the done page itself is TASK-206).
 *
 * What was placed, in the order the board draws it: the bouquet and tier, the recipient (name and
 * address, each in `<bdi>`), the date, the card (message and signature in `<bdi>`), then the total
 * through `formatMoney` and the note that nothing was charged. No phone, no email: the recap shows
 * what the buyer needs to recognise the order and nothing a shoulder-surfer should read.
 */
import type { ReactElement, ReactNode } from "react";

import type { LocaleCode } from "@/config/locales";
import { type Money, formatMoney } from "@/modules/i18n";

import { MONEY_FIGURE } from "./styles.ts";

export interface ConfirmationRecapProps {
  readonly locale: LocaleCode;
  readonly id?: string;
  readonly title: string;
  readonly totalLabel: string;
  readonly labels: {
    readonly recipient: string;
    readonly date: string;
    readonly card: string;
  };
  readonly item: {
    readonly name: string;
    readonly details: readonly string[];
    readonly image?: ReactNode;
  };
  readonly recipient: { readonly name: string; readonly address: string };
  /** "Thursday 8 October", through `formatDate`. */
  readonly date: string;
  readonly card?: { readonly message: string; readonly signature?: string };
  readonly total: Money;
  /** "Nothing was charged." in demo. */
  readonly note?: string;
}

export function ConfirmationRecap({
  locale,
  id = "confirmation-recap",
  title,
  totalLabel,
  labels,
  item,
  recipient,
  date,
  card,
  total,
  note,
}: ConfirmationRecapProps): ReactElement {
  const titleId = `${id}-title`;
  const row = "text-ui grid grid-cols-[96px_minmax(0,1fr)] gap-[12px]";
  const term =
    "text-ink-3 pt-[3px] text-xs font-bold tracking-[0.1em] uppercase";
  return (
    <aside
      aria-labelledby={titleId}
      className="bg-card rounded-field bg-[repeating-linear-gradient(to_bottom,transparent_0_39px,var(--color-paper-2)_39px_40px)] px-[26px] pt-[34px] pb-[26px] shadow-md"
      data-fo-confirmation-recap=""
      id={id}
    >
      <h2 className="text-ink m-0 text-xl" id={titleId}>
        {title}
      </h2>
      <div className="mt-[18px] grid grid-cols-[84px_minmax(0,1fr)] items-start gap-[16px]">
        <div className="bg-photo aspect-[4/5] w-[84px] overflow-hidden rounded-[12px]">
          {item.image}
        </div>
        <div>
          <b className="font-display text-md block font-(--font-weight-display)">
            <bdi>{item.name}</bdi>
          </b>
          {item.details.map((detail) => (
            <span className="text-ink-2 block text-sm" key={detail}>
              {detail}
            </span>
          ))}
        </div>
      </div>
      <dl className="mt-[16px] mb-0 grid gap-[8px]">
        <div className={row}>
          <dt className={term}>{labels.recipient}</dt>
          <dd className="m-0">
            <bdi>{recipient.name}</bdi>
            <br />
            <bdi>{recipient.address}</bdi>
          </dd>
        </div>
        <div className={row}>
          <dt className={term}>{labels.date}</dt>
          <dd className="m-0">{date}</dd>
        </div>
        {card === undefined || card.message === "" ? null : (
          <div className={row}>
            <dt className={term}>{labels.card}</dt>
            <dd className="m-0">
              <bdi>{card.message}</bdi>
              {card.signature === undefined || card.signature === "" ? null : (
                <>
                  {" "}
                  <bdi>{card.signature}</bdi>
                </>
              )}
            </dd>
          </div>
        )}
      </dl>
      <div className="border-ink/18 mt-[16px] flex items-baseline justify-between gap-[16px] border-t border-solid pt-[14px]">
        <span className="font-bold">{totalLabel}</span>
        <strong className={`${MONEY_FIGURE} text-[32px]`}>
          {formatMoney(total, locale)}
        </strong>
      </div>
      {note === undefined ? null : (
        <p className="text-ink-2 mt-[6px] mb-0 text-sm">{note}</p>
      )}
    </aside>
  );
}
