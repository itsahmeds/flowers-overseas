/**
 * The info pages as the application reads them (spec 041 §2, §5.2, AC-2; TASK-182).
 *
 * `infoPageExists()` is **the** existence predicate: the route params, the sitemap, the site-link
 * resolver and every in-body link call it, so deleting one content file removes that page's URL,
 * its sitemap entry, its footer link and every link to it, with no other change (AC-2). A page
 * with `requiresRegistration` (imprint, terms, privacy) exists only once
 * `isTraderIdentityComplete()` is true (the company registered, with its support mailbox),
 * whatever files are committed (§13 Q1; §14 A-founder-2026-10-23 clause 1).
 *
 * `infoPageView()` is the single view model the page, its JSON-LD, its metadata and the sitemap
 * read. It reads no cookie, no header and no clock: every visitor gets the same page.
 */
import {
  type Company,
  COMPANY,
  isTraderIdentityComplete,
  whatsappHref,
} from "@/config/company";
import { anyDeliveryDatesOpen } from "@/config/countries";
import {
  INFO_PAGE_IDS,
  type InfoPageId,
  infoPage,
  infoPageLocation,
} from "@/config/info-pages";
import {
  availablePaymentMethods,
  type PaymentMethod,
} from "@/config/payment-methods";

import { destinationsHubHref, hubView } from "../geo/index.ts";
import {
  launchLocaleCodes,
  localePath,
  routableLocale,
  routableLocaleCodes,
} from "../i18n/index.ts";

import { parseInfoFile, type ParsedInfoFile } from "./parse.ts";
import {
  type InfoContentProvider,
  staticInfoContentProvider,
} from "./provider.ts";
import type {
  HonestyAllow,
  InfoLinkTarget,
  InfoPageContent,
  InfoSectionBlock,
} from "./schemas.ts";

/** What a caller may substitute: a fixture provider, a company, the registration flag. */
export interface InfoPageOptions {
  readonly provider?: InfoContentProvider;
  readonly company?: Company;
  /**
   * The gate's answer for the three pages that wait for the company, overriding
   * `isTraderIdentityComplete(company)`; and, on the about page, whether the company block shows
   * the registered identity. A test fixture's switch, never a second flag in the application.
   */
  readonly registered?: boolean;
  /** `anyDeliveryDatesOpen()` unless a test hands in the other answer (AC-6). */
  readonly datesOpen?: boolean;
  /** The payment-method registry (AC-14's one-method fixture). */
  readonly paymentMethods?: readonly PaymentMethod[];
  /** Resolves a country's `nameKey` to its name, for the destination table's collation. */
  readonly nameOf?: (nameKey: string) => string;
}

const parsedCache = new WeakMap<
  InfoContentProvider,
  ReadonlyMap<string, ParsedInfoFile>
>();

function fileKey(pageId: string, locale: string): string {
  return `${pageId}/${locale}`;
}

/**
 * Every file of a provider, parsed once. A file that does not parse **throws**, naming the file
 * and the field: at build time that fails the build (AC-3), which is the point of parsing there.
 */
export function parsedInfoFiles(
  provider: InfoContentProvider = staticInfoContentProvider,
): ReadonlyMap<string, ParsedInfoFile> {
  const cached = parsedCache.get(provider);
  if (cached !== undefined) return cached;
  const map = new Map<string, ParsedInfoFile>();
  for (const file of provider.files()) {
    const result = parseInfoFile(file.path, file.source);
    if (!result.ok) {
      const lines = result.issues.map(
        (issue) => `${issue.file} [${issue.field}] ${issue.message}`,
      );
      throw new Error(`info content does not parse:\n${lines.join("\n")}`);
    }
    map.set(fileKey(result.file.pageId, result.file.locale), result.file);
  }
  parsedCache.set(provider, map);
  return map;
}

/** The trust content a locale renders, following `extends: en`; `undefined` when there is none. */
export function trustContent(
  pageId: InfoPageId,
  locale: string,
  provider: InfoContentProvider = staticInfoContentProvider,
): InfoPageContent | undefined {
  const files = parsedInfoFiles(provider);
  const file = files.get(fileKey(pageId, locale));
  if (file === undefined) return undefined;
  if (file.kind === "trust") return file.content;
  if (file.kind === "extends") {
    const parent = files.get(fileKey(pageId, file.parent));
    return parent?.kind === "trust" ? parent.content : undefined;
  }
  return undefined;
}

