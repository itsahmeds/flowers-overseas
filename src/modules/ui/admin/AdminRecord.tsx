/**
 * Admin record primitives: the page head with its sub-line, the back link, the reference link,
 * the pager, sections and cards, the key-value list, the banner, the event timeline with its
 * expandable payloads, and the two-column record layout (spec 012 §5.3 "Admin primitives"; the
 * Admin group of `docs/design/system/components.dc.html` — `.ad-head`, `.ad-sub`, `.ad-back`,
 * `.ad-ref`, `.ad-pager`, `.ad-cols`, `.ad-sec`, `.ad-card`, `.ad-kv`, `.ad-banner`, `.ad-tl`,
 * `.ad-pre` — as the artboards `admin-orders-{desktop,mobile}.dc.html` and
 * `admin-order-detail-{desktop,mobile}.dc.html` draw them; TASK-222).
 *
 * Imported by `src/app/admin` from this file and kept out of the `src/modules/ui` barrel, like
 * `AdminData.tsx`. Presentational only: every word arrives as a prop, no component reads data,
 * and nothing here is interactive beyond a native `<details>`. Logical properties only.
 */
import type { ReactElement, ReactNode } from "react";

/* ---------------------------------------------------------------- page head */

/** The page head: the title and a sub-line of chips and facts (`.ad-head`, `.ad-sub`). */
export function AdminRecordHead({
  title,
  sub,
  display = false,
}: {
  readonly title: ReactNode;
  readonly sub?: ReactNode;
  /** The title in the display face (an order reference, `.ad-h1 .num`). */
  readonly display?: boolean;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-[24px] gap-y-[12px]">
      <div>
        <h1
          className={`text-[26px] leading-[1.1] tracking-[-0.01em] md:text-[32px] ${
            display ? "font-display [font-variant-numeric:lining-nums]" : ""
          }`}
        >
          {title}
        </h1>
        {sub === undefined ? null : (
          <p className="text-ink-3 mt-[6px] flex flex-wrap items-center gap-x-[12px] gap-y-[6px] text-[14px]">
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

/** The link back to the list (`.ad-back`). */
export function AdminBackLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <a
      href={href}
      className="text-link -mb-[8px] inline-flex min-h-[32px] items-center gap-[4px] self-start justify-self-start text-[14px] font-bold no-underline"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="size-[18px] rtl:-scale-x-100"
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
      {children}
    </a>
  );
}

/** A record's reference as the link that opens it (`.ad-ref`). */
export function AdminRefLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <a
      href={href}
      className="text-ink decoration-rule inline-flex min-h-[24px] items-center font-bold tracking-[0.02em] [font-variant-numeric:lining-nums_tabular-nums] underline underline-offset-[3px]"
    >
      {children}
    </a>
  );
}

/** The reference as plain bold text, where the whole card is the link (`b.ad-ref`). */
export function AdminRef({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <b className="text-ink decoration-rule font-bold tracking-[0.02em] [font-variant-numeric:lining-nums_tabular-nums] underline underline-offset-[3px]">
      {children}
    </b>
  );
}

