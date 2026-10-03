/**
 * `FactsList` and `Fact` — "what we can say, today" (components sheet v2 "Facts list"; spec 007's
 * fact list; spec 004 §14 A21; TASK-175).
 *
 * A `<dl>` whose rows are `<div>`s (valid HTML since 2017 and what lets each row carry its own
 * hairline): the term in the `label` voice, the value in ink, a "none" value in `ink-2` so an
 * honest blank ("— no cutoff, because no florist has agreed to one") reads as an answer rather
 * than as missing data. Two columns from `md` up — 200 px terms, or 130 px in the product page's
 * buy column (`narrow`, passed to each `Fact`; the list records it as `data-fo-facts`) — and one
 * column on a phone. Server-rendered, no state; every child of the `<dl>` is a `Fact` row.
 */
import type { ReactElement, ReactNode } from "react";

export const FACTS_DENSITIES = ["page", "narrow"] as const;
export type FactsDensity = (typeof FACTS_DENSITIES)[number];

const ROW_CLASS: Readonly<Record<FactsDensity, string>> = {
  page: "md:grid-cols-[200px_minmax(0,1fr)] md:gap-x-lg",
  narrow: "md:grid-cols-[130px_minmax(0,1fr)] md:gap-x-md",
};

export interface FactsListProps {
  readonly children: ReactNode;
  readonly density?: FactsDensity;
  readonly className?: string;
}

export function FactsList({
  children,
  density = "page",
  className,
}: FactsListProps): ReactElement {
  return (
    <dl
      className={["border-rule m-0 grid border-t border-solid", className]
        .filter(Boolean)
        .join(" ")}
      data-fo-facts={density}
    >
      {children}
    </dl>
  );
}

export interface FactProps {
  /** The term, from the message catalogue. */
  readonly label: ReactNode;
  readonly children: ReactNode;
  /** An honest blank: the value is set in `ink-2`. */
  readonly none?: boolean;
  readonly density?: FactsDensity;
}

export function Fact({
  label,
  children,
  none = false,
  density = "page",
}: FactProps): ReactElement {
  return (
    <div
      className={[
        "border-rule gap-y-xs grid grid-cols-1 border-b border-solid py-[14px]",
        ROW_CLASS[density],
      ].join(" ")}
    >
      <dt className="text-ink-subtle pt-[3px] text-xs font-bold tracking-[0.12em] uppercase">
        {label}
      </dt>
      <dd className={["m-0", none ? "text-ink-muted" : "text-ink"].join(" ")}>
        {children}
      </dd>
    </div>
  );
}
