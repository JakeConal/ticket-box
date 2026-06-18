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

type AvailabilitySummary = Record<string, { remaining: number; soldOut: boolean }>;

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [page, setPage] = useState<ConcertPage | null>(null);
  const [pageNumber, setPageNumber] = useState(0);
  const [availability, setAvailability] = useState<Record<string, AvailabilitySummary>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getSession().then((nextSession) => setSession(nextSession));
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
    <main className="audience-shell">
      <AudienceNav session={session} onLogout={signOut} />

      <section className="audience-hero">
        <div>
          <p className="eyebrow">TicketBox</p>
          <h1>Find the next big concert and move straight to checkout.</h1>
        </div>
        <div className="hero-stat">
          <strong>{page?.totalElements ?? 0}</strong>
          <span>published concerts</span>
        </div>
      </section>

      {error ? <p className="toast error" role="alert">{error}</p> : null}

      <section className="concert-grid" aria-busy={loading}>
        {concerts.map((concert) => (
          <ConcertCard
            availability={availability[concert.id] || {}}
            concert={concert}
            key={concert.id}
          />
        ))}
        {!loading && concerts.length === 0 ? <p className="empty-state">No published concerts yet.</p> : null}
      </section>

      <div className="pager">
        <button className="ghost-button" disabled={!canGoPrevious} type="button" onClick={() => setPageNumber((current) => current - 1)}>
          Previous
        </button>
        <span>Page {page ? page.page + 1 : 1} of {Math.max(1, page?.totalPages || 1)}</span>
        <button className="ghost-button" disabled={!canGoNext} type="button" onClick={() => setPageNumber((current) => current + 1)}>
          Next
        </button>
      </div>
    </main>
  );
}

function AudienceNav({ session, onLogout }: { session: Session | null; onLogout: () => void }) {
  return (
    <nav className="audience-nav" aria-label="Audience navigation">
      <Link className="brand-link" href="/">TicketBox</Link>
      <div className="nav-actions">
        <Link className="ghost-button compact-button" href="/me/tickets">My tickets</Link>
        {session ? (
          <>
            <span className="session-email">{session.email}</span>
            <button className="secondary-button compact-button" type="button" onClick={onLogout}>
              Logout
            </button>
          </>
        ) : (
          <>
            <Link className="ghost-button compact-button" href="/login">Login</Link>
            <Link className="primary-button compact-button" href="/register">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}

function ConcertCard({ concert, availability }: { concert: ConcertSummary; availability: AvailabilitySummary }) {
  const zones = useMemo(() => Object.entries(availability).slice(0, 5), [availability]);

  return (
    <article className="concert-card">
      <div className="concert-thumbnail" aria-hidden="true">
        <span>{initials(concert.name)}</span>
      </div>
      <div className="concert-card-body">
        <p className="eyebrow">{concert.eventCode}</p>
        <h2>{concert.name}</h2>
        <p className="muted">{formatDate(concert.eventDate)}</p>
        <p className="muted">{concert.venue}</p>
        <div className="zone-badges" aria-label="Zone availability">
          {zones.map(([zone, item]) => (
            <span className={item.soldOut ? "zone-badge sold-out" : "zone-badge"} key={zone}>
              {zone}: {item.soldOut ? "Sold out" : item.remaining}
            </span>
          ))}
          {zones.length === 0 ? <span className="zone-badge">Availability loading</span> : null}
        </div>
      </div>
      <Link className="primary-button" href={`/concerts/${concert.id}`}>View concert</Link>
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
