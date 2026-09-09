/**
 * `SiteHeader` — the founder-approved commerce header (spec 004 §5.3, §13's 2026-09-08
 * resolution note, **§14 A4**, AC-7, AC-8, AC-14; TASK-048).
 *
 * §5.3's "56 px mobile, wordmark + switcher + currency chip" header is **superseded** by the
 * commerce anatomy of `docs/design/homepage-v1/homepage-desktop.dc.html` and
 * `homepage-mobile.dc.html`, which this component reproduces band for band:
 *
 *  1. **utility strip** — the cutoff line, "prices include delivery and VAT", the guarantee and
 *     the help channel (`Help & WhatsApp: <number> · <hours>`, the number a `tel:` link and a
 *     `wa.me` icon-link, both built from the one E.164 number in `src/config/company.ts`), and at
 *     the inline end spec 003's `LocaleSwitcher` with the currency chip;
 *  2. **masthead** — the `Mark` lockup with the Newsreader wordmark at the inline start, the
 *     search band, and the `Sign in` / `My orders` / `Basket (0)` cluster at the inline end;
 *  3. **mobile search band** — the same nodes, moved by the grid rather than duplicated;
 *  4. **category row** — every entry of `src/config/categories.ts` in the desktop artboard's
 *     order, re-ordered to the mobile artboard's by `mobileOrder`, plus `For florists` at the end.
 *
 * **Spec §14 A4 (2026-09-09) is what this file implements**, and it corrected three things a
 * reviewer measured on the first attempt:
 *
 *  - **the search band is text, not a control.** The artboards literally draw a field-shaped box
 *    containing the placeholder sentence and a button-shaped box containing the word `Search`;
 *    there is no search backend until spec 008. At zero client JavaScript a `<form>` with no
 *    `action` and an enabled submit navigates to the current URL, and a `disabled` submit is
 *    pixel-identical to an enabled one — so "labelled, keyboard-operable and inert" cannot all
 *    hold at once. The band therefore follows the same rule as every other unpublished target in
 *    this header: it renders as **text**. No `<input>`, no `<button>`, no `<form>`, no `search`
 *    landmark and no focus stop; `nav.search.help` says why, for a screen reader, inside the box.
 *    Spec 008 replaces the two boxes with the real control when the route exists.
 *  - **the switcher and the currency chip live in the utility strip**, on every breakpoint. In the
 *    category row's end cluster they wrapped the desktop row to two lines and sat 120–570 px
 *    off-screen inside the mobile row's horizontal scroll, which made AC-8's chip invisible at
 *    390 px. In the strip they are visible without scrolling at both artboard widths, and the
 *    category row is the single line the canvas draws.
 *  - **every rendered link clears 44 px** (§5.3, §8): the `tel:` link, the WhatsApp icon-link, the
 *    masthead lockup and the switcher's three sibling-locale links. The switcher's own markup is
 *    spec 003's and stays untouched (AC-7, spec 003 AC-3), so the target size, the row layout and
 *    the underline suppression are applied **from the wrapper** through descendant variants.
 *
 * **Zero client JavaScript.** Not a preference: §14 A1 leaves 1 434 B of Brotli headroom on a
 * locale document and reserves it for the finder and consent islands, so the header may not spend
 * a byte of it. Everything here is one Server Component. The one control that survives is the
 * mobile menu `<button>`, `disabled` because every category and account target is unpublished and
 * there is nothing for it to disclose; it becomes a disclosure in the task that publishes the
 * first one.
 *
 * **Every registry entry is text until its `published` flag flips** (AC-14) — resolved in
 * `./header-model.ts` and never here, so this file holds no `published` branch, and a category,
 * account or for-florists go-live is a data flip with no template edit.
 *
 * **The currency chip is server-rendered text** (AC-8): the locale's `currencyDefault` with a
 * localised `aria-label`, identical for every visitor of the URL. It reads no cookie and writes
 * none — the `fo_currency` menu is spec 008's — which is what keeps the document one cache entry
 * with no `Vary` and no `Set-Cookie`.
 *
 * **No CLS** (AC-7): every band carries the fixed height its artboard specifies as a literal
 * utility, and `./header-model.ts`'s `HEADER_BAND_HEIGHTS` carries the same numbers as data for
 * the e2e assertion and the drift guard in `tests/unit/ui-site-header.test.tsx`. So the box the
 * first paint shows is the final box: nothing is measured after paint and there is no island to
 * change it on hydration.
 *
 * The header is **full-bleed** with the canvas's 16 px / 56 px inline padding rather than a
 * centred `Container`: the artboards run the utility strip, the masthead rules and the category
 * row edge to edge, and `Container`'s `max-w`/padding pair would inset them.
 *
 * Accessibility: `<header>` is the `banner` landmark and the category row a named `navigation`;
 * every rendered link clears 44 px; the account labels are the accessible names at every width
 * and become visible from `md` up; no affordance depends on hover. Direction-carrying icons mirror
 * in RTL from the icon set's own intent, and the file is logical-CSS only, so `/ar-XB` needs no
 * override.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { CATEGORY_NAV_LABEL_KEY } from "../../../config/categories.ts";
import { COMPANY } from "../../../config/company.ts";
import { SEARCH_LINK_ID, siteLink } from "../../../config/site-links.ts";
import { LocaleSwitcher, localePath } from "../../i18n/index.ts";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { Mark } from "../icons/Mark.tsx";
import { Chip } from "../primitives/Chip.tsx";
import {
  type HeaderItem,
  headerAccountItems,
  headerCategoryItems,
  headerCurrencyCode,
  headerEndClusterItems,
} from "./header-model.ts";

/**
 * next-intl's translator, and the key type its `AppConfig` augmentation checks calls against.
 *
 * The translator here is deliberately **unnamespaced**: the registries carry fully-qualified
 * keys (`nav.category.roses`, `company.support.label`), so a namespace-bound translator would
 * have to strip a prefix from data — and `pnpm i18n:check`'s usage scan reads the qualified
 * literal, which is what keeps a key the header stopped rendering from silently staying in the
 * catalogue.
 */
