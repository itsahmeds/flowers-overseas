// Invalid fixture: next-intl's locale-detecting middleware (spec 003 AC-10; ADR-0006). Both the
// import and the `createMiddleware(` call are violations — the locale comes from the URL, and a
// location hint is only ever a dismissible suggestion.
// next-intl is not a dependency: fixtures are lint input, never executed or typechecked
// (`tsconfig.json` excludes this directory).
import createMiddleware from "next-intl/middleware";

export default createMiddleware({ locales: ["en", "de"], defaultLocale: "en" });
