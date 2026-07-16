import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";
import { LocalCheckin, LocalAssignmentAudit } from "../types";

let inMemoryCheckins: LocalCheckin[] = [];
let inMemoryAudits: LocalAssignmentAudit[] = [];

function createWebMockDb() {
  return {
    execSync(sql: string) {
      // No-op for table creation
    },
    runSync(sql: string, params: any[]) {
      if (sql.includes("insert into local_checkins")) {
        const [client_scan_id, ticket_id, scanned_at, checker_id, device_id, gate_id, lane_id, zone] = params;
        const exists = inMemoryCheckins.some(c => c.ticket_id === ticket_id);
        if (!exists) {
          inMemoryCheckins.push({
            client_scan_id,
            ticket_id,
            scanned_at,
            checker_id,
            device_id,
            gate_id,
            lane_id,
            zone,
            sync_status: params[8] || "PENDING_SYNC",
            sync_message: params[9] || null
          });
        }
      } else if (sql.includes("update local_checkins set sync_status = ?, sync_message = ?")) {
        const [status, message, client_scan_id] = params;
        const item = inMemoryCheckins.find(c => c.client_scan_id === client_scan_id);
        if (item) {
          item.sync_status = status;
          item.sync_message = message;
        }
      } else if (sql.includes("update local_checkins set sync_status = ?")) {
        const [status, client_scan_id] = params;
        const item = inMemoryCheckins.find(c => c.client_scan_id === client_scan_id);
        if (item) {
          item.sync_status = status;
        }
      } else if (sql.includes("update local_checkins set sync_status = 'CONFLICT'")) {
        const [client_scan_id] = params;
        const item = inMemoryCheckins.find(c => c.client_scan_id === client_scan_id);
        if (item) {
          item.sync_status = 'CONFLICT';
        }
      } else if (sql.includes("insert into local_assignment_audits")) {
        const [id, assignment_id, device_id, action, reason, created_at, sync_status] = params;
        inMemoryAudits.push({
          id,
          assignment_id,
          device_id,
          action,
          reason,
          created_at,
          sync_status: sync_status || "PENDING_SYNC"
        });
      } else if (sql.includes("update local_assignment_audits set sync_status = ?")) {
        const [status, id] = params;
        const item = inMemoryAudits.find(a => a.id === id);
        if (item) {
          item.sync_status = status;
        }
      } else if (sql.includes("update local_assignment_audits set sync_status = 'SYNCED'")) {
        const [id] = params;
        const item = inMemoryAudits.find(a => a.id === id);
        if (item) {
          item.sync_status = "SYNCED";
        }
      }
    },
    getFirstSync<T>(sql: string, params: any[]): T | null {
      if (sql.includes("where ticket_id = ?")) {
        const [ticket_id] = params;
        return (inMemoryCheckins.find(c => c.ticket_id === ticket_id) as unknown as T) || null;
      }
      if (sql.includes("where client_scan_id = ?")) {
        const [client_scan_id] = params;
        return (inMemoryCheckins.find(c => c.client_scan_id === client_scan_id) as unknown as T) || null;
      }
      if (sql.includes("from local_assignment_audits") && sql.includes("where id = ?")) {
        const [id] = params;
        return (inMemoryAudits.find(a => a.id === id) as unknown as T) || null;
      }
      return null;
    },
    getAllSync<T>(sql: string, params: any[]): T[] {
      if (sql.includes("sync_status = 'PENDING_SYNC'")) {
        if (sql.includes("local_assignment_audits")) {
          return (inMemoryAudits
            .filter(a => a.sync_status === "PENDING_SYNC")
            .sort((a, b) => a.created_at.localeCompare(b.created_at)) as unknown as T[]);
        }
        const pending = inMemoryCheckins
          .filter(c => c.sync_status === "PENDING_SYNC")
          .sort((a, b) => a.scanned_at.localeCompare(b.scanned_at));
        return ((sql.includes("limit 250") ? pending.slice(0, 250) : pending) as unknown as T[]);
      }
      // default: select * from local_checkins order by scanned_at desc limit 50
      return ([...inMemoryCheckins]
        .sort((a, b) => b.scanned_at.localeCompare(a.scanned_at))
        .slice(0, 50) as unknown as T[]);
    }
  };
}

export const db = Platform.OS === 'web' ? createWebMockDb() : SQLite.openDatabaseSync("ticketbox-checker.db");

export function initDb() {
  db.execSync(`
    create table if not exists local_checkins (
      client_scan_id text primary key,
      ticket_id text not null unique,
      scanned_at text not null,
      checker_id text not null,
      device_id text not null,
      gate_id text not null,
      lane_id text,
      zone text not null,
      sync_status text not null,
      sync_message text
    );
  `);
  try {
    db.execSync("alter table local_checkins add column sync_message text;");
  } catch {
    // Existing installations already have the column after the first migration run.
  }
  db.execSync(`
    create table if not exists local_assignment_audits (
      id text primary key,
      assignment_id text not null,
      device_id text not null,
      action text not null,
      reason text,
      created_at text not null,
      sync_status text not null
    );
  `);
}
