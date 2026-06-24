import React from "react";
import { View, Text, Pressable } from "react-native";
import { FormInput } from "../components/UI";
import styles from "../styles";

type LoginScreenProps = {
  apiBaseUrl: string;
  setApiBaseUrl: (val: string) => void;
  concertId: string;
  setConcertId: (val: string) => void;
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  onLogin: () => void;
};

export function LoginScreen({
  apiBaseUrl,
  setApiBaseUrl,
  concertId,
  setConcertId,
  email,
  setEmail,
  password,
  setPassword,
  onLogin
}: LoginScreenProps) {
  return (
    <View style={styles.panel}>
      <View style={styles.cardPanel}>
        <Text style={styles.eyebrow}>TICKETBOX</Text>
        <Text style={styles.panelTitle}>CHECKER SIGN IN</Text>
        <Text style={styles.mutedText}>Enter the server address and your credentials to sync assignments.</Text>
        
        <View style={styles.form}>
          <FormInput label="API Base URL" value={apiBaseUrl} onChangeText={setApiBaseUrl} placeholder="e.g. http://localhost:8088" autoCapitalize="none" autoCorrect={false} />
          <FormInput label="Concert ID" value={concertId} onChangeText={setConcertId} placeholder="Concert ID" autoCapitalize="none" autoCorrect={false} />
          <FormInput label="Checker Email" value={email} onChangeText={setEmail} placeholder="checker@example.com" autoCapitalize="none" autoCorrect={false} />
          <FormInput label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry autoCapitalize="none" autoCorrect={false} />
          
          <Pressable style={styles.primaryButton} onPress={onLogin}>
            <Text style={styles.primaryButtonText}>Sign in & cache assignment</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
