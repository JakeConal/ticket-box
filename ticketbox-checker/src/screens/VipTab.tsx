import React from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { Check, Search, TriangleAlert, UserCheck, UsersRound } from "lucide-react-native";
import { ActionButton } from "../components/UI";
import type { VipGuest } from "../types";
import styles from "../styles";

type VipTabProps = {
  vipQuery: string;
  setVipQuery: (value: string) => void;
  onSearch: () => void;
  vipGuests: VipGuest[];
  onEnter: (guestId: string) => void;
  enteringGuestId: string | null;
  isLoading: boolean;
  isOnline: boolean | null;
  error: string | null;
};

export function VipTab({
  vipQuery,
  setVipQuery,
  onSearch,
  vipGuests,
  onEnter,
  enteringGuestId,
  isLoading,
  isOnline,
  error
}: VipTabProps) {
  return (
    <View style={styles.panel}>
      <View style={styles.cardPanel}>
        <Text style={styles.eyebrow}>VIP GUEST LIST</Text>
        <Text style={styles.panelTitle}>Guest entry</Text>
        <Text style={styles.mutedText}>Leave search empty to show every VIP guest for this concert.</Text>
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="VIP guest name or phone"
            autoCapitalize="words"
            autoCorrect={false}
            editable={isOnline !== false && !isLoading}
            onChangeText={setVipQuery}
            onSubmitEditing={isLoading ? undefined : onSearch}
            placeholder="Name or phone"
            placeholderTextColor="#6b7280"
            returnKeyType="search"
            style={[styles.input, styles.flex]}
            value={vipQuery}
          />
          <ActionButton
            disabled={isOnline === false}
            icon={<Search color="#ffffff" size={19} strokeWidth={2.4} />}
            label="Search"
            loading={isLoading}
            onPress={onSearch}
            style={styles.searchButton}
          />
        </View>
        {error ? (
          <View accessibilityLiveRegion="assertive" style={[styles.helperBox, styles.vipErrorBox]}>
            <TriangleAlert color="#b91c1c" size={19} strokeWidth={2.3} />
            <Text style={[styles.helperText, styles.vipErrorText]}>{error}</Text>
          </View>
        ) : null}
      </View>

      {isLoading && vipGuests.length === 0 ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color="#111827" size="large" />
          <Text style={styles.emptyStateTitle}>Loading VIP guests</Text>
        </View>
      ) : vipGuests.length === 0 ? (
        <View style={styles.emptyState}>
          <UsersRound color="#64748b" size={34} strokeWidth={2} />
          <Text style={styles.emptyStateTitle}>
            {isOnline === false ? "VIP list is unavailable offline" : vipQuery.trim() ? "No matching VIP guest" : "No VIP guests found"}
          </Text>
          <Text style={styles.emptyStateText}>
            {isOnline === false
              ? "Reconnect to load or update VIP admissions."
              : vipQuery.trim()
                ? "Check the spelling or clear the search to show everyone."
                : "The concert does not currently have VIP guests."}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {vipGuests.map((item) => (
            <View key={item.id} style={styles.listItem}>
              <View style={styles.listHeaderRow}>
                <Text style={styles.listTitle}>{item.name}</Text>
                <View style={[styles.syncBadge, item.entered ? styles.syncBadgeAdmitted : styles.syncBadgeSynced]}>
                  <Text style={styles.syncBadgeText}>{item.entered ? "ADMITTED" : "ACTIVE VIP"}</Text>
                </View>
              </View>
              <Text style={styles.listMeta}>
                Zone {item.zone} - {item.entered ? "Already admitted" : item.phoneMasked || "Phone unavailable"}
              </Text>
              <ActionButton
                disabled={item.entered || isOnline === false || isLoading}
                icon={item.entered
                  ? <Check color="#6b7280" size={18} strokeWidth={2.5} />
                  : <UserCheck color="#ffffff" size={18} strokeWidth={2.4} />}
                label={item.entered ? "Admitted" : "Mark as entered"}
                loading={enteringGuestId === item.id}
                onPress={() => onEnter(item.id)}
                style={styles.vipAction}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
