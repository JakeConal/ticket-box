"use client";

import { OrderTicket, formatDate, shortId } from "../lib/audience-api";
import { ui } from "./ui";
import { CornerDecoration } from "./bauhaus";

export function TicketCard({ ticket }: { ticket: OrderTicket }) {
  const imageSrc = ticket.qrPngBase64 ? `data:image/png;base64,${ticket.qrPngBase64}` : "";
  const downloadName = `ticketbox-${ticket.id}.png`;

  return (
    <article className="relative flex flex-col border-4 border-ink bg-white p-5 shadow-[6px_6px_0px_0px_#121212] transition-transform duration-200 ease-out hover:-translate-y-1 motion-reduce:transform-none">
      <CornerDecoration index={hash(ticket.id)} />
      <div className="border-b-2 border-ink pb-4">
        <p className={ui.eyebrow}>{ticket.zone}</p>
        <h2 className="mt-2 text-xl font-black uppercase leading-tight tracking-tight">{ticket.concertName}</h2>
        <p className="mt-2 text-sm font-bold uppercase tracking-wider text-ink/80">{ticket.ticketType}</p>
        <p className={`${ui.muted} mt-2`}>Issued {formatDate(ticket.issuedAt)}</p>
      </div>
      <div className="mt-5 grid aspect-square place-items-center border-2 border-ink bg-white p-4">
        {imageSrc ? (
          <img alt={`QR code for ticket ${shortId(ticket.id)}`} className="h-full w-full object-contain" src={imageSrc} />
        ) : (
          <div className="break-all text-center font-mono text-xs text-ink/70">{ticket.qrToken}</div>
        )}
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-widest text-ink/60">Ticket {shortId(ticket.id)}</p>
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

function hash(value: string) {
  return Array.from(value).reduce((total, character) => ((total << 5) - total + character.charCodeAt(0)) | 0, 0) >>> 0;
}
