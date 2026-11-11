/**
 * The pre-contract block (spec 013 §5.3 "Components", §8 "Contract formation"; spec 010 §8 and
 * §14 A-founder-2026-10-22 AC-77; AC-3; TASK-262; `.s13-pcb` on the checkout boards). A server
 * component: rendered in the HTML, directly above the pay button, never by script.
 *
 * What the buyer gets (one row per delivery, its characteristics and date), the total with VAT
 * and delivery included, the cancelling item (spec 010's lawyer-gated cancellation sentence,
 * exactly), the trader's identity and the links to the terms and
 * the withdrawal page, once for the whole purchase. In `test` it carries the "Draft, not in force"
 * label. Every string arrives as a prop: this file holds no copy.
 */
import type { ReactElement } from "react";

export interface PreContractBlockProps {
  readonly title: string;
  /** "Draft, not in force" in `test`; absent in `live`. */
  readonly draftLabel?: string;
  readonly rows: readonly {
    readonly term: string;
    readonly details: readonly string[];
  }[];
  readonly links: readonly { readonly label: string; readonly href: string }[];
}

export function PreContractBlock({
  title,
  draftLabel,
  rows,
  links,
}: PreContractBlockProps): ReactElement {
  return (
    <section
      aria-labelledby="pre-contract-title"
      className="bg-paper-2 rounded-field grid gap-[10px] px-[18px] pt-[16px] pb-[18px] shadow-[inset_0_0_0_1px_var(--color-rule)]"
      data-fo-pre-contract=""
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-[12px] gap-y-[6px]">
        <h2
          className="display text-h3 m-0 leading-[1.2]"
          id="pre-contract-title"
        >
          {title}
        </h2>
        {draftLabel === undefined ? null : (
          <span
            className="bg-butter text-ink rounded-full px-[10px] py-[2px] text-[11px] font-bold tracking-[0.08em] uppercase shadow-[inset_0_0_0_1px_var(--color-warning)]"
            data-fo-pre-contract-draft=""
          >
            {draftLabel}
          </span>
        )}
      </header>
      <dl className="m-0 grid gap-0">
        {rows.map((row) => (
          <div
            className="border-rule grid grid-cols-1 gap-[2px] border-b border-solid py-[7px] text-sm leading-[1.45] md:grid-cols-[112px_minmax(0,1fr)] md:gap-[12px]"
            key={row.term}
          >
            <dt className="text-ink-3 pt-[2px] text-xs font-bold tracking-[0.08em] uppercase">
              {row.term}
            </dt>
            <dd className="text-ink m-0 grid gap-[4px]">
              {row.details.map((detail) => (
                <span key={detail}>{detail}</span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="m-0 flex flex-wrap gap-x-[18px] gap-y-[6px] text-sm">
        {links.map((link) => (
          <a
            className="text-link underline underline-offset-[4px]"
            href={link.href}
            key={link.href}
          >
            {link.label}
          </a>
        ))}
      </p>
    </section>
  );
}
