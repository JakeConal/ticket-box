import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View
} from "react-native";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  LogIn,
  MapPin,
  RefreshCw,
  X
} from "lucide-react-native";
import { ActionButton, FormInput } from "../components/UI";
import styles from "../styles";
import type { ConcertOption } from "../types";

type LoginScreenProps = {
  concertId: string;
  setConcertId: (value: string) => void;
  concerts: ConcertOption[];
  concertsError: string | null;
  isConcertsLoading: boolean;
  onReloadConcerts: () => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  isLoading: boolean;
  onLogin: () => void;
};

export function LoginScreen({
  concertId,
  setConcertId,
  concerts,
  concertsError,
  isConcertsLoading,
  onReloadConcerts,
  email,
  setEmail,
  password,
  setPassword,
  isLoading,
  onLogin
}: LoginScreenProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [isEventPickerOpen, setIsEventPickerOpen] = useState(false);
  const emailRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);
  const selectedConcert = useMemo(
    () => concerts.find((concert) => concert.id === concertId) ?? null,
    [concertId, concerts]
  );
  const canSubmit = Boolean(selectedConcert && email.trim() && password);
  const eventSelectorDisabled = isConcertsLoading || concerts.length === 0;

  function selectConcert(nextConcertId: string) {
    setConcertId(nextConcertId);
    setIsEventPickerOpen(false);
  }

  return (
    <View style={styles.panel}>
      <View style={styles.cardPanel}>
        <Text style={styles.eyebrow}>TICKETBOX OPERATIONS</Text>
        <Text style={styles.panelTitle}>Checker sign in</Text>
        <Text style={styles.mutedText}>
          Choose the event and sign in once to prepare gate assignments and verification keys for offline work.
        </Text>

        <View style={styles.form}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Event</Text>
            <Pressable
              accessibilityHint="Opens the list of published events"
              accessibilityLabel={selectedConcert ? `Event, ${selectedConcert.name}` : "Select event"}
              accessibilityRole="button"
              accessibilityState={{ disabled: eventSelectorDisabled, expanded: isEventPickerOpen }}
              disabled={eventSelectorDisabled}
              onPress={() => setIsEventPickerOpen(true)}
              style={({ pressed }) => [
                styles.eventSelect,
                eventSelectorDisabled && styles.inputDisabled,
                pressed && !eventSelectorDisabled && styles.pressedControl
              ]}
            >
              <View style={styles.eventSelectContent}>
                {isConcertsLoading ? (
                  <View style={styles.eventLoadingRow}>
                    <ActivityIndicator color="#111827" size="small" />
                    <Text style={styles.eventPlaceholder}>Loading events...</Text>
                  </View>
                ) : selectedConcert ? (
                  <>
                    <Text numberOfLines={2} style={styles.eventSelectValue}>{selectedConcert.name}</Text>
                    <Text numberOfLines={1} style={styles.eventSelectMeta}>
                      {eventMeta(selectedConcert)}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.eventPlaceholder}>
                    {concerts.length > 0 ? "Select an event" : "No events available"}
                  </Text>
                )}
              </View>
              <ChevronDown color="#374151" size={22} strokeWidth={2.3} />
            </Pressable>
            {concertsError ? <Text style={styles.fieldError}>{concertsError}</Text> : null}
            {!concertsError && !isConcertsLoading && concerts.length > 0 ? (
              <Text style={styles.fieldHint}>{concerts.length} published event{concerts.length === 1 ? "" : "s"} available</Text>
            ) : null}
            {(concertsError || (!isConcertsLoading && concerts.length === 0)) ? (
              <ActionButton
                icon={<RefreshCw color="#111827" size={18} strokeWidth={2.4} />}
                label="Reload events"
                loading={isConcertsLoading}
                onPress={onReloadConcerts}
                variant="secondary"
              />
            ) : null}
          </View>

          <FormInput
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect={false}
            keyboardType="email-address"
            importantForAutofill="yes"
            label="Checker email"
            onChangeText={setEmail}
            onSubmitEditing={() => passwordRef.current?.focus()}
            placeholder="checker@example.com"
            returnKeyType="next"
            ref={emailRef}
            textContentType="username"
            value={email}
          />
          <FormInput
            autoCapitalize="none"
            autoComplete="current-password"
            autoCorrect={false}
            label="Password"
            importantForAutofill="yes"
            onChangeText={setPassword}
            onSubmitEditing={canSubmit && !isLoading ? onLogin : undefined}
            placeholder="Enter password"
            returnKeyType="done"
            ref={passwordRef}
            secureTextEntry={!showPassword}
            textContentType="password"
            value={password}
          />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: showPassword }}
            onPress={() => setShowPassword((visible) => !visible)}
            style={({ pressed }) => [styles.passwordToggle, pressed && styles.pressedControl]}
          >
            {showPassword ? (
              <EyeOff color="#374151" size={18} strokeWidth={2.2} />
            ) : (
              <Eye color="#374151" size={18} strokeWidth={2.2} />
            )}
            <Text style={styles.passwordToggleText}>{showPassword ? "Hide password" : "Show password"}</Text>
          </Pressable>

          <ActionButton
            disabled={!canSubmit}
            icon={<LogIn color="#ffffff" size={20} strokeWidth={2.4} />}
            label="Sign in and prepare checker"
            loading={isLoading}
            onPress={onLogin}
          />
        </View>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsEventPickerOpen(false)}
        statusBarTranslucent
        transparent
        visible={isEventPickerOpen}
      >
        <View style={styles.eventModalBackdrop}>
          <Pressable
            accessibilityLabel="Close event list"
            accessibilityRole="button"
            onPress={() => setIsEventPickerOpen(false)}
            style={styles.eventModalDismissArea}
          />
          <View accessibilityViewIsModal style={styles.eventModalPanel}>
            <View style={styles.eventModalHeader}>
              <View style={styles.eventModalTitleBlock}>
                <Text style={styles.eyebrow}>CHECKER EVENT</Text>
                <Text style={styles.sectionTitle}>Select an event</Text>
              </View>
              <Pressable
                accessibilityLabel="Close event list"
                accessibilityRole="button"
                onPress={() => setIsEventPickerOpen(false)}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressedControl]}
              >
                <X color="#111827" size={22} strokeWidth={2.4} />
              </Pressable>
            </View>
            <FlatList
              contentContainerStyle={styles.eventList}
              data={concerts}
              keyExtractor={(concert) => concert.id}
              renderItem={({ item }) => {
                const selected = item.id === concertId;
                return (
                  <Pressable
                    accessibilityLabel={`${item.name}, ${eventMeta(item)}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => selectConcert(item.id)}
                    style={({ pressed }) => [
                      styles.eventOption,
                      selected && styles.eventOptionSelected,
                      pressed && styles.pressedControl
                    ]}
                  >
                    <View style={styles.eventOptionContent}>
                      <Text style={styles.eventOptionName}>{item.name}</Text>
                      <View style={styles.eventOptionMetaRow}>
                        <CalendarDays color="#5b6472" size={16} strokeWidth={2.2} />
                        <Text style={styles.eventOptionMeta}>{formatEventDate(item.eventDate)}</Text>
                      </View>
                      {item.venue ? (
                        <View style={styles.eventOptionMetaRow}>
                          <MapPin color="#5b6472" size={16} strokeWidth={2.2} />
                          <Text numberOfLines={2} style={styles.eventOptionMeta}>{item.venue}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={[styles.eventCheck, selected && styles.eventCheckSelected]}>
                      {selected ? <Check color="#ffffff" size={17} strokeWidth={3} /> : null}
                    </View>
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function eventMeta(concert: ConcertOption) {
  const parts = [formatEventDate(concert.eventDate), concert.venue].filter(Boolean);
  return parts.join(" | ");
}

function formatEventDate(value: string) {
  if (!value) {
    return "Date to be confirmed";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Date to be confirmed";
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
