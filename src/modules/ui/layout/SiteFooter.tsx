/**
 * `SiteFooter` — the v2 colophon (spec 004 §2 "Footer", §5.3, §8, §14 A10, A20, A21; AC-9, AC-14;
 * TASK-049, redrawn by TASK-176).
 *
 * It reproduces the footer of `docs/design/wireframes/chrome-desktop.dc.html` and
 * `chrome-mobile.dc.html`: paper-2, the third and last airmail edge on its top (A21 clause 2,
 * `airmail-edge-footer`), the sign-off, four columns — about (the logo and
 * `company.description`), the link columns the registry publishes (`Sending` today), Help &
 * WhatsApp (the `tel:` number and the hours) and Payment — and the fine row with the language list
 * and the "Cookie settings" control. One column on mobile.
 *
 * **Zero client JavaScript.** A synchronous Server Component: every link is an `<a>`, and the
 * language list is spec 003's `LocaleSwitcher` (four plain links), laid out from a wrapper.
 *
 * **What it is allowed to say**, each enforced by data rather than by this file:
 *
 *  - a link renders when `site-links.ts` publishes its target and the page exists in this locale,
 *    and **not at all** otherwise (AC-14 as §14 A20 amends it; TASK-173). A column with no linked
 *    entry is absent with its heading;
 *  - the identity line (legal name, address, registry code) only while `company.registered` is
 *    true (AC-9, `plan/07` §6);
 *  - the payment column names **only** methods `payment-methods.ts` marks `available` — none in
 *    Phase 0, so it prints the one true sentence — and the processor sentence ("payments are
 *    processed by Stripe") only once a payment integration ships, i.e. once a method is available
 *    (§14 A10). No logo image at all (§8);
 *  - no "Occasion reminders" form: `POST /api/reminders` stores and sends nothing, so the form was
 *    a control that did nothing (A20; A21 clause 1; `docs/design/README.md`). Its route and
 *    constants stay for the spec that will store consent and send the e-mail.
 *
 * The "Cookie settings" control is a `<button data-fo-consent-reopen>`, the attribute TASK-051's
 * consent island binds to (`CONSENT_REOPEN_ATTRIBUTE`).
 *
 * Logical CSS only (`fo/no-physical-css`, AC-5); every colour is a token utility.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { LocaleSwitcher } from "@/modules/i18n";

import { Mark } from "../icons/Mark";
import { Wordmark } from "../icons/Wordmark";
import { TrustMarks, type TrustMark } from "../trust/TrustMarks";
import {
  type FooterGroupView,
  type FooterView,
  footerView,
} from "./footerView";
import { CHROME_WRAP } from "./SiteHeader";

/**
 * The attribute TASK-051's consent island binds its re-open handler to. Exported so the two tasks
 * share one constant instead of two string literals in two files.
 */
export const CONSENT_REOPEN_ATTRIBUTE = "data-fo-consent-reopen";

/**
 * The endpoint of the occasion-reminder signup (design round 6). The footer no longer renders the
 * form (A20, A21 clause 1: the endpoint stores and sends nothing); the route keeps its contract.
 */
export const REMINDERS_ENDPOINT = "/api/reminders";

/**
 * The default id prefix. A second footer on one document — which only `/dev/components` has,
 * rendering the five states of §5.3 side by side — passes `idPrefix`, because two elements with one
 * id is an `aria-labelledby` target collision and a critical axe violation (AC-26). The reminder
 * ids are the route's return anchor and stay named while the form is not rendered.
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

/** The column heading: the label voice in muted ink (`.ftr h2`). */
const HEADING =
  "label text-ink-muted mb-[14px] font-body tracking-(--tracking-label)";

/** A column link: a 44 px target (`--target-min`). */
const COLUMN_LINK = "inline-flex min-h-(--target-min) items-center";

/** Secondary copy in a column: `--text-sm`, muted ink (`.fsmall`). */
const SMALL = "text-sm text-ink-muted";

