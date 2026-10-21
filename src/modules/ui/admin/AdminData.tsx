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
}: {
  readonly children: ReactNode;
  /** One column, as inside the 390 disclosure. */
  readonly stacked?: boolean;
}): ReactElement {
  return (
    <form
      method="get"
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
  label,
  fromLabel,
  toLabel,
  from,
  to,
  stacked = false,
}: {
  readonly idPrefix: string;
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
        name={key}
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
}

/** The dense data table (`.ad-tw` + `.ad-t`). Rows are `AdminRow`s. */
export function AdminTable({
  columns,
  children,
}: {
  readonly columns: readonly AdminColumn[];
  readonly children: ReactNode;
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
                className="bg-paper-2 border-rule text-ink-3 border-b px-[14px] py-[9px] text-start text-[12px] font-bold tracking-[0.08em] whitespace-nowrap uppercase"
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
 * whose cells hold lists (`--va: top`, the flags page).
 */
export function AdminCell({
  children,
  nowrap = false,
  colSpan,
  plain = false,
  top = false,
}: {
  readonly children: ReactNode;
  readonly nowrap?: boolean;
  readonly colSpan?: number;
  /** The detail row's paper background instead of the row's. */
  readonly plain?: boolean;
  readonly top?: boolean;
}): ReactElement {
  return (
    <td
      {...(colSpan === undefined ? {} : { colSpan })}
      className={`border-rule border-b px-[14px] py-[10px] ${top ? "align-top" : "align-middle"} ${nowrap ? "whitespace-nowrap tabular-nums" : ""} ${plain ? "!bg-paper" : ""}`}
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
 * The chip tones of the sheet in use: plain and ink (the audit log), bad and warn (the flags page:
 * a high-risk flag, an orphaned key) — `.ad-chip`, `.ad-chip.ink`, `.ad-chip.bad`, `.ad-chip.warn`.
 */
export type AdminChipTone = "plain" | "ink" | "bad" | "warn";

const CHIP_TONES: Readonly<Record<AdminChipTone, string>> = {
  plain: "bg-paper-3 text-ink-2",
  ink: "bg-ink text-paper",
  bad: "bg-blush text-accent-strong",
  warn: "bg-butter text-ink shadow-[inset_0_0_0_1px_var(--color-warning)]",
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
      className={`inline-flex min-h-[22px] items-center gap-[5px] rounded-full px-[8px] align-middle text-[12px] font-bold whitespace-nowrap ${CHIP_TONES[tone]}`}
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
  line2,
  line3,
  href,
  highlight = false,
  children,
}: {
  readonly line1: ReactNode;
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

/** The empty state (`.ad-empty`). */
export function AdminEmpty({
  title,
}: {
  readonly title: string;
}): ReactElement {
  return (
    <div className="bg-card text-ink-2 grid justify-items-center gap-[8px] rounded-[12px] px-[24px] py-[40px] text-center shadow-[inset_0_0_0_1px_var(--color-rule)]">
      <p className="font-display text-h3 text-ink">{title}</p>
    </div>
  );
}
