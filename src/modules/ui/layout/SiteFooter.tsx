/**
 * `SiteFooter` — the dense colophon (spec 004 §2 "Footer", §5.3, §8 "Consumer information",
 * AC-9, AC-14; TASK-049).
 *
 * The founder-approved **Ft4 dense colophon** of `docs/design/homepage-v1/homepage-desktop.dc.html`
 * and `homepage-mobile.dc.html`, not §5.3's minimal legal list: an identity column (mark,
 * wordmark, the relay sentence, the help channel), the `Sending` and `Company` link columns, the
 * occasion-reminder signup, the payment colophon, and a legal row carrying the legal links, the
 * language list and the "Cookie settings" control.
 *
 * **Zero client JavaScript.** It is a synchronous Server Component: every link is an `<a>`, the
 * reminder signup is a plain `<form method="post">` that works with scripting disabled, and the
 * language list is spec 003's `LocaleSwitcher` (four plain links). `pnpm budget:client-js` is
 * byte-identical to the measurement before this task, which is spec §14 A1's guardrail — the
 * 1 434 B of headroom left on a locale document is reserved for the finder and consent islands,
 * and a footer island would have spent it.
 *
 * **What it is allowed to say.** Three honesty rules, each enforced by data rather than by this
 * file:
 *
 *  - a label renders as a **link** only when `site-links.ts` publishes its target, and as plain
 *    text otherwise — never a dead href, never a disabled-looking control (AC-14). In Phase 0
 *    that means both columns and the legal row render their labels as text, and 007/008/011 turn
 *    them into navigation by flipping `published`;
 *  - the company block prints the trading name and the contact channel, and **no** registry code,
 *    VAT id or registered address while `company.registered` is false (AC-9, `plan/07` §6). The
 *    canvas's `[COMPANY LEGAL NAME], [REGISTERED ADDRESS], [REGISTRATION NO]` placeholders do not
 *    ship: the sentence is rendered *without* the missing clauses, because a literal bracket on a
 *    live page is a worse disclosure than an absent one and an invented number is an offence;
 *  - the payment colophon names **only** methods `payment-methods.ts` marks `available`, which is
 *    none of them in Phase 0, so the canvas's `BLIK · Klarna · PayPal · Visa · Mastercard · Apple
 *    Pay` row renders as the two sentences that are true today and no logo image at all (§8's
 *    third-party-trademark rule). The founder cannot read a live-method claim off the demo.
 *
 * `TrustMarks` sits in the identity column and renders **nothing** in Phase 0 — and reserves no
 * box, so there is no hole in the footer (§5.3).
 *
 * The "Cookie settings" control ships here as a `<button data-fo-consent-reopen>` and is **wired**
 * by TASK-051, which owns the consent islands; AC-9's re-open clause is verified after that task.
 * The attribute — not a class, not a DOM position — is the contract between the two tasks, and it
 * is exported as `CONSENT_REOPEN_ATTRIBUTE` so the island cannot bind to a selector this file does
 * not render.
 *
 * Layout: the canvas's five-column colophon grid (`1.3fr 0.8fr 0.8fr 1.2fr 1fr`) at the desktop
 * artboard, stacking to a single column on mobile with the two link columns side by side. Those
 * ratios are written here rather than added to the `Grid` primitive because they are this
 * component's proportions and nothing else's. The block is **full-bleed**, like every section of
 * the artboards, with the canvas's own gutters (`40px 56px 24px` desktop, `32px 20px 20px`
 * mobile) rather than a centred `Container`; colours, gaps and every spacing step the scale has
 * are tokens, the five it does not have (20, 22, 26, 32, 56 px) are written out and
 * commented at the point of use, and every utility is logical (`fo/no-physical-css`, AC-5).
 *
 * Copy is read with an **unnamespaced** `useTranslations()` because half the keys arrive as fully
 * qualified paths from the registries (`footer.group.sending`, `company.description`): one
 * translator over the whole catalogue is what lets a config-supplied key and a literal key go
 * through the same call, and `pnpm i18n:check`'s fully-qualified rule sees both.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { LocaleSwitcher } from "@/modules/i18n";

import { Mark } from "../icons/Mark";
import { Button } from "../primitives/Button";
import { Cluster, Row, Stack } from "../primitives/layout";
import { Display, Label, Text } from "../primitives/typography";
import { TrustMarks, type TrustMark } from "../trust/TrustMarks";
import {
  type FooterGroupView,
  type FooterView,
  footerView,
} from "./footerView";

/**
 * The attribute TASK-051's consent island binds its re-open handler to. Exported so the two tasks
 * share one constant instead of two string literals in two files.
 */
