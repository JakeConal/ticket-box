import React from "react";
import { View, Text, TextInput, TextInputProps, Pressable } from "react-native";
import styles from "../styles";
import { Tab } from "../types";

export function StatusBanner({ status }: { status: string | null }) {
  if (!status) return null;
  return (
    <View style={[
      styles.statusBanner,
      (status.toLowerCase().includes("fail") || status.toLowerCase().includes("reject") || status.toLowerCase().includes("error") || status.toLowerCase().includes("conflict") || status.toLowerCase().includes("blocked")) && styles.statusBannerError,
      (status.toLowerCase().includes("valid") || status.toLowerCase().includes("sync") || status.toLowerCase().includes("loaded") || status.toLowerCase().includes("stored")) && styles.statusBannerSuccess
    ]}>
      <Text style={[
        styles.statusText,
        (status.toLowerCase().includes("valid") || status.toLowerCase().includes("sync") || status.toLowerCase().includes("loaded") || status.toLowerCase().includes("stored")) && styles.statusTextSuccess
      ]}>{status.toUpperCase()}</Text>
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
