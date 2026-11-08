/**
 * The account order detail's one server action: "Cancel for free" (spec 018 §14 C.7.1; AC-28
 * account half, AC-62; TASK-344). The order comes from the page's reference **read under the
 * buyer's `customer` context**, so another customer's order (or none) is a 404 and nothing is
 * written. The step is the pressed button's value; spec 013's `cancelOrder`, through
 * `cancelOrderAsBuyer`, is the only path to a status change (`orderService.transition`, ADR-0009).
 * Every answer is a 303 back to the detail (`?cancel=review` draws the dialog, `?cancel=refused` the
 * refusal), so both steps work with JavaScript off. Only the action is exported.
 */
"use server";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getBuyerContext, signInHref } from "@/lib/auth/buyer";
import { cancelOrderAsBuyer } from "@/modules/orders/buyer-cancel";
import { ownedOrderIds } from "@/modules/orders/account-orders";

import {
  accountLocale,
  accountOpen,
  asCustomer,
  listedModes,
  orderDetailPath,
} from "../../_parts/account-request";

const BoundSchema = z.string().max(32).catch("");
const PostedFormSchema = z.instanceof(FormData).nullable().catch(null);
const StepSchema = z.enum(["review", "confirm"]);

export async function cancelFromAccountAction(
  boundLocale: string,
  boundReference: string,
  form: FormData,
): Promise<never> {
  const locale = accountLocale(BoundSchema.parse(boundLocale));
  if (locale === null || !(await accountOpen(locale))) notFound();
  const reference = BoundSchema.parse(boundReference);
  const path = orderDetailPath(locale, reference);
  const context = await getBuyerContext();
  if (context === null) redirect(signInHref(locale, path));
  const step = StepSchema.safeParse(PostedFormSchema.parse(form)?.get("step"));
  if (!step.success) notFound();
  const [orderId] = await ownedOrderIds(
    asCustomer(context),
    listedModes(),
    reference,
  );
  if (orderId === undefined) notFound();
  const outcome = await cancelOrderAsBuyer({ orderId, step: step.data });
  switch (outcome.kind) {
    case "review":
      redirect(`${path}?cancel=review`);
    case "cancelled":
      redirect(path);
    case "refused":
      redirect(`${path}?cancel=refused`);
    case "not_found":
      notFound();
  }
}
