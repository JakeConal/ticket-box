"use client";

import Link from "next/link";
import Image from "next/image";
import { CSSProperties, useEffect, useState } from "react";
import {
  ConcertPage,
  Session,
  getAvailability,
  getSession,
  listConcerts,
  logoutAudience
} from "../lib/audience-api";
import { ui } from "../components/ui";
import { BauhausLogo, Shape } from "../components/bauhaus";
import { AvailabilitySummary, ConcertCard, summarizeAvailability } from "../components/concert-card";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [page, setPage] = useState<ConcertPage | null>(null);
  const [availability, setAvailability] = useState<Record<string, AvailabilitySummary>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [processPaused, setProcessPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    void getSession()
      .then((nextSession) => setSession(nextSession))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Auto-advance the process stage; pauses on keyboard focus and under reduced motion.
  useEffect(() => {
    if (processPaused || reducedMotion) {
      return;
    }
    const timer = setTimeout(() => setStep((current) => (current + 1) % PROCESS_STEPS.length), PROCESS_STEPS[step].duration);
    return () => clearTimeout(timer);
  }, [step, processPaused, reducedMotion]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError("");
    listConcerts(0)
      .then(async (nextPage) => {
        if (!nextPage || ignore) {
          return;
        }
        setPage(nextPage);
        const pairs = await Promise.all(
          nextPage.content.map(async (concert) => {
            const zones = await getAvailability(concert.id);
            return [concert.id, summarizeAvailability(zones || [])] as const;
          })
        );
        if (!ignore) {
          setAvailability(Object.fromEntries(pairs));
        }
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load concerts"))
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  const concerts = page?.content || [];

  async function signOut() {
    await logoutAudience();
    setSession(null);
  }

  return (
    <main className={ui.page}>
      <AudienceNav session={session} onLogout={signOut} />

      {/* Hero: copy left, concert photo composition right */}
      <section className="grid gap-8 border-b-4 border-ink pb-12 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-stretch">
        <div className="flex max-w-2xl flex-col justify-center py-2">
          <p className={ui.eyebrow}>Ticketbox / Live ticketing</p>
          <h1 className="mt-4 text-4xl font-black uppercase leading-[0.9] tracking-tighter sm:text-6xl lg:text-7xl">
            Find the next big concert.
            <span className="text-bauhaus-red"> Move straight to checkout.</span>
          </h1>
          <p className={`${ui.muted} mt-6 max-w-xl text-base sm:text-lg`}>
            Browse live inventory, compare ticket zones, and keep your QR tickets ready for the gate.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className={ui.primaryButton} href="/concerts">Browse concerts</Link>
            <Link className={ui.yellowButton} href="/me/tickets">Open wallet</Link>
          </div>
        </div>
        <div className="relative min-h-[20rem] overflow-hidden border-4 border-ink bg-white shadow-[8px_8px_0px_0px_#121212] sm:min-h-[24rem]">
          <div className="grid h-full min-h-full grid-rows-[3fr_2fr]">
            <figure className="group relative overflow-hidden border-b-4 border-ink">
              <Image
                alt="Crowd with raised hands in front of a lit concert stage"
                className="object-cover grayscale transition-all duration-300 ease-out group-hover:grayscale-0"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 24rem"
                src="https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=900&q=70"
              />
            </figure>
            <div className="grid grid-cols-2">
              <figure className="group relative overflow-hidden border-r-4 border-ink">
                <Image
                  alt="Festival audience watching the stage under blue lights"
                  className="object-cover grayscale transition-all duration-300 ease-out group-hover:grayscale-0"
                  fill
                  sizes="(max-width: 1024px) 50vw, 12rem"
                  src="https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=600&q=70"
                />
              </figure>
              <figure className="group relative overflow-hidden">
                <Image
                  alt="Singer performing under red stage lights"
                  className="object-cover grayscale transition-all duration-300 ease-out group-hover:grayscale-0"
                  fill
                  sizes="(max-width: 1024px) 50vw, 12rem"
                  src="https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=70"
                />
              </figure>
            </div>
          </div>
          <Shape className="absolute -right-6 -top-6 h-16 w-16 border-4 border-ink bg-bauhaus-yellow" color="yellow" kind="circle" />
          <span className="absolute bottom-4 left-4 border-2 border-ink bg-bauhaus-yellow px-2 py-1 text-xs font-bold uppercase tracking-widest text-ink shadow-[3px_3px_0px_0px_#121212]">Form follows function</span>
        </div>
      </section>

      {/* Typographic statement: poster-scale manifesto line */}
      <section className="relative border-b-4 border-ink py-12 sm:py-16 lg:py-20" aria-label="Ticketbox manifesto">
        <Shape className="absolute left-0 top-10 hidden h-14 w-14 rotate-45 border-4 border-ink bg-bauhaus-yellow lg:block" color="yellow" kind="square" />
        <p className="text-right text-4xl font-black uppercase leading-[0.9] tracking-tighter sm:text-6xl lg:text-8xl">
          Live music.
          <span className="text-bauhaus-red"> Live inventory.</span>
          <span className="text-bauhaus-blue"> Zero waiting.</span>
        </p>
        <p className="mt-6 text-right text-lg font-bold uppercase tracking-widest text-ink/70 sm:text-xl">
          {page?.totalElements ?? 0} shows on sale right now — QR ticket in hand, straight through the gate.
        </p>
      </section>

      {error ? <p className={`${ui.alertError} mt-8`} role="alert">{error}</p> : null}

      <div className="mt-14 flex flex-wrap items-end justify-between gap-4" id="concerts">
        <div>
          <p className={ui.eyebrow}>Upcoming</p>
          <h2 className="mt-2 text-3xl font-black uppercase tracking-tighter sm:text-4xl">Concerts on sale</h2>
        </div>
        <Link className={ui.yellowButton} href="/concerts">View all concerts</Link>
      </div>

      {/* Horizontal auto-scrolling row: pauses on hover/focus, becomes a static
          scrollable row under prefers-reduced-motion (see globals.css). */}
      <section className="marquee mt-8 -mx-4 overflow-hidden sm:-mx-6 lg:-mx-8" aria-busy={loading} aria-label="Featured concerts">
        {concerts.length > 0 ? (
          <div
            className="marquee-track flex w-max py-3"
            style={{ "--marquee-duration": `${Math.max(24, concerts.length * 6)}s` } as CSSProperties}
          >
            {[0, 1].map((copy) => (
              <div
                aria-hidden={copy === 1 || undefined}
                className="flex shrink-0 gap-6 pr-6"
                inert={copy === 1 || undefined}
                key={copy}
              >
                {concerts.map((concert, index) => (
                  <div className="w-80 shrink-0" key={concert.id}>
                    <ConcertCard
                      availability={availability[concert.id] || {}}
                      concert={concert}
                      decorationIndex={index}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}
        {!loading && concerts.length === 0 ? (
          <p className={`${ui.emptyState} mx-4 sm:mx-6 lg:mx-8`}>No published concerts yet.</p>
        ) : null}
      </section>

      {/* How it works: animated process stage acting out each step */}
      <section
        className="mt-16 border-t-4 border-ink pt-12"
        aria-label="How it works"
        onBlur={() => setProcessPaused(false)}
        onFocus={() => setProcessPaused(true)}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className={ui.eyebrow}>Process</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tighter sm:text-4xl">How it works</h2>
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-ink/60">
            {reducedMotion ? "Select a step to view" : processPaused ? "Paused" : "Playing"}
          </span>
        </div>
        {/* Steps stacked vertically on the left, animation stage on the right (stacked on mobile). */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4 lg:order-first">
            {PROCESS_STEPS.map((item, index) => (
              <button
                aria-pressed={index === step}
                className={`relative overflow-hidden border-4 border-ink p-4 text-left shadow-[4px_4px_0px_0px_#121212] transition-transform duration-200 ease-out hover:-translate-y-1 motion-reduce:transform-none ${index === step ? "bg-bauhaus-yellow" : "bg-white"}`}
                key={item.number}
                type="button"
                onClick={() => setStep(index)}
              >
                <span className="flex items-center gap-3">
                  <span className={`grid h-10 w-10 shrink-0 rotate-45 place-items-center border-2 border-ink ${item.badge}`}>
                    <span className="-rotate-45 text-sm font-black">{item.number}</span>
                  </span>
                  <span className="text-lg font-black uppercase tracking-tight">{item.title}</span>
                </span>
                <span className={`mt-2 block text-sm font-medium ${index === step ? "text-ink/80" : "text-ink/60"}`}>{item.body}</span>
                {index === step && !reducedMotion ? (
                  <span
                    className="ps-progress absolute bottom-0 left-0 h-1.5 bg-ink"
                    style={{ animationDuration: `${item.duration}ms`, animationPlayState: processPaused ? "paused" : "running" }}
                  />
                ) : null}
              </button>
            ))}
          </div>
          <div aria-hidden="true" className="process-scene relative h-64 overflow-hidden border-4 border-ink bg-white shadow-[8px_8px_0px_0px_#121212] sm:h-72 lg:h-auto lg:min-h-[28rem]">
            <div className="bauhaus-dots absolute inset-0 text-ink/10" />
            <div className="absolute inset-0" key={step}>
              {(() => {
                const ActiveScene = PROCESS_STEPS[step].Scene;
                return <ActiveScene />;
              })()}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA: yellow color block */}
      <section className="relative mt-16 overflow-hidden border-4 border-ink bg-bauhaus-yellow p-8 shadow-[8px_8px_0px_0px_#121212] sm:p-12" aria-label="Get started">
        <Shape className="absolute -left-12 -top-12 h-40 w-40 border-4 border-ink bg-bauhaus-red opacity-50" color="red" kind="circle" />
        <Shape className="absolute -bottom-14 -right-14 h-44 w-44 rotate-45 border-4 border-ink bg-bauhaus-blue opacity-50" color="blue" kind="square" />
        <div className="relative max-w-2xl">
          <h2 className="text-3xl font-black uppercase leading-[0.95] tracking-tighter sm:text-5xl">Your seat is waiting.</h2>
          <p className="mt-4 text-base font-medium text-ink/80 sm:text-lg">Create an account, pick a show, and walk in with a QR ticket.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            {session ? (
              <Link className={ui.primaryButton} href="/concerts">Browse concerts</Link>
            ) : (
              <Link className={ui.primaryButton} href="/register">Create account</Link>
            )}
            <Link className={ui.secondaryButton} href="/me/tickets">My tickets</Link>
          </div>
        </div>
      </section>

      <footer className="mt-16 border-t-4 border-ink bg-ink px-6 py-10 text-white sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <BauhausLogo />
            <span className="text-lg font-black uppercase tracking-tight">TicketBox</span>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold uppercase tracking-wider" aria-label="Footer">
            <Link className="text-white/80 transition-colors hover:text-bauhaus-yellow" href="/concerts">Concerts</Link>
            <Link className="text-white/80 transition-colors hover:text-bauhaus-yellow" href="/me/tickets">Wallet</Link>
            <Link className="text-white/80 transition-colors hover:text-bauhaus-yellow" href="/login">Login</Link>
            <Link className="text-white/80 transition-colors hover:text-bauhaus-yellow" href="/admin/login">Organizer</Link>
          </nav>
        </div>
        <p className="mt-8 text-xs font-medium uppercase tracking-widest text-white/50">Concert ticketing platform</p>
      </footer>
    </main>
  );
}

function AudienceNav({ session, onLogout }: { session: Session | null; onLogout: () => void }) {
  return (
    <nav className={ui.nav} aria-label="Audience navigation">
      <Link className={ui.brand} href="/">
        <BauhausLogo />
        TicketBox
      </Link>
      <div className={ui.navActions}>
        <Link className={`${ui.ghostButton} ${ui.compactButton}`} href="/me/tickets">My tickets</Link>
        {session ? (
          <>
            <span className="hidden max-w-48 truncate text-sm font-medium text-ink/70 sm:inline">{session.email}</span>
            <button className={`${ui.secondaryButton} ${ui.compactButton}`} type="button" onClick={onLogout}>
              Logout
            </button>
          </>
        ) : (
          <>
            <Link className={`${ui.ghostButton} ${ui.compactButton}`} href="/login">Login</Link>
            <Link className={`${ui.primaryButton} ${ui.compactButton}`} href="/register">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}

// Process stage scenes: each is a short mechanical vignette. Scenes remount on
// step change (key={step}), which restarts their CSS animations.

function SceneBrowse() {
  return (
    <div className="flex h-full items-center justify-center gap-4 px-4 sm:gap-6">
      {[0, 1, 2].map((index) => (
        <div
          className="ps-card w-24 border-4 border-ink bg-white shadow-[6px_6px_0px_0px_#121212] sm:w-32"
          key={index}
          style={{ animationDelay: `${index * 220}ms` }}
        >
          <div className="relative h-10 border-b-4 border-ink bg-canvas sm:h-14">
            <span className="absolute left-1.5 top-1.5 flex items-center gap-1">
              <span className="ps-blink h-2 w-2 rounded-full bg-bauhaus-red" />
              <span className="text-[8px] font-bold uppercase tracking-widest">Live</span>
            </span>
          </div>
          <div className="space-y-1.5 p-2">
            <span className="block h-1.5 w-3/4 bg-ink" />
            <span className="block h-1.5 w-1/2 bg-ink/40" />
            <span className="block h-1.5 w-2/3 bg-bauhaus-blue" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SceneZone() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 sm:gap-4">
      <div className="w-40 border-4 border-ink bg-ink py-1 text-center text-[10px] font-bold uppercase tracking-widest text-white sm:w-56">Stage</div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {["A", "B", "C"].map((zone, index) => (
          <div
            className={`grid h-14 w-14 place-items-center border-4 border-ink sm:h-16 sm:w-16 ${zone === "B" ? "ps-zone-selected bg-canvas" : "ps-zone-pulse bg-canvas"}`}
            key={zone}
            style={{ animationDelay: zone === "B" ? undefined : `${index * 500}ms` }}
          >
            <span className={`text-lg font-black ${zone === "B" ? "ps-zone-label" : ""}`}>{zone}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SceneQueue() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
      <p className="text-xs font-bold uppercase tracking-widest text-ink/70">Waiting room · position 12 → 1</p>
      <div className="w-full max-w-sm border-4 border-ink bg-white p-1 shadow-[4px_4px_0px_0px_#121212]">
        <div className="ps-fill h-5 border-r-4 border-ink bg-bauhaus-yellow" />
      </div>
      <div className="ps-stamp border-4 border-bauhaus-red px-4 py-1 text-2xl font-black uppercase tracking-tighter text-bauhaus-red">Paid</div>
    </div>
  );
}

function SceneGate() {
  return (
    <div className="relative h-full w-full">
      <p className="absolute left-1/2 top-5 -translate-x-1/2 text-xs font-bold uppercase tracking-widest text-ink/60">Gate 3 · Scan ticket</p>
      {/* Scanner frame: ticket slides in, red beam sweeps, then VALID pops */}
      <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 overflow-hidden border-4 border-ink bg-white shadow-[6px_6px_0px_0px_#121212]">
        {/* Centered via margins: the ps-ticket-in animation owns the translate
            property, so translate utilities would be overridden by its fill mode. */}
        <div className="ps-ticket-in absolute left-1/2 top-1/2 -ml-14 -mt-14 h-28 w-28 border-2 border-ink bg-white p-2">
          <div className="grid h-full w-full grid-cols-7 gap-px">
            {QR_MODULES.map((filled, index) => (
              <span className={filled ? "bg-ink" : "bg-transparent"} key={index} />
            ))}
          </div>
        </div>
        <div className="ps-scan-beam absolute inset-x-1 top-0 h-1 bg-bauhaus-red" />
      </div>
      <div className="ps-valid absolute left-[calc(50%+3.5rem)] top-[calc(50%-4.5rem)] border-4 border-ink bg-bauhaus-yellow px-3 py-1 text-lg font-black uppercase tracking-tight shadow-[3px_3px_0px_0px_#121212]">
        Valid
      </div>
      {/* Turnstile post + arm that swings open after the scan */}
      <div className="absolute right-[14%] top-1/2 h-16 w-3 -translate-y-1/2 border-2 border-ink bg-ink" />
      <div className="ps-gate-arm absolute right-[calc(14%+0.75rem)] top-1/2 h-2 w-20 origin-left border-2 border-ink bg-bauhaus-yellow" />
    </div>
  );
}

// 7x7 QR-style module pattern with finder squares in three corners.
const QR_MODULES = [
  "1110111",
  "1010101",
  "1110111",
  "0001010",
  "1110011",
  "1011010",
  "1110101"
].join("").split("").map((bit) => bit === "1");

const PROCESS_STEPS = [
  { number: "01", title: "Browse", body: "Live zone inventory, updated as tickets sell.", duration: 5000, badge: "bg-bauhaus-red text-white", Scene: SceneBrowse },
  { number: "02", title: "Pick a zone", body: "Compare zones and prices on the seat map.", duration: 5200, badge: "bg-bauhaus-blue text-white", Scene: SceneZone },
  { number: "03", title: "Queue & pay", body: "A waiting room keeps high-demand sales fair.", duration: 5200, badge: "bg-bauhaus-yellow text-ink", Scene: SceneQueue },
  { number: "04", title: "Enter", body: "QR tickets in your wallet, checked at the gate.", duration: 5600, badge: "bg-ink text-white", Scene: SceneGate }
];
