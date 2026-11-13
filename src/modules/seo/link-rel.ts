/**
 * @purpose The chooser links' `rel`, import-free so a client island can read it (TASK-522)
 * @spec 004
 *
 * The `rel` of every link to the country chooser (spec 004 §14 A-founder-2026-10-24a item 3, "SEO":
 * "every link to it carries `rel="nofollow"`"), spelled here, in the one module that may spell a
 * robots word (spec 009 AC-16's scan), and read by every chooser link (TASK-385). No import, so
 * `client.ts` can publish it to a client island without the module's server graph.
 */
export const CHOOSER_LINK_REL = "nofollow";
