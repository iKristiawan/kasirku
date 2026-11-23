import { StoreSettings } from '../types/pos';

export type OfflineSyncJobKind =
  | 'DOC_UPSERT'
  | 'DOC_DELETE'
  | 'BATCH_UPSERT'
  | 'SETTINGS_SAVE';

export interface OfflineSyncJob {
  id: string;
  kind: OfflineSyncJobKind;
  collectionName: string;
  docId?: string;
  data?: Record<string, unknown>;
  items?: Array<{ id: string; data: Record<string, unknown> }>;
  replace?: boolean;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  lastError?: string;
  summary: string;
}

const OFFLINE_QUEUE_STORAGE_KEY = 'kasir_offline_sync_queue_v1';

let inMemoryQueueCache: OfflineSyncJob[] | null = null;
const queueListeners = new Set<(queue: OfflineSyncJob[]) => void>();
let flushPromise: Promise<OfflineFlushResult> | null = null;

export interface OfflineFlushResult {
  flushedCount: number;
  failedCount: number;
  remainingCount: number;
  abortedByNetwork: boolean;
  lastError?: string;
}

function readQueueFromStorage(): OfflineSyncJob[] {
  if (inMemoryQueueCache !== null) return inMemoryQueueCache;
  if (typeof window === 'undefined' || !window.localStorage) {
    inMemoryQueueCache = [];
    return inMemoryQueueCache;
  }
  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) {
      inMemoryQueueCache = [];
      return inMemoryQueueCache;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      inMemoryQueueCache = parsed.filter(
        (item): item is OfflineSyncJob =>
          Boolean(item && typeof item === 'object' && typeof item.id === 'string' && typeof item.kind === 'string')
      );
      return inMemoryQueueCache;
    }
  } catch (err) {
    console.warn('Gagal membaca antrean offline dari localStorage:', err);
  }
  inMemoryQueueCache = [];
  return inMemoryQueueCache;
}

function persistQueue(nextQueue: OfflineSyncJob[]): void {
  inMemoryQueueCache = nextQueue;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(nextQueue));
    } catch (err) {
      console.warn('Gagal menyimpan antrean offline ke localStorage:', err);
    }
  }
  const snapshot = [...nextQueue];
  queueListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // Ignore listener exception
    }
  });
}

function stripUndefined<T>(val: T): T {
  if (Array.isArray(val)) {
    return val.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (val && typeof val === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        cleaned[k] = stripUndefined(v);
      }
    }
    return cleaned as T;
  }
  return val;
}

const COLLECTION_LABEL_ID: Record<string, string> = {
  transactions: 'Transaksi',
  products: 'Produk',
  customers: 'Pelanggan',
  cashflows: 'Arus Kas',
  purchases: 'Pembelian (PO)',
  stock_opnames: 'Stock Opname',
  attendances: 'Absensi',
  suppliers: 'Supplier',
  categories: 'Kategori Produk',
  customer_categories: 'Kategori Pelanggan',
  online_orders: 'Pesanan Online',
  activity_logs: 'Log Aktivitas',
  tax_records: 'Catatan Pajak',
  tax_audit_logs: 'Log Audit Pajak',
  tax_adjustments: 'Adjustment Pajak',
  balance_sheet_entries: 'Akun Neraca',
  settings: 'Pengaturan Toko',
  users: 'Pengguna',
  mail: 'Email Struk',
};

function buildReadableSummary(
  kind: OfflineSyncJobKind,
  collectionName: string,
  docId?: string,
  data?: Record<string, unknown>,
  items?: Array<{ id: string; data: Record<string, unknown> }>
): string {
  const label = COLLECTION_LABEL_ID[collectionName] || collectionName;
  if (kind === 'SETTINGS_SAVE') {
    return 'Pengaturan Toko & Pembayaran';
  }
  if (kind === 'BATCH_UPSERT') {
    const count = items?.length || 0;
    return `Batch ${label} (${count} data)`;
  }
  if (kind === 'DOC_DELETE') {
    return `Hapus ${label} (${docId || '-'})`;
  }
  if (collectionName === 'transactions' && data) {
    const inv = typeof data.invoiceNumber === 'string' ? data.invoiceNumber : docId;
    return `Transaksi ${inv || ''}`.trim();
  }
  if (collectionName === 'products' && data && typeof data.name === 'string') {
    return `Produk: ${data.name}`;
  }
  if (collectionName === 'customers' && data && typeof data.name === 'string') {
    return `Pelanggan: ${data.name}`;
  }
  if (collectionName === 'cashflows' && data && typeof data.category === 'string') {
    return `Kas: ${data.category}`;
  }
  return `${label} (${docId || 'doc'})`;
}

