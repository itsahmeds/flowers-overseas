/**
 * `SiteHeader` — the v2 chrome's notice bar and header (spec 004 §14 A20, A21; AC-7, AC-8, AC-14;
 * TASK-176, after TASK-048 and TASK-173).
 *
 * It reproduces `docs/design/wireframes/chrome-desktop.dc.html` and `chrome-mobile.dc.html`:
 *
 *  1. **the notice bar** — `NoticeBar` (TASK-175's primitive): "A note from us:" in sunflower, then
 *     the honest dates line, "Prices include delivery and VAT" (not on the home; the route decides) and
 *     "Fresh-flower promise" on the
 *     desktop artboard, one short sentence centred on the mobile one. At its inline end, desktop
 *     only: the help line as a `tel:` link, spec 003's language switcher and the currency as text;
 *  2. **the header** — sticky, on paper (opaque: Tailwind inlines a literal colour into the 94 % mix, which AC-1 forbids), a rule below: the logo (the `Mark` and
 *     the outlined `Wordmark`, A21 clause 3) linked to the locale home, the eight category links
 *     (spec 008 §14 A14) and the "Send flowers" pill to the home's sentence (`#send`). Desktop
 *     draws them in one 82 px row; mobile draws the logo and the pill in a 64 px row and the same
 *     eight links below it as a horizontally scrolling row of 44 px chips.
 *
 * **Every entry with no page is absent** (AC-14 as §14 A20 amends it; TASK-173). An entry is drawn
 * exactly when `./header-model.ts` resolves it to a URL; this file has no `published` branch, so a
 * go-live is a data flip in `src/config/site-links.ts`. No search, no account cluster, no basket,
 * no menu button: each would be a control that does nothing.
 *
 * **Zero client JavaScript and a reserved box** (AC-7). One Server Component, no island, no
 * `<button>`: the box the first paint shows is the final box, so the header's CLS is 0. The notice
 * bar is a sibling that scrolls away and `<header role="banner" data-fo-header>` is the sticky part
 * (§14 A4's addendum, mechanism iii). `HEADER_STICKY_HEIGHTS` carries the banner's two heights as
 * data for the e2e assertion.
 *
 * **The currency is text** (AC-8): the locale's `currencyDefault` with a localised `aria-label`,
 * identical for every visitor; it reads and writes no cookie.
 *
 * **Logical CSS only**, so `/ar-XB` mirrors with no override; every colour is a token utility.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { CATEGORY_NAV_LABEL_KEY } from "../../../config/categories.ts";
import { COMPANY } from "../../../config/company.ts";
import { anyDeliveryDatesOpen } from "../../../config/countries.ts";
import { LocaleSwitcher, localePath } from "../../i18n/index.ts";
import { Mark } from "../icons/Mark.tsx";
import { Wordmark } from "../icons/Wordmark.tsx";
import { Button } from "../primitives/Button.tsx";
import { NoticeBar } from "../primitives/NoticeBar.tsx";
import { PAGE_FRAME } from "../primitives/layout.tsx";
import {
  type HeaderItem,
  type HeaderListingHrefs,
  headerAccountItems,
  headerCategoryItems,
  headerCurrencyCode,
  headerEndClusterItems,
  headerSendHref,
} from "./header-model.ts";

/**
 * next-intl's translator, deliberately **unnamespaced**: the registries carry fully-qualified keys
 * (`nav.category.roses`), and `pnpm i18n:check`'s usage scan reads the qualified literal.
 */
type Translator = ReturnType<typeof useTranslations>;
/**
 * A loose call signature for registry keys: the catalogue's full key union tips `tsc` into
 * `TS2589` (TASK-052). `tests/unit/ui-site-header.test.tsx` resolves every registry key against
 * the real catalogue, which is the check the union would have made.
 */
type LabelTranslator = (key: string) => string;

function registryLabel(t: Translator, key: string): string {
  return (t as unknown as LabelTranslator)(key);
}

/**
 * The artboards' `.wrap`: the 20 px / 56 px gutter, and the 1 328 px frame centred on a screen
 * wider than the 1 440 px artboard (so at 1 440 px the content starts 56 px in, as drawn). It is
 * `PAGE_FRAME`, the frame every page's `Container` uses (spec 004 §14 A23 clause 2), so the header
 * and the page cannot drift apart.
 */
export const CHROME_WRAP = PAGE_FRAME;

/*
 * The desktop artboard's one-row header applies from `xl` (1 280 px), written as literal `xl:`
 * classes (Tailwind compiles only the class names it can read). Below it the mobile artboard's two
 * rows apply: the eight links, the logo and the pill need ~1 170 px in English and more in German.
 * Named breakpoints only: the arbitrary `min-[…]:` variant once compiled this project's stylesheet
 * down to its base layer with no error (pinned by the unit test).
 */

