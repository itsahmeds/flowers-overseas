/**
 * Admin data primitives: the filter bar, the dense data table, chips, the before/after diff, the
 * card rows of the 390 layout and the empty state (spec 012 §5.3 "Admin primitives"; the Admin
 * group of `docs/design/system/components.dc.html` — `.ad-filters`, `.ad-t`, `.ad-chip`,
 * `.ad-diff`, `.ad-mask`, `.ad-rows`, `.ad-empty` — and the artboards
 * `admin-audit-{desktop,mobile}.dc.html`; TASK-218).
 *
 * Imported by `src/app/admin` from this file and kept out of the `src/modules/ui` barrel, like
 * `AdminChrome.tsx`. Presentational only: every word arrives as a prop from the admin catalogue,
 * and no component reads data. Logical properties only. The sheet's measures (36 px controls,
 * 14 px tables, 12 px radii) are kept as arbitrary values where the token scale has no step.
 */
import type { ReactElement, ReactNode } from "react";

/* ---------------------------------------------------------------- filter bar */

/** The filter bar: a GET form, so a filtered view is a URL (`.ad-filters`). */
export function AdminFilterBar({
  children,
  stacked = false,
  label,
  action,
}: {
  readonly children: ReactNode;
  /** One column, as inside the 390 disclosure. */
  readonly stacked?: boolean;
  /** The form's accessible name ("Filter orders"). */
  readonly label?: string;
  /** The page the filters apply to; the current one when absent. */
  readonly action?: string;
}): ReactElement {
  return (
    <form
      method="get"
      {...(label === undefined ? {} : { "aria-label": label })}
      {...(action === undefined ? {} : { action })}
      className={`bg-card gap-x-[12px] gap-y-[10px] rounded-[12px] px-[14px] py-[12px] shadow-[inset_0_0_0_1px_var(--color-rule)] ${
        stacked ? "grid grid-cols-[minmax(0,1fr)]" : "flex flex-wrap items-end"
      }`}
    >
      {children}
    </form>
  );
}

const FIELD_LABEL =
  "text-[12px] font-bold tracking-[0.08em] text-ink-3 uppercase";
const FIELD_CONTROL =
  "border-field-edge bg-card text-ink min-h-[36px] rounded-[8px] border-[1.5px] px-[10px] text-[14px]";

/** One choice of a filter select. */
export interface AdminOption {
  readonly value: string;
  readonly label: string;
}

/** A labelled select whose first option is "any" (`.ad-f` + `.ad-in.sel`). */
export function AdminFilterSelect({
  id,
  name,
  label,
  anyLabel,
  options,
  value,
  stacked = false,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly anyLabel: string;
  readonly options: readonly AdminOption[];
  readonly value: string | undefined;
  readonly stacked?: boolean;
}): ReactElement {
  return (
    <div className="grid min-w-0 gap-[4px]">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value ?? ""}
        className={`${FIELD_CONTROL} ${value === undefined ? "text-ink-3" : ""} ${stacked ? "w-full" : "min-w-[140px]"}`}
      >
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A date range under one visible label; each input carries its own name (`.ad-range`). */
export function AdminFilterDateRange({
  idPrefix,
  names = ["from", "to"],
  label,
  fromLabel,
  toLabel,
  from,
  to,
  stacked = false,
}: {
  readonly idPrefix: string;
  /** The two inputs' query keys; `from` and `to` unless a page names its own. */
  readonly names?: readonly [string, string];
  readonly label: string;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly from: string | undefined;
  readonly to: string | undefined;
  readonly stacked?: boolean;
}): ReactElement {
  const input = (
    key: "from" | "to",
    name: string,
    value: string | undefined,
  ) => (
    <>
      <label htmlFor={`${idPrefix}-${key}`} className="sr-only">
        {name}
      </label>
      <input
        id={`${idPrefix}-${key}`}
        name={key === "from" ? names[0] : names[1]}
        type="date"
        defaultValue={value ?? ""}
        className={`${FIELD_CONTROL} ${stacked ? "w-full min-w-0" : "min-w-[118px]"}`}
      />
    </>
  );
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={`${FIELD_LABEL} mb-[4px] p-0`}>{label}</legend>
      <div className="flex items-center gap-[6px]">
        {input("from", fromLabel, from)}
        {input("to", toLabel, to)}
      </div>
    </fieldset>
  );
}

/** The filter bar's submit (`.ad-btn`). */
export function AdminFilterSubmit({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <button
      type="submit"
      className="bg-ink text-paper inline-flex min-h-[36px] cursor-pointer items-center justify-center rounded-[8px] px-[14px] text-[14px] font-bold whitespace-nowrap"
    >
      {children}
    </button>
  );
}

/** The link beside the submit that clears every filter (`.ad-a`, centred on the row). */
export function AdminFilterClear({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <a
      href={href}
      className="text-link inline-flex min-h-[36px] items-center self-center text-[14px] font-bold underline underline-offset-[3px]"
    >
      {children}
    </a>
  );
}