type Translator = ReturnType<typeof useTranslations>;
type MessageKey = Parameters<Translator>[0];

/**
 * Resolve a registry `labelKey`.
 *
 * The registries store their labels as zod-validated dotted strings, so the one cast in this file
 * lives here instead of at each call site, and `tests/unit/ui-site-header.test.tsx` asserts that
 * **every** key the three registries carry resolves to a real message — the property the cast
 * would otherwise hide.
 */
function registryLabel(t: Translator, key: string): string {
  return t(key as MessageKey);
}

/** The canvas's icon per account entry; the label carries the meaning, so the icon is decorative. */
const ACCOUNT_ICONS: Readonly<Record<string, IconName>> = {
  "sign-in": "user",
  "my-orders": "truck",
  basket: "basket",
};

/** The canvas's inline padding: 16 px on the mobile artboard, 56 px on the desktop one. */
const BLEED = "px-md md:px-[56px]";

/**
 * The 44 px minimum target of §5.3/§8, as one utility list, applied to **every** rendered link:
 * the two help-channel links, the masthead lockup and — from the wrapper — the switcher's three
 * sibling-locale links. `tests/e2e/header.spec.ts` measures every `<a>` in the header at both
 * artboard widths against it, which is why it is a constant and not four hand-written class lists.
 */
const TARGET = "inline-flex min-h-[44px] items-center";

/**
 * The same 44 px target, applied to the switcher's links **from the wrapper** — one literal class
 * list rather than a computed one, because Tailwind compiles the class names it can read in the
 * source and a built-up string produces no CSS at all.
 */
const SWITCHER_WRAPPER =
  "[&_ul]:gap-md [&_ul]:m-0 [&_ul]:flex [&_ul]:list-none [&_ul]:flex-wrap [&_ul]:items-center [&_ul]:p-0 [&_li]:inline-flex [&_li]:items-center [&_a]:inline-flex [&_a]:min-h-[44px] [&_a]:items-center [&_a]:no-underline";

/**
 * The mobile artboard's position for a category row entry, as a literal `order-*` utility per
 * possible value: `order-${n}` built at runtime is invisible to Tailwind's scanner and would emit
 * no CSS, so the six positions the registry allows are written out and looked up.
 */
