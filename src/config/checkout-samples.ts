/**
 * Demo samples (spec 010; TASK-200).
 *
 * Spec 010 §2 "Compliance and honesty in the demo", §13 Q12, AC-33.
 *
 * A demo checkout on the live site collects personal data from strangers unless it gives them
 * something better to type. The "Use sample details" button (TASK-208) fills step 1 and step 2
 * with the destination's row below, labelled with `checkout.demo.sampleLabel` ("Sample"), so the
 * honest path is also the easiest one.
 *
 * Every row is **plainly fictional**: the street and postcode are the destination format's own
 * example from `src/config/address-formats.ts` (Q12: "for Poland: a Warsaw street from the address
 * format's example"), the names are each language's stock placeholder name, every email is at
 * `example.com` (reserved by RFC 2606, so it can never reach a person), and the phones are
 * drama-range numbers where the regulator publishes one (Ofcom's 020 7946 0xxx, the
 * Bundesnetzagentur's 030 23125 xxx), an all-zero subscriber part for Poland, and a repeated-digit
 * Vienna number for Austria, whose regulator publishes no fictional range and whose numbering plan
 * refuses an all-zero one (`/review 201` nit b). Every row parses
 * through the destination's own step schemas (`tests/unit/checkout-config.test.ts`).
 *
 * There is one row per destination with an **authored** address format: a destination with only
 * the generic format is `closed` (AC-8) and has no form to fill. The founder approves these rows
 * with the Appendix A copy batch (Q12); until then they ship as drafted here.
 *
 * Data only: no database, no flag, no copy (the names and addresses are sample *values*, the label
 * is a message key).
 */
import type { AddressField } from "./address-formats.ts";
import type { PlaceKind } from "./checkout.ts";

/** The message key that labels sample-filled data as sample data. */
export const SAMPLE_LABEL_KEY = "checkout.demo.sampleLabel";

/** One destination's sample recipient (step 1) and buyer (step 2). */
export interface CheckoutSample {
  readonly recipient: {
    /** The address fields of the destination's format, `fullName` and `phone` included. */
    readonly fields: Readonly<Partial<Record<AddressField, string>>>;
    readonly placeKind: PlaceKind;
    readonly deliveryNote: string;
  };
  readonly buyer: {
    readonly email: string;
    readonly buyerName: string;
    readonly buyerPhone: string;
    /** ISO 3166-1 alpha-2; never used in a price (EU 2018/302). */
    readonly residenceCountry: string;
  };
}

/** Keyed by the destination's ISO 3166-1 alpha-2 code. */
export const CHECKOUT_SAMPLES = {
  PL: {
    recipient: {
      fields: {
        fullName: "Anna Przykładowa",
        street: "ul. Marszałkowska 10/5",
        postcode: "00-001",
        city: "Warszawa",
        phone: "+48 22 000 00 00",
      },
      placeKind: "home",
      deliveryNote: "",
    },
    buyer: {
      email: "sample.buyer@example.com",
      buyerName: "Sam Sample",
      buyerPhone: "",
      residenceCountry: "GB",
    },
  },
  DE: {
    recipient: {
      fields: {
        fullName: "Erika Mustermann",
        street: "Kastanienallee",
        houseNumber: "12",
        postcode: "10115",
        city: "Berlin",
        phone: "+49 30 23125000",
      },
      placeKind: "home",
      deliveryNote: "",
    },
    buyer: {
      email: "sample.buyer@example.com",
      buyerName: "Sam Sample",
      buyerPhone: "",
      residenceCountry: "GB",
    },
  },
  AT: {
    recipient: {
      fields: {
        fullName: "Maria Musterfrau",
        street: "Mariahilfer Straße",
        houseNumber: "1",
        postcode: "1010",
        city: "Wien",
        phone: "+43 1 9999999",
      },
      placeKind: "home",
      deliveryNote: "",
    },
    buyer: {
      email: "sample.buyer@example.com",
      buyerName: "Sam Sample",
      buyerPhone: "",
      residenceCountry: "DE",
    },
  },
  GB: {
    recipient: {
      fields: {
        fullName: "Jane Sample",
        addressLine1: "10 Downing Street",
        city: "London",
        postcode: "SW1A 1AA",
        phone: "020 7946 0000",
      },
      placeKind: "home",
      deliveryNote: "",
    },
    buyer: {
      email: "sample.buyer@example.com",
      buyerName: "Sam Sample",
      buyerPhone: "",
      residenceCountry: "PL",
    },
  },
} as const satisfies Readonly<Record<string, CheckoutSample>>;

export type CheckoutSampleCountry = keyof typeof CHECKOUT_SAMPLES;

/** The sample for a destination, or `undefined` where the checkout has no form (generic format). */
export function checkoutSample(countryIso: string): CheckoutSample | undefined {
  return Object.hasOwn(CHECKOUT_SAMPLES, countryIso)
    ? CHECKOUT_SAMPLES[countryIso as CheckoutSampleCountry]
    : undefined;
}
