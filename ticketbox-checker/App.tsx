import { StatusBar } from "expo-status-bar";
import { BarCodeScanner } from "expo-barcode-scanner";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

declare const atob: (value: string) => string;

type Tab = "scan" | "sync" | "vip";

type Assignment = {
  id: string;
  concertId: string;
  checkerId: string;
  deviceId?: string | null;
  gateId: string;
  laneId?: string | null;
  allowedZones: string[];
  state: "ACTIVE" | "STANDBY" | "INACTIVE";
};

type KeyBundle = {
  concertId: string;
  keys: { kid: string; alg: string; publicKeyPem: string }[];
};

type TicketPayload = {
  ticketId: string;
  concertId: string;
  zone: string;
};

type LocalCheckin = {
  client_scan_id: string;
  ticket_id: string;
  scanned_at: string;
  gate_id: string;
  lane_id: string | null;
  zone: string;
  sync_status: "PENDING_SYNC" | "SYNCED" | "CONFLICT";
};

const API_BASE_STORAGE_KEY = "ticketbox.apiBaseUrl";
const TOKEN_STORAGE_KEY = "ticketbox.jwt";
const CONCERT_STORAGE_KEY = "ticketbox.concertId";
const KEY_BUNDLE_STORAGE_KEY = "ticketbox.keyBundle";
const ASSIGNMENTS_STORAGE_KEY = "ticketbox.assignments";
const DEVICE_STORAGE_KEY = "ticketbox.deviceId";

