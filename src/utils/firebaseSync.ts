import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  writeBatch, 
  getDocs,
  getDocsFromServer,
  getDocFromServer,
  query,
  limit,
  enableNetwork,
  disableNetwork,
  waitForPendingWrites,
  onSnapshotsInSync
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  enqueueOfflineSyncJob,
  flushOfflineSyncQueue,
  getOfflineQueueCount,
  getOfflineSyncQueue,
  OfflineFlushResult,
  OfflineSyncJob,
  subscribeOfflineSyncQueue,
} from './offlineQueue';
import {
  getSyncModuleLabel,
  initializeBackgroundSyncProgress,
  recordModuleSyncActivity,
  scheduleClearCompletedSyncProgress,
  SYNC_MODULE_DEFINITIONS,
  updateCollectionSyncProgress,
} from './syncTelemetry';
import {
  detectSyncConflictsReport,
  LocalCollectionsSnapshotInput,
  ServerCollectionsSnapshotMap,
  SyncHealthAuditReport,
} from './syncConflictDetector';
import { sanitizeStoreSettingsForFirestore } from './settingsSanitizer';

export type CloudSyncStatus = 'INITIALIZING' | 'SYNCED' | 'CONNECTING' | 'OFFLINE' | 'ERROR';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
  };
}

export function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path,
  };
}

export type FirestoreConnectionLogStatus = 'SUCCESS' | 'ERROR' | 'PAUSED' | 'INFO';

export interface FirestoreConnectionLogEntry {
  id: string;
  timestamp: number;
  status: FirestoreConnectionLogStatus;
  operation: string;
  message: string;
  latencyMs?: number;
  errorCode?: string;
}

export interface FirestoreVerificationResult {
  ok: boolean;
  timestamp: number;
  latencyMs: number;
  message: string;
  errorCode?: string;
  docReadOk: boolean;
  listQueryOk: boolean;
  networkOnline: boolean;
  queueCleared?: boolean;
  queueFlushStatus?: 'CLEAN' | 'FLUSHED' | 'TIMEOUT' | 'SKIPPED';
}

const CONNECTION_LOGS_STORAGE_KEY = 'kasir_firestore_connection_logs';
const MAX_CONNECTION_LOGS = 25;
let connectionLogsCache: FirestoreConnectionLogEntry[] | null = null;
const connectionLogListeners = new Set<(logs: FirestoreConnectionLogEntry[]) => void>();

function loadConnectionLogs(): FirestoreConnectionLogEntry[] {
  if (connectionLogsCache !== null) return connectionLogsCache;
  if (typeof window === 'undefined') {
    connectionLogsCache = [];
    return connectionLogsCache;
  }
  try {
    const raw = window.localStorage.getItem(CONNECTION_LOGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        connectionLogsCache = parsed.slice(0, MAX_CONNECTION_LOGS);
        return connectionLogsCache;
      }
    }
  } catch {
    // ignore storage errors
  }
  connectionLogsCache = [];
  return connectionLogsCache;
}

function persistConnectionLogs(logs: FirestoreConnectionLogEntry[]): void {
  connectionLogsCache = logs;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CONNECTION_LOGS_STORAGE_KEY, JSON.stringify(logs));
    } catch {
      // ignore storage quota errors
    }
  }
  connectionLogListeners.forEach((listener) => {
    try {
      listener(logs);
    } catch {
      // ignore listener errors
    }
  });
}

export function getFirestoreConnectionLogs(): FirestoreConnectionLogEntry[] {
  return [...loadConnectionLogs()];
}

