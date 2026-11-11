/**
 * `account-recipients-*` (spec 018 §14 A-founder-2026-10-22 C.7.3, C.13, C.16; AC-55; TASK-352):
 * the account frame with Saved recipients current, the H1, then one white letter of ruled rows:
 * the name (in `<bdi>`), city and country, and a Remove submit whose accessible name names the
 * person. Remove asks once in a native `<dialog>` with focus on Keep (a `GET` of the page, so
 * focus returns to the list); the removed line says so once (`role="status"`); the empty state is
 * one sentence. Every word from the catalogues.
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { LocaleCode } from "@/config/locales";
import type { SavedRecipient } from "@/modules/customers";
import { formatRegionName } from "@/modules/i18n";
import { buttonClass } from "@/modules/ui/checkout/styles";

import { AccountShell } from "../_parts/AccountShell";
import { recipientsPath } from "../_parts/account-request";
import { removeRecipientAction } from "./actions";

const CARD =
  "bg-card grid rounded-(--radius-letter) px-[16px] py-[6px] shadow-(--shadow-letter) md:px-[30px] md:py-[10px]";
const REMOVE =
  "text-link min-h-(--target-min) min-w-(--target-min) cursor-pointer border-0 bg-transparent px-[4px] [font:inherit] text-ui underline decoration-[1.5px] underline-offset-[4px] focus-visible:outline-focus focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-solid";

export async function RecipientsView({
  locale,
  rows,
  removed,
  confirming,
}: {
  readonly locale: LocaleCode;
  readonly rows: readonly SavedRecipient[];
  readonly removed: boolean;
  readonly confirming: SavedRecipient | null;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "account" });
  const action = removeRecipientAction.bind(null, locale);
  return (
    <AccountShell current="recipients" locale={locale}>
      <div
        className="grid gap-[22px]"
        data-fo-account="recipients"
        inert={confirming !== null}
      >
        <h1 className="display text-2xl-fluid m-0 leading-[1.08] max-md:text-(length:--text-2xl-s)">
          {t("nav.recipients")}
        </h1>
        {removed ? (
          <p
            className="text-ink m-0 font-bold"
            data-fo-account-removed=""
            role="status"
          >
            {t("recipients.removed")}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-ink-2 m-0" data-fo-account-recipients-empty="">
            {t("recipients.empty")}
          </p>
        ) : (
          <ul className={`${CARD} m-0 list-none`}>
            {rows.map((row) => (
              <li
                className="border-rule grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[16px] gap-y-[4px] border-b border-solid py-[14px] last:border-b-0"
                data-fo-account-recipient-row=""
                key={row.id}
              >
                <p className="m-0 grid gap-[2px]">
                  <b className="text-ui">
                    <bdi>{row.fullName}</bdi>
                  </b>
                  <span className="text-ink-2 text-sm">
                    {t("recipients.place", {
                      city: row.city,
                      country: formatRegionName(row.countryIso2, locale),
                    })}
                  </span>
                </p>
                <form action={action} className="contents">
                  <input name="id" type="hidden" value={row.id} />
                  <button
                    aria-label={t("recipients.removeLabel", {
                      name: row.fullName,
                    })}
                    className={REMOVE}
                    name="step"
                    type="submit"
                    value="review"
                  >
                    {t("recipients.remove")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
      {confirming === null ? null : (
        <dialog
          aria-describedby="remove-recipient-body"
          aria-labelledby="remove-recipient-title"
          aria-modal="true"
          className="text-ink fixed inset-0 z-[60] m-0 grid h-full max-h-none w-full max-w-none place-items-center border-0 bg-(--color-scrim) p-0"
          data-fo-account-remove-dialog=""
          open
        >
          <div className="bg-card rounded-field grid w-[480px] max-w-[calc(100%-40px)] gap-[14px] px-[28px] py-[26px] shadow-(--shadow-md) max-md:px-[20px] max-md:py-[22px]">
            <h2
              className="display m-0 text-lg leading-[1.15]"
              id="remove-recipient-title"
            >
              {t("recipients.removeTitle", { name: confirming.fullName })}
            </h2>
            <p className="m-0" id="remove-recipient-body">
              {t("recipients.removeBody")}
            </p>
            <div className="flex flex-wrap gap-[10px]">
              <form action={action} className="contents">
                <input name="id" type="hidden" value={confirming.id} />
                <button
                  className={buttonClass("primary", "sm")}
                  name="step"
                  type="submit"
                  value="confirm"
                >
                  {t("recipients.remove")}
                </button>
              </form>
              <form
                action={recipientsPath(locale)}
                className="contents"
                method="get"
              >
                <button
                  autoFocus
                  className={buttonClass("ghost", "sm")}
                  type="submit"
                >
                  {t("recipients.keep")}
                </button>
              </form>
            </div>
          </div>
        </dialog>
      )}
    </AccountShell>
  );
}
