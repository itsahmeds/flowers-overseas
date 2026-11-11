/**
 * @purpose POST actions of the product editor: details, sizes, text, photos, status, prices, removal from a country
 * @spec 012b
 *
 * Thin (`plan/01` §5): each action's first statement is `requirePermission(…)`, then the form is
 * read into the command's input, the command runs (`@/modules/admin`, spec 012b §2.5, §2.6;
 * TASK-297, TASK-298), and a redirect names the outcome. A refusal changes nothing; its reason and
 * the broken rule ids (never the typed text) travel in the query.
 */
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  type CatalogueActor,
  type CatalogueRefusal,
  type MediaActor,
  adminRequestId,
  attachPhoto,
  can,
  removeFromCountry,
  replaceDraftPrice,
  requirePermission,
  saveCopy,
  savePhotoAlt,
  saveProduct,
  saveTiers,
  setProductStatus,
  supersedePrice,
} from "@/modules/admin";

const BASE = "/admin/catalogue/products";

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const Count = z.coerce.number().int().min(0).max(999);
const SkuParam = z.string().regex(/^FO-(?:BQ|AR|PT|FN|GS)-\d{3}$/u);

function skuOf(form: FormData): string {
  const sku = SkuParam.safeParse(text(form, "sku"));
  return sku.success ? sku.data : "";
}

function refusalQuery(refusal: CatalogueRefusal): URLSearchParams {
  const params = new URLSearchParams({ result: refusal.reason });
  for (const item of refusal.violations)
    params.append("rule", `${item.rule}:${item.field}`);
  for (const condition of refusal.unmet ?? [])
    params.append("unmet", condition);
  return params;
}

async function actorOf(session: {
  readonly userId: string;
  readonly roles: readonly string[];
}): Promise<CatalogueActor> {
  return {
    userId: session.userId,
    requestId: await adminRequestId(),
    roles: session.roles,
  };
}

function supplierFrom(
  form: FormData,
  actor: CatalogueActor,
  payouts: { tierKey: string | null; payoutText: string }[],
): { partnerId: string; payouts: typeof payouts } | undefined {
  const partnerId = text(form, "supplierId");
  if (
    partnerId === "" ||
    !can(actor.roles, "catalogue.supplier") ||
    !can(actor.roles, "partner.payout")
  ) {
    return undefined;
  }
  return { partnerId, payouts };
}

/** `createProduct` / `updateProduct`. */
export async function saveProductAction(form: FormData): Promise<void> {
  const session = await requirePermission("catalogue.edit");
  const actor = await actorOf(session);
  const stems = text(form, "stemCount");
  const floristPrice = text(form, "floristPrice");
  const supplier = supplierFrom(
    form,
    actor,
    floristPrice === "" ? [] : [{ tierKey: null, payoutText: floristPrice }],
  );
  const productId = text(form, "productId");
  const input = {
    ...(productId === ""
      ? {}
      : { productId, updatedAt: text(form, "updatedAt") }),
    sku: text(form, "sku"),
    productType: text(form, "productType"),
    primaryFlower: text(form, "primaryFlower"),
    colourPrimary: text(form, "colourPrimary"),
    style: text(form, "style"),
    priceTier: text(form, "priceTier"),
    substitutionClass: text(form, "substitutionClass"),
    vaseIncluded: text(form, "vaseIncluded") === "yes",
    stemCount: stems === "" ? null : Count.catch(-1).parse(stems),
    freshnessDays: Count.catch(-1).parse(text(form, "freshnessDays")),
    partnerOnly: text(form, "partnerOnly") === "yes",
    ...(supplier === undefined ? {} : { supplier }),
  };
  const result = await saveProduct(actor, input);
  if (!result.ok) {
    const back = productId === "" ? `${BASE}/new` : `${BASE}/${skuOf(form)}`;
    redirect(`${back}?${refusalQuery(result).toString()}`);
  }
  redirect(`${BASE}/${result.value.sku}?tab=details&result=saved`);
}

/** `saveTier`: the rows of the sizes form, an empty key dropping a row. */
export async function saveTiersAction(form: FormData): Promise<void> {
  const session = await requirePermission("catalogue.edit");
  const actor = await actorOf(session);
  const sku = skuOf(form);
  const rows = Count.catch(0).parse(text(form, "rows"));
  const defaultRow = text(form, "default");
  const tiers: {
    tierKey: string;
    stems: number | null;
    sort: number;
    isDefault: boolean;
  }[] = [];
  const payouts: { tierKey: string | null; payoutText: string }[] = [];
  for (let index = 0; index < Math.min(rows, 8); index += 1) {
    const tierKey = text(form, `tierKey.${String(index)}`);
    if (tierKey === "") continue;
    const stems = text(form, `stems.${String(index)}`);
    tiers.push({
      tierKey,
      stems: stems === "" ? null : Count.catch(-1).parse(stems),
      sort: Count.catch(0).parse(text(form, `sort.${String(index)}`)),
      isDefault: defaultRow === String(index),
    });
    const payout = text(form, `payout.${String(index)}`);
    if (payout !== "") payouts.push({ tierKey, payoutText: payout });
  }
  const supplier = supplierFrom(form, actor, payouts);
  const result = await saveTiers(actor, {
    productId: text(form, "productId"),
    updatedAt: text(form, "updatedAt"),
    tiers,
    ...(supplier === undefined ? {} : { supplier }),
  });
  const query = result.ok
    ? new URLSearchParams({ result: "saved" })
    : refusalQuery(result);
  redirect(`${BASE}/${sku}?tab=sizes&${query.toString()}`);
}

