export type SyncDirection = 'UPLOAD' | 'DOWNLOAD' | 'CONFLICT_FIX' | 'AUDIT';

export type SyncOperationKind =
  | 'UPSERT'
  | 'DELETE'
  | 'BATCH_UPSERT'
  | 'BACKFILL'
  | 'QUEUE_FLUSH'
  | 'RECONCILE'
  | 'BOOTSTRAP'
  | 'SNAPSHOT_SYNC'
  | 'CONFLICT_SCAN'
  | 'CLEAR_DB';

export type SyncActivityStatus = 'SUCCESS' | 'ERROR' | 'WARNING';

export interface SyncModuleDefinition {
  collectionName: string;
  label: string;
  domain: 'Operasional POS' | 'Inventaris' | 'Keuangan & Pajak' | 'Sistem';
}

export const SYNC_MODULE_DEFINITIONS: SyncModuleDefinition[] = [
  { collectionName: 'transactions', label: 'Transaksi Penjualan', domain: 'Operasional POS' },
  { collectionName: 'products', label: 'Produk & Stok', domain: 'Inventaris' },
  { collectionName: 'customers', label: 'Pelanggan & Piutang', domain: 'Operasional POS' },
  { collectionName: 'cashflows', label: 'Arus Kas', domain: 'Keuangan & Pajak' },
  { collectionName: 'purchases', label: 'Pembelian (PO)', domain: 'Inventaris' },
  { collectionName: 'stock_opnames', label: 'Stock Opname', domain: 'Inventaris' },
  { collectionName: 'categories', label: 'Kategori Produk', domain: 'Inventaris' },
  { collectionName: 'customer_categories', label: 'Kategori Pelanggan', domain: 'Operasional POS' },
  { collectionName: 'suppliers', label: 'Supplier', domain: 'Inventaris' },
  { collectionName: 'online_orders', label: 'Pesanan Online', domain: 'Operasional POS' },
  { collectionName: 'attendances', label: 'Absensi Karyawan', domain: 'Sistem' },
  { collectionName: 'activity_logs', label: 'Log Aktivitas Karyawan', domain: 'Sistem' },
  { collectionName: 'tax_records', label: 'Catatan Pajak', domain: 'Keuangan & Pajak' },
  { collectionName: 'tax_audit_logs', label: 'Log Audit Pajak', domain: 'Keuangan & Pajak' },
  { collectionName: 'tax_adjustments', label: 'Adjustment Pajak', domain: 'Keuangan & Pajak' },
  { collectionName: 'balance_sheet_entries', label: 'Akun Neraca', domain: 'Keuangan & Pajak' },
  { collectionName: 'settings', label: 'Pengaturan Toko', domain: 'Sistem' },
  { collectionName: 'users', label: 'Pengguna & Akses', domain: 'Sistem' },
];

const MODULE_DEF_MAP = new Map<string, SyncModuleDefinition>(
  SYNC_MODULE_DEFINITIONS.map((def) => [def.collectionName, def])
);

export function getSyncModuleLabel(collectionName: string): string {
  return MODULE_DEF_MAP.get(collectionName)?.label || collectionName;
}

export function getSyncModuleDomain(collectionName: string): SyncModuleDefinition['domain'] {
  return MODULE_DEF_MAP.get(collectionName)?.domain || 'Sistem';
}

export interface SyncActivityLogEntry {
  id: string;
  timestamp: number;
  collectionName: string;
  moduleLabel: string;
  direction: SyncDirection;
  operation: SyncOperationKind;
  status: SyncActivityStatus;
  recordCount: number;
  latencyMs?: number;
  summary: string;
  errorMessage?: string;
  errorCode?: string;
  docId?: string;
  actorName?: string;
}

