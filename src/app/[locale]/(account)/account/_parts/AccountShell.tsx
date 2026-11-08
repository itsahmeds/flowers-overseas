/**
 * The signed-in account's frame (`account-orders-*`, `account-order-detail-*` "Shell"; spec 018
 * §14 C.13; TASK-344): a 232 px side list beside the content from `lg`, the same list as a row of
 * chips under the header on a phone. Orders, then Sign out, a `POST` button that works with
 * JavaScript off. Your details, Saved recipients, Reminders and Privacy join with the tasks that
 * build their pages (TASK-352, TASK-353, TASK-345): a link to a page that does not answer is not
 * drawn (spec 004 §14 A20).
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

import type { LocaleCode } from "@/config/locales";
import { accountPath, BUYER_AUTH_PATHS } from "@/lib/auth/buyer";
import { PAGE_FRAME } from "@/modules/ui/primitives/layout";

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
  readonly current: "orders";
  readonly children: ReactNode;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "account" });
  const auth = await getTranslations({ locale, namespace: "auth" });
  return (
    <main className={`${PAGE_FRAME} pb-[56px]`} data-fo-account="" id="main">
      <div className="grid items-start gap-[20px] pt-[16px] lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-[48px] lg:pt-[36px]">
        <nav
          aria-label={auth("account.title")}
          className="max-lg:-mx-(--gutter-s) max-lg:overflow-x-auto max-lg:px-(--gutter-s)"
        >
          <ul className="m-0 flex list-none gap-[8px] p-0 lg:grid lg:gap-[4px]">
            <li>
              <a
                aria-current={current === "orders" ? "page" : undefined}
                className={`${ITEM} ${current === "orders" ? CURRENT : ""}`}
                href={accountPath(locale)}
              >
                {t("nav.orders")}
              </a>
            </li>
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
