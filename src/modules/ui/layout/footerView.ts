/**
 * The `SiteFooter` view model (spec 004 §5.1's registry contracts, §5.3 "Footer", AC-9, AC-14;
 * TASK-049).
 *
 * One pure projection from the three Phase-0 registries — `site-links.ts`, `company.ts`,
 * `payment-methods.ts` — to the exact set of facts the footer renders. It exists so that:
 *
 *  - **`isPublished()` and `isCompanyRegistered()` stay the only consumer paths for their flags**
 *    (§5.1). The component never reads `link.published` or `company.registered`: it reads a
 *    `href` that is either present (published, so a real URL from `localePath()`) or absent
 *    (unpublished, so the label renders as text — AC-14, "never a dead link, never a
 *    disabled-looking one"), and an `identity` block that is either present or absent.
 *  - the five footer states of §5.3 are reachable **without** editing the registries: the gallery
 *    and the unit tests build a `FooterView` and hand it in, so `links-populated` and
 *    `company-registered` are testable a year before 007 publishes a page or the OÜ exists.
 *  - a link's URL is built by `localePath()` and by nothing else (§6): no string concatenation
 *    lives in the footer.
 *
 * Deliberately **not** here: any user-facing string. A view carries message *keys* and data
 * (`tradingName`, `displayName`, `phoneDisplay`), and the component resolves the keys —
 * `plan/03` §5 and `CLAUDE.md`'s no-literal rule apply to the projection as much as to the JSX.
 */
import { type Company, COMPANY, isCompanyRegistered } from "@/config/company";
import { anyDeliveryDatesOpen } from "@/config/countries";
import {
  availablePaymentMethods,
  type PaymentMethod,
} from "@/config/payment-methods";
import {
  groupLinks,
  isPublished,
  linkLabelKey,
  type SiteLink,
  type SiteLinkGroup,
  type SiteLinkGroupId,
  SITE_LINK_GROUPS,
} from "@/config/site-links";
import { localePath } from "@/modules/i18n";

/** A footer link: a label key, plus a URL **only** when its target is published. */
export interface FooterLinkView {
  readonly id: string;
  readonly labelKey: string;
  /** Present iff `isPublished(id)`; absent means "render the label as text" (AC-14). */
  readonly href?: string;
}

export interface FooterGroupView {
  readonly id: string;
  readonly headingKey: string;
  readonly links: readonly FooterLinkView[];
}

/** The registry facts a company identity line may state once they exist (`plan/07` §6). */
export interface CompanyIdentityView {
  readonly legalName: string;
  /** One line, already ordered by `formatAddressBlock`'s caller — see `companyIdentity()`. */
  readonly address: string;
  readonly registrationNumber: string;
  readonly registryName: string;
  readonly vatId: string;
}

export interface FooterCompanyView {
  readonly tradingName: string;
  readonly descriptionKey: string;
  readonly operatedByKey: string;
  readonly contact: {
    readonly labelKey: string;
    readonly hoursKey: string;
    readonly phoneDisplay: string;
    readonly phoneHref: string;
  };
  /** Present **only** while `company.registered` is true (AC-9). */
  readonly identity?: CompanyIdentityView;
}

export interface FooterView {
  /** The canvas's two named link columns: `sending`, `company`. */
  readonly columns: readonly FooterGroupView[];
  /** The legal row, which the canvas draws without a visible heading. */
  readonly legal: FooterGroupView;
  readonly company: FooterCompanyView;
  /** The methods we can actually process, in registry order. Empty in Phase 0 (§8). */
  readonly paymentMethods: readonly PaymentMethod[];
}

/**
 * The legal row is the one footer group the canvas draws without a heading and at the foot of the
 * colophon; every other footer group is a link column. So a group added to `site-links.ts` by 007
 * becomes a column with no edit here (the "a page is data" promise applied to the chrome).
 */
const LEGAL_GROUP_ID = "legal" satisfies SiteLinkGroupId;

function footerGroups(): readonly SiteLinkGroup[] {
  return SITE_LINK_GROUPS.filter((group) => group.surface === "footer");
}

/**
 * A link's URL, or `undefined`. Unpublished → `undefined`, so the label renders as text; a
 * published link's `target.kind` is `"route"` by `SiteLinkSchema`'s refinement, which is what
 * makes "published implies a real page type" a schema fact rather than a hope here.
 */
function hrefFor(
  locale: string,
  link: SiteLink,
  unavailable: ReadonlySet<string>,
): string | undefined {
  if (!isPublished(link.id)) return undefined;
  if (link.target.kind !== "route") return undefined;
  // **Permission is not existence** (spec 004 AC-14; TASK-113). `isPublished()` says the site may
  // link at this page type; whether the page is *there in this locale* is a fact only the owning
  // module knows, and `src/modules/ui` may not import it (`plan/01` §5 — the catalogue depends on
  // the UI, not the other way round). So the caller hands in the ids whose page is missing here,
  // and the row renders as text exactly as an unpublished one does. `/de/anlaesse` and
  // `/pl/okazje` are 404s while no occasion carries a German or Polish slug.
  if (unavailable.has(link.id)) return undefined;
  return localePath(locale, link.target.pageType);
}

