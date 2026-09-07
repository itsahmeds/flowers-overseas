// Valid fixture: cross-module import through the public barrel (spec 001 AC-9).
import { x } from "@/modules/catalog";

export const y = x;