export function getOfflineSyncQueue(): OfflineSyncJob[] {
  return [...readQueueFromStorage()];
}

export function getOfflineQueueCount(): number {
  return readQueueFromStorage().length;
}

export function subscribeOfflineSyncQueue(
  callback: (queue: OfflineSyncJob[]) => void
): () => void {
  queueListeners.add(callback);
  callback(getOfflineSyncQueue());
  return () => {
    queueListeners.delete(callback);
  };
}

export function enqueueOfflineSyncJob(input: {
  kind: OfflineSyncJobKind;
  collectionName: string;
  docId?: string;
  data?: Record<string, unknown>;
  items?: Array<{ id: string; data: Record<string, unknown> }>;
  replace?: boolean;
  lastError?: string;
  summary?: string;
}): OfflineSyncJob {
  const now = Date.now();
  const current = [...readQueueFromStorage()];
  const cleanedData = input.data ? stripUndefined(input.data) : undefined;
  const cleanedItems = input.items
    ? input.items.map((it) => ({ id: it.id, data: stripUndefined(it.data) }))
    : undefined;
  const summary =
    input.summary ||
    buildReadableSummary(
      input.kind,
      input.collectionName,
      input.docId,
      cleanedData,
      cleanedItems
    );

  // Coalesce single-document or settings updates so duplicate edits to same record don't bloat the queue
  if (input.kind === 'SETTINGS_SAVE') {
    const idx = current.findIndex((j) => j.kind === 'SETTINGS_SAVE');
    const job: OfflineSyncJob = {
      id: idx >= 0 ? current[idx].id : `oq_settings_${now}`,
      kind: 'SETTINGS_SAVE',
      collectionName: 'settings',
      docId: 'store_config',
      data: cleanedData,
      replace: Boolean(input.replace),
      createdAt: idx >= 0 ? current[idx].createdAt : now,
      updatedAt: now,
      attempts: idx >= 0 ? current[idx].attempts : 0,
      lastError: input.lastError,
      summary,
    };
    if (idx >= 0) {
      current[idx] = job;
    } else {
      current.push(job);
    }
    persistQueue(current);
    return job;
  }

  if ((input.kind === 'DOC_UPSERT' || input.kind === 'DOC_DELETE') && input.docId) {
    const existingIdx = current.findIndex(
      (j) =>
        (j.kind === 'DOC_UPSERT' || j.kind === 'DOC_DELETE') &&
        j.collectionName === input.collectionName &&
        j.docId === input.docId
    );

    const job: OfflineSyncJob = {
      id:
        existingIdx >= 0
          ? current[existingIdx].id
          : `oq_${now}_${Math.random().toString(36).slice(2, 7)}`,
      kind: input.kind,
      collectionName: input.collectionName,
      docId: input.docId,
      data: input.kind === 'DOC_UPSERT' ? cleanedData : undefined,
      createdAt: existingIdx >= 0 ? current[existingIdx].createdAt : now,
      updatedAt: now,
      attempts: existingIdx >= 0 ? current[existingIdx].attempts : 0,
      lastError: input.lastError,
      summary,
    };

    if (existingIdx >= 0) {
      current[existingIdx] = job;
    } else {
      current.push(job);
    }
    persistQueue(current);
    return job;
  }

  // BATCH_UPSERT: normalize into FIFO job (also prune any stale identical doc jobs superseded by this batch)
  const batchIds = new Set((cleanedItems || []).map((i) => i.id));
  const filtered = current.filter(
    (j) =>
      !(
        j.kind === 'DOC_UPSERT' &&
        j.collectionName === input.collectionName &&
        j.docId &&
        batchIds.has(j.docId)
      )
  );

  const job: OfflineSyncJob = {
    id: `oq_${now}_${Math.random().toString(36).slice(2, 7)}`,
    kind: input.kind,
    collectionName: input.collectionName,
    docId: input.docId,
    data: cleanedData,
    items: cleanedItems,
    replace: input.replace,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    lastError: input.lastError,
    summary,
  };
  filtered.push(job);
  persistQueue(filtered);
  return job;
}

