// RED as a PARSERS entry: its only `.parse` is JSON.parse, which checks no shape.
export function request(raw: string): unknown {
  return JSON.parse(raw);
}
