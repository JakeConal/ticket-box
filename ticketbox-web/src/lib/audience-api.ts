"use client";

import { apiErrorMessage } from "./http-error";

export type Session = {
  userId: string;
  email: string;
  role: "AUDIENCE" | "ORGANIZER" | "CHECKER";
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
};

export type ConcertSummary = {
  id: string;
  name: string;
  venue: string;
  eventDate: string;
  status: "PUBLISHED" | "DRAFT" | "CANCELLED";
  eventCode: string;
  artistBio?: string | null;
};

export type ConcertPage = {
  content: ConcertSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type TicketType = {
  id: string;
  name: string;
  zone: string;
  price: number;
  totalQuantity: number;
  remainingQuantity: number;
  saleOpensAt: string;
  perUserLimit: number;
};

export type ConcertDetail = ConcertSummary & {
  description?: string | null;
  seatMapSvg?: string | null;
  ticketTypes: TicketType[];
};

export type TicketAvailability = {
  ticketTypeId: string;
  name: string;
  zone: string;
  remainingQuantity: number;
  soldOut: boolean;
};

export type PurchaseResponse = {
  orderId: string;
  paymentUrl: string;
};

export type QueueStatus = {
  concertId: string;
  active: boolean;
  position?: number | null;
  estimatedWaitSeconds?: number | null;
  admitted: boolean;
  admissionToken?: string | null;
  admissionExpiresAt?: string | null;
};

export type OrderStatus = {
  orderId: string;
  concertId: string;
  status: string;
  paymentProvider?: string | null;
  paymentRef?: string | null;
  createdAt: string;
  paidAt?: string | null;
};

export type OrderTicket = {
  id: string;
  orderId: string;
  ticketTypeId: string;
  concertName: string;
  ticketType: string;
  zone: string;
  qrToken: string;
  qrPngBase64?: string | null;
  issuedAt: string;
};

export type PurchaseDraft = {
  ticketTypeId: string;
  quantity: number;
  paymentProvider: "VNPAY" | "MOMO";
  admissionToken?: string;
};

const ORDER_HISTORY_KEY = "ticketbox.audience.orders";
export const AUDIENCE_AUTH_CHANGED_EVENT = "ticketbox:audience-auth-changed";

export async function getSession() {
  return request<Session>("/audience-auth/me", {}, { allowUnauthorized: true });
}

export async function loginAudience(email: string, password: string) {
  const session = await request<Session>("/audience-auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  }, { redirectUnauthorized: false });
  notifyAuthChanged();
  return session;
}

export async function registerAudience(email: string, password: string) {
  const session = await request<Session>("/audience-auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password })
  }, { redirectUnauthorized: false });
  notifyAuthChanged();
  return session;
}

export async function logoutAudience() {
  await request<{ ok: boolean }>("/audience-auth/logout", { method: "POST" }, { allowUnauthorized: true });
  notifyAuthChanged();
}

export async function listConcerts(page = 0, size = 8) {
  return request<ConcertPage>(`/api/concerts?page=${page}&size=${size}`);
}

export async function getConcert(id: string) {
  return request<ConcertDetail>(`/api/concerts/${id}`);
}

export async function getAvailability(id: string) {
  return request<TicketAvailability[]>(`/api/concerts/${id}/availability`);
}

export async function purchaseTickets(draft: PurchaseDraft, idempotencyKey: string) {
  return request<PurchaseResponse>("/audience-api/purchase", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(draft)
  });
}

export async function enterQueue(concertId: string) {
  return request<QueueStatus>(`/audience-api/queue/${concertId}/enter`, {
    method: "POST"
  });
}

export async function getQueueStatus(concertId: string) {
  return request<QueueStatus>(`/audience-api/queue/${concertId}/status`);
}

export async function leaveQueue(concertId: string) {
  await request<void>(`/audience-api/queue/${concertId}/leave`, {
    method: "DELETE"
  });
}

export async function getOrder(id: string) {
  return request<OrderStatus>(`/audience-api/orders/${id}`);
}

export async function getOrderTickets(id: string) {
  return request<OrderTicket[]>(`/audience-api/orders/${id}/tickets`);
}

export function addOrderToHistory(orderId: string) {
  const existing = readOrderHistory();
  if (!existing.includes(orderId)) {
    window.localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify([orderId, ...existing]));
  }
}

export function readOrderHistory() {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ORDER_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(value);
}

export function shortId(value: string) {
  return value.slice(0, 8);
}

function notifyAuthChanged() {
  window.dispatchEvent(new Event(AUDIENCE_AUTH_CHANGED_EVENT));
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { allowUnauthorized?: boolean; redirectUnauthorized?: boolean } = {}
): Promise<T | null> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers
  });
  if (response.status === 401 && options.allowUnauthorized) {
    return null;
  }
  if (response.status === 401 && options.redirectUnauthorized !== false) {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    throw new Error("Authentication required");
  }
  if (!response.ok) {
    const message = await response.text();
    throw new Error(apiErrorMessage(message, response.status));
  }
  if (response.status === 204) {
    return null;
  }
  return response.json() as Promise<T>;
}
