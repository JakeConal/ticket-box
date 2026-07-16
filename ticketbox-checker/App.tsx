import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Camera } from "expo-camera";
import NetInfo from "@react-native-community/netinfo";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View
} from "react-native";
import { LogOut } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
  AppNotice,
  Assignment,
  ConcertOption,
  KeyBundle,
  LocalCheckin,
  LocalCheckinStatus,
  NoticeTone,
  Tab,
  TicketPayload,
  VipGuest
} from "./src/types";
import {
  ASSIGNMENTS_STORAGE_KEY,
  CONCERT_STORAGE_KEY,
  DEVICE_STORAGE_KEY,
  KEY_BUNDLE_STORAGE_KEY,
  readJson,
  REFRESH_TOKEN_STORAGE_KEY,
  SecureStore,
  TOKEN_STORAGE_KEY
} from "./src/services/storage";
import { db, initDb } from "./src/services/db";
import { parseConcertOptions } from "./src/services/concerts";
import {
  type CheckinApiResult,
  type CheckinSyncOutcome,
  duplicateScanMessage,
  friendlyScanError,
  mapCheckinResponse,
  pendingSyncOutcome
} from "./src/services/checkins";
import { base64UrlToBytes, bytesToText, makeId, normalize, verifyRs256 } from "./src/utils/crypto";
import { isCanonicalUuid } from "./src/utils/validation";
import styles from "./src/styles";
import { ConnectionPill, StatusBanner, TabBar } from "./src/components/UI";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ScanTab, type ScanFeedbackResult } from "./src/screens/ScanTab";
import { SyncTab } from "./src/screens/SyncTab";
import { VipTab } from "./src/screens/VipTab";

const CONFIGURED_API_BASE_URL = resolveConfiguredApiBaseUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL ?? ""
);

