/**
 * Where the typed words go in `search.suggest.all` (spec 045 §14 A-founder-2026-11-08a item 3):
 * the header formats the message around this mark on the server and the suggestions island puts
 * the words in its place. Its own file, so the server header never imports the island's module.
 */
export const SUGGEST_QUERY_MARK = "\u0000";
