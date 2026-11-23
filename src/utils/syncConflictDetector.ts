import { OfflineSyncJob } from './offlineQueue';
import { getSyncModuleLabel, SYNC_MODULE_DEFINITIONS } from './syncTelemetry';

export type SyncConflictType =
  | 'VALUE_MISMATCH'
  | 'LOCAL_ONLY'
  | 'SERVER_ONLY'
  | 'QUEUE_ERROR'
  | 'BOOTSTRAP_MISSING';

export type SyncConflictSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export type SyncRecommendedAction =
  | 'PUSH_LOCAL'
  | 'PULL_SERVER'
  | 'RETRY_QUEUE'
  | 'DISMISS_QUEUE_JOB';

export interface SyncFieldDiff {
  field: string;
  label: string;
  localValue: string;
  serverValue: string;
}

export interface SyncConflictItem {
  id: string;
  collectionName: string;
  moduleLabel: string;
  docId: string;
  recordTitle: string;
  conflictType: SyncConflictType;
  severity: SyncConflictSeverity;
  reason: string;
  repairSuggestion: string;
  recommendedAction: SyncRecommendedAction;
  fieldDiffs: SyncFieldDiff[];
  localRecord?: Record<string, unknown>;
  serverRecord?: Record<string, unknown>;
  offlineJob?: OfflineSyncJob;
  detectedAt: number;
}

export type CollectionHealthState =
  | 'HEALTHY'
  | 'PENDING_SYNC'
  | 'CONFLICT'
  | 'UNREACHABLE';

export interface CollectionHealthMatrixRow {
  collectionName: string;
  moduleLabel: string;
  localCount: number;
  serverCount: number | null;
  queuedCount: number;
  conflictCount: number;
  healthStatus: CollectionHealthState;
  errorMessage?: string;
}

export interface SyncHealthAuditReport {
  scannedAt: number;
  serverReachable: boolean;
  totalCollectionsScanned: number;
  healthyCollectionsCount: number;
  conflictCollectionsCount: number;
  totalConflicts: number;
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
  healthScore: number; // 0..100
  collectionMatrix: CollectionHealthMatrixRow[];
  conflicts: SyncConflictItem[];
}

export interface LocalCollectionsSnapshotInput {
  products?: Array<Record<string, unknown> & { id: string }>;
  purchases?: Array<Record<string, unknown> & { id: string }>;
  categories?: Array<Record<string, unknown> & { id: string }>;
  customer_categories?: Array<Record<string, unknown> & { id: string }>;
  customers?: Array<Record<string, unknown> & { id: string }>;
  suppliers?: Array<Record<string, unknown> & { id: string }>;
  transactions?: Array<Record<string, unknown> & { id: string }>;
  attendances?: Array<Record<string, unknown> & { id: string }>;
  stock_opnames?: Array<Record<string, unknown> & { id: string }>;
  cashflows?: Array<Record<string, unknown> & { id: string }>;
  online_orders?: Array<Record<string, unknown> & { id: string }>;
  activity_logs?: Array<Record<string, unknown> & { id: string }>;
  tax_records?: Array<Record<string, unknown> & { id: string }>;
  tax_audit_logs?: Array<Record<string, unknown> & { id: string }>;
  tax_adjustments?: Array<Record<string, unknown> & { id: string }>;
  balance_sheet_entries?: Array<Record<string, unknown> & { id: string }>;
  users?: Array<Record<string, unknown> & { id: string }>;
  settings?: Record<string, unknown>;
}

export type ServerCollectionsSnapshotMap = Record<
  string,
  {
    ok: boolean;
    docs: Array<Record<string, unknown> & { id: string }>;
    errorMessage?: string;
  }
>;

