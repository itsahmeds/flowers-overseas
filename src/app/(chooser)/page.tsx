/**
 * `/` (spec 003 §5.3, §13 Q3; TASK-034).
 *
 * Static, no copy, no client JavaScript — spec 001's placeholder body, unchanged, so the `/`
 * visual baseline and the axe exception list are untouched by this task. TASK-035 replaces it with
 * the crawlable locale chooser (AC-7): one `<a>` per launch locale carrying `nativeName`, `lang`
 * and `hreflang`, built with `localePath()`.
 */
export default function ChooserPage() {
  return <main />;
}