const db = SQLite.openDatabaseSync("ticketbox-checker.db");

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState("http://localhost:8080");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [concertId, setConcertId] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [keyBundle, setKeyBundle] = useState<KeyBundle | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tab, setTab] = useState<Tab>("scan");
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [scanLocked, setScanLocked] = useState(false);
  const [status, setStatus] = useState("Sign in to load assignments.");
  const [pending, setPending] = useState<LocalCheckin[]>([]);
  const [vipQuery, setVipQuery] = useState("");
  const [vipGuests, setVipGuests] = useState<any[]>([]);

  const activeAssignment = useMemo(
    () => assignments.find((assignment) => assignment.state === "ACTIVE"),
    [assignments]
  );
  const standbyAssignment = useMemo(
    () => assignments.find((assignment) => assignment.state === "STANDBY"),
    [assignments]
  );

  useEffect(() => {
    initDb();
    void hydrate();
    void BarCodeScanner.requestPermissionsAsync().then(({ status }) => {
      setHasCameraPermission(status === "granted");
    });
  }, []);

  async function hydrate() {
    const storedDeviceId = await SecureStore.getItemAsync(DEVICE_STORAGE_KEY);
    const nextDeviceId = storedDeviceId ?? makeId();
    if (!storedDeviceId) {
      await SecureStore.setItemAsync(DEVICE_STORAGE_KEY, nextDeviceId);
    }
    setDeviceId(nextDeviceId);
    setApiBaseUrl((await SecureStore.getItemAsync(API_BASE_STORAGE_KEY)) ?? apiBaseUrl);
    setConcertId((await SecureStore.getItemAsync(CONCERT_STORAGE_KEY)) ?? "");
    setToken(await SecureStore.getItemAsync(TOKEN_STORAGE_KEY));
    setKeyBundle(readJson<KeyBundle>(await SecureStore.getItemAsync(KEY_BUNDLE_STORAGE_KEY)));
    setAssignments(readJson<Assignment[]>(await SecureStore.getItemAsync(ASSIGNMENTS_STORAGE_KEY)) ?? []);
    loadPending();
  }

  async function login() {
    setStatus("Signing in...");
    const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
      setStatus("Login failed.");
      return;
    }
    const body = await response.json();
    const accessToken = body.accessToken ?? body.token ?? body.jwt;
    if (!accessToken) {
      setStatus("Login response did not include an access token.");
      return;
    }
    await SecureStore.setItemAsync(API_BASE_STORAGE_KEY, apiBaseUrl);
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, accessToken);
    await SecureStore.setItemAsync(CONCERT_STORAGE_KEY, concertId);
    setToken(accessToken);
    await refreshCheckerState(accessToken);
  }

  async function refreshCheckerState(nextToken = token) {
    if (!nextToken || !concertId) {
      setStatus("Token and concert ID are required.");
      return;
    }
    const headers = { Authorization: `Bearer ${nextToken}` };
    const [bundleResponse, assignmentsResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/api/checker/key-bundle?concertId=${concertId}`, { headers }),
      fetch(`${apiBaseUrl}/api/checker/assignments?concertId=${concertId}`, { headers })
    ]);
    if (!bundleResponse.ok || !assignmentsResponse.ok) {
      setStatus("Could not refresh checker keys or assignments.");
      return;
    }
    const nextBundle = await bundleResponse.json();
    const assignmentBody = await assignmentsResponse.json();
    const nextAssignments = assignmentBody.assignments ?? [];
    await SecureStore.setItemAsync(KEY_BUNDLE_STORAGE_KEY, JSON.stringify(nextBundle));
    await SecureStore.setItemAsync(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(nextAssignments));
    setKeyBundle(nextBundle);
    setAssignments(nextAssignments);
    setStatus(`Loaded ${nextAssignments.length} assignment(s).`);
  }

  async function handleScan({ data }: { data: string }) {
    if (scanLocked) {
      return;
    }
    setScanLocked(true);
    try {
      const assignment = activeAssignment;
      if (!assignment) {
        setStatus("Scanner blocked: no cached ACTIVE assignment.");
        return;
      }
      const payload = await verifyQr(data);
      if (payload.concertId !== concertId) {
        setStatus("Rejected: ticket is for another concert.");
        return;
      }
      if (!assignment.allowedZones.map(normalize).includes(normalize(payload.zone))) {
        setStatus("Rejected: ticket zone is not allowed at this gate.");
        return;
      }
      const existing = db.getFirstSync<LocalCheckin>(
        "select * from local_checkins where ticket_id = ?",
        [payload.ticketId]
      );
      if (existing) {
        setStatus(`Duplicate local scan: ${existing.sync_status}.`);
        return;
      }
      const clientScanId = makeId();
      const scannedAt = new Date().toISOString();
      db.runSync(
        `insert into local_checkins (
          client_scan_id,
          ticket_id,
          scanned_at,
          checker_id,
          device_id,
          gate_id,
          lane_id,
          zone,
          sync_status
        ) values (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_SYNC')`,
        [
          clientScanId,
          payload.ticketId,
          scannedAt,
          assignment.checkerId,
          deviceId,
          assignment.gateId,
          assignment.laneId ?? null,
          payload.zone
        ]
      );
      setStatus("Valid ticket. Stored locally.");
      loadPending();
      await syncOne(clientScanId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Scan failed.");
    } finally {
      setTimeout(() => setScanLocked(false), 1200);
    }
  }

  async function verifyQr(tokenValue: string): Promise<TicketPayload> {
    if (!keyBundle) {
      throw new Error("No cached public key bundle.");
    }
    const [encodedHeader, encodedPayload, encodedSignature] = tokenValue.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new Error("Invalid QR token format.");
    }
    const header = JSON.parse(bytesToText(base64UrlToBytes(encodedHeader)));
    const key = keyBundle.keys.find((candidate) => candidate.kid === header.kid);
    if (!key || key.alg !== "RS256") {
      throw new Error("No matching RS256 public key.");
    }
    await verifyRs256(`${encodedHeader}.${encodedPayload}`, encodedSignature, key.publicKeyPem);
    const payload = JSON.parse(bytesToText(base64UrlToBytes(encodedPayload)));
    if (!payload.ticketId || !payload.concertId || !payload.zone) {
      throw new Error("QR token is missing ticket data.");
    }
    return payload;
  }

  async function syncOne(clientScanId: string) {
    if (!token) {
      return;
    }
    const row = db.getFirstSync<LocalCheckin>(
      "select * from local_checkins where client_scan_id = ?",
      [clientScanId]
    );
    if (!row || row.sync_status !== "PENDING_SYNC") {
      return;
    }
    try {
      const response = await fetch(`${apiBaseUrl}/api/checkins/${row.ticket_id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clientScanId: row.client_scan_id,
          deviceId,
          gateId: row.gate_id,
          laneId: row.lane_id,
          zone: row.zone,
          scannedAtDevice: row.scanned_at
        })
      });
      if (response.status === 409) {
        db.runSync("update local_checkins set sync_status = 'CONFLICT' where client_scan_id = ?", [
          clientScanId
        ]);
        setStatus("ALREADY USED. Backend reported a conflict.");
        loadPending();
        return;
      }
      if (!response.ok) {
        setStatus("Stored locally. Backend sync will retry.");
        return;
      }
      const body = await response.json();
      const nextStatus = body.result === "CONFLICT" ? "CONFLICT" : "SYNCED";
      db.runSync("update local_checkins set sync_status = ? where client_scan_id = ?", [
        nextStatus,
        clientScanId
      ]);
      setStatus(nextStatus === "SYNCED" ? "Synced check-in." : "Backend reported a conflict.");
      loadPending();
    } catch {
      setStatus("Stored locally. Offline sync pending.");
    }
  }

  async function flushQueue() {
    if (!token) {
      return;
    }
    const rows = db.getAllSync<LocalCheckin>(
      "select * from local_checkins where sync_status = 'PENDING_SYNC' order by scanned_at asc"
    );
    if (rows.length === 0) {
      setStatus("No pending scans.");
      return;
    }
    const response = await fetch(`${apiBaseUrl}/api/checkins/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        checkins: rows.map((row) => ({
          ticketId: row.ticket_id,
          clientScanId: row.client_scan_id,
          deviceId,
          gateId: row.gate_id,
          laneId: row.lane_id,
          zone: row.zone,
          scannedAtDevice: row.scanned_at
        }))
      })
    });
    if (!response.ok) {
      setStatus("Sync failed. Queue remains pending.");
      return;
    }
    const body = await response.json();
    for (const result of body.results ?? []) {
      const nextStatus = result.result === "CONFLICT" ? "CONFLICT" : "SYNCED";
      db.runSync("update local_checkins set sync_status = ? where client_scan_id = ?", [
        nextStatus,
        result.clientScanId
      ]);
    }
    loadPending();
    setStatus("Sync queue flushed.");
  }

  async function activateStandbyLocally() {
    if (!standbyAssignment) {
      setStatus("No STANDBY assignment is cached.");
      return;
    }
    const nextAssignments = assignments.map((assignment) =>
      assignment.id === standbyAssignment.id ? { ...assignment, state: "ACTIVE" as const } : assignment
    );
    await SecureStore.setItemAsync(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(nextAssignments));
    setAssignments(nextAssignments);
    setStatus("Emergency local activation recorded. Sync audit when online.");
    if (token) {
      await fetch(`${apiBaseUrl}/api/checker/assignment-audit`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          assignmentId: standbyAssignment.id,
          deviceId,
          action: "EMERGENCY_LOCAL_ACTIVATED",
          reason: "Local standby activation"
        })
      }).catch(() => undefined);
    }
  }

  async function searchVip() {
    if (!token || vipQuery.trim().length < 2) {
      setVipGuests([]);
      setStatus("VIP lookup requires network and at least 2 characters.");
      return;
    }
    const response = await fetch(
      `${apiBaseUrl}/api/vip-guests?concertId=${concertId}&q=${encodeURIComponent(vipQuery)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      setStatus("VIP lookup failed or offline.");
      return;
    }
    const guests = await response.json();
    setVipGuests(guests);
    setStatus(guests.length === 0 ? "No VIP guest found." : `Found ${guests.length} VIP guest(s).`);
  }

  async function enterVip(guestId: string) {
    if (!token) {
      return;
    }
    const response = await fetch(`${apiBaseUrl}/api/vip-guests/${guestId}/enter`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 409) {
      setStatus("ALREADY ADMITTED - Entered previously.");
      await searchVip();
      return;
    }
    if (response.status === 404) {
      setStatus("NOT ON GUEST LIST - Contact organizer.");
      return;
    }
    if (!response.ok) {
      setStatus("VIP entry failed.");
      return;
    }
    const result = await response.json();
    Alert.alert("VIP", result.message);
    await searchVip();
  }

  function loadPending() {
    setPending(
      db.getAllSync<LocalCheckin>(
        "select * from local_checkins order by scanned_at desc limit 50"
      )
    );
  }

  const signedIn = Boolean(token);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>TicketBox Checker</Text>
        <Text style={styles.status}>{status}</Text>
      </View>

      {!signedIn ? (
        <View style={styles.panel}>
          <TextInput style={styles.input} value={apiBaseUrl} onChangeText={setApiBaseUrl} placeholder="API base URL" />
          <TextInput style={styles.input} value={concertId} onChangeText={setConcertId} placeholder="Concert ID" />
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Checker email" autoCapitalize="none" />
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
          <Pressable style={styles.primaryButton} onPress={login}>
            <Text style={styles.primaryButtonText}>Sign in and cache assignment</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.tabs}>
            {(["scan", "sync", "vip"] as Tab[]).map((item) => (
              <Pressable
                key={item}
                style={[styles.tab, tab === item && styles.activeTab]}
                onPress={() => setTab(item)}
              >
                <Text style={[styles.tabText, tab === item && styles.activeTabText]}>{item.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>

          {tab === "scan" && (
            <View style={styles.panel}>
              <Text style={styles.assignment}>
                {activeAssignment
                  ? `${activeAssignment.gateId}${activeAssignment.laneId ? ` / ${activeAssignment.laneId}` : ""} - ${activeAssignment.allowedZones.join(", ")}`
                  : "No ACTIVE assignment cached"}
              </Text>
              {hasCameraPermission ? (
                <BarCodeScanner
                  onBarCodeScanned={handleScan}
                  barCodeTypes={[BarCodeScanner.Constants.BarCodeType.qr]}
                  style={styles.scanner}
                />
              ) : (
                <Text style={styles.status}>Camera permission is required for QR scanning.</Text>
              )}
              <View style={styles.row}>
                <Pressable style={styles.secondaryButton} onPress={() => refreshCheckerState()}>
                  <Text style={styles.secondaryButtonText}>Refresh online</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={activateStandbyLocally}>
                  <Text style={styles.secondaryButtonText}>Emergency activate</Text>
                </Pressable>
              </View>
            </View>
          )}

          {tab === "sync" && (
            <View style={styles.panel}>
              <Pressable style={styles.primaryButton} onPress={flushQueue}>
                <Text style={styles.primaryButtonText}>Flush pending sync</Text>
              </Pressable>
              <FlatList
                data={pending}
                keyExtractor={(item) => item.client_scan_id}
                renderItem={({ item }) => (
                  <View style={styles.listItem}>
                    <Text style={styles.listTitle}>{item.ticket_id}</Text>
                    <Text style={styles.listMeta}>{item.zone} - {item.sync_status}</Text>
                  </View>
                )}
              />
            </View>
          )}

          {tab === "vip" && (
            <View style={styles.panel}>
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.flex]} value={vipQuery} onChangeText={setVipQuery} placeholder="VIP name or phone" />
                <Pressable style={styles.secondaryButton} onPress={searchVip}>
                  <Text style={styles.secondaryButtonText}>Search</Text>
                </Pressable>
              </View>
              <FlatList
                data={vipGuests}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.listItem}>
                    <Text style={styles.listTitle}>{item.name}</Text>
                    <Text style={styles.listMeta}>{item.zone} - {item.entered ? "Already admitted" : item.phoneMasked}</Text>
                    <Pressable
                      disabled={item.entered}
                      style={[styles.smallButton, item.entered && styles.disabledButton]}
                      onPress={() => enterVip(item.id)}
                    >
                      <Text style={styles.smallButtonText}>{item.entered ? "Admitted" : "Mark entered"}</Text>
                    </Pressable>
                  </View>
                )}
              />
            </View>
          )}
        </>
      )}
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

function initDb() {
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

async function verifyRs256(signingInput: string, encodedSignature: string, publicKeyPem: string) {
  const subtle = (globalThis as any).crypto?.subtle;
  if (!subtle) {
    throw new Error("Device crypto API is unavailable for QR verification.");
  }
  const key = await subtle.importKey(
    "spki",
    pemToArrayBuffer(publicKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(encodedSignature),
    textToBytes(signingInput)
  );
  if (!valid) {
    throw new Error("QR signature verification failed.");
  }
}

function pemToArrayBuffer(pem: string) {
  return base64ToBytes(
    pem
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replace(/\s/g, "")
  );
}

function base64UrlToBytes(value: string) {
  return base64ToBytes(value.replace(/-/g, "+").replace(/_/g, "/"));
}

function base64ToBytes(value: string) {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToText(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

function textToBytes(value: string) {
  return new TextEncoder().encode(value);
}

function readJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function makeId() {
  const random = (globalThis as any).crypto?.randomUUID?.();
  if (random) {
    return random;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function normalize(value: string) {
  return value.trim().toUpperCase();
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8fafc",
    padding: 16
  },
  header: {
    gap: 8,
    paddingVertical: 12
  },
  title: {
    color: "#020617",
    fontSize: 28,
    fontWeight: "700"
  },
  status: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20
  },
  panel: {
    gap: 12,
    flex: 1
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f172a",
    minHeight: 46,
    paddingHorizontal: 12
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#047857",
    borderRadius: 8,
    padding: 14
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#e2e8f0",
    borderRadius: 8,
    padding: 12
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontWeight: "700"
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  flex: {
    flex: 1
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12
  },
  tab: {
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 10
  },
  activeTab: {
    backgroundColor: "#0f172a"
  },
  tabText: {
    color: "#334155",
    fontWeight: "700",
    textAlign: "center"
  },
  activeTabText: {
    color: "#ffffff"
  },
  assignment: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700"
  },
  scanner: {
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden"
  },
  listItem: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    marginBottom: 8,
    padding: 12
  },
  listTitle: {
    color: "#0f172a",
    fontWeight: "700"
  },
  listMeta: {
    color: "#475569"
  },
  smallButton: {
    alignSelf: "flex-start",
    backgroundColor: "#047857",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  disabledButton: {
    backgroundColor: "#94a3b8"
  },
  smallButtonText: {
    color: "#ffffff",
    fontWeight: "700"
  }
});
