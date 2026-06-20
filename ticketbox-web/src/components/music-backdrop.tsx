const STAFF_LINES = [0, 1, 2, 3, 4];

export function MusicBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden text-neutral-950">
      <Staff className="absolute -left-32 top-28 hidden w-[48rem] -rotate-12 opacity-[0.07] lg:block" />
      <Staff className="absolute -right-40 bottom-20 hidden w-[44rem] rotate-12 opacity-[0.06] lg:block" />
      <div className="absolute right-6 top-28 text-6xl font-black leading-none text-neutral-950/5 motion-safe:animate-pulse motion-reduce:animate-none sm:right-12 sm:text-8xl">
        ♪
      </div>
      <div className="absolute bottom-16 left-5 text-5xl font-black leading-none text-neutral-950/5 motion-safe:animate-pulse motion-reduce:animate-none sm:left-12 sm:text-7xl">
        ♫
      </div>
    </div>
  );
}

export function MusicMarks({ className }: { className: string }) {
  return (
    <div aria-hidden="true" className={`${className} motion-safe:animate-pulse motion-reduce:animate-none`}>
      <span>♪</span>
      <span>♩</span>
      <span>♫</span>
    </div>
  );
}

function Staff({ className }: { className: string }) {
  return (
    <div className={className}>
      <div className="grid gap-5">
        {STAFF_LINES.map((line) => <span className="h-px w-full bg-current" key={line} />)}
      </div>
      <div className="absolute left-1/4 top-4 text-8xl font-black leading-none motion-safe:animate-pulse motion-reduce:animate-none">♪</div>
      <div className="absolute right-1/4 top-16 text-7xl font-black leading-none motion-safe:animate-pulse motion-reduce:animate-none">♫</div>
    </div>
  );
}