/** The 390 disclosure around the filter bar (`.ad-mfilters`). */
export function AdminFilterDisclosure({
  summary,
  children,
}: {
  readonly summary: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <details className="group">
      <summary className="bg-card text-ink inline-flex min-h-[40px] cursor-pointer list-none items-center gap-[8px] rounded-[8px] px-[14px] text-[14px] font-bold shadow-[inset_0_0_0_1px_var(--color-field-edge)] [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      <div className="mt-[10px]">{children}</div>
    </details>
  );
}

/* ---------------------------------------------------------------- data table */

/** One column header of `AdminTable`; `hidden` columns are named for screen readers only. */
export interface AdminColumn {
  readonly key: string;
  readonly label: string;
  readonly hidden?: boolean;
  /** `end` for amounts and rates (`.ad-t .r`). */
  readonly align?: "start" | "end";
}

/** The dense data table (`.ad-tw` + `.ad-t`). Rows are `AdminRow`s; `foot` is one full-width cell. */
export function AdminTable({
  columns,
  children,
  foot,
}: {
  readonly columns: readonly AdminColumn[];
  readonly children: ReactNode;
  readonly foot?: ReactNode;
}): ReactElement {
  return (
    <div className="bg-card overflow-hidden rounded-[12px] shadow-[inset_0_0_0_1px_var(--color-rule)]">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`bg-paper-2 border-rule text-ink-3 border-b px-[14px] py-[9px] text-[12px] font-bold tracking-[0.08em] whitespace-nowrap uppercase ${
                  column.align === "end" ? "text-end" : "text-start"
                }`}
              >
                {column.hidden === true ? (
                  <span className="sr-only">{column.label}</span>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">{children}</tbody>
        {foot === undefined ? null : (
          <tfoot>
            <tr>
              <td
                colSpan={columns.length}
                className="bg-paper-2 border-rule border-t px-[14px] py-[10px]"
              >
                {foot}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/**
 * A table row; `highlight` is the expanded or new row (`tr.new`, sage wash); `muted` is a row
 * that cannot act, in the quiet ink (`tr.muted`: the flags page's orphaned key).
 */
export function AdminRow({
  highlight = false,
  muted = false,
  children,
}: {
  readonly highlight?: boolean;
  readonly muted?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  const classes = [
    highlight ? "[&>td]:bg-sage-wash" : "",
    muted ? "[&>td]:text-ink-3" : "",
  ]
    .filter((name) => name !== "")
    .join(" ");
  return <tr className={classes === "" ? undefined : classes}>{children}</tr>;
}

/**
 * A table cell (`.ad-t td`); `nowrap` for times, `colSpan` for a detail row, `top` for a table
 * whose cells hold lists (`--va: top`, the flags page), `end` for amounts.
 */
export function AdminCell({
  children,
  nowrap = false,
  colSpan,
  plain = false,
  top = false,
  align = "start",
}: {
  readonly children: ReactNode;
  readonly nowrap?: boolean;
  readonly colSpan?: number;
  /** The detail row's paper background instead of the row's. */
  readonly plain?: boolean;
  readonly top?: boolean;
  /** `end`: right-aligned tabular figures that do not wrap (`.ad-t .r`). */
  readonly align?: "start" | "end";
}): ReactElement {
  return (
    <td
      {...(colSpan === undefined ? {} : { colSpan })}
      className={`border-rule border-b px-[14px] py-[10px] ${top ? "align-top" : "align-middle"} ${nowrap ? "whitespace-nowrap tabular-nums" : ""} ${plain ? "!bg-paper" : ""} ${
        align === "end"
          ? "text-end whitespace-nowrap [font-variant-numeric:lining-nums_tabular-nums]"
          : ""
      }`}
    >
      {children}
    </td>
  );
}

/** A code name (a table, an action) in a cell. */
export function AdminCode({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return <code className="text-[13px]">{children}</code>;
}

/** A second, quieter line under a cell's value (`.ad-2`). */
export function AdminSecondLine({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title?: string;
}): ReactElement {
  return (
    <span
      className="text-ink-3 block text-[13px]"
      {...(title === undefined ? {} : { title })}
    >
      {children}
    </span>
  );
}

/** A quiet note in a cell ("None", "No values"; `.ad-note`). */
export function AdminNote({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span className="text-ink-3 text-[13px] leading-[1.45]">{children}</span>
  );
}

/** A link inside a table (`.ad-a`). */
export function AdminTableLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <a
      href={href}
      className="text-link inline-flex min-h-[24px] items-center text-[14px] font-bold underline underline-offset-[3px]"
    >
      {children}
    </a>
  );
}

/**
 * The chip tones of the sheet (`.ad-chip` and its variants): plain and ink (the audit log); bad
 * and warn (the flags page: a high-risk flag, an orphaned key); sky for a moving order, ok for a
 * done one, bad for one that needs a person, and the dashed demo marker (the order queue).
 */
export type AdminChipTone =
  "plain" | "ink" | "sky" | "ok" | "bad" | "warn" | "demo";

const CHIP_TONES: Readonly<Record<AdminChipTone, string>> = {
  plain: "bg-paper-3 text-ink-2",
  ink: "bg-ink text-paper",
  sky: "bg-sage-wash text-sky-strong",
  ok: "bg-leaf-wash text-stem",
  bad: "bg-blush text-accent-strong",
  warn: "bg-butter text-ink shadow-[inset_0_0_0_1px_var(--color-warning)]",
  demo: "bg-card text-ink border border-dashed border-ink-3",
};

export function AdminChip({
  tone = "plain",
  children,
}: {
  readonly tone?: AdminChipTone;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span
      className={`inline-flex min-h-[22px] items-center gap-[5px] rounded-full px-[8px] align-middle text-[12px] font-bold whitespace-nowrap [&_code]:text-[12px] ${CHIP_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- diff */

/** One side of a diff cell: a value, a masked value ("changed"), or nothing. */
export type AdminDiffCell =
  | { readonly kind: "value"; readonly text: string }
  | { readonly kind: "masked" }
  | { readonly kind: "none" };

export interface AdminDiffRow {
  readonly column: string;
  readonly before: AdminDiffCell;
  readonly after: AdminDiffCell;
}

function DiffValue({
  cell,
  maskedLabel,
}: {
  readonly cell: AdminDiffCell;
  readonly maskedLabel: string;
}): ReactNode {
  if (cell.kind === "masked") {
    return <span className="text-ink-2 italic">{maskedLabel}</span>;
  }
  if (cell.kind === "none") return null;
  return <span className="break-all tabular-nums">{cell.text}</span>;
}

/**
 * The before/after diff (`.ad-diff`): before on blush, after on leaf wash; a masked value is the
 * word "changed" in italic on both sides, never a value (spec 012 AC-11).
 */
export function AdminDiff({
  rows,
  columnLabel,
  beforeLabel,
  afterLabel,
  maskedLabel,
}: {
  readonly rows: readonly AdminDiffRow[];
  readonly columnLabel: string;
  readonly beforeLabel: string;
  readonly afterLabel: string;
  readonly maskedLabel: string;
}): ReactElement {
  const head =
    "border-rule text-ink-3 border-b px-[10px] py-[6px] text-start align-top text-[11px] font-bold tracking-[0.08em] uppercase";
  const cell = "border-rule border-b px-[10px] py-[6px] text-start align-top";
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <th scope="col" className={head}>
            {columnLabel}
          </th>
          <th scope="col" className={head}>
            {beforeLabel}
          </th>
          <th scope="col" className={head}>
            {afterLabel}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.column}>
            <td className={cell}>
              <code>{row.column}</code>
            </td>
            <td className={`${cell} bg-blush`}>
              <DiffValue cell={row.before} maskedLabel={maskedLabel} />
            </td>
            <td className={`${cell} bg-leaf-wash`}>
              <DiffValue cell={row.after} maskedLabel={maskedLabel} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------------------------------------------------------- 390 rows and empty */

/** The card list of the 390 layout (`.ad-rows`). */
export function AdminCardRows({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="bg-card grid overflow-hidden rounded-[12px] shadow-[inset_0_0_0_1px_var(--color-rule)] [&>*:last-child]:border-b-0">
      {children}
    </div>
  );
}

/**
 * One card (`.ad-row`): three lines and an optional body. With `href` the whole card is the link
 * that opens it; `highlight` is the open card.
 */
export function AdminCardRow({
  line1,
  subline,
  line2,
  line3,
  href,
  highlight = false,
  children,
}: {
  readonly line1: ReactNode;
  /** A second chip line under the first (the order queue's status). */
  readonly subline?: ReactNode;
  readonly line2: ReactNode;
  readonly line3: ReactNode;
  readonly href?: string;
  readonly highlight?: boolean;
  readonly children?: ReactNode;
}): ReactElement {
  const className = `border-rule text-ink grid gap-[4px] border-b px-[14px] py-[12px] text-[14px] no-underline ${
    highlight ? "bg-sage-wash" : ""
  }`;
  const body = (
    <>
      <span className="flex flex-wrap items-center gap-[6px]">{line1}</span>
      {subline === undefined ? null : (
        <span className="flex flex-wrap items-center gap-[6px]">{subline}</span>
      )}
      <span className="text-ink-2">{line2}</span>
      <span className="text-ink-3 text-[13px]">{line3}</span>
      {children}
    </>
  );
  return href === undefined ? (
    <div className={className}>{body}</div>
  ) : (
    <a href={href} className={className}>
      {body}
    </a>
  );
}

/** The empty state (`.ad-empty`): a title, and a line or a link under it. */
export function AdminEmpty({
  title,
  children,
}: {
  readonly title: string;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <div className="bg-card text-ink-2 grid justify-items-center gap-[8px] rounded-[12px] px-[24px] py-[40px] text-center shadow-[inset_0_0_0_1px_var(--color-rule)]">
      <p className="font-display text-h3 text-ink">{title}</p>
      {children}
    </div>
  );
}
