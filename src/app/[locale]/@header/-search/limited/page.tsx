/**
 * The "rate limited" search route's header (spec 045 §2.7; TASK-403): the results page's own,
 * because the proxy rewrites a refused search to `/{locale}/-search/limited` and Next fills the
 * slot from that path.
 *
 * @purpose The rate-limited search page's header (the search page's)
 * @spec 045
 */
export { default } from "../page";
