/**
 * @purpose The florist pages' shared frame: header, language links, menu
 * @spec 011
 *
 * What every florist page draws around its body (artboards `florist-sign-in-*`, `florist-inbox-*`;
 * TASK-212). Before sign-in: the header with the language links (`?hl=`, in the header from `md`,
 * under the card on a phone). Signed in: the header's menu with the language form (stored in
 * `partner_member.locale_code`, AC-32) and sign-out, and the demo line while the member's partner
 * is `demo`. Signed in, the sections (the orders list and "My bouquets", spec 030b AC-56) sit in
 * the header from `md` and at the top of the menu on a phone.
 */
import type { ReactElement, ReactNode } from "react";

import { TRADING_NAME } from "@/config/company.data";
import {
  FLORIST_LANGUAGES,
  FLORIST_PATHS,
  type FloristLanguage,
} from "@/config/florists";
import { type FloristContext, isDemoMember } from "@/lib/auth/florist";
import { getLocaleRegistry } from "@/modules/i18n";
import type { FloristTranslator } from "@/modules/partners/auth/copy";
import { Button } from "@/modules/ui";
import {
  FloristDemoNotice,
  FloristHeader,
  FloristLanguageForm,
  FloristLanguageLinks,
  FloristMenu,
  FloristMenuHeading,
  FloristSectionNav,
} from "@/modules/ui/florist/FloristChrome";

/** The language's own name, from the locale registry ("Polski"). */
function nativeName(code: FloristLanguage): string {
  return getLocaleRegistry().get(code)?.nativeName ?? code;
}

/** The pre-sign-in language links: the same page, `?hl=` set, other query keys kept. */
export function languageLinks(
  current: FloristLanguage,
  hrefFor: (language: FloristLanguage) => string,
) {
  return FLORIST_LANGUAGES.map((code) => ({
    code,
    name: nativeName(code),
    href: hrefFor(code),
    current: code === current,
  }));
}

/** The signed-out frame: header with the language links, the body, the phone's language links. */
export function SignedOutFrame({
  t,
  language,
  hrefFor,
  children,
}: {
  readonly t: FloristTranslator;
  readonly language: FloristLanguage;
  readonly hrefFor: (language: FloristLanguage) => string;
  readonly children: ReactNode;
}): ReactElement {
  const options = languageLinks(language, hrefFor);
  const label = t("floristAuth.language");
  return (
    <>
      <FloristHeader
        homeHref={FLORIST_PATHS.base}
        homeLabel={t("floristAuth.homeLabel")}
        brand={TRADING_NAME}
      >
        <FloristLanguageLinks
          label={label}
          options={options}
          placement="header"
        />
      </FloristHeader>
      {children}
      <FloristLanguageLinks label={label} options={options} placement="below" />
    </>
  );
}

/** The florist's sections (spec 030b AC-56): the orders list and "My bouquets". */
export type FloristSection = "orders" | "bouquets";

function sectionLinks(
  t: FloristTranslator,
  section: FloristSection | undefined,
) {
  return [
    {
      href: FLORIST_PATHS.base,
      label: t("floristInbox.orders"),
      current: section === "orders",
    },
    {
      href: FLORIST_PATHS.bouquets,
      label: t("floristInbox.bouquets.title"),
      current: section === "bouquets",
    },
  ];
}

/** The signed-in frame: header with the sections and the menu, the demo line, the body. */
export function SignedInFrame({
  t,
  context,
  back,
  section,
  children,
}: {
  readonly t: FloristTranslator;
  readonly context: FloristContext;
  /** The page itself, where the language form returns to. */
  readonly back: string;
  /** The section this page is, marked current in the navigation; none on an order page. */
  readonly section?: FloristSection;
  readonly children: ReactNode;
}): ReactElement {
  const links = sectionLinks(t, section);
  const navLabel = t("floristInbox.bouquets.navLabel");
  return (
    <>
      <FloristHeader
        homeHref={FLORIST_PATHS.base}
        homeLabel={t("floristAuth.homeLabel")}
        brand={TRADING_NAME}
      >
        <FloristSectionNav label={navLabel} links={links} placement="header" />
        <FloristMenu label={t("floristAuth.menu")}>
          <FloristSectionNav label={navLabel} links={links} placement="menu" />
          <FloristMenuHeading>{t("floristAuth.language")}</FloristMenuHeading>
          <FloristLanguageForm
            label={t("floristAuth.language")}
            action={FLORIST_PATHS.language}
            back={back}
            options={FLORIST_LANGUAGES.map((code) => ({
              code,
              name: nativeName(code),
              current: code === context.locale,
            }))}
          />
          <form method="post" action={FLORIST_PATHS.signOut}>
            <Button type="submit" variant="secondary" size="sm">
              {t("floristAuth.signOut")}
            </Button>
          </form>
        </FloristMenu>
      </FloristHeader>
      {isDemoMember(context) ? (
        <FloristDemoNotice>
          {t.rich("floristAuth.demoNotice", {
            b: (chunks) => <b>{chunks}</b>,
          })}
        </FloristDemoNotice>
      ) : null}
      {children}
    </>
  );
}
