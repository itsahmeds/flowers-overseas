/**
 * One trust page (spec 041 §5.3; design round 2, spec 041 §14 A1; TASK-182).
 *
 * A Server Component with no client JavaScript (AC-24): breadcrumb · `<h1>` · the not-open line
 * · intro · (help: the contact block, then the questions) · sections · in-body links. Every
 * string is a message key or the page's own content file; nothing is a literal. The round-2
 * structure: the help page's contact block is first in the DOM and placed on columns 8–12 by the
 * grid, the questions are visible `<h2>` + answer pairs flowing in two CSS columns (no
 * `<details>`, nothing hidden, AC-15), their 01–12 numbers are `aria-hidden`; how it works'
 * steps are an `<ol>`; about's DOM order is h1, status, intro, who runs it, why, today, company.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { InfoPageId } from "@/config/info-pages";

import { formatList, sortBy } from "../../i18n/index.ts";
import {
  Breadcrumbs,
  Container,
  Display,
  Eyebrow,
  Text,
} from "../../ui/index.ts";
import {
  type InfoPageView,
  type InfoSectionView,
  infoPageView,
} from "../pages.ts";

import { label, localeCode, type Translator } from "./label.ts";

export interface InfoPageProps {
  readonly pageId: InfoPageId;
  readonly locale: string;
}

const PROSE = "max-w-(--measure)";

function Paragraphs({
  paragraphs,
}: {
  readonly paragraphs: readonly string[];
}): ReactElement {
  return (
    <>
      {paragraphs.map((paragraph) => (
        <Text as="p" key={paragraph} size="md" className={`${PROSE} m-0`}>
          {paragraph}
        </Text>
      ))}
    </>
  );
}

function Items({
  section,
}: {
  readonly section: InfoSectionView;
}): ReactElement | null {
  if (section.items.length === 0) return null;
  const List = section.ordered ? "ol" : "ul";
  return (
    <List
      className={`m-0 grid list-none gap-[24px] p-0 md:grid-cols-2 ${section.ordered ? "[counter-reset:step]" : ""}`}
      data-fo-info-items={section.id}
    >
      {section.items.map((item) => (
        <li
          key={item.title}
          className={`grid gap-[6px] ${section.ordered ? "before:font-display before:text-mark [counter-increment:step] before:text-[28px] before:content-[counter(step)]" : ""}`}
        >
          <Text as="p" size="md" className="m-0 font-bold">
            {item.title}
          </Text>
          <Text as="p" size="md" tone="muted" className={`${PROSE} m-0`}>
            {item.text}
          </Text>
        </li>
      ))}
    </List>
  );
}

function CompanyBlock({
  view,
  t,
}: {
  readonly view: InfoPageView;
  readonly t: Translator;
}): ReactElement | null {
  const company = view.company;
  if (company === undefined) return null;
  if (!company.registered) {
    // No address, registry, VAT or legal-form field before registration (AC-11).
    return (
      <Text
        as="p"
        size="md"
        className={`${PROSE} m-0`}
        data-fo-company-block="unregistered"
      >
        {label(t, "infoPages.company.notRegistered")}
      </Text>
    );
  }
  return (
    <Text
      as="p"
      size="md"
      className={`${PROSE} m-0`}
      data-fo-company-block="registered"
    >
      {label(t, "company.operatedBy", {
        legalName: company.legalName,
        address: company.address,
        registrationNumber: company.registrationNumber,
      })}
    </Text>
  );
}

function DestinationTable({
  view,
  t,
}: {
  readonly view: InfoPageView;
  readonly t: Translator;
}): ReactElement | null {
  const rows = view.destinations;
  if (rows === undefined) return null;
  const ordered = sortBy(rows, localeCode(view.locale), (row) =>
    label(t, row.nameKey),
  );
  return (
    <table
      className="w-full max-w-(--measure) border-collapse text-start"
      data-fo-destination-table
    >
      <thead>
        <tr className="border-rule border-b">
          <th scope="col" className="py-[10px] text-start font-bold">
            {label(t, "occasionHub.countryColumn")}
          </th>
          <th scope="col" className="py-[10px] text-start font-bold">
            {label(t, "infoPages.delivery.status")}
          </th>
        </tr>
      </thead>
      <tbody>
        {ordered.map((row) => (
          <tr
            key={row.iso2}
            className="border-rule border-b"
            data-fo-destination-row={row.iso2}
          >
            <th scope="row" className="py-[10px] text-start font-normal">
              {row.href === undefined ? (
                label(t, row.nameKey)
              ) : (
                <a className="link" href={row.href}>
                  {label(t, row.nameKey)}
                </a>
              )}
            </th>
            <td className="text-ink-muted py-[10px]">
              {label(t, row.stateKey)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PaymentMethods({
  view,
}: {
  readonly view: InfoPageView;
}): ReactElement | null {
  const methods = view.paymentMethods;
  if (methods === undefined || methods.length === 0) return null;
  return (
    <Text as="p" size="md" className={`${PROSE} m-0`} data-fo-payment-methods>
      {formatList(
        methods.map((method) => method.displayName),
        localeCode(view.locale),
      )}
    </Text>
  );
}

function Section({
  section,
  view,
  t,
}: {
  readonly section: InfoSectionView;
  readonly view: InfoPageView;
  readonly t: Translator;
}): ReactElement {
  const headingId = `info-${section.id}`;
  // The payment section lists the available methods, or says we are not taking payments yet
  // (its body) while there are none (spec 041 §2, AC-14).
  const paymentListed =
    section.block === "payment" && (view.paymentMethods?.length ?? 0) > 0;
  return (
    <section
      aria-labelledby={headingId}
      className="border-rule grid gap-[14px] border-t py-[32px] md:grid-cols-[4fr_7fr] md:gap-x-[48px]"
      data-fo-info-section={section.id}
    >
      <Display as="h2" id={headingId} size="xl">
        {section.heading}
      </Display>
      <div className="grid gap-[14px]">
        {section.block === "company" ? (
          <CompanyBlock t={t} view={view} />
        ) : null}
        {section.block === "destinations" ? (
          <DestinationTable t={t} view={view} />
        ) : null}
        {paymentListed ? (
          <PaymentMethods view={view} />
        ) : (
          <Paragraphs paragraphs={section.paragraphs} />
        )}
        {section.block === "payment" ? null : <Items section={section} />}
      </div>
    </section>
  );
}

function ContactBlock({
  view,
  t,
}: {
  readonly view: InfoPageView;
  readonly t: Translator;
}): ReactElement | null {
  const contact = view.contact;
  if (contact === undefined) return null;
  return (
    <section
      aria-labelledby="info-contact"
      className="bg-card rounded-letter shadow-letter grid content-start gap-[12px] p-[28px] md:col-span-5 md:col-start-8 md:row-start-1"
      data-fo-contact-block
    >
      <Display as="h2" id="info-contact" size="xl">
        {label(t, "infoPages.contact.heading")}
      </Display>
      <Text as="p" size="md" className="m-0">
        {label(t, "infoPages.contact.body")}
      </Text>
      <p className="m-0 grid gap-[6px]">
        <a
          className="link font-bold"
          href={contact.telHref}
          data-fo-contact-phone
        >
          {contact.phoneDisplay}
        </a>
        {contact.whatsappHref === undefined ? null : (
          <a
            className="link"
            href={contact.whatsappHref}
            data-fo-contact-whatsapp
          >
            {label(t, "company.support.whatsapp")}
          </a>
        )}
        {contact.supportEmail === undefined ? null : (
          <a
            className="link"
            href={`mailto:${contact.supportEmail}`}
            data-fo-contact-email
          >
            {contact.supportEmail}
          </a>
        )}
      </p>
      <Text as="p" size="sm" tone="muted" className="m-0">
        {contact.privacyHref === undefined ? (
          label(t, "infoPages.contact.privacy")
        ) : (
          <a className="link" href={contact.privacyHref}>
            {label(t, "infoPages.contact.privacy")}
          </a>
        )}
      </Text>
    </section>
  );
}

function FaqList({
  view,
}: {
  readonly view: InfoPageView;
}): ReactElement | null {
  if (view.faq.length === 0) return null;
  const numbered = view.faq.map((item, index) => ({
    ...item,
    n: String(index + 1).padStart(2, "0"),
  }));
  const first = numbered.slice(0, 4);
  const rest = numbered.slice(4);
  const entry = (item: (typeof numbered)[number]): ReactElement => (
    <div
      key={item.q}
      className="grid break-inside-avoid gap-[6px] pb-[24px]"
      data-fo-faq-item
    >
      <span aria-hidden="true" className="text-ink-subtle font-display text-sm">
        {item.n}
      </span>
      <Display as="h2" size="lg">
        {item.q}
      </Display>
      <Text as="p" size="md" tone="muted" className="m-0">
        {item.a}
      </Text>
    </div>
  );
  return (
    <>
      <div
        className="md:col-span-6 md:col-start-1 md:row-start-1"
        data-fo-faq-first
      >
        {first.map(entry)}
      </div>
      <div
        className="md:col-span-12 md:columns-2 md:gap-x-[48px]"
        data-fo-faq-rest
      >
        {rest.map(entry)}
      </div>
    </>
  );
}

export function InfoPage({
  pageId,
  locale,
}: InfoPageProps): ReactElement | null {
  const t = useTranslations();
  const a11y = useTranslations("a11y");
  const view = infoPageView(pageId, locale, { nameOf: (key) => label(t, key) });
  if (view === undefined) return null;

  return (
    <Container as="main" id="main" data-fo-info-page={view.pageId}>
      <div className="pb-(--section-fluid)">
        <Breadcrumbs
          label={a11y("breadcrumb")}
          crumbs={view.breadcrumb.map((crumb) => ({
            key: crumb.labelKey,
            label:
              crumb.labelValue === undefined
                ? label(t, crumb.labelKey)
                : label(t, crumb.labelKey, { name: crumb.labelValue }),
            href: crumb.href,
            current: crumb.current,
          }))}
        />
        <header
          className="grid gap-[14px] pt-[28px] pb-[32px]"
          data-fo-info-head
        >
          <Display as="h1" size="display">
            {view.h1}
          </Display>
          {view.notYetOpen ? (
            <Eyebrow as="p" className="m-0">
              <span data-fo-not-yet-open>
                {label(t, "infoPages.status.notYetOpen")}
              </span>
            </Eyebrow>
          ) : null}
          {view.intro === undefined ? null : (
            <Text as="p" size="lg" className={`${PROSE} m-0`}>
              {view.intro}
            </Text>
          )}
        </header>
        {view.contact === undefined ? null : (
          <div
            className="grid gap-[32px] md:grid-cols-12 md:gap-x-[32px]"
            data-fo-help-grid
          >
            <ContactBlock t={t} view={view} />
            <FaqList view={view} />
          </div>
        )}
        {view.sections.map((section) => (
          <Section key={section.id} section={section} t={t} view={view} />
        ))}
        {view.links.length === 0 ? null : (
          <div className="border-rule border-t pt-[24px]" data-fo-info-links>
            <ul className="m-0 flex list-none flex-wrap gap-x-[24px] gap-y-[8px] p-0">
              {view.links.map((link) => (
                <li key={link.to}>
                  <a
                    className="link"
                    href={link.href}
                    data-fo-info-link={link.to}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Container>
  );
}
