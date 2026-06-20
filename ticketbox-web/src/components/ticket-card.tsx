"use client";

import { OrderTicket, formatDate, shortId } from "../lib/audience-api";
import { ui } from "./ui";

export function TicketCard({ ticket }: { ticket: OrderTicket }) {
  const imageSrc = ticket.qrPngBase64 ? `data:image/png;base64,${ticket.qrPngBase64}` : "";
  const downloadName = `ticketbox-${ticket.id}.png`;

  return (
    <article className="flex flex-col border border-neutral-950 bg-white p-5">
      <div className="border-b border-neutral-300 pb-4">
        <p className={ui.eyebrow}>{ticket.zone}</p>
        <h2 className="mt-2 text-xl font-bold">{ticket.ticketType}</h2>
        <p className={`${ui.muted} mt-2`}>Issued {formatDate(ticket.issuedAt)}</p>
      </div>
      <div className="mt-5 grid aspect-square place-items-center border border-neutral-950 bg-white p-4">
        {imageSrc ? (
          <img alt={`QR code for ticket ${shortId(ticket.id)}`} className="h-full w-full object-contain" src={imageSrc} />
        ) : (
          <div className="break-all text-center font-mono text-xs text-neutral-700">{ticket.qrToken}</div>
        )}
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.1em] text-neutral-600">Ticket {shortId(ticket.id)}</p>
      <a
        className={`${ui.secondaryButton} mt-4`}
        download={downloadName}
        href={imageSrc || `data:text/plain;charset=utf-8,${encodeURIComponent(ticket.qrToken)}`}
      >
        Download
      </a>
    </article>
  );
}
