/**
 * The words of the invoice PDF (spec 018 §7 "Invoice language", "Invoice wording"; artboard
 * `invoice-pdf.dc.html`, "Copy"; TASK-342).
 *
 * Every label is printed in each of the document's label locales, Polish first, joined by " / "
 * (`Numer / Number`); a label that reads the same in two locales is printed once (`VAT`). The
 * label locales come from the snapshot (`labelLocales`, the profile's list with `{buyer}` already
 * resolved to the order's locale at issue), so a buyer in `pl` gets one language. Values (dates,
 * money, rates) are formatted once, in the **last** label locale: the buyer's.
 *
 * The words live in the `invoice` message namespace and nowhere else, so the relay-language scan
 * (`scripts/check-relay-language.ts`, AC-38) and the review ledger see them. A key that does not
 * resolve throws: a document never prints a key path (the email translator's rule).
 */
import { createTranslator } from "next-intl";

import { isLocaleCode, type LocaleCode } from "@/config/locales";
import { loadMessages } from "@/modules/i18n";

type Values = Readonly<Record<string, string | number>>;

/** One locale's translator over the `invoice` namespace. */
export type InvoiceTranslate = (key: string, values?: Values) => string;

/** Builds the translator of `locale`. Injectable so a test can add a test-only statement key. */
export type InvoiceTranslatorFactory = (locale: LocaleCode) => InvoiceTranslate;

/** The production factory: `messages/{locale}.json`'s `invoice` namespace, through next-intl. */
export const invoiceTranslator: InvoiceTranslatorFactory = (locale) => {
  const t = createTranslator({
    locale,
    messages: loadMessages(locale, ["invoice"]),
    onError: (error) => {
      throw error;
    },
  });
  return t as unknown as InvoiceTranslate;
};

/** What the renderer asks for: bilingual labels, one-locale values. */
export interface InvoiceWords {
  /** The locales the labels are printed in, Polish (or the profile's first) first. */
  readonly locales: readonly LocaleCode[];
  /** The locale values are formatted in: the buyer's. */
  readonly valueLocale: LocaleCode;
  /** `key` in every label locale, distinct texts joined by " / ". */
  label(key: string, values?: Values): string;
  /** `key` in the value locale only. */
  single(key: string, values?: Values): string;
}

/** The separator between the label locales' texts. */
export const LABEL_SEPARATOR = " / ";

/**
 * The words of a document labelled in `labelLocales`. Throws on a label locale the application
 * does not know (a corrupt snapshot), never prints in a guessed language.
 */
export function invoiceWords(
  labelLocales: readonly string[],
  factory: InvoiceTranslatorFactory = invoiceTranslator,
): InvoiceWords {
  const locales: LocaleCode[] = [];
  for (const code of labelLocales) {
    if (!isLocaleCode(code)) {
      throw new RangeError(`invoice label locale is not a known locale`);
    }
    if (!locales.includes(code)) locales.push(code);
  }
  const valueLocale = locales.at(-1);
  if (valueLocale === undefined) {
    throw new RangeError("an invoice has at least one label locale");
  }
  const translators = locales.map((code) => factory(code));
  const valueTranslator = factory(valueLocale);
  return {
    locales,
    valueLocale,
    label(key, values) {
      const texts: string[] = [];
      for (const translate of translators) {
        const text = translate(key, values);
        if (!texts.includes(text)) texts.push(text);
      }
      return texts.join(LABEL_SEPARATOR);
    },
    single: (key, values) => valueTranslator(key, values),
  };
}
