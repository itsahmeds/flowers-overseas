"use client";
/**
 * The suggestions island's loader (spec 045 §14 A-founder-2026-11-08a item 3; TASK-520): a
 * `React.lazy` boundary, so `SearchSuggest` is its own chunk, fetched after the LCP paint (on
 * idle, first focus or first input) by `<AfterPaint island="search-suggest" on="paint">`
 * (`../deferred/deferredSet.ts`). Nothing else imports the island statically
 * (`tests/unit/deferred-set.test.tsx`).
 */
import { lazy } from "react";

import type { SearchSuggestProps } from "./SearchSuggest.tsx";

const Suggest = lazy(async () =>
  import("./SearchSuggest.tsx").then((module) => ({
    default: module.SearchSuggest,
  })),
);

export function SearchSuggestLoader(props: SearchSuggestProps) {
  return <Suggest {...props} />;
}
