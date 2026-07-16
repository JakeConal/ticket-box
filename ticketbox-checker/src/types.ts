export type Tab = "scan" | "sync" | "vip";

export type ConcertOption = {
  id: string;
  name: string;
  venue: string;
  eventDate: string;
  eventCode: string;
};

export type NoticeTone = "info" | "success" | "warning" | "error";

export type AppNotice = {
  id: number;
  tone: NoticeTone;
  message: string;
};

export type Assignment = {
  id: string;
  concertId: string;
  checkerId: string;
  deviceId?: string | null;
  gateId: string;
  laneId?: string | null;
  allowedZones: string[];
  state: "ACTIVE" | "STANDBY" | "INACTIVE";
};

export type KeyBundle = {
  concertId: string;
  validFrom?: string;
  validUntil?: string;
  keys: { kid: string; alg?: string; algorithm?: string; publicKeyPem: string }[];
};

export type TicketPayload = {
  ticketId: string;
  concertId: string;
  zone: string;
};

export type LocalCheckinStatus = "PENDING_SYNC" | "SYNCED" | "CONFLICT" | "REJECTED";

export type LocalCheckin = {
  client_scan_id: string;
  ticket_id: string;
  scanned_at: string;
  checker_id: string;
  device_id: string;
  gate_id: string;
  lane_id: string | null;
  zone: string;
  sync_status: LocalCheckinStatus;
  sync_message: string | null;
};

export type LocalAssignmentAudit = {
  id: string;
  assignment_id: string;
  device_id: string;
  action: string;
  reason: string | null;
  created_at: string;
  sync_status: "PENDING_SYNC" | "SYNCED";
};

export type VipGuest = {
  id: string;
  name: string;
  zone: string;
  phoneMasked?: string | null;
  entered: boolean;
  enteredAt?: string | null;
};
