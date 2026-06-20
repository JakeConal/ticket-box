"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
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

export default function OrderPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [tickets, setTickets] = useState<OrderTicket[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const nextOrder = await getOrder(orderId);
        if (!nextOrder || ignore) {
          return;
        }
        setOrder(nextOrder);
        if (nextOrder.status === "PAID") {
          const nextTickets = await getOrderTickets(orderId);
          if (!ignore) {
            setTickets(nextTickets || []);
          }
        }
      } catch (caught) {
        if (!ignore) {
          setError(caught instanceof Error ? caught.message : "Could not load order");
        }
      }
    }
    void load();
    const timer = window.setInterval(load, 4000);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [orderId]);

  return (
    <main className={ui.page}>
      <nav className={ui.nav} aria-label="Audience navigation">
        <Link className={ui.brand} href="/">TicketBox</Link>
        <div className={ui.navActions}>
          <Link className={`${ui.ghostButton} ${ui.compactButton}`} href="/me/tickets">My tickets</Link>
        </div>
      </nav>

      {error ? <p className={ui.alertError} role="alert">{error}</p> : null}

      <section className="flex flex-wrap items-end justify-between gap-6 border-b border-neutral-950 pb-8">
        <div className="max-w-2xl">
          <p className={ui.eyebrow}>Order {shortId(orderId)}</p>
          <h1 className="mt-3 text-4xl font-black">{order?.status === "PAID" ? "Your e-tickets are ready" : "Confirming your payment"}</h1>
          <p className={`${ui.muted} mt-4`}>
            Status: <strong>{order?.status || "Loading"}</strong>
            {order?.createdAt ? ` / Created ${formatDate(order.createdAt)}` : ""}
          </p>
          <p className={`${ui.muted} mt-2`}>Keep this page open after checkout. Paid orders load QR tickets automatically.</p>
        </div>
        <Link className={ui.secondaryButton} href="/me/tickets">Open ticket wallet</Link>
      </section>

      {order && order.status !== "PAID" ? (
        <section className={`${ui.panel} mt-8`}>
          <h2 className="text-xl font-bold">Payment status</h2>
          <p className={`${ui.muted} mt-3`}>
            This page polls the order endpoint. QR tickets appear automatically once the payment gateway marks the order PAID.
          </p>
        </section>
      ) : null}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </section>
    </main>
  );
}
