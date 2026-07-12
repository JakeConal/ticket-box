"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSession } from "../lib/audience-api";

type NotificationToast = {
  id: number;
  title: string;
  body: string;
  deepLink: string;
};

const EVENT_TYPES = ["ORDER_PAID", "PURCHASE_CONFIRMATION", "PRE_EVENT_REMINDER", "CONCERT_CANCELLED"] as const;

export function NotificationListener() {
  const [toast, setToast] = useState<NotificationToast | null>(null);

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;

    async function connect() {
      const session = await getSession();
      if (cancelled || !session) {
        return;
      }

      source = new EventSource("/audience-api/notifications/stream");
      const showNotification = (event: MessageEvent<string>) => {
        try {
          const parsed = JSON.parse(event.data) as Partial<NotificationToast>;
          setToast({
            id: Date.now(),
            title: parsed.title || "Notification",
            body: parsed.body || "",
            deepLink: parsed.deepLink || "/me/tickets"
          });
        } catch {
          setToast({
            id: Date.now(),
            title: "Notification",
            body: event.data,
            deepLink: "/me/tickets"
          });
        }
      };

      for (const eventType of EVENT_TYPES) {
        source.addEventListener(eventType, showNotification);
      }
      source.onerror = () => {
        source?.close();
      };
    }

    void connect();
    return () => {
      cancelled = true;
      source?.close();
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeoutId = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  if (!toast) {
    return null;
  }

  return (
    <aside className="fixed bottom-4 right-4 z-[60] w-[min(24rem,calc(100vw-2rem))] border border-neutral-950 bg-white p-4 shadow-[6px_6px_0_#171717]" role="status">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black text-neutral-950">{toast.title}</p>
          {toast.body ? <p className="mt-1 text-sm leading-6 text-neutral-700">{toast.body}</p> : null}
          <Link className="mt-3 inline-flex text-sm font-semibold text-neutral-950 underline" href={toast.deepLink}>
            Open details
          </Link>
        </div>
        <button
          aria-label="Dismiss notification"
          className="text-lg font-black leading-none text-neutral-500 hover:text-neutral-950"
          type="button"
          onClick={() => setToast(null)}
        >
          ×
        </button>
      </div>
    </aside>
  );
}
