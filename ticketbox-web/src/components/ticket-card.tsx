"use client";

import { OrderTicket, formatDate, shortId } from "../lib/audience-api";

export function TicketCard({ ticket }: { ticket: OrderTicket }) {
  const imageSrc = ticket.qrPngBase64 ? `data:image/png;base64,${ticket.qrPngBase64}` : "";
  const downloadName = `ticketbox-${ticket.id}.png`;

  return (
    <article className="ticket-card">
      <div>
        <p className="eyebrow">{ticket.zone}</p>
        <h2>{ticket.ticketType}</h2>
        <p className="muted">Issued {formatDate(ticket.issuedAt)}</p>
      </div>
      {imageSrc ? (
        <img alt={`QR code for ticket ${shortId(ticket.id)}`} className="qr-image" src={imageSrc} />
      ) : (
        <div className="qr-token">{ticket.qrToken}</div>
      )}
      <a
        className="secondary-button"
        download={downloadName}
        href={imageSrc || `data:text/plain;charset=utf-8,${encodeURIComponent(ticket.qrToken)}`}
      >
        Download
      </a>
    </article>
  );
}
