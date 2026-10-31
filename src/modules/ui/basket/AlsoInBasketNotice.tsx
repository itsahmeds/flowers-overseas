/**
 * `AlsoInBasketNotice`: step 1's note that the basket holds other bouquets (spec 010 §14
 * A-founder-2026-10-22 D12, §13 Q24; `docs/design/system/components.dc.html`
 * "AlsoInBasketNotice"; TASK-349 builds it, TASK-204 mounts it).
 *
 * "Continue" on a product page checks out the whole basket, so the first screen says how many
 * other bouquets are in it, so nobody pays for a forgotten line by surprise. It informs and blocks
 * nothing, so it is paper (`.s10-alert.calm`), a status rather than an alert. The sentence is the
 * caller's plural, resolved through ICU.
 */
import type { ReactElement } from "react";

import { NOTICE_CALM } from "../checkout/styles.ts";

export interface AlsoInBasketNoticeProps {
  /** "Your basket also has 2 other bouquets. Remove any you do not want before you place your order." */
  readonly message: string;
}

export function AlsoInBasketNotice({
  message,
}: AlsoInBasketNoticeProps): ReactElement {
  return (
    <div className={NOTICE_CALM} data-fo-also-in-basket="" role="status">
      <p className="m-0">{message}</p>
    </div>
  );
}