const MOBILE_ORDER: Readonly<Record<number, string>> = {
  1: "order-1 md:order-none",
  2: "order-2 md:order-none",
  3: "order-3 md:order-none",
  4: "order-4 md:order-none",
  5: "order-5 md:order-none",
  6: "order-6 md:order-none",
  7: "order-7 md:order-none",
  8: "order-8 md:order-none",
  9: "order-9 md:order-none",
  10: "order-10 md:order-none",
  11: "order-11 md:order-none",
  12: "order-12 md:order-none",
};

/**
 * From which width each utility-strip claim is printed, as literal class lists (Tailwind compiles
 * the classes it can read, so these may not be built up at runtime).
 *
 * The artboard draws four claims on one 34 px line, on a strip that carries no controls. §14 A4
 * moves spec 003's four-language switcher and the currency chip into that band; every rendered
 * link there owes the 44 px target, so the line is 44 px tall and ~295 px narrower. Measured at
 * 11 px/0.06em: cutoff 283 px, prices-include 174 px, guarantee 149 px, help channel 350 px,
 * controls 295 px — 1 375 px of content for the 1 328 px the 1440 px artboard leaves. Rather than
 * truncate (§7 forbids it) or run the band to two lines at every width, the strip prints as many
 * claims as the width holds and drops them from the tail: the cutoff line and the help channel are
 * always there, the long cutoff line replaces the short one from `xl`, and the two standing claims
 * join from `2xl`, where all four fit again (1 375 px of 1 424 px). Between `md` and `xl` the band
 * runs to two lines, which is `flex-wrap` doing what §7 asks — and it is also what keeps these
 * numbers true of a locale whose translation is longer than English's.
 *
 * Named breakpoints, not `min-[1320px]`: Tailwind's arbitrary `min-[…]:` variant compiled this
 * project's stylesheet down to its base layer (1 345 B, every utility missing, no error raised) —
 * reproduced on a clean `.next`, reverted, and pinned by `tests/unit/ui-site-header.test.tsx`.
 *
 * The compact `EN · EUR` control the canvas draws in the category row — one link, ~90 px — is spec
 * 008's, together with the currency menu it implies (§14 A4's last sentence). When it lands, the
 * switcher leaves this band and all four claims fit at every desktop width.
 */
const CLAIM_FROM = {
  /** From the `md` breakpoint (768 px), where the strip stops being the mobile artboard's. */
  md: "hidden md:inline",
  /** The long cutoff line, from `xl` (1280 px). */
  long: "hidden xl:inline",
  /** `Prices include delivery and VAT` and `7-day freshness guarantee`, from `2xl` (1536 px). */
  wide: "hidden 2xl:inline",
} as const;

/** `|` between two visible claims: decoration, so it is hidden from assistive tech. */
function Divider({
  from,
}: {
  readonly from: keyof typeof CLAIM_FROM;
}): ReactElement {
  return (
    <span aria-hidden="true" className={`text-rule ${CLAIM_FROM[from]}`}>
      |
    </span>
  );
}

/**
 * Punctuation that glues two message keys into the artboard's one sentence (`Help & WhatsApp:`,
 * `· Mon–Sat 8–20 CET`). Decorative, so it is `aria-hidden`, and it is punctuation rather than
 * copy — which is why it may be a literal (`fo/no-literal-strings` scans for letters).
 */
function Punctuation({
  children,
  desktopOnly = false,
}: {
  readonly children: string;
  readonly desktopOnly?: boolean;
}): ReactElement {
  return (
    <span aria-hidden="true" className={desktopOnly ? "hidden md:inline" : ""}>
      {children}
    </span>
  );
}

/**
 * One category row entry. A link when the registry publishes it, otherwise its label as plain
 * text — never a dead link and never a disabled-looking one (AC-14).
 */
