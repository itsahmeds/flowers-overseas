import { floristFormRoute } from "@/modules/partners/ui/apply/route";

/**
 * `/{locale}/fuer-floristen/bewerben`: The application (spec 011 §2, AC-1, AC-10; TASK-210). A route file of its own,
 * not a branch of the shared depth files, so its keys never reach an indexable page's import
 * graph: `src/modules/partners/ui/apply/route.tsx` says why, and answers 404 for any locale whose
 * path this is not. ISR 3600, `noindex,follow`.
 */
const route = floristFormRoute("florist-apply", ["fuer-floristen", "bewerben"]);

export const revalidate = 3600;
export const generateStaticParams = route.generateStaticParams;
export const generateMetadata = route.generateMetadata;
export default route.Page;
