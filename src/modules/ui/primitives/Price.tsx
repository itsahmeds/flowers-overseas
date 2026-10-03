/**
 * `Price` — one number, all in (spec 004 §14 A21 clause 6; spec 008 AC-6; spec 009 AC-21;
 * components sheet v2 "Price"; TASK-175).
 *
 * The primitive is **presentation only**. It never formats money: `amount` is `formatMoney`'s
 * output, passed in by the caller (CLAUDE.md "Money is formatted by `formatMoney` only"), so a
 * price on screen is always the same string as the quote and schema `price`. It renders three of
 * the sheet's placements:
 *
 *  - `card` — the product card: the amount in Alegreya Sans 700, the qualifier ("all in" once the
 *    founder's copy batch lands; `catalog.price.inclusive` until then) in fine subtle ink beside it;
 *  - `page` — the product page: the amount in Fraunces at `--text-xl`, the qualifier in leaf
 *    (`--color-included`) under it;
 *  - `from` — a tile's from-price: poppy 700, the qualifier already inside the formatted
 *    sentence (`catalog.price.from`), so it takes none. A from-price never carries equivalents
 *    (A21 clause 6 (b): "the category tiles' `fromPrice` gets none") and the type refuses them.
 *
 * **The equivalents slot (A21 clause 6 (b)–(d)).** `equivalents` is the finished line — "about …
 * at the rate of …" — built by TASK-178/179 from `fxRateFor` and the list formatter. When it is
 * absent (no data, a stale rate, the destination-currency fallback) **nothing** is rendered: no
 * empty paragraph, no reserved line. It sits under the amount in `--text-xs` subtle ink (6.0:1 on
 * paper), never in JSON-LD, never in `<meta>`.
 *
 * Every number is set `lining-nums tabular-nums` (`num`) and wrapped in `<bdi>`, so a formatted
 * amount keeps its own direction inside a right-to-left page. The whole primitive is phrasing
 * content (`<span>`s laid out as blocks), so it nests inside a paragraph, a link or a list item.
 */
import type { ReactElement, ReactNode } from "react";

export const PRICE_VARIANTS = ["card", "page", "from"] as const;
export type PriceVariant = (typeof PRICE_VARIANTS)[number];

interface PriceBase {
  /** `formatMoney`'s output (or a catalogue sentence that embeds it). Never a number. */
  readonly amount: string;
  readonly className?: string;
}

export type PriceProps =
  | (PriceBase & {
      readonly variant?: "card" | "page";
      /** The all-in wording beside (card) or under (page) the amount. */
      readonly qualifier?: ReactNode;
      /** The finished equivalents line; omitted entirely when absent. */
      readonly equivalents?: string | undefined;
    })
  | (PriceBase & {
      readonly variant: "from";
      readonly qualifier?: never;
      readonly equivalents?: never;
    });

const AMOUNT_CLASS: Readonly<Record<PriceVariant, string>> = {
  card: "num font-bold text-ink",
  page: "num display text-xl text-ink",
  from: "num font-bold text-accent",
};

export function Price(props: PriceProps): ReactElement {
  const variant = props.variant ?? "card";
  const qualifier = props.variant === "from" ? undefined : props.qualifier;
  const equivalents = props.variant === "from" ? undefined : props.equivalents;

  return (
    <span
      className={["flex flex-col", props.className].filter(Boolean).join(" ")}
      data-fo-price={variant}
    >
      <span
        className={
          variant === "page" ? "gap-xs flex flex-col" : "block leading-[1.4]"
        }
      >
        <span className={AMOUNT_CLASS[variant]}>
          <bdi>{props.amount}</bdi>
        </span>
        {qualifier === undefined ? null : (
          <span
            className={
              variant === "page"
                ? "text-included text-ui font-bold"
                : "text-ink-subtle md:text-fine ms-[6px] text-xs"
            }
          >
            {qualifier}
          </span>
        )}
      </span>
      {equivalents === undefined || equivalents === "" ? null : (
        <span
          className="num text-ink-subtle mt-[3px] block text-xs leading-[1.35]"
          data-fo-price-equivalents
        >
          {equivalents}
        </span>
      )}
    </span>
  );
}