/**
 * One link column: its published entries as `<a>`s, and nothing for an unpublished one (AC-14,
 * spec 004 §14 A20). `null` when no entry is left, so no heading stands over an empty list. The
 * column is a `<nav>` named by its own heading, or by `aria-label` for the legal row, which sits in
 * the fine row without one.
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
  readonly layout?: "column" | "inline";
}): ReactElement | null {
  const linked = group.links.filter(
    (link): link is typeof link & { readonly href: string } =>
      link.href !== undefined,
  );
  if (linked.length === 0) return null;
  const headingId = `${idPrefix}-group-${group.id}`;
  const heading = label(group.headingKey);

  if (layout === "inline") {
    return (
      <nav
        aria-label={heading}
        className="gap-y-xs flex flex-wrap items-center gap-x-[18px]"
      >
        {linked.map((link) => (
          <a key={link.id} href={link.href} className={COLUMN_LINK}>
            {label(link.labelKey)}
          </a>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-labelledby={headingId}>
      <h2 id={headingId} className={HEADING}>
        {heading}
      </h2>
      <ul className="gap-xs m-0 grid list-none p-0">
        {linked.map((link) => (
          <li key={link.id}>
            <a href={link.href} className={COLUMN_LINK}>
              {label(link.labelKey)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
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
   * level because they come from a zod-parsed registry. This one cast is the boundary; a key that
   * does not resolve fails `pnpm i18n:check`, which reads the same registries.
   */
  const label = (key: string): string =>
    translate(key as Parameters<typeof translate>[0]);
  const resolved = view ?? footerView(locale);
  const { company, columns, legal, paymentMethods } = resolved;

  return (
    // `mt-auto` keeps the footer at the foot of a short document.
    <footer className="airmail-edge-footer bg-surface-raised mt-auto pt-[64px] pb-[32px]">
      <div className={CHROME_WRAP}>
        {/* The sign-off in Fraunces 300 italic: decoration, so hidden from assistive tech (no
            Caveat outside the product page's card preview, A21 clause 3). */}
        <p
          aria-hidden="true"
          className="display-em text-2xl-s m-0 mb-[56px] rotate-(--tilt-signoff) md:text-2xl"
          data-fo-footer-signoff
        >
          {translate("footer.signoff")}
        </p>

        <div
          className="grid grid-cols-1 gap-[36px] md:grid-cols-2 lg:grid-cols-[1.3fr_0.8fr_1fr_1.2fr] lg:gap-[48px]"
          data-fo-footer-grid
        >
          {/* About: the logo and the relay sentence, then the identity line once registered.
              The logo is not a link here: the masthead lockup is the one element that may link a
              document to its own path (spec 003 AC-6, `tests/e2e/locale-routing.spec.ts`), and a
              second home link on the home is a link to the page you are on. */}
          <div>
            <div
              className="text-logo-ink inline-flex min-h-(--target-min) items-center gap-[10px]"
              data-fo-footer-logo
            >
              <Mark className="h-[28px] w-[28px] md:h-[38px] md:w-[38px]" />
              <Wordmark
                className="h-[19px] md:h-[25px]"
                label={company.tradingName}
              />
            </div>
            <p className="text-ink-muted m-0 mt-[14px] max-w-[36ch]">
              {label(company.descriptionKey)}
            </p>
            {/* AC-9: the identity clauses only when they exist. While `registered` is false
                this renders nothing at all — not an empty sentence, not a bracket. */}
            {company.identity === undefined ? null : (
              <p className={`${SMALL} m-0 mt-[14px] max-w-[36ch]`}>
                {translate(
                  company.operatedByKey as Parameters<typeof translate>[0],
                  {
                    legalName: company.identity.legalName,
                    address: company.identity.address,
                    registrationNumber: company.identity.registrationNumber,
                  },
                )}
              </p>
            )}
            <TrustMarks marks={marks} />
          </div>

          {columns.map((group) => (
            <LinkColumn
              key={group.id}
              group={group}
              label={label}
              idPrefix={idPrefix}
            />
          ))}

          {/* Help & WhatsApp: one number, dialled from `company.ts`, and its hours. */}
          <div>
            <h2 className={HEADING}>{label(company.contact.labelKey)}</h2>
            <ul className="gap-xs m-0 grid list-none p-0">
              <li>
                <a href={company.contact.phoneHref} className={COLUMN_LINK}>
                  {company.contact.phoneDisplay}
                </a>
              </li>
            </ul>
            <p className={`${SMALL} m-0`}>{label(company.contact.hoursKey)}</p>
          </div>

          {/* Payment: no logo image, and no method name while none is available (§8). */}
          <div data-fo-footer-payment>
            <h2 className={HEADING}>{translate("footer.payment.heading")}</h2>
            {paymentMethods.length === 0 ? (
              <p className={`${SMALL} m-0`}>
                {translate("footer.payment.methods")}
              </p>
            ) : (
              <>
                {/* The separator is the canvas's literal `" · "`; locale-aware list formatting
                    arrives with the first page that lists anything a reader has to parse. */}
                <p className={`${SMALL} m-0`}>
                  {paymentMethods
                    .map((method) => method.displayName)
                    .join(" · ")}
                </p>
                {/* §14 A10: the processor sentence only once a payment integration ships. */}
                <p className={`${SMALL} mt-xs m-0`}>
                  {translate("footer.payment.processor")}
                </p>
              </>
            )}
          </div>
        </div>

        {/* The fine row: the legal links once they have pages, the language list and the consent
            re-open control. */}
        <div
          className="border-rule text-fine text-ink-muted gap-x-lg gap-y-sm mt-[48px] flex flex-wrap items-center justify-between border-t pt-[20px]"
          data-fo-footer-fine
        >
          <LinkColumn
            group={legal}
            label={label}
            idPrefix={idPrefix}
            layout="inline"
          />
          {/* Spec 003's switcher, laid out from this wrapper (its markup is unchanged, AC-3): a
              wrapping row, 44 px targets, the current language bold in ink. */}
          <div
            className="[&_ul]:gap-y-xs [&_[aria-current]]:text-ink [&_[aria-current]]:font-bold [&_[data-beta]]:before:content-['·_'] [&_a]:inline-flex [&_a]:min-h-(--target-min) [&_a]:items-center [&_a]:underline-offset-4 [&_li]:inline-flex [&_li]:min-h-(--target-min) [&_li]:items-center [&_ul]:m-0 [&_ul]:flex [&_ul]:list-none [&_ul]:flex-wrap [&_ul]:items-center [&_ul]:gap-x-[18px] [&_ul]:p-0"
            data-fo-footer-languages
          >
            <LocaleSwitcher locale={locale} />
          </div>
          {/* Withdrawal of consent, on every page (`plan/04` §11, §8). */}
          <button
            type="button"
            data-fo-consent-reopen=""
            className="text-link text-fine min-h-(--target-min) cursor-pointer font-bold underline underline-offset-4"
          >
            {translate("footer.cookieSettings")}
          </button>
        </div>
      </div>
    </footer>
  );
}
