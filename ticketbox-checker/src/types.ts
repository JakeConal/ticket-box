export type Tab = "scan" | "sync" | "vip";

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
  keys: { kid: string; alg?: string; algorithm?: string; publicKeyPem: string }[];
};

export type TicketPayload = {
  ticketId: string;
  concertId: string;
  zone: string;
};

export type LocalCheckin = {
  client_scan_id: string;
  ticket_id: string;
  scanned_at: string;
  checker_id: string;
  device_id: string;
  gate_id: string;
  lane_id: string | null;
  zone: string;
  sync_status: "PENDING_SYNC" | "SYNCED" | "CONFLICT";
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
