/**
 * The header's search (spec 045 §2.1 as amended by §14 A-orchestrator-2026-10-24 items 1 and 4,
 * §5.3, AC-1, AC-2, AC-34; TASK-404; `docs/design/wireframes/search-results-desktop.dc.html`
 * "Header search opened", PR 372's `chrome-desktop.dc.html` and `chrome-mobile.dc.html` icons).
 *
 *  - **`HeaderSearchDisclosure`**, from `md`: PR 372's 44 px search icon as the `<summary>` of a
 *    native `<details name="fo-mega">`, named by `nav.search.submit`. It shares the mega menu's
 *    group, so opening it closes any open mega panel and opening a panel closes it, natively. Its
 *    panel hangs under the header row like the mega panels (absolutely placed inside the sticky
 *    header), so the row does not grow and `HEADER_STICKY_HEIGHTS` is unchanged; closed in the
 *    server HTML, so its form is out of the tab order until it is opened.
 *  - **`HeaderSearchForm`**: the one `<form role="search" method="get">` of a panel: the hidden
 *    `to` only on a page with a destination, the field (`q`, `maxlength="80"`,
 *    `autocomplete="off"`, `enterkeyhint="search"`) named by `nav.search.label`, which is also its
 *    visible hint (spec 045 §8: "a label that equals the visible placeholder words"), and the
 *    submit button `nav.search.submit`. The Menu holds the same form (`MenuSheet`'s `search`).
 *  - **`HeaderSearchLink`**, below `md`: the phone row's icon link to the search page, with
 *    `?to=` on a page with a destination.
 *
 * Server Components, no island, no `<button>` outside a form: with JavaScript off the summary opens
 * the panel and Enter submits the GET form. The design's "the field takes focus on open", Esc and
 * the close mark need script; they belong to spec 004's deferred island and its byte budget, not
 * to a new island (A-orchestrator item 4), so nothing here draws a mark that would do nothing.
 * Logical properties only, so `/ar-XB` mirrors; every string arrives as a prop from the header.
 */
import type { ReactElement } from "react";

import { MEGA_MENU_GROUP } from "../../../config/mega-menu.ts";
import { SEARCH_CONFIG, SEARCH_PARAM } from "../../../config/search.ts";
import { Icon } from "../icons/Icon.tsx";
import { VisuallyHidden } from "../primitives/a11y.tsx";
import { PAGE_FRAME } from "../primitives/layout.tsx";
import type { HeaderSearchForm as HeaderSearchFormModel } from "./header-model.ts";

/** The words a search control prints: the reviewed `nav.search.*` keys, resolved by the header. */
export interface HeaderSearchLabels {
  /** `nav.search.label`: the field's name and visible hint. */
  readonly label: string;
  /** `nav.search.submit`: the button, the summary's name and the phone link's name. */
  readonly submit: string;
}

/**
 * PR 372's `.cm-ico`: a 44 px round icon target, ink on paper, a paper-3 wash on hover, the focus
 * ring; open, the board's `.sr-ico.on` sage wash.
 */
const ICON_TARGET =
  "text-ink hover:bg-paper-3 inline-grid size-(--target-min) place-items-center rounded-full no-underline focus-visible:outline-[2.5px] focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-focus";

export interface HeaderSearchFormProps extends HeaderSearchLabels {
  readonly form: HeaderSearchFormModel;
  /** Unique per form in the document (`header-search`, `menu-search`). */
  readonly idPrefix: string;
}

/** The board's `.sr-form` with `.sr-go`: the field and its button in one pill. */
export function HeaderSearchForm({
  form,
  label,
  submit,
  idPrefix,
}: HeaderSearchFormProps): ReactElement {
  const id = `${idPrefix}-q`;
  return (
    <form
      action={form.action}
      className="bg-card focus-within:outline-focus flex min-h-[54px] w-full items-center gap-[10px] rounded-full ps-[18px] pe-[5px] shadow-[inset_0_0_0_1.5px_var(--color-ink)] focus-within:outline-[2.5px] focus-within:outline-offset-2 focus-within:outline-solid max-md:gap-[8px] max-md:ps-[14px]"
      data-fo-header-search-form={idPrefix}
      method="get"
      role="search"
    >
      <span aria-hidden="true" className="text-ink-2 flex flex-none">
        <Icon name="search" size={20} strokeWidth={1.8} />
      </span>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        autoComplete="off"
        className="text-ui text-ink placeholder:text-ink-3 min-h-[44px] w-full min-w-0 flex-1 border-0 bg-transparent p-0 outline-none max-md:text-sm [&::-webkit-search-cancel-button]:hidden"
        enterKeyHint="search"
        id={id}
        maxLength={SEARCH_CONFIG.maxQueryChars}
        name={SEARCH_PARAM.q}
        placeholder={label}
        type="search"
      />
      {/* After the field, so the submitted address reads `?q=…&to=…` (spec 045 AC-2). */}
      {form.to === undefined ? null : (
        <input name={SEARCH_PARAM.to} type="hidden" value={form.to} />
      )}
      <button
        className="bg-accent text-accent-ink text-ui inline-flex min-h-(--target-min) flex-none cursor-pointer items-center justify-center rounded-full border-0 px-[20px] font-bold max-md:px-[16px] max-md:text-sm"
        type="submit"
      >
        {submit}
      </button>
    </form>
  );
}

export interface HeaderSearchDisclosureProps extends HeaderSearchLabels {
  readonly form: HeaderSearchFormModel;
  readonly className?: string;
}

/** From `md`: the icon as a `<details>` summary in the `fo-mega` group, the form in its panel. */
export function HeaderSearchDisclosure({
  form,
  label,
  submit,
  className,
}: HeaderSearchDisclosureProps): ReactElement {
  return (
    <details
      className={["group/search static", className].filter(Boolean).join(" ")}
      data-fo-header-search=""
      name={MEGA_MENU_GROUP}
    >
      <summary
        className={`${ICON_TARGET} group-open/search:bg-sage-wash cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden`}
        data-fo-header-search-summary=""
      >
        <Icon name="search" size={22} strokeWidth={1.8} />
        <VisuallyHidden>{submit}</VisuallyHidden>
      </summary>
      {/* The board's `.sr-hdpanel`: a paper band under the header row, its rule below, the form
          centred up to 760 px. */}
      <div
        className="bg-surface border-rule absolute start-0 end-0 top-full border-b pt-[14px] pb-[16px]"
        data-fo-header-search-panel=""
      >
        <div className={`flex items-center ${PAGE_FRAME}`}>
          <div className="mx-auto w-full max-w-[760px]">
            <HeaderSearchForm
              form={form}
              idPrefix="header-search"
              label={label}
              submit={submit}
            />
          </div>
        </div>
      </div>
    </details>
  );
}

export interface HeaderSearchLinkProps {
  readonly href: string;
  /** `nav.search.submit`: the link's name. */
  readonly name: string;
  readonly className?: string;
}

/** Below `md`: the 64 px row's search icon, a link to the search page (PR 372's phone row). */
export function HeaderSearchLink({
  href,
  name,
  className,
}: HeaderSearchLinkProps): ReactElement {
  return (
    <a
      className={[ICON_TARGET, className].filter(Boolean).join(" ")}
      data-fo-header-item="search"
      href={href}
    >
      <Icon name="search" size={22} strokeWidth={1.8} />
      <VisuallyHidden>{name}</VisuallyHidden>
    </a>
  );
}
