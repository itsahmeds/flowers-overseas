"use client";

/**
 * `ConsentSettings` (spec 004 §5.3, §8, AC-20; TASK-051).
 *
 * The per-category panel, in its own chunk: the island imports it with `next/dynamic` **on open**,
 * so a visitor who accepts or refuses at the sheet never downloads it (§5.3's "settings-open"
 * state, and the byte discipline of §14 A1). It is `ssr: false` for the same reason the island is:
 * the cached HTML must be identical for every visitor.
 *
 * Controlled, and stateless on purpose: `choices` and `onToggle` come from the island, so the
 * three §5.3 states — `default` (all non-essential off), `dirty`, `saved` — are reachable by
 * rendering this component with different props, in `tests/unit/consent-islands.test.tsx`, with no
 * browser and no interaction driver.
 *
 * ## What the law puts in this markup
 *
 *  - **Nothing non-essential is pre-ticked** (§8, AC-20). The default `choices` the island passes
 *    on a first visit are both `false`, and this component has no default of its own to disagree
 *    with. A real `<input type="checkbox">` is used rather than a styled `role="switch"` div, so
 *    "unchecked" is a fact in the accessibility tree and not a class name.
 *  - **Essential is shown, locked, and explained.** A disabled checked box would be a control that
 *    lies about being a control, so the essential group renders its reason as text with no input at
 *    all, which is also what keeps every input on this panel operable (WCAG 2.1.1, 4.1.2).
 *  - **Every register row is listed with its purpose and lifetime** (AC-20's last clause), and a
 *    category we have declared but do not use yet says so instead of showing an empty table — the
 *    reason `consentView()` projects `cookieCategories` rather than the rows it happens to have.
 */
import { Fragment, useEffect, useRef, type ReactElement } from "react";

import { CONSENT_CONTROL_SM } from "./ConsentBannerView";
import type { ConsentChoices } from "./consentCookie";
import type {
  ConsentCategoryKey,
  ConsentCategoryView,
  ConsentStrings,
} from "./consentTypes";

export interface ConsentSettingsPanelProps {
  readonly strings: ConsentStrings;
  readonly categories: readonly ConsentCategoryView[];
  readonly choices: ConsentChoices;
  readonly onToggle: (category: "analytics" | "marketing", on: boolean) => void;
  readonly onSave: () => void;
  /** Unique per instance, so the gallery can render two panels in one document. */
  readonly idPrefix: string;
  /**
   * Move focus to the panel's heading on mount. **Off by default**, and that default is the
   * point: the island passes `true` because a press opened the panel, and the component gallery
   * passes nothing because it renders the panel as a picture. A component that grabbed focus
   * unconditionally stole it from `/dev/components`' skip link, which is how this prop was found.
   */
  readonly takeFocus?: boolean | undefined;
}

/** The two categories a visitor decides. `essential` is never one of them (§8). */
function isDecidable(
  key: ConsentCategoryKey,
): key is "analytics" | "marketing" {
  return key === "analytics" || key === "marketing";
}

function CookieRows({
  category,
  idPrefix,
}: {
  readonly category: ConsentCategoryView;
  readonly idPrefix: string;
}): ReactElement | null {
  if (category.cookies.length === 0) {
    // No rows and no note: render nothing rather than an empty paragraph (`/review 36` nit 7).
    // Every register category that reaches Phase 0 has a note; a future category with neither
    // reserves no box.
    return category.emptyNote === undefined ? null : (
      <p className="text-ink-subtle text-xs">{category.emptyNote}</p>
    );
  }
  return (
    <dl className="mt-xs gap-x-md gap-y-xs grid grid-cols-[minmax(0,1fr)_auto] text-xs">
      {category.cookies.map((cookie) => (
        <Fragment key={`${idPrefix}-${cookie.name}`}>
          <dt className="text-ink-muted">
            <code className="text-ink">{cookie.name}</code>
            {/* A separator, not copy: no letters, so no message key (the `banner.dismiss`
                precedent in spec 003's island). */}
            <span aria-hidden="true">{" — "}</span>
            {cookie.purpose}
          </dt>
          <dd className="text-ink-subtle m-0 text-end whitespace-nowrap">
            {cookie.lifetime}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function ConsentSettingsPanel({
  strings,
  categories,
  choices,
  onToggle,
  onSave,
  idPrefix,
  takeFocus = false,
}: ConsentSettingsPanelProps): ReactElement {
  const headingId = `${idPrefix}-settings-heading`;
  const heading = useRef<HTMLHeadingElement>(null);
  // Opened by an explicit press, so moving focus into it is the visitor's own navigation —
  // AC-17's "does not steal focus" is about the sheet *appearing*, not about a panel the visitor
  // asked for. Without it, a keyboard visitor presses "Choose" and the controls they asked for are
  // behind them in the tab order. The island returns focus to the trigger when the panel closes.
  useEffect(() => {
    if (takeFocus) heading.current?.focus();
  }, [takeFocus]);
  return (
    <div
      aria-labelledby={headingId}
      className="border-border mt-md pt-md border-t"
      data-fo-consent-panel=""
      role="group"
    >
      <h3
        className="text-ink text-sm font-medium"
        id={headingId}
        ref={heading}
        // `-1`: focusable by script for the reason above, and out of the tab order afterwards.
        tabIndex={-1}
      >
        {strings.settingsHeadline}
      </h3>
      <ul className="mt-sm gap-md grid list-none p-0">
        {categories.map((category) => {
          const key = category.key;
          const inputId = `${idPrefix}-category-${key}`;
          const decidable = isDecidable(key);
          return (
            <li key={key}>
              {decidable ? (
                // The tap target is the **row**, not the 18 px box (§5.3, §8: ≥44 px). A
                // `<label>` wrapping its own checkbox is full-width and ≥44 px tall, so the whole
                // line is tappable and the accessible name stays exactly the category name — the
                // purpose, the lifetimes and the cookie table sit outside it, where they neither
                // lengthen that name nor swallow a press meant for the text. `/review 36`
                // measured the bare box at 13 × 18 px.
                <label
                  className="gap-sm py-xs flex min-h-[44px] w-full cursor-pointer items-center"
                  data-fo-consent-row={key}
                  htmlFor={inputId}
                >
                  <input
                    checked={choices[key]}
                    className="accent-accent size-[18px] shrink-0"
                    data-fo-consent-category={key}
                    id={inputId}
                    onChange={(event) => {
                      onToggle(key, event.target.checked);
                    }}
                    type="checkbox"
                  />
                  <span className="text-ink text-sm font-medium">
                    {category.name}
                  </span>
                </label>
              ) : (
                <p className="text-ink py-xs text-sm font-medium">
                  {category.name}
                </p>
              )}
              {/* Indented to the label's text column so the row reads as one group. */}
              <div className={decidable ? "ps-[26px]" : undefined}>
                <p className="text-ink-muted text-xs">{category.purpose}</p>
                {category.lockedReason === undefined ? null : (
                  <p
                    className="text-ink-subtle text-xs"
                    data-fo-consent-locked=""
                  >
                    {category.lockedReason}
                  </p>
                )}
                <CookieRows category={category} idPrefix={inputId} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-md">
        <button
          className={CONSENT_CONTROL_SM}
          data-fo-consent-action="save"
          onClick={onSave}
          type="button"
        >
          {strings.save}
        </button>
      </div>
    </div>
  );
}

export default ConsentSettingsPanel;
