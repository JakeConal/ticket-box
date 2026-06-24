import React from "react";
import { View, Text, Pressable } from "react-native";
import { LocalCheckin } from "../types";
import styles from "../styles";

type SyncTabProps = {
  pending: LocalCheckin[];
  onFlush: () => void;
};

export function SyncTab({ pending, onFlush }: SyncTabProps) {
  return (
    <View style={styles.panel}>
      <Pressable style={[styles.primaryButton, { marginBottom: 16 }]} onPress={onFlush}>
        <Text style={styles.primaryButtonText}>Flush pending sync</Text>
      </Pressable>
      {pending.map((item) => {
        let badgeStyle = styles.syncBadgePending;
        let badgeText = "PENDING";
        if (item.sync_status === "SYNCED") {
          badgeStyle = styles.syncBadgeSynced;
          badgeText = "SYNCED";
        } else if (item.sync_status === "CONFLICT") {
          badgeStyle = styles.syncBadgeConflict;
          badgeText = "CONFLICT";
        }

        return (
          <View key={item.client_scan_id} style={styles.listItem}>
            <View style={styles.listHeaderRow}>
              <Text style={styles.listTitle} numberOfLines={1} ellipsizeMode="middle">
                {item.ticket_id}
              </Text>
              <View style={[styles.syncBadge, badgeStyle]}>
                <Text style={styles.syncBadgeText}>{badgeText}</Text>
              </View>
            </View>
            <Text style={styles.listMeta}>
              Zone: <Text style={{ fontWeight: '700', color: '#0a0a0a' }}>{item.zone}</Text> • Scanned: {new Date(item.scanned_at).toLocaleTimeString()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
