/**
 * Admin controls: the switch, the toast and the refusal line (spec 012 §5.3 "Admin primitives";
 * the Admin group of `docs/design/system/components.dc.html` — `.ad-switch`, `.ad-toast` — and the
 * artboards `admin-flags-{desktop,mobile}.dc.html`; TASK-220).
 *
 * Kept out of the `src/modules/ui` barrel like the rest of `src/modules/ui/admin`. Presentational
 * only: every word arrives as a prop from the admin catalogue. Logical properties only.
 *
 * The switch is a `role="switch"` button that says **On** or **Off** in words beside the track
 * (never colour alone). Its accessible name is the thing switched followed by its state word
 * (`aria-labelledby` the row's name and itself), so the visible word is part of the name.
 */
import type { ReactElement, ReactNode } from "react";

/** The track and its knob (`.ad-switch .tr`), shared with the confirmation island. */
export function AdminSwitchTrack({
  checked,
}: {
  readonly checked: boolean;
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={`relative h-[22px] w-[38px] flex-none rounded-full after:absolute after:top-[3px] after:size-[16px] after:rounded-full after:content-[''] ${
        checked
          ? "bg-selected after:bg-card after:start-[19px] after:shadow-[var(--shadow-xs)]"
          : "bg-paper-3 after:bg-card shadow-[inset_0_0_0_1.5px_var(--color-field-edge)] after:start-[3px] after:shadow-[var(--shadow-xs),inset_0_0_0_1px_var(--color-field-edge)]"
      }`}
    />
  );
}

/** The switch's own classes (`.ad-switch`), shared with the confirmation island. */
export const ADMIN_SWITCH_CLASS =
  "text-ink inline-flex min-h-[32px] cursor-pointer items-center gap-[10px] border-0 bg-transparent p-0 text-[14px] font-bold";

/**
 * A switch that submits the form it sits in. `labelledBy` is the id of the element naming what
 * is switched (a country, a flag key).
 */
export function AdminSwitch({
  id,
  checked,
  labelledBy,
  onLabel,
  offLabel,
}: {
  readonly id: string;
  readonly checked: boolean;
  readonly labelledBy: string;
  readonly onLabel: string;
  readonly offLabel: string;
}): ReactElement {
  return (
    <button
      id={id}
      type="submit"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${labelledBy} ${id}`}
      className={ADMIN_SWITCH_CLASS}
    >
      <AdminSwitchTrack checked={checked} />
      {checked ? onLabel : offLabel}
    </button>
  );
}

/** The saved toast (`.ad-toast`): a polite live region. */
export function AdminToast({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <p
      role="status"
      className="bg-ink text-paper before:bg-leaf-wash inline-flex items-center gap-[10px] justify-self-start rounded-[10px] px-[14px] py-[10px] text-[14px] shadow-[var(--shadow-md)] before:size-[8px] before:flex-none before:rounded-full before:content-['']"
    >
      {children}
    </p>
  );
}

/** A refused change (`.ad-ferr` weight on the danger colour): an assertive live region. */
export function AdminRefusal({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <p
      role="alert"
      className="text-danger justify-self-start text-[14px] font-bold"
    >
      {children}
    </p>
  );
}