/** True when a parsed file (or the parent it extends) exists for the page in the locale. */
function hasContent(
  pageId: InfoPageId,
  locale: string,
  provider: InfoContentProvider,
): boolean {
  const files = parsedInfoFiles(provider);
  const file = files.get(fileKey(pageId, locale));
  if (file === undefined) return false;
  if (file.kind !== "extends") return true;
  const parent = files.get(fileKey(pageId, file.parent));
  return parent !== undefined && parent.kind !== "extends";
}

/**
 * **The** existence predicate (AC-2): a parsed content file exists for the page in a routable
 * locale and, for a page with `requiresRegistration`, the trader identity is complete.
 */
export function infoPageExists(
  pageId: InfoPageId,
  locale: string,
  options: InfoPageOptions = {},
): boolean {
  if (routableLocale(locale) === undefined) return false;
  const identity =
    options.registered ?? isTraderIdentityComplete(options.company ?? COMPANY);
  if (infoPage(pageId).requiresRegistration && !identity) return false;
  return hasContent(
    pageId,
    locale,
    options.provider ?? staticInfoContentProvider,
  );
}

/** The page's path in a locale, composed by `localePath()` (spec 041 §6). */
export function infoPagePath(pageId: InfoPageId, locale: string): string {
  const location = infoPageLocation(pageId, locale);
  return location.leaf === undefined
    ? localePath(locale, location.segmentKey)
    : localePath(locale, "legal", location.leaf);
}

export interface InfoPageRef {
  readonly pageId: InfoPageId;
  readonly locale: string;
}

/**
 * The `site-links.ts` ids whose info page does not exist in this locale (spec 041 AC-21): the
 * document layout hands them to the footer, which then draws no entry for them, exactly as an
 * unpublished row is not drawn. `src/modules/ui` may not read this module, so the layout composes.
 */
export function missingInfoPageLinkIds(
  locale: string,
  options: InfoPageOptions = {},
): readonly string[] {
  return INFO_PAGE_IDS.flatMap((pageId) => {
    const linkId = infoPage(pageId).siteLinkId;
    if (linkId === undefined) return [];
    return infoPageExists(pageId, locale, options) ? [] : [linkId];
  });
}

/** The page in each launch locale where it exists: the language links and the hreflang source. */
export function infoPageAlternatePaths(
  pageId: InfoPageId,
  options: InfoPageOptions = {},
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    launchLocaleCodes()
      .filter((code) => infoPageExists(pageId, code, options))
      .map((code) => [code, infoPagePath(pageId, code)]),
  );
}

/** Every (page, locale) that exists, in locale then registry order. */
export function listInfoPages(
  options: InfoPageOptions = {},
): readonly InfoPageRef[] {
  const pages: InfoPageRef[] = [];
  for (const locale of routableLocaleCodes()) {
    for (const pageId of INFO_PAGE_IDS) {
      if (infoPageExists(pageId, locale, options))
        pages.push({ pageId, locale });
    }
  }
  return pages;
}

/** The top-level page whose segment this is in the locale, if any (the resolver's question). */
export function infoPageForSegment(
  locale: string,
  segment: string,
): InfoPageId | undefined {
  return INFO_PAGE_IDS.find((pageId) => {
    const location = infoPageLocation(pageId, locale);
    return (
      location.leaf === undefined &&
      infoPagePath(pageId, locale) === `/${locale}/${segment}`
    );
  });
}

/**
 * The legal document whose path this is in the locale, if any: `/{locale}/{legal}/{leaf}`, the
 * resolver's question at depth 3 (spec 041 §2 "Top-level segments": the four legal documents are
 * leaves under the `legal` segment).
 */
export function infoPageForLeaf(
  locale: string,
  segment: string,
  leaf: string,
): InfoPageId | undefined {
  return INFO_PAGE_IDS.find((pageId) => {
    const location = infoPageLocation(pageId, locale);
    return (
      location.leaf !== undefined &&
      infoPagePath(pageId, locale) === `/${locale}/${segment}/${leaf}`
    );
  });
}

