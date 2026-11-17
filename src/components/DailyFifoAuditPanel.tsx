import React, { useState, useMemo, useEffect } from 'react';
import {
  Calculator,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  ChevronDown,
  ChevronUp,
  Search,
  Calendar,
  Layers,
  ArrowRight,
  FileSpreadsheet,
  X,
  Sparkles,
  Info,
  Clock,
  ExternalLink
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Transaction, Product } from '../types/pos';
import { formatRupiah, formatNumber, formatDateTime } from '../utils/formatters';
import { sound } from '../utils/audio';
import {
  calculateFIFOGrossProfit,
  reconcileTransactionsFifo,
  FifoValidationSummary,
  TransactionFifoValidationResult,
  ItemFifoValidationResult
} from '../utils/fifoUtils';

export interface DailyAuditRow {
  dateKey: string; // 'YYYY-MM-DD'
  formattedDate: string; // e.g. "Minggu, 08 Nov 2026"
  transactionCount: number;
  totalRevenue: number;
  totalStoredCogs: number;
  totalStoredGrossProfit: number;
  totalExactFifoCogs: number;
  totalExactFifoGrossProfit: number;
  profitDifference: number; // exactFifoGrossProfit - totalStoredGrossProfit
  hasDiscrepancy: boolean;
  discrepantTxsCount: number;
  transactions: TransactionFifoValidationResult[];
  maxDiscrepancyTx: TransactionFifoValidationResult | null;
  maxDiscrepancyAmount: number;
  topAffectedProduct: string;
}

interface DailyFifoAuditPanelProps {
  isOpen: boolean;
  onClose?: () => void;
  transactions: Transaction[];
  products: Product[];
  onReconcileTransactions?: (reconciledTransactions: Transaction[]) => Promise<void> | void;
}

