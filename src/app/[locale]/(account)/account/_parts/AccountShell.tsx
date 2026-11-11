/**
 * The signed-in account's frame (`account-orders-*`, `account-order-detail-*` "Shell"; spec 018
 * §14 C.13; TASK-344): a 232 px side list beside the content from `lg`, the same list as a row of
 * chips under the header on a phone. Orders, Your details, Saved recipients while
 * `account.recipients` is on (TASK-352), Reminders while `account.reminders` is on (TASK-353), then
 * Sign out, a `POST` button that works with JavaScript off. Privacy joins with the task that builds
 * its page (TASK-345): a link to a page that does not answer is not drawn (spec 004 §14 A20).
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

import type { LocaleCode } from "@/config/locales";
import { accountPath, BUYER_AUTH_PATHS } from "@/lib/auth/buyer";
import { PAGE_FRAME } from "@/modules/ui/primitives/layout";

import {
  detailsPath,
  recipientsOpen,
  recipientsPath,
  remindersOpen,
  remindersPath,
} from "./account-request";

/** The account's pages, in the side list's order. */
export type AccountPage = "orders" | "details" | "recipients" | "reminders";

const NAV_KEY = {
  orders: "nav.orders",
  details: "nav.details",
  recipients: "nav.recipients",
  reminders: "nav.reminders",
} as const satisfies Record<AccountPage, string>;

const ITEM = [
  "text-ink inline-flex min-h-(--target-min) items-center rounded-full px-[14px] text-ui no-underline",
  "lg:w-full lg:rounded-field lg:px-[14px]",
  "focus-visible:outline-focus focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-solid",
].join(" ");
const CURRENT = "bg-sage-wash font-bold";
const BUTTON = `${ITEM} cursor-pointer border-0 bg-transparent [font:inherit] text-start text-link underline underline-offset-[4px]`;

export async function AccountShell({
  locale,
  current,
  children,
}: {
  readonly locale: LocaleCode;
  readonly current: AccountPage;
  readonly children: ReactNode;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "account" });
  const auth = await getTranslations({ locale, namespace: "auth" });
  const links: { page: AccountPage; href: string }[] = [
    { page: "orders", href: accountPath(locale) },
    { page: "details", href: detailsPath(locale) },
    ...((await recipientsOpen())
      ? [{ page: "recipients" as const, href: recipientsPath(locale) }]
      : []),
    ...((await remindersOpen())
      ? [{ page: "reminders" as const, href: remindersPath(locale) }]
      : []),
  ];
  return (
    <main className={`${PAGE_FRAME} pb-[56px]`} data-fo-account="" id="main">
      <div className="grid items-start gap-[20px] pt-[16px] lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-[48px] lg:pt-[36px]">
        <nav
          aria-label={auth("account.title")}
          className="max-lg:-mx-(--gutter-s) max-lg:overflow-x-auto max-lg:px-(--gutter-s)"
        >
          <ul className="m-0 flex list-none gap-[8px] p-0 lg:grid lg:gap-[4px]">
            {links.map((link) => (
              <li key={link.page}>
                <a
                  aria-current={current === link.page ? "page" : undefined}
                  className={`${ITEM} ${current === link.page ? CURRENT : ""}`}
                  href={link.href}
                >
                  {t(NAV_KEY[link.page])}
                </a>
              </li>
            ))}
            <li>
              <form action={BUYER_AUTH_PATHS.signOut} method="post">
                <input name="locale" type="hidden" value={locale} />
                <button className={BUTTON} type="submit">
                  {t("nav.signOut")}
                </button>
              </form>
            </li>
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
