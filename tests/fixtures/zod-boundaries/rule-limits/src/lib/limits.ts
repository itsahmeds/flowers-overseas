import { z } from "zod";

const Body = z.object({ a: z.string() });

interface Store {
  save(value: unknown): Promise<void>;
}

// RED: the first argument of an arbitrary method is not a schema.
export async function methodArg(req: Request, db: Store): Promise<void> {
  await db.save(await req.json());
}

// RED: JSON.parse is a step on the way to a schema, not a schema.
export async function jsonOnly(req: Request): Promise<unknown> {
  const raw: unknown = JSON.parse(await req.text());
  return raw;
}

// RED: one const binding is allowed, not two.
export async function twoBindings(req: Request): Promise<unknown> {
  const a: unknown = await req.json();
  const b = a;
  return Body.parse(b);
}

// RED: `.arrayBuffer()` and `.blob()` are bodies too.
export async function buffer(req: Request): Promise<number> {
  const bytes = await req.arrayBuffer();
  return bytes.byteLength;
}

export async function blob(req: Request): Promise<number> {
  const file = await req.blob();
  return file.size;
}