/**
 * One category link. A plain text link in the desktop row (17 px, muted ink, padded to 44 px) and
 * a chip in the mobile row (`--text-sm`, card fill with a rule edge, 44 px, fully rounded) — one
 * DOM node, two looks, so the two artboards cannot list different entries.
 */
const CATEGORY_LINK = [
  // Mobile: the chip.
  "inline-flex flex-none items-center whitespace-nowrap min-h-(--target-min) px-[16px] rounded-full bg-card text-sm text-ink-muted shadow-[inset_0_0_0_1px_var(--color-rule)]",
  // Desktop: the text link.
  "xl:px-0 xl:rounded-none xl:bg-transparent xl:shadow-none xl:text-[17px]",
  "hover:text-ink",
].join(" ");

function CategoryEntry({
  item,
  t,
}: {
  readonly item: HeaderItem;
  readonly t: Translator;
}): ReactElement {
  return (
    <li className="flex-none">
      <a
        className={CATEGORY_LINK}
        data-fo-header-item={item.id}
        href={item.href}
      >
        {registryLabel(t, item.labelKey)}
      </a>
    </li>
  );
}

/** A decorative `·` or `|` between two claims or controls. */
function Separator({ glyph }: { readonly glyph: "·" | "|" }): ReactElement {
  return (
    <span aria-hidden="true" className="opacity-45">
      {glyph}
    </span>
  );
}

export interface SiteHeaderProps {
  /** The locale of the document the header is rendered on; it drives every URL and the currency. */
  readonly locale: string;
  /**
   * The URLs of the listing pages the category row may link to **that exist in this locale**, by
   * link id (`./header-model.ts` `headerListingTargets()`; spec 008 §14 A14; TASK-173). The
   * document layout resolves them, because only the catalogue knows which hub exists in German
   * and `src/modules/ui` may not import it. Absent → those entries are not drawn.
   */
  readonly listingHrefs?: HeaderListingHrefs;
  /**
   * The notice bar's "Prices include delivery and VAT" claim, decided **by the route** (founder,
   * 2026-10-04: "Every price includes VAT and delivery. dont write this on home"). The document
   * layout passes its `@notice` parallel-route slot: `<NoticePriceClaim />` on every page
   * (`@notice/default.tsx`), nothing on the locale home (`@notice/page.tsx`). Price-indication
   * law (e.g. Germany's PAngV) wants the statement beside prices, so it stays on the shop,
   * listing and product pages. Defaults to the claim, so a header with no route behind it (the
   * gallery, a unit render) shows the full notice.
   */
  readonly priceClaim?: ReactNode;
}

/**
 * The price claim as the notice bar prints it: `·` and "Prices include delivery and VAT". The
 * `@notice` slot renders it; the home renders nothing in its place.
 */
export function NoticePriceClaim(): ReactElement {
  const t = useTranslations("nav");
  return (
    <span data-fo-price-claim>
      {" "}
      <Separator glyph="·" /> {t("utility.pricesInclude")}
    </span>
  );
}

