import { Shape } from "./bauhaus";

// Fixed full-viewport decoration: large low-opacity primary shapes, static per spec.
export function BauhausBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <Shape className="absolute -left-24 top-24 hidden h-72 w-72 opacity-10 lg:block" color="red" kind="circle" />
      <Shape className="absolute -right-20 bottom-24 hidden h-64 w-64 rotate-45 opacity-10 lg:block" color="blue" kind="square" />
      <Shape className="absolute left-1/3 -bottom-16 hidden h-56 w-56 opacity-10 lg:block" color="yellow" kind="triangle" />
      <Shape className="absolute right-1/4 top-16 hidden h-10 w-10 opacity-20 lg:block" color="ink" kind="circle" />
      <Shape className="absolute left-16 bottom-1/3 hidden h-8 w-8 rotate-45 opacity-20 lg:block" color="ink" kind="square" />
    </div>
  );
}
