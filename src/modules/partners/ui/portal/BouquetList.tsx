/**
 * "My bouquets" (spec 030b §14.5, artboards `florist-bouquets-desktop` / `-mobile`; TASK-444):
 * the title, one intro line, the paused notice when the page passes one, then one card per
 * bouquet and size (`.bq`: photo, name, size and stems, "You receive {amount}", code, state, and
 * "Ask for a change" when there is a support mailbox), or the empty box (`.fr-empty`), and the
 * support line under the cards when there is no mailbox.
 *
 * Server-rendered and presentational: every word arrives in the props, no client JavaScript, no
 * `<form>` and no element that posts (AC-55). One column on a phone, three from the container's
 * desktop width. States are text on a tinted chip, never colour alone. Logical properties only.
 */
import type { ReactElement, ReactNode } from "react";

import { MediaAsset, Photo } from "@/modules/ui";

import type { BouquetCardView } from "../../portal/view.ts";

const STATE_TONES: Readonly<Record<BouquetCardView["state"], string>> = {
  on_sale: "bg-leaf-wash text-stem",
  not_yet_on_sale: "bg-paper-3 text-ink-2",
  paused: "bg-butter text-ink shadow-[inset_0_0_0_1px_var(--color-warning)]",
  withdrawn: "bg-paper-3 text-ink-2",
};

export interface BouquetListProps {
  readonly locale: string;
  readonly title: string;
  readonly intro: string;
  readonly notice?: ReactNode;
  readonly cards: readonly BouquetCardView[];
  readonly empty: string;
  /** "To ask for a change, contact us: …", shown when no card carries a mailto link. */
  readonly supportLine?: string;
}

function Card({
  card,
  locale,
}: {
  readonly card: BouquetCardView;
  readonly locale: string;
}): ReactElement {
  const [before, amount, after] = card.receive;
  return (
    <article
      className="bg-card grid grid-cols-[96px_minmax(0,1fr)] gap-[14px] rounded-(--radius-photo-s) p-[14px] shadow-[inset_0_0_0_1px_var(--color-rule),var(--shadow-xs)] @4xl:grid-cols-[120px_minmax(0,1fr)] @4xl:p-[16px]"
      data-fo-bouquet={card.state}
    >
      <div className="overflow-hidden rounded-[10px]">
        {card.photo === null ? (
          <Photo
            decorative
            ratio="card"
            dataset={{ "data-fo-media-placeholder": "no-asset" }}
          />
        ) : (
          <MediaAsset
            assetId={card.photo.assetId}
            locale={locale}
            productName={card.name}
            ratio="card"
            slot="grid"
          />
        )}
      </div>
      <div className="grid min-w-0 content-start gap-[4px]">
        <h2 className="font-display text-h3 m-0 leading-[1.15] font-normal">
          {card.name}
        </h2>
        {card.sizeLine === null ? null : (
          <p className="text-ink-2 m-0 text-sm">{card.sizeLine}</p>
        )}
        <p className="text-ui m-0">
          {before}
          <strong className="tabular-nums">{amount}</strong>
          {after}
        </p>
        <p className="text-ink-2 m-0 text-sm tabular-nums">{card.code}</p>
        <p className="m-0">
          <span
            className={`inline-flex min-h-[24px] items-center rounded-full px-[10px] text-sm font-bold ${STATE_TONES[card.state]}`}
            data-fo-bouquet-state={card.state}
          >
            {card.stateText}
          </span>
        </p>
        {card.changeHref === null ? null : (
          <a
            href={card.changeHref}
            className="text-link inline-flex min-h-[44px] items-center justify-self-start text-sm underline decoration-[1.5px] underline-offset-[5px]"
          >
            {card.changeLabel}
          </a>
        )}
      </div>
    </article>
  );
}

export function BouquetList({
  locale,
  title,
  intro,
  notice,
  cards,
  empty,
  supportLine,
}: BouquetListProps): ReactElement {
  return (
    <div className="grid gap-[24px]" data-fo-bouquet-list>
      <h1 className="font-display m-0 text-[34px] leading-[1.08] font-normal tracking-(--tracking-display) @4xl:text-[46px]">
        {title}
      </h1>
      <p className="text-ink-2 m-0 max-w-[52ch]">{intro}</p>
      {notice}
      {cards.length === 0 ? (
        <div
          className="rounded-photo bg-card grid justify-items-center gap-[10px] px-[24px] py-[48px] text-center shadow-[inset_0_0_0_1px_var(--color-rule)]"
          data-fo-bouquet-empty
        >
          <p className="text-ink-2 m-0 max-w-[30ch]">{empty}</p>
        </div>
      ) : (
        <div className="grid gap-[12px] @4xl:grid-cols-3 @4xl:gap-[20px]">
          {cards.map((card) => (
            <Card card={card} locale={locale} key={card.key} />
          ))}
        </div>
      )}
      {supportLine === undefined || cards.length === 0 ? null : (
        <p className="text-ui text-ink-2 m-0" data-fo-bouquet-support>
          {supportLine}
        </p>
      )}
    </div>
  );
}
