"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="motion-safe:animate-page-in motion-reduce:animate-none" key={pathname}>
      <MusicRouteTransition />
      {children}
    </div>
  );
}

function MusicRouteTransition() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 overflow-hidden motion-reduce:hidden">
      <div className="absolute -left-1/4 top-[44%] grid w-[150%] gap-3 text-neutral-950 motion-safe:animate-staff-sweep">
        {[0, 1, 2, 3, 4].map((line) => <span className="h-px w-full bg-current" key={line} />)}
      </div>
      <span className="absolute left-[14%] top-[48%] text-6xl font-black leading-none text-neutral-950 motion-safe:animate-note-sweep [animation-delay:40ms] sm:text-8xl">
        ♪
      </span>
      <span className="absolute left-[39%] top-[52%] text-5xl font-black leading-none text-neutral-950 motion-safe:animate-note-sweep [animation-delay:110ms] sm:text-7xl">
        ♫
      </span>
      <span className="absolute left-[66%] top-[45%] text-6xl font-black leading-none text-neutral-950 motion-safe:animate-note-sweep [animation-delay:180ms] sm:text-8xl">
        ♩
      </span>
    </div>
  );
}
