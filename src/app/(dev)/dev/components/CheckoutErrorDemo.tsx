"use client";

/**
 * The gallery's live error state (TASK-201; spec 010 AC-14, T-14 component half).
 *
 * A step's server action re-renders the page in place when JavaScript is on, so the summary
 * appears in a tree that is already hydrated: that is the case `FocusOnMount` exists for, and
 * the one a static gallery state cannot show. The button mounts an `ErrorSummary` the same way,
 * and `tests/e2e/checkout-ui.spec.ts` asserts it takes focus and links to the live form's fields.
 * Imported by file, not through `@/modules/ui/checkout`, so this gallery-only client component
 * does not pull the server primitives (and `modules/i18n`) into the browser.
 */
import { useState } from "react";
import type { ReactElement } from "react";

import {
  ErrorSummary,
  type ErrorSummaryItem,
} from "@/modules/ui/checkout/ErrorSummary.tsx";
import { buttonClass } from "@/modules/ui/checkout/styles.ts";

export interface CheckoutErrorDemoProps {
  readonly buttonId: string;
  readonly buttonLabel: string;
  readonly summaryId: string;
  readonly title: string;
  readonly items: readonly ErrorSummaryItem[];
}

export function CheckoutErrorDemo({
  buttonId,
  buttonLabel,
  summaryId,
  title,
  items,
}: CheckoutErrorDemoProps): ReactElement {
  const [shown, setShown] = useState(false);
  return (
    <div className="grid gap-[12px]">
      <button
        className={buttonClass("ghost", "sm", "justify-self-start")}
        id={buttonId}
        onClick={() => {
          setShown(true);
        }}
        type="button"
      >
        {buttonLabel}
      </button>
      {shown ? (
        <ErrorSummary id={summaryId} items={items} title={title} />
      ) : null}
    </div>
  );
}
