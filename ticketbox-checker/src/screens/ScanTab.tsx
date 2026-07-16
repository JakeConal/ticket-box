import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  Vibration,
  View
} from "react-native";
import { CameraView } from "expo-camera";
import {
  CameraOff,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  RefreshCw,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  X
} from "lucide-react-native";
import { ActionButton } from "../components/UI";
import type { Assignment } from "../types";
import styles from "../styles";

const SCAN_DECISION_TIMEOUT_MS = 3000;
const USE_NATIVE_ANIMATION_DRIVER = Platform.OS !== "web";

export type ScanFeedbackResult = {
  tone: "success" | "error";
  title: string;
  subtitle: string;
};

type ScanFeedbackState = ScanFeedbackResult | {
  tone: "pending";
  title: string;
  subtitle: string;
};

type ScanTabProps = {
  activeAssignment: Assignment | undefined;
  standbyAssignment: Assignment | undefined;
  mockScanToken: string;
  setMockScanToken: (value: string) => void;
  onScan: (
    payload: { data: string },
    signal?: AbortSignal
  ) => Promise<ScanFeedbackResult | void> | ScanFeedbackResult | void;
  hasCameraPermission: boolean | null;
  canAskCameraPermission: boolean | null;
  isOnline: boolean | null;
  isRefreshing: boolean;
  onRequestCameraPermission: () => void;
  onRefresh: () => void;
  onEmergencyActivate: () => void;
};