const IMPORTANT_FIELD_LABELS: Record<string, Record<string, string>> = {
  products: {
    name: 'Nama Produk',
    stockInBaseUnit: 'Stok Total',
    costPrice: 'Harga Beli (HPP)',
    minStockAlert: 'Batas Stok Min.',
    category: 'Kategori',
    discountPercent: 'Diskon (%)',
    units: 'Harga & Multi-Satuan',
    batches: 'Batch Inventaris',
  },
  transactions: {
    invoiceNumber: 'No. Invoice',
    finalAmount: 'Total Akhir',
    paymentStatus: 'Status Bayar',
    paymentMethod: 'Metode Bayar',
    discount: 'Diskon',
    returnedAmount: 'Nominal Retur',
    returnStatus: 'Status Retur',
    items: 'Item Transaksi',
  },
  customers: {
    name: 'Nama Pelanggan',
    totalDebt: 'Total Piutang',
    totalPoints: 'Total Poin',
    creditLimit: 'Limit Kredit',
    customerCategory: 'Kategori',
    whatsapp: 'No. WhatsApp',
  },
  cashflows: {
    type: 'Jenis Kas',
    category: 'Kategori',
    amount: 'Nominal',
    date: 'Tanggal',
    paymentMethod: 'Metode',
    description: 'Keterangan',
  },
  purchases: {
    poNumber: 'No. PO',
    status: 'Status PO',
    totalAmount: 'Total Tagihan',
    paidAmount: 'Jumlah Dibayar',
    items: 'Item Pembelian',
  },
  stock_opnames: {
    sessionNumber: 'No. Sesi Audit',
    totalItemsAudited: 'Jumlah Item',
    totalDiscrepancies: 'Jumlah Selisih',
    totalDifferenceValue: 'Nilai Selisih',
  },
  settings: {
    storeName: 'Nama Toko',
    storeAddress: 'Alamat Toko',
    manualOfflineMode: 'Mode Offline Manual',
    customPaymentMethods: 'Metode Pembayaran',
    taxConfig: 'Konfigurasi Pajak',
    storeUnits: 'Unit/Cabang Toko',
  },
  users: {
    name: 'Nama Pengguna',
    role: 'Peran/Hak Akses',
    pin: 'PIN Login',
  },
};

function normalizeValueForComparison(val: unknown): unknown {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.map((item) => normalizeValueForComparison(item));
  }
  const obj = val as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj).sort();
  for (const k of keys) {
    const normalized = normalizeValueForComparison(obj[k]);
    // Treat missing key and null as equivalent so sanitizeForFirestore(undefined -> null) doesn't trigger false diffs
    if (normalized !== null) {
      sorted[k] = normalized;
    }
  }
  return sorted;
}

export function canonicalJsonEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeValueForComparison(a)) === JSON.stringify(normalizeValueForComparison(b));
}

function formatPreviewValue(val: unknown): string {
  if (val === undefined || val === null) return '(kosong)';
  if (typeof val === 'boolean') return val ? 'Ya' : 'Tidak';
  if (typeof val === 'number') return val.toLocaleString('id-ID');
  if (typeof val === 'string') return val.length > 60 ? `${val.slice(0, 57)}...` : val || '(kosong)';
  if (Array.isArray(val)) return `${val.length} item`;
  if (typeof val === 'object') {
    const keys = Object.keys(val as Record<string, unknown>);
    return `{${keys.length} properti}`;
  }
  return String(val);
}

function extractRecordTitle(
  collectionName: string,
  docId: string,
  record?: Record<string, unknown>
): string {
  if (!record) return `${getSyncModuleLabel(collectionName)} (${docId})`;
  if (collectionName === 'settings') {
    return typeof record.storeName === 'string' && record.storeName
      ? `Pengaturan: ${record.storeName}`
      : 'Konfigurasi Toko (store_config)';
  }
  if (typeof record.invoiceNumber === 'string' && record.invoiceNumber) {
    return `Invoice ${record.invoiceNumber}`;
  }
  if (typeof record.poNumber === 'string' && record.poNumber) {
    return `PO ${record.poNumber}`;
  }
  if (typeof record.sessionNumber === 'string' && record.sessionNumber) {
    return `Opname ${record.sessionNumber}`;
  }
  if (typeof record.orderCode === 'string' && record.orderCode) {
    return `Pesanan ${record.orderCode}`;
  }
  if (typeof record.name === 'string' && record.name) {
    return record.name;
  }
  if (typeof record.accountName === 'string' && record.accountName) {
    return record.accountName;
  }
  if (typeof record.category === 'string' && record.category) {
    return `${record.category}${typeof record.amount === 'number' ? ` (${formatPreviewValue(record.amount)})` : ''}`;
  }
  if (typeof record.summary === 'string' && record.summary) {
    return record.summary.slice(0, 60);
  }
  return `${getSyncModuleLabel(collectionName)} (${docId})`;
}

