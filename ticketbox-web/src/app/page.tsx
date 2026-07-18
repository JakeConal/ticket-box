"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ConcertPage,
  ConcertSummary,
  Session,
  formatDate,
  getAvailability,
  getSession,
  listConcerts,
  logoutAudience
} from "../lib/audience-api";
import { ui } from "../components/ui";
import { MusicThumbnail } from "../components/music-thumbnail";

type AvailabilitySummary = Record<string, { remaining: number; soldOut: boolean }>;

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [page, setPage] = useState<ConcertPage | null>(null);
  const [pageNumber, setPageNumber] = useState(0);
  const [availability, setAvailability] = useState<Record<string, AvailabilitySummary>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [warmingUp, setWarmingUp] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void getSession()
      .then((nextSession) => setSession(nextSession))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setWarmingUp(false);
    setError("");
    setPage(null);
    loadConcertsWithRetry(pageNumber, () => {
      if (!ignore) {
        setWarmingUp(true);
      }
    })
      .then(async (nextPage) => {
        if (!nextPage || ignore) {
          return;
        }
        setPage(nextPage);
        const pairs = await Promise.all(
          nextPage.content.map(async (concert) => {
            const zones = await getAvailability(concert.id).catch(() => []);
            return [concert.id, summarizeAvailability(zones || [])] as const;
          })
        );
        if (!ignore) {
          setAvailability(Object.fromEntries(pairs));
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setError(caught instanceof Error ? caught.message : "Could not load concerts");
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
          setWarmingUp(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [pageNumber, reloadKey]);

  const concerts = page?.content || [];
  const canGoPrevious = pageNumber > 0;
  const canGoNext = page ? pageNumber + 1 < page.totalPages : false;

  async function signOut() {
    await logoutAudience();
    setSession(null);
  }

  return (
    <main className={ui.page}>
      <AudienceNav session={session} onLogout={signOut} />

      <section className="grid gap-8 border-b border-neutral-950 pb-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
        <div className="max-w-2xl">
          <p className={ui.eyebrow}>TicketBox</p>
          <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">Find the next big concert and move straight to checkout.</h1>
          <p className={`${ui.muted} mt-5 max-w-xl text-base`}>Browse live inventory, compare ticket zones, and keep your QR tickets ready for the gate.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a className={ui.primaryButton} href="#concerts">Browse concerts</a>
            <Link className={ui.ghostButton} href="/me/tickets">Open wallet</Link>
          </div>
        </div>
        <div className="relative mx-auto h-[21rem] w-full max-w-[22rem] sm:h-[25rem] lg:ml-auto lg:h-[23rem]" aria-label="Concert photo collage">
          <div className="absolute left-0 top-8 w-[58%] overflow-hidden border border-neutral-950 bg-neutral-100 shadow-[3px_3px_0_0_rgb(23_23_23)] -rotate-6">
            <img
              alt="Crowd at a live concert"
              className="h-full w-full object-cover grayscale contrast-125"
              decoding="async"
              fetchPriority="high"
              src="https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=80"
            />
          </div>
          <div className="absolute right-0 top-0 w-[47%] overflow-hidden border border-neutral-950 bg-neutral-100 shadow-[3px_3px_0_0_rgb(23_23_23)] rotate-6">
            <img
              alt="Musician performing on stage"
              className="h-full w-full object-cover grayscale contrast-125"
              decoding="async"
              loading="lazy"
              src="https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=80"
            />
          </div>
          <div className="absolute bottom-1 left-[21%] w-[57%] overflow-hidden border border-neutral-950 bg-neutral-100 shadow-[3px_3px_0_0_rgb(23_23_23)] rotate-3">
            <img
              alt="Stage lights above a concert audience"
              className="aspect-[4/3] h-full w-full object-cover grayscale contrast-125"
              decoding="async"
              loading="lazy"
              src="https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=700&q=80"
            />
          </div>
          <div className="absolute bottom-10 right-0 w-[35%] overflow-hidden border border-neutral-950 bg-neutral-100 shadow-[3px_3px_0_0_rgb(23_23_23)] -rotate-6">
            <img
              alt="Hands raised during a live music set"
              className="aspect-square h-full w-full object-cover grayscale contrast-125"
              decoding="async"
              loading="lazy"
              src="https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=500&q=80"
            />
          </div>
        </div>
      </section>

      {error ? (
        <div className={`${ui.alertError} mt-6 flex flex-wrap items-center justify-between gap-3`} role="alert">
          <span>{error}</span>
          <button className={`${ui.secondaryButton} ${ui.compactButton}`} type="button" onClick={() => setReloadKey((current) => current + 1)}>
            Try again
          </button>
        </div>
      ) : null}

      <div className="mt-12 flex flex-wrap items-end justify-between gap-4" id="concerts">
        <div>
          <p className={ui.eyebrow}>Upcoming</p>
          <h2 className="mt-2 text-2xl font-bold">Concerts on sale</h2>
        </div>
        <span className="border border-neutral-500 px-3 py-2 text-sm font-semibold text-neutral-700">
          {loading ? (warmingUp ? "Starting service..." : "Loading...") : error ? "Unavailable" : `${page?.totalElements ?? 0} events`}
        </span>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy={loading} aria-label="Concerts on sale">
        {loading ? (
          <p className={ui.emptyState} role="status">
            {warmingUp ? "The ticket service is starting. Concerts will appear automatically." : "Loading concerts..."}
          </p>
        ) : null}
        {concerts.map((concert) => (
          <ConcertCard
            availability={availability[concert.id] || {}}
            concert={concert}
            key={concert.id}
          />
        ))}
        {!loading && !error && concerts.length === 0 ? <p className={ui.emptyState}>No published concerts yet.</p> : null}
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-300 pt-5 text-sm text-neutral-600">
        <button className={ui.ghostButton} disabled={!canGoPrevious} type="button" onClick={() => setPageNumber((current) => current - 1)}>
          Previous
        </button>
        <span>Page {page ? page.page + 1 : 1} of {Math.max(1, page?.totalPages || 1)}</span>
        <button className={ui.ghostButton} disabled={!canGoNext} type="button" onClick={() => setPageNumber((current) => current + 1)}>
          Next
        </button>
      </div>
    </main>
  );
}

async function loadConcertsWithRetry(pageNumber: number, onRetry: () => void) {
  const retryDelays = [2500, 5000, 7500];
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      return await listConcerts(pageNumber);
    } catch (error) {
      lastError = error;
      if (attempt === retryDelays.length) {
        break;
      }
      onRetry();
      await delay(retryDelays[attempt]);
    }
  }

  throw lastError;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function AudienceNav({ session, onLogout }: { session: Session | null; onLogout: () => void }) {
  return (
    <nav className={ui.nav} aria-label="Audience navigation">
      <Link className={ui.brand} href="/">TicketBox</Link>
      <div className={ui.navActions}>
        <Link className={`${ui.ghostButton} ${ui.compactButton}`} href="/me/tickets">My tickets</Link>
        {session ? (
          <>
            <span className="hidden max-w-48 truncate text-sm text-neutral-600 sm:inline">{session.email}</span>
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

function ConcertCard({ concert, availability }: { concert: ConcertSummary; availability: AvailabilitySummary }) {
  const zones = useMemo(() => Object.entries(availability).slice(0, 5), [availability]);
  const remaining = useMemo(
    () => Object.values(availability).reduce((total, item) => total + item.remaining, 0),
    [availability]
  );

  return (
    <article className="group flex min-h-full flex-col border border-neutral-950 bg-white transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-[6px_6px_0_0_rgb(23_23_23)] focus-within:-translate-y-1 focus-within:shadow-[6px_6px_0_0_rgb(23_23_23)] motion-reduce:transform-none motion-reduce:transition-none">
      <div className="aspect-[16/8] border-b border-neutral-950 bg-neutral-100" aria-hidden="true">
        <MusicThumbnail seed={concert.id} />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className={ui.eyebrow}>{concert.eventCode}</p>
        <h2 className="mt-2 text-xl font-bold leading-snug">{concert.name}</h2>
        <div className="mt-5 grid gap-2">
          <p className={ui.muted}><strong className="font-semibold text-neutral-950">Date</strong> {formatDate(concert.eventDate)}</p>
          <p className={ui.muted}><strong className="font-semibold text-neutral-950">Venue</strong> {concert.venue}</p>
        </div>
        <div className="mt-5 flex items-baseline justify-between border-y border-neutral-300 py-3">
          <strong className="text-2xl font-black">{remaining || "-"}</strong>
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-600">tickets visible</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Zone availability">
          {zones.map(([zone, item]) => (
            <span className={item.soldOut ? "border border-neutral-300 px-2 py-1 text-xs text-neutral-400 line-through" : "border border-neutral-500 px-2 py-1 text-xs font-medium text-neutral-700"} key={zone}>
              {zone}: {item.soldOut ? "Sold out" : item.remaining}
            </span>
          ))}
          {zones.length === 0 ? <span className="border border-neutral-500 px-2 py-1 text-xs font-medium text-neutral-700">Availability loading</span> : null}
        </div>
      </div>
      <Link className={`${ui.primaryButton} m-5 mt-0`} href={`/concerts/${concert.id}`}>View tickets</Link>
    </article>
  );
}

function summarizeAvailability(items: Array<{ zone: string; remainingQuantity: number; soldOut: boolean }>) {
  return items.reduce<AvailabilitySummary>((summary, item) => {
    const current = summary[item.zone] || { remaining: 0, soldOut: true };
    summary[item.zone] = {
      remaining: current.remaining + item.remainingQuantity,
      soldOut: current.soldOut && item.soldOut
    };
    return summary;
  }, {});
}

