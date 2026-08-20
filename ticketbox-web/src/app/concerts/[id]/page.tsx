"use client";

import Link from "next/link";
import Image from "next/image";
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
  leaveQueue,
  purchaseTickets
} from "../../../lib/audience-api";
import { ui } from "../../../components/ui";
import { BauhausLogo, Shape } from "../../../components/bauhaus";
import { hash } from "../../../components/bauhaus-thumbnail";

const PAYMENT_PROVIDER = "VNPAY" as const;
const PURCHASE_ATTEMPT_TTL_MS = 15 * 60 * 1000;

// Poster photos rotate deterministically per concert, matching the home hero treatment.
const POSTER_PHOTOS = [
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=900&q=70",
  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=70",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=70"
];

type PurchaseAttempt = {
  fingerprint: string;
  key: string;
  createdAt: number;
};

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
  const [leavingQueue, setLeavingQueue] = useState(false);
  const purchaseAttemptRef = useRef<PurchaseAttempt | null>(null);
  const purchaseInFlightRef = useRef(false);
  const queueCancelledRef = useRef(false);

  useEffect(() => {
    void getSession()
      .then((nextSession) => setSession(nextSession))
      .catch(() => undefined);
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
        setSelectedTicketId((current) => {
          if (current) {
            return current;
          }
          const availabilityById = new Map(
            (nextAvailability || []).map((item) => [item.ticketTypeId, item])
          );
          return nextConcert.ticketTypes.find((ticket) => {
            const live = availabilityById.get(ticket.id);
            return (live?.remainingQuantity ?? ticket.remainingQuantity) > 0
              && new Date(ticket.saleOpensAt).getTime() <= Date.now();
          })?.id || nextConcert.ticketTypes[0]?.id || "";
        });
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
          if (!queueCancelledRef.current && nextStatus.admitted && nextStatus.admissionToken) {
            setPendingPurchase(false);
            void completePurchase(nextStatus.admissionToken);
          }
        })
        .catch((caught) => {
          if (queueCancelledRef.current) {
            return;
          }
          setPendingPurchase(false);
          setSubmitting(false);
          setError(caught instanceof Error ? caught.message : "Waiting room is unavailable");
        });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [concertId, pendingPurchase, queueStatus?.active, queueStatus?.admitted, selectedTicketId, quantity]);

  async function completePurchase(admissionToken?: string) {
    if (!selectedTicket || purchaseInFlightRef.current || queueCancelledRef.current) {
      return;
    }
    purchaseInFlightRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const result = await purchaseTickets({
        ticketTypeId: selectedTicket.id,
        quantity,
        paymentProvider: PAYMENT_PROVIDER,
        admissionToken
      }, purchaseAttemptKey(selectedTicket.id, quantity));
      if (!result) {
        purchaseInFlightRef.current = false;
        setSubmitting(false);
        return;
      }
      addOrderToHistory(result.orderId);
      clearPurchaseAttempt();
      window.location.assign(result.paymentUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Purchase failed");
      setPendingPurchase(false);
      setQueueStatus(null);
      setSubmitting(false);
      purchaseInFlightRef.current = false;
    }
  }

  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket) {
      return;
    }
    if (submitting || pendingPurchase) {
      return;
    }
    if (!session) {
      setSubmitting(true);
      try {
        const currentSession = await getSession();
        if (!currentSession) {
          setSubmitting(false);
          router.push(`/login?next=${encodeURIComponent(`/concerts/${concertId}`)}`);
          return;
        }
        setSession(currentSession);
      } catch {
        setError("Could not verify your session. Check your connection and try again.");
        setSubmitting(false);
        return;
      }
    }
    queueCancelledRef.current = false;
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

  function purchaseAttemptKey(ticketTypeId: string, nextQuantity: number) {
    const fingerprint = `${ticketTypeId}:${nextQuantity}:${PAYMENT_PROVIDER}`;
    if (purchaseAttemptRef.current?.fingerprint !== fingerprint) {
      const stored = readStoredPurchaseAttempt();
      purchaseAttemptRef.current = stored?.fingerprint === fingerprint
        && Date.now() - stored.createdAt < PURCHASE_ATTEMPT_TTL_MS
        ? stored
        : {
            fingerprint,
            key: crypto.randomUUID(),
            createdAt: Date.now()
          };
      storePurchaseAttempt(purchaseAttemptRef.current);
    }
    return purchaseAttemptRef.current.key;
  }

  function readStoredPurchaseAttempt(): PurchaseAttempt | null {
    try {
      const raw = window.sessionStorage.getItem(purchaseAttemptStorageKey());
      const parsed = raw ? JSON.parse(raw) as Partial<PurchaseAttempt> : null;
      return parsed
        && typeof parsed.fingerprint === "string"
        && typeof parsed.key === "string"
        && typeof parsed.createdAt === "number"
        ? parsed as PurchaseAttempt
        : null;
    } catch {
      return null;
    }
  }

  function storePurchaseAttempt(attempt: PurchaseAttempt) {
    try {
      window.sessionStorage.setItem(purchaseAttemptStorageKey(), JSON.stringify(attempt));
    } catch {
      return;
    }
  }

  function clearPurchaseAttempt() {
    purchaseAttemptRef.current = null;
    try {
      window.sessionStorage.removeItem(purchaseAttemptStorageKey());
    } catch {
      return;
    }
  }

  function purchaseAttemptStorageKey() {
    return `ticketbox:purchase-attempt:${concertId}`;
  }

  async function cancelWaitingRoom() {
    queueCancelledRef.current = true;
    setLeavingQueue(true);
    setError("");
    try {
      await leaveQueue(concertId);
      setPendingPurchase(false);
      setSubmitting(false);
      setQueueStatus(null);
      clearPurchaseAttempt();
    } catch (caught) {
      queueCancelledRef.current = false;
      setError(caught instanceof Error ? caught.message : "Could not leave the waiting room");
    } finally {
      setLeavingQueue(false);
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
        <Link className={ui.brand} href="/">
          <BauhausLogo />
          TicketBox
        </Link>
        <div className={ui.navActions}>
          <Link className={`${ui.ghostButton} ${ui.compactButton}`} href="/me/tickets">My tickets</Link>
          {session ? <span className="hidden max-w-48 truncate text-sm font-medium text-ink/70 sm:inline">{session.email}</span> : <Link className={`${ui.primaryButton} ${ui.compactButton}`} href="/login">Login</Link>}
        </div>
      </nav>

      {error ? <p className={ui.alertError} role="alert">{error}</p> : null}

      {/* Poster header: concert photo left, poster-scale title right */}
      <section className="grid gap-8 border-b-4 border-ink pb-12 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-stretch">
        <figure className="group relative h-56 overflow-hidden border-4 border-ink shadow-[8px_8px_0px_0px_#121212] sm:h-64 lg:h-auto">
          <Image
            alt={`Concert poster for ${concert.name}`}
            className="object-cover grayscale transition-all duration-300 ease-out group-hover:grayscale-0"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 18rem"
            src={POSTER_PHOTOS[hash(concert.id) % POSTER_PHOTOS.length]}
          />
        </figure>
        <div className="flex flex-col justify-center py-2">
          <p className={ui.eyebrow}>{concert.eventCode}</p>
          <h1 className="mt-3 text-4xl font-black uppercase leading-[0.9] tracking-tighter sm:text-6xl lg:text-7xl">{concert.name}</h1>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold uppercase tracking-wider text-ink/80">
            <span>{formatDate(concert.eventDate)}</span>
            <span>{concert.venue}</span>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="border-2 border-ink bg-bauhaus-yellow px-3 py-2 text-sm font-black uppercase tracking-wider shadow-[3px_3px_0px_0px_#121212]">
              {availability.reduce((sum, item) => sum + item.remainingQuantity, 0)} tickets live
            </span>
            <span className={ui.statusBadge}>Secure checkout</span>
          </div>
        </div>
      </section>

      {/* Stage: seat map left; sticky ticket booth right keeps checkout on screen. */}
      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
        <article className={ui.panel}>
          <h2 className="text-2xl font-black uppercase tracking-tight">Seat map</h2>
          <div className="mt-5 overflow-hidden border-2 border-ink bg-white [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: concert.seatMapSvg || "" }} />
          <p className="mt-4 text-xs font-bold uppercase tracking-widest text-ink/60">
            Pick a zone in the ticket booth — prices and availability update live.
          </p>
        </article>

        <aside className={`${ui.panel} lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto`}>
          <div className="border-b-2 border-ink pb-4">
            <p className={ui.eyebrow}>Ticket booth</p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-tight">Buy tickets</h2>
          </div>
          <div className="mt-5 grid gap-2">
            {concert.ticketTypes.map((ticket) => {
              const live = availabilityByTicket.get(ticket.id);
              const isSoldOut = live?.soldOut ?? ticket.remainingQuantity <= 0;
              return (
                <button
                  className={ticket.id === selectedTicketId ? "flex min-h-16 flex-col justify-center border-2 border-ink bg-bauhaus-blue px-4 py-3 text-left text-white shadow-[4px_4px_0px_0px_#121212] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40" : "flex min-h-16 flex-col justify-center border-2 border-ink bg-white px-4 py-3 text-left text-ink transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40"}
                  disabled={isSoldOut || submitting || pendingPurchase}
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedTicketId(ticket.id)}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <strong className="text-sm font-black uppercase tracking-wider">{ticket.zone}</strong>
                    <strong className="text-sm font-black">{formatMoney(ticket.price)}</strong>
                  </span>
                  <span className="mt-1 text-sm opacity-75">{ticket.name} / {isSoldOut ? "Sold out" : `${live?.remainingQuantity ?? ticket.remainingQuantity} left`}</span>
                </button>
              );
            })}
          </div>
          {selectedTicket ? (
            <form className={`${ui.form} mt-5`} onSubmit={submitPurchase}>
              <div className="border-2 border-ink bg-canvas p-4">
                <span className="block text-sm font-medium text-ink/70">{selectedTicket.name}</span>
                <strong className="mt-2 block text-2xl font-black">{formatMoney(selectedTicket.price)}</strong>
                <small className="mt-2 block text-sm text-ink/70">{remaining} left / limit {selectedTicket.perUserLimit}</small>
              </div>
              <div>
                <span className="text-sm font-bold uppercase tracking-wider">Quantity</span>
                <div className="mt-2 grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] border-2 border-ink bg-white">
                  <button
                    aria-label="Decrease quantity"
                    className="min-h-11 border-r-2 border-ink text-lg font-black transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!canBuy || submitting || pendingPurchase || quantity <= 1}
                    type="button"
                    onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  >
                    -
                  </button>
                  <input
                    aria-label="Ticket quantity"
                    className="!m-0 !min-h-11 !border-0 px-3 text-center text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
                    disabled={!canBuy || submitting || pendingPurchase}
                    max={maxQuantity}
                    min="1"
                    type="number"
                    value={quantity}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isFinite(next)) {
                        setQuantity(Math.max(1, Math.min(maxQuantity, next)));
                      }
                    }}
                  />
                  <button
                    aria-label="Increase quantity"
                    className="min-h-11 border-l-2 border-ink text-lg font-black transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!canBuy || submitting || pendingPurchase || quantity >= maxQuantity}
                    type="button"
                    onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))}
                  >
                    +
                  </button>
                </div>
              </div>
              <div>
                <span className="text-sm font-bold uppercase tracking-wider">Payment provider</span>
                <div className="mt-2 grid grid-cols-2 border-2 border-ink" aria-label="Payment provider">
                  <button
                    aria-pressed="true"
                    className="min-h-11 bg-bauhaus-blue px-3 text-sm font-bold uppercase tracking-wider text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    type="button"
                  >
                    VNPAY
                  </button>
                  <button
                    className="min-h-11 cursor-not-allowed border-l-2 border-ink bg-canvas px-3 py-2 text-ink/50"
                    disabled
                    title="MoMo is temporarily unavailable"
                    type="button"
                  >
                    <span className="block text-sm font-bold uppercase tracking-wider">MOMO</span>
                    <span className="block text-xs">Unavailable</span>
                  </button>
                </div>
              </div>
              {queueStatus?.active ? (
                <div className="border-2 border-ink bg-bauhaus-yellow-soft p-4 shadow-[4px_4px_0px_0px_#121212]" aria-live="polite">
                  <p className="text-sm font-bold uppercase tracking-wider">
                    {queueStatus.admitted ? "Your checkout slot is ready." : "You are in the waiting room."}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-px bg-ink">
                    <div className="bg-white p-3">
                      <span className="block text-xs font-bold uppercase tracking-widest text-ink/60">Queue position</span>
                      <strong className="mt-2 block text-xl">{queueStatus.position ?? "Admitted"}</strong>
                    </div>
                    <div className="bg-white p-3">
                      <span className="block text-xs font-bold uppercase tracking-widest text-ink/60">Estimated wait</span>
                      <strong className="mt-2 block text-xl">{queueStatus.estimatedWaitSeconds ? `${queueStatus.estimatedWaitSeconds}s` : "Ready"}</strong>
                    </div>
                  </div>
                  {pendingPurchase ? (
                    <button
                      className={`${ui.ghostButton} mt-2 w-full`}
                      disabled={leavingQueue}
                      type="button"
                      onClick={() => void cancelWaitingRoom()}
                    >
                      {leavingQueue ? "Leaving..." : "Leave waiting room"}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {!saleOpen ? <p className={ui.alertError}>Sale opens {formatDate(selectedTicket.saleOpensAt)}.</p> : null}
              <div className="flex items-center justify-between border-y-2 border-ink py-3 text-sm">
                <span className="font-bold uppercase tracking-wider text-ink/70">Order total</span>
                <strong className="text-lg">{formatMoney(selectedTicket.price * quantity)}</strong>
              </div>
              <button className={ui.primaryButton} disabled={!canBuy || submitting || pendingPurchase} type="submit">
                {pendingPurchase ? "Waiting room" : submitting ? "Preparing payment..." : "Continue to payment"}
              </button>
            </form>
          ) : (
            <p className={`${ui.muted} mt-5`}>No ticket types are available.</p>
          )}
        </aside>
      </section>

      {/* Program notes: supporting info below the purchase flow */}
      <section className="mt-6 grid gap-6 md:grid-cols-2" aria-label="Program notes">
        <article className={ui.panel}>
          <h2 className="text-xl font-black uppercase tracking-tight">Artist info</h2>
          <p className={`${ui.muted} mt-3 whitespace-pre-line`}>{concert.artistBio || "Artist bio coming soon..."}</p>
        </article>

        <article className={ui.panel}>
          <h2 className="text-xl font-black uppercase tracking-tight">Venue</h2>
          <p className={`${ui.muted} mt-3`}>{concert.venue}</p>
          <p className={`${ui.muted} mt-2`}>{concert.description || "Concert details will be updated by the organizer."}</p>
        </article>
      </section>
    </main>
  );
}
