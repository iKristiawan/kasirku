import React, { useMemo, useState } from 'react';
import {
  History,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Download,
  Trash2,
  ShieldCheck,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  Wrench,
  Activity,
  X,
} from 'lucide-react';
import {
  SyncActivityLogEntry,
  SyncActivityStatus,
  SyncDirection,
  SyncModuleSummary,
  SYNC_MODULE_DEFINITIONS,
} from '../utils/syncTelemetry';
import { sound } from '../utils/audio';

interface SyncActivityLogViewProps {
  logs: SyncActivityLogEntry[];
  moduleSummaries: SyncModuleSummary[];
  isBrowserOnline: boolean;
  isManualOfflineMode: boolean;
  offlineQueueCount: number;
  onClearLogs: (resetModuleStats: boolean) => void;
  onNavigateToSyncHealth: () => void;
  onForceSyncNow: () => Promise<void>;
}

const formatDateTimeFull = (ts?: number): string => {
  if (!ts) return 'Belum pernah terkirim';
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

const formatRelativeAgo = (ts?: number): string => {
  if (!ts) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec} dtk lalu`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} jam lalu`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} hari lalu`;
};

const DIRECTION_LABEL: Record<SyncDirection, string> = {
  UPLOAD: 'Kirim ke Server',
  DOWNLOAD: 'Terima dari Server',
  CONFLICT_FIX: 'Perbaikan Konflik',
  AUDIT: 'Audit Konsistensi',
};

const STATUS_LABEL: Record<SyncActivityStatus, string> = {
  SUCCESS: 'BERHASIL',
  ERROR: 'GAGAL',
  WARNING: 'ANTREAN / JEDA',
};

export const SyncActivityLogView: React.FC<SyncActivityLogViewProps> = ({
  logs,
  moduleSummaries,
  isBrowserOnline,
  isManualOfflineMode,
  offlineQueueCount,
  onClearLogs,
  onNavigateToSyncHealth,
  onForceSyncNow,
}) => {
  const [moduleFilter, setModuleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SyncActivityStatus>('ALL');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | SyncDirection>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<string>('ALL');
  const [visibleLimit, setVisibleLimit] = useState<number>(60);
  const [confirmClear, setConfirmClear] = useState(false);
  const [isForcingSync, setIsForcingSync] = useState(false);

  const overallStats = useMemo(() => {
    const totalSuccess = logs.filter((l) => l.status === 'SUCCESS').length;
    const totalErrors = logs.filter((l) => l.status === 'ERROR').length;
    const totalWarnings = logs.filter((l) => l.status === 'WARNING').length;
    const latestUpload = moduleSummaries.reduce<number>(
      (max, s) => (s.lastSuccessUploadAt && s.lastSuccessUploadAt > max ? s.lastSuccessUploadAt : max),
      0
    );
    const activeModulesCount = moduleSummaries.filter((s) => Boolean(s.lastSuccessUploadAt)).length;
    return {
      totalSuccess,
      totalErrors,
      totalWarnings,
      latestUpload,
      activeModulesCount,
    };
  }, [logs, moduleSummaries]);

  const filteredSummaries = useMemo(() => {
    if (domainFilter === 'ALL') return moduleSummaries;
    return moduleSummaries.filter((s) => s.domain === domainFilter);
  }, [moduleSummaries, domainFilter]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((log) => {
      if (moduleFilter !== 'ALL' && log.collectionName !== moduleFilter) return false;
      if (statusFilter !== 'ALL' && log.status !== statusFilter) return false;
      if (directionFilter !== 'ALL' && log.direction !== directionFilter) return false;
      if (q) {
        const hay = `${log.moduleLabel} ${log.collectionName} ${log.operation} ${log.summary} ${log.errorMessage || ''} ${log.errorCode || ''} ${log.docId || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, moduleFilter, statusFilter, directionFilter, searchQuery]);

  const displayedLogs = useMemo(
    () => filteredLogs.slice(0, visibleLimit),
    [filteredLogs, visibleLimit]
  );

  const handleExportCsv = () => {
    sound.playTap();
    const escapeCsv = (val: string | number | undefined) => {
      const str = val === undefined || val === null ? '' : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };
    const header = [
      'Waktu',
      'Modul',
      'Koleksi',
      'Arah',
      'Operasi',
      'Status',
      'Jumlah_Data',
      'Latensi_ms',
      'Ringkasan',
      'Error_Kode',
      'Error_Pesan',
    ];
    const rows = filteredLogs.map((log) => [
      escapeCsv(new Date(log.timestamp).toISOString()),
      escapeCsv(log.moduleLabel),
      escapeCsv(log.collectionName),
      escapeCsv(DIRECTION_LABEL[log.direction]),
      escapeCsv(log.operation),
      escapeCsv(STATUS_LABEL[log.status]),
      escapeCsv(log.recordCount),
      escapeCsv(log.latencyMs ?? ''),
      escapeCsv(log.summary),
      escapeCsv(log.errorCode ?? ''),
      escapeCsv(log.errorMessage ?? ''),
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `log-sinkronisasi-firestore-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 bg-slate-100 overflow-y-auto p-3 md:p-6 select-none font-sans">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center shrink-0">
              <History className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-extrabold text-slate-900 tracking-tight">
                Log Aktivitas Sinkronisasi Firestore
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Pelacakan terperinci keberhasilan maupun kegagalan sinkronisasi setiap modul beserta waktu terakhir data berhasil terkirim ke server.
              </p>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                <span>
                  Status Koneksi:{' '}
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
                      : 'Terhubung'}
                  </strong>
                </span>
                <span>·</span>
                <span className="font-mono tabular-nums">
                  Antrean Tertunda: {offlineQueueCount} item
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onNavigateToSyncHealth();
              }}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-sky-600" />
              <span>Kesehatan Sync</span>
            </button>

            <button
              type="button"
              disabled={filteredLogs.length === 0}
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>Ekspor CSV</span>
            </button>

            <button
              type="button"
              disabled={isForcingSync || !isBrowserOnline || isManualOfflineMode}
              onClick={async () => {
                sound.playTap();
                setIsForcingSync(true);
                try {
                  await onForceSyncNow();
                } finally {
                  setIsForcingSync(false);
                }
              }}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isForcingSync ? 'animate-spin' : ''}`} />
              <span>{isForcingSync ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
            </button>
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-[11px] font-semibold text-slate-500">
              Terakhir Kirim ke Server
            </div>
            <div className="text-sm md:text-base font-black font-mono tabular-nums text-slate-900 mt-1">
              {overallStats.latestUpload
                ? formatDateTimeFull(overallStats.latestUpload)
                : 'Belum ada upload'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
              {overallStats.latestUpload
                ? `${formatRelativeAgo(overallStats.latestUpload)} · ${overallStats.activeModulesCount}/${SYNC_MODULE_DEFINITIONS.length} modul tercatat`
                : 'Menunggu transaksi / perubahan pertama'}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-[11px] font-semibold text-slate-500">Sinkronisasi Berhasil</div>
            <div className="text-2xl font-black font-mono tabular-nums text-emerald-700 mt-1">
              {overallStats.totalSuccess}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Aktivitas tercatat pada riwayat
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-[11px] font-semibold text-slate-500">Kegagalan Terdeteksi</div>
            <div
              className={`text-2xl font-black font-mono tabular-nums mt-1 ${
                overallStats.totalErrors > 0 ? 'text-rose-600' : 'text-slate-900'
              }`}
            >
              {overallStats.totalErrors}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Error jaringan atau aturan server
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-[11px] font-semibold text-slate-500">Masuk Antrean / Dijeda</div>
            <div
              className={`text-2xl font-black font-mono tabular-nums mt-1 ${
                overallStats.totalWarnings > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {overallStats.totalWarnings}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Disimpan lokal saat koneksi terputus
            </div>
          </div>
        </div>

        {/* Per-Module Last Upload Matrix */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                Status Pengiriman Terakhir per Modul
              </h3>
              <p className="text-[11px] text-slate-500">
                Pantau kapan setiap modul terakhir berhasil mengirim data ke server Firestore. Klik modul untuk memfilter log di bawah.
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {['ALL', 'Operasional POS', 'Inventaris', 'Keuangan & Pajak', 'Sistem'].map((dom) => (
                <button
                  key={dom}
                  type="button"
                  onClick={() => setDomainFilter(dom)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border whitespace-nowrap cursor-pointer ${
                    domainFilter === dom
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {dom === 'ALL' ? 'Semua Domain' : dom}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-4">Modul Data</th>
                  <th className="py-2.5 px-3">Domain</th>
                  <th className="py-2.5 px-3">Terakhir Berhasil Terkirim ke Server</th>
                  <th className="py-2.5 px-3 text-right">Sukses / Gagal</th>
                  <th className="py-2.5 px-3 text-right">Latensi</th>
                  <th className="py-2.5 px-4 text-right">Status Terakhir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSummaries.map((mod) => {
                  const isSelected = moduleFilter === mod.collectionName;
                  return (
                    <tr
                      key={mod.collectionName}
                      onClick={() =>
                        setModuleFilter((prev) =>
                          prev === mod.collectionName ? 'ALL' : mod.collectionName
                        )
                      }
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-slate-900">{mod.moduleLabel}</div>
                        <div className="text-[10.5px] font-mono text-slate-400">
                          {mod.collectionName}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-medium whitespace-nowrap">
                        {mod.domain}
                      </td>
                      <td className="py-2.5 px-3">
                        {mod.lastSuccessUploadAt ? (
                          <div>
                            <span className="font-mono tabular-nums font-bold text-slate-900">
                              {formatDateTimeFull(mod.lastSuccessUploadAt)}
                            </span>
                            <span className="text-[10.5px] text-slate-500 ml-2">
                              ({formatRelativeAgo(mod.lastSuccessUploadAt)})
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">Belum ada pengiriman tercatat</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="font-bold text-emerald-700">{mod.totalSuccess}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span
                          className={
                            mod.totalErrors > 0 ? 'font-bold text-rose-600' : 'text-slate-400'
                          }
                        >
                          {mod.totalErrors}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {mod.lastLatencyMs ? `${mod.lastLatencyMs} ms` : '-'}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        {mod.lastStatus === 'SUCCESS' ? (
                          <span className="text-[11px] font-bold text-emerald-700">Berhasil</span>
                        ) : mod.lastStatus === 'ERROR' ? (
                          <span
                            className="text-[11px] font-bold text-rose-700"
                            title={mod.lastErrorMessage}
                          >
                            Gagal
                          </span>
                        ) : mod.lastStatus === 'WARNING' ? (
                          <span className="text-[11px] font-bold text-amber-700">Tertunda</span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Belum Aktif</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Chronological Sync Log Timeline */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-extrabold text-slate-900">
                Riwayat Sinkronisasi Kronologis ({filteredLogs.length})
              </h3>
              {moduleFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setModuleFilter('ALL')}
                  className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Modul: {moduleFilter}</span>
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari ringkasan, ID, error..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 w-48 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
              </div>

              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                <option value="ALL">Semua Modul</option>
                {SYNC_MODULE_DEFINITIONS.map((def) => (
                  <option key={def.collectionName} value={def.collectionName}>
                    {def.label}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | SyncActivityStatus)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                <option value="ALL">Semua Status</option>
                <option value="SUCCESS">Berhasil</option>
                <option value="ERROR">Gagal</option>
                <option value="WARNING">Antrean / Jeda</option>
              </select>

              <select
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value as 'ALL' | SyncDirection)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                <option value="ALL">Semua Arah</option>
                <option value="UPLOAD">Kirim ke Server</option>
                <option value="DOWNLOAD">Terima dari Server</option>
                <option value="CONFLICT_FIX">Perbaikan Konflik</option>
                <option value="AUDIT">Audit Konsistensi</option>
              </select>

              {logs.length > 0 && !confirmClear && (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Bersihkan Log</span>
                </button>
              )}
            </div>
          </div>

          {confirmClear && (
            <div className="px-4 py-3 bg-rose-50 border-b border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="font-bold text-rose-900">
                Bersihkan daftar riwayat log sinkronisasi?
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    onClearLogs(false);
                    setConfirmClear(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
                >
                  Hapus Riwayat Saja
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    onClearLogs(true);
                    setConfirmClear(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold cursor-pointer"
                >
                  Reset Log &amp; Statistik
                </button>
              </div>
            </div>
          )}

          {displayedLogs.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Clock className="w-9 h-9 text-slate-300 mx-auto" />
              <div className="text-sm font-bold text-slate-800">
                {logs.length > 0
                  ? 'Tidak ada log yang cocok dengan filter'
                  : 'Belum Ada Aktivitas Sinkronisasi Tercatat'}
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {logs.length > 0
                  ? 'Coba ubah filter modul, status, atau kata kunci pencarian.'
                  : 'Setiap kali transaksi disimpan, produk diperbarui, atau antrean offline terkirim ke Firestore, riwayatnya akan muncul di sini.'}
              </p>
              {logs.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setModuleFilter('ALL');
                    setStatusFilter('ALL');
                    setDirectionFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="mt-2 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-2.5 px-4">Waktu</th>
                    <th className="py-2.5 px-3">Modul</th>
                    <th className="py-2.5 px-3">Arah &amp; Operasi</th>
                    <th className="py-2.5 px-3">Ringkasan Aktivitas</th>
                    <th className="py-2.5 px-3 text-right">Data / Latensi</th>
                    <th className="py-2.5 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 align-top">
                      <td className="py-2.5 px-4 font-mono tabular-nums text-[11px] text-slate-600 whitespace-nowrap">
                        {formatDateTimeFull(log.timestamp)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{log.moduleLabel}</div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {log.collectionName}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 font-semibold text-slate-700">
                          {log.direction === 'UPLOAD' ? (
                            <ArrowUpRight className="w-3.5 h-3.5 text-sky-600" />
                          ) : log.direction === 'DOWNLOAD' ? (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                          ) : log.direction === 'CONFLICT_FIX' ? (
                            <Wrench className="w-3.5 h-3.5 text-amber-600" />
                          ) : (
                            <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span>{DIRECTION_LABEL[log.direction]}</span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          {log.operation}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 max-w-md">
                        <p className="text-slate-800 leading-snug break-words">{log.summary}</p>
                        {(log.errorMessage || log.errorCode) && (
                          <p className="text-[11px] text-rose-700 mt-1 break-words">
                            {log.errorCode ? `[${log.errorCode}] ` : ''}
                            {log.errorMessage}
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap text-slate-600">
                        <div>{log.recordCount} doc</div>
                        <div className="text-[10px] text-slate-400">
                          {log.latencyMs ? `${log.latencyMs} ms` : '-'}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black border ${
                            log.status === 'SUCCESS'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : log.status === 'ERROR'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {log.status === 'SUCCESS' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : log.status === 'ERROR' ? (
                            <AlertTriangle className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          <span>{STATUS_LABEL[log.status]}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredLogs.length > visibleLimit && (
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 60)}
                className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
              >
                Tampilkan Lebih Banyak ({filteredLogs.length - visibleLimit} tersisa)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
