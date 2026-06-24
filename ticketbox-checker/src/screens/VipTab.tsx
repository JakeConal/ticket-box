import React from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import styles from "../styles";

type VipTabProps = {
  vipQuery: string;
  setVipQuery: (val: string) => void;
  onSearch: () => void;
  vipGuests: any[];
  onEnter: (guestId: string) => void;
};

export function VipTab({
  vipQuery,
  setVipQuery,
  onSearch,
  vipGuests,
  onEnter
}: VipTabProps) {
  return (
    <View style={styles.panel}>
      <View style={[styles.row, { marginBottom: 16 }]}>
        <TextInput
          style={[styles.input, styles.flex]}
          value={vipQuery}
          onChangeText={setVipQuery}
          placeholder="VIP name or phone"
          placeholderTextColor="#737373"
        />
        <Pressable style={styles.primaryButton} onPress={onSearch}>
          <Text style={styles.primaryButtonText}>Search</Text>
        </Pressable>
      </View>
      {vipGuests.map((item) => (
        <View key={item.id} style={styles.listItem}>
          <View style={styles.listHeaderRow}>
            <Text style={styles.listTitle}>{item.name}</Text>
            {item.entered ? (
              <View style={[styles.syncBadge, styles.syncBadgeConflict]}>
                <Text style={styles.syncBadgeText}>ADMITTED</Text>
              </View>
            ) : (
              <View style={[styles.syncBadge, styles.syncBadgeSynced]}>
                <Text style={styles.syncBadgeText}>ACTIVE VIP</Text>
              </View>
            )}
          </View>
          <Text style={[styles.listMeta, { marginBottom: 10 }]}>
            Zone: <Text style={{ fontWeight: '700', color: '#0a0a0a' }}>{item.zone}</Text> • {item.entered ? "Admitted" : item.phoneMasked}
          </Text>
          <Pressable
            disabled={item.entered}
            style={[styles.smallButton, item.entered && styles.disabledButton]}
            onPress={() => onEnter(item.id)}
          >
            <Text style={[styles.smallButtonText, item.entered && styles.disabledButtonText]}>
              {item.entered ? "Admitted" : "Mark entered"}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
