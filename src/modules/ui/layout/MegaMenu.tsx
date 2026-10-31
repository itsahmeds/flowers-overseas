/**
 * The mega menu (spec 004 §14 A-founder-2026-10-24a item 5, AC-99, AC-102, AC-104; spec 043 AC-2,
 * AC-3, AC-50; TASK-383), drawn from `megaMenuModel()`'s model and nothing else.
 *
 * It reproduces the "mega menu header" band of `docs/design/wireframes/chrome-desktop.dc.html`
 * (the `.cm-*` frames) and the phone Menu of `chrome-mobile.dc.html`:
 *
 *  - **`MegaMenuNav`**, from `md`: six native `<details name="fo-mega">`, closed in the server
 *    HTML. The summary is the label with a drawn chevron (CSS, so it is not announced), a 44 px
 *    target and the focus ring; click, tap, Enter and Space open it with no script, and a closed
 *    `<details>` renders nothing inside, so its links are not in the tab order and its image is not
 *    fetched (AC-102). The panel is absolutely placed under the header row, inside the sticky
 *    header frame (the header is its containing block), so opening it shifts nothing below. Hover,
 *    Esc and click-outside are the deferred island's (TASK-384); without them every panel works.
 *  - **`MegaMenuAccordions`**, inside the phone Menu: the same panels as nested `<details>`, the
 *    same entries in the same order, and no image (AC-104).
 *
 * Each entry kind is one element: `link` an `<a href>`, `chooser` an `<a href rel="nofollow">`
 * (item 3: the chooser is robots-disallowed and every link to it is `nofollow`), `facet` a GET form
 * with one hidden field (spec 008 AC-15: no parameterised `<a href>`). No transition anywhere, so
 * reduced motion has nothing to remove. Logical properties only, so `/ar-XB` mirrors.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { MEGA_MENU_GROUP } from "../../../config/mega-menu.ts";
import { type LocaleCode, isLocaleCode } from "../../../config/locales.ts";
import { formatDate, formatMoney } from "../../i18n/index.ts";
import { CHOOSER_LINK_REL } from "../../seo/index.ts";
import { MediaAsset } from "../media/MediaAsset.tsx";
import { MediaProvenanceNote } from "../media/MediaProvenanceNote.tsx";
import { PAGE_FRAME } from "../primitives/layout.tsx";
import { hasCardPrice } from "../shop/viewModel.ts";
import type {
  MegaEntry,
  MegaFeatured,
  MegaMenuModel,
  MegaPanel,
} from "./mega-model.ts";

type Translator = ReturnType<typeof useTranslations>;
type LabelTranslator = (key: string) => string;

/** Registry keys are fully qualified; see `SiteHeader`'s note on `TS2589`. */
function label(t: Translator, key: string): string {
  return (t as unknown as LabelTranslator)(key);
}

/** The widest panel image (AC-102: at most 384 px and 25,600 B; the 384 px variant fits). */
export const MEGA_PANEL_IMAGE_MAX_WIDTH = 384;

/** The featured card's drawn width (the board's `.cm-feat .cm-card`, 208 px). */
const FEATURED_SIZES = "208px";

/** A dated entry's date, in the board's short form ("Sun 1 Nov"), the calendar date itself. */
function shortDate(date: string, locale: LocaleCode): string {
  return formatDate(
    new Date(`${date}T12:00:00Z`),
    locale,
    "deliveryDate",
    "UTC",
  );
}

