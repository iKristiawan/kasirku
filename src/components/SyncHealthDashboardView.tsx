import React, { useMemo, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowUpFromLine,
  ArrowDownToLine,
  Trash2,
  Loader2,
  History,
  Database,
  WifiOff,
  Check,
  Search,
  Wrench,
} from 'lucide-react';
import {
  SyncConflictItem,
  SyncHealthAuditReport,
  SyncRecommendedAction,
} from '../utils/syncConflictDetector';
import {
  BackgroundSyncProgressSnapshot,
  SyncModuleSummary,
} from '../utils/syncTelemetry';
import { OfflineSyncJob } from '../utils/offlineQueue';
import { sound } from '../utils/audio';

interface SyncHealthDashboardViewProps {
  auditReport: SyncHealthAuditReport | null;
  isScanning: boolean;
  isResolvingBulk: boolean;
  resolvingConflictId: string | null;
  lastScanError: string | null;
  isBrowserOnline: boolean;
  isManualOfflineMode: boolean;
  offlineQueueJobs: OfflineSyncJob[];
  moduleSummaries: SyncModuleSummary[];
  backgroundProgress: BackgroundSyncProgressSnapshot;
  canAccessSyncLogs: boolean;
  onRescanHealth: () => Promise<void>;
  onResolveConflict: (
    conflict: SyncConflictItem,
    action: SyncRecommendedAction
  ) => Promise<void>;
  onResolveAllRecommended: () => Promise<void>;
  onNavigateToSyncLogs: () => void;
  onOpenOfflineQueue: () => void;
}

const formatTimestamp = (ts?: number): string => {
  if (!ts) return 'Belum pernah';
  try {
    return new Date(ts).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '-';
  }
};

const CONFLICT_TYPE_LABEL: Record<SyncConflictItem['conflictType'], string> = {
  VALUE_MISMATCH: 'Perbedaan Data Lokal vs Server',
  LOCAL_ONLY: 'Hanya Ada di Lokal (Belum di Server)',
  SERVER_ONLY: 'Hanya Ada di Server (Belum di Lokal)',
  QUEUE_ERROR: 'Antrean Sinkronisasi Gagal Terkirim',
  BOOTSTRAP_MISSING: 'Data Inti Kosong di Server',
};

const ACTION_LABEL: Record<SyncRecommendedAction, string> = {
  PUSH_LOCAL: 'Kirim Lokal ke Server',
  PULL_SERVER: 'Tarik Server ke Lokal',
  RETRY_QUEUE: 'Kirim Ulang Antrean',
  DISMISS_QUEUE_JOB: 'Hapus Antrean Bermasalah',
};