export function appendFirestoreConnectionLog(
  entry: Omit<FirestoreConnectionLogEntry, 'id' | 'timestamp'>
): FirestoreConnectionLogEntry[] {
  const existing = loadConnectionLogs();
  const now = Date.now();
  const latest = existing[0];

  // Deduplicate identical consecutive status+message within 4 seconds (e.g., 14 listeners failing together)
  if (
    latest &&
    latest.status === entry.status &&
    latest.message === entry.message &&
    now - latest.timestamp < 4000
  ) {
    return [...existing];
  }

  const nextEntry: FirestoreConnectionLogEntry = {
    ...entry,
    id: `fclog_${now}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now,
  };
  const next = [nextEntry, ...existing].slice(0, MAX_CONNECTION_LOGS);
  persistConnectionLogs(next);
  return [...next];
}

export function clearFirestoreConnectionLogs(): FirestoreConnectionLogEntry[] {
  persistConnectionLogs([]);
  return [];
}

export function subscribeFirestoreConnectionLogs(
  listener: (logs: FirestoreConnectionLogEntry[]) => void
): () => void {
  connectionLogListeners.add(listener);
  listener(getFirestoreConnectionLogs());
  return () => {
    connectionLogListeners.delete(listener);
  };
}

let liveSdkPendingWritesCount = 0;
let pendingSyncQueueCount = getOfflineQueueCount();
const syncQueueListeners = new Set<(count: number) => void>();

function recomputeAndNotifyPendingCount(): void {
  const combined = Math.max(0, liveSdkPendingWritesCount) + getOfflineQueueCount();
  pendingSyncQueueCount = combined;
  syncQueueListeners.forEach((listener) => {
    try {
      listener(combined);
    } catch {
      // ignore
    }
  });
}

function setPendingSyncQueueCount(next: number): void {
  liveSdkPendingWritesCount = Math.max(0, next);
  recomputeAndNotifyPendingCount();
}

export function getPendingSyncQueueCount(): number {
  return Math.max(0, liveSdkPendingWritesCount) + getOfflineQueueCount();
}

export function clearPendingSyncQueueStatus(): void {
  liveSdkPendingWritesCount = 0;
  recomputeAndNotifyPendingCount();
}

export function subscribePendingSyncQueue(
  listener: (pendingCount: number) => void
): () => void {
  syncQueueListeners.add(listener);
  listener(getPendingSyncQueueCount());

  const unsubOfflineQueue = subscribeOfflineSyncQueue(() => {
    recomputeAndNotifyPendingCount();
  });

  const unsubInSync = onSnapshotsInSync(db, () => {
    const isNetworkOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!cloudSyncPaused && isNetworkOnline) {
      liveSdkPendingWritesCount = 0;
      recomputeAndNotifyPendingCount();
    }
  });

  return () => {
    syncQueueListeners.delete(listener);
    unsubOfflineQueue();
    unsubInSync();
  };
}

export function logFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  const rawCode = String((error as any)?.code || '').trim();
  appendFirestoreConnectionLog({
    status: 'ERROR',
    operation: `${operationType.toUpperCase()}${path ? ` (${path})` : ''}`,
    message: formatFirestoreSyncErrorMessage(error),
    errorCode: rawCode || undefined,
  });
  return errInfo;
}

export function formatFirestoreSyncErrorMessage(error: unknown): string {
  const rawCode = String((error as any)?.code || '').toLowerCase();
  const rawMsg = (error instanceof Error ? error.message : String(error || '')).toLowerCase();

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Perangkat tidak terhubung ke internet (Offline).';
  }
  if (rawCode.includes('permission-denied') || rawMsg.includes('permission') || rawMsg.includes('insufficient')) {
    return 'Izin akses Firestore ditolak oleh aturan keamanan (Permission Denied).';
  }
  if (rawCode.includes('resource-exhausted') || rawMsg.includes('quota')) {
    return 'Kuota baca/tulis harian Firebase Firestore telah tercapai.';
  }
  if (rawCode.includes('unavailable') || rawMsg.includes('offline') || rawMsg.includes('network')) {
    return 'Server Firebase Firestore tidak dapat dijangkau dari jaringan saat ini.';
  }
  if (rawCode.includes('not-found')) {
    return 'Database atau koleksi Firebase Firestore tidak ditemukan.';
  }
  return 'Koneksi real-time Firebase terganggu. Data sementara disimpan lokal di perangkat.';
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo = logFirestoreError(error, operationType, path);
  throw new Error(JSON.stringify(errInfo));
}

let cloudSyncPaused = false;
let isSdkNetworkDisabled = false;
let networkTransitionQueue: Promise<void> = Promise.resolve();

function enqueueNetworkTransition(task: () => Promise<void>): Promise<void> {
  const next = networkTransitionQueue.then(task, task);
  networkTransitionQueue = next.catch(() => {});
  return next;
}

export function isCloudSyncPaused(): boolean {
  return cloudSyncPaused;
}

export function setCloudSyncPaused(paused: boolean): void {
  cloudSyncPaused = paused;
}

/**
 * Pauses Firestore network synchronization and switches Firestore client to Local Only mode
 */
export async function pauseFirestoreCloudSync(): Promise<void> {
  cloudSyncPaused = true;
  await enqueueNetworkTransition(async () => {
    if (!cloudSyncPaused || isSdkNetworkDisabled) return;
    try {
      await disableNetwork(db);
      isSdkNetworkDisabled = true;
      appendFirestoreConnectionLog({
        status: 'PAUSED',
        operation: 'MODE LOKAL',
        message: 'Sinkronisasi cloud dijeda secara manual (Mode Local Only aktif).',
      });
    } catch (error) {
      console.warn('[FirebaseSync] Notice while disabling Firestore network:', error);
    }
  });
}

/**
 * Resumes Firestore network synchronization for real-time multi-device updates.
 * Only calls enableNetwork(db) when the SDK network was actually disabled via disableNetwork(db),
 * preventing duplicate WatchStream target registrations in Firestore Web SDK.
 */
export async function resumeFirestoreCloudSync(): Promise<void> {
  const wasPaused = cloudSyncPaused;
  cloudSyncPaused = false;
  await enqueueNetworkTransition(async () => {
    if (cloudSyncPaused || !isSdkNetworkDisabled) return;
    try {
      await enableNetwork(db);
      isSdkNetworkDisabled = false;
      if (wasPaused) {
        appendFirestoreConnectionLog({
          status: 'INFO',
          operation: 'REKONEKSI',
          message: 'Mengaktifkan jalur sinkronisasi real-time ke server Firebase Firestore.',
        });
      }
    } catch (error) {
      console.warn('[FirebaseSync] Notice while enabling Firestore network:', error);
    }
  });
}

/**
 * Tests direct server connectivity to Firebase Firestore and records a diagnostic log
 */
export async function verifyFirestoreServerConnection(options?: {
  forceResumeNetwork?: boolean;
  flushPendingQueue?: boolean;
  operationLabel?: string;
}): Promise<FirestoreVerificationResult> {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const networkOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  const opLabel = options?.operationLabel || 'VERIFIKASI SERVER';

  if (cloudSyncPaused && !options?.forceResumeNetwork) {
    const result: FirestoreVerificationResult = {
      ok: false,
      timestamp: Date.now(),
      latencyMs: 0,
      message: 'Sinkronisasi sedang dalam mode Local Only (dijeda secara manual). Aktifkan Real-Time Sync untuk memverifikasi server.',
      errorCode: 'manual-offline-mode',
      docReadOk: false,
      listQueryOk: false,
      networkOnline,
      queueCleared: false,
      queueFlushStatus: 'SKIPPED',
    };
    appendFirestoreConnectionLog({
      status: 'PAUSED',
      operation: opLabel,
      message: result.message,
      errorCode: result.errorCode,
    });
    return result;
  }

  if (!networkOnline) {
    const result: FirestoreVerificationResult = {
      ok: false,
      timestamp: Date.now(),
      latencyMs: 0,
      message: 'Perangkat tidak terhubung ke internet (Offline).',
      errorCode: 'network-offline',
      docReadOk: false,
      listQueryOk: false,
      networkOnline: false,
      queueCleared: false,
      queueFlushStatus: 'SKIPPED',
    };
    appendFirestoreConnectionLog({
      status: 'ERROR',
      operation: opLabel,
      message: result.message,
      errorCode: result.errorCode,
    });
    return result;
  }

  let docReadOk = false;
  let listQueryOk = false;

  try {
    if (options?.forceResumeNetwork) {
      await resumeFirestoreCloudSync();
    }

    await getDocFromServer(doc(db, 'settings', 'store_config'));
    docReadOk = true;

    await getDocsFromServer(query(collection(db, 'products'), limit(1)));
    listQueryOk = true;

    let flushedOfflineCount = 0;
    let queueFlushStatus: 'CLEAN' | 'FLUSHED' | 'TIMEOUT' | 'SKIPPED' =
      getPendingSyncQueueCount() > 0 ? 'FLUSHED' : 'CLEAN';
    let queueCleared = false;

    if (options?.flushPendingQueue) {
      const offlineBefore = getOfflineQueueCount();
      if (offlineBefore > 0) {
        const flushRes = await flushPendingOfflineWrites();
        flushedOfflineCount = flushRes.flushedCount;
      }

      const hadPendingSdk = liveSdkPendingWritesCount > 0;
      const flushOutcome = await Promise.race<'OK' | 'TIMEOUT'>([
        waitForPendingWrites(db).then(() => 'OK' as const),
        new Promise<'TIMEOUT'>((resolve) => setTimeout(() => resolve('TIMEOUT'), 5000)),
      ]);
      if (flushOutcome === 'TIMEOUT') {
        queueFlushStatus = 'TIMEOUT';
      } else {
        liveSdkPendingWritesCount = 0;
        recomputeAndNotifyPendingCount();
        queueCleared = getOfflineQueueCount() === 0;
        queueFlushStatus =
          flushedOfflineCount > 0 || hadPendingSdk ? 'FLUSHED' : 'CLEAN';
      }
    } else {
      liveSdkPendingWritesCount = 0;
      recomputeAndNotifyPendingCount();
      queueCleared = getOfflineQueueCount() === 0;
    }

    const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const latencyMs = Math.max(1, Math.round(endedAt - startedAt));
    const queueNote = options?.flushPendingQueue
      ? flushedOfflineCount > 0
        ? ` • ${flushedOfflineCount} data antrean offline berhasil disinkronkan`
        : queueFlushStatus === 'TIMEOUT'
        ? ' • Antrean tulis tunggu konfirmasi jaringan'
        : ' • Status antrean sync bersih'
      : '';
    const result: FirestoreVerificationResult = {
      ok: true,
      timestamp: Date.now(),
      latencyMs,
      message: `Koneksi server Firestore terverifikasi aktif (baca dokumen & kueri koleksi berhasil dalam ${latencyMs} ms${queueNote}).`,
      docReadOk: true,
      listQueryOk: true,
      networkOnline: true,
      queueCleared,
      queueFlushStatus,
    };
    appendFirestoreConnectionLog({
      status: 'SUCCESS',
      operation: opLabel,
      message: result.message,
      latencyMs,
    });
    return result;
  } catch (error) {
    const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const latencyMs = Math.max(1, Math.round(endedAt - startedAt));
    const rawCode = String((error as any)?.code || '').trim() || undefined;
    const formattedMessage = formatFirestoreSyncErrorMessage(error);
    const result: FirestoreVerificationResult = {
      ok: false,
      timestamp: Date.now(),
      latencyMs,
      message: formattedMessage,
      errorCode: rawCode,
      docReadOk,
      listQueryOk,
      networkOnline,
      queueCleared: false,
      queueFlushStatus: 'SKIPPED',
    };
    appendFirestoreConnectionLog({
      status: 'ERROR',
      operation: opLabel,
      message: `${formattedMessage}${!docReadOk ? ' (Gagal baca dokumen)' : !listQueryOk ? ' (Gagal kueri list koleksi)' : ''}`,
      latencyMs,
      errorCode: rawCode,
    });
    return result;
  }
}

function isNetworkOrOfflineWriteError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = String((error as { code?: unknown })?.code || '').toLowerCase();
  const msg = String((error as { message?: unknown })?.message || '').toLowerCase();
  return (
    code.includes('unavailable') ||
    code.includes('deadline-exceeded') ||
    code.includes('aborted') ||
    code.includes('network') ||
    msg.includes('offline') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('client is offline')
  );
}

/**
 * Flushes all locally queued offline mutations in FIFO chronological order to Firestore,
 * updating real-time per-collection background sync progress and per-module activity logs.
 */
export async function flushPendingOfflineWrites(): Promise<OfflineFlushResult> {
  if (cloudSyncPaused) {
    return {
      flushedCount: 0,
      failedCount: 0,
      remainingCount: getOfflineQueueCount(),
      abortedByNetwork: false,
      lastError: 'Cloud Sync sedang dijeda secara manual (Local Only).',
    };
  }

  const queueSnapshot = getOfflineSyncQueue();
  if (queueSnapshot.length > 0) {
    const grouped = new Map<string, { count: number; summary: string }>();
    queueSnapshot.forEach((job) => {
      const existing = grouped.get(job.collectionName);
      grouped.set(job.collectionName, {
        count: (existing?.count || 0) + 1,
        summary: existing?.summary || job.summary,
      });
    });

    initializeBackgroundSyncProgress(
      'QUEUE_FLUSH',
      Array.from(grouped.entries()).map(([collectionName, info]) => ({
        collectionName,
        totalDocs: info.count,
        operationLabel: 'Sinkronisasi Antrean Offline',
        currentItemSummary: info.summary,
      }))
    );
  }

  const jobStartTimes = new Map<string, number>();

  const res = await flushOfflineSyncQueue({
    isRetryableNetworkError: isNetworkOrOfflineWriteError,
    onProgress: (ev) => {
      const { phase, collectionName, job, collectionProcessed, collectionTotal, collectionFailed } = ev;
      if (phase === 'JOB_START') {
        jobStartTimes.set(job.id, Date.now());
        updateCollectionSyncProgress(collectionName, {
          mode: 'QUEUE_FLUSH',
          status: 'SYNCING',
          totalDocs: collectionTotal,
          processedDocs: collectionProcessed,
          failedDocs: collectionFailed,
          operationLabel: 'Mengirim ke Firestore',
          currentItemSummary: job.summary,
        });
      } else if (phase === 'JOB_SUCCESS') {
        const started = jobStartTimes.get(job.id) || Date.now();
        const latencyMs = Math.max(1, Date.now() - started);
        const recCount = job.kind === 'BATCH_UPSERT' ? (job.items?.length || 1) : 1;
        const isDone = collectionProcessed >= collectionTotal && collectionFailed === 0;
        updateCollectionSyncProgress(collectionName, {
          mode: 'QUEUE_FLUSH',
          status: isDone ? 'COMPLETED' : 'SYNCING',
          totalDocs: collectionTotal,
          processedDocs: collectionProcessed,
          failedDocs: collectionFailed,
          operationLabel: isDone ? 'Tersinkronisasi ke Server' : 'Mengirim ke Firestore',
          currentItemSummary: job.summary,
        });
        recordModuleSyncActivity({
          collectionName,
          direction: 'UPLOAD',
          operation: 'QUEUE_FLUSH',
          status: 'SUCCESS',
          recordCount: recCount,
          latencyMs,
          docId: job.docId,
          summary: `Antrean offline terkirim: ${job.summary}`,
        });
      } else if (phase === 'JOB_ERROR') {
        const started = jobStartTimes.get(job.id) || Date.now();
        const latencyMs = Math.max(1, Date.now() - started);
        updateCollectionSyncProgress(collectionName, {
          mode: 'QUEUE_FLUSH',
          status: 'ERROR',
          totalDocs: collectionTotal,
          processedDocs: collectionProcessed,
          failedDocs: collectionFailed,
          operationLabel: ev.abortedByNetwork ? 'Jaringan Tidak Stabil' : 'Gagal Validasi Server',
          currentItemSummary: job.summary,
          errorMessage: ev.errorMessage,
        });
        recordModuleSyncActivity({
          collectionName,
          direction: 'UPLOAD',
          operation: 'QUEUE_FLUSH',
          status: 'ERROR',
          recordCount: job.kind === 'BATCH_UPSERT' ? (job.items?.length || 1) : 1,
          latencyMs,
          docId: job.docId,
          summary: `Gagal mengirim antrean: ${job.summary}`,
          errorMessage: ev.errorMessage,
        });
      } else if (phase === 'DONE') {
        scheduleClearCompletedSyncProgress(5500);
      }
    },
    upsertDoc: async (collectionName, docId, data) => {
      const docRef = doc(db, collectionName, docId);
      await setDoc(docRef, sanitizeForFirestore(data), { merge: true });
    },
    deleteDoc: async (collectionName, docId) => {
      const docRef = doc(db, collectionName, docId);
      await deleteDoc(docRef);
    },
    upsertBatch: async (collectionName, items) => {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((it) => {
          const docRef = doc(db, collectionName, it.id);
          batch.set(docRef, sanitizeForFirestore(it.data), { merge: true });
        });
        await batch.commit();
      }
    },
    saveSettings: async (settings, replace) => {
      const docRef = doc(db, 'settings', 'store_config');
      const safeSettings = sanitizeStoreSettingsForFirestore(settings);
      await setDoc(docRef, sanitizeForFirestore(safeSettings), { merge: !replace });
    },
  });

  recomputeAndNotifyPendingCount();

  if (res.flushedCount > 0) {
    appendFirestoreConnectionLog({
      status: 'SUCCESS',
      operation: 'AUTO SYNC OFFLINE',
      message: `${res.flushedCount} perubahan dari antrean Mode Offline berhasil disinkronkan ke server.${res.remainingCount > 0 ? ` Sisa antrean: ${res.remainingCount}.` : ''}`,
    });
  } else if (res.lastError && !res.abortedByNetwork && res.failedCount > 0) {
    appendFirestoreConnectionLog({
      status: 'ERROR',
      operation: 'SYNC OFFLINE QUEUE',
      message: `Sebagian antrean offline gagal divalidasi server: ${res.lastError}`,
    });
  }

  return res;
}

/**
 * Force-checks server connection, flushes/clears pending sync queue status, and verifies read & list queries
 */
export async function forceSyncFirestoreNow(): Promise<FirestoreVerificationResult> {
  return verifyFirestoreServerConnection({
    forceResumeNetwork: true,
    flushPendingQueue: true,
    operationLabel: 'FORCE SYNC NOW',
  });
}

/**
 * Tests direct server connectivity to Firebase Firestore
 */
export async function testFirestoreConnection(): Promise<boolean> {
  const result = await verifyFirestoreServerConnection();
  return result.ok;
}

export interface SeedCollectionResult {
  ok: boolean;
  seeded?: boolean;
  permissionDenied?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Seeds a Firestore collection against the live server if empty and returns detailed status
 * so callers can halt automatic retries immediately on permission-denied errors.
 */
export async function seedCollectionIfEmptyWithResult<T extends { id: string }>(
  collectionName: string,
  defaultItems: T[],
  options?: { ignoreUserClearedFlag?: boolean }
): Promise<SeedCollectionResult> {
  if (cloudSyncPaused) return { ok: false, errorCode: 'cloud-sync-paused' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, errorCode: 'network-offline' };
  }

  // If the user has explicitly emptied their database to start from scratch, do not auto-seed non-essential collections!
  if (!options?.ignoreUserClearedFlag) {
    try {
      if (typeof window !== 'undefined' && localStorage.getItem('kasir_db_cleared_by_user') === 'true') {
        return { ok: true, seeded: false };
      }
    } catch {}
  }

  const startedAt = Date.now();
  try {
    if (collectionName === 'settings') {
      const settingsRef = doc(db, 'settings', 'store_config');
      const snap = await getDocFromServer(settingsRef);
      if (!snap.exists() && defaultItems.length > 0) {
        const safeSettings = sanitizeStoreSettingsForFirestore(
          defaultItems[0] as Record<string, any>,
          { includeDocId: true }
        );
        await setDoc(settingsRef, sanitizeForFirestore(safeSettings), { merge: true });
        recordModuleSyncActivity({
          collectionName,
          direction: 'UPLOAD',
          operation: 'BOOTSTRAP',
          status: 'SUCCESS',
          recordCount: 1,
          latencyMs: Math.max(1, Date.now() - startedAt),
          docId: 'store_config',
          summary: `Inisialisasi awal konfigurasi ${getSyncModuleLabel(collectionName)} ke server.`,
        });
        console.log('[FirebaseSync] Seeded settings/store_config');
        return { ok: true, seeded: true };
      }
      return { ok: true, seeded: false };
    }

    const colRef = collection(db, collectionName);
    const snap = await getDocsFromServer(colRef);
    if (snap.empty && defaultItems.length > 0) {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < defaultItems.length; i += CHUNK_SIZE) {
        const chunk = defaultItems.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((item) => {
          const docRef = doc(db, collectionName, item.id);
          batch.set(docRef, sanitizeForFirestore(item), { merge: true });
        });
        await batch.commit();
      }
      recordModuleSyncActivity({
        collectionName,
        direction: 'UPLOAD',
        operation: 'BOOTSTRAP',
        status: 'SUCCESS',
        recordCount: defaultItems.length,
        latencyMs: Math.max(1, Date.now() - startedAt),
        summary: `Inisialisasi awal ${defaultItems.length} data ${getSyncModuleLabel(collectionName)} ke server.`,
      });
      console.log(`[FirebaseSync] Seeded ${defaultItems.length} records into ${collectionName}`);
      return { ok: true, seeded: true };
    }
    return { ok: true, seeded: false };
  } catch (err) {
    const rawCode = String((err as { code?: unknown })?.code || '').trim();
    const rawMsg = err instanceof Error ? err.message : String(err || '');
    const isPermDenied =
      rawCode.toLowerCase().includes('permission-denied') ||
      rawMsg.toLowerCase().includes('insufficient permissions') ||
      rawMsg.toLowerCase().includes('permission_denied');
    const targetPath = collectionName === 'settings' ? 'settings/store_config' : collectionName;
    if (isPermDenied) {
      logFirestoreError(err, OperationType.WRITE, targetPath);
    }
    const formatted = formatFirestoreSyncErrorMessage(err);
    recordModuleSyncActivity({
      collectionName,
      direction: 'UPLOAD',
      operation: 'BOOTSTRAP',
      status: 'ERROR',
      recordCount: defaultItems.length,
      latencyMs: Math.max(1, Date.now() - startedAt),
      summary: `Gagal inisialisasi awal koleksi ${getSyncModuleLabel(collectionName)}.`,
      errorMessage: formatted,
      errorCode: rawCode || undefined,
    });
    console.warn(`[FirebaseSync] Could not seed collection ${collectionName}:`, err);
    return {
      ok: false,
      permissionDenied: isPermDenied,
      errorCode: rawCode || undefined,
      errorMessage: formatted,
    };
  }
}

/**
 * Seeds a Firestore collection against the live server if it's empty so all connected devices immediately have base data.
 * Returns true if the collection already exists on server or was seeded successfully; returns false when skipped/failed so callers can retry.
 */
export async function seedCollectionIfEmpty<T extends { id: string }>(
  collectionName: string,
  defaultItems: T[],
  options?: { ignoreUserClearedFlag?: boolean }
): Promise<boolean> {
  const res = await seedCollectionIfEmptyWithResult(collectionName, defaultItems, options);
  return res.ok;
}

/**
 * Empties all operational collections in Firestore:
 * - products, categories, customers, suppliers, transactions, stock_opnames, attendances, cashflows, online_orders
 * And resets the 'users' collection to standard: only 1 Admin user with PIN 1234 and ADMIN privilege.
 */
export async function clearAllDatabaseExceptUsers(adminUser?: {
  id: string;
  name: string;
  pin: string;
  role: string;
  avatarColor: string;
}): Promise<void> {
  const collectionsToClear = [
    'products',
    'categories',
    'customers',
    'suppliers',
    'purchases',
    'transactions',
    'stock_opnames',
    'attendances',
    'cashflows',
    'online_orders',
    'activity_logs',
    'tax_records',
    'tax_audit_logs',
    'tax_adjustments',
    'balance_sheet_entries',
  ];

  const standardAdmin = adminUser || {
    id: 'user_admin',
    name: 'Admin',
    pin: '1234',
    role: 'ADMIN',
    avatarColor: 'bg-indigo-600',
  };

  try {
    // 1. Clear operational collections independently so an issue on one does not block others
    for (const colName of collectionsToClear) {
      try {
        const colRef = collection(db, colName);
        const snapshot = await getDocs(colRef);
        if (!snapshot.empty) {
          const docs = snapshot.docs;
          // Attempt chunked batch deletion
          for (let i = 0; i < docs.length; i += 400) {
            const chunk = docs.slice(i, i + 400);
            try {
              const batch = writeBatch(db);
              chunk.forEach((docSnap) => {
                batch.delete(docSnap.ref);
              });
              await batch.commit();
            } catch (batchErr) {
              console.warn(`[FirebaseSync] Batch delete failed for ${colName}, falling back to single deleteDoc:`, batchErr);
              // Fallback to individual deletions
              for (const docSnap of chunk) {
                try {
                  await deleteDoc(docSnap.ref);
                } catch (delErr) {
                  console.error(`[FirebaseSync] Failed to delete doc ${docSnap.id} in ${colName}:`, delErr);
                }
              }
            }
          }
          console.log(`[FirebaseSync] Successfully emptied collection: ${colName} (${docs.length} docs)`);
        }
      } catch (colErr) {
        console.warn(`[FirebaseSync] Notice while clearing collection ${colName}:`, colErr);
      }
    }

    // 2. Reset users collection: remove all other users, set single standard Admin
    try {
      const usersCol = collection(db, 'users');
      const userSnap = await getDocs(usersCol);
      if (!userSnap.empty) {
        const docs = userSnap.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const chunk = docs.slice(i, i + 400);
          try {
            const batch = writeBatch(db);
            chunk.forEach((docSnap) => {
              batch.delete(docSnap.ref);
            });
            await batch.commit();
          } catch {
            for (const docSnap of chunk) {
              try { await deleteDoc(docSnap.ref); } catch {}
            }
          }
        }
      }

      // Write the single standard admin document
      const adminDocRef = doc(db, 'users', standardAdmin.id);
      await setDoc(adminDocRef, sanitizeForFirestore(standardAdmin));
    } catch (userErr) {
      console.warn('[FirebaseSync] Notice while resetting users collection:', userErr);
    }

    console.log('[FirebaseSync] All operational collections cleared. Users reset to standard Admin (PIN: 1234).');
  } catch (err) {
    console.warn('[FirebaseSync] Notice in clearAllDatabaseExceptUsers:', err);
    throw err;
  }
}

export interface FirestoreSnapshotMeta {
  fromCache: boolean;
  hasPendingWrites: boolean;
}

/**
 * Subscribes to real-time updates for a collection using onSnapshot.
 * Returns an unsubscribe function.
 */
export function subscribeToCollection<T extends { id: string }>(
  collectionName: string,
  onData: (items: T[], meta?: FirestoreSnapshotMeta) => void,
  onError?: (error: Error) => void
): () => void {
  const colRef = collection(db, collectionName);
  
  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      const items: T[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...(docSnap.data() as T), id: docSnap.id });
      });
      onData(items, {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
      });
    },
    (error) => {
      console.warn(`[FirebaseSync] onSnapshot error on ${collectionName}:`, error);
      if (onError) onError(error);
    }
  );

  return unsubscribe;
}

// Fast recursive helper to convert undefined values to null without JSON.parse/stringify main-thread blocking
function sanitizeForFirestore<T>(data: T): any {
  if (data === undefined || data === null) return null;
  if (typeof data !== 'object') {
    return typeof data === 'number' && !Number.isFinite(data) ? null : data;
  }
  if (data instanceof Date) {
    return data.toISOString();
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item));
  }
  const result: Record<string, any> = {};
  for (const key of Object.keys(data as Record<string, any>)) {
    const val = (data as Record<string, any>)[key];
    result[key] = val === undefined ? null : sanitizeForFirestore(val);
  }
  return result;
}

/**
 * Saves or updates a document in Firestore
 */
export async function saveDocumentToFirestore<T extends Record<string, any>>(
  collectionName: string,
  docId: string,
  data: T
): Promise<void> {
  const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const modLabel = getSyncModuleLabel(collectionName);
  const itemSummary =
    typeof data?.invoiceNumber === 'string'
      ? `Invoice ${data.invoiceNumber}`
      : typeof data?.name === 'string'
      ? data.name
      : `${modLabel} (${docId})`;

  if (cloudSyncPaused || isBrowserOffline) {
    enqueueOfflineSyncJob({
      kind: 'DOC_UPSERT',
      collectionName,
      docId,
      data: data as Record<string, unknown>,
    });
    recomputeAndNotifyPendingCount();
    recordModuleSyncActivity({
      collectionName,
      direction: 'UPLOAD',
      operation: 'UPSERT',
      status: 'WARNING',
      recordCount: 1,
      docId,
      summary: `Masuk antrean lokal (${cloudSyncPaused ? 'Mode Local Only' : 'Internet Offline'}): ${itemSummary}`,
    });
    return;
  }

  const startedAt = Date.now();
  updateCollectionSyncProgress(collectionName, {
    mode: 'MANUAL_SYNC',
    status: 'SYNCING',
    totalDocs: 1,
    processedDocs: 0,
    operationLabel: 'Menyimpan ke Firestore',
    currentItemSummary: itemSummary,
  });

  try {
    const docRef = doc(db, collectionName, docId);
    await setDoc(docRef, sanitizeForFirestore(data), { merge: true });
    const latencyMs = Math.max(1, Date.now() - startedAt);
    updateCollectionSyncProgress(collectionName, {
      mode: 'MANUAL_SYNC',
      status: 'COMPLETED',
      totalDocs: 1,
      processedDocs: 1,
      operationLabel: 'Terkirim ke Server',
      currentItemSummary: itemSummary,
    });
    scheduleClearCompletedSyncProgress(3000);
    recordModuleSyncActivity({
      collectionName,
      direction: 'UPLOAD',
      operation: 'UPSERT',
      status: 'SUCCESS',
      recordCount: 1,
      latencyMs,
      docId,
      summary: `Berhasil kirim ke server: ${itemSummary}`,
    });
  } catch (err) {
    const latencyMs = Math.max(1, Date.now() - startedAt);
    const errMsg = err instanceof Error ? err.message : String(err);
    const errCode = String((err as { code?: unknown })?.code || '') || undefined;
    enqueueOfflineSyncJob({
      kind: 'DOC_UPSERT',
      collectionName,
      docId,
      data: data as Record<string, unknown>,
      lastError: errMsg,
    });
    recomputeAndNotifyPendingCount();
    updateCollectionSyncProgress(collectionName, {
      mode: 'MANUAL_SYNC',
      status: 'ERROR',
      totalDocs: 1,
      processedDocs: 0,
      failedDocs: 1,
      operationLabel: 'Gagal Kirim (Masuk Antrean)',
      currentItemSummary: itemSummary,
      errorMessage: formatFirestoreSyncErrorMessage(err),
    });
    recordModuleSyncActivity({
      collectionName,
      direction: 'UPLOAD',
      operation: 'UPSERT',
      status: 'ERROR',
      recordCount: 1,
      latencyMs,
      docId,
      summary: `Gagal kirim ke server (disimpan di antrean): ${itemSummary}`,
      errorMessage: formatFirestoreSyncErrorMessage(err),
      errorCode: errCode,
    });
    if (isNetworkOrOfflineWriteError(err)) {
      console.warn(`[FirebaseSync] Offline/network queued doc ${docId} in ${collectionName}`);
      return;
    }
    console.error(`[FirebaseSync] Failed to save doc ${docId} in ${collectionName}:`, err);
    throw err;
  }
}

/**
 * Deletes a document from Firestore (persisted to offlineQueue when offline/paused)
 */
export async function deleteDocumentFromFirestore(
  collectionName: string,
  docId: string
): Promise<void> {
  const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const modLabel = getSyncModuleLabel(collectionName);
  if (cloudSyncPaused || isBrowserOffline) {
    enqueueOfflineSyncJob({
      kind: 'DOC_DELETE',
      collectionName,
      docId,
    });
    recomputeAndNotifyPendingCount();
    recordModuleSyncActivity({
      collectionName,
      direction: 'UPLOAD',
      operation: 'DELETE',
      status: 'WARNING',
      recordCount: 1,
      docId,
      summary: `Hapus data masuk antrean lokal (${cloudSyncPaused ? 'Mode Local Only' : 'Offline'}): ${modLabel} (${docId})`,
    });
    return;
  }

  const startedAt = Date.now();
  try {
    const docRef = doc(db, collectionName, docId);
    await deleteDoc(docRef);
    recordModuleSyncActivity({
      collectionName,
      direction: 'UPLOAD',
      operation: 'DELETE',
      status: 'SUCCESS',
      recordCount: 1,
      latencyMs: Math.max(1, Date.now() - startedAt),
      docId,
      summary: `Hapus dokumen di server berhasil: ${modLabel} (${docId})`,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errCode = String((err as { code?: unknown })?.code || '') || undefined;
    enqueueOfflineSyncJob({
      kind: 'DOC_DELETE',
      collectionName,
      docId,
      lastError: errMsg,
    });
    recomputeAndNotifyPendingCount();
    recordModuleSyncActivity({
      collectionName,
      direction: 'UPLOAD',
      operation: 'DELETE',
      status: 'ERROR',
      recordCount: 1,
      latencyMs: Math.max(1, Date.now() - startedAt),
      docId,
      summary: `Gagal hapus dokumen di server (disimpan di antrean): ${modLabel} (${docId})`,
      errorMessage: formatFirestoreSyncErrorMessage(err),
      errorCode: errCode,
    });
    if (isNetworkOrOfflineWriteError(err)) {
      console.warn(`[FirebaseSync] Offline/network queued delete ${docId} in ${collectionName}`);
      return;
    }
    console.error(`[FirebaseSync] Failed to delete doc ${docId} from ${collectionName}:`, err);
    throw err;
  }
}

/**
 * Batch updates multiple documents in a collection (chunked into max 400 writes per Firestore batch)
 */
export async function saveBatchToFirestore<T extends { id: string }>(
  collectionName: string,
  items: T[]
): Promise<void> {
  if (!items || items.length === 0) return;
  const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const modLabel = getSyncModuleLabel(collectionName);
  if (cloudSyncPaused || isBrowserOffline) {
    enqueueOfflineSyncJob({
      kind: 'BATCH_UPSERT',
      collectionName,
      items: items.map((item) => ({
        id: item.id,
        data: item as unknown as Record<string, unknown>,
      })),
    });
    recomputeAndNotifyPendingCount();
    recordModuleSyncActivity({
      collectionName,
      direction: 'UPLOAD',
      operation: 'BATCH_UPSERT',
      status: 'WARNING',
      recordCount: items.length,
      summary: `Batch ${items.length} data ${modLabel} masuk antrean lokal (${cloudSyncPaused ? 'Mode Local Only' : 'Offline'}).`,
    });
    return;
  }

  const startedAt = Date.now();
  updateCollectionSyncProgress(collectionName, {
    mode: 'MANUAL_SYNC',
    status: 'SYNCING',
    totalDocs: items.length,
    processedDocs: 0,
    operationLabel: 'Mengunggah Batch ke Firestore',
    currentItemSummary: `${items.length} data ${modLabel}`,
  });

  try {
    const CHUNK_SIZE = 400;
    let uploadedCount = 0;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((item) => {
        const docRef = doc(db, collectionName, item.id);
        batch.set(docRef, sanitizeForFirestore(item), { merge: true });
      });
      await batch.commit();
      uploadedCount += chunk.length;
      updateCollectionSyncProgress(collectionName, {
        mode: 'MANUAL_SYNC',
        status: uploadedCount >= items.length ? 'COMPLETED' : 'SYNCING',
        totalDocs: items.length,
        processedDocs: uploadedCount,
        operationLabel: uploadedCount >= items.length ? 'Batch Terkirim' : 'Mengunggah Batch ke Firestore',
        currentItemSummary: `${uploadedCount}/${items.length} data ${modLabel}`,
      });
    }
    scheduleClearCompletedSyncProgress(3500);
    recordModuleSyncActivity({
      collectionName,
      direction: 'UPLOAD',
      operation: 'BATCH_UPSERT',
      status: 'SUCCESS',
      recordCount: items.length,
      latencyMs: Math.max(1, Date.now() - startedAt),
      summary: `Batch upload ${items.length} data ${modLabel} berhasil dikirim ke server.`,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errCode = String((err as { code?: unknown })?.code || '') || undefined;
    enqueueOfflineSyncJob({
      kind: 'BATCH_UPSERT',
      collectionName,
      items: items.map((item) => ({
        id: item.id,
        data: item as unknown as Record<string, unknown>,
      })),
      lastError: errMsg,
    });
    recomputeAndNotifyPendingCount();
    updateCollectionSyncProgress(collectionName, {
      mode: 'MANUAL_SYNC',
      status: 'ERROR',
      totalDocs: items.length,
      processedDocs: 0,
      failedDocs: items.length,
      operationLabel: 'Batch Gagal (Masuk Antrean)',
      currentItemSummary: `${items.length} data ${modLabel}`,
      errorMessage: formatFirestoreSyncErrorMessage(err),
    });
    recordModuleSyncActivity({
      collectionName,
      direction: 'UPLOAD',
      operation: 'BATCH_UPSERT',
      status: 'ERROR',
      recordCount: items.length,
      latencyMs: Math.max(1, Date.now() - startedAt),
      summary: `Batch upload ${items.length} data ${modLabel} gagal (disimpan di antrean).`,
      errorMessage: formatFirestoreSyncErrorMessage(err),
      errorCode: errCode,
    });
    if (isNetworkOrOfflineWriteError(err)) {
      console.warn(`[FirebaseSync] Offline/network queued batch for ${collectionName} (${items.length} items)`);
      return;
    }
    console.error(`[FirebaseSync] Batch update failed for ${collectionName}:`, err);
    throw err;
  }
}

/**
 * Replaces all documents in a Firestore collection with the provided items.
 * Deletes existing documents not present in items, then writes/overwrites the restored items.
 */
export async function replaceCollectionInFirestore<T extends { id: string }>(
  collectionName: string,
  items: T[]
): Promise<void> {
  if (cloudSyncPaused) return;
  const safeItems = Array.isArray(items) ? items : [];
  const nextIds = new Set(safeItems.map((item) => item.id));
  const startedAt = Date.now();
  const modLabel = getSyncModuleLabel(collectionName);

  try {
    const colRef = collection(db, collectionName);
    const existingSnap = await getDocsFromServer(colRef).catch(() => getDocs(colRef));
    const docsToDelete = existingSnap.docs.filter((docSnap) => !nextIds.has(docSnap.id));

    const CHUNK_SIZE = 400;
    for (let i = 0; i < docsToDelete.length; i += CHUNK_SIZE) {
      const chunk = docsToDelete.slice(i, i + CHUNK_SIZE);
      try {
        const batch = writeBatch(db);
        chunk.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      } catch (batchDelErr) {
        console.warn(`[FirebaseSync] Batch delete fallback for ${collectionName}:`, batchDelErr);
        for (const docSnap of chunk) {
          try {
            await deleteDoc(docSnap.ref);
          } catch (delErr) {
            console.warn(`[FirebaseSync] Could not delete ${docSnap.id} in ${collectionName}:`, delErr);
          }
        }
      }
    }

    for (let i = 0; i < safeItems.length; i += CHUNK_SIZE) {
      const chunk = safeItems.slice(i, i + CHUNK_SIZE);
      try {
        const batch = writeBatch(db);
        chunk.forEach((item) => {
          const docRef = doc(db, collectionName, item.id);
          batch.set(docRef, sanitizeForFirestore(item));
        });
        await batch.commit();
      } catch (batchWriteErr) {
        console.warn(`[FirebaseSync] Batch write fallback for ${collectionName}:`, batchWriteErr);
        for (const item of chunk) {
          try {
            const docRef = doc(db, collectionName, item.id);
            await setDoc(docRef, sanitizeForFirestore(item));
          } catch (writeErr) {
            console.warn(`[FirebaseSync] Could not restore doc ${item.id} in ${collectionName}:`, writeErr);
          }
        }
      }
    }

    recordModuleSyncActivity({
      collectionName,
      direction: 'UPLOAD',
      operation: 'RECONCILE',
      status: 'SUCCESS',
      recordCount: safeItems.length,
      latencyMs: Math.max(1, Date.now() - startedAt),
      summary: `Sinkronisasi penuh koleksi ${modLabel} selesai (${safeItems.length} dokumen).`,
    });
  } catch (err) {
    recordModuleSyncActivity({
      collectionName,
      direction: 'UPLOAD',
      operation: 'RECONCILE',
      status: 'ERROR',
      recordCount: safeItems.length,
      latencyMs: Math.max(1, Date.now() - startedAt),
      summary: `Gagal mengganti/memulihkan koleksi ${modLabel}.`,
      errorMessage: formatFirestoreSyncErrorMessage(err),
      errorCode: String((err as { code?: unknown })?.code || '') || undefined,
    });
    console.error(`[FirebaseSync] Failed to replace collection ${collectionName}:`, err);
    throw err;
  }
}

/**
 * Saves store settings singleton document
 */
export async function saveStoreSettingsToFirestore(
  settings: Record<string, any>,
  replace = false
): Promise<void> {
  const safeSettings = sanitizeStoreSettingsForFirestore(settings);
  const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (cloudSyncPaused || isBrowserOffline) {
    enqueueOfflineSyncJob({
      kind: 'SETTINGS_SAVE',
      collectionName: 'settings',
      docId: 'store_config',
      data: safeSettings as Record<string, unknown>,
      replace,
    });
    recomputeAndNotifyPendingCount();
    recordModuleSyncActivity({
      collectionName: 'settings',
      direction: 'UPLOAD',
      operation: 'UPSERT',
      status: 'WARNING',
      recordCount: 1,
      docId: 'store_config',
      summary: `Pengaturan toko masuk antrean lokal (${cloudSyncPaused ? 'Mode Local Only' : 'Offline'}).`,
    });
    return;
  }

  const startedAt = Date.now();
  try {
    const docRef = doc(db, 'settings', 'store_config');
    await setDoc(docRef, sanitizeForFirestore(safeSettings), { merge: !replace });
    recordModuleSyncActivity({
      collectionName: 'settings',
      direction: 'UPLOAD',
      operation: 'UPSERT',
      status: 'SUCCESS',
      recordCount: 1,
      latencyMs: Math.max(1, Date.now() - startedAt),
      docId: 'store_config',
      summary: 'Pengaturan toko berhasil disimpan ke server Firestore.',
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    enqueueOfflineSyncJob({
      kind: 'SETTINGS_SAVE',
      collectionName: 'settings',
      docId: 'store_config',
      data: safeSettings as Record<string, unknown>,
      replace,
      lastError: errMsg,
    });
    recomputeAndNotifyPendingCount();
    recordModuleSyncActivity({
      collectionName: 'settings',
      direction: 'UPLOAD',
      operation: 'UPSERT',
      status: 'ERROR',
      recordCount: 1,
      latencyMs: Math.max(1, Date.now() - startedAt),
      docId: 'store_config',
      summary: 'Gagal menyimpan pengaturan toko ke server (disimpan di antrean).',
      errorMessage: formatFirestoreSyncErrorMessage(err),
      errorCode: String((err as { code?: unknown })?.code || '') || undefined,
    });
    if (isNetworkOrOfflineWriteError(err)) {
      console.warn('[FirebaseSync] Offline/network queued store settings save');
      return;
    }
    console.error('[FirebaseSync] Failed to save store settings:', err);
    throw err;
  }
}

export type FirebaseMailDeliveryState = 'QUEUED' | 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

export interface FirebaseMailDeliveryUpdate {
  mailId: string;
  state: FirebaseMailDeliveryState;
  error?: string;
}

export interface SendReceiptEmailPayload {
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  transactionId: string;
  invoiceNumber: string;
  storeName: string;
  customerName?: string;
  finalAmount: number;
}

/**
 * Triggers a transactional receipt email by writing to the Firebase Trigger Email (`mail`) collection.
 */
export async function sendReceiptEmailViaFirebase(
  payload: SendReceiptEmailPayload
): Promise<string> {
  if (cloudSyncPaused) {
    throw new Error('Mode Offline manual sedang aktif. Nonaktifkan mode offline agar pengiriman email Firebase dapat berjalan.');
  }

  const cleanEmail = payload.toEmail.trim().toLowerCase();
  const mailId = `mail_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const path = `mail/${mailId}`;

  const mailDoc = {
    id: mailId,
    to: [cleanEmail],
    message: {
      subject: payload.subject.slice(0, 200),
      text: payload.textBody.slice(0, 20000),
      html: payload.htmlBody.slice(0, 60000),
    },
    metadata: {
      transactionId: payload.transactionId,
      invoiceNumber: payload.invoiceNumber,
      storeName: payload.storeName,
      customerName: payload.customerName || 'Pelanggan Umum',
      finalAmount: payload.finalAmount,
    },
    createdAt: Date.now(),
  };

  try {
    const docRef = doc(db, 'mail', mailId);
    await setDoc(docRef, sanitizeForFirestore(mailDoc));
    return mailId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

/**
 * Listens for live Firebase Trigger Email extension `delivery.state` updates on a queued mail doc.
 */
export function subscribeMailDeliveryStatus(
  mailId: string,
  onUpdate: (status: FirebaseMailDeliveryUpdate) => void
): () => void {
  const docRef = doc(db, 'mail', mailId);
  return onSnapshot(
    docRef,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as {
        delivery?: {
          state?: string;
          error?: string;
        };
      };
      const rawState = String(data?.delivery?.state || '').toUpperCase();
      let state: FirebaseMailDeliveryState = 'QUEUED';
      if (rawState === 'PENDING') state = 'PENDING';
      else if (rawState === 'PROCESSING') state = 'PROCESSING';
      else if (rawState === 'SUCCESS') state = 'SUCCESS';
      else if (rawState === 'ERROR') state = 'ERROR';

      onUpdate({
        mailId,
        state,
        error: data?.delivery?.error ? String(data.delivery.error) : undefined,
      });
    },
    (err) => {
      console.warn('[FirebaseSync] Mail status snapshot notice:', err);
    }
  );
}

/**
 * Fetches live Firestore server snapshots across all operational & system collections
 * and compares them against local state + offline queue to detect conflicts automatically.
 */
export async function runFirestoreSyncHealthAudit(
  localState: LocalCollectionsSnapshotInput,
  offlineJobs: OfflineSyncJob[],
  options?: { trackBackgroundProgress?: boolean }
): Promise<SyncHealthAuditReport> {
  const trackProgress = options?.trackBackgroundProgress !== false;
  const serverSnapshots: ServerCollectionsSnapshotMap = {};
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;

  if (trackProgress) {
    initializeBackgroundSyncProgress(
      'HEALTH_AUDIT',
      SYNC_MODULE_DEFINITIONS.map((def) => ({
        collectionName: def.collectionName,
        totalDocs: 1,
        operationLabel: 'Memeriksa Konflik Server',
        currentItemSummary: def.label,
      }))
    );
  }

  for (const modDef of SYNC_MODULE_DEFINITIONS) {
    const colName = modDef.collectionName;
    if (cloudSyncPaused || !isOnline) {
      serverSnapshots[colName] = {
        ok: false,
        docs: [],
        errorMessage: cloudSyncPaused
          ? 'Mode Local Only aktif — pemeriksaan server dilewati.'
          : 'Perangkat tidak terhubung ke internet (Offline).',
      };
      if (trackProgress) {
        updateCollectionSyncProgress(colName, {
          mode: 'HEALTH_AUDIT',
          status: 'ERROR',
          totalDocs: 1,
          processedDocs: 0,
          failedDocs: 1,
          operationLabel: cloudSyncPaused ? 'Mode Local Only' : 'Offline',
          errorMessage: serverSnapshots[colName].errorMessage,
        });
      }
      continue;
    }

    const startedAt = Date.now();
    if (trackProgress) {
      updateCollectionSyncProgress(colName, {
        mode: 'HEALTH_AUDIT',
        status: 'SYNCING',
        totalDocs: 1,
        processedDocs: 0,
        operationLabel: 'Membandingkan Lokal vs Server',
        currentItemSummary: modDef.label,
      });
    }

    try {
      const snap = await getDocsFromServer(collection(db, colName));
      const docs = snap.docs.map((d) => ({
        ...(d.data() as Record<string, unknown>),
        id: d.id,
      }));
      serverSnapshots[colName] = { ok: true, docs };
      if (trackProgress) {
        updateCollectionSyncProgress(colName, {
          mode: 'HEALTH_AUDIT',
          status: 'COMPLETED',
          totalDocs: 1,
          processedDocs: 1,
          operationLabel: 'Terverifikasi',
          currentItemSummary: `${docs.length} data di server`,
        });
      }
      recordModuleSyncActivity({
        collectionName: colName,
        direction: 'AUDIT',
        operation: 'CONFLICT_SCAN',
        status: 'SUCCESS',
        recordCount: docs.length,
        latencyMs: Math.max(1, Date.now() - startedAt),
        summary: `Audit konsistensi ${modDef.label} selesai (${docs.length} dokumen di server).`,
      });
    } catch (err) {
      const msg = formatFirestoreSyncErrorMessage(err);
      const errCode = String((err as { code?: unknown })?.code || '') || undefined;
      serverSnapshots[colName] = {
        ok: false,
        docs: [],
        errorMessage: msg,
      };
      if (trackProgress) {
        updateCollectionSyncProgress(colName, {
          mode: 'HEALTH_AUDIT',
          status: 'ERROR',
          totalDocs: 1,
          processedDocs: 0,
          failedDocs: 1,
          operationLabel: 'Gagal Akses Server',
          errorMessage: msg,
        });
      }
      recordModuleSyncActivity({
        collectionName: colName,
        direction: 'AUDIT',
        operation: 'CONFLICT_SCAN',
        status: 'ERROR',
        recordCount: 0,
        latencyMs: Math.max(1, Date.now() - startedAt),
        summary: `Gagal memeriksa server untuk ${modDef.label}.`,
        errorMessage: msg,
        errorCode: errCode,
      });
    }
  }

  if (trackProgress) {
    scheduleClearCompletedSyncProgress(3500);
  }

  return detectSyncConflictsReport({
    localState,
    serverSnapshots,
    offlineJobs,
  });
}

/**
 * Retries a single specific offline sync job directly against Firestore
 */
export async function executeSingleOfflineSyncJobNow(
  job: OfflineSyncJob
): Promise<{ ok: boolean; error?: string }> {
  if (cloudSyncPaused) {
    return { ok: false, error: 'Mode Local Only sedang aktif.' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, error: 'Perangkat masih offline.' };
  }
  const startedAt = Date.now();
  try {
    if (job.kind === 'DOC_UPSERT' && job.docId && job.data) {
      await setDoc(doc(db, job.collectionName, job.docId), sanitizeForFirestore(job.data), {
        merge: true,
      });
    } else if (job.kind === 'DOC_DELETE' && job.docId) {
      await deleteDoc(doc(db, job.collectionName, job.docId));
    } else if (job.kind === 'BATCH_UPSERT' && job.items && job.items.length > 0) {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < job.items.length; i += CHUNK_SIZE) {
        const chunk = job.items.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((it) => {
          batch.set(doc(db, job.collectionName, it.id), sanitizeForFirestore(it.data), {
            merge: true,
          });
        });
        await batch.commit();
      }
    } else if (job.kind === 'SETTINGS_SAVE' && job.data) {
      const safeSettings = sanitizeStoreSettingsForFirestore(job.data);
      await setDoc(doc(db, 'settings', 'store_config'), sanitizeForFirestore(safeSettings), {
        merge: !job.replace,
      });
    }
    recordModuleSyncActivity({
      collectionName: job.collectionName,
      direction: 'CONFLICT_FIX',
      operation: 'QUEUE_FLUSH',
      status: 'SUCCESS',
      recordCount: job.kind === 'BATCH_UPSERT' ? (job.items?.length || 1) : 1,
      latencyMs: Math.max(1, Date.now() - startedAt),
      docId: job.docId,
      summary: `Kirim ulang manual berhasil: ${job.summary}`,
    });
    return { ok: true };
  } catch (err) {
    const msg = formatFirestoreSyncErrorMessage(err);
    recordModuleSyncActivity({
      collectionName: job.collectionName,
      direction: 'CONFLICT_FIX',
      operation: 'QUEUE_FLUSH',
      status: 'ERROR',
      recordCount: 1,
      latencyMs: Math.max(1, Date.now() - startedAt),
      docId: job.docId,
      summary: `Kirim ulang manual gagal: ${job.summary}`,
      errorMessage: msg,
      errorCode: String((err as { code?: unknown })?.code || '') || undefined,
    });
    return { ok: false, error: msg };
  }
}
