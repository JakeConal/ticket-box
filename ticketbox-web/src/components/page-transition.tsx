"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

type TransitionPhase = "idle" | "cover" | "reveal";

const COVER_DURATION_MS = 300;
const REVEAL_DURATION_MS = 420;

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [phase, setPhase] = useState<TransitionPhase>("idle");
  const phaseRef = useRef<TransitionPhase>("idle");
  const destinationRef = useRef<string | null>(null);
  const navigateTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);

  function updatePhase(nextPhase: TransitionPhase) {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }

  useEffect(() => {
    function interceptNavigation(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      const source = event.target;
      if (!(source instanceof Element)) {
        return;
      }

      const link = source.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target || link.hasAttribute("download") || link.hasAttribute("data-no-score-transition")) {
        return;
      }

      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) {
        return;
      }

      const nextUrl = new URL(href, window.location.href);
      const currentUrl = new URL(window.location.href);
      const nextDestination = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      const currentDestination = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;

      if (nextUrl.origin !== window.location.origin || nextDestination === currentDestination) {
        return;
      }

      event.preventDefault();
      if (phaseRef.current !== "idle") {
        return;
      }

      destinationRef.current = `${nextUrl.pathname}${nextUrl.search}`;
      updatePhase("cover");
      navigateTimerRef.current = window.setTimeout(() => {
        router.push(nextDestination);
      }, COVER_DURATION_MS);
    }

    document.addEventListener("click", interceptNavigation, true);
    return () => document.removeEventListener("click", interceptNavigation, true);
  }, [router]);

  useEffect(() => {
    if (!destinationRef.current || destinationRef.current !== pathname || phaseRef.current !== "cover") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      updatePhase("reveal");
      revealTimerRef.current = window.setTimeout(() => {
        destinationRef.current = null;
        updatePhase("idle");
      }, REVEAL_DURATION_MS);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (navigateTimerRef.current) {
        window.clearTimeout(navigateTimerRef.current);
      }
      if (revealTimerRef.current) {
        window.clearTimeout(revealTimerRef.current);
      }
    };
  }, []);

  return (
    <div>
      <BauhausSheetTransition phase={phase} />
      {children}
    </div>
  );
}

// Full-screen yellow sheet with primary shapes sweeps across on navigation.
function BauhausSheetTransition({ phase }: { phase: TransitionPhase }) {
  if (phase === "idle") {
    return null;
  }

  const animation = phase === "cover" ? "motion-safe:animate-bauhaus-cover" : "motion-safe:animate-bauhaus-reveal";

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden motion-reduce:hidden">
      <div className={`${animation} absolute -inset-y-[12%] -left-[12%] w-[124%] border-y-4 border-ink bg-bauhaus-yellow`}>
        <BauhausRibbon />
      </div>
    </div>
  );
}

function BauhausRibbon() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <span className="absolute left-[12%] top-[18%] h-24 w-24 rounded-full border-4 border-ink bg-bauhaus-red motion-safe:animate-bauhaus-shape-in [animation-delay:30ms] sm:h-36 sm:w-36" />
      <span className="absolute left-[42%] top-[40%] h-20 w-20 rotate-45 border-4 border-ink bg-bauhaus-blue motion-safe:animate-bauhaus-shape-in [animation-delay:90ms] sm:h-32 sm:w-32" />
      <span
        className="absolute left-[68%] top-[58%] h-24 w-24 bg-ink motion-safe:animate-bauhaus-shape-in [animation-delay:150ms] sm:h-32 sm:w-32"
        style={{ clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }}
      />
      <span className="absolute left-[86%] top-[16%] h-16 w-16 rounded-full border-4 border-ink bg-white motion-safe:animate-bauhaus-shape-in [animation-delay:210ms] sm:h-24 sm:w-24" />
    </div>
  );
}