function CategoryEntry({
  item,
  t,
}: {
  readonly item: HeaderItem;
  readonly t: Translator;
}): ReactElement {
  const label = registryLabel(t, item.labelKey);
  // `Same-day` on the mobile artboard, `Same-day delivery` on the desktop one: the registry
  // carries both keys, so the breakpoint picks one instead of the row truncating.
  const content =
    item.shortLabelKey === undefined ? (
      label
    ) : (
      <>
        <span className="md:hidden">
          {registryLabel(t, item.shortLabelKey)}
        </span>
        <span className="hidden md:inline">{label}</span>
      </>
    );
  const className = [
    // The display utility is exclusive: `hidden` and `inline-flex` in one class list would leave
    // the outcome to the order Tailwind happens to emit them in, and `hidden` would lose.
    item.showOnMobile ? "inline-flex" : "hidden md:inline-flex",
    "items-center whitespace-nowrap md:whitespace-normal",
    // The mobile artboard draws the six-entry row in an order of its own (Best sellers ·
    // Bouquets · Roses · Plants · Occasions · Same-day). One DOM list in the desktop order, with
    // the mobile position applied as a flex `order` that `md` clears — rather than two lists, or
    // two orders of the same list, that somebody has to keep in sync.
    item.mobileOrder === undefined
      ? ""
      : (MOBILE_ORDER[item.mobileOrder] ?? ""),
    // The 44 px tap target applies to a **link**. While the entry is text (Phase 0, AC-14) there
    // is nothing to hit, and forcing 44 px would inflate the mobile category row from the
    // artboard's 28 px to 44 px for a row nobody can press. The task that publishes the first
    // category therefore also grows the row, which is the honest order.
    item.href === undefined ? "" : "min-h-[44px]",
    item.accent ? "text-accent" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (item.href === undefined) {
    return (
      <span className={className} data-fo-header-item={item.id}>
        {content}
      </span>
    );
  }
  return (
    <a className={className} data-fo-header-item={item.id} href={item.href}>
      {content}
    </a>
  );
}

/**
 * One account cluster entry: icon plus label. The label is the accessible name at every width and
 * becomes visible from `md` up, which is how the mobile artboard's icon-only cluster and the
 * desktop artboard's labelled one are one piece of markup (WCAG 2.5.3 holds, because the visible
 * label *is* the name).
 */
function AccountEntry({
  item,
  label,
}: {
  readonly item: HeaderItem;
  /** Already resolved by the caller: `Basket (0)` needs the `{count}` argument. */
  readonly label: string;
}): ReactElement {
  const icon = ACCOUNT_ICONS[item.id];
  const className = [
    item.showOnMobile ? "inline-flex" : "hidden md:inline-flex",
    "gap-xs flex-col items-center justify-center text-sm md:min-w-[72px]",
    // As in the category row: the 44 px target is a property of a **link**. In Phase 0 these are
    // text, and reserving 44 px of width each for three of them would push the 390 px artboard's
    // lockup into the cluster.
    item.href === undefined ? "" : "min-h-[44px] min-w-[44px]",
  ]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      {icon === undefined ? null : <Icon name={icon} size={22} />}
      <span className="sr-only md:not-sr-only">{label}</span>
    </>
  );

  if (item.href === undefined) {
    // Unpublished (010/019 own these pages): the label with its icon, not a link, not a control.
    return (
      <span className={className} data-fo-header-item={item.id}>
        {content}
      </span>
    );
  }
  return (
    <a className={className} data-fo-header-item={item.id} href={item.href}>
      {content}
    </a>
  );
}

export interface SiteHeaderProps {
  /** The locale of the document the header is rendered on; it drives every URL and the chip. */
  readonly locale: string;
  /**
   * The basket count the canvas prints as `Basket (0)`. Zero in Phase 0 and on every cached
   * document: a per-visitor number would make the header vary, and spec 010 owns the basket, so
   * the prop exists to be *passed* by that spec rather than to be read from a cookie here.
   */
  readonly basketCount?: number;
}

