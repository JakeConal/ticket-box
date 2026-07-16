import React from "react";
import { Text, View } from "react-native";
import { CircleCheck, CloudOff, History, RefreshCw, TriangleAlert } from "lucide-react-native";
import { ActionButton } from "../components/UI";
import { formatLocalTime } from "../services/checkins";
import type { LocalCheckin } from "../types";
import styles from "../styles";

type SyncTabProps = {
  checkins: LocalCheckin[];
  isOnline: boolean | null;
  isSyncing: boolean;
  onFlush: () => void;
};

export function SyncTab({ checkins, isOnline, isSyncing, onFlush }: SyncTabProps) {
  const pendingCount = checkins.filter((item) => item.sync_status === "PENDING_SYNC").length;
  const syncedCount = checkins.filter((item) => item.sync_status === "SYNCED").length;
  const issueCount = checkins.filter((item) => item.sync_status === "CONFLICT" || item.sync_status === "REJECTED").length;

  return (
    <View style={styles.panel}>
      <View style={styles.cardPanel}>
        <Text style={styles.eyebrow}>CHECK-IN SYNC</Text>
        <Text style={styles.panelTitle}>Device queue</Text>
        <Text style={styles.mutedText}>
          Pending check-ins sync automatically when the connection returns. Use Sync now to retry immediately.
        </Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{pendingCount}</Text>
            <Text style={styles.summaryLabel}>Waiting</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{syncedCount}</Text>
            <Text style={styles.summaryLabel}>Synced</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{issueCount}</Text>
            <Text style={styles.summaryLabel}>Needs review</Text>
          </View>
        </View>
        <ActionButton
          disabled={pendingCount === 0 || isOnline === false}
          icon={isOnline === false
            ? <CloudOff color="#6b7280" size={20} strokeWidth={2.3} />
            : <RefreshCw color="#ffffff" size={20} strokeWidth={2.3} />}
          label={isOnline === false ? "Waiting for connection" : pendingCount === 0 ? "Queue is up to date" : `Sync ${pendingCount} check-in${pendingCount === 1 ? "" : "s"}`}
          loading={isSyncing}
          onPress={onFlush}
        />
      </View>

      {checkins.length === 0 ? (
        <View style={styles.emptyState}>
          <History color="#64748b" size={32} strokeWidth={2} />
          <Text style={styles.emptyStateTitle}>No scans on this device yet</Text>
          <Text style={styles.emptyStateText}>Completed and pending scans will appear here.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {checkins.map((item) => {
            const display = getStatusDisplay(item);
            return (
              <View
                accessible
                accessibilityLabel={`Ticket ${item.ticket_id}. ${display.label}.`}
                accessibilityRole="text"
                key={item.client_scan_id}
                style={styles.listItem}
              >
                <View style={styles.listHeaderRow}>
                  <Text ellipsizeMode="middle" numberOfLines={1} style={styles.listTitle}>
                    {item.ticket_id}
                  </Text>
                  <View style={[styles.syncBadge, display.style]}>
                    <Text style={styles.syncBadgeText}>{display.label}</Text>
                  </View>
                </View>
                <Text style={styles.listMeta}>
                  Zone {item.zone} · Scanned {formatLocalTime(item.scanned_at)}
                </Text>
                {item.sync_message ? <Text style={styles.listMeta}>{item.sync_message}</Text> : null}
                {item.sync_status === "SYNCED" ? (
                  <CircleCheck color="#166534" size={18} strokeWidth={2.4} />
                ) : item.sync_status === "CONFLICT" || item.sync_status === "REJECTED" ? (
                  <TriangleAlert color="#b91c1c" size={18} strokeWidth={2.4} />
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function getStatusDisplay(item: LocalCheckin) {
  if (item.sync_status === "SYNCED") {
    return { label: "SYNCED", style: styles.syncBadgeSynced };
  }
  if (item.sync_status === "CONFLICT") {
    return { label: "DUPLICATE", style: styles.syncBadgeConflict };
  }
  if (item.sync_status === "REJECTED") {
    return { label: "REJECTED", style: styles.syncBadgeRejected };
  }
  return { label: "WAITING", style: styles.syncBadgePending };
}
