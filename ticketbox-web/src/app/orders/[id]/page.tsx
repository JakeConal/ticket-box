"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  OrderStatus,
  OrderTicket,
  formatDate,
  getOrder,
  getOrderTickets,
  shortId
} from "../../../lib/audience-api";
import { TicketCard } from "../../../components/ticket-card";
import { ui } from "../../../components/ui";

const PENDING_STATUSES = new Set(["PENDING", "PENDING_CONFIRMATION"]);

export default function OrderPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [tickets, setTickets] = useState<OrderTicket[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [paymentReturn, setPaymentReturn] = useState("");

  useEffect(() => {
    setPaymentReturn(new URLSearchParams(window.location.search).get("payment") || "");
  }, []);

  useEffect(() => {
    let ignore = false;
    let timer: number | undefined;

    async function load() {
      try {
        const nextOrder = await getOrder(orderId);
        if (!nextOrder || ignore) {
          return;
        }
        setOrder(nextOrder);
        setError("");

        let nextTickets: OrderTicket[] = [];
        if (nextOrder.status === "PAID") {
          nextTickets = (await getOrderTickets(orderId)) || [];
          if (!ignore) {
            setTickets(nextTickets);
          }
        }

        if (!ignore && (PENDING_STATUSES.has(nextOrder.status) || (nextOrder.status === "PAID" && nextTickets.length === 0))) {
          timer = window.setTimeout(load, 4000);
        }
      } catch (caught) {
        if (!ignore) {
          setError(caught instanceof Error ? caught.message : "Could not load order");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    setLoading(true);
    void load();
    return () => {
      ignore = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [orderId, reloadToken]);

  const copy = useMemo(() => orderCopy(order?.status), [order?.status]);

  return (
    <main className={ui.page}>
      <nav className={ui.nav} aria-label="Audience navigation">
        <Link className={ui.brand} href="/">TicketBox</Link>
        <div className={ui.navActions}>
          <Link className={`${ui.ghostButton} ${ui.compactButton}`} href="/me/tickets">My tickets</Link>
        </div>
      </nav>

      {paymentReturn === "failed" ? (
        <p className={ui.alertError} role="alert">
          The payment provider did not complete this payment. Your reservation will be released automatically.
        </p>
      ) : null}
      {error ? (
        <div className={`${ui.alertError} flex flex-wrap items-center justify-between gap-3`} role="alert">
          <span>{error}</span>
          <button
            className={`${ui.secondaryButton} ${ui.compactButton}`}
            type="button"
            onClick={() => setReloadToken((current) => current + 1)}
          >
            Try again
          </button>
        </div>
      ) : null}

      <section className="flex flex-wrap items-end justify-between gap-6 border-b border-neutral-950 pb-8" aria-live="polite">
        <div className="max-w-2xl">
          <p className={ui.eyebrow}>Order {shortId(orderId)}</p>
          <h1 className="mt-3 text-4xl font-black">{loading && !order ? "Loading your order" : copy.title}</h1>
          <p className={`${ui.muted} mt-4`}>
            Status: <strong className="text-neutral-950">{order?.status || "Loading"}</strong>
            {order?.createdAt ? ` / Created ${formatDate(order.createdAt)}` : ""}
          </p>
          <p className={`${ui.muted} mt-2`}>{copy.description}</p>
        </div>
        <div className={ui.actionRow}>
          {order?.concertId && order.status !== "PAID" ? (
            <Link className={ui.secondaryButton} href={`/concerts/${order.concertId}`}>Back to concert</Link>
          ) : null}
          <Link className={ui.primaryButton} href="/me/tickets">Open ticket wallet</Link>
        </div>
      </section>

      {order && PENDING_STATUSES.has(order.status) ? (
        <section className={`${ui.panel} mt-8`} role="status">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 animate-pulse bg-neutral-950 motion-reduce:animate-none" aria-hidden="true" />
            <h2 className="text-xl font-bold">Waiting for payment confirmation</h2>
          </div>
          <p className={`${ui.muted} mt-3`}>You can keep this page open or return later from My tickets.</p>
        </section>
      ) : null}

      {order?.status === "PAID" && tickets.length === 0 ? (
        <p className={`${ui.muted} mt-8`} role="status">Preparing your QR tickets...</p>
      ) : null}

      {tickets.length > 0 ? (
        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Issued tickets">
          {tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </section>
      ) : null}
    </main>
  );
}

function orderCopy(status?: string) {
  switch (status) {
    case "PAID":
      return {
        title: "Your e-tickets are ready",
        description: "Present each QR code at the assigned entrance."
      };
    case "FAILED":
      return {
        title: "Payment was not completed",
        description: "No tickets were issued. Return to the concert when you are ready to try again."
      };
    case "EXPIRED":
      return {
        title: "Your reservation expired",
        description: "The reserved tickets were returned to inventory."
      };
    case "REFUND_REQUIRED":
      return {
        title: "Your payment needs a refund",
        description: "Payment arrived after the reservation expired. The organizer has been notified."
      };
    case "REFUNDED":
      return {
        title: "Refund recorded",
        description: "The organizer has marked this payment as refunded."
      };
    default:
      return {
        title: "Confirming your payment",
        description: "Tickets will appear here as soon as payment is confirmed."
      };
  }
}