/** `saveCopy`: one locale's text. */
export async function saveCopyAction(form: FormData): Promise<void> {
  const session = await requirePermission("catalogue.edit");
  const actor = await actorOf(session);
  const sku = skuOf(form);
  const locale = text(form, "locale");
  const reason = text(form, "overrideReason");
  const result = await saveCopy(actor, {
    productId: text(form, "productId"),
    updatedAt: text(form, "updatedAt"),
    locale,
    name: text(form, "name"),
    slug: text(form, "slug"),
    description: text(form, "description"),
    seoTitle: text(form, "seoTitle"),
    seoDescription: text(form, "seoDescription"),
    ...(reason === "" ? {} : { overrideReason: reason }),
  });
  const query = result.ok
    ? new URLSearchParams({ result: "saved" })
    : refusalQuery(result);
  query.set("locale", locale);
  redirect(`${BASE}/${sku}?tab=text&${query.toString()}`);
}

/** `setProductStatus`: Make active, Retire. */
export async function setStatusAction(form: FormData): Promise<void> {
  const session = await requirePermission("catalogue.edit");
  const actor = await actorOf(session);
  const sku = skuOf(form);
  const result = await setProductStatus(actor, {
    productId: text(form, "productId"),
    updatedAt: text(form, "updatedAt"),
    status: text(form, "status"),
  });
  const query = result.ok
    ? new URLSearchParams({ result: "saved" })
    : refusalQuery(result);
  redirect(`${BASE}/${sku}?tab=details&${query.toString()}`);
}

/** `supersedePrice`, or `replaceDraftPrice` for a product never made active. */
export async function confirmPriceAction(form: FormData): Promise<void> {
  const session = await requirePermission("price.edit");
  const actor = await actorOf(session);
  const sku = skuOf(form);
  const reason = text(form, "overrideReason");
  const input = {
    productId: text(form, "productId"),
    countryIso2: text(form, "country"),
    tierKey: text(form, "tier"),
    amountText: text(form, "amount"),
    ...(reason === "" ? {} : { overrideReason: reason }),
  };
  const result =
    text(form, "draft") === "yes"
      ? await replaceDraftPrice(actor, input)
      : await supersedePrice(actor, input);
  if (result.ok) redirect(`${BASE}/${sku}?tab=prices&result=saved`);
  const query = refusalQuery(result);
  query.set("country", input.countryIso2);
  query.set("tier", input.tierKey);
  query.set("amount", input.amountText);
  redirect(`${BASE}/${sku}?tab=prices&${query.toString()}`);
}

/** `removeFromCountry`. */
export async function removeFromCountryAction(form: FormData): Promise<void> {
  const session = await requirePermission("price.edit");
  const actor = await actorOf(session);
  const sku = skuOf(form);
  const result = await removeFromCountry(actor, {
    productId: text(form, "productId"),
    countryIso2: text(form, "country"),
  });
  const query = result.ok
    ? new URLSearchParams({ result: "saved" })
    : refusalQuery(result);
  redirect(`${BASE}/${sku}?tab=prices&${query.toString()}`);
}

/* Spec 012b §2.7 (TASK-299): the photos tab. */

const PHOTOS = "tab=photos";

async function mediaActorOf(session: {
  readonly userId: string;
  readonly roles: readonly string[];
}): Promise<MediaActor> {
  return {
    userId: session.userId,
    requestId: await adminRequestId(),
    roles: session.roles,
  };
}

/** `attachMedia`: a photo onto the product, as the main photo only when approved and none is. */
export async function attachPhotoAction(form: FormData): Promise<void> {
  const session = await requirePermission("catalogue.edit");
  const actor = await mediaActorOf(session);
  const sku = skuOf(form);
  const result = await attachPhoto(actor, {
    productId: text(form, "productId"),
    updatedAt: text(form, "updatedAt"),
    assetId: text(form, "assetId"),
    primary: text(form, "primary") === "yes",
  });
  const query = new URLSearchParams(
    result.ok
      ? { photoResult: "attached" }
      : { photoResult: "refused", photoReason: result.reason },
  );
  redirect(`${BASE}/${sku}?${PHOTOS}&${query.toString()}`);
}

/** `saveAlt`: one attached photo's alt text in one language; empty removes it. */
export async function savePhotoAltAction(form: FormData): Promise<void> {
  const session = await requirePermission("catalogue.edit");
  const actor = await mediaActorOf(session);
  const sku = skuOf(form);
  const result = await savePhotoAlt(actor, {
    productId: text(form, "productId"),
    updatedAt: text(form, "updatedAt"),
    productMediaId: text(form, "productMediaId"),
    locale: text(form, "locale"),
    alt: text(form, "alt"),
  });
  const query = new URLSearchParams(
    result.ok
      ? { photoResult: "altSaved" }
      : { photoResult: "refused", photoReason: result.reason },
  );
  redirect(`${BASE}/${sku}?${PHOTOS}&${query.toString()}`);
}