/** One entry in a panel column (`.cm-col li > a`) or an accordion (`.cm-acc .in a`). */
function Entry({
  entry,
  t,
  locale,
  className,
}: {
  readonly entry: MegaEntry;
  readonly t: Translator;
  readonly locale: LocaleCode;
  readonly className: string;
}): ReactElement {
  const text =
    entry.kind === "link" && entry.label !== undefined
      ? entry.label
      : label(t, entry.labelKey);
  if (entry.kind === "facet") {
    return (
      <form action={entry.action} method="get">
        <input name={entry.name} type="hidden" value={entry.value} />
        <button
          className={`${className} cursor-pointer`}
          data-fo-mega-entry={entry.id}
          type="submit"
        >
          {text}
        </button>
      </form>
    );
  }
  return (
    <a
      className={className}
      data-fo-mega-entry={entry.id}
      href={entry.href}
      {...(entry.kind === "chooser" ? { rel: CHOOSER_LINK_REL } : {})}
    >
      <span>{text}</span>
      {entry.kind === "link" && entry.date !== undefined ? (
        <small className="text-fine text-ink-3 ms-auto lining-nums tabular-nums">
          {shortDate(entry.date, locale)}
        </small>
      ) : null}
    </a>
  );
}

/** The "All …" link: the board's `.cm-link`. */
function AllLink({
  entry,
  t,
  locale,
}: {
  readonly entry: MegaEntry;
  readonly t: Translator;
  readonly locale: LocaleCode;
}): ReactElement {
  return (
    <Entry
      className="text-link inline-flex min-h-(--target-min) items-center font-bold underline decoration-[1.5px] underline-offset-[5px]"
      entry={entry}
      locale={locale}
      t={t}
    />
  );
}

/** The panel's featured card (`.cm-feat .cm-card`): country-less, or the country's at its price. */
function FeaturedCard({
  featured,
  t,
  locale,
}: {
  readonly featured: MegaFeatured;
  readonly t: Translator;
  readonly locale: LocaleCode;
}): ReactElement {
  const { card } = featured;
  return (
    <article
      className="grid max-w-[208px] content-start"
      data-fo-mega-featured={card.productId}
      data-fo-product-card-money={hasCardPrice(card) ? "priced" : "none"}
    >
      <a
        className="group/feat block"
        href={featured.href}
        {...(featured.chooser ? { rel: CHOOSER_LINK_REL } : {})}
      >
        {card.photo.kind === "asset" ? (
          <MediaAsset
            assetId={card.photo.assetId}
            locale={locale}
            maxWidth={MEGA_PANEL_IMAGE_MAX_WIDTH}
            productName={card.name}
            ratio="card"
            sizes={FEATURED_SIZES}
            slot={card.photo.slot}
          />
        ) : null}
        <h3 className="display text-h3 mt-[12px] leading-(--line-height-title) group-hover/feat:underline">
          <bdi>{card.name}</bdi>
        </h3>
        {hasCardPrice(card) ? (
          <p className="mt-[5px] flex flex-wrap items-baseline gap-x-[8px]">
            <b className="text-ui font-bold lining-nums tabular-nums">
              {formatMoney(card.price, locale)}
            </b>
            <small className="text-ink-3 text-xs">
              {label(t, card.priceLabelKey)}
            </small>
          </p>
        ) : (
          <>
            <p className="text-ink-muted mt-[5px] text-sm leading-[1.35]">
              {label(t, "shop.price.choose")}
            </p>
            <p className="text-link mt-[6px] inline-flex items-center gap-[6px] text-sm font-bold underline decoration-[1.5px] underline-offset-4 after:inline-block after:no-underline after:content-['→']">
              {label(t, "shop.cta.chooseCountry")}
            </p>
          </>
        )}
      </a>
      {/* The example label stays in the HTML for an AI photograph (spec 006 AC-17); the board
          hides it in the panel (`.cm-prov`), where one card stands alone. */}
      {card.photo.kind === "asset" ? (
        <div className="hidden" data-fo-card-provenance="hidden">
          <MediaProvenanceNote
            assetIds={[card.photo.assetId]}
            locale={locale}
          />
        </div>
      ) : null}
    </article>
  );
}

/** Columns the panel's grid is divided into: the board's `--n`. */
function gridColumns(panel: MegaPanel): number {
  const spans = panel.columns.reduce(
    (sum, column) => sum + (column.wide ? 2 : 1),
    0,
  );
  return Math.min(4, Math.max(panel.id === "destinations" ? 3 : 2, spans));
}

