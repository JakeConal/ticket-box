import { Platform, StyleSheet } from "react-native";

const colors = {
  canvas: "#eef2f6",
  surface: "#ffffff",
  surfaceMuted: "#f8fafc",
  ink: "#111827",
  muted: "#5b6472",
  line: "#cbd5e1",
  strongLine: "#1f2937",
  info: "#dbeafe",
  infoInk: "#1e40af",
  success: "#166534",
  successSoft: "#dcfce7",
  warning: "#92400e",
  warningSoft: "#fef3c7",
  danger: "#b91c1c",
  dangerSoft: "#fee2e2"
};

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas
  },
  scrollContent: {
    flexGrow: 1
  },
  container: {
    flexGrow: 1,
    width: "100%",
    maxWidth: Platform.OS === "web" ? 520 : undefined,
    alignSelf: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
    backgroundColor: colors.surface
  },
  loadingTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "800"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.strongLine,
    marginBottom: 12
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  title: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "900"
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2
  },
  logoutButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 6,
    backgroundColor: colors.surface
  },
  statusBanner: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.strongLine,
    borderRadius: 6,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
    marginBottom: 12
  },
  statusBannerInfo: {
    backgroundColor: colors.info
  },
  statusBannerSuccess: {
    backgroundColor: colors.success
  },
  statusBannerWarning: {
    backgroundColor: colors.warningSoft
  },
  statusBannerError: {
    backgroundColor: colors.dangerSoft
  },
  statusText: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  statusTextOnColor: {
    color: colors.surface
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6
  },
  pressedControl: {
    opacity: 0.68
  },
  connectionPill: {
    minHeight: 36,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.successSoft,
    borderColor: "#86efac",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 10,
    marginBottom: 12
  },
  connectionPillOffline: {
    backgroundColor: colors.warningSoft,
    borderColor: "#fcd34d"
  },
  connectionPillChecking: {
    backgroundColor: "#f1f5f9",
    borderColor: "#cbd5e1"
  },
  connectionText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "800"
  },
  connectionTextOffline: {
    color: colors.warning
  },
  connectionTextChecking: {
    color: "#475569"
  },
  connectionPending: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
    paddingLeft: 6,
    borderLeftWidth: 1,
    borderLeftColor: colors.line
  },
  panel: {
    flex: 1,
    gap: 16
  },
  cardPanel: {
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 6,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 10
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted
  },
  panelTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
    color: colors.ink
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800"
  },
  mutedText: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20
  },
  form: {
    gap: 14,
    marginTop: 4
  },
  formGroup: {
    gap: 6
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 6,
    color: colors.ink,
    minHeight: 50,
    paddingHorizontal: 12,
    fontSize: 16
  },
  inputError: {
    borderColor: colors.danger,
    borderWidth: 2
  },
  inputDisabled: {
    backgroundColor: "#f1f5f9",
    opacity: 0.72
  },
  eventSelect: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  eventSelectContent: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  eventLoadingRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  eventSelectValue: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800"
  },
  eventSelectMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17
  },
  eventPlaceholder: {
    color: "#6b7280",
    fontSize: 16
  },
  eventModalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    paddingHorizontal: 16,
    paddingVertical: 36
  },
  eventModalDismissArea: {
    ...StyleSheet.absoluteFillObject
  },
  eventModalPanel: {
    width: "100%",
    maxWidth: 500,
    maxHeight: "82%",
    backgroundColor: colors.surface,
    borderColor: colors.strongLine,
    borderWidth: 1,
    borderRadius: 6,
    padding: 16
  },
  eventModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 12,
    borderBottomColor: colors.line,
    borderBottomWidth: 1
  },
  eventModalTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  eventList: {
    paddingBottom: 4
  },
  eventOption: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 13,
    borderBottomColor: colors.line,
    borderBottomWidth: 1
  },
  eventOptionSelected: {
    backgroundColor: colors.info
  },
  eventOptionContent: {
    flex: 1,
    minWidth: 0,
    gap: 5
  },
  eventOptionName: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800"
  },
  eventOptionMetaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7
  },
  eventOptionMeta: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17
  },
  eventCheck: {
    width: 26,
    height: 26,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 13,
    backgroundColor: colors.surface
  },
  eventCheckSelected: {
    backgroundColor: colors.success,
    borderColor: colors.success
  },
  fieldHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17
  },
  fieldError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  passwordToggle: {
    minHeight: 48,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 6,
    paddingHorizontal: 6
  },
  passwordToggleText: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "700"
  },
  actionButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  primaryButton: {
    backgroundColor: colors.ink,
    borderColor: colors.ink
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderColor: colors.strongLine
  },
  dangerButton: {
    backgroundColor: colors.danger,
    borderColor: colors.danger
  },
  primaryButtonText: {
    flexShrink: 1,
    color: colors.surface,
    fontWeight: "800",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center"
  },
  secondaryButtonText: {
    flexShrink: 1,
    color: colors.ink,
    fontWeight: "800",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center"
  },
  disabledButton: {
    backgroundColor: "#e5e7eb",
    borderColor: colors.line,
    opacity: 0.62
  },
  disabledButtonText: {
    color: colors.muted
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12
  },
  flex: {
    flex: 1,
    minWidth: 0
  },
  tabs: {
    flexDirection: "row",
    minHeight: 58,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.strongLine,
    borderRadius: 6,
    backgroundColor: colors.surface,
    overflow: "hidden"
  },
  tab: {
    flex: 1,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: colors.line
  },
  activeTab: {
    backgroundColor: colors.ink
  },
  tabText: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 13
  },
  activeTabText: {
    color: colors.surface
  },
  tabCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.warningSoft
  },
  tabCountActive: {
    backgroundColor: colors.surface
  },
  tabCountText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: "900"
  },
  tabCountTextActive: {
    color: colors.ink
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2
  },
  badge: {
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    borderRadius: 4
  },
  badgeText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800"
  },
  scannerFrame: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderWidth: 1,
    borderColor: colors.strongLine,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#0b1020",
    position: "relative"
  },
  scanner: {
    ...StyleSheet.absoluteFillObject
  },
  cameraShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 10, 20, 0.12)"
  },
  scanGuide: {
    position: "absolute",
    width: "58%",
    aspectRatio: 1,
    alignSelf: "center",
    top: "18%",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.92)",
    borderRadius: 8
  },
  scanGuideLabel: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    alignItems: "center"
  },
  scanGuideText: {
    color: colors.surface,
    backgroundColor: "rgba(17,24,39,0.82)",
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: "800"
  },
  scanFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface
  },
  scanModalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(3,7,18,0.58)",
    paddingHorizontal: 16,
    paddingVertical: 32
  },
  scanResultCard: {
    width: "100%",
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: 8,
    backgroundColor: colors.successSoft,
    padding: 18
  },
  scanResultContainer: {
    width: "100%",
    maxWidth: 360
  },
  scanResultSummary: {
    width: "100%",
    alignItems: "center",
    gap: 8
  },
  scanResultCardPending: {
    backgroundColor: colors.info
  },
  scanResultCardError: {
    backgroundColor: colors.dangerSoft
  },
  scanResultIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success
  },
  scanResultIconPending: {
    backgroundColor: colors.infoInk
  },
  scanResultIconError: {
    backgroundColor: colors.danger
  },
  scanResultTitle: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
    textAlign: "center"
  },
  scanResultSubtitle: {
    color: "#14532d",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "center"
  },
  scanResultSubtitlePending: {
    color: colors.infoInk
  },
  scanResultSubtitleError: {
    color: "#7f1d1d"
  },
  scanDismissHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    textAlign: "center"
  },
  manualHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  manualContent: {
    gap: 12,
    paddingTop: 4
  },
  manualInput: {
    minHeight: 92,
    maxHeight: 150,
    paddingTop: 12,
    textAlignVertical: "top"
  },
  scanResultAction: {
    width: "100%",
    marginTop: 6
  },
  inlineNotice: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    backgroundColor: colors.successSoft,
    padding: 12
  },
  inlineNoticeError: {
    backgroundColor: colors.dangerSoft,
    borderColor: "#fca5a5"
  },
  inlineNoticeText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
    textAlign: "center"
  },
  helperBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 6,
    backgroundColor: colors.surfaceMuted,
    padding: 12
  },
  helperText: {
    flex: 1,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10
  },
  searchButton: {
    minWidth: 104
  },
  list: {
    gap: 12
  },
  listItem: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 6,
    padding: 14,
    gap: 8
  },
  listHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8
  },
  listTitle: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 15,
    lineHeight: 20,
    flex: 1
  },
  listMeta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19
  },
  syncBadge: {
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 8,
    borderRadius: 4
  },
  syncBadgeText: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: "900"
  },
  syncBadgePending: {
    backgroundColor: colors.warningSoft
  },
  syncBadgeSynced: {
    backgroundColor: colors.successSoft
  },
  syncBadgeConflict: {
    backgroundColor: colors.dangerSoft
  },
  syncBadgeRejected: {
    backgroundColor: "#ffe4e6"
  },
  syncBadgeAdmitted: {
    backgroundColor: "#e0e7ff"
  },
  smallButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.ink,
    borderColor: colors.ink,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  smallButtonText: {
    color: colors.surface,
    fontWeight: "800",
    fontSize: 12
  },
  vipAction: {
    alignSelf: "flex-start",
    minWidth: 148
  },
  vipErrorBox: {
    backgroundColor: colors.dangerSoft
  },
  vipErrorText: {
    color: "#7f1d1d",
    fontWeight: "700"
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10
  },
  summaryItem: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 6,
    padding: 12
  },
  summaryValue: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900"
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2
  },
  emptyState: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 28
  },
  emptyStateTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center"
  },
  emptyStateText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center"
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700"
  }
});

export default styles;
