import postgres from "postgres";
import type { Sql } from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
export const load = () => import("postgres");
export { postgres, drizzle };
export type { Sql };