/** Literal classes, so Tailwind compiles them (`--n` of 2 to 4). */
const GRID_COLUMNS: Readonly<Record<number, string>> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

const COLUMN_HEADING =
  "text-ink-3 mb-[6px] font-body text-xs font-bold tracking-(--tracking-label) uppercase";

const PANEL_ENTRY =
  "text-ink text-ui flex min-h-[36px] w-full items-center gap-[10px] text-start hover:underline";

/**
 * A panel's columns, its add-ons line and its "All" link: **one markup for both surfaces**. The
 * desktop panel and the phone accordion print these bytes identically (only their containers'
 * classes differ), so the Menu's second copy of every entry costs Brotli a back-reference, not a
 * second menu (AC-103: header plus Menu at most 6,144 B).
 */
function PanelColumns({
  panel,
  t,
  locale,
}: {
  readonly panel: MegaPanel;
  readonly t: Translator;
  readonly locale: LocaleCode;
}): ReactElement {
  return (
    <>
      {panel.columns.map((column) => (
        <div
          className={column.wide ? "col-span-2" : undefined}
          data-fo-mega-column={column.id}
          key={column.id}
        >
          <h3 className={COLUMN_HEADING}>{label(t, column.headingKey)}</h3>
          <ul
            className={`m-0 grid list-none p-0 ${column.wide ? "grid-cols-2 gap-x-[20px]" : ""}`}
          >
            {column.entries.map((entry) => (
              <li key={entry.id}>
                <Entry
                  className={PANEL_ENTRY}
                  entry={entry}
                  locale={locale}
                  t={t}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {panel.extras === null ? null : (
        <div data-fo-mega-column="extras">
          <h3 className={COLUMN_HEADING}>
            {label(t, panel.extras.headingKey)}
          </h3>
          {/* One sentence, as the board sets it: a no-break space keeps each dot on the line of
              the word before it, so a wrapped line never starts with a separator. */}
          <p className="text-ink-muted m-0 py-[6px] text-sm leading-[1.5]">
            {panel.extras.labelKeys.map((key, index) => (
              <span key={key}>
                {index === 0 ? null : (
                  <span aria-hidden="true">{"\u00a0· "}</span>
                )}
                {label(t, key)}
              </span>
            ))}
          </p>
        </div>
      )}
      {panel.all === null ? null : (
        <p className="col-span-full mt-[10px]">
          <AllLink entry={panel.all} locale={locale} t={t} />
        </p>
      )}
    </>
  );
}

/** One open panel (`.cm-panel`): its columns, its "All" link, its extras, its featured card. */
function PanelBody({
  panel,
  t,
  locale,
}: {
  readonly panel: MegaPanel;
  readonly t: Translator;
  readonly locale: LocaleCode;
}): ReactElement {
  const full = panel.featured === null;
  return (
    <div
      className="bg-card border-rule absolute start-0 end-0 top-full border-b pt-[30px] pb-[34px] shadow-md"
      data-fo-mega-panel={panel.id}
    >
      <div className={`grid grid-cols-12 gap-x-[32px] ${PAGE_FRAME}`}>
        <div
          className={`grid content-start gap-[28px] ${GRID_COLUMNS[gridColumns(panel)] ?? "grid-cols-2"} ${full ? "col-span-12" : "col-span-9"}`}
        >
          <PanelColumns locale={locale} panel={panel} t={t} />
        </div>
        {panel.featured === null ? null : (
          <aside
            aria-label={label(t, panel.labelKey)}
            className="border-rule col-span-3 col-start-10 border-s ps-[32px]"
          >
            <FeaturedCard featured={panel.featured} locale={locale} t={t} />
          </aside>
        )}
      </div>
    </div>
  );
}

/**
 * The six summaries (`.cm-sum`): 44 px, the label in ink-2 and the chevron; open, the sage wash,
 * ink and the chevron turned up.
 */
const SUMMARY = [
  "text-ink-muted text-ui inline-flex min-h-(--target-min) cursor-pointer list-none items-center gap-[7px] rounded-full px-[11px] whitespace-nowrap select-none [&::-webkit-details-marker]:hidden",
  "after:size-[6px] after:-translate-y-[2px] after:rotate-45 after:border-e-[1.5px] after:border-b-[1.5px] after:border-current after:opacity-70 after:content-['']",
  "group-open/mega:bg-sage-wash group-open/mega:text-ink group-open/mega:after:translate-y-[2px] group-open/mega:after:-rotate-[135deg]",
].join(" ");

export interface MegaMenuNavProps {
  readonly model: MegaMenuModel;
  /** The document's locale; a pseudo-locale has no menu (its model is empty). */
  readonly locale: string;
  /** The nav's accessible name, the reviewed `nav.categories.label`. */
  readonly navLabel: string;
  readonly className?: string;
}

/** The desktop and tablet row: six `<details name="fo-mega">`, all closed (AC-99). */
export function MegaMenuNav({
  model,
  locale,
  navLabel,
  className,
}: MegaMenuNavProps): ReactElement | null {
  const t = useTranslations();
  if (model.panels.length === 0 || !isLocaleCode(locale)) return null;
  return (
    <nav
      aria-label={navLabel}
      className={className}
      data-fo-header-band="categories"
      data-fo-mega-context={model.context ?? ""}
    >
      <ul className="m-0 flex list-none items-center p-0">
        {model.panels.map((panel) => (
          <li key={panel.id}>
            <details
              className="group/mega static"
              data-fo-mega={panel.id}
              name={MEGA_MENU_GROUP}
            >
              <summary className={SUMMARY} data-fo-mega-summary={panel.id}>
                {label(t, panel.labelKey)}
              </summary>
              <PanelBody locale={locale} panel={panel} t={t} />
            </details>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The accordion's body (`.cm-acc .in`): the panel's own column markup, restyled from here. One
 * column of rows (a wide column's two sub-columns fold into one), each row the 44 px target
 * (spec 004 §14 A-founder-2026-10-24a "Accessibility", 2.5.8) where the board draws 40 px apart
 * by 14: the same 54 px rhythm with a 10 px gap. Column headings sit 14 px below the rows above.
 */
const ACCORDION_BODY =
  "grid gap-[14px] pb-[16px] [&_li>a]:min-h-(--target-min) [&_li>form>button]:min-h-(--target-min) [&_ul]:grid-cols-1 [&_ul]:gap-y-[10px] [&_ul.flex]:gap-y-0 [&_h3]:mb-[10px]";

/**
 * The phone Menu's six accordions (`.cm-acc`): the same panels and entries as the desktop row,
 * nested `<details>`, no image (AC-104). Each summary is the item in the display face with a
 * drawn `+` that turns to `−` open (CSS content, not announced).
 */
export function MegaMenuAccordions({
  model,
  locale,
}: {
  readonly model: MegaMenuModel;
  readonly locale: string;
}): ReactElement | null {
  const t = useTranslations();
  if (model.panels.length === 0 || !isLocaleCode(locale)) return null;
  return (
    <div data-fo-mega-accordions="">
      {model.panels.map((panel) => (
        <details
          className="group/acc border-rule border-b"
          data-fo-menu-accordion={panel.id}
          key={panel.id}
        >
          <summary className="display text-ink after:font-body after:text-link flex min-h-[56px] cursor-pointer list-none items-center justify-between text-[21px] select-none after:text-[22px] after:font-bold after:content-['+'] group-open/acc:after:content-['−'] [&::-webkit-details-marker]:hidden">
            {label(t, panel.labelKey)}
          </summary>
          <div className={ACCORDION_BODY}>
            <PanelColumns locale={locale} panel={panel} t={t} />
          </div>
        </details>
      ))}
    </div>
  );
}
