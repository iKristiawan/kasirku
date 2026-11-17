import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Wrench,
  Search,
  FileSpreadsheet,
  Boxes,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  Info,
  Calendar,
  AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';
import {
  verifyBatchStockIntegrity,
  reconcileBatchStockIntegrity,
  reconcileAllBatchStockIntegrity,
  BatchStockIntegritySummary,
  BatchStockIntegrityItem
} from '../utils/fifoUtils';

interface BatchStockIntegrityPanelProps {
  products: Product[];
  onSaveProducts: (updatedProducts: Product[]) => Promise<void> | void;
  onClose?: () => void;
  isModal?: boolean;
}

export const BatchStockIntegrityPanel: React.FC<BatchStockIntegrityPanelProps> = ({
  products,
  onSaveProducts,
  onClose,
  isModal = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDiscrepancyOnly, setFilterDiscrepancyOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<BatchStockIntegrityItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toastNotice, setToastNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<number>(Date.now());

  // Run verifyBatchStockIntegrity
  const summary: BatchStockIntegritySummary = useMemo(() => {
    const verifyFn = (typeof window !== 'undefined' && (window as any).verifyBatchStockIntegrity)
      ? (window as any).verifyBatchStockIntegrity
      : verifyBatchStockIntegrity;
    return verifyFn(products);
  }, [products, lastCheckTime]);

  // Unique categories for filter
  const categories = useMemo(() => {
    const set = new Set<string>();
    summary.results.forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set);
  }, [summary.results]);

  // Filtered rows
  const filteredResults = useMemo(() => {
    return summary.results.filter((item) => {
      if (filterDiscrepancyOnly && item.status === 'MATCH') {
        return false;
      }
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.productName.toLowerCase().includes(q);
        const matchSku = item.sku.toLowerCase().includes(q);
        const matchBatch = item.activeBatches.some((b) => b.batchNumber.toLowerCase().includes(q));
        return matchName || matchSku || matchBatch;
      }
      return true;
    });
  }, [summary.results, filterDiscrepancyOnly, categoryFilter, searchQuery]);

  // Re-verify action
  const handleReVerify = () => {
    sound.playTap();
    setLastCheckTime(Date.now());
    sound.playSuccess();
    setToastNotice({
      type: 'info',
      message: 'Verifikasi integritas stok batch telah dijalankan ulang.'
    });
  };

  // Reconcile a single product
  const handleReconcileSingle = async (item: BatchStockIntegrityItem) => {
    sound.playTap();
    setIsProcessing(true);
    try {
      const targetProd = products.find((p) => p.id === item.productId);
      if (!targetProd) return;

      const reconcileFn = (typeof window !== 'undefined' && (window as any).reconcileBatchStockIntegrity)
        ? (window as any).reconcileBatchStockIntegrity
        : reconcileBatchStockIntegrity;

      const updatedProd = reconcileFn(targetProd);
      const nextProducts = products.map((p) => (p.id === updatedProd.id ? updatedProd : p));

      await onSaveProducts(nextProducts);
      setLastCheckTime(Date.now());
      sound.playSuccess();
      setToastNotice({
        type: 'success',
        message: `Batch produk "${item.productName}" berhasil disinkronkan. Sisa stok di batch kini sama dengan stok utama (${updatedProd.stockInBaseUnit} ${updatedProd.baseUnit}).`
      });
    } catch (err) {
      sound.playError();
      setToastNotice({
        type: 'error',
        message: 'Gagal menyinkronkan batch produk: ' + String(err)
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Reconcile ALL products mass action
  const handleReconcileAll = async () => {
    sound.playTap();
    if (summary.discrepanciesCount === 0) {
      setToastNotice({
        type: 'info',
        message: 'Seluruh batch produk sudah 100% valid dan cocok dengan stok utama. Tidak ada selisih yang perlu diperbaiki.'
      });
      return;
    }

    setIsProcessing(true);
    try {
      const massFn = (typeof window !== 'undefined' && (window as any).reconcileAllBatchStockIntegrity)
        ? (window as any).reconcileAllBatchStockIntegrity
        : reconcileAllBatchStockIntegrity;

      const { updatedProducts, reconciledCount } = massFn(products);

      if (reconciledCount === 0) {
        setToastNotice({
          type: 'info',
          message: 'Semua batch produk sudah sesuai.'
        });
        setIsProcessing(false);
        return;
      }

      await onSaveProducts(updatedProducts);
      setLastCheckTime(Date.now());
      sound.playSuccess();
      setToastNotice({
        type: 'success',
        message: `Berhasil menyinkronkan ${reconciledCount} produk secara massal! Seluruh total remainingQuantity batch kini sesuai 100% dengan stockInBaseUnit di cloud & lokal.`
      });
    } catch (err) {
      sound.playError();
      setToastNotice({
        type: 'error',
        message: 'Gagal melakukan sinkronisasi batch massal: ' + String(err)
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Export Audit to Excel
  const handleExportExcel = () => {
    sound.playTap();
    if (summary.results.length === 0) return;

    const dataRows = summary.results.map((r, idx) => ({
      'No': idx + 1,
      'SKU / Barcode': r.sku,
      'Nama Produk': r.productName,
      'Kategori': r.category,
      'Satuan Dasar': r.baseUnit,
      'Stok Utama (stockInBaseUnit)': r.stockInBaseUnit,
      'Total Sisa Batch (remainingQuantity)': r.totalBatchQuantity,
      'Selisih (Batch - Master)': r.difference,
      'Status Integritas': r.statusLabel,
      'Jumlah Batch Aktif': r.batchesCount,
      'HPP Modal (Rp)': r.costPrice,
      'Estimasi Nilai Selisih (Rp)': Math.abs(r.difference) * r.costPrice,
      'Daftar Nomor Batch': r.activeBatches.map(b => `${b.batchNumber}: ${b.remainingQuantity} ${r.baseUnit}`).join('; ')
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Integritas Batch Stok');
    XLSX.writeFile(wb, `Audit_Integritas_Batch_Stok_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className={`space-y-4 ${isModal ? '' : 'p-4 md:p-6 bg-slate-100 rounded-3xl'}`}>
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 md:p-6 rounded-3xl border border-indigo-900/60 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-indigo-500/20 border border-indigo-400/30 rounded-2xl shrink-0">
              <ShieldCheck className="w-6 h-6 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base md:text-lg font-black tracking-tight text-white">
                  Verifikasi Integritas Sisa Stok Batch FIFO
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
                  verifyBatchStockIntegrity
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                Memverifikasi bahwa akumulasi sisa kuantitas fisik (<code className="font-mono text-indigo-200">remainingQuantity</code>) pada seluruh kartu stok batch setiap produk sama persis dengan stok utama (<code className="font-mono text-indigo-200">stockInBaseUnit</code>).
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Mass Reconcile */}
            <button
              onClick={handleReconcileAll}
              disabled={isProcessing || summary.discrepanciesCount === 0}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md ${
                summary.discrepanciesCount > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                  : 'bg-slate-800 text-slate-400 cursor-not-allowed opacity-75'
              }`}
              title="Sinkronkan seluruh produk yang berselisih batch secara otomatis"
            >
              <Wrench className={`w-4 h-4 ${isProcessing ? 'animate-spin' : 'text-emerald-200'}`} />
              <span>{isProcessing ? 'Memproses...' : 'Perbaiki Seluruh Selisih Batch'}</span>
            </button>

            {/* Re-verify Button */}
            <button
              onClick={handleReVerify}
              disabled={isProcessing}
              className="px-3.5 py-2.5 rounded-xl bg-indigo-800/80 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-indigo-600/40"
              title="Jalankan ulang fungsi verifikasi integritas batch"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-300" />
              <span>Cek Ulang</span>
            </button>

            {/* Export Excel */}
            <button
              onClick={handleExportExcel}
              className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
              title="Ekspor Laporan Audit Integritas Batch ke Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Ekspor Excel</span>
            </button>

            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer ml-1"
                title="Tutup Panel"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* 4 KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3 mt-4 pt-4 border-t border-indigo-900/60">
          <div className="bg-slate-900/80 border border-indigo-900/40 p-3 rounded-2xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Produk Fisik</span>
            <div className="text-xl font-black text-white font-mono mt-0.5">
              {summary.totalProductsChecked} <span className="text-xs font-semibold text-slate-400">SKU</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Total Master Stok: {formatNumber(summary.totalMasterStock)} Unit
            </div>
          </div>

          <div className="bg-slate-900/80 border border-indigo-900/40 p-3 rounded-2xl">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Batch 100% Cocok</span>
            <div className="text-xl font-black text-emerald-400 font-mono mt-0.5">
              {summary.validMatchesCount} <span className="text-xs font-semibold text-emerald-300">SKU</span>
            </div>
            <div className="text-[10px] text-emerald-300/80 mt-0.5">
              Sisa batch identik dengan stok utama
            </div>
          </div>

          <div className={`p-3 rounded-2xl border transition-all ${
            summary.discrepanciesCount > 0
              ? 'bg-rose-950/80 border-rose-500/60 ring-2 ring-rose-500/20'
              : 'bg-slate-900/80 border-indigo-900/40'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                Ada Selisih Batch
              </span>
              {summary.discrepanciesCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              )}
            </div>
            <div className={`text-xl font-black font-mono mt-0.5 ${
              summary.discrepanciesCount > 0 ? 'text-rose-300' : 'text-slate-400'
            }`}>
              {summary.discrepanciesCount} <span className="text-xs font-semibold">SKU</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {summary.deficitCount > 0 && `${summary.deficitCount} Defisit `}
              {summary.surplusCount > 0 && `${summary.surplusCount} Surplus `}
              {summary.noBatchesCount > 0 && `${summary.noBatchesCount} Tanpa Batch`}
              {summary.discrepanciesCount === 0 && 'Nol ketidaksesuaian'}
            </div>
          </div>

          <div className="bg-slate-900/80 border border-indigo-900/40 p-3 rounded-2xl">
            <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Total Stok di Batch</span>
            <div className="text-xl font-black text-indigo-300 font-mono mt-0.5">
              {formatNumber(summary.totalBatchStock)} <span className="text-xs font-semibold text-indigo-200">Unit</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Net Delta: <span className={`font-mono font-bold ${summary.netDifferenceUnits === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {summary.netDifferenceUnits > 0 ? '+' : ''}{summary.netDifferenceUnits} Unit
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Feedback Notice */}
      {toastNotice && (
        <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs font-semibold ${
          toastNotice.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
            : toastNotice.type === 'error'
            ? 'bg-rose-50 text-rose-800 border-rose-300'
            : 'bg-sky-50 text-sky-800 border-sky-300'
        }`}>
          <div className="flex items-center gap-2">
            {toastNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : toastNotice.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-sky-600 shrink-0" />
            )}
            <span>{toastNotice.message}</span>
          </div>
          <button
            onClick={() => setToastNotice(null)}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Control Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama produk, SKU, barcode, atau nomor batch..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-indigo-500 focus:bg-white text-slate-800"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              sound.playTap();
              setCategoryFilter(e.target.value);
            }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
          >
            <option value="ALL">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Toggle: Discrepancy Only */}
          <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterDiscrepancyOnly}
              onChange={(e) => {
                sound.playTap();
                setFilterDiscrepancyOnly(e.target.checked);
              }}
              className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
            />
            <span>Hanya Produk Berselisih ({summary.discrepanciesCount})</span>
          </label>
        </div>
      </div>

      {/* Main Table: Batch Stock Integrity Results */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
                <th className="py-3 px-3">Produk &amp; SKU</th>
                <th className="py-3 px-3">Kategori</th>
                <th className="py-3 px-3 text-right">Stok Utama</th>
                <th className="py-3 px-3 text-right">Total Sisa di Batch</th>
                <th className="py-3 px-3 text-right">Selisih</th>
                <th className="py-3 px-3 text-center">Status Integritas</th>
                <th className="py-3 px-4">Rincian Batch Fisik</th>
                <th className="py-3 px-3 text-center">Aksi Sinkron</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Boxes className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-bold text-sm text-slate-600">Tidak ada data integritas batch yang cocok</p>
                    <p className="text-xs text-slate-400 mt-0.5">Ubah kata kunci filter atau semua batch telah sesuai</p>
                  </td>
                </tr>
              ) : (
                filteredResults.map((item) => {
                  const hasDiscrepancy = item.status !== 'MATCH';

                  return (
                    <tr
                      key={item.productId}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        hasDiscrepancy ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      {/* Product Name & SKU */}
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-slate-900">{item.productName}</div>
                        <div className="text-[10px] font-mono text-slate-400">{item.sku}</div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                          {item.category}
                        </span>
                      </td>

                      {/* Stock in Base Unit */}
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatNumber(item.stockInBaseUnit)} <span className="text-[10px] text-slate-400 font-normal">{item.baseUnit}</span>
                      </td>

                      {/* Total Batch Quantity */}
                      <td className="py-3.5 px-3 text-right font-mono font-black text-indigo-700">
                        {formatNumber(item.totalBatchQuantity)} <span className="text-[10px] text-indigo-400 font-normal">{item.baseUnit}</span>
                      </td>

                      {/* Difference */}
                      <td className="py-3.5 px-3 text-right font-mono font-bold">
                        {item.difference === 0 ? (
                          <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md text-[11px]">
                            0
                          </span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${
                            item.difference > 0
                              ? 'text-yellow-800 bg-yellow-100'
                              : 'text-rose-700 bg-rose-100'
                          }`}>
                            {item.difference > 0 ? '+' : ''}{item.difference} {item.baseUnit}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3 text-center">
                        {item.status === 'MATCH' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>100% Cocok</span>
                          </span>
                        ) : item.status === 'NO_BATCHES' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            <span>Tanpa Batch</span>
                          </span>
                        ) : item.status === 'BATCH_DEFICIT' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>Defisit Batch</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-300">
                            <AlertTriangle className="w-3 h-3 text-yellow-600" />
                            <span>Surplus Batch</span>
                          </span>
                        )}
                      </td>

                      {/* Batch Breakdown Pills */}
                      <td className="py-3.5 px-4">
                        {item.activeBatches.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {item.activeBatches.map((b, bIdx) => (
                              <span
                                key={b.batchId || bIdx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-700 font-mono"
                                title={`Batch: ${b.batchNumber} · Sisa: ${b.remainingQuantity} ${item.baseUnit} · HPP: ${formatRupiah(b.costPrice)}`}
                              >
                                <span className="font-bold text-indigo-700">{b.batchNumber}:</span>
                                <span>{b.remainingQuantity} {item.baseUnit}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            Belum ada kartu stok batch
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-3 text-center">
                        {hasDiscrepancy ? (
                          <button
                            onClick={() => handleReconcileSingle(item)}
                            disabled={isProcessing}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center justify-center gap-1 transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
                            title="Sinkronkan remainingQuantity batch agar persis sama dengan stok utama"
                          >
                            <Wrench className="w-3 h-3 text-emerald-200" />
                            <span>Sinkronkan</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Terverifikasi</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