export function removeOfflineSyncJob(jobId: string): void {
  const next = readQueueFromStorage().filter((j) => j.id !== jobId);
  persistQueue(next);
}

export function clearOfflineSyncQueue(): void {
  persistQueue([]);
}

/**
 * Merges pending local offline mutations over incoming Firestore collection snapshots
 * so unsynced offline sales, stock deductions, or customer edits are never wiped out
 * when Firestore listeners reconnect before queue flush finishes.
 */
export function mergeOfflinePendingCollection<T extends { id: string }>(
  collectionName: string,
  serverItems: T[]
): T[] {
  const queue = readQueueFromStorage().filter(
    (j) => j.collectionName === collectionName
  );
  if (queue.length === 0) return serverItems;

  const map = new Map<string, T>();
  serverItems.forEach((item) => {
    if (item && item.id) {
      map.set(item.id, item);
    }
  });

  // Apply FIFO pending mutations in chronological order
  const sortedJobs = [...queue].sort((a, b) => a.createdAt - b.createdAt);
  for (const job of sortedJobs) {
    if (job.kind === 'DOC_UPSERT' && job.docId && job.data) {
      map.set(job.docId, { ...job.data, id: job.docId } as unknown as T);
    } else if (job.kind === 'DOC_DELETE' && job.docId) {
      map.delete(job.docId);
    } else if (job.kind === 'BATCH_UPSERT' && Array.isArray(job.items)) {
      for (const it of job.items) {
        if (it && it.id && it.data) {
          map.set(it.id, { ...it.data, id: it.id } as unknown as T);
        }
      }
    }
  }

  return Array.from(map.values());
}

export function mergeOfflinePendingSettings(
  serverSettings: StoreSettings
): StoreSettings {
  const settingsJob = readQueueFromStorage().find(
    (j) => j.kind === 'SETTINGS_SAVE' && j.data
  );
  if (!settingsJob || !settingsJob.data) return serverSettings;
  return {
    ...serverSettings,
    ...(settingsJob.data as Partial<StoreSettings>),
  };
}

export interface OfflineFlushProgressEvent {
  phase: 'START' | 'JOB_START' | 'JOB_SUCCESS' | 'JOB_ERROR' | 'DONE';
  collectionName: string;
  job: OfflineSyncJob;
  collectionProcessed: number;
  collectionTotal: number;
  collectionFailed: number;
  overallProcessed: number;
  overallTotal: number;
  errorMessage?: string;
  abortedByNetwork?: boolean;
}

export interface OfflineSyncExecutors {
  upsertDoc: (
    collectionName: string,
    docId: string,
    data: Record<string, unknown>
  ) => Promise<void>;
  deleteDoc: (collectionName: string, docId: string) => Promise<void>;
  upsertBatch: (
    collectionName: string,
    items: Array<{ id: string; data: Record<string, unknown> }>
  ) => Promise<void>;
  saveSettings: (
    settings: Record<string, unknown>,
    replace?: boolean
  ) => Promise<void>;
  isRetryableNetworkError?: (err: unknown) => boolean;
  onProgress?: (event: OfflineFlushProgressEvent) => void;
}

function defaultIsRetryableError(err: unknown): boolean {
  const code = String((err as { code?: unknown })?.code || '').toLowerCase();
  const msg = String((err as { message?: unknown })?.message || '').toLowerCase();
  return (
    code.includes('unavailable') ||
    code.includes('deadline-exceeded') ||
    code.includes('resource-exhausted') ||
    code.includes('aborted') ||
    code.includes('network') ||
    msg.includes('offline') ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('client is offline')
  );
}

/**
 * Replays queued offline writes in FIFO chronological order.
 * Re-entrant calls share the same in-flight promise.
 */