export function SiteHeader({
  locale,
  basketCount = 0,
}: SiteHeaderProps): ReactElement {
  const t = useTranslations();
  // A second, namespace-bound translator for the two keys that take an ICU argument: next-intl's
  // key typing accepts `{count}`/`{currency}` messages only through the namespace that owns them.
  const nav = useTranslations("nav");

  const home = localePath(locale, "home");
  const currency = headerCurrencyCode(locale);
  const categories = headerCategoryItems(locale);
  const account = headerAccountItems(locale);
  const endCluster = headerEndClusterItems(locale);
  const search = siteLink(SEARCH_LINK_ID);
  /** The basket carries a count; the other two are plain registry labels. */
  const accountLabel = (item: HeaderItem): string =>
    item.id === "basket"
      ? nav("basket", { count: basketCount })
      : registryLabel(t, item.labelKey);
  const { contact, tradingName } = COMPANY;

  return (
    <header
      className="border-rule bg-surface layer-header sticky top-0 border-b"
      data-fo-header
    >
      {/* 1. Utility strip. The mobile artboard prints the short cutoff line and the help channel;
             the desktop artboard prints all four claims, centred and rule-separated. §14 A4 adds
             spec 003's language switcher and the currency chip at the inline end, where they are
             visible at 390 px without scrolling — the horizontally scrolling category row hid
             them. Two consequences, both measured and both deliberate: the band's minimum is
             44 px rather than the artboards' 34, because it now carries links; and the claims are
             centred in the space the controls leave rather than across the full width, printed as
             far as that space reaches (`CLAIM_FROM`). */}
      <div
        className={`border-rule text-ink-muted gap-x-md gap-y-xs flex min-h-[44px] flex-wrap items-center justify-between border-b text-xs tracking-[0.06em] ${BLEED}`}
        data-fo-header-band="utility"
      >
        <div className="gap-x-md gap-y-xs flex flex-wrap items-center md:flex-1 md:justify-center">
          <span className="xl:hidden">{t("nav.utility.cutoffShort")}</span>
          <span className={CLAIM_FROM.long}>{t("nav.utility.cutoff")}</span>
          <Divider from="wide" />
          <span className={CLAIM_FROM.wide}>
            {t("nav.utility.pricesInclude")}
          </span>
          <Divider from="wide" />
          <span className={CLAIM_FROM.wide}>{t("nav.utility.guarantee")}</span>
          <Divider from="md" />
          {/* `Help & WhatsApp: +1 (213) 592-5150 · Mon–Sat 8–20 CET`, the artboards' one
              sentence. The number is printed once and is the `tel:` link; the phone glyph in
              front of it is the `wa.me` link (the canvas draws exactly one glyph here, and the
              icon set holds no WhatsApp mark — every icon in it is traceable to a canvas
              element), named from the catalogue rather than by repeating the word. Both URLs are
              built from the single E.164 number in `company.ts`, so the printed form and the
              dialled form cannot disagree. */}
          <span className="gap-xs inline-flex flex-wrap items-center">
            {contact.whatsapp ? (
              <a
                className={`${TARGET} min-w-[44px] justify-center`}
                href={`https://wa.me/${contact.phoneE164.slice(1)}`}
              >
                <Icon
                  label={t("company.support.whatsapp")}
                  name="phone"
                  size={12}
                />
              </a>
            ) : null}
            {/* Label and colon in one node, so the flex gap does not open a space in front of
                the punctuation ("Help & WhatsApp :"). */}
            <span>
              {t("company.support.label")}
              <Punctuation>:</Punctuation>
            </span>
            <a className={TARGET} href={`tel:${contact.phoneE164}`}>
              {contact.phoneDisplay}
            </a>
            <Punctuation desktopOnly>·</Punctuation>
            <span className="hidden md:inline">
              {t("company.support.hours")}
            </span>
          </span>
        </div>

        {/* Spec 003's switcher, **mounted rather than restyled**: its markup and the
            `src/modules/i18n` barrel are untouched, so spec 003 AC-3 and this spec's AC-7 both
            hold. The row layout, the 44 px target on each of its three links and the suppression
            of its `underline` (a utility strip is not prose; the row treatment carries the
            affordance) are applied from this wrapper through descendant variants. */}
        <div
          className="gap-md flex shrink-0 items-center"
          data-fo-header-controls
        >
          <div className={SWITCHER_WRAPPER} data-fo-header-switcher>
            <LocaleSwitcher locale={locale} />
          </div>
          <span data-fo-header-currency>
            <Chip
              aria-label={nav("currency.label", { currency })}
              tone="neutral"
            >
              {currency}
            </Chip>
          </span>
        </div>
      </div>

      {/* 2 + 3. Masthead and the mobile search band: one grid, so the search band is a single set
             of DOM nodes that the two artboards place differently (row 2, full width, on mobile;
             the middle column of the 300 / 1fr / 300 masthead on desktop) instead of being
             rendered twice. */}
      <div
        // `gap-x-*` only: a row gap would be added to the two declared rows and the band would be
        // 16 px taller than the artboard.
        className={`gap-x-md md:gap-x-xl grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[50px_52px] items-center md:grid-cols-[300px_minmax(0,1fr)_300px] md:grid-rows-[84px] ${BLEED}`}
        data-fo-header-band="masthead"
      >
        <div className="gap-sm md:gap-md flex items-center">
          {/* Nothing to disclose while every nav target is unpublished, so the canvas's menu
              button ships disabled rather than wired to an empty panel (AC-14). */}
          <button
            aria-label={t("nav.menu.label")}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center md:hidden"
            disabled
            type="button"
          >
            <Icon name="menu" size={22} />
          </button>
          <a className={`gap-sm md:gap-md ${TARGET}`} href={home}>
            <Mark className="h-[26px] w-[26px] md:h-[40px] md:w-[40px]" />
            <span className="display text-[19px] tracking-[0.04em] md:text-[26px]">
              {tradingName}
            </span>
          </a>
        </div>

        {/* The search band, exactly as the artboards draw it (§14 A4): a field-shaped box holding
            the placeholder sentence and, from `md` up, a button-shaped box holding the word
            `Search`. Text — not an `<input>`, not a `<button>`, not a `<form>` — because there is
            no search route until spec 008 and this header does not render affordances that do
            nothing. `nav.search.help` is the screen-reader sentence that says so; it is inside
            the box rather than attached to a control, because there is no control. */}
        <div
          className="col-span-3 row-start-2 flex md:col-span-1 md:col-start-2 md:row-start-1"
          data-fo-header-search
        >
          <span className="border-rule ps-md pe-md text-ink-subtle md:border-border-strong md:text-md flex min-h-[42px] flex-1 items-center rounded-full border text-sm md:min-h-[48px] md:rounded-s-sm md:rounded-e-none md:border-e-0">
            {/* The mobile artboard puts a search glyph inside the pill; the desktop artboard has
                the dark `Search` box instead and no glyph. */}
            <Icon className="me-sm md:hidden" name="search" size={16} />
            <span className="truncate">
              {registryLabel(t, search.labelKey)}
            </span>
            <span className="sr-only">
              {registryLabel(t, search.descriptionKey ?? "nav.search.help")}
            </span>
          </span>
          <span className="bg-surface-inverse text-on-inverse md:text-md hidden min-h-[48px] items-center justify-center rounded-e-sm px-[26px] font-medium tracking-[0.02em] md:inline-flex">
            {t("nav.search.submit")}
          </span>
        </div>

        <div className="gap-md flex items-center justify-end">
          {account.map((item) => (
            <AccountEntry
              item={item}
              key={item.id}
              label={accountLabel(item)}
            />
          ))}
        </div>
      </div>

      {/* 4. Category row. It scrolls on the mobile artboard and wraps on the desktop one, because
             a German compound or the +40 % `en-XA` pseudo-locale must never be truncated. With the
             switcher and the chip in the utility strip (§14 A4) it is the single ~52 px line the
             canvas draws. */}
      <nav
        aria-label={registryLabel(t, CATEGORY_NAV_LABEL_KEY)}
        className="border-rule border-t"
      >
        <div
          className={`gap-md flex min-h-[28px] items-center justify-between overflow-x-auto md:min-h-[52px] md:flex-wrap md:overflow-x-visible ${BLEED}`}
          data-fo-header-band="categories"
        >
          {/* The mobile artboard prints the row in the canvas's label voice (11 px, 600, tracked,
              uppercase); the desktop artboard prints it at 15 px/500 in sentence case. */}
          <div className="gap-md text-ink md:text-md flex items-center text-xs font-semibold tracking-[0.14em] uppercase md:flex-wrap md:gap-[30px] md:font-medium md:tracking-normal md:normal-case">
            {categories.map((item) => (
              <CategoryEntry item={item} key={item.id} t={t} />
            ))}
          </div>
          <div
            className="gap-md label flex shrink-0 items-center md:ms-auto"
            data-fo-header-end
          >
            {endCluster.map((item) => (
              <CategoryEntry item={item} key={item.id} t={t} />
            ))}
          </div>
        </div>
      </nav>
    </header>
  );
}
