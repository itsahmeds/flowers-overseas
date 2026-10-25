/**
 * The web process's one search engine (spec 045 §2.9, §5.2, §11; TASK-401).
 *
 * Created on first use, never at import: importing the search module costs nothing until someone
 * searches, and `/api/health` reads the index's age and size without building it. The engine reads
 * the catalogue through `catalogSearchSource()`, is told about every `invalidate()` through
 * `onInvalidate` (the only listener `src/lib/cache.ts` has), logs `search.index_built` through the
 * process logger, and reads the wall clock. One web replica is assumed (spec 040, ADR-0018); more
 * than one serving search is a trigger of §2.9's switch rule, not something this handles.
 */
import { onInvalidate } from "@/lib/cache";
import { logger } from "@/lib/logger";

import {
  type MemoryEngine,
  type SearchIndexStats,
  memoryEngine,
} from "./engine";
import { catalogSearchSource } from "./source";

let engine: MemoryEngine | undefined;

/** The process's engine, created on the first call. */
export function searchEngine(): MemoryEngine {
  engine ??= memoryEngine({
    source: catalogSearchSource,
    subscribe: onInvalidate,
    log: logger,
    now: Date.now,
  });
  return engine;
}

/**
 * `/api/health`'s two numbers (§11): the index's age in seconds (`null` before the first search
 * builds it) and its document count. Never builds anything.
 */
export function searchIndexStats(): SearchIndexStats {
  return engine?.stats() ?? { ageSeconds: null, documents: 0, generation: 0 };
}
