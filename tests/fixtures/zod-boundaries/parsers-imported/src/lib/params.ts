import { inner } from "./inner";

// RED as a PARSERS entry: the only `.parse` is behind an import.
export function request(raw: unknown): string {
  return inner(raw).page ?? "";
}
