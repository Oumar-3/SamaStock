import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

import { getSupabaseConfig } from "./config";

const config = getSupabaseConfig();
const SECURE_STORE_CHUNK_BYTES = 1800;
const CHUNKED_VALUE_PREFIX = "samastock-secure-v1";

function splitUtf8(value: string, maxBytes: number) {
  const chunks: string[] = [];
  let chunk = "";
  let chunkBytes = 0;

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const bytes = codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    if (chunk && chunkBytes + bytes > maxBytes) {
      chunks.push(chunk);
      chunk = "";
      chunkBytes = 0;
    }
    chunk += character;
    chunkBytes += bytes;
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}

function parseChunkManifest(value: string | null) {
  if (!value || !value.startsWith(CHUNKED_VALUE_PREFIX + ":")) return null;
  const parts = value.split(":");
  const generation = parts[1];
  const count = Number.parseInt(parts[2], 10);
  return generation && Number.isInteger(count) && count > 0 ? { generation, count } : null;
}

function chunkKey(key: string, generation: string, index: number) {
  return key + ".chunk." + generation + "." + index;
}

async function removeChunks(key: string, manifest: ReturnType<typeof parseChunkManifest>) {
  if (!manifest) return;
  await Promise.all(
    Array.from({ length: manifest.count }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, manifest.generation, index)).catch(() => {}),
    ),
  );
}

async function writeSecureValue(key: string, value: string) {
  const previousValue = await SecureStore.getItemAsync(key).catch(() => null);
  const previousManifest = parseChunkManifest(previousValue);
  const chunks = splitUtf8(value, SECURE_STORE_CHUNK_BYTES);

  if (chunks.length <= 1) {
    await SecureStore.setItemAsync(key, value);
    await removeChunks(key, previousManifest);
    return;
  }

  const generation = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  await Promise.all(
    chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, generation, index), chunk)),
  );
  await SecureStore.setItemAsync(
    key,
    CHUNKED_VALUE_PREFIX + ":" + generation + ":" + chunks.length,
  );
  await removeChunks(key, previousManifest);
}

async function readSecureValue(key: string) {
  const storedValue = await SecureStore.getItemAsync(key);
  const manifest = parseChunkManifest(storedValue);
  if (!manifest) return storedValue;

  const chunks = await Promise.all(
    Array.from({ length: manifest.count }, (_, index) =>
      SecureStore.getItemAsync(chunkKey(key, manifest.generation, index)),
    ),
  );
  return chunks.every((chunk): chunk is string => chunk !== null) ? chunks.join("") : null;
}

const webStorage = {
  getItem: (key: string) => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Ignore unavailable browser storage.
    }
  },
  removeItem: (key: string) => {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Ignore unavailable browser storage.
    }
  },
};

const secureMobileStorage = {
  getItem: async (key: string) => {
    try {
      const secureValue = await readSecureValue(key);
      if (secureValue) return secureValue;

      const legacyValue = await AsyncStorage.getItem(key);
      if (legacyValue) {
        await writeSecureValue(key, legacyValue);
        await AsyncStorage.removeItem(key);
      }
      return legacyValue;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    await writeSecureValue(key, value);
    await AsyncStorage.removeItem(key).catch(() => {});
  },
  removeItem: async (key: string) => {
    const manifest = parseChunkManifest(await SecureStore.getItemAsync(key).catch(() => null));
    await removeChunks(key, manifest);
    await SecureStore.deleteItemAsync(key);
    await AsyncStorage.removeItem(key).catch(() => {});
  },
};

export const supabase = config.isConfigured
  ? createClient(config.url, config.anonKey, {
      auth: {
        storageKey: config.authStorageKey,
        storage: Platform.OS === "web" ? webStorage : secureMobileStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error("Supabase n'est pas configure. Renseignez EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return supabase;
}

export function isSupabaseConfigured() {
  return config.isConfigured;
}

export function getSupabaseAuthStorageKey() {
  return config.authStorageKey;
}