export interface SyncModuleSummary {
  collectionName: string;
  moduleLabel: string;
  domain: SyncModuleDefinition['domain'];
  lastSuccessUploadAt?: number;
  lastSuccessDownloadAt?: number;
  lastAttemptAt?: number;
  lastErrorAt?: number;
  lastStatus?: SyncActivityStatus;
  lastOperation?: SyncOperationKind;
  lastDirection?: SyncDirection;
  lastSummary?: string;
  lastErrorMessage?: string;
  lastErrorCode?: string;
  lastRecordCount?: number;
  lastLatencyMs?: number;
  totalSuccess: number;
  totalErrors: number;
  totalWarnings: number;
}

export type CollectionProgressStatus = 'QUEUED' | 'SYNCING' | 'COMPLETED' | 'ERROR';

export interface CollectionTransferProgress {
  collectionName: string;
  moduleLabel: string;
  operationLabel: string;
  status: CollectionProgressStatus;
  totalDocs: number;
  processedDocs: number;
  failedDocs: number;
  percent: number;
  currentItemSummary?: string;
  errorMessage?: string;
  startedAt: number;
  updatedAt: number;
}

export interface BackgroundSyncProgressSnapshot {
  isActive: boolean;
  mode: 'IDLE' | 'QUEUE_FLUSH' | 'MANUAL_SYNC' | 'BACKFILL' | 'HEALTH_AUDIT';
  overallProcessedDocs: number;
  overallTotalDocs: number;
  overallPercent: number;
  activeCollectionName: string | null;
  collections: CollectionTransferProgress[];
  updatedAt: number;
}

const LOGS_STORAGE_KEY = 'kasir_firestore_sync_module_logs_v1';
const SUMMARY_STORAGE_KEY = 'kasir_firestore_module_summary_v1';
const MAX_MODULE_LOGS = 250;

let logsCache: SyncActivityLogEntry[] | null = null;
let summaryMapCache: Record<string, SyncModuleSummary> | null = null;

const logListeners = new Set<
  (payload: { logs: SyncActivityLogEntry[]; summaries: SyncModuleSummary[] }) => void
>();
const progressListeners = new Set<(snapshot: BackgroundSyncProgressSnapshot) => void>();

let activeProgressMap = new Map<string, CollectionTransferProgress>();
let progressMode: BackgroundSyncProgressSnapshot['mode'] = 'IDLE';
let progressClearTimer: ReturnType<typeof setTimeout> | null = null;

function safeLocalStorageGet(key: string): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage quota errors
  }
}

function loadLogs(): SyncActivityLogEntry[] {
  if (logsCache !== null) return logsCache;
  const raw = safeLocalStorageGet(LOGS_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        logsCache = parsed
          .filter(
            (item): item is SyncActivityLogEntry =>
              Boolean(item && typeof item === 'object' && typeof item.id === 'string')
          )
          .slice(0, MAX_MODULE_LOGS);
        return logsCache;
      }
    } catch {
      // ignore parse error
    }
  }
  logsCache = [];
  return logsCache;
}

function createEmptySummary(collectionName: string): SyncModuleSummary {
  return {
    collectionName,
    moduleLabel: getSyncModuleLabel(collectionName),
    domain: getSyncModuleDomain(collectionName),
    totalSuccess: 0,
    totalErrors: 0,
    totalWarnings: 0,
  };
}

function loadSummaryMap(): Record<string, SyncModuleSummary> {
  if (summaryMapCache !== null) return summaryMapCache;
  const base: Record<string, SyncModuleSummary> = {};
  SYNC_MODULE_DEFINITIONS.forEach((def) => {
    base[def.collectionName] = createEmptySummary(def.collectionName);
  });

  const raw = safeLocalStorageGet(SUMMARY_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [col, val] of Object.entries(parsed)) {
          if (val && typeof val === 'object') {
            base[col] = {
              ...createEmptySummary(col),
              ...(val as Partial<SyncModuleSummary>),
              collectionName: col,
              moduleLabel: getSyncModuleLabel(col),
              domain: getSyncModuleDomain(col),
            };
          }
        }
      }
    } catch {
      // ignore parse error
    }
  }
  summaryMapCache = base;
  return summaryMapCache;
}

