import React, { forwardRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  type StyleProp,
  View,
  type ViewStyle
} from "react-native";
import {
  CircleCheck,
  Info,
  RefreshCw,
  ScanLine,
  TriangleAlert,
  UsersRound,
  Wifi,
  WifiOff,
  X
} from "lucide-react-native";
import styles from "../styles";
import type { AppNotice, Tab } from "../types";

export function StatusBanner({ notice, onClose }: { notice: AppNotice | null; onClose: () => void }) {
  if (!notice) return null;

  const toneStyle = {
    info: styles.statusBannerInfo,
    success: styles.statusBannerSuccess,
    warning: styles.statusBannerWarning,
    error: styles.statusBannerError
  }[notice.tone];
  const textStyle = notice.tone === "success" ? styles.statusTextOnColor : undefined;
  const iconColor = notice.tone === "success" ? "#ffffff" : "#111827";
  const ToneIcon = notice.tone === "success"
    ? CircleCheck
    : notice.tone === "info"
      ? Info
      : TriangleAlert;

  return (
    <View
      accessibilityLiveRegion={notice.tone === "error" ? "assertive" : "polite"}
      accessibilityRole="alert"
      style={[styles.statusBanner, toneStyle]}
    >
      <ToneIcon color={iconColor} size={20} strokeWidth={2.5} />
      <Text style={[styles.statusText, textStyle]}>{notice.message}</Text>
      <Pressable
        accessibilityLabel="Dismiss notification"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onClose}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressedControl]}
      >
        <X color={iconColor} size={20} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

interface FormInputProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string;
}

export const FormInput = forwardRef<TextInput, FormInputProps>(function FormInput(
  { label, hint, error, style, ...props },
  ref
) {
  return (
    <View style={styles.formGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        ref={ref}
        style={[styles.input, error && styles.inputError, style]}
        placeholderTextColor="#6b7280"
        {...props}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
});

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function ActionButton({
  label,
  onPress,
  icon,
  variant = "primary",
  disabled = false,
  loading = false,
  accessibilityHint,
  style
}: ActionButtonProps) {
  const inactive = disabled || loading;
  const variantStyle = variant === "primary"
    ? styles.primaryButton
    : variant === "danger"
      ? styles.dangerButton
      : styles.secondaryButton;
  const textStyle = variant === "primary" || variant === "danger"
    ? styles.primaryButtonText
    : styles.secondaryButtonText;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        variantStyle,
        inactive && styles.disabledButton,
        pressed && !inactive && styles.pressedControl,
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "secondary" ? "#111827" : "#ffffff"} size="small" />
      ) : icon ? (
        icon
      ) : null}
      <Text style={[textStyle, inactive && styles.disabledButtonText]}>{label}</Text>
    </Pressable>
  );
}

export function TabBar({
  activeTab,
  onTabSelect,
  pendingCount
}: {
  activeTab: Tab;
  onTabSelect: (tab: Tab) => void;
  pendingCount: number;
}) {
  const items = [
    { key: "scan" as const, label: "Scan", Icon: ScanLine },
    { key: "sync" as const, label: "Sync", Icon: RefreshCw },
    { key: "vip" as const, label: "VIP", Icon: UsersRound }
  ];

  return (
    <View accessibilityRole="tablist" style={styles.tabs}>
      {items.map(({ key, label, Icon }) => {
        const selected = activeTab === key;
        const color = selected ? "#ffffff" : "#111827";
        return (
          <Pressable
            accessibilityLabel={`${label} tab${key === "sync" && pendingCount ? `, ${pendingCount} pending` : ""}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={key}
            onPress={() => onTabSelect(key)}
            style={({ pressed }) => [
              styles.tab,
              selected && styles.activeTab,
              pressed && styles.pressedControl
            ]}
          >
            <Icon color={color} size={20} strokeWidth={2.4} />
            <Text style={[styles.tabText, selected && styles.activeTabText]}>{label}</Text>
            {key === "sync" && pendingCount > 0 ? (
              <View style={[styles.tabCount, selected && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, selected && styles.tabCountTextActive]}>
                  {pendingCount > 99 ? "99+" : pendingCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function ConnectionPill({ isOnline, pendingCount }: { isOnline: boolean | null; pendingCount: number }) {
  const online = isOnline === true;
  const checking = isOnline === null;
  const label = checking ? "Checking connection" : online ? "Online" : "Offline";
  const Icon = checking ? RefreshCw : online ? Wifi : WifiOff;
  const iconColor = checking ? "#475569" : online ? "#166534" : "#92400e";

  return (
    <View
      accessible
      accessibilityLabel={`${label}. ${pendingCount} check-ins waiting to sync.`}
      accessibilityRole="text"
      style={[
        styles.connectionPill,
        checking && styles.connectionPillChecking,
        !checking && !online && styles.connectionPillOffline
      ]}
    >
      <Icon color={iconColor} size={16} strokeWidth={2.5} />
      <Text style={[
        styles.connectionText,
        checking && styles.connectionTextChecking,
        !checking && !online && styles.connectionTextOffline
      ]}>{label}</Text>
      {pendingCount > 0 ? <Text style={styles.connectionPending}>{pendingCount} pending</Text> : null}
    </View>
  );
}