export const SyncHealthDashboardView: React.FC<SyncHealthDashboardViewProps> = ({
  auditReport,
  isScanning,
  isResolvingBulk,
  resolvingConflictId,
  lastScanError,
  isBrowserOnline,
  isManualOfflineMode,
  offlineQueueJobs,
  moduleSummaries,
  backgroundProgress,
  canAccessSyncLogs,
  onRescanHealth,
  onResolveConflict,
  onResolveAllRecommended,
  onNavigateToSyncLogs,
  onOpenOfflineQueue,
}) => {
  const [selectedCollectionFilter, setSelectedCollectionFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [matrixFilter, setMatrixFilter] = useState<'ALL' | 'ISSUES_ONLY'>('ALL');
  const [confirmBulkFix, setConfirmBulkFix] = useState(false);

  const summaryByCol = useMemo(() => {
    const map = new Map<string, SyncModuleSummary>();
    moduleSummaries.forEach((s) => map.set(s.collectionName, s));
    return map;
  }, [moduleSummaries]);

  const filteredMatrix = useMemo(() => {
    if (!auditReport) return [];
    if (matrixFilter === 'ISSUES_ONLY') {
      return auditReport.collectionMatrix.filter(
        (r) => r.healthStatus !== 'HEALTHY' || r.queuedCount > 0 || r.conflictCount > 0
      );
    }
    return auditReport.collectionMatrix;
  }, [auditReport, matrixFilter]);

  const filteredConflicts = useMemo(() => {
    if (!auditReport) return [];
    const q = searchQuery.trim().toLowerCase();
    return auditReport.conflicts.filter((c) => {
      if (selectedCollectionFilter !== 'ALL' && c.collectionName !== selectedCollectionFilter) {
        return false;
      }
      if (severityFilter !== 'ALL' && c.severity !== severityFilter) {
        return false;
      }
      if (q) {
        const hay = `${c.moduleLabel} ${c.collectionName} ${c.recordTitle} ${c.docId} ${c.reason} ${c.repairSuggestion}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditReport, selectedCollectionFilter, severityFilter, searchQuery]);

  const healthScore = auditReport?.healthScore ?? 100;
  const scoreTone =
    healthScore >= 90
      ? 'text-emerald-700'
      : healthScore >= 70
      ? 'text-amber-700'
      : 'text-rose-700';

  return (
    <div className="flex-1 bg-slate-100 overflow-y-auto p-3 md:p-6 select-none font-sans">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                auditReport && auditReport.totalConflicts > 0
                  ? 'bg-rose-50 text-rose-600 border border-rose-200'
                  : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
              }`}
            >
              {auditReport && auditReport.totalConflicts > 0 ? (
                <ShieldAlert className="w-6 h-6" />
              ) : (
                <ShieldCheck className="w-6 h-6" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-extrabold text-slate-900 tracking-tight">
                Dashboard Kesehatan Sinkronisasi &amp; Deteksi Konflik
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Membandingkan status data lokal perangkat terhadap server Firebase Firestore secara otomatis serta menyiapkan saran perbaikan setiap konflik.
              </p>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                <span>
                  Status Jaringan:{' '}
                  <strong
                    className={
                      !isBrowserOnline
                        ? 'text-rose-700'
                        : isManualOfflineMode
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }
                  >
                    {!isBrowserOnline
                      ? 'Offline'
                      : isManualOfflineMode
                      ? 'Mode Local Only'
                      : 'Online Real-Time'}
                  </strong>
                </span>
                <span>·</span>
                <span className="font-mono tabular-nums">
                  Pemindaian Terakhir: {auditReport ? formatTimestamp(auditReport.scannedAt) : 'Belum dipindai'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {canAccessSyncLogs && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  onNavigateToSyncLogs();
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <History className="w-4 h-4 text-slate-600" />
                <span>Log Aktivitas Sync</span>
              </button>
            )}

            {offlineQueueJobs.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  onOpenOfflineQueue();
                }}
                className="px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Database className="w-4 h-4 text-amber-700" />
                <span>Antrean Offline ({offlineQueueJobs.length})</span>
              </button>
            )}

            {auditReport && auditReport.conflicts.length > 0 && !confirmBulkFix && (
              <button
                type="button"
                disabled={isResolvingBulk || isScanning || !isBrowserOnline || isManualOfflineMode}
                onClick={() => {
                  sound.playTap();
                  setConfirmBulkFix(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Wrench className="w-4 h-4" />
                <span>Selesaikan Semua Sesuai Saran</span>
              </button>
            )}

            <button
              type="button"
              disabled={isScanning}
              onClick={() => {
                sound.playTap();
                void onRescanHealth();
              }}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-55 text-white text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              {isScanning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>{isScanning ? 'Memindai Server...' : 'Pindai Ulang Konflik'}</span>
            </button>
          </div>
        </div>

        {/* Inline Bulk Resolution Confirmation */}
        {confirmBulkFix && auditReport && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">
                  Terapkan saran perbaikan otomatis untuk seluruh {auditReport.conflicts.length} konflik?
                </div>
                <p className="text-amber-800 mt-0.5">
                  Tindakan ini akan menjalankan aksi rekomendasi sistem (Kirim Lokal ke Server, Tarik Server ke Lokal, atau Kirim Ulang Antrean) secara berurutan.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isResolvingBulk}
                onClick={() => setConfirmBulkFix(false)}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold whitespace-nowrap cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isResolvingBulk}
                onClick={async () => {
                  sound.playTap();
                  setConfirmBulkFix(false);
                  await onResolveAllRecommended();
                }}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                {isResolvingBulk ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Ya, Terapkan Semua</span>
              </button>
            </div>
          </div>
        )}

        {/* Active Scan / Error Banner */}
        {(lastScanError || (!isBrowserOnline || isManualOfflineMode)) && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-950">
            <WifiOff className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">
                {lastScanError
                  ? 'Pemindaian Server Terkendala'
                  : isManualOfflineMode
                  ? 'Mode Local Only Aktif — Perbandingan Server Firestore Dijeda'
                  : 'Perangkat Sedang Offline — Hanya Antrean Lokal yang Dapat Diperiksa'}
              </div>
              <p className="text-amber-800 leading-relaxed">
                {lastScanError ||
                  'Aktifkan koneksi internet dan nonaktifkan Mode Local Only untuk membandingkan isi koleksi perangkat ini dengan server Firestore secara real-time.'}
              </p>
            </div>
          </div>
        )}

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-[11px] font-semibold text-slate-500">Skor Kesehatan Sync</div>
            <div className={`text-2xl font-black font-mono tabular-nums mt-1 ${scoreTone}`}>
              {auditReport ? `${auditReport.healthScore}%` : isScanning ? '...' : '-'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {!auditReport
                ? 'Menunggu pemindaian'
                : auditReport.totalConflicts === 0 && auditReport.serverReachable
                ? 'Sinkronisasi Optimal'
                : auditReport.highSeverityCount > 0
                ? 'Butuh Penanganan Prioritas'
                : 'Perlu Penyelarasan Ringan'}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-[11px] font-semibold text-slate-500">Koleksi Sehat</div>
            <div className="text-2xl font-black font-mono tabular-nums text-slate-900 mt-1">
              {auditReport
                ? `${auditReport.healthyCollectionsCount}/${auditReport.totalCollectionsScanned}`
                : '-'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {auditReport
                ? `${auditReport.conflictCollectionsCount} koleksi memiliki selisih`
                : '18 modul Firestore dipantau'}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-[11px] font-semibold text-slate-500">Konflik Terdeteksi</div>
            <div
              className={`text-2xl font-black font-mono tabular-nums mt-1 ${
                (auditReport?.totalConflicts || 0) > 0 ? 'text-rose-600' : 'text-emerald-700'
              }`}
            >
              {auditReport ? auditReport.totalConflicts : '-'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
              {auditReport
                ? `${auditReport.highSeverityCount} Tinggi · ${auditReport.mediumSeverityCount} Sedang · ${auditReport.lowSeverityCount} Rendah`
                : 'Lokal vs Server & Antrean'}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-[11px] font-semibold text-slate-500">Antrean Lokal Tertunda</div>
            <div
              className={`text-2xl font-black font-mono tabular-nums mt-1 ${
                offlineQueueJobs.length > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {offlineQueueJobs.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {backgroundProgress.isActive
                ? `Proses aktif: ${backgroundProgress.overallProcessedDocs}/${backgroundProgress.overallTotalDocs}`
                : offlineQueueJobs.length > 0
                ? 'Menunggu dikirim ke server'
                : 'Antrean FIFO bersih'}
            </div>
          </div>
        </div>

        {/* Collection Comparison Matrix */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/80">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                Status Konsistensi per Koleksi (Lokal vs Server Firestore)
              </h3>
              <p className="text-[11px] text-slate-500">
                Klik baris modul untuk menyaring daftar konflik di bagian bawah.
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setMatrixFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer whitespace-nowrap ${
                  matrixFilter === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Semua Modul ({auditReport?.collectionMatrix.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setMatrixFilter('ISSUES_ONLY')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer whitespace-nowrap ${
                  matrixFilter === 'ISSUES_ONLY'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Bermasalah Saja
              </button>
            </div>
          </div>

          {isScanning && !auditReport ? (
            <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 text-sky-600 animate-spin" />
              <span>Sedang membandingkan data lokal dan server Firestore across 18 koleksi...</span>
            </div>
          ) : filteredMatrix.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              {matrixFilter === 'ISSUES_ONLY'
                ? 'Tidak ada koleksi yang mengalami konflik atau antrean tertunda.'
                : 'Belum ada hasil pemindaian. Klik "Pindai Ulang Konflik" di atas.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-2.5 px-4">Modul / Koleksi</th>
                    <th className="py-2.5 px-3 text-right">Lokal</th>
                    <th className="py-2.5 px-3 text-right">Server</th>
                    <th className="py-2.5 px-3 text-right">Antrean</th>
                    <th className="py-2.5 px-3 text-right">Konflik</th>
                    <th className="py-2.5 px-3">Terakhir Terkirim ke Server</th>
                    <th className="py-2.5 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMatrix.map((row) => {
                    const summary = summaryByCol.get(row.collectionName);
                    const isSelected = selectedCollectionFilter === row.collectionName;
                    return (
                      <tr
                        key={row.collectionName}
                        onClick={() =>
                          setSelectedCollectionFilter((prev) =>
                            prev === row.collectionName ? 'ALL' : row.collectionName
                          )
                        }
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2.5 px-4">
                          <div className="font-bold text-slate-900">{row.moduleLabel}</div>
                          <div className="text-[10.5px] font-mono text-slate-400">
                            {row.collectionName}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-800">
                          {row.localCount}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-800">
                          {row.serverCount === null ? '-' : row.serverCount}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          <span
                            className={
                              row.queuedCount > 0 ? 'font-bold text-amber-700' : 'text-slate-400'
                            }
                          >
                            {row.queuedCount}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          <span
                            className={
                              row.conflictCount > 0 ? 'font-bold text-rose-600' : 'text-slate-400'
                            }
                          >
                            {row.conflictCount}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-slate-600">
                          {formatTimestamp(summary?.lastSuccessUploadAt)}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <span
                            className={`text-[11px] font-bold ${
                              row.healthStatus === 'HEALTHY'
                                ? 'text-emerald-700'
                                : row.healthStatus === 'CONFLICT'
                                ? 'text-rose-700'
                                : row.healthStatus === 'PENDING_SYNC'
                                ? 'text-amber-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {row.healthStatus === 'HEALTHY'
                              ? 'Sinkron'
                              : row.healthStatus === 'CONFLICT'
                              ? 'Konflik'
                              : row.healthStatus === 'PENDING_SYNC'
                              ? 'Dalam Antrean'
                              : 'Tidak Terjangkau'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detected Conflicts & Repair Guidance */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                Daftar Konflik Data &amp; Saran Perbaikan ({filteredConflicts.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Setiap konflik dilengkapi perbandingan kolom dan tombol resolusi langsung ke lokal &amp; Firestore.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari produk, invoice, ID..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 w-48 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
              </div>

              <select
                value={selectedCollectionFilter}
                onChange={(e) => setSelectedCollectionFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                <option value="ALL">Semua Modul</option>
                {(auditReport?.collectionMatrix || []).map((row) => (
                  <option key={row.collectionName} value={row.collectionName}>
                    {row.moduleLabel} ({row.conflictCount})
                  </option>
                ))}
              </select>

              <select
                value={severityFilter}
                onChange={(e) =>
                  setSeverityFilter(e.target.value as 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW')
                }
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                <option value="ALL">Semua Prioritas</option>
                <option value="HIGH">Prioritas Tinggi</option>
                <option value="MEDIUM">Prioritas Sedang</option>
                <option value="LOW">Prioritas Rendah</option>
              </select>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {filteredConflicts.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                <div className="text-sm font-bold text-slate-900">
                  {auditReport && auditReport.conflicts.length > 0
                    ? 'Tidak ada konflik pada filter saat ini'
                    : 'Tidak Ada Konflik Data Terdeteksi'}
                </div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {auditReport && auditReport.conflicts.length > 0
                    ? 'Ubah filter pencarian atau pilih "Semua Modul" untuk melihat seluruh konflik.'
                    : 'Data lokal perangkat ini dan database server Firestore berada dalam kondisi konsisten.'}
                </p>
                {auditReport && auditReport.conflicts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCollectionFilter('ALL');
                      setSeverityFilter('ALL');
                      setSearchQuery('');
                    }}
                    className="mt-2 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            ) : (
              filteredConflicts.map((conflict) => {
                const isBusy = resolvingConflictId === conflict.id || isResolvingBulk;
                const sevStyle =
                  conflict.severity === 'HIGH'
                    ? 'text-rose-700 bg-rose-50 border-rose-200'
                    : conflict.severity === 'MEDIUM'
                    ? 'text-amber-800 bg-amber-50 border-amber-200'
                    : 'text-slate-700 bg-slate-100 border-slate-200';

                return (
                  <div
                    key={conflict.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
                  >
                    {/* Conflict Header */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap text-[11px]">
                          <span className={`px-2 py-0.5 rounded font-bold border ${sevStyle}`}>
                            {conflict.severity === 'HIGH'
                              ? 'Prioritas Tinggi'
                              : conflict.severity === 'MEDIUM'
                              ? 'Prioritas Sedang'
                              : 'Prioritas Rendah'}
                          </span>
                          <span className="font-bold text-slate-800">
                            {CONFLICT_TYPE_LABEL[conflict.conflictType]}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-600 font-semibold">
                            {conflict.moduleLabel}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono text-slate-500">{conflict.docId}</span>
                        </div>
                        <h4 className="text-sm font-extrabold text-slate-900">
                          {conflict.recordTitle}
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {conflict.reason}
                        </p>
                      </div>
                    </div>

                    {/* Field-level comparison table */}
                    {conflict.fieldDiffs.length > 0 && (
                      <div className="rounded-lg border border-slate-200 overflow-x-auto">
                        <table className="w-full text-left text-[11px] border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                              <th className="py-1.5 px-3">Kolom / Field</th>
                              <th className="py-1.5 px-3">Nilai Lokal (Perangkat Ini)</th>
                              <th className="py-1.5 px-3">Nilai Server (Firestore)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {conflict.fieldDiffs.slice(0, 6).map((diff) => (
                              <tr key={diff.field}>
                                <td className="py-1.5 px-3 font-semibold text-slate-800">
                                  {diff.label}
                                </td>
                                <td className="py-1.5 px-3 font-mono tabular-nums text-sky-800 bg-sky-50/40">
                                  {diff.localValue}
                                </td>
                                <td className="py-1.5 px-3 font-mono tabular-nums text-amber-900 bg-amber-50/40">
                                  {diff.serverValue}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {conflict.fieldDiffs.length > 6 && (
                          <div className="px-3 py-1 bg-slate-50 border-t border-slate-200 text-[10.5px] text-slate-500">
                            +{conflict.fieldDiffs.length - 6} kolom perbedaan lainnya
                          </div>
                        )}
                      </div>
                    )}

                    {/* Repair Suggestion */}
                    <div className="rounded-lg bg-sky-50/70 border border-sky-200 p-3 text-xs text-sky-950">
                      <span className="font-bold">Saran Perbaikan: </span>
                      <span>{conflict.repairSuggestion}</span>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center justify-end gap-2 flex-wrap pt-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          sound.playTap();
                          void onResolveConflict(conflict, conflict.recommendedAction);
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Terapkan Saran ({ACTION_LABEL[conflict.recommendedAction]})</span>
                      </button>

                      {/* Alternative resolution actions */}
                      {conflict.conflictType === 'VALUE_MISMATCH' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            sound.playTap();
                            const altAction: SyncRecommendedAction =
                              conflict.recommendedAction === 'PUSH_LOCAL'
                                ? 'PULL_SERVER'
                                : 'PUSH_LOCAL';
                            void onResolveConflict(conflict, altAction);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                        >
                          {conflict.recommendedAction === 'PUSH_LOCAL' ? (
                            <>
                              <ArrowDownToLine className="w-3.5 h-3.5 text-slate-600" />
                              <span>Pakai Data Server</span>
                            </>
                          ) : (
                            <>
                              <ArrowUpFromLine className="w-3.5 h-3.5 text-slate-600" />
                              <span>Kirim Data Lokal</span>
                            </>
                          )}
                        </button>
                      )}

                      {conflict.conflictType === 'LOCAL_ONLY' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            sound.playTap();
                            void onResolveConflict(conflict, 'PULL_SERVER');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 border border-slate-300 hover:border-rose-300 text-rose-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus Data Lokal</span>
                        </button>
                      )}

                      {conflict.conflictType === 'QUEUE_ERROR' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            sound.playTap();
                            const altAction: SyncRecommendedAction =
                              conflict.recommendedAction === 'RETRY_QUEUE'
                                ? 'DISMISS_QUEUE_JOB'
                                : 'RETRY_QUEUE';
                            void onResolveConflict(conflict, altAction);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                        >
                          {conflict.recommendedAction === 'RETRY_QUEUE' ? (
                            <>
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              <span>Buang Antrean</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                              <span>Paksa Kirim Ulang</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
