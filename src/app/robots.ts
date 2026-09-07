/**
 * `robots.txt` (spec 001 §2, §6, AC-15, TASK-006).
 *
 * Disallow everything, in **every** environment: spec 001 ships nothing indexable and a
 * `*.vercel.app` production alias without a custom domain is still crawlable (§6
 * "Indexability"). Spec 007 lifts this for production only, by rule, once the indexable set
 * exists (ADR-0007). Static — no request, no `headers()`, no env read (§5.4).
 */
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
