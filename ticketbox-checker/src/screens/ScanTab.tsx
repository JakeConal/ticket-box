import React from "react";
import { View, Text, TextInput, Pressable, Platform } from "react-native";
import { BarCodeScanner } from "expo-barcode-scanner";
import { Assignment } from "../types";
import styles from "../styles";

type ScanTabProps = {
  activeAssignment: Assignment | undefined;
  mockScanToken: string;
  setMockScanToken: (val: string) => void;
  onScan: (payload: { data: string }) => void;
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

      {Platform.OS === 'web' ? (
        <View style={styles.cardPanel}>
          <Text style={styles.eyebrow}>SIMULATION MODE</Text>
          <Text style={styles.panelTitle}>SCAN SIMULATION</Text>
          <Text style={styles.mutedText}>Enter or paste a ticket QR token (JWT) to simulate a barcode scan.</Text>
          <View style={{ marginTop: 12, gap: 12 }}>
            <TextInput
              style={styles.input}
              placeholder="Enter ticket JWT here..."
              placeholderTextColor="#737373"
              value={mockScanToken}
              onChangeText={setMockScanToken}
            />
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                if (mockScanToken.trim()) {
                  onScan({ data: mockScanToken.trim() });
                  setMockScanToken("");
                }
              }}
            >
              <Text style={styles.primaryButtonText}>Simulate QR Ticket Scan</Text>
            </Pressable>
          </View>
        </View>
      ) : hasCameraPermission ? (
        <BarCodeScanner
          onBarCodeScanned={onScan}
          barCodeTypes={[BarCodeScanner.Constants.BarCodeType.qr]}
          style={styles.scanner}
        />
      ) : (
        <View style={styles.cardPanel}>
          <Text style={styles.errorText}>Camera permission is required for QR scanning.</Text>
        </View>
      )}

      <View style={styles.row}>
        <Pressable style={[styles.secondaryButton, styles.flex]} onPress={onRefresh}>
          <Text style={styles.secondaryButtonText}>Refresh online</Text>
        </Pressable>
        <Pressable style={[styles.secondaryButton, styles.flex]} onPress={onEmergencyActivate}>
          <Text style={styles.secondaryButtonText}>Emergency activate</Text>
        </Pressable>
      </View>
    </View>
  );
}
