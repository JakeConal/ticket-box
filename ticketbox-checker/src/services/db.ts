import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";
import { LocalCheckin } from "../types";

let inMemoryCheckins: LocalCheckin[] = [];

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
            sync_status: params[8] || "PENDING_SYNC"
          });
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
      return null;
    },
    getAllSync<T>(sql: string, params: any[]): T[] {
      if (sql.includes("sync_status = 'PENDING_SYNC'")) {
        return (inMemoryCheckins
          .filter(c => c.sync_status === "PENDING_SYNC")
          .sort((a, b) => a.scanned_at.localeCompare(b.scanned_at)) as unknown as T[]);
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
      sync_status text not null
    );
  `);
}
