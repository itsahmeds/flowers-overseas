"use client";

/**
 * A submit button that shows its pending words while its form posts ("Offering…", "Cancelling…")
 * and refuses a second press meanwhile (spec 020a §5.3 dialog states "pending"; `.ad-btn.busy`;
 * TASK-358). The `actionId` the form carries blocks a second effect anyway (AC-5); this only
 * spares the admin a second round trip. Words arrive as props from the admin catalogue.
 */
import type { ReactElement } from "react";
import { useFormStatus } from "react-dom";

import { type AdminButtonTone, adminButtonClass } from "./AdminControls";

export function AdminPendingSubmit({
  tone = "ink",
  label,
  pendingLabel,
  accessibleName,
}: {
  readonly tone?: AdminButtonTone;
  readonly label: string;
  readonly pendingLabel: string;
  /** A fuller name than the visible words ("Offer this order to Pracownia Wola"). */
  readonly accessibleName?: string;
}): ReactElement {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      {...(accessibleName === undefined || pending
        ? {}
        : { "aria-label": accessibleName })}
      className={adminButtonClass(pending ? "busy" : tone)}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