export async function flushOfflineSyncQueue(
  executors: OfflineSyncExecutors
): Promise<OfflineFlushResult> {
  if (flushPromise) {
    return flushPromise;
  }

  flushPromise = (async (): Promise<OfflineFlushResult> => {
    const initialQueue = [...readQueueFromStorage()].sort(
      (a, b) => a.createdAt - b.createdAt
    );

    if (initialQueue.length === 0) {
      return {
        flushedCount: 0,
        failedCount: 0,
        remainingCount: 0,
        abortedByNetwork: false,
      };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        flushedCount: 0,
        failedCount: 0,
        remainingCount: initialQueue.length,
        abortedByNetwork: true,
        lastError: 'Perangkat masih dalam kondisi offline.',
      };
    }

    const isRetryable =
      executors.isRetryableNetworkError || defaultIsRetryableError;

    const totalPerCol = new Map<string, number>();
    const processedPerCol = new Map<string, number>();
    const failedPerCol = new Map<string, number>();
    initialQueue.forEach((job) => {
      totalPerCol.set(job.collectionName, (totalPerCol.get(job.collectionName) || 0) + 1);
    });

    const emitProgress = (
      phase: OfflineFlushProgressEvent['phase'],
      job: OfflineSyncJob,
      extra?: { errorMessage?: string; abortedByNetwork?: boolean }
    ) => {
      if (!executors.onProgress) return;
      try {
        executors.onProgress({
          phase,
          collectionName: job.collectionName,
          job,
          collectionProcessed: processedPerCol.get(job.collectionName) || 0,
          collectionTotal: totalPerCol.get(job.collectionName) || 1,
          collectionFailed: failedPerCol.get(job.collectionName) || 0,
          overallProcessed: flushedCount + failedCount,
          overallTotal: initialQueue.length,
          errorMessage: extra?.errorMessage,
          abortedByNetwork: extra?.abortedByNetwork,
        });
      } catch {
        // ignore progress callback errors
      }
    };

    let flushedCount = 0;
    let failedCount = 0;
    let abortedByNetwork = false;
    let lastError: string | undefined;

    for (const job of initialQueue) {
      emitProgress('JOB_START', job);
      try {
        if (job.kind === 'DOC_UPSERT' && job.docId && job.data) {
          await executors.upsertDoc(job.collectionName, job.docId, job.data);
        } else if (job.kind === 'DOC_DELETE' && job.docId) {
          await executors.deleteDoc(job.collectionName, job.docId);
        } else if (job.kind === 'BATCH_UPSERT' && job.items && job.items.length > 0) {
          await executors.upsertBatch(job.collectionName, job.items);
        } else if (job.kind === 'SETTINGS_SAVE' && job.data) {
          await executors.saveSettings(job.data, job.replace);
        }

        // Remove succeeded job immediately so partial progress survives reload
        const remaining = readQueueFromStorage().filter((j) => j.id !== job.id);
        persistQueue(remaining);
        flushedCount += 1;
        processedPerCol.set(
          job.collectionName,
          (processedPerCol.get(job.collectionName) || 0) + 1
        );
        emitProgress('JOB_SUCCESS', job);
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : String(err || 'Sync error');
        lastError = errMsg;

        // Update failure metadata on the job in queue
        const updated = readQueueFromStorage().map((j) =>
          j.id === job.id
            ? {
                ...j,
                attempts: (j.attempts || 0) + 1,
                updatedAt: Date.now(),
                lastError: errMsg,
              }
            : j
        );
        persistQueue(updated);
        failedPerCol.set(
          job.collectionName,
          (failedPerCol.get(job.collectionName) || 0) + 1
        );

        const retryable =
          isRetryable(err) || (typeof navigator !== 'undefined' && !navigator.onLine);
        emitProgress('JOB_ERROR', job, {
          errorMessage: errMsg,
          abortedByNetwork: retryable,
        });

        if (retryable) {
          abortedByNetwork = true;
          break;
        }
        // Non-network error (e.g. validation rule) -> record & proceed to remaining jobs so one bad job doesn't block all receipts
        failedCount += 1;
      }
    }

    if (initialQueue.length > 0) {
      emitProgress('DONE', initialQueue[initialQueue.length - 1], {
        errorMessage: lastError,
        abortedByNetwork,
      });
    }

    return {
      flushedCount,
      failedCount,
      remainingCount: readQueueFromStorage().length,
      abortedByNetwork,
      lastError,
    };
  })();

  try {
    return await flushPromise;
  } finally {
    flushPromise = null;
  }
}