function notifyLogListeners(): void {
  const payload = {
    logs: getSyncActivityLogs(),
    summaries: getSyncModuleSummaries(),
  };
  logListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // ignore listener errors
    }
  });
}

export function getSyncActivityLogs(): SyncActivityLogEntry[] {
  return [...loadLogs()];
}

export function getSyncModuleSummaries(): SyncModuleSummary[] {
  const map = loadSummaryMap();
  const knownOrder = new Map(SYNC_MODULE_DEFINITIONS.map((d, idx) => [d.collectionName, idx]));
  return Object.values(map).sort((a, b) => {
    const idxA = knownOrder.has(a.collectionName) ? (knownOrder.get(a.collectionName) ?? 999) : 999;
    const idxB = knownOrder.has(b.collectionName) ? (knownOrder.get(b.collectionName) ?? 999) : 999;
    if (idxA !== idxB) return idxA - idxB;
    return a.collectionName.localeCompare(b.collectionName);
  });
}

export function getSyncModuleSummary(collectionName: string): SyncModuleSummary {
  const map = loadSummaryMap();
  return map[collectionName] || createEmptySummary(collectionName);
}

export function recordModuleSyncActivity(input: {
  collectionName: string;
  direction: SyncDirection;
  operation: SyncOperationKind;
  status: SyncActivityStatus;
  recordCount?: number;
  latencyMs?: number;
  summary: string;
  errorMessage?: string;
  errorCode?: string;
  docId?: string;
  actorName?: string;
}): SyncActivityLogEntry {
  const now = Date.now();
  const existingLogs = loadLogs();
  const moduleLabel = getSyncModuleLabel(input.collectionName);
  const recordCount = Math.max(0, Number(input.recordCount ?? 0));

  // Deduplicate identical consecutive WARNING/ERROR entries on the exact same collection within 5 seconds
  const latestSameCol = existingLogs.find((l) => l.collectionName === input.collectionName);
  const shouldDeduplicate =
    latestSameCol &&
    latestSameCol.status === input.status &&
    latestSameCol.operation === input.operation &&
    latestSameCol.summary === input.summary &&
    now - latestSameCol.timestamp < 5000;

  const entry: SyncActivityLogEntry = {
    id: `slog_${now}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now,
    collectionName: input.collectionName,
    moduleLabel,
    direction: input.direction,
    operation: input.operation,
    status: input.status,
    recordCount,
    latencyMs: input.latencyMs,
    summary: input.summary,
    errorMessage: input.errorMessage,
    errorCode: input.errorCode,
    docId: input.docId,
    actorName: input.actorName,
  };

  if (!shouldDeduplicate) {
    const nextLogs = [entry, ...existingLogs].slice(0, MAX_MODULE_LOGS);
    logsCache = nextLogs;
    safeLocalStorageSet(LOGS_STORAGE_KEY, JSON.stringify(nextLogs));
  }

  const summaries = loadSummaryMap();
  const prevSummary = summaries[input.collectionName] || createEmptySummary(input.collectionName);
  const nextSummary: SyncModuleSummary = {
    ...prevSummary,
    lastAttemptAt: now,
    lastStatus: input.status,
    lastOperation: input.operation,
    lastDirection: input.direction,
    lastSummary: input.summary,
    lastRecordCount: recordCount,
    lastLatencyMs: input.latencyMs ?? prevSummary.lastLatencyMs,
  };

  if (input.status === 'SUCCESS') {
    nextSummary.totalSuccess = prevSummary.totalSuccess + 1;
    if (input.direction === 'UPLOAD' || input.direction === 'CONFLICT_FIX') {
      nextSummary.lastSuccessUploadAt = now;
    } else if (input.direction === 'DOWNLOAD') {
      nextSummary.lastSuccessDownloadAt = now;
    }
    nextSummary.lastErrorMessage = undefined;
    nextSummary.lastErrorCode = undefined;
  } else if (input.status === 'ERROR') {
    nextSummary.totalErrors = prevSummary.totalErrors + 1;
    nextSummary.lastErrorAt = now;
    nextSummary.lastErrorMessage = input.errorMessage || input.summary;
    nextSummary.lastErrorCode = input.errorCode;
  } else {
    nextSummary.totalWarnings = prevSummary.totalWarnings + 1;
    if (input.errorMessage) {
      nextSummary.lastErrorMessage = input.errorMessage;
      nextSummary.lastErrorCode = input.errorCode;
    }
  }

  summaryMapCache = {
    ...summaries,
    [input.collectionName]: nextSummary,
  };
  safeLocalStorageSet(SUMMARY_STORAGE_KEY, JSON.stringify(summaryMapCache));
  notifyLogListeners();

  return entry;
}

export function clearSyncActivityLogs(resetModuleStats = false): void {
  logsCache = [];
  safeLocalStorageSet(LOGS_STORAGE_KEY, JSON.stringify([]));
  if (resetModuleStats) {
    const fresh: Record<string, SyncModuleSummary> = {};
    SYNC_MODULE_DEFINITIONS.forEach((def) => {
      fresh[def.collectionName] = createEmptySummary(def.collectionName);
    });
    summaryMapCache = fresh;
    safeLocalStorageSet(SUMMARY_STORAGE_KEY, JSON.stringify(fresh));
  }
  notifyLogListeners();
}

export function subscribeSyncActivityLogs(
  listener: (payload: { logs: SyncActivityLogEntry[]; summaries: SyncModuleSummary[] }) => void
): () => void {
  logListeners.add(listener);
  listener({
    logs: getSyncActivityLogs(),
    summaries: getSyncModuleSummaries(),
  });
  return () => {
    logListeners.delete(listener);
  };
}

// =====================================================================
// REAL-TIME BACKGROUND PER-COLLECTION SYNC PROGRESS TRACKER
// =====================================================================

export function getBackgroundSyncProgress(): BackgroundSyncProgressSnapshot {
  const collections = Array.from(activeProgressMap.values()).sort((a, b) => {
    const order: Record<CollectionProgressStatus, number> = {
      SYNCING: 0,
      ERROR: 1,
      QUEUED: 2,
      COMPLETED: 3,
    };
    const diff = order[a.status] - order[b.status];
    if (diff !== 0) return diff;
    return a.startedAt - b.startedAt;
  });

  const overallTotalDocs = collections.reduce((acc, c) => acc + Math.max(0, c.totalDocs), 0);
  const overallProcessedDocs = collections.reduce(
    (acc, c) => acc + Math.min(Math.max(0, c.processedDocs), Math.max(0, c.totalDocs)),
    0
  );
  const overallPercent =
    overallTotalDocs > 0
      ? Math.min(100, Math.round((overallProcessedDocs / overallTotalDocs) * 100))
      : 0;

  const activeCol = collections.find((c) => c.status === 'SYNCING') || null;
  const isActive = collections.some((c) => c.status === 'SYNCING' || c.status === 'QUEUED');

  return {
    isActive,
    mode: collections.length === 0 ? 'IDLE' : progressMode,
    overallProcessedDocs,
    overallTotalDocs,
    overallPercent,
    activeCollectionName: activeCol ? activeCol.collectionName : null,
    collections,
    updatedAt: Date.now(),
  };
}

function notifyProgressListeners(): void {
  const snap = getBackgroundSyncProgress();
  progressListeners.forEach((listener) => {
    try {
      listener(snap);
    } catch {
      // ignore
    }
  });
}

function cancelPendingClearTimer(): void {
  if (progressClearTimer !== null) {
    clearTimeout(progressClearTimer);
    progressClearTimer = null;
  }
}

export function initializeBackgroundSyncProgress(
  mode: BackgroundSyncProgressSnapshot['mode'],
  items: Array<{
    collectionName: string;
    totalDocs: number;
    operationLabel: string;
    currentItemSummary?: string;
  }>
): void {
  cancelPendingClearTimer();
  progressMode = mode;
  const now = Date.now();
  const next = new Map<string, CollectionTransferProgress>();

  items.forEach((item) => {
    const existing = next.get(item.collectionName);
    const totalDocs = (existing?.totalDocs || 0) + Math.max(1, item.totalDocs);
    next.set(item.collectionName, {
      collectionName: item.collectionName,
      moduleLabel: getSyncModuleLabel(item.collectionName),
      operationLabel: item.operationLabel,
      status: 'QUEUED',
      totalDocs,
      processedDocs: 0,
      failedDocs: 0,
      percent: 0,
      currentItemSummary: item.currentItemSummary || existing?.currentItemSummary,
      startedAt: now,
      updatedAt: now,
    });
  });

  activeProgressMap = next;
  notifyProgressListeners();
}

export function updateCollectionSyncProgress(
  collectionName: string,
  patch: Partial<Omit<CollectionTransferProgress, 'collectionName' | 'moduleLabel'>> & {
    mode?: BackgroundSyncProgressSnapshot['mode'];
  }
): void {
  cancelPendingClearTimer();
  if (patch.mode) {
    progressMode = patch.mode;
  } else if (progressMode === 'IDLE') {
    progressMode = 'MANUAL_SYNC';
  }

  const now = Date.now();
  const existing = activeProgressMap.get(collectionName);
  const totalDocs = Math.max(1, patch.totalDocs ?? existing?.totalDocs ?? 1);
  const processedDocs = Math.max(0, Math.min(totalDocs, patch.processedDocs ?? existing?.processedDocs ?? 0));
  const status = patch.status ?? existing?.status ?? 'SYNCING';
  const percent =
    status === 'COMPLETED'
      ? 100
      : Math.min(100, Math.round((processedDocs / totalDocs) * 100));

  activeProgressMap.set(collectionName, {
    collectionName,
    moduleLabel: getSyncModuleLabel(collectionName),
    operationLabel: patch.operationLabel ?? existing?.operationLabel ?? 'Sinkronisasi Data',
    status,
    totalDocs,
    processedDocs,
    failedDocs: patch.failedDocs ?? existing?.failedDocs ?? 0,
    percent,
    currentItemSummary: patch.currentItemSummary ?? existing?.currentItemSummary,
    errorMessage: patch.errorMessage,
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
  });

  notifyProgressListeners();
}

export function scheduleClearCompletedSyncProgress(delayMs = 5500): void {
  cancelPendingClearTimer();
  const snapshot = getBackgroundSyncProgress();
  if (snapshot.isActive) return;

  const hasError = snapshot.collections.some((c) => c.status === 'ERROR');
  if (hasError) return; // keep error state visible until resolved/dismissed

  progressClearTimer = setTimeout(() => {
    const latest = getBackgroundSyncProgress();
    if (!latest.isActive && !latest.collections.some((c) => c.status === 'ERROR')) {
      activeProgressMap = new Map();
      progressMode = 'IDLE';
      notifyProgressListeners();
    }
  }, delayMs);
}

export function clearBackgroundSyncProgress(): void {
  cancelPendingClearTimer();
  activeProgressMap = new Map();
  progressMode = 'IDLE';
  notifyProgressListeners();
}

export function subscribeBackgroundSyncProgress(
  listener: (snapshot: BackgroundSyncProgressSnapshot) => void
): () => void {
  progressListeners.add(listener);
  listener(getBackgroundSyncProgress());
  return () => {
    progressListeners.delete(listener);
  };
}

/**
 * Test utility to reset in-memory telemetry caches cleanly
 */
export function __resetSyncTelemetryMemoryForTests(): void {
  logsCache = null;
  summaryMapCache = null;
  activeProgressMap = new Map();
  progressMode = 'IDLE';
  cancelPendingClearTimer();
}
