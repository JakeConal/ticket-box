import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.panel}>
        <Text style={styles.eyebrow}>TicketBox Checker</Text>
        <Text style={styles.title}>Mobile check-in starter</Text>
        <Text style={styles.body}>
          This app will handle checker login, offline QR validation, local
          SQLite scan storage, and sync back to the TicketBox API.
        </Text>
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    padding: 24
  },
  panel: {
    gap: 12
  },
  eyebrow: {
    color: "#047857",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  title: {
    color: "#020617",
    fontSize: 32,
    fontWeight: "700"
  },
  body: {
    color: "#334155",
    fontSize: 16,
    lineHeight: 24
  }
});
