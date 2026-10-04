// 端末に保存する値 (トークンは expo-secure-store)。Web で動かすときは localStorage を使う
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const KEYS = {
  token: "inventory_auth_token",
} as const;

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return await SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string | null): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (value == null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
    } catch {
      // プライベートブラウズなど
    }
    return;
  }
  if (value == null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}