/* -------------------------------------------------------------------------- */
/* The view model.                                                            */
/* -------------------------------------------------------------------------- */

export interface InfoSectionView {
  readonly id: string;
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly items: readonly { readonly title: string; readonly text: string }[];
  readonly ordered: boolean;
  readonly block: InfoSectionBlock | undefined;
}

export interface InfoLinkView {
  readonly to: InfoLinkTarget;
  readonly label: string;
  readonly href: string;
}

/** The help page's contact block (spec 041 §2 "Help and contact", AC-12, AC-34). */
export interface ContactView {
  readonly phoneDisplay: string;
  /** `tel:` from the E.164 value; the printed number keeps its call link (§2 L78). */
  readonly telHref: string;
  /** `https://wa.me/…` from the E.164 value, no query; absent when `whatsapp` is false. */
  readonly whatsappHref: string | undefined;
  /** Present only once `company.ts` has one (§13 Q2): never an empty slot. */
  readonly supportEmail: string | undefined;
  /** The privacy notice, only where it exists in this locale. */
  readonly privacyHref: string | undefined;
}

/**
 * The about page's company block (spec 041 §2 "Unregistered company", AC-11). It carries no
 * person's name in either state (§14 A-founder-2026-10-23 clause 4).
 */
export type CompanyBlockView =
  | { readonly registered: false }
  | {
      readonly registered: true;
      readonly legalName: string;
      readonly address: string;
      readonly registrationNumber: string;
    };

export interface DestinationRowView {
  readonly iso2: string;
  readonly nameKey: string;
  readonly stateKey: string;
  readonly href: string | undefined;
}

export interface InfoCrumbView {
  readonly labelKey: string;
  readonly labelValue?: string | undefined;
  readonly href?: string | undefined;
  readonly current: boolean;
}

export interface InfoPageView {
  readonly pageId: InfoPageId;
  readonly locale: string;
  readonly path: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly h1: string;
  readonly intro: string | undefined;
  readonly reviewed: boolean;
  readonly updatedAt: string;
  /** `infoPages.status.notYetOpen` renders under the `<h1>` while this is true (AC-6). */
  readonly notYetOpen: boolean;
  readonly sections: readonly InfoSectionView[];
  readonly faq: readonly { readonly q: string; readonly a: string }[];
  /** In-body links whose target exists in this locale, in authored order (§6). */
  readonly links: readonly InfoLinkView[];
  readonly contact: ContactView | undefined;
  readonly company: CompanyBlockView | undefined;
  readonly destinations: readonly DestinationRowView[] | undefined;
  /** The methods `payment-methods.ts` marks available; empty in Phase 0 (AC-14). */
  readonly paymentMethods: readonly PaymentMethod[] | undefined;
  readonly breadcrumb: readonly InfoCrumbView[];
  readonly honestyAllow: readonly HonestyAllow[];
}

/**
 * `{legalName}` is data, never copy: the one token a trust file may carry (the parser refuses any
 * other). It resolves only while the company is registered; `undefined` otherwise, and the section
 * that carries it does not render, so neither the token nor an empty name can appear (spec 041
 * §14 A-founder-2026-10-23 clause 3, About).
 */
function interpolate(
  text: string,
  company: Company,
  registered: boolean,
): string | undefined {
  if (!text.includes("{legalName}")) return text;
  if (!registered || company.legalName === undefined) return undefined;
  return text.replaceAll("{legalName}", company.legalName);
}

function paragraphsOf(body: string | undefined): readonly string[] {
  if (body === undefined) return [];
  return body
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim().replace(/\s+/gu, " "))
    .filter((paragraph) => paragraph !== "");
}

