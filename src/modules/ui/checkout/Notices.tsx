/**
 * `PriceChangedNotice` and `InlinePrivacyNotice` (spec 010 §5.3 Step 1, §8 "Price display",
 * §8 "Transparency at collection"; Appendix A `checkout.price.changed`, `checkout.price.confirm`,
 * `checkout.privacy.demoNotice`; `docs/design/wireframes/checkout-desktop.dc.html` `.s10-alert`,
 * `.s10-priv`; TASK-201).
 *
 * **Price changed.** "Any price change between pages is named and confirmed, never silent" (§8):
 * the notice names both amounts and the confirm button names the new one. Both amounts reach the
 * copy only through `formatMoney` here (`CLAUDE.md`: amounts only through `Intl`), so the caller
 * hands over the two `Money` values and a translator that receives the formatted strings. It is
 * blush (it blocks the step) and a sentence first: the colour is never the message.
 *
 * **Privacy at collection** (GDPR Art. 13, §8): the demo notice and, beside it, the sample-details
 * button. Paper, because it informs. The sentence is the caller's rich text (its first sentence
 * bold, as the board draws it), with spec 041's controller line inside it.
 */
import type { ReactElement, ReactNode } from "react";

import type { LocaleCode } from "@/config/locales";
import { type Money, formatMoney } from "@/modules/i18n";

import { type FormActionValue, SubmitButton } from "./SubmitButton.tsx";
import { NOTICE_BLOCKING, NOTICE_CALM } from "./styles.ts";

/** The field the confirm button posts, so the step action knows the buyer saw the new total. */
export const PRICE_CONFIRM_FIELD = "confirmedTotalMinor";

export interface PriceChangedNoticeProps {
  readonly locale: LocaleCode;
  /** The total the product page showed. */
  readonly previous: Money;
  /** The total of the current quote. */
  readonly current: Money;
  /** `checkout.price.changed`, given the two formatted amounts (rich: the first sentence bold). */
  readonly message: (amounts: {
    readonly previous: string;
    readonly current: string;
  }) => ReactNode;
  /** `checkout.price.confirm`, given the new formatted amount. */
  readonly confirmLabel: (current: string) => string;
  readonly formAction?: FormActionValue;
}

export function PriceChangedNotice({
  locale,
  previous,
  current,
  message,
  confirmLabel,
  formAction,
}: PriceChangedNoticeProps): ReactElement {
  const amounts = {
    previous: formatMoney(previous, locale),
    current: formatMoney(current, locale),
  };
  return (
    <div className={NOTICE_BLOCKING} data-fo-price-changed="" role="alert">
      <p className="m-0">{message(amounts)}</p>
      <SubmitButton
        className="max-md:w-full md:justify-self-start"
        name={PRICE_CONFIRM_FIELD}
        size="sm"
        value={String(current.amountMinor)}
        {...(formAction === undefined ? {} : { formAction })}
      >
        {confirmLabel(amounts.current)}
      </SubmitButton>
    </div>
  );
}

export interface InlinePrivacyNoticeProps {
  /** `checkout.privacy.demoNotice`, resolved (rich), with the controller line inside it. */
  readonly message: ReactNode;
  /** The sample-details button, in demo; nothing in live, where the notice links the policy. */
  readonly action?: ReactNode;
}

export function InlinePrivacyNotice({
  message,
  action,
}: InlinePrivacyNoticeProps): ReactElement {
  return (
    <div
      className={`${NOTICE_CALM} items-center px-[14px] py-[14px] md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-[20px] md:px-[16px]`}
      data-fo-privacy-notice=""
      role="note"
    >
      <p className="text-ink-2 [&_b]:text-ink [&_strong]:text-ink m-0 text-sm leading-[1.45]">
        {message}
      </p>
      {action}
    </div>
  );
}
