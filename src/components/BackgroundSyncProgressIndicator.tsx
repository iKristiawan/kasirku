import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RefreshCw,
  WifiOff,
  Loader2,
  ShieldCheck,
  Database,
  X,
} from 'lucide-react';
import { OfflineSyncJob } from '../utils/offlineQueue';
import {
  BackgroundSyncProgressSnapshot,
  CollectionTransferProgress,
  getSyncModuleLabel,
} from '../utils/syncTelemetry';
import { sound } from '../utils/audio';

interface BackgroundSyncProgressIndicatorProps {
  isBrowserOnline: boolean;
  isManualOfflineMode: boolean;
  cloudSyncStatus: 'INITIALIZING' | 'SYNCED' | 'CONNECTING' | 'OFFLINE' | 'ERROR';
  isAutoSyncingOffline: boolean;
  offlineQueueJobs: OfflineSyncJob[];
  backgroundProgress: BackgroundSyncProgressSnapshot;
  offlineSyncResultToast: string | null;
  canAccessSyncHealth: boolean;
  onDismissToast: () => void;
  onOpenOfflineQueue: () => void;
  onOpenSyncHealth: () => void;
  onForceSyncNow: () => void;
}

export const BackgroundSyncProgressIndicator: React.FC<BackgroundSyncProgressIndicatorProps> = ({
  isBrowserOnline,
  isManualOfflineMode,
  cloudSyncStatus,
  isAutoSyncingOffline,
  offlineQueueJobs,
  backgroundProgress,
  offlineSyncResultToast,
  canAccessSyncHealth,
  onDismissToast,
  onOpenOfflineQueue,
  onOpenSyncHealth,
  onForceSyncNow,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Merge active live transfer progress with queued offline jobs per collection
  // so even while offline/unstable before transmission finishes, user sees exact per-collection breakdown
  const collectionRows: CollectionTransferProgress[] = useMemo(() => {
    if (backgroundProgress.collections.length > 0) {
      return backgroundProgress.collections;
    }
    if (offlineQueueJobs.length === 0) return [];

    const grouped = new Map<string, OfflineSyncJob[]>();
    offlineQueueJobs.forEach((job) => {
      const list = grouped.get(job.collectionName) || [];
      list.push(job);
      grouped.set(job.collectionName, list);
    });

    return Array.from(grouped.entries()).map(([collectionName, jobs]) => {
      const erroredCount = jobs.filter((j) => Boolean(j.lastError) && j.attempts > 0).length;
      const latestJob = jobs[jobs.length - 1];
      const latestErr = jobs.find((j) => j.lastError)?.lastError;
      return {
        collectionName,
        moduleLabel: getSyncModuleLabel(collectionName),
        operationLabel:
          !isBrowserOnline
            ? 'Menunggu Koneksi Internet'
            : isManualOfflineMode
            ? 'Tertunda (Mode Local Only)'
            : erroredCount > 0
            ? 'Menunggu Ulang / Perbaikan'
            : 'Antrean Siap Kirim',
        status: erroredCount > 0 ? 'ERROR' : 'QUEUED',
        totalDocs: jobs.length,
        processedDocs: 0,
        failedDocs: erroredCount,
        percent: 0,
        currentItemSummary: latestJob?.summary,
        errorMessage: latestErr,
        startedAt: jobs[0]?.createdAt || Date.now(),
        updatedAt: latestJob?.updatedAt || Date.now(),
      };
    });
  }, [backgroundProgress.collections, offlineQueueJobs, isBrowserOnline, isManualOfflineMode]);

  const isUnstableOrOffline =
    !isBrowserOnline || isManualOfflineMode || cloudSyncStatus === 'OFFLINE' || cloudSyncStatus === 'ERROR';

  const shouldRender =
    isUnstableOrOffline ||
    isAutoSyncingOffline ||
    offlineQueueJobs.length > 0 ||
    backgroundProgress.collections.length > 0 ||
    Boolean(offlineSyncResultToast);

  if (!shouldRender) return null;

  const hasErrors = collectionRows.some((c) => c.status === 'ERROR');
  const activeCol = collectionRows.find((c) => c.status === 'SYNCING') || null;
  const completedCount = collectionRows.filter((c) => c.status === 'COMPLETED').length;

  const containerTheme =
    offlineSyncResultToast &&
    isBrowserOnline &&
    !isUnstableOrOffline &&
    offlineQueueJobs.length === 0 &&
    !backgroundProgress.isActive &&
    !hasErrors
      ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
      : hasErrors
      ? 'bg-rose-50 border-rose-200 text-rose-950'
      : !isBrowserOnline || isManualOfflineMode || cloudSyncStatus === 'OFFLINE'
      ? 'bg-amber-50 border-amber-200 text-amber-950'
      : 'bg-sky-50 border-sky-200 text-sky-950';

  const overallPercent =
    backgroundProgress.collections.length > 0 ? backgroundProgress.overallPercent : 0;

  return (
    <div className={`border-b text-xs shrink-0 select-none ${containerTheme}`}>
      {/* Compact Header Strip */}
      <div className="px-3 md:px-5 py-2 flex items-center justify-between gap-2.5 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {isAutoSyncingOffline || backgroundProgress.isActive ? (
            <Loader2 className="w-4 h-4 text-sky-600 animate-spin shrink-0" />
          ) : offlineSyncResultToast &&
            isBrowserOnline &&
            offlineQueueJobs.length === 0 &&
            !hasErrors ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : hasErrors ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold truncate">
                {activeCol
                  ? `Menyinkronkan ${activeCol.moduleLabel} (${activeCol.processedDocs}/${activeCol.totalDocs})`
                  : offlineSyncResultToast && offlineQueueJobs.length === 0 && !backgroundProgress.isActive
                  ? offlineSyncResultToast
                  : !isBrowserOnline
                  ? `Koneksi Terputus (Offline)${
                      offlineQueueJobs.length > 0
                        ? ` · ${offlineQueueJobs.length} perubahan di ${collectionRows.length} koleksi menunggu`
                        : ' · Kasir tetap berjalan lokal'
                    }`
                  : isManualOfflineMode
                  ? `Mode Local Only Aktif${
                      offlineQueueJobs.length > 0
                        ? ` · ${offlineQueueJobs.length} data menunggu sinkronisasi`
                        : ''
                    }`
                  : cloudSyncStatus === 'OFFLINE' || cloudSyncStatus === 'ERROR'
                  ? `Koneksi Server Tidak Stabil${
                      collectionRows.length > 0
                        ? ` · ${collectionRows.length} koleksi dalam antrean background`
                        : ' · Mencoba menghubungkan ulang ke Firestore'
                    }`
                  : backgroundProgress.isActive
                  ? `Sinkronisasi Latar Belakang (${completedCount}/${collectionRows.length} koleksi)`
                  : offlineQueueJobs.length > 0
                  ? `${offlineQueueJobs.length} antrean lokal di ${collectionRows.length} koleksi siap dikirim`
                  : 'Sinkronisasi latar belakang selesai.'}
              </span>

              {(backgroundProgress.isActive || collectionRows.length > 0) && (
                <span className="font-mono tabular-nums text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-white/80 border border-black/10 shrink-0">
                  {backgroundProgress.collections.length > 0
                    ? `${backgroundProgress.overallProcessedDocs}/${backgroundProgress.overallTotalDocs} (${overallPercent}%)`
                    : `${offlineQueueJobs.length} antrean`}
                </span>
              )}
            </div>

            {/* Thin inline progress bar when actively transferring */}
            {(backgroundProgress.isActive || (collectionRows.length > 0 && overallPercent > 0)) && (
              <div className="mt-1.5 max-w-md w-full bg-white/80 border border-black/10 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    hasErrors ? 'bg-rose-500' : 'bg-sky-600'
                  }`}
                  style={{ width: `${Math.max(4, overallPercent)}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {collectionRows.length > 0 && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setIsExpanded((prev) => !prev);
              }}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-[11px] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <span>Progres Koleksi ({collectionRows.length})</span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {offlineQueueJobs.length > 0 && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onOpenOfflineQueue();
              }}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-[11px] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Database className="w-3 h-3 text-slate-600" />
              <span>Antrean ({offlineQueueJobs.length})</span>
            </button>
          )}

          {canAccessSyncHealth && (isUnstableOrOffline || hasErrors || offlineQueueJobs.length > 0) && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onOpenSyncHealth();
              }}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-[11px] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <ShieldCheck className="w-3 h-3 text-sky-600" />
              <span>Kesehatan Sync</span>
            </button>
          )}

          {offlineQueueJobs.length > 0 && isBrowserOnline && !isManualOfflineMode && (
            <button
              type="button"
              disabled={isAutoSyncingOffline}
              onClick={() => {
                sound.playTap();
                onForceSyncNow();
              }}
              className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-[11px] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isAutoSyncingOffline ? 'animate-spin' : ''}`} />
              <span>Sinkronkan</span>
            </button>
          )}

          {offlineSyncResultToast && offlineQueueJobs.length === 0 && !backgroundProgress.isActive && (
            <button
              type="button"
              onClick={onDismissToast}
              className="p-1 rounded-lg hover:bg-black/5 text-slate-500 cursor-pointer"
              aria-label="Tutup notifikasi sinkronisasi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Expandable Per-Collection Real-Time Progress Matrix */}
      {isExpanded && collectionRows.length > 0 && (
        <div className="px-3 md:px-5 pb-3 pt-1 border-t border-black/10 bg-white/85">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-1.5">
            {collectionRows.map((col) => {
              const barColor =
                col.status === 'COMPLETED'
                  ? 'bg-emerald-600'
                  : col.status === 'ERROR'
                  ? 'bg-rose-600'
                  : col.status === 'SYNCING'
                  ? 'bg-sky-600'
                  : 'bg-amber-500';
              const statusTextClass =
                col.status === 'COMPLETED'
                  ? 'text-emerald-700'
                  : col.status === 'ERROR'
                  ? 'text-rose-700'
                  : col.status === 'SYNCING'
                  ? 'text-sky-700'
                  : 'text-amber-700';

              return (
                <div
                  key={col.collectionName}
                  className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-[11.5px] truncate">
                        {col.moduleLabel}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        {col.collectionName}
                      </div>
                    </div>
                    <span className={`text-[10.5px] font-bold shrink-0 ${statusTextClass}`}>
                      {col.status === 'SYNCING'
                        ? 'Mengirim...'
                        : col.status === 'COMPLETED'
                        ? 'Selesai'
                        : col.status === 'ERROR'
                        ? 'Terhambat'
                        : 'Dalam Antrean'}
                    </span>
                  </div>

                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${barColor}`}
                      style={{
                        width: `${col.status === 'QUEUED' ? 8 : Math.max(8, col.percent)}%`,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                    <span className="truncate">
                      {col.errorMessage || col.currentItemSummary || col.operationLabel}
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-slate-700 shrink-0">
                      {col.processedDocs}/{col.totalDocs} · {col.percent}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