export default function App() {
  const apiBaseUrl = CONFIGURED_API_BASE_URL;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [concertId, setConcertId] = useState("");
  const [concerts, setConcerts] = useState<ConcertOption[]>([]);
  const [concertsError, setConcertsError] = useState<string | null>(null);
  const [isConcertsLoading, setIsConcertsLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [keyBundle, setKeyBundle] = useState<KeyBundle | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tab, setTab] = useState<Tab>("scan");
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [canAskCameraPermission, setCanAskCameraPermission] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const [checkins, setCheckins] = useState<LocalCheckin[]>([]);
  const [vipQuery, setVipQuery] = useState("");
  const [vipGuests, setVipGuests] = useState<VipGuest[]>([]);
  const [vipError, setVipError] = useState<string | null>(null);
  const [mockScanToken, setMockScanToken] = useState("");
  const [isHydrating, setIsHydrating] = useState(true);
  const [isLoginBusy, setIsLoginBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isVipLoading, setIsVipLoading] = useState(false);
  const [enteringGuestId, setEnteringGuestId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  const tokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);
  const refreshPromiseRef = useRef<Promise<string> | null>(null);
  const refreshingStateRef = useRef(false);
  const scanLockedRef = useRef(false);
  const syncingRef = useRef(false);
  const isAutoSyncingRef = useRef(false);
  const vipRequestIdRef = useRef(0);
  const noticeIdRef = useRef(0);
  const previousOnlineRef = useRef<boolean | null>(null);
  const cameraPermissionCheckedRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loginBusyRef = useRef(false);
  const concertsLoadingRef = useRef(false);
  const enteringGuestRef = useRef<string | null>(null);

  const signedIn = Boolean(token || refreshToken);
  const deviceAssignments = useMemo(
    () => {
      const concertAssignments = assignments.filter((assignment) => assignment.concertId === concertId.trim());
      const exactDeviceAssignments = concertAssignments.filter((assignment) => (
        !assignment.deviceId || assignment.deviceId === deviceId
      ));
      return exactDeviceAssignments.length > 0 ? exactDeviceAssignments : concertAssignments;
    },
    [assignments, concertId, deviceId]
  );
  const activeAssignment = useMemo(
    () => deviceAssignments.find((assignment) => assignment.state === "ACTIVE"),
    [deviceAssignments]
  );
  const standbyAssignment = useMemo(
    () => deviceAssignments.find((assignment) => assignment.state === "STANDBY"),
    [deviceAssignments]
  );
  const pendingCount = useMemo(
    () => checkins.filter((item) => item.sync_status === "PENDING_SYNC").length,
    [checkins]
  );

  const showNotice = useCallback((message: string, tone: NoticeTone = "info") => {
    noticeIdRef.current += 1;
    setNotice({ id: noticeIdRef.current, message, tone });
  }, []);

  useEffect(() => {
    if (!notice || (notice.tone !== "info" && notice.tone !== "success")) {
      return;
    }
    const timer = setTimeout(() => {
      setNotice((current) => current?.id === notice.id ? null : current);
    }, notice.tone === "success" ? 3600 : 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    void hydrate();
    const unsubscribe = NetInfo.addEventListener((networkState) => {
      setIsOnline(networkState.isConnected === true && networkState.isInternetReachable !== false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isHydrating || signedIn) {
      return;
    }
    void loadConcerts();
  }, [isHydrating, signedIn]);

  useEffect(() => () => {
    if (autoRetryTimerRef.current) {
      clearTimeout(autoRetryTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" || !signedIn) {
        return;
      }
      void Camera.getCameraPermissionsAsync().then(({ status, canAskAgain }) => {
        setHasCameraPermission(status === "granted");
        setCanAskCameraPermission(canAskAgain);
      });
    });
    return () => subscription.remove();
  }, [signedIn]);

  useEffect(() => {
    if (isOnline === null) {
      return;
    }
    const previous = previousOnlineRef.current;
    previousOnlineRef.current = isOnline;

    if (!signedIn || !deviceId || !concertId) {
      return;
    }
    if (isOnline && previous === false) {
      showNotice("Connection restored. Syncing queued check-ins and refreshing checker data.", "info");
      void autoSyncPending(true);
    } else if (isOnline && previous === null) {
      void autoSyncPending(false);
    } else if (!isOnline && previous === true) {
      showNotice("You are offline. Valid scans will be saved on this device and synced automatically later.", "warning");
    }
  }, [concertId, deviceId, isOnline, showNotice, signedIn]);

  useEffect(() => {
    if (
      Platform.OS === "web"
      || !signedIn
      || tab !== "scan"
      || cameraPermissionCheckedRef.current
    ) {
      return;
    }
    cameraPermissionCheckedRef.current = true;
    void Camera.getCameraPermissionsAsync().then(async ({ status, canAskAgain }) => {
      setCanAskCameraPermission(canAskAgain);
      if (status === "granted") {
        setHasCameraPermission(true);
        return;
      }
      if (status === "undetermined" || canAskAgain) {
        await requestCameraPermission();
        return;
      }
      setHasCameraPermission(false);
    });
  }, [signedIn, tab]);

  async function hydrate() {
    try {
      initDb();
      const [
        storedDeviceId,
        storedConcertId,
        storedToken,
        storedRefreshToken,
        storedKeyBundle,
        storedAssignments
      ] = await Promise.all([
        SecureStore.getItemAsync(DEVICE_STORAGE_KEY),
        SecureStore.getItemAsync(CONCERT_STORAGE_KEY),
        SecureStore.getItemAsync(TOKEN_STORAGE_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_STORAGE_KEY),
        SecureStore.getItemAsync(KEY_BUNDLE_STORAGE_KEY),
        SecureStore.getItemAsync(ASSIGNMENTS_STORAGE_KEY)
      ]);

      const nextDeviceId = storedDeviceId ?? makeId();
      if (!storedDeviceId) {
        await SecureStore.setItemAsync(DEVICE_STORAGE_KEY, nextDeviceId);
      }
      const cachedAssignments = readJson<Assignment[]>(storedAssignments) ?? [];
      setDeviceId(nextDeviceId);
      setConcertId(storedConcertId ?? "");
      tokenRef.current = storedToken;
      refreshTokenRef.current = storedRefreshToken;
      setToken(storedToken);
      setRefreshToken(storedRefreshToken);
      setKeyBundle(readJson<KeyBundle>(storedKeyBundle));
      setAssignments(cachedAssignments);
      loadCheckins();

      if (storedToken || storedRefreshToken) {
        showNotice(
          cachedAssignments.some((assignment) => assignment.state === "ACTIVE")
            ? "Cached checker session restored. Offline scanning is ready."
            : "Session restored, but no active assignment is cached. Refresh checker data while online.",
          cachedAssignments.some((assignment) => assignment.state === "ACTIVE") ? "success" : "warning"
        );
      }
    } catch (error) {
      console.error("Checker hydration failed", error);
      showNotice("Local checker data could not be loaded. Restart the app and try again.", "error");
    } finally {
      setIsHydrating(false);
    }
  }

  async function requestCameraPermission() {
    try {
      const current = await Camera.getCameraPermissionsAsync();
      if (current.status === "granted") {
        setHasCameraPermission(true);
        setCanAskCameraPermission(current.canAskAgain);
        return;
      }
      if (!current.canAskAgain) {
        setHasCameraPermission(false);
        setCanAskCameraPermission(false);
        await Linking.openSettings();
        return;
      }
      const { status, canAskAgain } = await Camera.requestCameraPermissionsAsync();
      const granted = status === "granted";
      setHasCameraPermission(granted);
      setCanAskCameraPermission(canAskAgain);
      if (!granted) {
        showNotice("Camera access is off. Enable it in device settings or use manual JWT entry.", "warning");
      }
    } catch {
      setHasCameraPermission(false);
      showNotice("Camera permission could not be requested. Use manual JWT entry for now.", "error");
    }
  }

  async function loadConcerts() {
    if (concertsLoadingRef.current) {
      return;
    }
    const cleanBaseUrl = cleanUrl(apiBaseUrl);
    if (!/^https?:\/\//i.test(cleanBaseUrl)) {
      setConcertsError("Checker server is not configured. Set EXPO_PUBLIC_API_BASE_URL and restart Expo.");
      return;
    }

    concertsLoadingRef.current = true;
    setIsConcertsLoading(true);
    setConcertsError(null);
    try {
      const response = await fetchWithTimeout(`${cleanBaseUrl}/api/concerts?page=0&size=100`, {}, 8000);
      if (!response.ok) {
        throw new Error(`Concert request failed with HTTP ${response.status}.`);
      }
      const payload = await readJsonResponse<unknown>(response);
      const nextConcerts = parseConcertOptions(payload);
      setConcerts(nextConcerts);
      setConcertId((currentConcertId) => {
        if (nextConcerts.some((concert) => concert.id === currentConcertId)) {
          return currentConcertId;
        }
        return nextConcerts.length === 1 ? nextConcerts[0].id : "";
      });
    } catch (error) {
      console.error("Concert list loading failed", error);
      setConcertsError(
        isAbortError(error)
          ? "The event list timed out. Check the server and try again."
          : "Events could not be loaded from the configured server."
      );
    } finally {
      concertsLoadingRef.current = false;
      setIsConcertsLoading(false);
    }
  }

  async function login() {
    if (loginBusyRef.current) {
      return;
    }
    const cleanBaseUrl = cleanUrl(apiBaseUrl);
    const cleanConcertId = concertId.trim();
    if (!/^https?:\/\//i.test(cleanBaseUrl)) {
      showNotice("Checker server is not configured. Set EXPO_PUBLIC_API_BASE_URL and restart Expo.", "error");
      return;
    }
    if (!isCanonicalUuid(cleanConcertId)) {
      showNotice("Select an event before signing in.", "error");
      return;
    }
    if (!email.trim() || !password) {
      showNotice("Enter the checker email and password.", "error");
      return;
    }

    loginBusyRef.current = true;
    setIsLoginBusy(true);
    showNotice("Signing in and preparing offline checker data...", "info");
    try {
      const response = await fetchWithTimeout(`${cleanBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password })
      }, 8000);
      if (!response.ok) {
        const detail = await readResponseMessage(response);
        showNotice(detail || "Sign in failed. Check the checker email and password.", "error");
        return;
      }

      const body = await response.json();
      const accessToken = await persistAuthSession(body);
      if (!accessToken) {
        showNotice("The server did not return a valid checker session.", "error");
        return;
      }

      setConcertId(cleanConcertId);
      setPassword("");
      await SecureStore.setItemAsync(CONCERT_STORAGE_KEY, cleanConcertId);
      await refreshCheckerState(accessToken, {
        baseUrlOverride: cleanBaseUrl,
        concertOverride: cleanConcertId
      });
    } catch (error) {
      console.error("Checker login failed", error);
      showNotice(
        isAbortError(error)
          ? "Sign in timed out. Check the configured server and try again."
          : "The checker could not reach the configured server. Check the network connection.",
        "error"
      );
    } finally {
      loginBusyRef.current = false;
      setIsLoginBusy(false);
    }
  }

  async function persistAuthSession(body: any) {
    const accessToken = body.accessToken ?? body.token ?? body.jwt;
    const nextRefreshToken = body.refreshToken ?? refreshTokenRef.current;
    if (!accessToken) {
      return null;
    }

    tokenRef.current = accessToken;
    refreshTokenRef.current = nextRefreshToken ?? null;
    setToken(accessToken);
    setRefreshToken(nextRefreshToken ?? null);
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, accessToken);
    if (nextRefreshToken) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, nextRefreshToken);
    }
    return accessToken as string;
  }

  function confirmLogout() {
    if (pendingCount > 0) {
      Alert.alert(
        "Sync before signing out",
        `${pendingCount} check-in${pendingCount === 1 ? " is" : "s are"} still stored only on this device. Sync the queue before switching checker accounts.`,
        [
          { text: "Cancel", style: "cancel" },
          ...(isOnline === false
            ? []
            : [{ text: "Sync now", onPress: () => void flushQueue() }])
        ]
      );
      return;
    }
    Alert.alert(
      "Sign out of checker?",
      "Cached assignments and QR keys will be removed. Local check-in history will remain on this device.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => void logout() }
      ]
    );
  }

  async function logout() {
    await clearSessionData();
    showNotice("Signed out. Local check-in history remains on this device.", "info");
  }

  async function clearSessionData() {
    sessionGenerationRef.current += 1;
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY),
      SecureStore.deleteItemAsync(ASSIGNMENTS_STORAGE_KEY),
      SecureStore.deleteItemAsync(KEY_BUNDLE_STORAGE_KEY)
    ]);
    tokenRef.current = null;
    refreshTokenRef.current = null;
    refreshPromiseRef.current = null;
    setToken(null);
    setRefreshToken(null);
    setAssignments([]);
    setKeyBundle(null);
    setVipGuests([]);
    setVipError(null);
    setTab("scan");
  }

  async function refreshAccessToken(): Promise<string> {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const refreshGeneration = sessionGenerationRef.current;
    const refreshPromise = (async () => {
      const currentRefreshToken = refreshTokenRef.current;
      if (!currentRefreshToken) {
        throw new Error("Session expired. Please sign in again.");
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let response: Response;
      try {
        response = await fetch(`${cleanUrl(apiBaseUrl)}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ refreshToken: currentRefreshToken })
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        throw new Error("Session expired. Please sign in again.");
      }
      if (refreshGeneration !== sessionGenerationRef.current) {
        throw new Error("Session changed while refreshing.");
      }
      const nextAccessToken = await persistAuthSession(await response.json());
      if (!nextAccessToken) {
        throw new Error("Session expired. Please sign in again.");
      }
      return nextAccessToken;
    })();

    refreshPromiseRef.current = refreshPromise;
    try {
      return await refreshPromise;
    } finally {
      refreshPromiseRef.current = null;
    }
  }

  async function authenticatedFetch(
    url: string,
    init: RequestInit = {},
    preferredToken?: string | null
  ) {
    const accessToken = preferredToken
      ?? tokenRef.current
      ?? await waitForPromiseWithSignal(refreshAccessToken(), init.signal);
    const response = await fetchWithToken(url, init, accessToken);
    if (response.status !== 401) {
      return response;
    }
    const nextAccessToken = await waitForPromiseWithSignal(refreshAccessToken(), init.signal);
    return fetchWithToken(url, init, nextAccessToken);
  }

  function fetchWithToken(url: string, init: RequestInit, accessToken: string | null) {
    if (!accessToken) {
      throw new Error("Session expired. Please sign in again.");
    }
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(url, { ...init, headers });
  }

  async function authenticatedFetchWithTimeout(
    url: string,
    init: RequestInit = {},
    timeoutMs = 8000,
    preferredToken?: string | null
  ) {
    const { controller, dispose } = linkedAbortController(init.signal ?? undefined, timeoutMs);
    try {
      return await authenticatedFetch(url, { ...init, signal: controller.signal }, preferredToken);
    } finally {
      dispose();
    }
  }

  async function refreshCheckerState(
    nextToken = tokenRef.current,
    options: { silent?: boolean; concertOverride?: string; baseUrlOverride?: string } = {}
  ) {
    if (refreshingStateRef.current) {
      return;
    }
    const targetConcertId = options.concertOverride ?? concertId.trim();
    if (!targetConcertId) {
      if (!options.silent) {
        showNotice("Concert ID is required before checker data can be refreshed.", "error");
      }
      return;
    }
    if (!nextToken && !refreshTokenRef.current) {
      if (!options.silent) {
        showNotice("Online session expired. Sign in again to refresh checker data.", "warning");
      }
      return;
    }

    refreshingStateRef.current = true;
    setIsRefreshing(true);
    try {
      const baseUrl = cleanUrl(options.baseUrlOverride ?? apiBaseUrl);
      const [bundleResponse, assignmentsResponse] = await Promise.all([
        authenticatedFetchWithTimeout(
          `${baseUrl}/api/checker/key-bundle?concertId=${targetConcertId}`,
          {},
          8000,
          nextToken
        ),
        authenticatedFetchWithTimeout(
          `${baseUrl}/api/checker/assignments?concertId=${targetConcertId}`,
          {},
          8000,
          nextToken
        )
      ]);
      if (!bundleResponse.ok || !assignmentsResponse.ok) {
        const failedResponse = !bundleResponse.ok ? bundleResponse : assignmentsResponse;
        if (failedResponse.status === 403) {
          await clearSessionData();
          showNotice("Access denied. Ticketbox Checker is only available to authorized checker staff.", "error");
          return;
        }
        const detail = await readResponseMessage(failedResponse);
        throw new Error(detail || "Checker keys or assignments could not be refreshed.");
      }

      const nextBundle = await bundleResponse.json() as KeyBundle;
      const assignmentBody = await assignmentsResponse.json();
      const nextAssignments = (assignmentBody.assignments ?? []) as Assignment[];
      await Promise.all([
        SecureStore.setItemAsync(KEY_BUNDLE_STORAGE_KEY, JSON.stringify(nextBundle)),
        SecureStore.setItemAsync(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(nextAssignments))
      ]);
      setKeyBundle(nextBundle);
      setAssignments(nextAssignments);

      if (!options.silent) {
        const hasActive = nextAssignments.some((assignment) => assignment.state === "ACTIVE");
        showNotice(
          hasActive
            ? `Checker ready. ${nextAssignments.length} assignment${nextAssignments.length === 1 ? "" : "s"} cached for offline use.`
            : "Checker data refreshed, but there is no active gate assignment.",
          hasActive ? "success" : "warning"
        );
      }
    } catch (error) {
      console.error("Checker state refresh failed", error);
      if (!options.silent) {
        showNotice(
          isAbortError(error)
            ? "Checker data refresh timed out. Your cached offline data is unchanged."
            : friendlyScanError(error),
          "error"
        );
      }
    } finally {
      refreshingStateRef.current = false;
      setIsRefreshing(false);
    }
  }

  async function handleScan({ data }: { data: string }, signal?: AbortSignal): Promise<ScanFeedbackResult> {
    if (scanLockedRef.current) {
      return {
        tone: "error",
        title: "Scanner busy",
        subtitle: "Wait for the current result before scanning another ticket."
      };
    }

    scanLockedRef.current = true;
    try {
      const assignment = activeAssignment;
      if (!assignment) {
        return {
          tone: "error",
          title: "Scanner unavailable",
          subtitle: "No active gate assignment is cached."
        };
      }

      const qrToken = data.replace(/\s/g, "");
      let payload: TicketPayload;
      try {
        payload = await verifyQr(qrToken);
      } catch (error) {
        if (!isSignatureVerificationError(error)) {
          throw error;
        }
        if (isOnline === false) {
          throw new Error("Signature verification failed with cached QR keys.");
        }

        console.warn("QR signature failed before key refresh", qrDebugInfo(qrToken, keyBundle));
        const refreshedBundle = await refreshKeyBundle(signal);
        try {
          payload = await verifyQr(qrToken, refreshedBundle);
        } catch (retryError) {
          if (isSignatureVerificationError(retryError)) {
            console.warn("QR signature failed after key refresh", qrDebugInfo(qrToken, refreshedBundle));
          }
          throw retryError;
        }
      }

      if (payload.concertId !== concertId.trim()) {
        return {
          tone: "error",
          title: "Wrong concert",
          subtitle: "This ticket belongs to a different concert."
        };
      }
      if (!assignment.allowedZones.map(normalize).includes(normalize(payload.zone))) {
        return {
          tone: "error",
          title: "Wrong gate",
          subtitle: `Zone ${payload.zone} is not accepted at Gate ${assignment.gateId}.`
        };
      }

      const existing = db.getFirstSync<LocalCheckin>(
        "select * from local_checkins where ticket_id = ?",
        [payload.ticketId]
      );
      if (existing) {
        return {
          tone: "error",
          title: "Already used",
          subtitle: duplicateScanMessage(existing.sync_status, existing.scanned_at)
        };
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
          sync_status,
          sync_message
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          clientScanId,
          payload.ticketId,
          scannedAt,
          assignment.checkerId,
          deviceId,
          assignment.gateId,
          assignment.laneId ?? null,
          payload.zone,
          "PENDING_SYNC",
          "Waiting for sync."
        ]
      );
      loadCheckins();

      const outcome = await syncOne(clientScanId, signal);
      if (outcome.kind === "conflict") {
        return { tone: "error", title: "Already checked in", subtitle: outcome.message };
      }
      if (outcome.kind === "rejected") {
        return { tone: "error", title: "Ticket rejected", subtitle: outcome.message };
      }
      if (outcome.kind === "pending") {
        return {
          tone: "success",
          title: isOnline === false ? "Saved offline" : "Saved for sync",
          subtitle: outcome.message
        };
      }
      return {
        tone: "success",
        title: "Check-in complete",
        subtitle: `Accepted at Gate ${assignment.gateId}.`
      };
    } catch (error) {
      return {
        tone: "error",
        title: "Scan failed",
        subtitle: friendlyScanError(error)
      };
    } finally {
      scanLockedRef.current = false;
    }
  }

  async function refreshKeyBundle(parentSignal?: AbortSignal): Promise<KeyBundle> {
    if (!concertId.trim()) {
      throw new Error("Concert ID is required to refresh QR keys.");
    }
    const { controller, dispose } = linkedAbortController(parentSignal, 1200);
    try {
      const response = await authenticatedFetch(
        `${cleanUrl(apiBaseUrl)}/api/checker/key-bundle?concertId=${concertId.trim()}`,
        { signal: controller.signal }
      );
      if (!response.ok) {
        throw new Error("QR verification keys could not be refreshed.");
      }
      const nextBundle = await response.json() as KeyBundle;
      await SecureStore.setItemAsync(KEY_BUNDLE_STORAGE_KEY, JSON.stringify(nextBundle));
      setKeyBundle(nextBundle);
      return nextBundle;
    } finally {
      dispose();
    }
  }

  function isSignatureVerificationError(error: unknown) {
    if (!(error instanceof Error)) {
      return false;
    }
    const message = error.message.toLowerCase();
    return message.includes("signature verification failed") || message.includes("matching rs256 public key");
  }

  function qrDebugInfo(tokenValue: string, bundle: KeyBundle | null) {
    try {
      const [encodedHeader, encodedPayload] = tokenValue.split(".");
      const header = JSON.parse(bytesToText(base64UrlToBytes(encodedHeader)));
      const payload = JSON.parse(bytesToText(base64UrlToBytes(encodedPayload)));
      const key = bundle?.keys.find((candidate) => candidate.kid === header.kid);
      return {
        tokenLength: tokenValue.length,
        kid: header.kid,
        algorithm: header.alg,
        ticketId: payload.ticketId,
        concertId: payload.concertId,
        zone: payload.zone,
        issuedAt: payload.issuedAt,
        keyPreview: key ? keyPreview(key.publicKeyPem) : "no matching key"
      };
    } catch (error) {
      return {
        tokenLength: tokenValue.length,
        debugError: error instanceof Error ? error.message : String(error)
      };
    }
  }

  function keyPreview(publicKeyPem: string) {
    return publicKeyPem
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replace(/\s/g, "")
      .slice(0, 18);
  }

  async function verifyQr(tokenValue: string, bundle = keyBundle): Promise<TicketPayload> {
    const [encodedHeader, encodedPayload, encodedSignature] = tokenValue.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new Error("Invalid QR token format.");
    }

    let header: { alg?: string; kid?: string };
    let payload: TicketPayload;
    try {
      header = JSON.parse(bytesToText(base64UrlToBytes(encodedHeader)));
      payload = JSON.parse(bytesToText(base64UrlToBytes(encodedPayload)));
    } catch {
      throw new Error("Invalid QR token format.");
    }
    if (
      typeof payload.ticketId !== "string"
      || typeof payload.concertId !== "string"
      || typeof payload.zone !== "string"
    ) {
      throw new Error("QR token is missing ticket data.");
    }

    if (!bundle) {
      throw new Error("No cached public key bundle.");
    }
    const now = Date.now();
    if (bundle.validFrom && now < new Date(bundle.validFrom).getTime()) {
      throw new Error("The event QR verification window has not started.");
    }
    if (bundle.validUntil && now > new Date(bundle.validUntil).getTime()) {
      throw new Error("The cached QR verification window has expired.");
    }
    const key = bundle.keys.find((candidate) => candidate.kid === header.kid);
    const algorithm = key?.algorithm ?? key?.alg;
    if (!key || header.alg !== "RS256" || algorithm !== "RS256") {
      throw new Error("No matching RS256 public key.");
    }
    await verifyRs256(`${encodedHeader}.${encodedPayload}`, encodedSignature, key.publicKeyPem);
    return payload as TicketPayload;
  }

  async function syncOne(clientScanId: string, parentSignal?: AbortSignal): Promise<CheckinSyncOutcome> {
    const row = db.getFirstSync<LocalCheckin>(
      "select * from local_checkins where client_scan_id = ?",
      [clientScanId]
    );
    if (!row || row.sync_status !== "PENDING_SYNC") {
      return pendingSyncOutcome();
    }
    if ((!tokenRef.current && !refreshTokenRef.current) || isOnline === false) {
      const outcome = pendingSyncOutcome();
      updateCheckinSync(clientScanId, outcome.localStatus, outcome.message);
      loadCheckins();
      return outcome;
    }

    const { controller, dispose } = linkedAbortController(parentSignal, 900);
    try {
      const response = await authenticatedFetch(`${cleanUrl(apiBaseUrl)}/api/checkins/${row.ticket_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          clientScanId: row.client_scan_id,
          deviceId,
          gateId: row.gate_id,
          laneId: row.lane_id,
          zone: row.zone,
          scannedAtDevice: row.scanned_at
        })
      });
      const body = await readJsonResponse<CheckinApiResult>(response);
      const outcome = mapCheckinResponse(response.status, body);
      updateCheckinSync(clientScanId, outcome.localStatus, outcome.message);
      loadCheckins();
      if (outcome.kind === "pending") {
        scheduleAutoSyncRetry();
      }
      return outcome;
    } catch (error) {
      const fallback = pendingSyncOutcome();
      const message = friendlyScanError(error);
      const outcome = {
        ...fallback,
        message: message.includes("session expired")
          ? "Saved on this device. Sign in again before syncing."
          : fallback.message
      };
      updateCheckinSync(clientScanId, outcome.localStatus, outcome.message);
      loadCheckins();
      scheduleAutoSyncRetry();
      return outcome;
    } finally {
      dispose();
    }
  }

  function updateCheckinSync(clientScanId: string, status: LocalCheckinStatus, message: string) {
    db.runSync(
      "update local_checkins set sync_status = ?, sync_message = ? where client_scan_id = ?",
      [status, message, clientScanId]
    );
  }

  function scheduleAutoSyncRetry() {
    if (isOnline === false || autoRetryTimerRef.current) {
      return;
    }
    autoRetryTimerRef.current = setTimeout(() => {
      autoRetryTimerRef.current = null;
      void autoSyncPending(false);
    }, 5000);
  }

  async function autoSyncPending(refreshState: boolean) {
    if (isAutoSyncingRef.current) {
      return;
    }
    isAutoSyncingRef.current = true;
    try {
      const tasks: Promise<unknown>[] = [flushQueue({ automatic: true })];
      if (refreshState) {
        tasks.push(refreshCheckerState(tokenRef.current, { silent: true }));
      }
      await Promise.allSettled(tasks);
    } finally {
      isAutoSyncingRef.current = false;
    }
  }

  async function flushQueue({ automatic = false }: { automatic?: boolean } = {}) {
    if (syncingRef.current) {
      return;
    }
    if (!tokenRef.current && !refreshTokenRef.current) {
      if (!automatic) {
        showNotice("Sign in again before syncing queued check-ins.", "warning");
      }
      return;
    }
    if (isOnline === false) {
      if (!automatic) {
        showNotice("You are offline. The queue will sync automatically when the connection returns.", "warning");
      }
      return;
    }

    syncingRef.current = true;
    setIsSyncing(true);
    try {
      const audits = db.getAllSync<any>(
        "select * from local_assignment_audits where sync_status = 'PENDING_SYNC' order by created_at asc",
        []
      );
      for (const audit of audits) {
        const synced = await syncOneAudit(audit.id);
        if (!synced) {
          break;
        }
      }

      let totalSynced = 0;
      let totalIssues = 0;
      let totalStillPending = 0;
      let foundRows = false;

      while (true) {
        const rows = db.getAllSync<LocalCheckin>(
          "select * from local_checkins where sync_status = 'PENDING_SYNC' order by scanned_at asc limit 250",
          []
        );
        if (rows.length === 0) {
          break;
        }
        foundRows = true;

        const response = await authenticatedFetchWithTimeout(`${cleanUrl(apiBaseUrl)}/api/checkins/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        }, 10000);
        if (!response.ok) {
          const detail = await readResponseMessage(response);
          totalStillPending += rows.length;
          scheduleAutoSyncRetry();
          if (!automatic) {
            showNotice(detail || "Sync failed. The queue remains safely stored on this device.", "error");
          }
          return;
        }

        const body = await response.json() as { results?: CheckinApiResult[] };
        const returnedIds = new Set<string>();
        let batchStillPending = 0;
        for (const result of body.results ?? []) {
          if (!result.clientScanId) {
            continue;
          }
          returnedIds.add(result.clientScanId);
          const outcome = mapCheckinResponse(200, result);
          updateCheckinSync(result.clientScanId, outcome.localStatus, outcome.message);
          if (outcome.kind === "synced") {
            totalSynced += 1;
          } else if (outcome.kind === "conflict" || outcome.kind === "rejected") {
            totalIssues += 1;
          } else {
            batchStillPending += 1;
          }
        }
        batchStillPending += rows.filter((row) => !returnedIds.has(row.client_scan_id)).length;
        totalStillPending += batchStillPending;
        loadCheckins();

        if (batchStillPending > 0 || rows.length < 250) {
          break;
        }
      }

      if (!foundRows) {
        if (!automatic) {
          showNotice("The check-in queue is up to date.", "success");
        }
        return;
      }

      if (totalStillPending > 0) {
        scheduleAutoSyncRetry();
      }
      const summary = `${totalSynced} synced${totalIssues ? `, ${totalIssues} need review` : ""}${totalStillPending ? `, ${totalStillPending} still waiting` : ""}.`;
      showNotice(
        automatic ? `Automatic sync complete: ${summary}` : `Sync complete: ${summary}`,
        totalIssues || totalStillPending ? "warning" : "success"
      );
    } catch (error) {
      console.warn("Check-in queue sync failed", error);
      scheduleAutoSyncRetry();
      if (!automatic) {
        showNotice("Sync could not finish. The queue remains safely stored on this device.", "error");
      }
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }

  async function syncOneAudit(auditId: string) {
    if ((!tokenRef.current && !refreshTokenRef.current) || isOnline === false) {
      return false;
    }
    const row = db.getFirstSync<any>(
      "select * from local_assignment_audits where id = ?",
      [auditId]
    );
    if (!row || row.sync_status !== "PENDING_SYNC") {
      return true;
    }
    try {
      const response = await authenticatedFetchWithTimeout(`${cleanUrl(apiBaseUrl)}/api/checker/assignment-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: row.assignment_id,
          deviceId: row.device_id,
          action: row.action,
          reason: row.reason
        })
      }, 4000);
      if (!response.ok) {
        return false;
      }
      db.runSync("update local_assignment_audits set sync_status = 'SYNCED' where id = ?", [auditId]);
      return true;
    } catch {
      return false;
    }
  }

  function confirmEmergencyActivation() {
    if (!standbyAssignment) {
      showNotice("No standby assignment is cached for this device.", "warning");
      return;
    }
    Alert.alert(
      "Activate emergency gate?",
      `This device will switch to Gate ${standbyAssignment.gateId}${standbyAssignment.laneId ? ` / Lane ${standbyAssignment.laneId}` : ""}. The change is audited and synced when online.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Activate", style: "destructive", onPress: () => void activateStandbyLocally() }
      ]
    );
  }

  async function activateStandbyLocally() {
    if (!standbyAssignment) {
      return;
    }
    const nextAssignments = assignments.map((assignment) => {
      if (assignment.id === standbyAssignment.id) {
        return { ...assignment, state: "ACTIVE" as const };
      }
      if (assignment.id === activeAssignment?.id) {
        return { ...assignment, state: "STANDBY" as const };
      }
      return assignment;
    });
    await SecureStore.setItemAsync(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(nextAssignments));
    setAssignments(nextAssignments);

    const auditId = makeId();
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
        new Date().toISOString()
      ]
    );

    const auditSynced = await syncOneAudit(auditId);
    showNotice(
      auditSynced
        ? `Emergency Gate ${standbyAssignment.gateId} is active and the audit is synced.`
        : `Emergency Gate ${standbyAssignment.gateId} is active locally. The audit will sync automatically.`,
      auditSynced ? "success" : "warning"
    );
  }

  async function loadVipGuests(queryValue: string) {
    if (!tokenRef.current && !refreshTokenRef.current) {
      showNotice("An active checker session is required for VIP lookup.", "warning");
      return;
    }
    if (isOnline === false) {
      setVipError("No connection. VIP lookup requires network access.");
      showNotice("VIP lookup requires a network connection.", "warning");
      return;
    }

    const query = queryValue.trim();
    const requestId = ++vipRequestIdRef.current;
    setVipGuests([]);
    setVipError(null);
    setIsVipLoading(true);
    try {
      const response = await authenticatedFetchWithTimeout(
        `${cleanUrl(apiBaseUrl)}/api/vip-guests?concertId=${concertId.trim()}&q=${encodeURIComponent(query)}`,
        {},
        8000
      );
      if (requestId !== vipRequestIdRef.current) {
        return;
      }
      if (!response.ok) {
        setVipError("VIP guests could not be loaded. Check the connection and try again.");
        showNotice("VIP guests could not be loaded. Try again.", "error");
        return;
      }
      const guests = await response.json();
      if (requestId === vipRequestIdRef.current) {
        setVipGuests(Array.isArray(guests) ? guests : []);
      }
    } catch (error) {
      if (requestId === vipRequestIdRef.current) {
        const message = isAbortError(error)
          ? "VIP lookup timed out. Check the connection and try again."
          : "VIP lookup failed because the server is unavailable.";
        setVipError(message);
        showNotice(message, "error");
      }
    } finally {
      if (requestId === vipRequestIdRef.current) {
        setIsVipLoading(false);
      }
    }
  }

  function searchVip() {
    void loadVipGuests(vipQuery);
  }

  function updateVipQuery(nextQuery: string) {
    setVipQuery(nextQuery);
    if (!nextQuery.trim()) {
      void loadVipGuests("");
    }
  }

  function selectTab(nextTab: Tab) {
    setTab(nextTab);
    if (nextTab === "sync") {
      loadCheckins();
    } else if (nextTab === "vip") {
      void loadVipGuests(vipQuery);
    }
  }

  async function enterVip(guestId: string) {
    if ((!tokenRef.current && !refreshTokenRef.current) || enteringGuestRef.current) {
      return;
    }
    if (isOnline === false) {
      showNotice("VIP admission requires a network connection.", "warning");
      return;
    }

    enteringGuestRef.current = guestId;
    setEnteringGuestId(guestId);
    setVipError(null);
    try {
      const response = await authenticatedFetchWithTimeout(`${cleanUrl(apiBaseUrl)}/api/vip-guests/${guestId}/enter`, {
        method: "POST"
      }, 8000);
      if (response.status === 409) {
        setVipGuests((guests) => guests.map((guest) => guest.id === guestId ? { ...guest, entered: true } : guest));
        showNotice("This VIP guest was already admitted.", "warning");
        return;
      }
      if (response.status === 404) {
        setVipError("This guest is no longer on the VIP list. Contact the organizer.");
        showNotice("This guest is no longer on the VIP list. Contact the organizer.", "error");
        return;
      }
      if (!response.ok) {
        const detail = await readResponseMessage(response);
        setVipError(detail || "VIP admission failed. Try again.");
        showNotice(detail || "VIP admission failed. Try again.", "error");
        return;
      }

      setVipGuests((guests) => guests.map((guest) => guest.id === guestId ? { ...guest, entered: true } : guest));
      showNotice("VIP guest admitted successfully.", "success");
    } catch (error) {
      const message = isAbortError(error)
        ? "VIP admission timed out. No change was recorded."
        : "VIP admission could not reach the server. No change was recorded.";
      setVipError(message);
      showNotice(message, "error");
    } finally {
      enteringGuestRef.current = null;
      setEnteringGuestId(null);
    }
  }

  function loadCheckins() {
    setCheckins(
      db.getAllSync<LocalCheckin>(
        "select * from local_checkins order by scanned_at desc limit 50",
        []
      )
    );
  }

  if (isHydrating) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator color="#111827" size="large" />
          <Text style={styles.loadingTitle}>Preparing Ticketbox Checker</Text>
          <Text style={styles.mutedText}>Loading the cached session and offline scan queue.</Text>
        </View>
        <StatusBar backgroundColor="#eef2f6" style="dark" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>TICKETBOX CHECKER</Text>
                <Text style={styles.headerSubtitle}>
                  {signedIn && activeAssignment
                    ? `Gate ${activeAssignment.gateId}${activeAssignment.laneId ? ` / Lane ${activeAssignment.laneId}` : ""}`
                    : "Secure event entry operations"}
                </Text>
              </View>
              {signedIn ? (
                <Pressable
                  accessibilityLabel="Sign out"
                  accessibilityRole="button"
                  onPress={confirmLogout}
                  style={({ pressed }) => [styles.logoutButton, pressed && styles.pressedControl]}
                >
                  <LogOut color="#111827" size={21} strokeWidth={2.4} />
                </Pressable>
              ) : null}
            </View>

            {signedIn ? <ConnectionPill isOnline={isOnline} pendingCount={pendingCount} /> : null}
            <StatusBanner notice={notice} onClose={() => setNotice(null)} />

            {!signedIn ? (
              <LoginScreen
                concertId={concertId}
                concerts={concerts}
                concertsError={concertsError}
                email={email}
                isConcertsLoading={isConcertsLoading}
                isLoading={isLoginBusy}
                onLogin={login}
                onReloadConcerts={() => void loadConcerts()}
                password={password}
                setConcertId={setConcertId}
                setEmail={setEmail}
                setPassword={setPassword}
              />
            ) : (
              <>
                <TabBar activeTab={tab} onTabSelect={selectTab} pendingCount={pendingCount} />

                {tab === "scan" ? (
                  <ScanTab
                    activeAssignment={activeAssignment}
                    canAskCameraPermission={canAskCameraPermission}
                    hasCameraPermission={hasCameraPermission}
                    isOnline={isOnline}
                    isRefreshing={isRefreshing}
                    mockScanToken={mockScanToken}
                    onEmergencyActivate={confirmEmergencyActivation}
                    onRefresh={() => void refreshCheckerState()}
                    onRequestCameraPermission={() => void requestCameraPermission()}
                    onScan={handleScan}
                    setMockScanToken={setMockScanToken}
                    standbyAssignment={standbyAssignment}
                  />
                ) : null}

                {tab === "sync" ? (
                  <SyncTab
                    checkins={checkins}
                    isOnline={isOnline}
                    isSyncing={isSyncing}
                    onFlush={() => void flushQueue()}
                  />
                ) : null}

                {tab === "vip" ? (
                  <VipTab
                    enteringGuestId={enteringGuestId}
                    isLoading={isVipLoading}
                    isOnline={isOnline}
                    error={vipError}
                    onEnter={(guestId) => void enterVip(guestId)}
                    onSearch={searchVip}
                    setVipQuery={updateVipQuery}
                    vipGuests={vipGuests}
                    vipQuery={vipQuery}
                  />
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <StatusBar backgroundColor="#eef2f6" style="dark" />
    </SafeAreaView>
  );
}

function cleanUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function resolveConfiguredApiBaseUrl(value: string) {
  const cleanBaseUrl = cleanUrl(value);
  if (Platform.OS !== "android") {
    return cleanBaseUrl;
  }
  return cleanBaseUrl.replace(
    /^(https?):\/\/(?:localhost|127\.0\.0\.1)(?=[:/]|$)/i,
    "$1://10.0.2.2"
  );
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000) {
  const { controller, dispose } = linkedAbortController(init.signal ?? undefined, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    dispose();
  }
}

function isAbortError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return error.name === "AbortError" || message.includes("abort") || message.includes("timed out");
}

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

async function readResponseMessage(response: Response) {
  try {
    const body = await response.json();
    if (typeof body?.message === "string") {
      return body.message;
    }
    if (typeof body?.error === "string") {
      return body.error;
    }
  } catch {
    return "";
  }
  return "";
}

function waitForPromiseWithSignal<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(new Error("Request aborted."));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new Error("Request aborted."));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}

function linkedAbortController(parentSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener("abort", abort, { once: true });
  }
  const timeout = setTimeout(abort, timeoutMs);
  return {
    controller,
    dispose() {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abort);
    }
  };
}
