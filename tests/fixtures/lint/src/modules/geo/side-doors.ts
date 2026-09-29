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
