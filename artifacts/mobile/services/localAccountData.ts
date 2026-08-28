import AsyncStorage from "@react-native-async-storage/async-storage";

import { clearAllLocalDataAsync, getDatabaseAsync } from "@/database";

const ACTIVE_OWNER_KEY = "@samastock_active_owner_id";
const OFFLINE_MODE_KEY = "@samastock_offline_mode";

export async function getActiveCloudOwnerIdAsync() {
  return AsyncStorage.getItem(ACTIVE_OWNER_KEY);
}

export async function isOfflineModeAsync() {
  return (await AsyncStorage.getItem(OFFLINE_MODE_KEY)) === "true";
}

export async function enableOfflineModeAsync() {
  await AsyncStorage.multiSet([
    [OFFLINE_MODE_KEY, "true"],
    [ACTIVE_OWNER_KEY, ""],
  ]);
}

export async function createLocalMainShopForOfflineAsync(name: string, ownerName: string) {
  return createLocalMainShopForCloudUserAsync("offline", name, ownerName);
}

export async function disableOfflineModeAsync() {
  await AsyncStorage.removeItem(OFFLINE_MODE_KEY);
}

export async function prepareLocalDataForCloudUserAsync(userId: string) {
  const previousOwnerId = await AsyncStorage.getItem(ACTIVE_OWNER_KEY);
  if (previousOwnerId && previousOwnerId !== userId) {
    await clearAllLocalDataAsync();
  }
  await disableOfflineModeAsync();
  await AsyncStorage.setItem(ACTIVE_OWNER_KEY, userId);
}

export async function resetLocalDataForCloudUserAsync(userId: string) {
  await clearAllLocalDataAsync();
  await disableOfflineModeAsync();
  await AsyncStorage.setItem(ACTIVE_OWNER_KEY, userId);
}

export async function clearCloudUserLocalDataAsync() {
  await clearAllLocalDataAsync();
  await AsyncStorage.removeItem(ACTIVE_OWNER_KEY);
  await disableOfflineModeAsync();
}

export async function createLocalMainShopForCloudUserAsync(userId: string, name: string, ownerName: string) {
  const db = await getDatabaseAsync();
  const now = new Date().toISOString();
  const shopId = `${userId}:main`;

  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE shops SET is_active = 0 WHERE id != ?", shopId);
    await db.runAsync(
      `INSERT INTO shops (
        id, name, owner_name, phone, address, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, '', '', 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        owner_name = excluded.owner_name,
        is_active = 1,
        updated_at = excluded.updated_at`,
      shopId,
      name.trim(),
      ownerName.trim(),
      now,
      now,
    );
  });

  return shopId;
}