/**
 * @purpose What one card of the florist's "My bouquets" says: amount, size, state, the "Ask for a change" mailto
 * @spec 030b
 *
 * Spec 030b §14.2 C, §14.6 i18n (AC-52, AC-54, AC-55; TASK-444). Pure: rows in, printed strings
 * out, so the page and its tests read one answer.
 *
 *  - "You receive {amount}": the florist's own amount through `formatMoney` in the member's
 *    language (`100,00 zł` in `pl` for 10 000 PLN minor units), split around the amount so the
 *    card can set it in bold without a second message.
 *  - The size line: the tier's catalogue label with its count; a label that is not itself the
 *    stem count gets the stems beside it by ICU plural (`floristInbox.bouquets.stems`).
 *  - "Ask for a change": `mailto:{supportEmail}?subject=` plus the URL-encoded
 *    `floristInbox.bouquets.changeSubject` for the SKU and size key; no amount and no name ever
 *    enter the link. With no support mailbox (`company.supportEmail` unset, §13 Q25) there is no
 *    link, and the page prints the support line instead.
 *  - The photo: the product's first approved, displayable asset of the public manifest in the
 *    member's language (the image the product page already serves), else the wordless box.
 */
import type { LocaleCode } from "@/config/locales";
import { MoneySchema, formatMoney } from "@/modules/i18n";
import { altFor, assetsForProduct, isDisplayable } from "@/modules/ui";

import type { FloristBouquetRow, FloristBouquetState } from "./bouquets";

/** A translator over `floristInbox` and `catalog`, keys as data. */
export type BouquetTranslator = (
  key: string,
  values?: Readonly<Record<string, string | number>>,
) => string;

/** The catalogue label that already is the stem count ("15 stems"). */
const STEMS_LABEL_KEY = "catalog.tier.stems";

const STATE_KEYS: Readonly<Record<FloristBouquetState, string>> = {
  on_sale: "floristInbox.bouquets.state.onSale",
  not_yet_on_sale: "floristInbox.bouquets.state.notYet",
  paused: "floristInbox.bouquets.state.paused",
  withdrawn: "floristInbox.bouquets.state.withdrawn",
};

export interface BouquetCardView {
  readonly key: string;
  readonly name: string;
  readonly sizeLine: string | null;
  /** "You receive {amount}" around the amount: before, the amount, after. */
  readonly receive: readonly [before: string, amount: string, after: string];
  readonly code: string;
  readonly state: FloristBouquetState;
  readonly stateText: string;
  readonly changeHref: string | null;
  readonly changeLabel: string;
  readonly photo: { readonly assetId: string; readonly alt: string } | null;
}

/** `mailto:{email}?subject=` plus the encoded subject (AC-55). */
export function changeHref(email: string, subject: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

/** The size line of one row, or `null` for a product with no sizes and no stem count. */
export function sizeLine(
  row: Pick<FloristBouquetRow, "sizeLabelKey" | "stems">,
  t: BouquetTranslator,
): string | null {
  const stems =
    row.stems === null
      ? null
      : t("floristInbox.bouquets.stems", { count: row.stems });
  if (row.sizeLabelKey === null) return stems;
  if (row.sizeLabelKey === STEMS_LABEL_KEY) {
    return row.stems === null ? null : t(STEMS_LABEL_KEY, { count: row.stems });
  }
  const label = t(
    row.sizeLabelKey,
    row.stems === null ? {} : { count: row.stems },
  );
  return stems === null ? label : `${label} · ${stems}`;
}

/** The manifest photo of `sku` in `locale`, or `null` (the wordless box). */
export function bouquetPhoto(
  sku: string,
  locale: string,
): BouquetCardView["photo"] {
  for (const asset of assetsForProduct(sku)) {
    const alt = altFor(asset.id, locale);
    if (alt !== undefined && isDisplayable(asset.id, locale)) {
      return { assetId: asset.id, alt };
    }
  }
  return null;
}

/** The cards of `/vendor/bouquets`, in the rows' order. */
export function bouquetCards(
  rows: readonly FloristBouquetRow[],
  options: {
    readonly t: BouquetTranslator;
    readonly locale: LocaleCode;
    readonly supportEmail: string | undefined;
    readonly photoOf?: (
      sku: string,
      locale: string,
    ) => BouquetCardView["photo"];
  },
): BouquetCardView[] {
  const { t, locale, supportEmail } = options;
  const photoOf = options.photoOf ?? bouquetPhoto;
  return rows.map((row) => {
    const amount = formatMoney(
      MoneySchema.parse({
        amountMinor: row.payoutMinor,
        currency: row.currency,
      }),
      locale,
    );
    const text = t("floristInbox.bouquets.youReceive", { amount });
    const at = text.indexOf(amount);
    const receive: BouquetCardView["receive"] =
      at === -1
        ? [text, "", ""]
        : [text.slice(0, at), amount, text.slice(at + amount.length)];
    const size = row.sizeKey ?? "";
    return {
      key: `${row.mappingId}:${size}`,
      name: row.productName,
      sizeLine: sizeLine(row, t),
      receive,
      code: t("floristInbox.bouquets.sku", { sku: row.sku }),
      state: row.state,
      stateText: t(STATE_KEYS[row.state]),
      changeHref:
        supportEmail === undefined
          ? null
          : changeHref(
              supportEmail,
              t("floristInbox.bouquets.changeSubject", {
                sku: row.sku,
                size,
              }),
            ),
      changeLabel: t("floristInbox.bouquets.askChange"),
      photo: photoOf(row.sku, locale),
    };
  });
}
