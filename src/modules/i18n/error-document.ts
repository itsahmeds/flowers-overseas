/**
 * The copy and the document attributes of the last-resort 500 page — the one i18n path that must
 * reach neither zod nor a message catalogue (spec 004 §13 Q13, §14 A1 addendum, AC-25's
 * precondition; TASK-046, then TASK-085).
 *
 * `src/app/global-error.tsx` is a Client Component, because Next requires it to be one, and Next
 * attaches the root error boundary's client chunk to **every** document. Whatever that file can
 * import is therefore in the initial script set of `/` and of every locale home. Until this
 * module existed it imported `messages.ts` and `registry.ts`, which reach `schemas.ts` and
 * `src/config/locales.ts`, which reach zod: ~85 KB gzipped / ~70 KB Brotli of validator shipped
 * to every visitor of a page that never validates anything (measured on TASK-043, spec 003
 * §14 A12; the founder's answer is spec 004 §13 Q13 option (a)).
 *
 * So this module reads two data modules and nothing else:
 *
 *  - the **x-default locale row** from `src/config/locales.data.ts` (plain typed constants, no
 *    imports at all), for `lang` and `dir`;
 *  - the four strings from `error-copy.data.ts` (the same: plain constants, no imports).
 *
 * TASK-085 replaced the second half. It used to be a static `messages/en.json` import for four
 * strings, and that import was the second reason this file matters: Turbopack tree-shakes a JSON
 * import only below a size threshold, `en.json` crossed it at 12.5 KB, and the **whole catalogue**
 * — `home.*`, `catalog.*`, `media.*`, every namespace — shipped in the chunk Next attaches to
 * every document (4 751 B Brotli of `0bjoc_w_ukgs0.js`, measured on TASK-085's parent). Each copy
 * task paid 0 B or ~3.4 KB depending on which side of the threshold the file happened to land, so
 * the cliff was a standing tax on writing copy. `error-copy.data.ts` has no threshold, and
 * `tests/unit/error-document.test.ts` is what keeps its strings the catalogue's strings: it
 * resolves the same keys through `loadMessages()` for every launch locale and compares them.
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

import { type ErrorCopy, errorCopyFor } from "./error-copy.data.ts";

/** Everything `src/app/global-error.tsx` renders: two attributes and four strings. */
export interface ErrorDocument extends ErrorCopy {
  /** `<html lang>`: the x-default locale's document language. */
  readonly lang: string;
  /** `<html dir>`: from the locale registry, never inferred from the strings. */
  readonly dir: TextDirection;
}

/**
 * The x-default 500 document. A function rather than a constant so the four reads happen at
 * render time and a future locale-aware variant is a signature change, not a rewrite.
 */
export function errorDocument(): ErrorDocument {
  return {
    lang: X_DEFAULT_LOCALE.bcp47,
    dir: X_DEFAULT_LOCALE.dir,
    ...errorCopyFor(X_DEFAULT_LOCALE.code),
  };
}