/** One section with its data slots filled, or `undefined` when a slot has nothing to say. */
function sectionView(
  section: InfoPageContent["sections"][number],
  company: Company,
  registered: boolean,
): InfoSectionView | undefined {
  const fill = (text: string) => interpolate(text, company, registered);
  const heading = fill(section.heading);
  const paragraphs = paragraphsOf(section.body).map(fill);
  const items = (section.items ?? []).map((item) => ({
    title: fill(item.title),
    text: fill(item.text),
  }));
  if (
    heading === undefined ||
    paragraphs.some((paragraph) => paragraph === undefined) ||
    items.some((item) => item.title === undefined || item.text === undefined)
  ) {
    return undefined;
  }
  return {
    id: section.id,
    heading,
    paragraphs: paragraphs.filter((text) => text !== undefined),
    items: items.flatMap((item) =>
      item.title === undefined || item.text === undefined
        ? []
        : [{ title: item.title, text: item.text }],
    ),
    ordered: section.ordered ?? false,
    block: section.block,
  };
}

function linkHref(
  to: InfoLinkTarget,
  locale: string,
  options: InfoPageOptions,
): string | undefined {
  if (to === "destinations") return destinationsHubHref(locale);
  return infoPageExists(to, locale, options)
    ? infoPagePath(to, locale)
    : undefined;
}

function companyBlock(company: Company, registered: boolean): CompanyBlockView {
  const { legalName, address, registrationNumber } = company;
  if (
    !registered ||
    legalName === undefined ||
    address === undefined ||
    registrationNumber === undefined
  ) {
    return { registered: false };
  }
  return {
    registered: true,
    legalName,
    // Printed inline in the `company.operatedBy` sentence, as the footer prints it.
    address: [...address.lines, address.postalCode, address.city].join(", "),
    registrationNumber,
  };
}

/**
 * The view model of one trust page, or `undefined` when the page does not exist in the locale.
 * The legal family's view is TASK-183's.
 */
export function infoPageView(
  pageId: InfoPageId,
  locale: string,
  options: InfoPageOptions = {},
): InfoPageView | undefined {
  if (infoPage(pageId).family !== "trust") return undefined;
  if (!infoPageExists(pageId, locale, options)) return undefined;
  const provider = options.provider ?? staticInfoContentProvider;
  const content = trustContent(pageId, locale, provider);
  if (content === undefined) return undefined;

  const company = options.company ?? COMPANY;
  const registered = options.registered ?? company.registered;
  const blocks = new Set(
    content.sections.flatMap((section) => section.block ?? []),
  );

  const links: InfoLinkView[] = [];
  for (const link of content.links) {
    const href = linkHref(link.to, locale, options);
    if (href !== undefined)
      links.push({ to: link.to, label: link.label, href });
  }

  const path = infoPagePath(pageId, locale);
  return {
    pageId,
    locale,
    path,
    seoTitle: content.seoTitle,
    seoDescription: content.seoDescription,
    h1: content.h1,
    intro: content.intro,
    reviewed: content.reviewed,
    updatedAt: content.updatedAt,
    notYetOpen: !(options.datesOpen ?? anyDeliveryDatesOpen()),
    sections: content.sections.flatMap(
      (section) => sectionView(section, company, registered) ?? [],
    ),
    faq: content.faq ?? [],
    links,
    contact:
      pageId === "help"
        ? {
            phoneDisplay: company.contact.phoneDisplay,
            telHref: `tel:${company.contact.phoneE164}`,
            whatsappHref: company.contact.whatsapp
              ? whatsappHref(company.contact)
              : undefined,
            supportEmail: company.supportEmail,
            privacyHref: infoPageExists("privacy", locale, options)
              ? infoPagePath("privacy", locale)
              : undefined,
          }
        : undefined,
    company: blocks.has("company")
      ? companyBlock(company, registered)
      : undefined,
    destinations: blocks.has("destinations")
      ? hubView(locale, options.nameOf).destinations.map((destination) => ({
          iso2: destination.iso2,
          nameKey: destination.nameKey,
          stateKey: destination.stateKey,
          href: destination.href,
        }))
      : undefined,
    paymentMethods: blocks.has("payment")
      ? availablePaymentMethods(options.paymentMethods)
      : undefined,
    breadcrumb: [
      {
        labelKey: "common.homeLink",
        href: localePath(locale, "home"),
        current: false,
      },
      { labelKey: "breadcrumb.entity", labelValue: content.h1, current: true },
    ],
    honestyAllow: content.honestyAllow,
  };
}