function groupView(
  locale: string,
  group: SiteLinkGroup,
  unavailable: ReadonlySet<string>,
): FooterGroupView {
  const datesOpen = anyDeliveryDatesOpen();
  return {
    id: group.id,
    headingKey: group.headingKey,
    // Every row that asserts a delivery date nobody has agreed to is *absent*, not reworded
    // (spec 004 §14 A19, `/review 70`; TASK-120): "Delivery times and cutoffs" promised cutoffs
    // on every page while the guide two scrolls below said no florist had agreed to one. Same
    // predicate as the picker, the utility strip and the category row.
    links: groupLinks(group.id as SiteLinkGroupId)
      .filter((link) => datesOpen || !link.requiresDeliveryDates)
      .map((link) => {
        const href = hrefFor(locale, link, unavailable);
        return href === undefined
          ? { id: link.id, labelKey: linkLabelKey(link) }
          : { id: link.id, labelKey: linkLabelKey(link), href };
      }),
  };
}

/**
 * The identity clauses, or `undefined` while unregistered. The address is joined into one line
 * because the colophon prints it inline ("Operated by X, <address>, <number>."), not as a postal
 * block — `formatAddressBlock` is for an envelope, and `plan/03` §8 keeps that shape in the i18n
 * module for the checkout.
 */
export function companyIdentity(
  company: Company = COMPANY,
  registered: boolean = isCompanyRegistered(),
): CompanyIdentityView | undefined {
  if (!registered) return undefined;
  const { legalName, address, registrationNumber, registryName, vatId } =
    company;
  // `CompanySchema`'s refinement guarantees all five when `registered` is true; the guard is what
  // makes that guarantee visible to the type system rather than asserted with `!`.
  if (
    legalName === undefined ||
    address === undefined ||
    registrationNumber === undefined ||
    registryName === undefined ||
    vatId === undefined
  ) {
    return undefined;
  }
  return {
    legalName,
    // `", "` is a literal on purpose, and stays one: a registered address is printed in its own
    // country's postal order, which is spec 007's `formatAddress` (and `Intl.ListFormat`) to own
    // — not a footer's comma. Nothing renders this branch while `registered` is false
    // (`/review 30` nit 2).
    address: [...address.lines, address.postalCode, address.city].join(", "),
    registrationNumber,
    registryName,
    vatId,
  };
}

/**
 * The identity block. Written as two whole objects rather than a conditional spread because
 * `exactOptionalPropertyTypes` treats "the property is absent" and "the property is `undefined`"
 * as different types — and here the difference is the point: AC-9 is about a clause the document
 * does not contain.
 */
function companyView(company: Company, registered: boolean): FooterCompanyView {
  const base = {
    tradingName: company.tradingName,
    descriptionKey: company.descriptionKey,
    operatedByKey: company.operatedByKey,
    contact: {
      labelKey: company.contact.labelKey,
      hoursKey: company.contact.hoursKey,
      phoneDisplay: company.contact.phoneDisplay,
      phoneHref: `tel:${company.contact.phoneE164}`,
    },
  } as const satisfies Omit<FooterCompanyView, "identity">;
  const identity = companyIdentity(company, registered);
  return identity === undefined ? base : { ...base, identity };
}

export interface FooterViewOptions {
  readonly company?: Company;
  readonly registered?: boolean;
  readonly paymentMethods?: readonly PaymentMethod[];
  /**
   * Link ids whose target is **published but does not exist in this locale** (spec 008 AC-20,
   * spec 004 AC-14; TASK-113). Their labels render as text, exactly as an unpublished row's do.
   *
   * The layout supplies it, because only a module that may read the catalogue can answer "is
   * there an occasions index in German" — see `hrefFor()`. Empty by default, so every existing
   * caller and every test keeps its behaviour.
   */
  readonly unavailable?: readonly string[];
}

/**
 * Project the registries for one locale. The optional arguments are for the gallery and the unit
 * tests (§5.3's five states); the application calls it with the locale alone.
 */
export function footerView(
  locale: string,
  options: FooterViewOptions = {},
): FooterView {
  const company = options.company ?? COMPANY;
  const registered = options.registered ?? isCompanyRegistered();
  const unavailable = new Set(options.unavailable ?? []);
  return {
    columns: footerGroups()
      .filter((group) => group.id !== LEGAL_GROUP_ID)
      .map((group) => groupView(locale, group, unavailable)),
    legal: groupView(
      locale,
      footerGroups().find((group) => group.id === LEGAL_GROUP_ID) ??
        // The registry is closed data parsed at module load; a missing legal group is a
        // configuration fault, not a render-time condition.
        (() => {
          throw new Error(
            `site-links.ts has no \`${LEGAL_GROUP_ID}\` footer group`,
          );
        })(),
      unavailable,
    ),
    company: companyView(company, registered),
    paymentMethods: availablePaymentMethods(options.paymentMethods),
  };
}
