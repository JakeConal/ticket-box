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
    <main className="audience-shell">
      <nav className="audience-nav" aria-label="Audience navigation">
        <Link className="brand-link" href="/">TicketBox</Link>
        <div className="nav-actions">
          <Link className="ghost-button compact-button" href="/me/tickets">My tickets</Link>
        </div>
      </nav>

      {error ? <p className="toast error" role="alert">{error}</p> : null}

      <section className="order-header">
        <div>
          <p className="eyebrow">Order {shortId(orderId)}</p>
          <h1>{order?.status === "PAID" ? "Your e-tickets are ready" : "Confirming your payment"}</h1>
          <p className="muted">
            Status: <strong>{order?.status || "Loading"}</strong>
            {order?.createdAt ? ` / Created ${formatDate(order.createdAt)}` : ""}
          </p>
        </div>
        <Link className="secondary-button" href="/me/tickets">Open ticket wallet</Link>
      </section>

      {order && order.status !== "PAID" ? (
        <section className="panel">
          <h2>Payment status</h2>
          <p className="muted">
            This page polls the order endpoint. QR tickets appear automatically once the payment gateway marks the order PAID.
          </p>
        </section>
      ) : null}

      <section className="ticket-grid">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </section>
    </main>
  );
}