export function SiteHeader({
  locale,
  listingHrefs = {},
  priceClaim = <NoticePriceClaim />,
}: SiteHeaderProps): ReactElement {
  const t = useTranslations();
  // Namespace-bound for the one key with an ICU argument (`{currency}`).
  const nav = useTranslations("nav");

  const home = localePath(locale, "home");
  const currency = headerCurrencyCode(locale);
  // The category row, then whatever the registry publishes after it (account, for florists): each
  // is an entry with a page, or it is not an item at all.
  const entries = [
    ...headerCategoryItems(locale, listingHrefs),
    ...headerEndClusterItems(locale),
    ...headerAccountItems(locale),
  ];
  const { contact, tradingName } = COMPANY;
  /** A19's single chrome predicate: may this document assert a delivery date at all? */
  const datesOpen = anyDeliveryDatesOpen();

  return (
    <>
      {/* 1. The notice bar: a plain, non-landmark sibling that scrolls away (§14 A4's addendum).
             `role="note"` is the artboards' semantics for it. */}
      <div data-fo-header-band="utility" data-fo-utility role="note">
        {/* Two adjustments from the wrapper, so the primitive stays TASK-175's: the frame is the
            chrome's (content 56 px in at 1 440 px, like the header below it), and below `lg` the
            utilities are a **second centred row** instead of hidden. Spec 004 §14 A4 binds over
            the mobile artboard (coordinator ruling, 2026-10-04): the language switcher and the
            currency must be reachable at 390 px. Side by side at 768 px their links left the
            claims ~100 px and the bar ran to 233 px (measured), hence a row of their own. */}
        <NoticeBar
          className="[&>div]:max-w-[calc(var(--container-page)+2*var(--gutter))] max-lg:[&>div]:flex-col max-lg:[&>div]:gap-0 max-lg:[&>div>div]:flex max-lg:[&>div>div]:flex-wrap max-lg:[&>div>div]:justify-center max-lg:[&>div>div]:gap-x-[12px] max-lg:[&>div>div]:gap-y-0"
          utilities={
            <>
              {/* The help channel: one number, dialled from the E.164 form in `company.ts`. From
                  `lg` only: on a phone the row holds the languages and the currency, and the
                  number is the footer's Help & WhatsApp column. */}
              {/* The span carries the breakpoint: `NoticeBar` sets `inline-flex` on every link
                  from its own wrapper, which outranks a class on the link. */}
              <span className="max-lg:hidden">
                <a href={`tel:${contact.phoneE164}`}>
                  {t("company.support.label")} {contact.phoneDisplay}
                </a>
              </span>
              <span className="max-lg:hidden">
                <Separator glyph="|" />
              </span>
              {/* Spec 003's switcher, mounted rather than restyled (AC-7, spec 003 AC-3): its
                  row layout, the 44 px target, the bold current entry and the small "Beta" are
                  applied from this wrapper. */}
              <div
                className="[&_[aria-current]]:font-bold [&_[data-beta]]:ms-0 [&_[data-beta]]:text-[11px] [&_[data-beta]]:tracking-[0.08em] [&_[data-beta]]:uppercase [&_[data-beta]]:opacity-80 [&_li]:inline-flex [&_li]:items-center [&_li]:gap-[4px] lg:[&_li]:gap-[6px] [&_ul]:m-0 [&_ul]:flex [&_ul]:list-none [&_ul]:items-center [&_ul]:gap-[10px] [&_ul]:p-0 lg:[&_ul]:gap-[14px]"
                data-fo-header-switcher
              >
                <LocaleSwitcher locale={locale} />
              </div>
              <span
                aria-label={nav("currency.label", { currency })}
                data-fo-header-currency
              >
                {currency}
              </span>
            </>
          }
        >
          {/* "A note from us:" in sunflower, then one short sentence on the mobile artboard and
              the claims on the desktop one. The dates claim is gated (spec 004 §14 A19): the
              honest form until a destination takes delivery dates, the cutoff once one does (the
              mobile artboard drops the lead-in before the cutoff). */}
          <span className={datesOpen ? "hidden md:inline" : undefined}>
            <strong>{t("nav.notice.lead")}</strong>{" "}
          </span>
          <span className="md:hidden">
            {datesOpen
              ? t("nav.utility.cutoffShort")
              : t("nav.utility.datesPendingShort")}
          </span>
          <span className="hidden md:inline">
            {datesOpen
              ? t("nav.utility.cutoff")
              : t("nav.utility.datesPending")}
            {priceClaim} <Separator glyph="·" /> {t("nav.utility.guarantee")}
          </span>
        </NoticeBar>
      </div>

      {/* 2. The sticky part and the `banner` landmark. */}
      <header
        className="border-rule bg-surface layer-header sticky top-0 border-b"
        data-fo-header
        role="banner"
      >
        <div
          className={`grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[64px_auto] items-center gap-x-(--space-sm2) xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:grid-rows-[82px] xl:gap-x-(--space-lg2) ${CHROME_WRAP}`}
          data-fo-header-band="masthead"
        >
          {/* The logo: the mark and the outlined wordmark; the wordmark's name (the trading name)
              names the link. */}
          <a
            className="text-logo-ink inline-flex min-h-(--target-min) max-w-full min-w-0 items-center gap-[10px] justify-self-start"
            data-fo-header-logo
            href={home}
          >
            <Mark className="h-[28px] w-[28px] flex-none xl:h-[38px] xl:w-[38px]" />
            {/* `min-w-0`: on a phone narrower than the artboard the wordmark scales down inside
                its column rather than running under the Send pill (it keeps its aspect ratio). */}
            <Wordmark
              className="h-[19px] min-w-0 shrink xl:h-[25px]"
              label={tradingName}
            />
          </a>

          {/* The eight links: a scrolling chip row under the logo on mobile, one row of text links
              between the logo and the pill on desktop. */}
          <nav
            aria-label={registryLabel(t, CATEGORY_NAV_LABEL_KEY)}
            className={`col-span-2 row-start-2 -mx-(--gutter-s) min-w-0 md:-mx-(--gutter) xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:mx-0`}
            data-fo-header-band="categories"
          >
            <ul
              className={`m-0 flex list-none gap-(--space-sm) overflow-x-auto px-(--gutter-s) pb-(--space-sm2) md:px-(--gutter) xl:justify-end xl:gap-[26px] xl:overflow-visible xl:px-0 xl:pb-0`}
            >
              {entries.map((item) => (
                <CategoryEntry item={item} key={item.id} t={t} />
              ))}
            </ul>
          </nav>

          {/* The one action: to the home's sentence (`#send`, TASK-177's form). */}
          <Button
            className={`col-start-2 row-start-1 xl:col-start-3`}
            href={headerSendHref(locale)}
            size="sm"
          >
            {t("nav.send")}
          </Button>
        </div>
      </header>
    </>
  );
}
