/**
 * @purpose The florist pages' shared frame: header, language links, menu
 * @spec 011
 *
 * What every florist page draws around its body (artboards `florist-sign-in-*`, `florist-inbox-*`;
 * TASK-212). Before sign-in: the header with the language links (`?hl=`, in the header from `md`,
 * under the card on a phone). Signed in: the header's menu with the language form (stored in
 * `partner_member.locale_code`, AC-32) and sign-out, and the demo line while the member's partner
 * is `demo`.
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
  const label = t("floristInbox.language");
  return (
    <>
      <FloristHeader
        homeHref={FLORIST_PATHS.base}
        homeLabel={t("floristInbox.homeLabel")}
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

/** The signed-in frame: header with the menu, the demo line, the body. */
export function SignedInFrame({
  t,
  context,
  back,
  children,
}: {
  readonly t: FloristTranslator;
  readonly context: FloristContext;
  /** The page itself, where the language form returns to. */
  readonly back: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <>
      <FloristHeader
        homeHref={FLORIST_PATHS.base}
        homeLabel={t("floristInbox.homeLabel")}
        brand={TRADING_NAME}
      >
        <FloristMenu label={t("floristInbox.menu")}>
          <FloristMenuHeading>{t("floristInbox.language")}</FloristMenuHeading>
          <FloristLanguageForm
            label={t("floristInbox.language")}
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
              {t("floristInbox.signOut")}
            </Button>
          </form>
        </FloristMenu>
      </FloristHeader>
      {isDemoMember(context) ? (
        <FloristDemoNotice>
          {t.rich("floristInbox.demoNotice", {
            b: (chunks) => <b>{chunks}</b>,
          })}
        </FloristDemoNotice>
      ) : null}
      {children}
    </>
  );
}