export const CONSENT_REOPEN_ATTRIBUTE = "data-fo-consent-reopen";

/** The `<form>` target of the occasion-reminder signup (design round 6; the stub is this task's). */
export const REMINDERS_ENDPOINT = "/api/reminders";

/**
 * The default id prefix, and with it the two ids the rest of the system names: the signup's
 * anchor (`#footer-reminders`, where `POST /api/reminders` returns the visitor) and its field.
 * A second footer on one document — which only `/dev/components` has, rendering the five states
 * of §5.3 side by side — passes `idPrefix`, because two elements with one id is an
 * `aria-labelledby` target collision and a critical axe violation (AC-26).
 */
export const FOOTER_ID_PREFIX = "footer";
export const REMINDERS_ANCHOR = `${FOOTER_ID_PREFIX}-reminders`;
export const REMINDERS_FIELD_ID = `${FOOTER_ID_PREFIX}-reminder-email`;

export interface SiteFooterProps {
  /** The locale of the document this footer is rendered in; the language list needs it. */
  readonly locale: string;
  /**
   * The projected registries. Defaults to `footerView(locale)`, which is what the application
   * always uses; the gallery and the unit tests pass a view to reach the five states of §5.3
   * (`links-populated`, `company-registered`) without editing config.
   */
  readonly view?: FooterView;
  /** Empty in Phase 0 (§8). Present so the slot is a component and not a future edit. */
  readonly marks?: readonly TrustMark[];
  /** Gallery only: makes every id in this instance unique (see `FOOTER_ID_PREFIX`). */
  readonly idPrefix?: string;
}

/**
 * One link column. A published entry is an `<a>`; an unpublished one is the same label as plain
 * text, with no `aria-disabled` and no styling that suggests a broken control (AC-14).
 *
 * The column is a `<nav>` named from its own heading — by `aria-labelledby` when the heading is
 * visible, by `aria-label` for the legal row, which the canvas draws without one — so a footer's
 * several navigation landmarks are told apart without inventing an `a11y.*` key per column
 * (§5.3's "named `navigation`s").
 */
function LinkColumn({
  group,
  label,
  idPrefix,
  layout = "column",
}: {
  readonly group: FooterGroupView;
  readonly label: (key: string) => string;
  readonly idPrefix: string;
  /**
   * `column` is a headed link column; `inline` is the canvas's legal row — a wrapping horizontal
   * list with no visible heading, so its accessible name is an `aria-label` instead.
   */
  readonly layout?: "column" | "inline";
}): ReactElement {
  const headingId = `${idPrefix}-group-${group.id}`;
  const heading = label(group.headingKey);
  // The canvas sets the whole legal row at `--text-xs` (11 px) and the link columns at
  // `--text-sm` (13 px); the row's size travels with the layout so no caller can get it wrong.
  const size = layout === "inline" ? "xs" : "sm";
  // Both class names are written out: Tailwind scans source text, so `text-${size}` would
  // generate no rule at all.
  const linkClass = layout === "inline" ? "text-xs" : "text-sm";
  const entries = group.links.map((link) =>
    link.href === undefined ? (
      // Unpublished: the label, as text. A reader sees what is coming; a crawler sees no URL, so
      // there is no internal link to a non-200 page (AC-14).
      <Text key={link.id} as="span" size={size} tone="subtle">
        {label(link.labelKey)}
      </Text>
    ) : (
      <a key={link.id} href={link.href} className={linkClass}>
        {label(link.labelKey)}
      </a>
    ),
  );

  if (layout === "inline") {
    return (
      <Cluster as="nav" gap="md" align="center" aria-label={heading}>
        {entries}
      </Cluster>
    );
  }

  return (
    <Stack as="nav" gap="none" className="text-sm" aria-labelledby={headingId}>
      <Label id={headingId} className="mb-xs">
        {heading}
      </Label>
      {entries}
    </Stack>
  );
}

