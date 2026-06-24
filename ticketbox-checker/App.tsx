import { StatusBar } from "expo-status-bar";
import { Camera } from "expo-camera";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View
} from "react-native";
import { Tab, Assignment, KeyBundle, TicketPayload, LocalCheckin } from "./src/types";
import {
  SecureStore,
  readJson,
  API_BASE_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  CONCERT_STORAGE_KEY,
  KEY_BUNDLE_STORAGE_KEY,
  ASSIGNMENTS_STORAGE_KEY,
  DEVICE_STORAGE_KEY
} from "./src/services/storage";
import { db, initDb } from "./src/services/db";
import { verifyRs256, makeId, normalize, bytesToText, base64UrlToBytes } from "./src/utils/crypto";
import styles from "./src/styles";
import { StatusBanner, TabBar } from "./src/components/UI";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ScanTab } from "./src/screens/ScanTab";
import { SyncTab } from "./src/screens/SyncTab";
import { VipTab } from "./src/screens/VipTab";

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState("http://localhost:8088");
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
  const [mockScanToken, setMockScanToken] = useState("");

  const getCleanUrl = () => {
    let url = apiBaseUrl.trim();
    if (url.endsWith("/")) {
      url = url.slice(0, -1);
    }
    return url;
  };

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
    if (Platform.OS !== 'web') {
      void Camera.requestCameraPermissionsAsync().then(({ status }) => {
        setHasCameraPermission(status === "granted");
      });
    }
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
    try {
      const response = await fetch(`${getCleanUrl()}/api/auth/login`, {
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
      await SecureStore.setItemAsync(API_BASE_STORAGE_KEY, getCleanUrl());
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, accessToken);
      await SecureStore.setItemAsync(CONCERT_STORAGE_KEY, concertId);
      setToken(accessToken);
      await refreshCheckerState(accessToken);
    } catch (error) {
      console.error(error);
      setStatus(`Network/Login error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function logout() {
    await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
    await SecureStore.deleteItemAsync(ASSIGNMENTS_STORAGE_KEY);
    await SecureStore.deleteItemAsync(KEY_BUNDLE_STORAGE_KEY);
    setToken(null);
    setAssignments([]);
    setKeyBundle(null);
    setStatus("Sign in to load assignments.");
  }

  async function refreshCheckerState(nextToken = token) {
    if (!nextToken || !concertId) {
      setStatus("Token and concert ID are required.");
      return;
    }
    const headers = { Authorization: `Bearer ${nextToken}` };
    try {
      const [bundleResponse, assignmentsResponse] = await Promise.all([
        fetch(`${getCleanUrl()}/api/checker/key-bundle?concertId=${concertId}`, { headers }),
        fetch(`${getCleanUrl()}/api/checker/assignments?concertId=${concertId}`, { headers })
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
    } catch (error) {
      console.error(error);
      setStatus(`Refresh error: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    const alg = key?.algorithm ?? key?.alg;
    if (!key || alg !== "RS256") {
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
      const response = await fetch(`${getCleanUrl()}/api/checkins/${row.ticket_id}`, {
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

    // Flush pending audits first
    const audits = db.getAllSync<any>(
      "select * from local_assignment_audits where sync_status = 'PENDING_SYNC' order by created_at asc",
      []
    );
    for (const audit of audits) {
      try {
        const response = await fetch(`${getCleanUrl()}/api/checker/assignment-audit`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            assignmentId: audit.assignment_id,
            deviceId: audit.device_id,
            action: audit.action,
            reason: audit.reason
          })
        });
        if (response.ok) {
          db.runSync("update local_assignment_audits set sync_status = 'SYNCED' where id = ?", [
            audit.id
          ]);
        }
      } catch {
        // Network is still down, pause audit sync
        break;
      }
    }

    const rows = db.getAllSync<LocalCheckin>(
      "select * from local_checkins where sync_status = 'PENDING_SYNC' order by scanned_at asc",
      []
    );
    if (rows.length === 0) {
      setStatus("No pending scans.");
      return;
    }
    const response = await fetch(`${getCleanUrl()}/api/checkins/batch`, {
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
      let errText = "";
      try {
        errText = await response.text();
      } catch {}
      setStatus(`Sync failed (${response.status}): ${errText || "Queue remains pending."}`);
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

  async function syncOneAudit(auditId: string) {
    if (!token) {
      return;
    }
    const row = db.getFirstSync<any>(
      "select * from local_assignment_audits where id = ?",
      [auditId]
    );
    if (!row || row.sync_status !== "PENDING_SYNC") {
      return;
    }
    try {
      const response = await fetch(`${getCleanUrl()}/api/checker/assignment-audit`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          assignmentId: row.assignment_id,
          deviceId: row.device_id,
          action: row.action,
          reason: row.reason
        })
      });
      if (response.ok) {
        db.runSync("update local_assignment_audits set sync_status = 'SYNCED' where id = ?", [
          auditId
        ]);
        setStatus("Emergency audit logged on server.");
      }
    } catch {
      // Offline, will retry when flushing
    }
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

    const auditId = makeId();
    const createdAt = new Date().toISOString();
    db.runSync(
      `insert into local_assignment_audits (
        id,
        assignment_id,
        device_id,
        action,
        reason,
        created_at,
        sync_status
      ) values (?, ?, ?, ?, ?, ?, 'PENDING_SYNC')`,
      [
        auditId,
        standbyAssignment.id,
        deviceId,
        "EMERGENCY_LOCAL_ACTIVATED",
        "Local standby activation",
        createdAt
      ]
    );

    await syncOneAudit(auditId);
  }

  async function searchVip() {
    if (!token || vipQuery.trim().length < 2) {
      setVipGuests([]);
      setStatus("VIP lookup requires network and at least 2 characters.");
      return;
    }
    const response = await fetch(
      `${getCleanUrl()}/api/vip-guests?concertId=${concertId}&q=${encodeURIComponent(vipQuery)}`,
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
    const response = await fetch(`${getCleanUrl()}/api/vip-guests/${guestId}/enter`, {
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
        "select * from local_checkins order by scanned_at desc limit 50",
        []
      )
    );
  }

  const signedIn = Boolean(token);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={[styles.container, { flex: 0, minHeight: '100%' }]}>
          <View style={styles.header}>
            <Text style={styles.title}>TICKETBOX CHECKER</Text>
            {signedIn ? (
              <Pressable style={styles.logoutButton} onPress={logout}>
                <Text style={styles.logoutButtonText}>LOGOUT</Text>
              </Pressable>
            ) : null}
          </View>

          <StatusBanner status={status} onClose={() => setStatus("")} />

          {!signedIn ? (
            <LoginScreen
              apiBaseUrl={apiBaseUrl}
              setApiBaseUrl={setApiBaseUrl}
              concertId={concertId}
              setConcertId={setConcertId}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              onLogin={login}
            />
          ) : (
            <>
              <TabBar activeTab={tab} onTabSelect={setTab} />

              {tab === "scan" && (
                <ScanTab
                  activeAssignment={activeAssignment}
                  mockScanToken={mockScanToken}
                  setMockScanToken={setMockScanToken}
                  onScan={handleScan}
                  hasCameraPermission={hasCameraPermission}
                  onRefresh={() => refreshCheckerState()}
                  onEmergencyActivate={activateStandbyLocally}
                />
              )}

              {tab === "sync" && (
                <SyncTab
                  pending={pending}
                  onFlush={flushQueue}
                />
              )}

              {tab === "vip" && (
                <VipTab
                  vipQuery={vipQuery}
                  setVipQuery={setVipQuery}
                  onSearch={searchVip}
                  vipGuests={vipGuests}
                  onEnter={enterVip}
                />
              )}
            </>
          )}
        </View>
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
