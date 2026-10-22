/**
 * Deep-frozen provider values (TASK-148), shared by the static providers (`./static`) and the
 * database providers (`./db`, TASK-070): both hand every caller the same value for as long as it
 * lives (a module constant, or one request's read), so neither may hand out a writable one.
 *
 * Not exported from the barrel: it is a provider concern, and callers never touch a provider.
 */

/**
 * A deep-frozen copy of an authored value: the array, every row, and every array or object inside
 * a row.
 *
 * A static read hands out the same module-level value on every call, which keeps a read free
 * (spec 005 §5.4), and a database read hands out one value for the rest of its request. Left writable, that sharing had two effects. One caller's `.length = 1` cut the
 * price table to one row for every later request in the process, and one caller's write to a row's
 * `retailMinor` silently repriced that row for every later buyer (TASK-148). `Object.freeze` is
 * shallow, so this walks the whole value: a frozen array of writable rows is the same defect with a
 * lid on it.
 *
 * The static providers copy **once, at module load**, rather than freezing the dataset's exports in
 * place. Those
 * arrays are `src/config/catalogue/*.data.ts`'s and are read directly by `scripts/` and `seed/`.
 * Freezing them from here would make their mutability depend on whether this module happened to be
 * imported first. After the copy, every call returns the same frozen reference, so a read costs
 * nothing per call.
 *
 * Only plain data is accepted. A `Date`, `Map` or class instance keeps its internal state writable
 * inside a frozen row, so one throws here at load rather than shipping a value that only looks
 * immutable.
 */
export function deepFrozenCopy<T>(value: T): T {
  return frozenCopyOf(value) as T;
}

function frozenCopyOf(value: unknown): unknown {
  if (typeof value === "function") {
    throw new TypeError(
      "a provider row holds a function; only plain data can be deep-frozen (TASK-148)",
    );
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item: unknown) => frozenCopyOf(item)));
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(
      "a provider row holds a non-plain object; a frozen `Date`, `Map` or class instance stays writable inside, so only plain data can be deep-frozen (TASK-148)",
    );
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, frozenCopyOf(nested)]),
    ),
  );
}
