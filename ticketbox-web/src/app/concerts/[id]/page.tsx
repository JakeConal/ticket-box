"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
import { ui } from "../../../components/ui";

const PAYMENT_PROVIDER = "VNPAY" as const;

export default function ConcertDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const concertId = params.id;
  const [session, setSession] = useState<Session | null>(null);
  const [concert, setConcert] = useState<ConcertDetail | null>(null);
  const [availability, setAvailability] = useState<TicketAvailability[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [queueStatus, setQueueStatus] = useState<Awaited<ReturnType<typeof getQueueStatus>> | null>(null);
  const [pendingPurchase, setPendingPurchase] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const paymentWindowRef = useRef<Window | null>(null);

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
  }, [concertId, pendingPurchase, queueStatus?.active, queueStatus?.admitted, selectedTicketId, quantity]);

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
        paymentProvider: PAYMENT_PROVIDER,
        admissionToken
      });
      if (!result) {
        paymentWindowRef.current?.close();
        paymentWindowRef.current = null;
        setSubmitting(false);
        return;
      }
      addOrderToHistory(result.orderId);
      const paymentWindow = paymentWindowRef.current;
      if (!paymentWindow || paymentWindow.closed) {
        setError("The payment tab was closed. Please try again.");
        setSubmitting(false);
        return;
      }
      paymentWindow.location.replace(result.paymentUrl);
      paymentWindowRef.current = null;
      setSubmitting(false);
    } catch (caught) {
      paymentWindowRef.current?.close();
      paymentWindowRef.current = null;
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
    const paymentWindow = window.open("about:blank", "_blank");
    if (!paymentWindow) {
      setError("Your browser blocked the payment tab. Allow pop-ups for this site and try again.");
      return;
    }
    paymentWindow.opener = null;
    paymentWindow.document.title = "TicketBox payment";
    const paymentMessage = paymentWindow.document.createElement("p");
    paymentMessage.textContent = "Preparing secure payment...";
    paymentWindow.document.body.append(paymentMessage);
    paymentWindowRef.current = paymentWindow;
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
      paymentWindowRef.current?.close();
      paymentWindowRef.current = null;
      setError(caught instanceof Error ? caught.message : "Purchase failed");
      setSubmitting(false);
    }
  }

  if (!concert) {
    return (
      <main className={ui.page}>
        <p className={ui.muted}>Loading concert...</p>
      </main>
    );
  }

  return (
    <main className={ui.page}>
      <nav className={ui.nav} aria-label="Audience navigation">
        <Link className={ui.brand} href="/">TicketBox</Link>
        <div className={ui.navActions}>
          <Link className={`${ui.ghostButton} ${ui.compactButton}`} href="/me/tickets">My tickets</Link>
          {session ? <span className="hidden max-w-48 truncate text-sm text-neutral-600 sm:inline">{session.email}</span> : <Link className={`${ui.primaryButton} ${ui.compactButton}`} href="/login">Login</Link>}
        </div>
      </nav>

      {error ? <p className={ui.alertError} role="alert">{error}</p> : null}

      <section className="grid gap-6 border-b border-neutral-950 pb-8 lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-end">
        <div className="max-w-3xl">
          <p className={ui.eyebrow}>{concert.eventCode}</p>
          <h1 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">{concert.name}</h1>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-neutral-700">
            <span>{formatDate(concert.eventDate)}</span>
            <span>{concert.venue}</span>
          </div>
          <p className={`${ui.muted} mt-4 max-w-2xl`}>Choose a zone, join the waiting room if demand spikes, then continue to a supported payment provider.</p>
        </div>
        <div className="border border-neutral-950 p-5">
          <strong className="block text-4xl font-black">{availability.reduce((sum, item) => sum + item.remainingQuantity, 0)}</strong>
          <span className="mt-2 block text-xs font-semibold uppercase tracking-[0.1em] text-neutral-600">tickets visible now</span>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <article className={`${ui.panel} lg:col-span-2`}>
          <h2 className="text-2xl font-bold">Seat map</h2>
          <div className="mt-5 overflow-hidden border border-neutral-300 bg-white grayscale [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: concert.seatMapSvg || "" }} />
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {concert.ticketTypes.map((ticket) => {
              const live = availabilityByTicket.get(ticket.id);
              const isSoldOut = live?.soldOut ?? ticket.remainingQuantity <= 0;
              return (
                <button
                  className={ticket.id === selectedTicketId ? "flex min-h-20 flex-col justify-center border border-neutral-950 bg-neutral-950 px-4 py-3 text-left text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-not-allowed disabled:opacity-40" : "flex min-h-20 flex-col justify-center border border-neutral-400 bg-white px-4 py-3 text-left text-neutral-950 transition-colors hover:border-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-not-allowed disabled:opacity-40"}
                  disabled={isSoldOut}
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedTicketId(ticket.id)}
                >
                  <strong className="text-sm">{ticket.zone}</strong>
                  <span className="mt-1 text-sm opacity-75">{ticket.name} / {isSoldOut ? "Sold out" : `${live?.remainingQuantity ?? ticket.remainingQuantity} left`}</span>
                </button>
              );
            })}
          </div>
        </article>

        <aside className={ui.panel}>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-300 pb-4">
            <div>
              <p className={ui.eyebrow}>Checkout</p>
              <h2 className="mt-2 text-2xl font-bold">Buy tickets</h2>
            </div>
            <span className="border border-neutral-500 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-700">Secure flow</span>
          </div>
          {selectedTicket ? (
            <form className={`${ui.form} mt-5`} onSubmit={submitPurchase}>
              <div className="border border-neutral-300 p-4">
                <span className="block text-sm text-neutral-600">{selectedTicket.name}</span>
                <strong className="mt-2 block text-2xl font-black">{formatMoney(selectedTicket.price)}</strong>
                <small className="mt-2 block text-sm text-neutral-600">{remaining} left / limit {selectedTicket.perUserLimit}</small>
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
              <div>
                <span className="text-sm font-medium">Payment provider</span>
                <div className="mt-2 grid grid-cols-2 border border-neutral-500" aria-label="Payment provider">
                  <button
                    aria-pressed="true"
                    className="min-h-11 bg-neutral-950 px-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                    type="button"
                  >
                    VNPAY
                  </button>
                  <button
                    className="min-h-11 cursor-not-allowed border-l border-neutral-500 bg-neutral-100 px-3 py-2 text-neutral-500"
                    disabled
                    title="MoMo is temporarily unavailable"
                    type="button"
                  >
                    <span className="block text-sm font-semibold">MOMO</span>
                    <span className="block text-xs">Unavailable</span>
                  </button>
                </div>
              </div>
              {queueStatus?.active ? (
                <div className="grid grid-cols-2 gap-px bg-neutral-300" aria-live="polite">
                  <div className="bg-white p-3">
                    <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Queue position</span>
                    <strong className="mt-2 block text-xl">{queueStatus.position ?? "Admitted"}</strong>
                  </div>
                  <div className="bg-white p-3">
                    <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Estimated wait</span>
                    <strong className="mt-2 block text-xl">{queueStatus.estimatedWaitSeconds ? `${queueStatus.estimatedWaitSeconds}s` : "Ready"}</strong>
                  </div>
                </div>
              ) : null}
              {!saleOpen ? <p className={ui.alertError}>Sale opens {formatDate(selectedTicket.saleOpensAt)}.</p> : null}
              <button className={ui.primaryButton} disabled={!canBuy || submitting || pendingPurchase} type="submit">
                {pendingPurchase ? "Waiting room" : submitting ? "Redirecting..." : "Continue to payment"}
              </button>
            </form>
          ) : (
            <p className={`${ui.muted} mt-5`}>No ticket types are available.</p>
          )}
        </aside>

        <article className={ui.panel}>
          <h2 className="text-xl font-bold">Artist info</h2>
          <p className={`${ui.muted} mt-3`}>{concert.artistBio || "Artist bio coming soon..."}</p>
        </article>

        <article className={ui.panel}>
          <h2 className="text-xl font-bold">Venue</h2>
          <p className={`${ui.muted} mt-3`}>{concert.venue}</p>
          <p className={`${ui.muted} mt-2`}>{concert.description || "Concert details will be updated by the organizer."}</p>
        </article>
      </section>
    </main>
  );
}
