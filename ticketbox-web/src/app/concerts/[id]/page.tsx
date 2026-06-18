"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ConcertDetail,
  Session,
  TicketAvailability,
  TicketType,
  addOrderToHistory,
  enterQueue,
  formatDate,
  formatMoney,
  getAvailability,
  getConcert,
  getQueueStatus,
  getSession,
  purchaseTickets
} from "../../../lib/audience-api";

export default function ConcertDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const concertId = params.id;
  const [session, setSession] = useState<Session | null>(null);
  const [concert, setConcert] = useState<ConcertDetail | null>(null);
  const [availability, setAvailability] = useState<TicketAvailability[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [paymentProvider, setPaymentProvider] = useState<"VNPAY" | "MOMO">("VNPAY");
  const [error, setError] = useState("");
  const [queueStatus, setQueueStatus] = useState<Awaited<ReturnType<typeof getQueueStatus>> | null>(null);
  const [pendingPurchase, setPendingPurchase] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getSession().then((nextSession) => setSession(nextSession));
  }, []);

  useEffect(() => {
    let ignore = false;
    Promise.all([getConcert(concertId), getAvailability(concertId)])
      .then(([nextConcert, nextAvailability]) => {
        if (ignore || !nextConcert) {
          return;
        }
        setConcert(nextConcert);
        setAvailability(nextAvailability || []);
        setSelectedTicketId((current) => current || nextConcert.ticketTypes[0]?.id || "");
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load concert"));
    return () => {
      ignore = true;
    };
  }, [concertId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      getAvailability(concertId)
        .then((nextAvailability) => setAvailability(nextAvailability || []))
        .catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [concertId]);

  const availabilityByTicket = useMemo(
    () => new Map(availability.map((item) => [item.ticketTypeId, item])),
    [availability]
  );
  const selectedTicket = concert?.ticketTypes.find((ticket) => ticket.id === selectedTicketId) || null;
  const selectedAvailability = selectedTicket ? availabilityByTicket.get(selectedTicket.id) : null;
  const remaining = selectedAvailability?.remainingQuantity ?? selectedTicket?.remainingQuantity ?? 0;
  const maxQuantity = selectedTicket ? Math.max(1, Math.min(selectedTicket.perUserLimit, remaining)) : 1;
  const saleOpen = selectedTicket ? new Date(selectedTicket.saleOpensAt).getTime() <= Date.now() : false;
  const canBuy = Boolean(selectedTicket && remaining > 0 && saleOpen);

  useEffect(() => {
    setQuantity((current) => Math.min(current, maxQuantity));
  }, [maxQuantity]);

  useEffect(() => {
    if (!pendingPurchase || !queueStatus?.active || queueStatus.admitted) {
      return;
    }
    const timer = window.setInterval(() => {
      getQueueStatus(concertId)
        .then((nextStatus) => {
          if (!nextStatus) {
            return;
          }
          setQueueStatus(nextStatus);
          if (nextStatus.admitted && nextStatus.admissionToken) {
            setPendingPurchase(false);
            void completePurchase(nextStatus.admissionToken);
          }
        })
        .catch((caught) => {
          setPendingPurchase(false);
          setSubmitting(false);
          setError(caught instanceof Error ? caught.message : "Waiting room is unavailable");
        });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [concertId, pendingPurchase, queueStatus?.active, queueStatus?.admitted, selectedTicketId, quantity, paymentProvider]);

  async function completePurchase(admissionToken?: string) {
    if (!selectedTicket) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await purchaseTickets({
        ticketTypeId: selectedTicket.id,
        quantity,
        paymentProvider,
        admissionToken
      });
      if (!result) {
        return;
      }
      addOrderToHistory(result.orderId);
      window.location.assign(result.paymentUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Purchase failed");
      setPendingPurchase(false);
      setSubmitting(false);
    }
  }

  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket) {
      return;
    }
    if (!session) {
      router.push(`/login?next=${encodeURIComponent(`/concerts/${concertId}`)}`);
      return;
    }
    setSubmitting(true);
    setError("");
    setQueueStatus(null);
    setPendingPurchase(false);
    try {
      const nextQueueStatus = await enterQueue(concertId);
      if (nextQueueStatus?.active && !nextQueueStatus.admitted) {
        setQueueStatus(nextQueueStatus);
        setPendingPurchase(true);
        setSubmitting(false);
        return;
      }
      await completePurchase(nextQueueStatus?.admissionToken || undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Purchase failed");
      setSubmitting(false);
    }
  }

  if (!concert) {
    return (
      <main className="audience-shell">
        <p className="muted">Loading concert...</p>
      </main>
    );
  }

  return (
    <main className="audience-shell">
      <nav className="audience-nav" aria-label="Audience navigation">
        <Link className="brand-link" href="/">TicketBox</Link>
        <div className="nav-actions">
          <Link className="ghost-button compact-button" href="/me/tickets">My tickets</Link>
          {session ? <span className="session-email">{session.email}</span> : <Link className="primary-button compact-button" href="/login">Login</Link>}
        </div>
      </nav>

      {error ? <p className="toast error" role="alert">{error}</p> : null}

      <section className="detail-hero">
        <div>
          <p className="eyebrow">{concert.eventCode}</p>
          <h1>{concert.name}</h1>
          <p className="muted">{formatDate(concert.eventDate)} / {concert.venue}</p>
        </div>
        <div className="hero-stat">
          <strong>{availability.reduce((sum, item) => sum + item.remainingQuantity, 0)}</strong>
          <span>tickets visible now</span>
        </div>
      </section>

      <section className="detail-grid">
        <article className="panel map-panel">
          <h2>Seat map</h2>
          <div className="seat-map" dangerouslySetInnerHTML={{ __html: concert.seatMapSvg || "" }} />
          <div className="zone-selector">
            {concert.ticketTypes.map((ticket) => {
              const live = availabilityByTicket.get(ticket.id);
              const isSoldOut = live?.soldOut ?? ticket.remainingQuantity <= 0;
              return (
                <button
                  className={ticket.id === selectedTicketId ? "zone-choice selected" : "zone-choice"}
                  disabled={isSoldOut}
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedTicketId(ticket.id)}
                >
                  <strong>{ticket.zone}</strong>
                  <span>{ticket.name} / {isSoldOut ? "Sold out" : `${live?.remainingQuantity ?? ticket.remainingQuantity} left`}</span>
                </button>
              );
            })}
          </div>
        </article>

        <aside className="panel checkout-panel">
          <h2>Buy tickets</h2>
          {selectedTicket ? (
            <form className="form-grid" onSubmit={submitPurchase}>
              <div className="ticket-summary">
                <span>{selectedTicket.name}</span>
                <strong>{formatMoney(selectedTicket.price)}</strong>
                <small>{remaining} left / limit {selectedTicket.perUserLimit}</small>
              </div>
              <label>
                Quantity
                <input
                  disabled={!canBuy}
                  max={maxQuantity}
                  min="1"
                  type="number"
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                />
              </label>
              <div className="segmented-control" aria-label="Payment provider">
                {(["VNPAY", "MOMO"] as const).map((provider) => (
                  <button
                    className={paymentProvider === provider ? "selected" : ""}
                    key={provider}
                    type="button"
                    onClick={() => setPaymentProvider(provider)}
                  >
                    {provider}
                  </button>
                ))}
              </div>
              {queueStatus?.active ? (
                <div className="queue-panel" aria-live="polite">
                  <div>
                    <span>Queue position</span>
                    <strong>{queueStatus.position ?? "Admitted"}</strong>
                  </div>
                  <div>
                    <span>Estimated wait</span>
                    <strong>{queueStatus.estimatedWaitSeconds ? `${queueStatus.estimatedWaitSeconds}s` : "Ready"}</strong>
                  </div>
                </div>
              ) : null}
              {!saleOpen ? <p className="inline-error">Sale opens {formatDate(selectedTicket.saleOpensAt)}.</p> : null}
              <button className="primary-button" disabled={!canBuy || submitting || pendingPurchase} type="submit">
                {pendingPurchase ? "Waiting room" : submitting ? "Redirecting..." : "Continue to payment"}
              </button>
            </form>
          ) : (
            <p className="muted">No ticket types are available.</p>
          )}
        </aside>

        <article className="panel artist-panel">
          <h2>Artist info</h2>
          <p className="muted">{concert.artistBio || "Artist bio coming soon..."}</p>
        </article>

        <article className="panel">
          <h2>Venue</h2>
          <p className="muted">{concert.venue}</p>
          <p className="muted">{concert.description || "Concert details will be updated by the organizer."}</p>
        </article>
      </section>
    </main>
  );
}
