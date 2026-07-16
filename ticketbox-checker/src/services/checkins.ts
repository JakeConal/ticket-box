import type { LocalCheckinStatus } from "../types";

export type CheckinApiResult = {
  clientScanId?: string;
  ticketId?: string;
  result?: "OK" | "CONFLICT" | "INVALID" | string;
  checkedInAt?: string | null;
  winningCheckedInAt?: string | null;
  message?: string | null;
};

export type CheckinSyncOutcome = {
  kind: "synced" | "pending" | "conflict" | "rejected";
  localStatus: LocalCheckinStatus;
  message: string;
  checkedInAt?: string | null;
};

export function mapCheckinResponse(status: number, body: CheckinApiResult | null): CheckinSyncOutcome {
  if (status === 409 || body?.result === "CONFLICT") {
    return {
      kind: "conflict",
      localStatus: "CONFLICT",
      message: conflictMessage(body),
      checkedInAt: body?.winningCheckedInAt
    };
  }

  if (body?.result === "INVALID") {
    return {
      kind: "rejected",
      localStatus: "REJECTED",
      message: body.message?.trim() || "The server rejected this ticket."
    };
  }

  if (status >= 200 && status < 300 && body?.result === "OK") {
    return {
      kind: "synced",
      localStatus: "SYNCED",
      message: body.message?.trim() || "Check-in synced.",
      checkedInAt: body.checkedInAt
    };
  }

  return {
    kind: "pending",
    localStatus: "PENDING_SYNC",
    message: "Saved on this device. Sync will retry automatically."
  };
}

export function pendingSyncOutcome(): CheckinSyncOutcome {
  return {
    kind: "pending",
    localStatus: "PENDING_SYNC",
    message: "Saved offline. Sync will run automatically when the connection returns."
  };
}

export function friendlyScanError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const message = raw.toLowerCase();

  if (message.includes("signature verification") || message.includes("matching rs256")) {
    return "QR signature is invalid. Ask the guest to open their current ticket.";
  }
  if (message.includes("token format") || message.includes("unexpected token") || message.includes("json")) {
    return "This is not a valid Ticketbox QR code.";
  }
  if (message.includes("public key bundle")) {
    return "QR verification keys are not available. Refresh checker data while online.";
  }
  if (message.includes("verification window")) {
    return "This event is outside its approved scanning window. Refresh checker data or contact the organizer.";
  }
  if (message.includes("network request failed") || message.includes("failed to fetch")) {
    return "No network connection. The ticket could not be verified online.";
  }
  if (message.includes("session expired")) {
    return "Online session expired. Sign in again to sync; cached offline scanning is still available.";
  }
  if (message.includes("abort")) {
    return "Verification timed out. Try again or refresh checker data when the connection is stable.";
  }

  return raw || "The ticket could not be verified.";
}

export function duplicateScanMessage(status: LocalCheckinStatus, scannedAt: string) {
  const time = formatLocalTime(scannedAt);
  if (status === "PENDING_SYNC") {
    return `Already scanned on this device at ${time}; waiting to sync.`;
  }
  if (status === "CONFLICT") {
    return `Already scanned at ${time}; the server reported a duplicate check-in.`;
  }
  if (status === "REJECTED") {
    return `Already scanned at ${time}; the server rejected this ticket.`;
  }
  return `Already checked in on this device at ${time}.`;
}

function conflictMessage(body: CheckinApiResult | null) {
  if (body?.winningCheckedInAt) {
    return `Already checked in at ${formatLocalTime(body.winningCheckedInAt)}.`;
  }
  return body?.message?.trim() || "This ticket was already checked in.";
}

export function formatLocalTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "an earlier time";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