export function ScanTab({
  activeAssignment,
  standbyAssignment,
  mockScanToken,
  setMockScanToken,
  onScan,
  hasCameraPermission,
  canAskCameraPermission,
  isOnline,
  isRefreshing,
  onRequestCameraPermission,
  onRefresh,
  onEmergencyActivate
}: ScanTabProps) {
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [feedback, setFeedback] = useState<ScanFeedbackState>({
    tone: "pending",
    title: "QR captured",
    subtitle: "Verifying ticket..."
  });
  const cameraRef = useRef<CameraView | null>(null);
  const feedbackRef = useRef<View | null>(null);
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;
  const resultScale = useRef(new Animated.Value(0.96)).current;
  const feedbackActive = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanControllerRef = useRef<AbortController | null>(null);
  const lastScan = useRef<{ data: string; capturedAt: number } | null>(null);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      subscription.remove();
      scanControllerRef.current?.abort();
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!feedbackVisible || Platform.OS === "web") {
      return;
    }
    const focusTimer = setTimeout(() => {
      const target = findNodeHandle(feedbackRef.current);
      if (target) {
        AccessibilityInfo.setAccessibilityFocus(target);
      }
    }, 120);
    return () => clearTimeout(focusTimer);
  }, [feedback, feedbackVisible]);

  const finishFeedback = useCallback(() => {
    setFeedbackVisible(false);
    feedbackActive.current = false;
    scanControllerRef.current = null;
    if (Platform.OS !== "web") {
      void cameraRef.current?.resumePreview().catch(() => undefined);
    }
  }, []);

  const dismissFeedback = useCallback(() => {
    scanControllerRef.current?.abort();
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    if (reduceMotion) {
      finishFeedback();
      return;
    }
    Animated.timing(resultOpacity, {
      toValue: 0,
      duration: 140,
      useNativeDriver: USE_NATIVE_ANIMATION_DRIVER
    }).start(finishFeedback);
  }, [finishFeedback, reduceMotion, resultOpacity]);

  const presentFeedback = useCallback((next: ScanFeedbackState) => {
    setFeedback(next);
    setFeedbackVisible(true);
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(`${next.title}. ${next.subtitle}`);
    }

    if (reduceMotion) {
      resultOpacity.setValue(1);
      resultScale.setValue(1);
      return;
    }
    resultOpacity.setValue(0);
    resultScale.setValue(0.96);
    Animated.parallel([
      Animated.timing(resultOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: USE_NATIVE_ANIMATION_DRIVER
      }),
      Animated.spring(resultScale, {
        toValue: 1,
        friction: 7,
        tension: 130,
        useNativeDriver: USE_NATIVE_ANIMATION_DRIVER
      })
    ]).start();
  }, [reduceMotion, resultOpacity, resultScale]);

  const runCaptureFlash = useCallback(() => {
    if (reduceMotion) {
      return;
    }
    flashOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(flashOpacity, {
        toValue: 0.88,
        duration: 80,
        useNativeDriver: USE_NATIVE_ANIMATION_DRIVER
      }),
      Animated.timing(flashOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: USE_NATIVE_ANIMATION_DRIVER
      })
    ]).start();
  }, [flashOpacity, reduceMotion]);

  const freezeCameraPreview = useCallback(async () => {
    if (Platform.OS === "web" || !cameraRef.current) {
      return;
    }
    try {
      await cameraRef.current.pausePreview();
    } catch {
      // The flash still confirms capture on camera implementations that cannot pause preview.
    }
  }, []);

  const handleCapturedCode = useCallback(async (
    payload: { data: string },
    source: "camera" | "manual" = "camera"
  ) => {
    const data = payload.data.trim();
    if (!data || feedbackActive.current || !activeAssignment) {
      return;
    }

    const now = Date.now();
    if (source === "camera" && lastScan.current?.data === data && now - lastScan.current.capturedAt < 4500) {
      return;
    }
    lastScan.current = { data, capturedAt: now };
    feedbackActive.current = true;
    runCaptureFlash();
    if (source === "camera") {
      void freezeCameraPreview();
    }
    presentFeedback({
      tone: "pending",
      title: "QR captured",
      subtitle: "Verifying ticket..."
    });

    const controller = new AbortController();
    scanControllerRef.current = controller;
    const decisionTimer = setTimeout(() => controller.abort(), SCAN_DECISION_TIMEOUT_MS);
    try {
      const result = await onScan({ data }, controller.signal);
      if (!result) {
        presentFeedback({
          tone: "error",
          title: "No scan decision",
          subtitle: "Verification did not finish. Try scanning again."
        });
        return;
      }

      presentFeedback(result);
      Vibration.vibrate(result.tone === "success" ? 70 : [0, 90, 70, 120]);
      if (result.tone === "success") {
        dismissTimer.current = setTimeout(dismissFeedback, 1800);
      }
    } catch {
      presentFeedback({
        tone: "error",
        title: controller.signal.aborted ? "Verification timed out" : "Scan failed",
        subtitle: controller.signal.aborted
          ? "The scanner is ready again. Try once more or use manual entry."
          : "The ticket could not be verified. Try again."
      });
      Vibration.vibrate([0, 90, 70, 120]);
    } finally {
      clearTimeout(decisionTimer);
      if (scanControllerRef.current === controller) {
        scanControllerRef.current = null;
      }
    }
  }, [activeAssignment, dismissFeedback, freezeCameraPreview, onScan, presentFeedback, runCaptureFlash]);

  const submitManualCode = useCallback(() => {
    const value = mockScanToken.trim();
    if (!value || !activeAssignment) {
      return;
    }
    void handleCapturedCode({ data: value }, "manual");
    setMockScanToken("");
  }, [activeAssignment, handleCapturedCode, mockScanToken, setMockScanToken]);

  return (
    <View style={styles.panel}>
      <View style={styles.cardPanel}>
        <Text style={styles.eyebrow}>ACTIVE GATE ASSIGNMENT</Text>
        {activeAssignment ? (
          <>
            <Text style={styles.panelTitle}>
              Gate {activeAssignment.gateId}
              {activeAssignment.laneId ? ` / Lane ${activeAssignment.laneId}` : ""}
            </Text>
            <View
              accessible
              accessibilityLabel={`Allowed zones: ${activeAssignment.allowedZones.join(", ")}`}
              accessibilityRole="text"
              style={styles.badgeRow}
            >
              {activeAssignment.allowedZones.map((zone) => (
                <View key={zone} style={styles.badge}>
                  <Text style={styles.badgeText}>{zone.toUpperCase()}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.errorText}>No active assignment is cached. Refresh while online before scanning.</Text>
        )}
      </View>

      {Platform.OS !== "web" ? (
        !activeAssignment ? (
          <View style={styles.cardPanel}>
            <View style={styles.row}>
              <ShieldAlert color="#b91c1c" size={26} strokeWidth={2.3} />
              <View style={styles.flex}>
                <Text style={styles.sectionTitle}>Scanner locked</Text>
                <Text style={styles.mutedText}>Connect and load an active assignment before scanning tickets.</Text>
              </View>
            </View>
          </View>
        ) : hasCameraPermission === true ? (
          <View style={styles.scannerFrame}>
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={feedbackVisible ? undefined : handleCapturedCode}
              ref={cameraRef}
              style={styles.scanner}
            />
            <View pointerEvents="none" style={styles.cameraShade} />
            <View pointerEvents="none" style={styles.scanGuide} />
            <View pointerEvents="none" style={styles.scanGuideLabel}>
              <Text style={styles.scanGuideText}>Hold the QR inside the frame</Text>
            </View>
            <Animated.View pointerEvents="none" style={[styles.scanFlash, { opacity: flashOpacity }]} />
          </View>
        ) : (
          <View style={styles.cardPanel}>
            <View style={styles.row}>
              {hasCameraPermission === null ? (
                <ActivityIndicator color="#111827" size="small" />
              ) : (
                <CameraOff color="#b91c1c" size={24} strokeWidth={2.3} />
              )}
              <View style={styles.flex}>
                <Text style={styles.sectionTitle}>
                  {hasCameraPermission === null ? "Checking camera access" : "Camera access is off"}
                </Text>
                <Text style={styles.mutedText}>
                  {hasCameraPermission === null
                    ? "Please wait a moment."
                    : canAskCameraPermission === false
                      ? "Open device settings to enable the camera. Manual JWT entry remains available."
                      : "Allow camera access to scan QR tickets. Manual JWT entry remains available."}
                </Text>
              </View>
            </View>
            {hasCameraPermission === false ? (
              <ActionButton
                label={canAskCameraPermission === false ? "Open camera settings" : "Allow camera access"}
                onPress={onRequestCameraPermission}
                variant="secondary"
              />
            ) : null}
          </View>
        )
      ) : null}

      <View style={styles.cardPanel}>
        <View style={styles.manualHeader}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>CAMERA FALLBACK</Text>
            <Text style={styles.sectionTitle}>Enter JWT code</Text>
          </View>
          <Pressable
            accessibilityLabel={manualEntryOpen ? "Collapse manual JWT entry" : "Expand manual JWT entry"}
            accessibilityRole="button"
            accessibilityState={{ expanded: manualEntryOpen }}
            hitSlop={4}
            onPress={() => setManualEntryOpen((open) => !open)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressedControl]}
          >
            {manualEntryOpen ? (
              <ChevronUp color="#111827" size={22} strokeWidth={2.5} />
            ) : (
              <ChevronDown color="#111827" size={22} strokeWidth={2.5} />
            )}
          </Pressable>
        </View>

        {manualEntryOpen ? (
          <View style={styles.manualContent}>
            <Text style={styles.mutedText}>Paste a ticket JWT only when camera scanning is unavailable.</Text>
            <TextInput
              accessibilityLabel="Ticket JWT code"
              autoCapitalize="none"
              autoCorrect={false}
              editable={Boolean(activeAssignment) && !feedbackActive.current}
              multiline
              onChangeText={setMockScanToken}
              placeholder="Paste ticket JWT code"
              placeholderTextColor="#6b7280"
              style={[styles.input, styles.manualInput]}
              value={mockScanToken}
            />
            <ActionButton
              disabled={!activeAssignment || !mockScanToken.trim() || feedbackActive.current}
              icon={<ScanLine color="#ffffff" size={20} strokeWidth={2.4} />}
              label="Verify JWT code"
              onPress={submitManualCode}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.actionRow}>
        <ActionButton
          disabled={isOnline === false}
          icon={<RefreshCw color="#111827" size={19} strokeWidth={2.3} />}
          label={isOnline === false ? "Offline" : "Refresh data"}
          loading={isRefreshing}
          onPress={onRefresh}
          style={styles.flex}
          variant="secondary"
        />
        <ActionButton
          accessibilityHint="Switches the cached standby assignment to active after confirmation."
          disabled={!standbyAssignment}
          icon={<ShieldAlert color={standbyAssignment ? "#b91c1c" : "#6b7280"} size={19} strokeWidth={2.3} />}
          label={standbyAssignment ? "Emergency gate" : "No standby gate"}
          onPress={onEmergencyActivate}
          style={styles.flex}
          variant="secondary"
        />
      </View>
      {standbyAssignment ? (
        <View style={styles.helperBox}>
          <Info color="#1e40af" size={19} strokeWidth={2.3} />
          <Text style={styles.helperText}>
            Emergency gate switches this device to Gate {standbyAssignment.gateId}
            {standbyAssignment.laneId ? ` / Lane ${standbyAssignment.laneId}` : ""} and records an audit for later sync.
          </Text>
        </View>
      ) : null}

      <Modal
        animationType="none"
        onRequestClose={dismissFeedback}
        statusBarTranslucent
        transparent
        visible={feedbackVisible}
      >
        <Animated.View
          accessibilityViewIsModal
          importantForAccessibility="yes"
          onAccessibilityEscape={dismissFeedback}
          style={[
            styles.scanModalBackdrop,
            { opacity: resultOpacity, transform: [{ scale: resultScale }] }
          ]}
        >
          <View style={styles.scanResultContainer}>
            <ScanResultPanel feedback={feedback} focusRef={feedbackRef} onDismiss={dismissFeedback} />
          </View>
        </Animated.View>
      </Modal>
    </View>
  );
}

function ScanResultPanel({
  feedback,
  focusRef,
  onDismiss
}: {
  feedback: ScanFeedbackState;
  focusRef: React.RefObject<View | null>;
  onDismiss: () => void;
}) {
  const pending = feedback.tone === "pending";
  const error = feedback.tone === "error";
  return (
    <View style={[
      styles.scanResultCard,
      pending && styles.scanResultCardPending,
      error && styles.scanResultCardError
    ]}>
      <View
        accessible
        accessibilityLabel={`${feedback.title}. ${feedback.subtitle}`}
        accessibilityLiveRegion={feedback.tone === "error" ? "assertive" : "polite"}
        accessibilityRole="alert"
        ref={focusRef}
        style={styles.scanResultSummary}
      >
        <View style={[
          styles.scanResultIcon,
          pending && styles.scanResultIconPending,
          error && styles.scanResultIconError
        ]}>
          {pending ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : error ? (
            <X color="#ffffff" size={30} strokeWidth={3} />
          ) : (
            <Check color="#ffffff" size={30} strokeWidth={3} />
          )}
        </View>
        <Text style={styles.scanResultTitle}>{feedback.title}</Text>
        <Text style={[
          styles.scanResultSubtitle,
          pending && styles.scanResultSubtitlePending,
          error && styles.scanResultSubtitleError
        ]}>{feedback.subtitle}</Text>
      </View>
      <ActionButton
        icon={pending
          ? <X color="#111827" size={18} strokeWidth={2.3} />
          : <RotateCcw color="#111827" size={18} strokeWidth={2.3} />}
        label={pending ? "Cancel verification" : "Scan next ticket"}
        onPress={onDismiss}
        style={styles.scanResultAction}
        variant="secondary"
      />
    </View>
  );
}
