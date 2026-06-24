"use client";

export type AuthSession = {
  userId: string;
  email: string;
  role: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

export type ConcertSummary = {
  id: string;
  name: string;
  venue: string;
  eventDate: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  eventCode: string;
  artistBio?: string | null;
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
  seatMapSvg: string;
  ticketTypes: TicketType[];
};

export type ConcertForm = {
  name: string;
  description: string;
  venue: string;
  eventDate: string;
  eventCode: string;
  artistBio: string;
  seatMapSvg: string;
};

export type TicketTypeForm = {
  id?: string;
  name: string;
  zone: string;
  price: string;
  totalQuantity: string;
  remainingQuantity: string;
  saleOpensAt: string;
  perUserLimit: string;
};

export type ArtistBio = {
  concertId: string;
  bioStatus?: "GENERATING" | "DRAFT" | "PUBLISHED" | "FAILED" | "REJECTED" | null;
  bioGenerationId: number;
  artistPdfUri?: string | null;
  artistBioDraft?: string | null;
  bioError?: string | null;
  publicArtistBio?: string | null;
};

export type ConcertStats = {
  revenueTotal: number;
  checkinCount: number;
  ticketsSoldPerType: Array<{
    ticketTypeId: string;
    name: string;
    zone: string;
    soldQuantity: number;
  }>;
};

export type CheckinConflict = {
  id: string;
  ticketId: string;
  attemptedBy: string;
  attemptedAt: string;
  deviceId: string;
  gateId: string;
  laneId?: string | null;
  zone: string;
  winningCheckedInAt: string;
  timeDeltaSeconds: number;
  createdAt: string;
};

export type AdminOrder = {
  orderId: string;
  userId: string;
  concertId: string;
  status: string;
  paymentProvider?: string | null;
  paymentRef?: string | null;
  refundReason?: string | null;
  createdAt: string;
  paidAt?: string | null;
};

export type VipImportSummary = {
  fileName: string;
  totalRows: number;
  inserted: number;
  updated: number;
  deactivated: number;
  skipped: number;
  errored: number;
  archived: boolean;
  archive: string;
  message: string;
};

export type VipGuestResponse = {
  id: string;
  concertId: string;
  name: string;
  phoneMasked: string;
  sponsor?: string | null;
  zone: string;
  entered: boolean;
  enteredAt?: string | null;
};



const SESSION_KEY = "ticketbox.admin.session";

export function readSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveSession(session: AuthSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

export async function loginOrganizer(email: string, password: string) {
  const session = await request<AuthSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  if (session.role !== "ORGANIZER") {
    throw new Error("This dashboard is restricted to organizer accounts.");
  }
  saveSession(session);
  return session;
}

export function requireOrganizerSession(): AuthSession {
  const session = readSession();
  if (!session || session.role !== "ORGANIZER") {
    throw new Error("Organizer session required");
  }
  return session;
}

export async function adminGet<T>(path: string) {
  return request<T>(path, {
    headers: authHeaders()
  });
}

export async function adminJson<T>(path: string, method: "POST" | "PUT" | "DELETE", body?: unknown) {
  return request<T>(path, {
    method,
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

export async function uploadArtistPdf(concertId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<{ concertId: string; bioGenerationId: number; status: string }>(
    `/api/admin/concerts/${concertId}/artist-pdf`,
    {
      method: "POST",
      headers: authHeaders(),
      body: form
    }
  );
}

export async function triggerVipImport(): Promise<VipImportSummary[]> {
  return adminJson<VipImportSummary[]>("/api/admin/vip-imports", "POST");
}

export async function getVipGuests(concertId: string): Promise<VipGuestResponse[]> {
  return adminGet<VipGuestResponse[]>(`/api/admin/concerts/${concertId}/vip-guests`);
}

export async function deleteVipGuest(concertId: string, guestId: string): Promise<void> {
  return adminJson<void>(`/api/admin/concerts/${concertId}/vip-guests/${guestId}`, "DELETE");
}

export function toConcertRequest(form: ConcertForm) {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    venue: form.venue.trim(),
    eventDate: new Date(form.eventDate).toISOString(),
    eventCode: form.eventCode.trim(),
    artistBio: form.artistBio.trim(),
    seatMapSvg: form.seatMapSvg.trim()
  };
}

export function toTicketTypeRequest(form: TicketTypeForm) {
  return {
    name: form.name.trim(),
    zone: form.zone.trim(),
    price: Number(form.price),
    totalQuantity: Number(form.totalQuantity),
    remainingQuantity: form.remainingQuantity === "" ? null : Number(form.remainingQuantity),
    saleOpensAt: new Date(form.saleOpensAt).toISOString(),
    perUserLimit: Number(form.perUserLimit)
  };
}

function authHeaders(extra?: Record<string, string>) {
  const session = requireOrganizerSession();
  return {
    Authorization: `Bearer ${session.accessToken}`,
    ...extra
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers
  });
  if (response.status === 401 || response.status === 403) {
    clearSession();
  }
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}
