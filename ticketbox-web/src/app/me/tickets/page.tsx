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
import { ui } from "../../../components/ui";

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
    <main className={ui.page}>
      <nav className={ui.nav} aria-label="Audience navigation">
        <Link className={ui.brand} href="/">TicketBox</Link>
        <Link className={`${ui.ghostButton} ${ui.compactButton}`} href="/">Browse concerts</Link>
      </nav>

      <section className="max-w-2xl border-b border-neutral-950 pb-8">
        <div>
          <p className={ui.eyebrow}>Ticket wallet</p>
          <h1 className="mt-3 text-4xl font-black">My tickets</h1>
          <p className={`${ui.muted} mt-4`}>Orders started from this browser are collected here and verified against the owned-order API.</p>
          <p className={`${ui.muted} mt-2`}>Download QR codes before arriving so gate checks stay fast.</p>
        </div>
      </section>

      {error ? <p className={`${ui.alertError} mt-6`} role="alert">{error}</p> : null}
      {loading ? <p className={`${ui.muted} mt-6`}>Loading tickets...</p> : null}

      <section className="mt-8 grid gap-6">
        {groups.map((group) => (
          <div className={ui.panel} key={group.order.orderId}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-300 pb-4">
              <h2 className="text-xl font-bold">Order {shortId(group.order.orderId)}</h2>
              <span className={ui.statusBadge}>{group.order.status}</span>
            </div>
            {group.tickets.length > 0 ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}
              </div>
            ) : (
              <p className={`${ui.muted} mt-4`}>Tickets will appear after payment is confirmed.</p>
            )}
          </div>
        ))}
        {!loading && groups.length === 0 ? (
          <section className={ui.emptyState}>
            <h2 className="text-xl font-bold text-neutral-950">No saved orders</h2>
            <p className={`${ui.muted} mt-2`}>After checkout starts, the order will be added here automatically.</p>
            <Link className={`${ui.primaryButton} mt-5`} href="/">Browse concerts</Link>
          </section>
        ) : null}
      </section>
    </main>
  );
}
