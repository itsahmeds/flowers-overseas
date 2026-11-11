"use server";
/**
 * The unsubscribe page's one server action (spec 018 §14 A-founder-2026-10-22 C.7.4, C.13; AC-58;
 * TASK-353): the same effect as the one-click `POST`, then the done state, identical for a valid
 * and a forged, unknown or rotated `t`. No session needed (the link comes from an email). Thin glue.
 */
import { redirect } from "next/navigation";
import { z } from "zod";

import { unsubscribeReminders } from "@/modules/customers";

import {
  accountLocale,
  asSystemAccount,
  reminderUnsubscribePath,
} from "../../_parts/account-request";

const BoundSchema = z.string().max(512).catch("");

export async function stopRemindersAction(
  boundLocale: string,
  token: string,
): Promise<never> {
  const locale = accountLocale(BoundSchema.parse(boundLocale)) ?? "en";
  const t = BoundSchema.parse(token);
  if (t !== "") await unsubscribeReminders(asSystemAccount, t, new Date());
  redirect(`${reminderUnsubscribePath(locale)}?state=done`);
}
