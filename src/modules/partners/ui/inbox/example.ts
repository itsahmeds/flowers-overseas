/**
 * The walkthrough's example order (spec 011 §5.2 "Example fixture for the walkthrough", AC-3;
 * TASK-210).
 *
 * `exampleFloristOrderView(locale, stage)` builds a `FloristOrderView` from the catalogue dataset
 * and the shared sample recipient, typed by the same schema the inbox's read model returns, so the
 * walkthrough's four screens are the inbox's own components fed real-shaped data. No database, no
 * clock: the delivery date and answer-by instant are fixed values in `src/config/florists.ts`, so
 * the ISR page is the same for every visitor.
 *
 *  - The product, its tier and the add-on are catalogue rows (`FLORISTS.payoutExample`'s product
 *    and tier, the configured add-on), read through the catalogue's public API.
 *  - What the florist receives is the landing's payout example, the one authored figure (§13 Q7).
 *  - The recipient is the shared Polish sample (`FLORISTS.example.recipient`, equal to
 *    `src/config/checkout-samples.ts`'s row), plainly fictional, with its address formatted by
 *    `formatAddressBlock()` for Poland and its phone stored as E.164.
 *  - The card message and delivery note are the buyer's own words, so they read the same in every
 *    locale (`FLORISTS.example`).
 */
import { FLORISTS } from "@/config/florists";
import type { LocaleCode } from "@/config/locales";
import { getProduct, listAddons, listTiers } from "@/modules/catalog";
import { formatAddressBlock } from "@/modules/i18n";

import {
  type FloristOrderView,
  FloristOrderViewSchema,
  type FloristRecipient,
} from "../../inbox/view.ts";

/** The example's stable id: an id, never a name, in every URL the screens draw. */
export const EXAMPLE_ASSIGNMENT_ID = "6f1c2e0a-3b7d-4c55-9a1e-2d8f0b7c4e91";

/** The stages the walkthrough shows (§2 "The walkthrough"); the inbox renders every stage. */
export type ExampleStage = "offer" | "accepted";

/** `+48 22 000 00 00` → `+48220000000`: the sample is typed with spaces, the view stores E.164. */
function e164(phone: string): string {
  return phone.replaceAll(/[^\d+]/gu, "");
}

function exampleRecipient(): FloristRecipient {
  const { fullName, street, postcode, city, phone } =
    FLORISTS.example.recipient;
  return {
    fullName,
    phoneE164: e164(phone),
    addressLines: formatAddressBlock({ street, postcode, city }, "PL"),
    deliveryNote: FLORISTS.example.deliveryNote,
    cardMessage: FLORISTS.example.cardMessage,
  };
}

/**
 * The example order at one stage. `locale` is the page's: nothing in the view is translated (the
 * labels are message keys the components resolve), and it is taken so a later per-locale sample
 * needs no signature change.
 */
export async function exampleFloristOrderView(
  locale: LocaleCode,
  stage: ExampleStage = "offer",
): Promise<FloristOrderView> {
  void locale;
  const { productId, tier: tierKey, countryIso2 } = FLORISTS.payoutExample;
  const product = await getProduct(productId);
  if (product === null) {
    throw new Error(
      `the payout example's product \`${productId}\` is not in the catalogue`,
    );
  }
  const tier = (await listTiers(productId)).find(
    (candidate) => candidate.tierKey === tierKey,
  );
  if (tier === undefined) {
    throw new Error(`\`${productId}\` has no tier \`${tierKey}\``);
  }
  const addon = (await listAddons(countryIso2)).find(
    (candidate) => candidate.key === FLORISTS.example.addonKey,
  );
  if (addon === undefined) {
    throw new Error(
      `the add-on \`${FLORISTS.example.addonKey}\` is not offered in ${countryIso2}`,
    );
  }
  const sample = FLORISTS.example.recipient;
  const base = {
    assignmentId: EXAMPLE_ASSIGNMENT_ID,
    product: {
      sku: product.sku,
      name: product.name,
      tier: { labelKey: tier.labelKey, stems: tier.stems },
      addonNameKeys: [addon.nameKey],
    },
    delivery: {
      date: FLORISTS.example.deliveryDate,
      timeZone: FLORISTS.example.timeZone,
      countryIso2,
      town: sample.city,
      postcode: sample.postcode,
    },
    payout: {
      amountMinor: FLORISTS.payoutExample.payoutMinor,
      currency: FLORISTS.payoutExample.currency,
    },
  };
  return FloristOrderViewSchema.parse(
    stage === "offer"
      ? { stage, ...base, answerBy: FLORISTS.example.answerBy }
      : { stage, ...base, recipient: exampleRecipient() },
  );
}