export const DailyFifoAuditPanel: React.FC<DailyFifoAuditPanelProps> = ({
  isOpen,
  onClose,
  transactions,
  products,
  onReconcileTransactions
}) => {
  const [auditSummary, setAuditSummary] = useState<FifoValidationSummary | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [lastAuditTimestamp, setLastAuditTimestamp] = useState<number | null>(null);
  const [expandedDateKey, setExpandedDateKey] = useState<string | null>(null);
  const [selectedTxDetail, setSelectedTxDetail] = useState<TransactionFifoValidationResult | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [searchDayQuery, setSearchDayQuery] = useState('');
  const [filterDiscrepancyOnly, setFilterDiscrepancyOnly] = useState(false);

  // Execute window.calculateFIFOGrossProfit
  const executeAudit = () => {
    setIsAuditing(true);
    setNotice(null);
    sound.playTap();

    try {
      const auditFn = (typeof window !== 'undefined' && (window as any).calculateFIFOGrossProfit)
        ? (window as any).calculateFIFOGrossProfit
        : calculateFIFOGrossProfit;

      const summary: FifoValidationSummary = auditFn(transactions, products);
      setAuditSummary(summary);
      setLastAuditTimestamp(Date.now());
      sound.playSuccess();
    } catch (err) {
      sound.playError();
      setNotice({
        type: 'error',
        message: 'Gagal menjalankan audit FIFO: ' + String(err)
      });
    } finally {
      setIsAuditing(false);
    }
  };

  // Run audit when panel opens if not yet run
  useEffect(() => {
    if (isOpen && !auditSummary) {
      executeAudit();
    }
  }, [isOpen]);

  // Aggregate results by date ('YYYY-MM-DD')
  const dailyAuditRows: DailyAuditRow[] = useMemo(() => {
    if (!auditSummary || !auditSummary.results) return [];

    const dayMap = new Map<string, TransactionFifoValidationResult[]>();

    auditSummary.results.forEach((r) => {
      const dKey = r.dateStr || 'Unknown Date';
      if (!dayMap.has(dKey)) {
        dayMap.set(dKey, []);
      }
      dayMap.get(dKey)!.push(r);
    });

    const rows: DailyAuditRow[] = [];

    dayMap.forEach((txs, dateKey) => {
      let totalRevenue = 0;
      let totalStoredCogs = 0;
      let totalStoredGrossProfit = 0;
      let totalExactFifoCogs = 0;
      let totalExactFifoGrossProfit = 0;
      let discrepantTxsCount = 0;

      let maxDiscrepancyTx: TransactionFifoValidationResult | null = null;
      let maxDiscrepancyAmount = 0;
      let topAffectedProduct = '-';

      txs.forEach((tx) => {
        totalRevenue += tx.finalAmount;
        totalStoredCogs += tx.totalStoredCogs;
        totalStoredGrossProfit += tx.totalStoredGrossProfit;
        totalExactFifoCogs += tx.totalExactFifoCogs;
        totalExactFifoGrossProfit += tx.totalExactFifoGrossProfit;

        if (tx.hasDiscrepancy) {
          discrepantTxsCount++;
        }

        const absDiff = Math.abs(tx.profitDifference);
        if (absDiff > maxDiscrepancyAmount) {
          maxDiscrepancyAmount = absDiff;
          maxDiscrepancyTx = tx;

          // Find the product item with the largest profitDifference in this tx
          const sortedItems = [...tx.items].sort(
            (a, b) => Math.abs(b.profitDifference) - Math.abs(a.profitDifference)
          );
          if (sortedItems.length > 0) {
            topAffectedProduct = sortedItems[0].productName;
          }
        }
      });

      const profitDifference = totalExactFifoGrossProfit - totalStoredGrossProfit;
      const hasDiscrepancy = Math.abs(profitDifference) > 0.01 || discrepantTxsCount > 0;

      // Format date for readable Indonesian presentation
      let formattedDate = dateKey;
      try {
        const d = new Date(dateKey + 'T00:00:00');
        if (!isNaN(d.getTime())) {
          formattedDate = d.toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          });
        }
      } catch {
        // Fallback to raw string
      }

      rows.push({
        dateKey,
        formattedDate,
        transactionCount: txs.length,
        totalRevenue,
        totalStoredCogs,
        totalStoredGrossProfit,
        totalExactFifoCogs,
        totalExactFifoGrossProfit,
        profitDifference,
        hasDiscrepancy,
        discrepantTxsCount,
        transactions: txs,
        maxDiscrepancyTx,
        maxDiscrepancyAmount,
        topAffectedProduct
      });
    });

    // Sort descending by dateKey (newest dates first)
    rows.sort((a, b) => b.dateKey.localeCompare(a.dateKey));

    return rows;
  }, [auditSummary]);

  // Filtered daily audit rows
  const filteredDailyRows = useMemo(() => {
    return dailyAuditRows.filter((row) => {
      if (filterDiscrepancyOnly && !row.hasDiscrepancy) return false;
      if (searchDayQuery.trim()) {
        const q = searchDayQuery.toLowerCase();
        const matchDate = row.dateKey.toLowerCase().includes(q) || row.formattedDate.toLowerCase().includes(q);
        const matchProduct = row.topAffectedProduct.toLowerCase().includes(q);
        const matchInvoice = row.maxDiscrepancyTx?.invoiceNumber.toLowerCase().includes(q);
        return matchDate || matchProduct || matchInvoice;
      }
      return true;
    });
  }, [dailyAuditRows, filterDiscrepancyOnly, searchDayQuery]);

  // Execute Mass Reconciliation via window.reconcileTransactionsFifo
  const handleExecuteMassReconcile = async () => {
    sound.playTap();
    setIsReconciling(true);
    setNotice(null);

    try {
      const reconcileFn = (typeof window !== 'undefined' && (window as any).reconcileTransactionsFifo)
        ? (window as any).reconcileTransactionsFifo
        : reconcileTransactionsFifo;

      const { reconciledTransactions, reconciledCount, totalProfitAdjustment } = reconcileFn(transactions, products);

      if (reconciledCount === 0) {
        sound.playSuccess();
        setNotice({
          type: 'info',
          message: 'Semua transaksi historis sudah 100% selaras dengan alokasi kartu stok FIFO murni. Tidak ada selisih yang perlu diperbaiki.'
        });
        setIsReconciling(false);
        return;
      }

      if (onReconcileTransactions) {
        await onReconcileTransactions(reconciledTransactions);
      }

      // Re-run window.calculateFIFOGrossProfit with the reconciled transactions
      const auditFn = (typeof window !== 'undefined' && (window as any).calculateFIFOGrossProfit)
        ? (window as any).calculateFIFOGrossProfit
        : calculateFIFOGrossProfit;

      const newSummary = auditFn(reconciledTransactions, products);
      setAuditSummary(newSummary);
      setLastAuditTimestamp(Date.now());

      sound.playSuccess();
      setNotice({
        type: 'success',
        message: `Berhasil memperbaiki ${reconciledCount} transaksi secara massal! Database Firestore & local state telah diselaraskan dengan HPP FIFO. Penyesuaian total laba: ${formatRupiah(totalProfitAdjustment)}.`
      });
    } catch (err) {
      sound.playError();
      setNotice({
        type: 'error',
        message: 'Gagal melakukan perbaikan massal: ' + String(err)
      });
    } finally {
      setIsReconciling(false);
    }
  };

  // Export Daily Audit Table to Excel (.xlsx)
  const handleExportExcel = () => {
    sound.playTap();
    if (dailyAuditRows.length === 0) return;

    const summaryData = dailyAuditRows.map((r, idx) => ({
      'No': idx + 1,
      'Tanggal': r.dateKey,
      'Hari & Tanggal': r.formattedDate,
      'Jumlah Transaksi': r.transactionCount,
      'Total Omzet (Rp)': r.totalRevenue,
      'Total HPP Tercatat (Rp)': r.totalStoredCogs,
      'Laba Tercatat (Rp)': r.totalStoredGrossProfit,
      'Total HPP FIFO (Rp)': r.totalExactFifoCogs,
      'Laba Hasil FIFO (Rp)': r.totalExactFifoGrossProfit,
      'Selisih Laba (Rp)': r.profitDifference,
      'Status Audit': r.hasDiscrepancy ? `Ada Selisih (${r.discrepantTxsCount} Tx)` : 'Sesuai (100% OK)',
      'Invoice Selisih Terbesar': r.maxDiscrepancyTx?.invoiceNumber || '-',
      'Nominal Selisih Terbesar (Rp)': r.maxDiscrepancyAmount || 0,
      'Produk Terdampak': r.topAffectedProduct || '-'
    }));

    const detailTxData: Array<Record<string, unknown>> = [];
    dailyAuditRows.forEach((r) => {
      r.transactions.forEach((tx) => {
        detailTxData.push({
          'Tanggal': r.dateKey,
          'No Invoice': tx.invoiceNumber,
          'Waktu': formatDateTime(tx.timestamp),
          'Pelanggan': tx.customerName || 'Umum',
          'Metode Bayar': tx.paymentMethod,
          'Subtotal (Rp)': tx.subtotal,
          'Total Omzet (Rp)': tx.finalAmount,
          'HPP Tercatat (Rp)': tx.totalStoredCogs,
          'Laba Tercatat (Rp)': tx.totalStoredGrossProfit,
          'HPP FIFO Murni (Rp)': tx.totalExactFifoCogs,
          'Laba Hasil FIFO (Rp)': tx.totalExactFifoGrossProfit,
          'Selisih Laba (Rp)': tx.profitDifference,
          'Status': tx.hasDiscrepancy ? 'SELISIH' : 'SESUAI'
        });
      });
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    const ws2 = XLSX.utils.json_to_sheet(detailTxData);

    XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan Audit Harian');
    XLSX.utils.book_append_sheet(wb, ws2, 'Detail Transaksi Historis');

    XLSX.writeFile(wb, `Audit_Laba_FIFO_Harian_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!isOpen) return null;

  return (
    <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-xl overflow-hidden mb-6 transition-all animate-fadeIn">
      {/* Header Bar */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-purple-500/20 border border-purple-400/30 rounded-2xl shrink-0">
              <Calculator className="w-6 h-6 text-purple-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base md:text-lg font-black tracking-tight">
                  Tabel Ringkasan Audit Laba FIFO per Hari
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-400/20 text-purple-200 border border-purple-400/30">
                  window.calculateFIFOGrossProfit
                </span>
              </div>
              <p className="text-xs text-purple-200/80 mt-1">
                Kalkulasi ulang seluruh transaksi historis menelusuri alokasi batch fisik, membandingkan HPP rata-rata tersimpan dengan HPP FIFO murni per hari.
              </p>
              {lastAuditTimestamp && (
                <div className="flex items-center gap-2 mt-2 text-[11px] text-purple-300/80">
                  <Clock className="w-3.5 h-3.5 text-purple-300" />
                  <span>Audit dijalankan: {formatDateTime(lastAuditTimestamp)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Tombol Perbaiki Massal */}
            <button
              onClick={handleExecuteMassReconcile}
              disabled={isReconciling || isAuditing}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md ${
                isReconciling
                  ? 'bg-slate-700 text-slate-300 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-emerald-600/30 active:scale-95'
              }`}
              title="Perbaiki seluruh data transaksi historis di database menggunakan window.reconcileTransactionsFifo"
            >
              <Wrench className={`w-4 h-4 ${isReconciling ? 'animate-spin' : 'text-emerald-200'}`} />
              <span>{isReconciling ? 'Memproses Perbaikan...' : 'Perbaiki Massal'}</span>
            </button>

            {/* Tombol Jalankan Audit Ulang */}
            <button
              onClick={executeAudit}
              disabled={isAuditing}
              className="px-3.5 py-2.5 rounded-xl bg-purple-700/80 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-purple-500/30"
              title="Jalankan ulang fungsi audit window.calculateFIFOGrossProfit"
            >
              <Sparkles className={`w-4 h-4 ${isAuditing ? 'animate-spin text-purple-300' : 'text-purple-300'}`} />
              <span>{isAuditing ? 'Mengaudit...' : 'Audit Ulang'}</span>
            </button>

            {/* Ekspor Excel */}
            <button
              onClick={handleExportExcel}
              className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
              title="Unduh Laporan Audit Harian ke Format Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Ekspor Excel</span>
            </button>

            {/* Close Button */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer ml-1"
                title="Tutup Panel Audit Harian"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* 4 Summary Stat Cards */}
        {auditSummary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3 mt-4 pt-4 border-t border-purple-800/60">
            <div className="bg-purple-950/60 border border-purple-800/40 p-3 rounded-2xl">
              <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Total Hari Tercatat</span>
              <div className="text-xl font-black text-white font-mono mt-0.5">
                {dailyAuditRows.length} <span className="text-xs font-semibold text-purple-300">Hari</span>
              </div>
              <div className="text-[10px] text-purple-300/70 mt-0.5">
                {auditSummary.totalTransactionsValidated} transaksi divalidasi
              </div>
            </div>

            <div className="bg-purple-950/60 border border-purple-800/40 p-3 rounded-2xl">
              <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Laba Tercatat Toko</span>
              <div className="text-xl font-black text-white font-mono mt-0.5">
                {formatRupiah(auditSummary.totalStoredGrossProfit)}
              </div>
              <div className="text-[10px] text-purple-300/70 mt-0.5">
                HPP Tersimpan: {formatRupiah(auditSummary.totalStoredCogs)}
              </div>
            </div>

            <div className="bg-purple-950/60 border border-purple-800/40 p-3 rounded-2xl">
              <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Laba Hasil FIFO Murni</span>
              <div className="text-xl font-black text-emerald-400 font-mono mt-0.5">
                {formatRupiah(auditSummary.totalExactFifoGrossProfit)}
              </div>
              <div className="text-[10px] text-purple-300/70 mt-0.5">
                HPP FIFO: {formatRupiah(auditSummary.totalExactFifoCogs)}
              </div>
            </div>

            <div className={`p-3 rounded-2xl border ${
              auditSummary.transactionsWithDiscrepancyCount > 0
                ? 'bg-rose-950/80 border-rose-500/60'
                : 'bg-emerald-950/80 border-emerald-500/60'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200">
                  Net Selisih Laba
                </span>
                {auditSummary.transactionsWithDiscrepancyCount > 0 ? (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-rose-500 text-white animate-pulse">
                    {auditSummary.transactionsWithDiscrepancyCount} Tx Selisih
                  </span>
                ) : (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-emerald-500 text-white">
                    100% Cocok
                  </span>
                )}
              </div>
              <div className={`text-xl font-black font-mono mt-0.5 ${
                auditSummary.netDiscrepancyAmount !== 0 ? 'text-rose-300' : 'text-emerald-300'
              }`}>
                {auditSummary.netDiscrepancyAmount > 0 ? '+' : ''}
                {formatRupiah(auditSummary.netDiscrepancyAmount)}
              </div>
              <div className="text-[10px] text-slate-300/80 mt-0.5">
                {auditSummary.transactionsWithDiscrepancyCount > 0
                  ? 'Klik tombol Perbaiki Massal di atas'
                  : 'Seluruh transaksi historis sinkron'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notice / Feedback Banner */}
      {notice && (
        <div className={`p-3.5 mx-4 md:mx-6 mt-4 rounded-2xl border flex items-center justify-between gap-3 text-xs font-semibold ${
          notice.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
            : notice.type === 'error'
            ? 'bg-rose-50 text-rose-800 border-rose-300'
            : 'bg-sky-50 text-sky-800 border-sky-300'
        }`}>
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : notice.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-sky-600 shrink-0" />
            )}
            <span>{notice.message}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 md:p-6 pb-2 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchDayQuery}
            onChange={(e) => setSearchDayQuery(e.target.value)}
            placeholder="Cari tanggal (YYYY-MM-DD), nama produk terdampak, atau no invoice..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-purple-500 focus:bg-white text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterDiscrepancyOnly}
              onChange={(e) => {
                sound.playTap();
                setFilterDiscrepancyOnly(e.target.checked);
              }}
              className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 cursor-pointer"
            />
            <span>Hanya Hari dengan Selisih Laba</span>
          </label>
        </div>
      </div>

      {/* Main Table: Daily Summary */}
      <div className="p-4 md:p-6 pt-2 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-600 font-black uppercase text-[10px] tracking-wider border-y border-slate-200">
              <th className="py-3 px-3">Tanggal Transaksi</th>
              <th className="py-3 px-2 text-center">Jml Tx</th>
              <th className="py-3 px-3 text-right">Total Omzet</th>
              <th className="py-3 px-3 text-right">Laba Tercatat</th>
              <th className="py-3 px-3 text-right">Laba Hasil FIFO</th>
              <th className="py-3 px-3 text-right">Selisih Laba</th>
              <th className="py-3 px-4">
                <div className="flex items-center gap-1.5 text-amber-900">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Transaksi Selisih Terbesar (Sorotan)</span>
                </div>
              </th>
              <th className="py-3 px-3 text-center">Status & Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredDailyRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <Calculator className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="font-bold text-sm text-slate-600">Tidak ada data audit harian yang cocok</p>
                  <p className="text-xs text-slate-400 mt-0.5">Ubah kata kunci filter atau jalankan audit ulang</p>
                </td>
              </tr>
            ) : (
              filteredDailyRows.map((row) => {
                const isExpanded = expandedDateKey === row.dateKey;
                const hasMaxDiscrepancy = row.maxDiscrepancyAmount > 0;

                return (
                  <React.Fragment key={row.dateKey}>
                    <tr
                      className={`transition-colors hover:bg-slate-50/80 ${
                        row.hasDiscrepancy ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      {/* Tanggal */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              sound.playTap();
                              setExpandedDateKey(isExpanded ? null : row.dateKey);
                            }}
                            className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 cursor-pointer"
                            title={isExpanded ? 'Sembunyikan detail transaksi' : 'Lihat semua transaksi hari ini'}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-purple-700" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <div>
                            <div className="font-bold text-slate-900">{row.formattedDate}</div>
                            <div className="text-[10px] font-mono text-slate-400">{row.dateKey}</div>
                          </div>
                        </div>
                      </td>

                      {/* Jumlah Transaksi */}
                      <td className="py-3.5 px-2 text-center">
                        <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-full text-[11px]">
                          {row.transactionCount} Tx
                        </span>
                      </td>

                      {/* Total Omzet */}
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-800">
                        {formatRupiah(row.totalRevenue)}
                      </td>

                      {/* Laba Tercatat */}
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-600">
                        {formatRupiah(row.totalStoredGrossProfit)}
                      </td>

                      {/* Laba Hasil FIFO */}
                      <td className="py-3.5 px-3 text-right font-mono font-black text-purple-700">
                        {formatRupiah(row.totalExactFifoGrossProfit)}
                      </td>

                      {/* Selisih Laba */}
                      <td className="py-3.5 px-3 text-right font-mono font-bold">
                        {row.profitDifference === 0 ? (
                          <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md text-[11px]">
                            Rp 0
                          </span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${
                            row.profitDifference > 0
                              ? 'text-emerald-700 bg-emerald-100'
                              : 'text-rose-700 bg-rose-100'
                          }`}>
                            {row.profitDifference > 0 ? '+' : ''}
                            {formatRupiah(row.profitDifference)}
                          </span>
                        )}
                      </td>

                      {/* Transaksi Selisih Terbesar (Sorotan Utama) */}
                      <td className="py-3.5 px-4">
                        {hasMaxDiscrepancy && row.maxDiscrepancyTx ? (
                          <div className="bg-amber-50/90 border border-amber-300/80 rounded-xl p-2 max-w-sm shadow-2xs hover:border-amber-400 transition-colors">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-bold text-[11px] text-amber-900 bg-amber-200/60 px-1.5 py-0.5 rounded">
                                {row.maxDiscrepancyTx.invoiceNumber}
                              </span>
                              <span className="text-[11px] font-black text-rose-700 font-mono">
                                Selisih: {formatRupiah(Math.abs(row.maxDiscrepancyTx.profitDifference))}
                              </span>
                            </div>
                            <div className="text-[11px] font-semibold text-slate-800 truncate mt-1">
                              Produk: <span className="text-purple-900 font-bold">{row.topAffectedProduct}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 pt-1 border-t border-amber-200/60">
                              <span>Tercatat: {formatRupiah(row.maxDiscrepancyTx.totalStoredGrossProfit)}</span>
                              <span>→ FIFO: <strong className="text-emerald-700 font-bold">{formatRupiah(row.maxDiscrepancyTx.totalExactFifoGrossProfit)}</strong></span>
                              <button
                                onClick={() => {
                                  sound.playTap();
                                  setSelectedTxDetail(row.maxDiscrepancyTx);
                                }}
                                className="text-indigo-700 hover:text-indigo-900 font-bold underline cursor-pointer"
                              >
                                Rincian
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Semua transaksi 100% selaras</span>
                          </div>
                        )}
                      </td>

                      {/* Status & Aksi */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          {row.hasDiscrepancy ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white shadow-2xs">
                              {row.discrepantTxsCount} Tx Selisih
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Sesuai FIFO
                            </span>
                          )}

                          <button
                            onClick={() => {
                              sound.playTap();
                              setExpandedDateKey(isExpanded ? null : row.dateKey);
                            }}
                            className="text-[11px] text-purple-700 hover:text-purple-900 font-bold underline cursor-pointer"
                          >
                            {isExpanded ? 'Tutup Tx' : `Buka (${row.transactionCount} Tx)`}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Transactions for this specific day */}
                    {isExpanded && (
                      <tr className="bg-slate-50/90 border-b border-slate-200">
                        <td colSpan={8} className="p-3 md:p-4">
                          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-inner space-y-2">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-purple-600" />
                                <span>Rincian Seluruh Transaksi Tanggal {row.formattedDate}</span>
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                Total: {row.transactions.length} Transaksi
                              </span>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="text-slate-400 uppercase text-[9px] font-bold border-b border-slate-100">
                                    <th className="py-1.5 px-2">No. Invoice</th>
                                    <th className="py-1.5 px-2">Pelanggan</th>
                                    <th className="py-1.5 px-2 text-right">Omzet</th>
                                    <th className="py-1.5 px-2 text-right">Laba Tercatat</th>
                                    <th className="py-1.5 px-2 text-right">Laba Hasil FIFO</th>
                                    <th className="py-1.5 px-2 text-right">Selisih</th>
                                    <th className="py-1.5 px-2 text-center">Batch Terpakai</th>
                                    <th className="py-1.5 px-2 text-center">Aksi</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {row.transactions.map((tx) => (
                                    <tr
                                      key={tx.transactionId}
                                      className={`hover:bg-slate-50 ${
                                        tx.hasDiscrepancy ? 'bg-rose-50/40' : ''
                                      }`}
                                    >
                                      <td className="py-2 px-2 font-mono font-bold text-slate-800">
                                        {tx.invoiceNumber}
                                      </td>
                                      <td className="py-2 px-2 text-slate-600 truncate max-w-[140px]">
                                        {tx.customerName || 'Umum'}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono font-semibold text-slate-700">
                                        {formatRupiah(tx.finalAmount)}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono text-slate-600">
                                        {formatRupiah(tx.totalStoredGrossProfit)}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono font-bold text-purple-700">
                                        {formatRupiah(tx.totalExactFifoGrossProfit)}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono font-bold">
                                        {tx.profitDifference === 0 ? (
                                          <span className="text-emerald-700 text-[10px]">Rp 0</span>
                                        ) : (
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                            tx.profitDifference > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
                                          }`}>
                                            {tx.profitDifference > 0 ? '+' : ''}{formatRupiah(tx.profitDifference)}
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2 px-2 text-center">
                                        {tx.hasBatchDeductions ? (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                            Ada Batch
                                          </span>
                                        ) : (
                                          <span className="text-[10px] text-slate-400">Fallback HPP</span>
                                        )}
                                      </td>
                                      <td className="py-2 px-2 text-center">
                                        <button
                                          onClick={() => {
                                            sound.playTap();
                                            setSelectedTxDetail(tx);
                                          }}
                                          className="text-indigo-600 hover:text-indigo-800 font-bold text-[10px] underline cursor-pointer"
                                        >
                                          Lihat Item
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Transaction Detail Modal */}
      {selectedTxDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <span>Detail Alokasi Batch FIFO Transaksi</span>
                  <span className="font-mono text-purple-300">{selectedTxDetail.invoiceNumber}</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Waktu: {formatDateTime(selectedTxDetail.timestamp)} · Pelanggan: {selectedTxDetail.customerName || 'Umum'}
                </p>
              </div>
              <button
                onClick={() => setSelectedTxDetail(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3">
              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
                <div>
                  <div className="text-[10px] text-slate-400">Laba Tercatat</div>
                  <div className="font-bold font-mono text-slate-700">{formatRupiah(selectedTxDetail.totalStoredGrossProfit)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-purple-600 font-bold">Laba Hasil FIFO</div>
                  <div className="font-bold font-mono text-purple-700">{formatRupiah(selectedTxDetail.totalExactFifoGrossProfit)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Selisih Deviasi</div>
                  <div className={`font-black font-mono ${selectedTxDetail.profitDifference === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {selectedTxDetail.profitDifference > 0 ? '+' : ''}{formatRupiah(selectedTxDetail.profitDifference)}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700">Daftar Item & Alokasi Batch Terpotong:</span>
                {selectedTxDetail.items.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{item.productName}</span>
                      <span className="font-mono font-bold text-slate-700">
                        {item.quantity} {item.unitName} · Subtotal {formatRupiah(item.subtotal)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-white p-2 rounded-lg border border-slate-200">
                      <div>
                        <span className="text-slate-400 block text-[9px]">HPP Tersimpan</span>
                        <span className="font-mono">{formatRupiah(item.storedCostPrice)}/unit</span>
                      </div>
                      <div>
                        <span className="text-purple-600 block text-[9px] font-bold">HPP FIFO Efektif</span>
                        <span className="font-mono font-bold text-purple-700">{formatRupiah(item.effectiveFifoUnitCost)}/unit</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">Laba Tercatat</span>
                        <span className="font-mono">{formatRupiah(item.storedGrossProfit)}</span>
                      </div>
                      <div>
                        <span className="text-purple-600 block text-[9px] font-bold">Laba FIFO</span>
                        <span className="font-mono font-bold text-purple-700">{formatRupiah(item.exactFifoGrossProfit)}</span>
                      </div>
                    </div>

                    {item.batchDeductions && item.batchDeductions.length > 0 ? (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Potongan Batch Fisik:
                        </span>
                        <div className="space-y-1">
                          {item.batchDeductions.map((bd, bIdx) => (
                            <div key={bIdx} className="flex items-center justify-between text-[11px] bg-indigo-50/60 px-2 py-1 rounded border border-indigo-100">
                              <span className="font-mono font-bold text-indigo-900">
                                Batch #{bd.batchNumber || bd.batchId}
                              </span>
                              <span className="text-slate-600">
                                {bd.quantity} unit @ {formatRupiah(bd.costPrice)} = <strong className="font-mono text-slate-900">{formatRupiah(bd.totalCost)}</strong>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic">
                        Tidak ada histori batch (menggunakan HPP master produk).
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedTxDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
