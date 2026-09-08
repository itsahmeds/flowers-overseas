/**
 * `fo/no-geo-redirect` (spec 001 §2, §5, §6, AC-8; ADR-0006; plan/03 §2; plan/07 §3).
 *
 * ADR-0006: no IP-based redirects, ever. Googlebot crawls mostly from US IPs, so a geo redirect
 * hides every non-default locale, and EU Regulation 2018/302 forbids redirecting EU customers by
 * location without consent. The only lawful use of a location hint is the dismissible suggestion
 * banner, whose hint reader lives in exactly one file (`src/modules/i18n/hints.ts`, spec 003).
 *
 * Flagged:
 *   1. Reads of a geo header — `headers.get("x-vercel-ip-country")`, `headers["cf-ipcountry"]`,
 *      `x-country` — and `request.geo` / `req.geo` member access, and `geolocation(…)`,
 *      anywhere except `src/modules/i18n/hints.ts`.
 *   2. `NextResponse.redirect(…)` and `redirect(…)` imported from `next/navigation`, in any
 *      request-interception file — Next's `middleware` and its Next 16 successor `proxy`
 *      (`src/proxy.ts`, `middleware.ts`, and the fixtures `*-proxy.ts` / `*-middleware.ts`) — and
 *      anywhere under `src/modules/i18n/`: the two places where a locale redirect would be written.
 *      Both names are matched so that TASK-032's rename could not silently disarm the gate
 *      (spec 001 §14 A2, spec 003 AC-11).
 *   3. `import … from "next-intl/middleware"` and `createMiddleware(…)`, in any file the rule runs
 *      on (spec 003 AC-10). next-intl's middleware resolves the locale by `Accept-Language` and
 *      cookie and then *redirects*, which is precisely what ADR-0006 forbids; locale is resolved
 *      from the URL (spec 003 §5) and suggested by a dismissible banner, never redirected.
 */

/** Request headers that carry a caller's country. */
export const GEO_HEADERS = new Set([
  "x-vercel-ip-country",
  "cf-ipcountry",
  "x-country",
]);

/** The single file allowed to read a location hint (spec 003's suggestion banner). */
export const HINTS_FILE = "src/modules/i18n/hints.ts";

/** Redirect helpers are additionally banned under this path (spec 001 §5). */
export const I18N_MODULE_PATH = "src/modules/i18n/";

/**
 * Basenames of a request-interception file. The test is on the basename only, so it is
 * directory-agnostic: `middleware.*` and `proxy.*` match in any directory, as do names that
 * end in one of them after a `.` or `-` (`x.proxy.ts`, `geo-redirect-proxy.ts`). Names that
 * merely contain the word do not match (`proxy-utils.ts`, `middlewares.ts`).
 */
const INTERCEPTOR_BASENAME = /(^|[.-])(middleware|proxy)\.[cm]?[jt]sx?$/;

/** The next-intl entry point whose whole purpose is locale detection plus redirect. */
export const NEXT_INTL_MIDDLEWARE = "next-intl/middleware";

/**
 * @param {string} filename
 * @returns {string} posix-normalised path
 */
function posix(filename) {
  return filename.split("\\").join("/");
}

/**
 * @param {string} filename
 * @returns {boolean}
 */
export function isHintsFile(filename) {
  return posix(filename).endsWith(HINTS_FILE);
}

/**
 * A request-interception file — `middleware.*` or `proxy.*` (where an intercepting redirect would
 * live) — or any file in the i18n module.
 * @param {string} filename
 * @returns {boolean}
 */
