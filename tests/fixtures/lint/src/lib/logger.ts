// T-60 (spec 001 AC-56): every way past the logger, one per line, at a `src/` mirror path.
import { stdout } from "node:process";
import { Console } from "node:console";
export function f(x: string): void {
  globalThis.console.log(x);
  window.console.log(x);
  const c = console;
  c.log(x);
  const { log } = console;
  log(x);
  process.stdout.write(x);
  process["stderr"].write(x);
  stdout.write(x);
  new Console(stdout).log(x);
}
// /break 117 hole 6: the same behind a TypeScript wrapper.
export function g(x: string): void {
  (globalThis as { console: Console }).console.log(x);
  (process as NodeJS.Process).stdout.write(x);
  process!.stdout.write(x);
  (<NodeJS.Process>process).stderr.write(x);
  (window satisfies Window)["console"].log(x);
}
