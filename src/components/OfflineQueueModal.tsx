import React, { useState } from 'react';
import {
  WifiOff,
  Wifi,
  RefreshCw,
  Trash2,
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Database,
  Loader2,
} from 'lucide-react';
import { OfflineSyncJob } from '../utils/offlineQueue';
import { sound } from '../utils/audio';

interface OfflineQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobs: OfflineSyncJob[];
  isBrowserOnline: boolean;
  isManualOfflineMode: boolean;
  isSyncing: boolean;
  onForceSyncNow: () => Promise<void>;
  onRemoveJob: (jobId: string) => void;
  onClearAllJobs: () => void;
  canClearQueue: boolean;
}

export const OfflineQueueModal: React.FC<OfflineQueueModalProps> = ({
  isOpen,
  onClose,
  jobs,
  isBrowserOnline,
  isManualOfflineMode,
  isSyncing,
  onForceSyncNow,
  onRemoveJob,
  onClearAllJobs,
  canClearQueue,
}) => {
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  if (!isOpen) return null;

  const formatTime = (ts: number) => {
    try {
      return new Date(ts).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '-';
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                !isBrowserOnline || isManualOfflineMode
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-sky-100 text-sky-700'
              }`}
            >
              {!isBrowserOnline || isManualOfflineMode ? (
                <WifiOff className="w-5 h-5" />
              ) : (
                <Wifi className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                Antrean Sinkronisasi Mode Offline
              </h3>
              <p className="text-[11px] text-slate-500">
                {jobs.length > 0
                  ? `${jobs.length} transaksi / pembaruan tersimpan aman lokal & siap dikirim FIFO ke server.`
                  : 'Semua transaksi & pembaruan sudah tersinkronisasi ke server Firebase.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              onClose();
            }}
            className="p-2 rounded-xl hover:bg-slate-200/70 text-slate-500 cursor-pointer"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status strip */}
        <div className="px-5 py-2.5 bg-white border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded-md font-bold text-[10.5px] border ${
                !isBrowserOnline
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : isManualOfflineMode
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {!isBrowserOnline
                ? 'Internet Terputus (Offline)'
                : isManualOfflineMode
                ? 'Mode Local Only Aktif'
                : 'Internet Terhubung'}
            </span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              Antrean: <strong className="text-slate-800">{jobs.length}</strong> item
            </span>
          </div>

          <button
            type="button"
            disabled={isSyncing || !isBrowserOnline || isManualOfflineMode || jobs.length === 0}
            onClick={() => {
              sound.playTap();
              onForceSyncNow();
            }}
            className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {isSyncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
          </button>
        </div>

        {/* Queue list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/60">
          {jobs.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <div className="text-sm font-bold text-slate-800">
                Antrean Offline Bersih
              </div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Tidak ada data tertunda. Saat koneksi internet terputus, transaksi kasir tetap berjalan normal dan otomatis masuk antrean ini.
              </p>
            </div>
          ) : (
            jobs.map((job, idx) => (
              <div
                key={job.id}
                className="p-3 rounded-xl bg-white border border-slate-200 flex items-start justify-between gap-3 shadow-2xs"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                      <Database className="w-3 h-3 text-sky-600 shrink-0" />
                      <span className="truncate">{job.summary}</span>
                    </div>
                    <div className="text-[10.5px] text-slate-500 flex items-center gap-2 flex-wrap tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(job.createdAt)}
                      </span>
                      <span>·</span>
                      <span className="font-mono">{job.collectionName}</span>
                      {job.attempts > 0 && (
                        <span className="text-amber-700 font-semibold">
                          · {job.attempts}x percobaan
                        </span>
                      )}
                    </div>
                    {job.lastError && (
                      <div className="text-[10.5px] text-rose-600 flex items-center gap-1 pt-0.5">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span className="truncate">{job.lastError}</span>
                      </div>
                    )}
                  </div>
                </div>

                {canClearQueue && (
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      onRemoveJob(job.id);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                    title="Hapus item antrean ini"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center justify-between gap-2">
          {canClearQueue && jobs.length > 0 ? (
            confirmClearAll ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-rose-700 font-bold">Kosongkan semua antrean?</span>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    onClearAllJobs();
                    setConfirmClearAll(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
                >
                  Ya, Kosongkan
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold cursor-pointer"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setConfirmClearAll(true);
                }}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
              >
                Bersihkan Antrean
              </button>
            )
          ) : (
            <span className="text-[11px] text-slate-400">
              Sinkronisasi otomatis berjalan saat internet kembali stabil.
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