function extractComparableTimestamp(record?: Record<string, unknown>): number {
  if (!record) return 0;
  const candidates = [record.updatedAt, record.timestamp, record.receivedAt];
  for (const cand of candidates) {
    if (typeof cand === 'number' && Number.isFinite(cand)) return cand;
    if (typeof cand === 'string') {
      const parsed = Date.parse(cand);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function computeFieldDiffs(
  collectionName: string,
  localRecord: Record<string, unknown>,
  serverRecord: Record<string, unknown>
): SyncFieldDiff[] {
  const knownLabels = IMPORTANT_FIELD_LABELS[collectionName] || {};
  const ignoredKeys = new Set(['id', 'qrCodeDataUrl']);
  const allKeys = new Set([
    ...Object.keys(localRecord),
    ...Object.keys(serverRecord),
  ]);

  const diffs: SyncFieldDiff[] = [];
  for (const key of allKeys) {
    if (ignoredKeys.has(key)) continue;
    const lv = localRecord[key];
    const sv = serverRecord[key];
    if (!canonicalJsonEquals(lv, sv)) {
      diffs.push({
        field: key,
        label: knownLabels[key] || key,
        localValue: formatPreviewValue(lv),
        serverValue: formatPreviewValue(sv),
      });
    }
  }

  // Prioritize known business-critical fields first
  diffs.sort((a, b) => {
    const aKnown = Boolean(knownLabels[a.field]);
    const bKnown = Boolean(knownLabels[b.field]);
    if (aKnown && !bKnown) return -1;
    if (!aKnown && bKnown) return 1;
    return a.field.localeCompare(b.field);
  });

  return diffs;
}

function classifyCollectionSeverity(collectionName: string): SyncConflictSeverity {
  if (
    collectionName === 'transactions' ||
    collectionName === 'products' ||
    collectionName === 'cashflows' ||
    collectionName === 'customers' ||
    collectionName === 'purchases' ||
    collectionName === 'users' ||
    collectionName === 'settings'
  ) {
    return 'HIGH';
  }
  if (
    collectionName === 'stock_opnames' ||
    collectionName === 'online_orders' ||
    collectionName === 'tax_records' ||
    collectionName === 'tax_adjustments' ||
    collectionName === 'balance_sheet_entries'
  ) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function detectSyncConflictsReport(params: {
  localState: LocalCollectionsSnapshotInput;
  serverSnapshots: ServerCollectionsSnapshotMap;
  offlineJobs: OfflineSyncJob[];
  scannedAt?: number;
}): SyncHealthAuditReport {
  const scannedAt = params.scannedAt ?? Date.now();
  const conflicts: SyncConflictItem[] = [];
  const matrix: CollectionHealthMatrixRow[] = [];

  const queuedJobsByCollection = new Map<string, OfflineSyncJob[]>();
  params.offlineJobs.forEach((job) => {
    const arr = queuedJobsByCollection.get(job.collectionName) || [];
    arr.push(job);
    queuedJobsByCollection.set(job.collectionName, arr);
  });

  // 1. Flag failed/blocked offline queue jobs explicitly first
  const erroredQueueKeys = new Set<string>();
  params.offlineJobs.forEach((job) => {
    if (job.attempts > 0 || job.lastError) {
      const moduleLabel = getSyncModuleLabel(job.collectionName);
      const isPermissionOrValidation =
        Boolean(job.lastError) &&
        /(permission|invalid|too large|exceeds|missing|denied)/i.test(job.lastError || '');

      const docKey = `${job.collectionName}:${job.docId || job.id}`;
      erroredQueueKeys.add(docKey);

      conflicts.push({
        id: `qerr_${job.id}`,
        collectionName: job.collectionName,
        moduleLabel,
        docId: job.docId || job.id,
        recordTitle: job.summary,
        conflictType: 'QUEUE_ERROR',
        severity: isPermissionOrValidation ? 'HIGH' : 'MEDIUM',
        reason: `Antrean sinkronisasi lokal gagal terkirim (${job.attempts}x percobaan): ${job.lastError || 'Error jaringan / validasi'}.`,
        repairSuggestion: isPermissionOrValidation
          ? 'Periksa pesan error aturan/ukuran data. Jika data sudah usang atau bermasalah, hapus item antrean rusak atau perbaiki datanya di modul terkait.'
          : 'Kirim ulang antrean ini sekarang saat koneksi internet stabil untuk mencegah selisih data dengan perangkat lain.',
        recommendedAction: isPermissionOrValidation ? 'DISMISS_QUEUE_JOB' : 'RETRY_QUEUE',
        fieldDiffs: [],
        localRecord: job.data,
        offlineJob: job,
        detectedAt: scannedAt,
      });
    }
  });

  // 2. Compare each collection Local State vs Server Snapshot
  let serverReachableCount = 0;

  for (const modDef of SYNC_MODULE_DEFINITIONS) {
    const colName = modDef.collectionName;
    const serverSnap = params.serverSnapshots[colName];
    const colQueueJobs = queuedJobsByCollection.get(colName) || [];

    // Pending docIds from offline queue (these are expected diffs until flushed)
    const pendingDocIds = new Set<string>();
    colQueueJobs.forEach((job) => {
      if (job.docId) pendingDocIds.add(job.docId);
      if (Array.isArray(job.items)) {
        job.items.forEach((it) => {
          if (it.id) pendingDocIds.add(it.id);
        });
      }
    });

    const localItems: Array<Record<string, unknown> & { id: string }> =
      colName === 'settings'
        ? params.localState.settings
          ? [{ ...params.localState.settings, id: 'store_config' }]
          : []
        : ((params.localState as Record<string, unknown>)[colName] as Array<
            Record<string, unknown> & { id: string }
          >) || [];

    if (!serverSnap || !serverSnap.ok) {
      const colErroredConflicts = conflicts.filter(
        (c) => c.collectionName === colName && c.conflictType === 'QUEUE_ERROR'
      ).length;
      matrix.push({
        collectionName: colName,
        moduleLabel: modDef.label,
        localCount: localItems.length,
        serverCount: null,
        queuedCount: colQueueJobs.length,
        conflictCount: colErroredConflicts,
        healthStatus: 'UNREACHABLE',
        errorMessage: serverSnap?.errorMessage || 'Server Firestore tidak dapat dijangkau',
      });
      continue;
    }

    serverReachableCount += 1;
    const serverDocs = serverSnap.docs || [];
    const localMap = new Map<string, Record<string, unknown> & { id: string }>();
    localItems.forEach((item) => {
      if (item && item.id) localMap.set(item.id, item);
    });
    const serverMap = new Map<string, Record<string, unknown> & { id: string }>();
    serverDocs.forEach((docItem) => {
      if (docItem && docItem.id) serverMap.set(docItem.id, docItem);
    });

    let colConflictCount = conflicts.filter(
      (c) => c.collectionName === colName && c.conflictType === 'QUEUE_ERROR'
    ).length;

    // Special check for core bootstrap missing on server
    if ((colName === 'settings' || colName === 'users') && serverDocs.length === 0 && localItems.length > 0) {
      colConflictCount += 1;
      conflicts.push({
        id: `boot_${colName}`,
        collectionName: colName,
        moduleLabel: modDef.label,
        docId: colName === 'settings' ? 'store_config' : 'users_bootstrap',
        recordTitle: colName === 'settings' ? 'Konfigurasi Toko Utama' : 'Daftar Akun Pengguna',
        conflictType: 'BOOTSTRAP_MISSING',
        severity: 'HIGH',
        reason: `Koleksi inti ${modDef.label} kosong di server Firestore, sedangkan perangkat lokal memiliki ${localItems.length} data aktif.`,
        repairSuggestion: `Segera kirim data ${modDef.label} lokal ke Firestore agar seluruh perangkat sinkron dan tidak memakai konfigurasi kosong.`,
        recommendedAction: 'PUSH_LOCAL',
        fieldDiffs: [],
        localRecord: localItems[0],
        detectedAt: scannedAt,
      });
    } else {
      // Check Local vs Server per document
      for (const [docId, localDoc] of localMap.entries()) {
        const key = `${colName}:${docId}`;
        if (erroredQueueKeys.has(key)) continue;

        const serverDoc = serverMap.get(docId);
        if (!serverDoc) {
          if (pendingDocIds.has(docId)) {
            // Expected offline queued write, not yet a divergence conflict unless queue fails
            continue;
          }
          colConflictCount += 1;
          conflicts.push({
            id: `loc_${colName}_${docId}`,
            collectionName: colName,
            moduleLabel: modDef.label,
            docId,
            recordTitle: extractRecordTitle(colName, docId, localDoc),
            conflictType: 'LOCAL_ONLY',
            severity: classifyCollectionSeverity(colName),
            reason: `Data "${extractRecordTitle(colName, docId, localDoc)}" ada di penyimpanan lokal namun belum ditemukan di server Firestore.`,
            repairSuggestion:
              'Unggah data lokal ini ke server Firestore (disarankan agar perubahan di perangkat ini tidak hilang), atau hapus dari lokal jika memang sengaja dihapus dari perangkat lain.',
            recommendedAction: 'PUSH_LOCAL',
            fieldDiffs: [],
            localRecord: localDoc,
            detectedAt: scannedAt,
          });
          continue;
        }

        // Skip diff check if there is already a clean pending offline write for this exact doc
        if (pendingDocIds.has(docId)) {
          // Check if server also changed relative to expectation — still surface if server timestamp is newer than queue!
          const matchingJob = colQueueJobs.find(
            (j) =>
              j.docId === docId ||
              (Array.isArray(j.items) && j.items.some((it) => it.id === docId))
          );
          const serverTs = extractComparableTimestamp(serverDoc);
          if (!matchingJob || serverTs <= matchingJob.createdAt) {
            continue;
          }
        }

        const diffs = computeFieldDiffs(colName, localDoc, serverDoc);
        if (diffs.length > 0) {
          colConflictCount += 1;
          const localTs = extractComparableTimestamp(localDoc);
          const serverTs = extractComparableTimestamp(serverDoc);

          // Determine intelligent recommendation
          const serverLooksNewer = serverTs > 0 && (localTs === 0 || serverTs > localTs);
          const recommendedAction: SyncRecommendedAction = serverLooksNewer
            ? 'PULL_SERVER'
            : 'PUSH_LOCAL';

          const criticalFields = diffs.slice(0, 3).map((d) => d.label).join(', ');
          const repairSuggestion = serverLooksNewer
            ? `Versi server Firestore memiliki pembaruan lebih baru pada kolom (${criticalFields}). Disarankan tarik versi server agar sinkron antar-perangkat, atau timpa dengan data lokal jika perubahan perangkat ini yang paling valid.`
            : `Terdapat perbedaan nilai antara lokal dan server pada kolom (${criticalFields}). Periksa tabel perbandingan di bawah, lalu pilih apakah data lokal dikirim ke server atau data server ditarik ke perangkat ini.`;

          conflicts.push({
            id: `diff_${colName}_${docId}`,
            collectionName: colName,
            moduleLabel: modDef.label,
            docId,
            recordTitle: extractRecordTitle(colName, docId, localDoc),
            conflictType: 'VALUE_MISMATCH',
            severity: classifyCollectionSeverity(colName),
            reason: `${diffs.length} perbedaan field ditemukan (${criticalFields}) antara data lokal dan server Firestore.`,
            repairSuggestion,
            recommendedAction,
            fieldDiffs: diffs,
            localRecord: localDoc,
            serverRecord: serverDoc,
            detectedAt: scannedAt,
          });
        }
      }

      // Check Server-Only records missing locally
      for (const [docId, serverDoc] of serverMap.entries()) {
        if (localMap.has(docId)) continue;
        // If there is a pending delete in offlineQueue for this doc, don't flag as SERVER_ONLY conflict
        const hasPendingDelete = colQueueJobs.some(
          (j) => j.kind === 'DOC_DELETE' && j.docId === docId
        );
        if (hasPendingDelete) continue;

        colConflictCount += 1;
        conflicts.push({
          id: `srv_${colName}_${docId}`,
          collectionName: colName,
          moduleLabel: modDef.label,
          docId,
          recordTitle: extractRecordTitle(colName, docId, serverDoc),
          conflictType: 'SERVER_ONLY',
          severity: classifyCollectionSeverity(colName),
          reason: `Data "${extractRecordTitle(colName, docId, serverDoc)}" tersedia di server Firestore tetapi belum masuk ke penyimpanan lokal perangkat ini.`,
          repairSuggestion:
            'Tarik & gabungkan data dari server Firestore ke perangkat lokal agar laporan dan stok perangkat ini up-to-date.',
          recommendedAction: 'PULL_SERVER',
          fieldDiffs: [],
          serverRecord: serverDoc,
          detectedAt: scannedAt,
        });
      }
    }

    const healthStatus: CollectionHealthState =
      colConflictCount > 0
        ? 'CONFLICT'
        : colQueueJobs.length > 0
        ? 'PENDING_SYNC'
        : 'HEALTHY';

    matrix.push({
      collectionName: colName,
      moduleLabel: modDef.label,
      localCount: localItems.length,
      serverCount: serverDocs.length,
      queuedCount: colQueueJobs.length,
      conflictCount: colConflictCount,
      healthStatus,
    });
  }

  // Sort conflicts by severity (HIGH -> MEDIUM -> LOW) then collection
  const sevWeight: Record<SyncConflictSeverity, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2,
  };
  conflicts.sort((a, b) => {
    const diff = sevWeight[a.severity] - sevWeight[b.severity];
    if (diff !== 0) return diff;
    return a.collectionName.localeCompare(b.collectionName);
  });

  const highSeverityCount = conflicts.filter((c) => c.severity === 'HIGH').length;
  const mediumSeverityCount = conflicts.filter((c) => c.severity === 'MEDIUM').length;
  const lowSeverityCount = conflicts.filter((c) => c.severity === 'LOW').length;

  const healthyCollectionsCount = matrix.filter((r) => r.healthStatus === 'HEALTHY').length;
  const conflictCollectionsCount = matrix.filter((r) => r.healthStatus === 'CONFLICT').length;

  // Health Score formula (0..100)
  let healthScore = 100;
  if (serverReachableCount === 0) {
    healthScore = Math.max(0, 60 - highSeverityCount * 10 - mediumSeverityCount * 5);
  } else {
    const penalty =
      highSeverityCount * 12 +
      mediumSeverityCount * 6 +
      lowSeverityCount * 2 +
      (matrix.length - serverReachableCount) * 4;
    healthScore = Math.max(5, Math.min(100, 100 - penalty));
    if (conflicts.length === 0 && serverReachableCount === matrix.length) {
      healthScore = 100;
    }
  }

  return {
    scannedAt,
    serverReachable: serverReachableCount > 0,
    totalCollectionsScanned: matrix.length,
    healthyCollectionsCount,
    conflictCollectionsCount,
    totalConflicts: conflicts.length,
    highSeverityCount,
    mediumSeverityCount,
    lowSeverityCount,
    healthScore,
    collectionMatrix: matrix,
    conflicts,
  };
}
