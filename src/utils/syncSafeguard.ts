export const CLOUD_SYNC_HISTORY_STORAGE_KEY = 'kasir_cloud_sync_history_v1';
export const DB_CLEARED_BY_USER_KEY = 'kasir_db_cleared_by_user';

export interface CloudCollectionHistoryEntry {
  lastServerCount: number;
  lastNonEmptyAt: number;
}

export type CloudCollectionHistoryMap = Record<string, CloudCollectionHistoryEntry>;

export type EmptySnapshotProtectionAction =
  | 'APPLY_CLOUD'
  | 'KEEP_LOCAL_ONLY'
  | 'KEEP_LOCAL_AND_BACKFILL';

export type EmptySnapshotProtectionReason =
  | 'CLOUD_HAS_DATA'
  | 'LOCAL_ALREADY_EMPTY'
  | 'EMPTY_CACHE_WAIT_SERVER'
  | 'EXPLICIT_USER_CLEAR'
  | 'REMOTE_CLEAR_CONFIRMED'
  | 'PROTECT_LOCAL_FROM_EMPTY_CLOUD';

export interface EmptySnapshotProtectionResult {
  action: EmptySnapshotProtectionAction;
  reason: EmptySnapshotProtectionReason;
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function resolveDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore storage access restrictions
  }
  return null;
}

export function readCloudCollectionHistory(
  storage: StorageLike | null = resolveDefaultStorage()
): CloudCollectionHistoryMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(CLOUD_SYNC_HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as CloudCollectionHistoryMap;
    }
  } catch {
    // Ignore malformed JSON
  }
  return {};
}

export function recordCloudNonEmptyCollection(
  collectionName: string,
  serverCount: number,
  storage: StorageLike | null = resolveDefaultStorage()
): CloudCollectionHistoryMap {
  const history = readCloudCollectionHistory(storage);
  if (!collectionName || serverCount <= 0) return history;

  const next: CloudCollectionHistoryMap = {
    ...history,
    [collectionName]: {
      lastServerCount: serverCount,
      lastNonEmptyAt: Date.now(),
    },
  };

  if (storage) {
    try {
      storage.setItem(CLOUD_SYNC_HISTORY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  }
  return next;
}

export function clearCloudCollectionHistory(
  storage: StorageLike | null = resolveDefaultStorage()
): void {
  if (!storage) return;
  try {
    storage.removeItem(CLOUD_SYNC_HISTORY_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function wasPreviouslyNonEmptyOnServer(
  collectionName: string,
  storage: StorageLike | null = resolveDefaultStorage()
): boolean {
  const history = readCloudCollectionHistory(storage);
  const entry = history[collectionName];
  return Boolean(entry && entry.lastServerCount > 0);
}

export function isUserExplicitlyClearedDatabase(
  storage: StorageLike | null = resolveDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(DB_CLEARED_BY_USER_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Evaluates whether an incoming empty collection snapshot from Firestore
 * should overwrite local device data or be safely blocked/backfilled.
 */
export function evaluateCloudEmptySnapshotProtection(params: {
  collectionName: string;
  mergedItemsCount: number;
  localItemsCount: number;
  fromCache: boolean;
  isUserClearedDb: boolean;
  serverHasBootstrapCore: boolean;
  wasPreviouslyNonEmpty: boolean;
}): EmptySnapshotProtectionResult {
  const {
    mergedItemsCount,
    localItemsCount,
    fromCache,
    isUserClearedDb,
    serverHasBootstrapCore,
    wasPreviouslyNonEmpty,
  } = params;

  if (mergedItemsCount > 0) {
    return { action: 'APPLY_CLOUD', reason: 'CLOUD_HAS_DATA' };
  }

  if (localItemsCount <= 0) {
    return { action: 'APPLY_CLOUD', reason: 'LOCAL_ALREADY_EMPTY' };
  }

  // Never let an empty in-memory/local Firestore SDK cache snapshot wipe hydrated localStorage data.
  if (fromCache) {
    return { action: 'KEEP_LOCAL_ONLY', reason: 'EMPTY_CACHE_WAIT_SERVER' };
  }

  // User intentionally clicked "Kosongkan Database (Mulai dari Awal)" on this device.
  if (isUserClearedDb) {
    return { action: 'APPLY_CLOUD', reason: 'EXPLICIT_USER_CLEAR' };
  }

  // Only accept an empty server snapshot if this browser previously synced real server data
  // for this collection AND the same live Firestore DB still contains core bootstrap docs (settings/users).
  if (wasPreviouslyNonEmpty && serverHasBootstrapCore) {
    return { action: 'APPLY_CLOUD', reason: 'REMOTE_CLEAR_CONFIRMED' };
  }

  // Otherwise, the connected Firestore database is empty/new or hasn't received local offline data yet.
  // Protect local data and backfill it safely to Firestore instead of wiping it to [].
  return {
    action: 'KEEP_LOCAL_AND_BACKFILL',
    reason: 'PROTECT_LOCAL_FROM_EMPTY_CLOUD',
  };
}
