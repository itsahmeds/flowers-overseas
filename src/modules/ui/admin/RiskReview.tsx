/**
 * The risk review pieces (spec 021 §5.3; artboards `admin-risk-{desktop,mobile}.dc.html`, the
 * proposed `system/components` "Risk review": `.rk-score`, `.rk-tags`, `.rk-dl`, `.rk-sigs`,
 * `.rk-def`, `.rk-pii`; TASK-494). Server components; every word arrives as a prop from the admin
 * catalogue. The score is text, never colour alone; logical properties only.
 */
import type { ReactElement, ReactNode } from "react";

/** The score pill (`.rk-score`); `high` is 70 or more. */
export function RiskScore({
  score,
  high,
}: {
  readonly score: number;
  readonly high: boolean;
}): ReactElement {
  return (
    <span
      className={`inline-grid h-[24px] min-w-[34px] place-items-center rounded-full px-[8px] text-[13px] font-bold [font-variant-numeric:lining-nums_tabular-nums] ${
        high ? "bg-blush text-accent-strong" : "bg-paper-3 text-ink"
      }`}
    >
      {score}
    </span>
  );
}

/** One signal tag of a queue row (`.rk-tags span`); `hold` for an always-hold or decisive one. */
export interface RiskTag {
  readonly key: string;
  readonly label: string;
  readonly hold: boolean;
}

/** The queue row's top signals (`.rk-tags`). */
export function RiskTags({
  tags,
}: {
  readonly tags: readonly RiskTag[];
}): ReactElement {
  return (
    <div className="flex flex-wrap gap-[4px]">
      {tags.map((tag) => (
        <span
          key={tag.key}
          className={`inline-flex min-h-[22px] items-center rounded-full px-[8px] text-[12px] whitespace-nowrap ${
            tag.hold
              ? "bg-butter text-ink shadow-[inset_0_0_0_1px_var(--color-warning)]"
              : "bg-paper-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--color-rule)]"
          }`}
        >
          {tag.label}
        </span>
      ))}
    </div>
  );
}

/** How close a deadline is: `soon` under 60 minutes, `now` once passed, `none` without one. */
export type DeadlineTone = "plain" | "soon" | "now" | "none";

const DEADLINE_TONES: Readonly<Record<DeadlineTone, string>> = {
  plain:
    "bg-paper-2 shadow-[inset_0_0_0_1px_var(--color-rule)] [&>span]:text-ink-3",
  soon: "bg-butter shadow-[inset_0_0_0_1px_var(--color-warning)] [&>span]:text-ink",
  now: "bg-blush [&>span]:text-accent-strong [&>span]:font-bold",
  none: "bg-card shadow-[inset_0_0_0_1px_var(--color-ink-3)] [&>span]:text-ink-3",
};

/** The deadline chip (`.rk-dl`): the absolute time, then the time left. */
export function RiskDeadline({
  at,
  left,
  tone,
  big = false,
}: {
  readonly at: ReactNode;
  readonly left: ReactNode;
  readonly tone: DeadlineTone;
  readonly big?: boolean;
}): ReactElement {
  return (
    <span
      className={`inline-grid rounded-[8px] leading-[1.3] whitespace-nowrap [font-variant-numeric:lining-nums_tabular-nums] ${
        big
          ? "px-[14px] py-[10px] text-[15px]"
          : "px-[10px] py-[4px] text-[13px]"
      } ${DEADLINE_TONES[tone]}`}
    >
      <b className="text-ink font-bold">{at}</b>
      <span>{left}</span>
    </span>
  );
}

/** One row of the signal list (`.rk-sig`). */
export interface RiskSignalRow {
  readonly key: string;
  readonly label: string;
  readonly code: string;
  readonly points: string;
  readonly why: string;
  readonly hold: boolean;
}

/** Every signal with its points and its one-line reason, and the score row (`.rk-sigs`). */
export function RiskSignalList({
  rows,
  total,
}: {
  readonly rows: readonly RiskSignalRow[];
  readonly total?: {
    readonly label: string;
    readonly value: ReactNode;
    readonly note: string;
  };
}): ReactElement {
  const row =
    "border-rule grid grid-cols-[minmax(0,1fr)_auto] gap-x-[16px] gap-y-[2px] border-b px-[16px] py-[12px] text-[14px] last:border-b-0";
  return (
    <div className="bg-card grid rounded-[12px] shadow-[inset_0_0_0_1px_var(--color-rule)]">
      {rows.map((signal) => (
        <div key={signal.key} className={row}>
          <b className="text-ink font-bold">
            {signal.label}{" "}
            <code className="text-ink-3 text-[12px] font-normal">
              {signal.code}
            </code>
          </b>
          <span
            className={`text-end font-bold whitespace-nowrap [font-variant-numeric:lining-nums_tabular-nums] ${
              signal.hold ? "text-accent-strong" : "text-ink"
            }`}
          >
            {signal.points}
          </span>
          <span className="text-ink-3 col-span-full text-[13px] leading-[1.4]">
            {signal.why}
          </span>
        </div>
      ))}
      {total === undefined ? null : (
        <div className={`${row} bg-paper-2 rounded-b-[12px]`}>
          <b className="text-ink font-bold">{total.label}</b>
          <span className="text-ink text-end font-bold whitespace-nowrap [font-variant-numeric:lining-nums_tabular-nums]">
            {total.value}
          </span>
          <span className="text-ink-3 col-span-full text-[13px] leading-[1.4]">
            {total.note}
          </span>
        </div>
      )}
    </div>
  );
}

/** The recommendation and what the deadline does (`.rk-def`). */
export function RiskDefault({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <p className="bg-paper-2 grid gap-[2px] rounded-[10px] px-[12px] py-[10px] text-[14px] leading-[1.4] shadow-[inset_0_0_0_1px_var(--color-rule)]">
      <b>{title}</b>
      <span className="text-ink-2 text-[13px]">{children}</span>
    </p>
  );
}

/** The buyer block, shown only with `orders.view_pii` (`.rk-pii`). */
export function RiskPii({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="bg-paper-2 grid gap-[6px] rounded-[10px] px-[14px] py-[12px] text-[14px]">
      {children}
    </div>
  );
}
