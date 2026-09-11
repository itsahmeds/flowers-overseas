/**
 * The four error-document strings, per launch locale, as plain constants — the one copy source a
 * **client** graph is allowed to reach (spec 004 §14 A1 addendum, option (b); TASK-085).
 *
 * ## Why this file exists rather than a catalogue import
 *
 * Both 500 boundaries are Client Components, because Next requires an error boundary to be one:
 * `src/app/global-error.tsx` (attached to **every** document, `/` included) and
 * `src/app/[locale]/error.tsx`. Whatever they can import is compiled into a client chunk and
 * fetched by every visitor.
 *
 * Until this file existed, `error-document.ts` imported all of `messages/en.json` for four
 * strings. Turbopack tree-shakes a JSON import only below a size threshold, so the catalogue
 * crossed it and shipped **whole**: 15 304 B raw / 4 751 B Brotli of `home.*`, `catalog.*`,
 * `footer.*` and every other namespace, in the initial script set of `/` and of every locale
 * document, measured on this branch's parent (`0bjoc_w_ukgs0.js`). Worse than the bytes was the
 * cliff: each copy task paid 0 B or ~3.4 KB depending on which side of the threshold `en.json`
 * happened to land (recorded on TASK-052 and TASK-073). Four hand-written strings have no
 * threshold, and `tests/unit/error-document.test.ts` is what makes them the catalogue's strings
 * rather than a second, drifting copy: it resolves `ERROR_COPY_MESSAGE_KEYS` through the ordinary
 * validated path (`loadMessages()`, fallback chain and all) for **every launch locale** and
 * compares byte for byte. Edit `messages/*.json` without editing this file and that test names
 * both files.
 *
 * It is the same trade `src/config/locales.data.ts` makes for the locale rows, for the same
 * reason and with the same guard: a document reached because something else already threw must
 * not depend on the machinery that just failed — no provider, no message source, no schema parse.
 *
 * **No imports at all.** Not `locales.data.ts` either: the x-default fallback is the `en` entry
 * below, and the test asserts that `en` *is* the x-default locale's copy. Keeping the file
 * import-free is what makes "no page-level JSON reaches a client graph" checkable by walking
 * imports (`tests/unit/client-message-graph.test.ts`).
 *
 * **Adding a locale** adds four strings here. The parity test fails with this path in the message
 * until they are added, which is deliberate: the alternative is a new locale silently rendering
 * English 500 copy while every other document is translated.
 */

/** Everything the two 500 boundaries render: a `<title>` and three pieces of copy. */
export interface ErrorCopy {
  /** `meta.error.title` — the document `<title>`; `global-error.tsx` renders it as an element. */
  readonly title: string;
  readonly heading: string;
  readonly body: string;
  readonly retry: string;
  /**
   * `common.homeLink` — the label of the way out. TASK-055 added it: a failure page that only
   * offers "Try again" strands a visitor whose retry fails again (`docs/design/wireframes/
   * errors-desktop.dc.html` draws two actions, "Try again" and "Home").
   */
  readonly home: string;
}

/**
 * The catalogue key each field mirrors. Read by `tests/unit/error-document.test.ts` for the
 * parity assertion, and by `pnpm i18n:check`'s usage scan, which sees the dotted keys here and
 * therefore does not report them as unused now that no `t()` call reaches them.
 */
export const ERROR_COPY_MESSAGE_KEYS = {
  title: "meta.error.title",
  heading: "errors.serverError.heading",
  body: "errors.serverError.body",
  retry: "errors.serverError.retry",
  home: "common.homeLink",
} as const satisfies Readonly<Record<keyof ErrorCopy, string>>;

/**
 * The x-default locale's copy (`en`), and the answer for any locale with no entry: an unknown or
 * mis-cased segment, and the `en-XA`/`ar-XB` pseudo-locales, whose generated catalogues exist for
 * layout review rather than for the failure path.
 */
export const X_DEFAULT_ERROR_COPY: ErrorCopy = {
  title: "Something went wrong — Flowers Overseas",
  heading: "Something went wrong",
  body: "The page could not be loaded. Nothing you were doing was lost. We apologize for the interruption.",
  retry: "Try again",
  home: "Home",
};

/**
 * Per launch locale, in registry order. Values are the **resolved** ones — `en-gb` is `en`
 * overlaid with its own thin override, which is why its `body` says "apologise" — because the
 * fallback chain lives in `messages.ts` and nothing here may import it. `de` and `pl` carry the
 * echoed English drafts of `pnpm i18n:draft` exactly as their catalogues do, so a real German
 * translation lands in both places in one edit and the parity test proves it did.
 */
export const ERROR_COPY: Readonly<Record<string, ErrorCopy>> = {
  en: X_DEFAULT_ERROR_COPY,
  "en-gb": {
    title: "Something went wrong — Flowers Overseas",
    heading: "Something went wrong",
    body: "The page could not be loaded. Nothing you were doing was lost. We apologise for the interruption.",
    retry: "Try again",
    home: "Home",
  },
  de: {
    title: "Something went wrong — Flowers Overseas",
    heading: "Something went wrong",
    body: "The page could not be loaded. Nothing you were doing was lost. We apologize for the interruption.",
    retry: "Try again",
    home: "Home",
  },
  pl: {
    title: "Something went wrong — Flowers Overseas",
    heading: "Something went wrong",
    body: "The page could not be loaded. Nothing you were doing was lost. We apologize for the interruption.",
    retry: "Try again",
    home: "Home",
  },
};

/**
 * The copy for a locale code, falling back to the x-default entry rather than throwing: this is
 * the failure path, so an unknown segment must produce a readable document, never a second error.
 */
export function errorCopyFor(locale: string | undefined): ErrorCopy {
  return (
    (locale === undefined ? undefined : ERROR_COPY[locale]) ??
    X_DEFAULT_ERROR_COPY
  );
}
