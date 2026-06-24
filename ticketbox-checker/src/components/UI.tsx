import React from "react";
import { View, Text, TextInput, TextInputProps, Pressable } from "react-native";
import styles from "../styles";
import { Tab } from "../types";

export function StatusBanner({ status, onClose }: { status: string | null; onClose?: () => void }) {
  if (!status) return null;
  return (
    <View style={[
      styles.statusBanner,
      (status.toLowerCase().includes("fail") || status.toLowerCase().includes("reject") || status.toLowerCase().includes("error") || status.toLowerCase().includes("conflict") || status.toLowerCase().includes("blocked")) && styles.statusBannerError,
      (status.toLowerCase().includes("valid") || status.toLowerCase().includes("sync") || status.toLowerCase().includes("loaded") || status.toLowerCase().includes("stored")) && styles.statusBannerSuccess,
      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }
    ]}>
      <Text style={[
        styles.statusText,
        (status.toLowerCase().includes("valid") || status.toLowerCase().includes("sync") || status.toLowerCase().includes("loaded") || status.toLowerCase().includes("stored")) && styles.statusTextSuccess,
        { flex: 1, paddingRight: 8 }
      ]}>{status.toUpperCase()}</Text>
      {onClose && (
        <Pressable onPress={onClose} style={{ padding: 4 }}>
          <Text style={[
            { fontSize: 16, fontWeight: '800', color: '#0a0a0a' },
            (status.toLowerCase().includes("valid") || status.toLowerCase().includes("sync") || status.toLowerCase().includes("loaded") || status.toLowerCase().includes("stored")) && { color: '#ffffff' }
          ]}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

interface FormInputProps extends TextInputProps {
  label: string;
}

export function FormInput({ label, style, ...props }: FormInputProps) {
  return (
    <View style={styles.formGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={[styles.input, style]} placeholderTextColor="#737373" {...props} />
    </View>
  );
}

export function TabBar({ activeTab, onTabSelect }: { activeTab: Tab; onTabSelect: (tab: Tab) => void }) {
  return (
    <View style={styles.tabs}>
      {(["scan", "sync", "vip"] as Tab[]).map((item) => (
        <Pressable
          key={item}
          style={[styles.tab, activeTab === item && styles.activeTab]}
          onPress={() => onTabSelect(item)}
        >
          <Text style={[styles.tabText, activeTab === item && styles.activeTabText]}>{item.toUpperCase()}</Text>
        </Pressable>
      ))}
    </View>
  );
}
