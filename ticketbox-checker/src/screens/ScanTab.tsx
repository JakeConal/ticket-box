import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Platform, Pressable, Text, TextInput, View } from "react-native";
import { CameraView } from "expo-camera";
import { Assignment } from "../types";
import styles from "../styles";

export type ScanFeedbackResult = {
  tone: "success" | "error";
  title: string;
  subtitle: string;
  mark?: string;
};

type ScanFeedbackState = {
  tone: "pending" | "success" | "error";
  title: string;
  subtitle: string;
  mark: string;
};

type ScanTabProps = {
  activeAssignment: Assignment | undefined;
  mockScanToken: string;
  setMockScanToken: (val: string) => void;
  onScan: (payload: { data: string }) => Promise<ScanFeedbackResult | void> | ScanFeedbackResult | void;
  hasCameraPermission: boolean | null;
  onRefresh: () => void;
  onEmergencyActivate: () => void;
};

export function ScanTab({
  activeAssignment,
  mockScanToken,
  setMockScanToken,
  onScan,
  hasCameraPermission,
  onRefresh,
  onEmergencyActivate
}: ScanTabProps) {
  const [isMinimized, setIsMinimized] = useState(true);
  const [scanFeedbackVisible, setScanFeedbackVisible] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<ScanFeedbackState>({
    tone: "pending",
    title: "QR SCANNED",
    subtitle: "Verifying ticket...",
    mark: "OK"
  });
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(0.9)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const scanFeedbackActive = useRef(false);
  const scanFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (scanFeedbackTimer.current) {
        clearTimeout(scanFeedbackTimer.current);
      }
    };
  }, []);

  const scheduleFeedbackDismiss = useCallback((delay = 1500) => {
    if (scanFeedbackTimer.current) {
      clearTimeout(scanFeedbackTimer.current);
    }

    scanFeedbackTimer.current = setTimeout(() => {
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true
      }).start(() => {
        setScanFeedbackVisible(false);
        scanFeedbackActive.current = false;
      });
    }, delay);
  }, [toastOpacity]);

  const showScanFeedback = useCallback((nextFeedback: ScanFeedbackState, autoDismiss = false) => {
    if (scanFeedbackTimer.current) {
      clearTimeout(scanFeedbackTimer.current);
    }

    const shouldAnimateIn = !scanFeedbackActive.current;
    scanFeedbackActive.current = true;
    setScanFeedback(nextFeedback);
    setScanFeedbackVisible(true);
    AccessibilityInfo.announceForAccessibility(`${nextFeedback.title}. ${nextFeedback.subtitle}`);

    if (shouldAnimateIn) {
      flashOpacity.setValue(0);
      pulseScale.setValue(0.9);
      toastOpacity.setValue(0);

      Animated.parallel([
        Animated.sequence([
          Animated.timing(flashOpacity, {
            toValue: 0.78,
            duration: 90,
            useNativeDriver: true
          }),
          Animated.timing(flashOpacity, {
            toValue: 0,
            duration: 240,
            useNativeDriver: true
          })
        ]),
        Animated.spring(pulseScale, {
          toValue: 1,
          friction: 6,
          tension: 120,
          useNativeDriver: true
        }),
        Animated.timing(toastOpacity, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true
        })
      ]).start();
    } else {
      toastOpacity.setValue(1);
      pulseScale.setValue(1);
    }

    if (autoDismiss) {
      scheduleFeedbackDismiss();
    }
  }, [flashOpacity, pulseScale, scheduleFeedbackDismiss, toastOpacity]);

  const handleScanCaptured = useCallback(
    async (payload: { data: string }) => {
      if (scanFeedbackActive.current) {
        return;
      }

      showScanFeedback({
        tone: "pending",
        title: "QR SCANNED",
        subtitle: "Verifying ticket...",
        mark: "OK"
      });

      const result = await onScan(payload);
      if (result) {
        showScanFeedback({
          tone: result.tone,
          title: result.title,
          subtitle: result.subtitle,
          mark: result.mark ?? (result.tone === "success" ? "OK" : "FAIL")
        }, true);
      } else {
        scheduleFeedbackDismiss(900);
      }
    },
    [onScan, scheduleFeedbackDismiss, showScanFeedback]
  );

  return (
    <View style={styles.panel}>
      <View style={styles.cardPanel}>
        <Text style={styles.eyebrow}>ACTIVE GATE ASSIGNMENT</Text>
        {activeAssignment ? (
          <>
            <Text style={styles.panelTitle}>
              GATE {activeAssignment.gateId}
              {activeAssignment.laneId ? ` / LANE ${activeAssignment.laneId}` : ""}
            </Text>
            <View style={styles.badgeRow}>
              {activeAssignment.allowedZones.map((zone) => (
                <View key={zone} style={styles.badge}>
                  <Text style={styles.badgeText}>{zone.toUpperCase()}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.errorText}>No ACTIVE assignment cached</Text>
        )}
      </View>

      {/* Manual token entry is available as an operational fallback when camera scanning is not practical. */}
      <View style={styles.cardPanel}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>MANUAL ENTRY</Text>
            <Text style={styles.panelTitle}>ENTER JWT CODE</Text>
          </View>
          <Pressable onPress={() => setIsMinimized(!isMinimized)} style={{ paddingLeft: 12, paddingVertical: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#0a0a0a' }}>
              {isMinimized ? "[ + ]" : "[ - ]"}
            </Text>
          </Pressable>
        </View>

        {!isMinimized && (
          <>
            <Text style={styles.mutedText}>Enter or paste the ticket QR JWT code when camera scanning is unavailable.</Text>
            <View style={{ marginTop: 12, gap: 12 }}>
              <TextInput
                style={styles.input}
                placeholder="Enter ticket JWT code..."
                placeholderTextColor="#737373"
                value={mockScanToken}
                onChangeText={setMockScanToken}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  if (mockScanToken.trim()) {
                    handleScanCaptured({ data: mockScanToken.trim() });
                    setMockScanToken("");
                  }
                }}
              >
                <Text style={styles.primaryButtonText}>Submit JWT Code</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {/* Camera View is rendered on native devices when permissions are granted */}
      {Platform.OS !== 'web' && (
        hasCameraPermission ? (
          <View style={styles.scannerFrame}>
            <CameraView
              onBarcodeScanned={handleScanCaptured}
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
              style={styles.scanner}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.scanFlash, { opacity: flashOpacity }]}
            />
            {scanFeedbackVisible && (
              <Animated.View
                pointerEvents="none"
                accessibilityLiveRegion="polite"
                style={[
                  styles.scanCaptureOverlay,
                  scanFeedback.tone === "success" && styles.scanCaptureOverlaySuccess,
                  scanFeedback.tone === "error" && styles.scanCaptureOverlayError,
                  {
                    opacity: toastOpacity,
                    transform: [{ scale: pulseScale }]
                  }
                ]}
              >
                <View style={[
                  styles.scanCaptureMark,
                  scanFeedback.tone === "error" && styles.scanCaptureMarkError
                ]}>
                  <Text style={styles.scanCaptureMarkText}>{scanFeedback.mark}</Text>
                </View>
                <Text style={styles.scanCaptureTitle}>{scanFeedback.title}</Text>
                <Text style={[
                  styles.scanCaptureSubtitle,
                  scanFeedback.tone === "error" && styles.scanCaptureSubtitleError
                ]}>{scanFeedback.subtitle}</Text>
              </Animated.View>
            )}
          </View>
        ) : (
          <View style={styles.cardPanel}>
            <Text style={styles.errorText}>Camera permission is required for QR scanning.</Text>
          </View>
        )
      )}

      {Platform.OS === 'web' && scanFeedbackVisible && (
        <Animated.View
          accessibilityLiveRegion="polite"
          style={[
            styles.scanInlineNotice,
            scanFeedback.tone === "error" && styles.scanInlineNoticeError,
            { opacity: toastOpacity }
          ]}
        >
          <Text style={styles.scanInlineNoticeText}>{scanFeedback.title} - {scanFeedback.subtitle}</Text>
        </Animated.View>
      )}

      <View style={styles.row}>
        <Pressable style={[styles.secondaryButton, styles.scanActionButton, styles.flex]} onPress={onRefresh}>
          <Text style={styles.secondaryButtonText}>Refresh online</Text>
        </Pressable>
        <Pressable style={[styles.secondaryButton, styles.scanActionButton, styles.flex]} onPress={onEmergencyActivate}>
          <Text style={styles.secondaryButtonText}>Emergency mode</Text>
        </Pressable>
      </View>
    </View>
  );
}
