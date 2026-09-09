/**
 * The copy and the document attributes of the last-resort 500 page — the one i18n path that must
 * reach no zod (spec 004 §13 Q13, AC-25's precondition; TASK-046).
 *
 * `src/app/global-error.tsx` is a Client Component, because Next requires it to be one, and Next
 * attaches the root error boundary's client chunk to **every** document. Whatever that file can
 * import is therefore in the initial script set of `/` and of every locale home. Until this
 * module existed it imported `messages.ts` and `registry.ts`, which reach `schemas.ts` and
 * `src/config/locales.ts`, which reach zod: ~85 KB gzipped / ~70 KB Brotli of validator shipped
 * to every visitor of a page that never validates anything (measured on TASK-043, spec 003
 * §14 A12; the founder's answer is spec 004 §13 Q13 option (a)).
 *
 * So this module reads two constants and nothing else:
 *
 *  - the **x-default locale row** from `src/config/locales.data.ts` (plain typed constants, no
 *    imports at all), for `lang` and `dir`;
 *  - the **English catalogue** `messages/en.json` statically, for the four strings. `en` *is* the
 *    x-default locale and the source catalogue, so its own file is the whole fallback chain: what
 *    `loadMessages("en", ["meta", "errors"])` returns for these keys is byte-identical, and
 *    `tests/unit/error-document.test.ts` asserts that equality rather than trusting the sentence.
 *
 * The second reason for the shape, independent of bytes: the 500 document is reached because
 * something else already threw, so it must not depend on the machinery that just failed — no
 * provider, no registry indirection, no schema parse, no message-source seam. A locale change
 * still needs no edit here (the row is read from the data module), and a change that moves the
 * x-default locale fails the parity test instead of silently mislabelling the failure page.
 *
 * Not exported from `src/modules/i18n/index.ts`: the barrel's export list is pinned by AC-3 of
 * spec 003, and a Client Component that imported the barrel would pull the whole module — the
 * formatters, the collator, the alternates builder — back into every document's script set,
 * which is the growth vector TASK-035 closed and this module keeps closed.
 */
import {
  X_DEFAULT_LOCALE,
  type TextDirection,
} from "../../config/locales.data.ts";

import en from "../../../messages/en.json" with { type: "json" };

/** Everything `src/app/global-error.tsx` renders: two attributes and four strings. */
export interface ErrorDocument {
  /** `<html lang>`: the x-default locale's document language. */
  readonly lang: string;
  /** `<html dir>`: from the locale registry, never inferred from the strings. */
  readonly dir: TextDirection;
  readonly title: string;
  readonly heading: string;
  readonly body: string;
  readonly retry: string;
}

/**
 * The x-default 500 document. A function rather than a constant so the four reads happen at
 * render time and a future locale-aware variant is a signature change, not a rewrite.
 */
export function errorDocument(): ErrorDocument {
  return {
    lang: X_DEFAULT_LOCALE.bcp47,
    dir: X_DEFAULT_LOCALE.dir,
    title: en.meta.error.title,
    heading: en.errors.serverError.heading,
    body: en.errors.serverError.body,
    retry: en.errors.serverError.retry,
  };
}
