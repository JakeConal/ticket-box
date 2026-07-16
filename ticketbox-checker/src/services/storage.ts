import { Platform } from "react-native";
import * as ExpoSecureStore from "expo-secure-store";

export const TOKEN_STORAGE_KEY = "ticketbox.jwt";
export const REFRESH_TOKEN_STORAGE_KEY = "ticketbox.refreshToken";
export const CONCERT_STORAGE_KEY = "ticketbox.concertId";
export const KEY_BUNDLE_STORAGE_KEY = "ticketbox.keyBundle";
export const ASSIGNMENTS_STORAGE_KEY = "ticketbox.assignments";
export const DEVICE_STORAGE_KEY = "ticketbox.deviceId";

const webSecureStore = {
  getItemAsync: async (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItemAsync: async (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  deleteItemAsync: async (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
};

export const SecureStore = Platform.OS === 'web' ? webSecureStore : ExpoSecureStore;

export function readJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
