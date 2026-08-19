"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ConcertSummary, formatDate } from "../lib/audience-api";
import { ui } from "./ui";
import { CornerDecoration } from "./bauhaus";
import { BauhausThumbnail } from "./bauhaus-thumbnail";

// Per-concert zone availability rolled up for card display.
export type AvailabilitySummary = Record<string, { remaining: number; soldOut: boolean }>;

export function summarizeAvailability(items: Array<{ zone: string; remainingQuantity: number; soldOut: boolean }>) {
  return items.reduce<AvailabilitySummary>((summary, item) => {
    const current = summary[item.zone] || { remaining: 0, soldOut: true };
    summary[item.zone] = {
      remaining: current.remaining + item.remainingQuantity,
      soldOut: current.soldOut && item.soldOut
    };
    return summary;
  }, {});
}

export function ConcertCard({ concert, availability, decorationIndex }: { concert: ConcertSummary; availability: AvailabilitySummary; decorationIndex: number }) {
  const zones = useMemo(() => Object.entries(availability).slice(0, 5), [availability]);
  const remaining = useMemo(
    () => Object.values(availability).reduce((total, item) => total + item.remaining, 0),
    [availability]
  );

  return (
    <article className="group relative flex min-h-full flex-col border-4 border-ink bg-white shadow-[8px_8px_0px_0px_#121212] transition-transform duration-200 ease-out hover:-translate-y-1 focus-within:-translate-y-1 motion-reduce:transform-none">
      <CornerDecoration index={decorationIndex} />
      <div className="aspect-[16/8] border-b-4 border-ink" aria-hidden="true">
        <BauhausThumbnail seed={concert.id} />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className={ui.eyebrow}>{concert.eventCode}</p>
        <h3 className="mt-2 text-xl font-black uppercase leading-snug tracking-tight">{concert.name}</h3>
        <div className="mt-4 grid gap-1.5">
          <p className={ui.muted}><strong className="font-bold uppercase text-ink">Date</strong> {formatDate(concert.eventDate)}</p>
          <p className={ui.muted}><strong className="font-bold uppercase text-ink">Venue</strong> {concert.venue}</p>
        </div>
        <div className="mt-5 flex items-baseline justify-between border-y-2 border-ink py-3">
          <strong className="text-2xl font-black">{remaining || "-"}</strong>
          <span className="text-xs font-bold uppercase tracking-widest text-ink/60">tickets visible</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Zone availability">
          {zones.map(([zone, item]) => (
            <span
              className={item.soldOut
                ? "border-2 border-ink/30 px-2 py-1 text-xs font-medium text-ink/40 line-through"
                : "border-2 border-ink bg-canvas px-2 py-1 text-xs font-bold text-ink"}
              key={zone}
            >
              {zone}: {item.soldOut ? "Sold out" : item.remaining}
            </span>
          ))}
          {zones.length === 0 ? <span className="border-2 border-ink bg-canvas px-2 py-1 text-xs font-bold text-ink">Availability loading</span> : null}
        </div>
      </div>
      <Link className={`${ui.primaryButton} m-5 mt-0`} href={`/concerts/${concert.id}`}>View tickets</Link>
    </article>
  );
}
