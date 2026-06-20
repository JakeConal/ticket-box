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
      <ScoreSheetTransition phase={phase} />
      {children}
    </div>
  );
}

function ScoreSheetTransition({ phase }: { phase: TransitionPhase }) {
  if (phase === "idle") {
    return null;
  }

  const animation = phase === "cover" ? "motion-safe:animate-score-sheet-cover" : "motion-safe:animate-score-sheet-reveal";

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden motion-reduce:hidden">
      <div className={`${animation} absolute -inset-y-[12%] -left-[12%] w-[124%] bg-neutral-50 shadow-[0_0_0_1px_rgb(23_23_23)]`}>
        <ScoreRibbon />
      </div>
    </div>
  );
}

function ScoreRibbon() {
  return (
    <div className="relative h-full w-full overflow-hidden text-neutral-950">
      <StaffRow className="top-[16%] -rotate-2" />
      <StaffRow className="top-[43%] rotate-1" />
      <StaffRow className="top-[70%] -rotate-1" />

      <span className="absolute left-[15%] top-[18%] text-7xl leading-none motion-safe:animate-score-note-flow [animation-delay:30ms] sm:text-9xl">♪</span>
      <span className="absolute left-[42%] top-[38%] text-8xl leading-none motion-safe:animate-score-note-flow [animation-delay:90ms] sm:text-[7rem]">♫</span>
      <span className="absolute left-[66%] top-[61%] text-7xl leading-none motion-safe:animate-score-note-flow [animation-delay:150ms] sm:text-9xl">♩</span>
      <span className="absolute left-[84%] top-[23%] text-6xl leading-none motion-safe:animate-score-note-flow [animation-delay:210ms] sm:text-8xl">♪</span>
    </div>
  );
}

function StaffRow({ className }: { className: string }) {
  return (
    <div className={`absolute -left-[8%] grid w-[116%] gap-3 motion-safe:animate-score-staff-flow ${className}`}>
      {[0, 1, 2, 3, 4].map((line) => <span className="h-px w-full bg-current" key={line} />)}
    </div>
  );
}
