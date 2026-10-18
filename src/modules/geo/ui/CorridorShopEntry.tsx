/**
 * The corridor page's shop entry, in both states (spec 007 §2 "Internal links", §14 A9 and A10;
 * spec 008 AC-20; TASK-113, TASK-147; `docs/design/wireframes/corridor-country-desktop.dc.html`,
 * "Live · the shop entry").
 *
 * **State A is the reviewed shop-root link and nothing else** (A9): the heading ("See what can
 * arrive in…") and the body ("Bouquets our florist in… can make, … with delivery…") are florist,
 * delivery and availability claims a guide page may not make. **State B** adds that heading and
 * body, and under the link the chip row of A10: the country categories and occasions that exist,
 * labelled by the shop's own sibling-row heading ("Also for {country}").
 *
 * The component takes `live` as data and renders the chip row only when it is true, whatever it
 * was handed: `corridorView()` already drops the chips from a guide view, and this is the second
 * gate, so a hand-built view cannot put a chip into state A. No new message key: the row's name is
 * `shop.category.siblingsHeading`, reviewed, and the chips carry the catalogue's authored names.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Button, Chip, Eyebrow } from "../../ui/index.ts";
import type { CorridorShopChip } from "../corridor.ts";

export interface CorridorShopEntryProps {
  readonly href: string;
  readonly country: string;
  readonly live: boolean;
  /** The state-B chips; ignored in the guide state. */
  readonly chips?: readonly CorridorShopChip[] | undefined;
  /** Whether the related-destinations section above already holds this block's top margin. */
  readonly afterRelated: boolean;
}

export function CorridorShopEntry({
  href,
  country,
  live,
  chips = [],
  afterRelated,
}: CorridorShopEntryProps): ReactElement {
  const c = useTranslations("corridor");
  const t = useTranslations();

  return (
    <section
      aria-label={c("shop.cta", { country })}
      className={`gap-sm flex flex-col ${afterRelated ? "mt-[40px]" : "pt-[48px] md:pt-(--section-fluid)"}`}
      data-fo-corridor-shop
    >
      {live ? (
        <>
          <h3 className="display text-md m-0">
            {c("shop.heading", { country })}
          </h3>
          <p className="text-ink-muted m-0 max-w-prose">
            {c("shop.body", { country })}
          </p>
        </>
      ) : null}
      <Button className="self-start" href={href}>
        {c("shop.cta", { country })}
      </Button>
      {live && chips.length > 0 ? (
        <nav
          aria-labelledby="corridor-shop-chips-heading"
          className="gap-sm mt-[16px] flex flex-col"
          data-fo-corridor-shop-chips
        >
          <Eyebrow id="corridor-shop-chips-heading">
            {t("shop.category.siblingsHeading", { country })}
          </Eyebrow>
          <ul className="gap-sm m-0 flex list-none flex-wrap p-0">
            {chips.map((chip) => (
              <li key={`${chip.family}:${chip.key}`}>
                <Chip data-fo-shop-chip={chip.family} href={chip.href}>
                  {chip.name}
                </Chip>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </section>
  );
}
