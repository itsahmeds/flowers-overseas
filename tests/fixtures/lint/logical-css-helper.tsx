// Valid fixture: logical counterpart of `physical-css-helper.tsx` (spec 001 §5).
export function LogicalCssHelper({ active }) {
  return <div className={cn("ps-2", active && "border-e-2")} />;
}