export function SiteFooter({
  locale,
  view,
  marks = [],
  idPrefix = FOOTER_ID_PREFIX,
}: SiteFooterProps): ReactElement {
  const translate = useTranslations();
  /**
   * Config-supplied keys (`footer.group.sending`, `company.description`) are strings at the type
   * level because they come from a zod-parsed registry, and the translator's parameter is the
   * catalogue's key union. This one cast is the boundary between the two, and it is narrow: a key
   * that does not resolve fails `pnpm i18n:check`, which reads the same registries.
   */
  const label = (key: string): string =>
    translate(key as Parameters<typeof translate>[0]);
  const resolved = view ?? footerView(locale);
  const { company, columns, legal, paymentMethods } = resolved;

  return (
    // The canvas's full-ink rule above the colophon spans the page, so it belongs to the landmark
    // and not to the centred container inside it. `mt-auto` keeps the footer at the foot of a
    // short document, exactly as the canvas does.
    <footer className="border-border-emphasis mt-auto border-t">
      {/* The canvas's colophon is **full-bleed** with a 56 px gutter, exactly like every other
          section of the desktop artboard (`padding: … 56px`), and 20 px on the mobile one — so
          the block is the canvas's `40px 56px 24px` / `32px 20px 20px` verbatim rather than a
          centred `Container` (whose `md:px-2xl` gutter is 72 px). 20, 32 and 56 are written as
          values because the spacing scale has no step there; the two that are on the scale
          (40 = `--spacing-xl`, 24 = `--spacing-lg`) are tokens. */}
      <div className="md:pt-xl md:pb-lg px-[20px] pt-[32px] pb-[20px] md:px-[56px]">
        <Stack gap="lg">
          {/* The canvas's mobile artboard puts the two link columns side by side and gives every
              other block the full width; the desktop artboard is the five-column colophon. */}
          {/* Gaps are the canvas's: 40 px between the desktop columns (`--space-xl`), and on
              mobile 16 px between the two side-by-side link columns (`--space-md`) with 24 px
              between the stacked blocks — the nearest scale steps to the mobile artboard's 16
              and 22. */}
          <div className="gap-x-md gap-y-lg md:gap-xl grid grid-cols-2 md:grid-cols-[1.3fr_0.8fr_0.8fr_1.2fr_1fr]">
            {/* Identity: mark, wordmark, the relay sentence, the help channel, the trust slot. */}
            <Stack gap="sm" className="col-span-2 md:col-span-1">
              <Row gap="sm" align="center">
                <Mark size={28} />
                {/* 22 px on the mobile artboard, 26 px on the desktop one. Written as values:
                    the type scale's nearest step (`--text-xl`) is a clamp that lands on 19/24,
                    and the colophon wordmark is the one place the canvas fixes both ends. */}
                <Display
                  as="p"
                  size="xl"
                  className="text-[22px] tracking-[0.04em] md:text-[26px]"
                >
                  {company.tradingName}
                </Display>
              </Row>
              <Text size="sm" tone="muted" className="max-w-[36ch]">
                {label(company.descriptionKey)}
              </Text>
              {/* AC-9: the identity clauses only when they exist. While `registered` is false
                  this renders nothing at all — not an empty sentence, not a bracket. */}
              {company.identity === undefined ? null : (
                <Text size="xs" tone="subtle" className="max-w-[36ch]">
                  {translate(
                    company.operatedByKey as Parameters<typeof translate>[0],
                    {
                      legalName: company.identity.legalName,
                      address: company.identity.address,
                      registrationNumber: company.identity.registrationNumber,
                    },
                  )}
                </Text>
              )}
              {/* The contact channel AC-9 requires beside the trading name: one number, reachable
                  by phone and WhatsApp, with its hours as localised prose. */}
              <Stack gap="none">
                <Label>{label(company.contact.labelKey)}</Label>
                <a href={company.contact.phoneHref} className="text-sm">
                  {company.contact.phoneDisplay}
                </a>
                <Text size="xs" tone="subtle">
                  {label(company.contact.hoursKey)}
                </Text>
              </Stack>
              <TrustMarks marks={marks} />
            </Stack>

            {columns.map((group) => (
              <LinkColumn
                key={group.id}
                group={group}
                label={label}
                idPrefix={idPrefix}
              />
            ))}

            {/* Occasion reminders (design round 6). A plain form: no island, no cookie, no
                request until the visitor submits, and the double-opt-in sentence states that
                nothing is stored before they confirm — which is also all `POST /api/reminders`
                does today (it stores nothing, sends nothing; `ReminderSink` is the seam). */}
            <form
              id={`${idPrefix}-reminders`}
              action={REMINDERS_ENDPOINT}
              method="post"
              className="col-span-2 md:col-span-1"
            >
              <Stack gap="sm">
                <Label>{translate("footer.reminders.heading")}</Label>
                <Text size="sm" tone="muted">
                  {translate("footer.reminders.body")}
                </Text>
                <Row gap="none" align="stretch">
                  <label
                    className="sr-only"
                    htmlFor={`${idPrefix}-reminder-email`}
                  >
                    {translate("footer.reminders.emailLabel")}
                  </label>
                  <input
                    id={`${idPrefix}-reminder-email`}
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder={translate("footer.reminders.emailLabel")}
                    // 44 px, not the canvas's 42: §5.3's tap-target floor wins over two pixels of
                    // drawing, and `Button size="sm"` is that height beside it.
                    className="border-border-strong px-sm min-h-[44px] w-full border text-sm"
                  />
                  {/* One line, as the canvas draws it: the field beside it is `w-full` and
                      shrinks, so a longer translated label costs the input width rather than
                      wrapping the control (§7's "wrap rather than truncate" applies to the
                      copy blocks, not to a two-word button). */}
                  <Button type="submit" size="sm" className="whitespace-nowrap">
                    {translate("footer.reminders.submit")}
                  </Button>
                </Row>
                <Text size="xs" tone="subtle">
                  {translate("footer.reminders.consent")}
                </Text>
                {/* Where the stub returns the visitor. Data, not a `Referer`: the handler
                    validates it against the locale registry, so the redirect cannot be steered
                    off-site. */}
                <input type="hidden" name="locale" value={locale} />
              </Stack>
            </form>

            {/* Payment. No logo image, and no method name while none is available (§8). */}
            <Stack gap="none" className="col-span-2 md:col-span-1">
              <Label className="mb-xs">
                {translate("footer.payment.heading")}
              </Label>
              {/* Either the method names or the "shown at checkout" sentence, never both: with
                  a method flipped `available` the canvas's row is the names, and the placeholder
                  sentence beneath it would read as a hedge on a list that is right there
                  (`/review 30` nit 1). The separator is a literal `" · "`, as the canvas draws
                  it; locale-aware list formatting (`Intl.ListFormat`) arrives with spec 007,
                  which owns the first page that lists anything a reader has to parse. */}
              {paymentMethods.length === 0 ? (
                <Text size="sm" tone="muted">
                  {translate("footer.payment.methods")}
                </Text>
              ) : (
                <Text size="sm" tone="muted">
                  {paymentMethods
                    .map((method) => method.displayName)
                    .join(" · ")}
                </Text>
              )}
              <Text size="sm" tone="subtle">
                {translate("footer.payment.processor")}
              </Text>
            </Stack>
          </div>

          {/* The legal row: legal links, the language list, the consent re-open control. */}
          {/* The canvas's legal row is one size (`--text-xs`) and one colour for everything in
              it, links and language list alike, so the size is set on the row. */}
          <Cluster
            gap="lg"
            justify="between"
            align="center"
            className="border-rule pt-md border-t text-xs"
          >
            <LinkColumn
              group={legal}
              label={label}
              idPrefix={idPrefix}
              layout="inline"
            />
            <Cluster gap="lg" align="center">
              {/* Spec 003's switcher: four plain links, language names, never a flag
                  (`plan/03` §2). Its markup is unchanged, so spec 003 AC-3 still holds. */}
              {/* The canvas lays the language names out horizontally. `LocaleSwitcher`'s markup
                  is spec 003's and stays untouched (AC-3), so the list is laid out from here —
                  the "restyled in place" of §5.3, as a wrapper rather than as an edit. */}
              <div className="[&_ul]:gap-md [&_ul]:flex [&_ul]:flex-wrap [&_ul]:items-center">
                <LocaleSwitcher locale={locale} />
              </div>
              {/* Withdrawal of consent, on every page (`plan/04` §11, §8). TASK-051 binds the
                  island to the attribute below; until then it is the seam and nothing else. */}
              <button
                type="button"
                data-fo-consent-reopen=""
                className="min-h-[44px] underline underline-offset-4"
              >
                {translate("footer.cookieSettings")}
              </button>
            </Cluster>
          </Cluster>
        </Stack>
      </div>
    </footer>
  );
}
