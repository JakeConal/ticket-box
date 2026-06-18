"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TicketCard } from "../../../components/ticket-card";
import {
  OrderStatus,
  OrderTicket,
  getOrder,
  getOrderTickets,
  readOrderHistory,
  shortId
} from "../../../lib/audience-api";

type TicketGroup = {
  order: OrderStatus;
  tickets: OrderTicket[];
};

export default function MyTicketsPage() {
  const [groups, setGroups] = useState<TicketGroup[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const orderIds = readOrderHistory();
        const nextGroups = await Promise.all(
          orderIds.map(async (orderId) => {
            const order = await getOrder(orderId);
            if (!order) {
              return null;
            }
            const tickets = order.status === "PAID" ? await getOrderTickets(orderId) : [];
            return { order, tickets: tickets || [] };
          })
        );
        if (!ignore) {
          setGroups(nextGroups.filter(Boolean) as TicketGroup[]);
        }
      } catch (caught) {
        if (!ignore) {
          setError(caught instanceof Error ? caught.message : "Could not load tickets");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main className="audience-shell">
      <nav className="audience-nav" aria-label="Audience navigation">
        <Link className="brand-link" href="/">TicketBox</Link>
        <Link className="ghost-button compact-button" href="/">Browse concerts</Link>
      </nav>

      <section className="order-header">
        <div>
          <p className="eyebrow">Ticket wallet</p>
          <h1>My tickets</h1>
          <p className="muted">Orders started from this browser are collected here and verified against the owned-order API.</p>
        </div>
      </section>

      {error ? <p className="toast error" role="alert">{error}</p> : null}
      {loading ? <p className="muted">Loading tickets...</p> : null}

      <section className="ticket-wallet">
        {groups.map((group) => (
          <div className="panel" key={group.order.orderId}>
            <h2>Order {shortId(group.order.orderId)} / {group.order.status}</h2>
            {group.tickets.length > 0 ? (
              <div className="ticket-grid">
                {group.tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}
              </div>
            ) : (
              <p className="muted">Tickets will appear after payment is confirmed.</p>
            )}
          </div>
        ))}
        {!loading && groups.length === 0 ? (
          <section className="panel">
            <h2>No saved orders</h2>
            <p className="muted">After checkout starts, the order will be added here automatically.</p>
            <Link className="primary-button" href="/">Browse concerts</Link>
          </section>
        ) : null}
      </section>
    </main>
  );
}
