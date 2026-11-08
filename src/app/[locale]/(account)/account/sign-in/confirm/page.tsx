/**
 * @purpose The buyer sign-in link's page: one Continue button, uses nothing
 * @spec 018
 *
 * `/{locale}/account/sign-in/confirm?t=…` (spec 018 §5.3, §14 C.3, C.13; AC-24 link design,
 * AC-50; TASK-344), spec 011's design: the emailed link opens this, and a mail scanner's or a chat
 * app's preview fetches it and burns nothing. The token is spent only by the button's `POST` to
 * `/api/auth/buyer/confirm`, which lands on the stored return path or the account. A malformed `t`
 * shows the expired state with the form. `no-referrer` (`accountHeaderRules()`), so the token never
 * leaves in a `Referer`. With `account.open` off for the locale: 404.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";
import { z } from "zod";

import { BUYER_AUTH_PATHS } from "@/lib/auth/buyer";
import { ConfirmSignInSchema } from "@/lib/auth/schema";
import { buttonClass } from "@/modules/ui/checkout/styles";
import { PAGE_FRAME } from "@/modules/ui/primitives/layout";
import { transactionalMetadata } from "@/modules/seo";

import { accountLocale, accountOpen } from "../../_parts/account-request";
import { SignInView } from "../../_parts/SignInView";

export const dynamic = "force-dynamic";

interface ConfirmParams {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The link's `t` (the core's own rule); nothing else is read. */
const ConfirmQuerySchema = z.object({ t: ConfirmSignInSchema.shape.t });

export async function generateMetadata({
  params,
}: ConfirmParams): Promise<Metadata> {
  const locale = accountLocale((await params).locale);
  if (locale === null) return {};
  const t = await getTranslations({ locale, namespace: "auth" });
  return transactionalMetadata("trackOrder", t("account.title"));
}

export default async function AccountConfirmRoute({
  params,
  searchParams,
}: ConfirmParams): Promise<ReactElement> {
  const locale = accountLocale((await params).locale);
  if (locale === null) notFound();
  setRequestLocale(locale);
  if (!(await accountOpen(locale))) notFound();
  const parsed = ConfirmQuerySchema.safeParse(await searchParams);
  if (!parsed.success) {
    return <SignInView locale={locale} returnTo={undefined} state="expired" />;
  }
  const t = await getTranslations({ locale, namespace: "auth" });
  return (
    <main
      className={`${PAGE_FRAME} pt-[28px] pb-[64px] md:pt-[64px]`}
      data-fo-account="confirm"
      id="main"
    >
      <div className="bg-card mx-auto grid w-full max-w-[480px] gap-[16px] rounded-(--radius-letter) px-[20px] pt-[26px] pb-[28px] shadow-(--shadow-letter) md:px-[36px] md:pt-[34px] md:pb-[36px]">
        <h1 className="display text-3xl-fluid m-0 leading-[1.08]">
          {t("account.title")}
        </h1>
        <form action={BUYER_AUTH_PATHS.confirm} method="post">
          <input name="t" type="hidden" value={parsed.data.t} />
          <input name="locale" type="hidden" value={locale} />
          <button
            className={buttonClass("primary", "md", "w-full")}
            type="submit"
          >
            {t("account.confirmSubmit")}
          </button>
        </form>
      </div>
    </main>
  );
}
