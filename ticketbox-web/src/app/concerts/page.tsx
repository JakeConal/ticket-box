"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ConcertPage,
  Session,
  getAvailability,
  getSession,
  listConcerts,
  logoutAudience
} from "../../lib/audience-api";
import { ui } from "../../components/ui";
import { BauhausLogo, Shape } from "../../components/bauhaus";
import { AvailabilitySummary, ConcertCard, summarizeAvailability } from "../../components/concert-card";

export default function ConcertsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [page, setPage] = useState<ConcertPage | null>(null);
  const [pageNumber, setPageNumber] = useState(0);
  const [availability, setAvailability] = useState<Record<string, AvailabilitySummary>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getSession()
      .then((nextSession) => setSession(nextSession))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError("");
    listConcerts(pageNumber)
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
  }, [pageNumber]);

  const concerts = page?.content || [];
  const canGoPrevious = pageNumber > 0;
  const canGoNext = page ? pageNumber + 1 < page.totalPages : false;

  async function signOut() {
    await logoutAudience();
    setSession(null);
  }

  return (
    <main className={ui.page}>
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
              <button className={`${ui.secondaryButton} ${ui.compactButton}`} type="button" onClick={() => void signOut()}>
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

      {/* Page header: title left, blue geometric color block right */}
      <section className="grid gap-8 border-b-4 border-ink pb-12 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-stretch">
        <div className="flex max-w-2xl flex-col justify-center py-2">
          <p className={ui.eyebrow}>Ticketbox / All events</p>
          <h1 className="mt-4 text-4xl font-black uppercase leading-[0.9] tracking-tighter sm:text-6xl">
            Every concert.<span className="text-bauhaus-blue"> One page.</span>
          </h1>
          <p className={`${ui.muted} mt-6 max-w-xl text-base sm:text-lg`}>
            Live inventory for every published show. Pick a concert to compare zones and buy tickets.
          </p>
        </div>
        <div className="relative min-h-[12rem] overflow-hidden border-4 border-ink bg-bauhaus-red shadow-[8px_8px_0px_0px_#121212]" aria-hidden="true">
          <div className="bauhaus-dots absolute inset-0 text-white/20" />
          <Shape className="absolute -right-8 -top-8 h-32 w-32 border-4 border-ink bg-bauhaus-yellow" color="yellow" kind="circle" />
          <Shape className="absolute bottom-8 left-8 h-20 w-20 rotate-45 border-4 border-ink bg-bauhaus-blue" color="blue" kind="square" />
          <span className="absolute bottom-4 right-4 text-xs font-bold uppercase tracking-widest text-white/80">
            {page?.totalElements ?? 0} events
          </span>
        </div>
      </section>

      {error ? <p className={`${ui.alertError} mt-8`} role="alert">{error}</p> : null}

      <div className="mt-12 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={ui.eyebrow}>Upcoming</p>
          <h2 className="mt-2 text-3xl font-black uppercase tracking-tighter sm:text-4xl">Concerts on sale</h2>
        </div>
        <span className="border-2 border-ink bg-white px-3 py-2 text-sm font-bold uppercase tracking-wider text-ink shadow-[3px_3px_0px_0px_#121212]">
          {page?.totalElements ?? 0} events
        </span>
      </div>

      <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-busy={loading} aria-label="All concerts">
        {concerts.map((concert, index) => (
          <ConcertCard
            availability={availability[concert.id] || {}}
            concert={concert}
            decorationIndex={index}
            key={concert.id}
          />
        ))}
        {!loading && concerts.length === 0 ? <p className={ui.emptyState}>No published concerts yet.</p> : null}
      </section>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t-4 border-ink pt-6 text-sm font-bold uppercase tracking-wider text-ink/70">
        <button className={ui.ghostButton} disabled={!canGoPrevious} type="button" onClick={() => setPageNumber((current) => current - 1)}>
          Previous
        </button>
        <span>Page {page ? page.page + 1 : 1} of {Math.max(1, page?.totalPages || 1)}</span>
        <button className={ui.ghostButton} disabled={!canGoNext} type="button" onClick={() => setPageNumber((current) => current + 1)}>
          Next
        </button>
      </div>

      <footer className="mt-16 border-t-4 border-ink bg-ink px-6 py-10 text-white sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <BauhausLogo />
            <span className="text-lg font-black uppercase tracking-tight">TicketBox</span>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold uppercase tracking-wider" aria-label="Footer">
            <Link className="text-white/80 transition-colors hover:text-bauhaus-yellow" href="/">Home</Link>
            <Link className="text-white/80 transition-colors hover:text-bauhaus-yellow" href="/me/tickets">Wallet</Link>
            <Link className="text-white/80 transition-colors hover:text-bauhaus-yellow" href="/login">Login</Link>
          </nav>
        </div>
        <p className="mt-8 text-xs font-medium uppercase tracking-widest text-white/50">Concert ticketing platform</p>
      </footer>
    </main>
  );
}