/** The pager line under a list (`.ad-pager`): the range, and the links that exist. */
export function AdminPager({
  summary,
  previous,
  next,
  label,
}: {
  readonly summary: string;
  readonly previous?: { readonly href: string; readonly label: string };
  readonly next?: { readonly href: string; readonly label: string };
  /** The navigation's accessible name, when there is a link to name. */
  readonly label: string;
}): ReactElement {
  const link = (target: { href: string; label: string }) => (
    <a
      href={target.href}
      className="text-link inline-flex min-h-[24px] items-center text-[14px] font-bold underline underline-offset-[3px]"
    >
      {target.label}
    </a>
  );
  return (
    <div className="text-ink-3 flex flex-wrap items-center justify-between gap-[12px] text-[13px]">
      <span>{summary}</span>
      {previous === undefined && next === undefined ? null : (
        <nav aria-label={label} className="flex items-center gap-[16px]">
          {previous === undefined ? null : link(previous)}
          {next === undefined ? null : link(next)}
        </nav>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- layout */

/** The record on two thirds and its summary on the last third; one column below `lg` (`.ad-cols`). */
export function AdminRecordColumns({
  main,
  aside,
}: {
  readonly main: ReactNode;
  readonly aside: ReactNode;
}): ReactElement {
  return (
    <div className="grid items-start gap-[16px] lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:gap-[24px]">
      <div className="order-2 grid min-w-0 content-start gap-[24px] lg:order-1">
        {main}
      </div>
      <div className="order-1 min-w-0 lg:sticky lg:top-[20px] lg:order-2">
        {aside}
      </div>
    </div>
  );
}

/** A titled section of a record (`.ad-sec`); `note` sits at the end of the title row. */
export function AdminSection({
  title,
  note,
  children,
}: {
  readonly title: string;
  readonly note?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  const heading = <h2 className="text-[20px] leading-[1.2]">{title}</h2>;
  return (
    <section className="grid min-w-0 gap-[10px]">
      {note === undefined ? (
        heading
      ) : (
        <header className="flex flex-wrap items-baseline justify-between gap-x-[16px] gap-y-[8px]">
          {heading}
          <span className="text-ink-3 text-[13px] leading-[1.45]">{note}</span>
        </header>
      )}
      {children}
    </section>
  );
}

/** A card (`.ad-card`), optionally titled; `flush` keeps only the block padding of a list. */
export function AdminCard({
  title,
  flush = false,
  children,
}: {
  readonly title?: string;
  readonly flush?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      className={`bg-card grid min-w-0 gap-[12px] rounded-[12px] shadow-[inset_0_0_0_1px_var(--color-rule)] ${
        flush
          ? "px-[16px] py-[4px] md:px-[20px]"
          : "px-[16px] py-[14px] md:px-[20px] md:py-[18px]"
      }`}
    >
      {title === undefined ? null : (
        <h2 className="text-[20px] leading-[1.2]">{title}</h2>
      )}
      {children}
    </div>
  );
}

/** One pair of the key-value list. */
export interface AdminKeyValue {
  readonly key: string;
  readonly label: ReactNode;
  readonly value: ReactNode;
  /** Tabular figures (`.ad-num`). */
  readonly numeric?: boolean;
  /** Bold and end-aligned, as a total in a totals foot. */
  readonly emphasis?: boolean;
}

/**
 * The key-value list (`.ad-kv`): `tight` for the summary card's narrower keys, `totals` for the
 * lines table's foot (the key takes the room, the amount sits at the end).
 */
export function AdminKeyValues({
  items,
  variant = "default",
}: {
  readonly items: readonly AdminKeyValue[];
  readonly variant?: "default" | "tight" | "totals";
}): ReactElement {
  const columns =
    variant === "totals"
      ? "grid-cols-[minmax(0,1fr)_auto]"
      : variant === "tight"
        ? "grid-cols-[110px_minmax(0,1fr)]"
        : "grid-cols-[112px_minmax(0,1fr)] md:grid-cols-[140px_minmax(0,1fr)]";
  return (
    <dl
      className={`grid gap-x-[12px] gap-y-[6px] text-[14px] md:gap-x-[16px] md:gap-y-[8px] ${columns}`}
    >
      {items.map((item) => (
        <div key={item.key} className="contents">
          <dt className="text-ink-3">{item.label}</dt>
          <dd
            className={`text-ink [overflow-wrap:anywhere] ${
              item.numeric === true
                ? "[font-variant-numeric:lining-nums_tabular-nums]"
                : ""
            } ${variant === "totals" ? "text-end" : ""} ${
              item.emphasis === true ? "font-bold" : ""
            }`}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A quiet sentence in place of a block (`.ad-banner`): hidden by role, no payment, no actions. */
export function AdminBanner({
  children,
  small = false,
}: {
  readonly children: ReactNode;
  readonly small?: boolean;
}): ReactElement {
  return (
    <p
      className={`bg-paper-2 flex flex-wrap items-center gap-x-[12px] gap-y-[6px] rounded-[10px] px-[14px] py-[10px] shadow-[inset_0_0_0_1px_var(--color-rule)] ${
        small ? "text-[13px]" : "text-[14px]"
      }`}
    >
      {children}
    </p>
  );
}

/** A quiet note (`.ad-note`). */
export function AdminQuiet({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span className="text-ink-3 text-[13px] leading-[1.45]">{children}</span>
  );
}

/* ---------------------------------------------------------------- timeline */

/** One entry of the timeline. */
export interface AdminTimelineEntry {
  readonly key: string;
  readonly seq: string;
  readonly event: ReactNode;
  readonly when: string;
  readonly meta: ReactNode;
  /** The raw payload, already pretty-printed. */
  readonly payload: string;
}

/**
 * The event timeline (`.ad-tl`): sequence, event, time and a meta line, each with its raw
 * payload in a native `<details>` whose summary reads "Show" closed and "Hide" open.
 */
export function AdminTimeline({
  entries,
  showLabel,
  hideLabel,
}: {
  readonly entries: readonly AdminTimelineEntry[];
  readonly showLabel: string;
  readonly hideLabel: string;
}): ReactElement {
  return (
    <ol className="grid">
      {entries.map((entry) => (
        <li
          key={entry.key}
          className="border-rule grid grid-cols-[30px_minmax(0,1fr)] gap-x-[12px] gap-y-[2px] border-b py-[10px] text-[14px] last:border-b-0 md:grid-cols-[34px_minmax(0,1fr)_auto]"
        >
          <span className="bg-paper-2 text-ink-2 row-span-2 inline-grid size-[26px] place-items-center rounded-full text-[12px] font-bold tabular-nums shadow-[inset_0_0_0_1px_var(--color-rule)]">
            {entry.seq}
          </span>
          <span className="[&_code]:text-ink [&_code]:text-[13px] [&_code]:font-bold">
            {entry.event}
          </span>
          <span className="text-ink-3 col-start-2 text-[13px] whitespace-nowrap tabular-nums md:col-start-3 md:text-end">
            {entry.when}
          </span>
          <span className="text-ink-3 [&_code]:text-ink-2 col-start-2 text-[13px] md:col-span-2 [&_code]:text-[12px]">
            {entry.meta}
          </span>
          <details className="group col-start-2 mt-[6px] md:col-span-2">
            <summary className="text-link inline-flex min-h-[24px] cursor-pointer items-center text-[13px] font-bold">
              <span className="group-open:hidden">{showLabel}</span>
              <span className="hidden group-open:inline">{hideLabel}</span>
            </summary>
            <pre className="bg-paper-2 text-ink-2 mt-[6px] rounded-[8px] px-[14px] py-[12px] font-mono text-[12.5px] leading-[1.55] [overflow-wrap:anywhere] whitespace-pre-wrap shadow-[inset_0_0_0_1px_var(--color-rule)]">
              {entry.payload}
            </pre>
          </details>
        </li>
      ))}
    </ol>
  );
}