export function isRedirectBannedFile(filename) {
  const path = posix(filename);
  const basename = path.slice(path.lastIndexOf("/") + 1);
  return INTERCEPTOR_BASENAME.test(basename) || path.includes(I18N_MODULE_PATH);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isGeoHeaderName(value) {
  return typeof value === "string" && GEO_HEADERS.has(value.toLowerCase());
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow IP/geo location reads outside the i18n hints module and redirects in middleware (ADR-0006)",
    },
    schema: [],
    messages: {
      header:
        "Geo header read `{{ name }}`. No IP-based routing (ADR-0006): read location hints only in `src/modules/i18n/hints.ts` and show the dismissible suggestion banner.",
      geo: "`{{ name }}.geo` is an IP-derived location. No IP-based routing (ADR-0006): read location hints only in `src/modules/i18n/hints.ts`.",
      geolocation:
        "`geolocation()` is an IP-derived location. No IP-based routing (ADR-0006): read location hints only in `src/modules/i18n/hints.ts`.",
      redirect:
        "Redirect in a proxy/middleware or i18n file. No IP-based or locale redirects (ADR-0006): every locale stays a crawlable URL; suggest, never redirect.",
      nextIntlMiddleware:
        "`next-intl/middleware` detects the locale from headers and cookies and then redirects. Banned (ADR-0006, spec 003 §5): the locale is resolved from the URL, never by redirect.",
      createMiddleware:
        "`createMiddleware()` builds a locale-detecting redirect. Banned (ADR-0006, spec 003 §5): the locale is resolved from the URL, never by redirect.",
    },
  },
  create(context) {
    const hintsFile = isHintsFile(context.filename);
    const redirectBanned = isRedirectBannedFile(context.filename);

    /** Local names bound to `redirect` from `next/navigation`. @type {Set<string>} */
    const navigationRedirects = new Set();

    /**
     * @param {any} node
     * @returns {boolean}
     */
    function isNextResponseRedirect(node) {
      const callee = node.callee;
      if (
        callee.type === "MemberExpression" &&
        !callee.computed &&
        callee.property.type === "Identifier" &&
        callee.property.name === "redirect" &&
        callee.object.type === "Identifier" &&
        callee.object.name === "NextResponse"
      ) {
        return true;
      }
      return (
        callee.type === "Identifier" && navigationRedirects.has(callee.name)
      );
    }

    return {
      ImportDeclaration(/** @type {any} */ node) {
        if (node.source.value === NEXT_INTL_MIDDLEWARE) {
          context.report({ node, messageId: "nextIntlMiddleware" });
          return;
        }
        if (node.source.value !== "next/navigation") return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            specifier.imported.type === "Identifier" &&
            specifier.imported.name === "redirect"
          ) {
            navigationRedirects.add(specifier.local.name);
          }
        }
      },
      MemberExpression(/** @type {any} */ node) {
        // `headers["x-vercel-ip-country"]`
        if (node.computed && node.property.type === "Literal") {
          if (!hintsFile && isGeoHeaderName(node.property.value)) {
            context.report({
              node,
              messageId: "header",
              data: { name: String(node.property.value) },
            });
          }
          return;
        }
        // `request.geo`, `req.geo?.country`
        if (
          !node.computed &&
          node.property.type === "Identifier" &&
          node.property.name === "geo" &&
          node.object.type === "Identifier" &&
          (node.object.name === "request" || node.object.name === "req")
        ) {
          if (hintsFile) return;
          context.report({
            node,
            messageId: "geo",
            data: { name: node.object.name },
          });
        }
      },
      CallExpression(/** @type {any} */ node) {
        const callee = node.callee;
        // `headers.get("cf-ipcountry")`
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier" &&
          callee.property.name === "get"
        ) {
          const [first] = node.arguments;
          if (
            !hintsFile &&
            first !== undefined &&
            first.type === "Literal" &&
            isGeoHeaderName(first.value)
          ) {
            context.report({
              node,
              messageId: "header",
              data: { name: String(first.value) },
            });
            return;
          }
        }
        // `createMiddleware(routing)` (next-intl), however it was imported
        if (
          callee.type === "Identifier" &&
          callee.name === "createMiddleware"
        ) {
          context.report({ node, messageId: "createMiddleware" });
          return;
        }
        // `geolocation(request)` (@vercel/functions)
        if (
          !hintsFile &&
          callee.type === "Identifier" &&
          callee.name === "geolocation"
        ) {
          context.report({ node, messageId: "geolocation" });
          return;
        }
        if (redirectBanned && isNextResponseRedirect(node)) {
          context.report({ node, messageId: "redirect" });
        }
      },
    };
  },
};

export default rule;
