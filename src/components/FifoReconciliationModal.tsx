import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Search, 
  RefreshCw, 
  FileSpreadsheet, 
  Wrench, 
  X, 
  Layers, 
  Receipt, 
  TrendingUp, 
  TrendingDown, 
  ArrowRight,
  Info,
  Sparkles,
  Check
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Transaction, Product } from '../types/pos';
import { 
  calculateFIFOGrossProfit, 
  reconcileTransactionsFifo, 
  FifoValidationSummary, 
  TransactionFifoValidationResult,
  ItemFifoValidationResult 
} from '../utils/fifoUtils';
import { formatRupiah, formatNumber, formatDateTime } from '../utils/formatters';
import { sound } from '../utils/audio';

interface FifoReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  products: Product[];
  onReconcile: (reconciledTransactions: Transaction[]) => Promise<void> | void;
}

export const FifoReconciliationModal: React.FC<FifoReconciliationModalProps> = ({
  isOpen,
  onClose,
  transactions,
  products,
  onReconcile,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [tabFilter, setTabFilter] = useState<'ALL' | 'DISCREPANCY_ONLY' | 'MATCH_ONLY'>('ALL');
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileSuccessMsg, setReconcileSuccessMsg] = useState<string | null>(null);

  // Directly call window.calculateFIFOGrossProfit to visually show its exact calculation
  const validationSummary: FifoValidationSummary = useMemo(() => {
    if (typeof window !== 'undefined' && typeof (window as any).calculateFIFOGrossProfit === 'function') {
      return (window as any).calculateFIFOGrossProfit(transactions, products) as FifoValidationSummary;
    }
    return calculateFIFOGrossProfit(transactions, products);
  }, [transactions, products]);

  // Flatten transaction items into an itemized audit list
  const itemizedRows = useMemo(() => {
    const list: Array<{
      txId: string;
      invoiceNumber: string;
      dateStr: string;
      customerName?: string;
      paymentMethod: string;
      item: ItemFifoValidationResult;
    }> = [];

    validationSummary.results.forEach((txResult) => {
      txResult.items.forEach((item) => {
        list.push({
          txId: txResult.transactionId,
          invoiceNumber: txResult.invoiceNumber,
          dateStr: txResult.dateStr,
          customerName: txResult.customerName,
          paymentMethod: txResult.paymentMethod,
          item,
        });
      });
    });

    return list;
  }, [validationSummary]);

  // Filtered itemized list
  const filteredItems = useMemo(() => {
    return itemizedRows.filter(({ invoiceNumber, customerName, item }) => {
      // Tab filter
      if (tabFilter === 'DISCREPANCY_ONLY' && !item.hasDiscrepancy) return false;
      if (tabFilter === 'MATCH_ONLY' && item.hasDiscrepancy) return false;

      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchProduct = item.productName.toLowerCase().includes(q);
        const matchInvoice = invoiceNumber.toLowerCase().includes(q);
        const matchCustomer = (customerName || '').toLowerCase().includes(q);
        return matchProduct || matchInvoice || matchCustomer;
      }

      return true;
    });
  }, [itemizedRows, tabFilter, searchQuery]);

  // Mass Reconciliation Action
  const handleMassReconciliation = async () => {
    sound.playTap();
    setIsReconciling(true);
    setReconcileSuccessMsg(null);

    try {
      // Call reconcileTransactionsFifo helper
      let result;
      if (typeof window !== 'undefined' && typeof (window as any).reconcileTransactionsFifo === 'function') {
        result = (window as any).reconcileTransactionsFifo(transactions, products);
      } else {
        result = reconcileTransactionsFifo(transactions, products);
      }

      if (result.reconciledCount === 0) {
        setReconcileSuccessMsg('Tidak ada transaksi berselisih yang perlu diperbaiki.');
        setIsReconciling(false);
        return;
      }

      // Propagate reconciled transactions to state and Firestore
      await onReconcile(result.reconciledTransactions);

      sound.playSuccess();
      setReconcileSuccessMsg(
        `Sukses merekonsiliasi ${result.reconciledCount} transaksi (${result.reconciledItemCount} item produk). Selisih laba telah diselaraskan 100% dengan alokasi FIFO murni!`
      );
    } catch (err) {
      console.error('Gagal merekonsiliasi transaksi:', err);
      alert('Terjadi kesalahan saat merekonsiliasi data transaksi.');
    } finally {
      setIsReconciling(false);
    }
  };

  // Export comparison table to Excel
  const handleExportExcel = () => {
    sound.playTap();
    const exportData = filteredItems.map(({ invoiceNumber, dateStr, customerName, item }, idx) => {
      const batchDetails = item.batchDeductions.length > 0
        ? item.batchDeductions.map(b => `${b.batchNumber || b.batchId} (${b.quantity} unit @ Rp ${b.costPrice.toLocaleString('id-ID')})`).join(' + ')
        : 'Non-Batch (Fallback HPP)';

      return {
        'No': idx + 1,
        'No. Invoice': invoiceNumber,
        'Tanggal': dateStr,
        'Pelanggan': customerName || 'Pelanggan Umum',
        'Nama Produk': item.productName,
        'Qty Terjual': item.quantity,
        'Satuan': item.unitName,
        'Harga Jual Satuan (Rp)': item.unitPrice,
        'Subtotal Omzet (Rp)': item.subtotal,
        'Laba Tercatat (Rp)': item.storedGrossProfit,
        'Laba Hasil FIFO (Rp)': item.exactFifoGrossProfit,
        'Selisih (Rp)': item.profitDifference,
        'Status': item.hasDiscrepancy ? 'Ada Selisih' : 'Sesuai (Match)',
        'Rincian Batch FIFO': batchDetails,
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, 'Perbandingan Laba FIFO');
    XLSX.writeFile(wb, `Rekonsiliasi_Laba_FIFO_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!isOpen) return null;

  const totalDiscrepantItems = itemizedRows.filter(r => r.item.hasDiscrepancy).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 text-white flex items-center justify-between shrink-0 border-b border-teal-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-500/20 border border-teal-400/30 rounded-2xl text-teal-400 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight text-white flex flex-wrap items-center gap-2">
                <span>Audit & Rekonsiliasi Laba Transaksi FIFO</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-400/20 text-teal-300 border border-teal-400/30 font-mono">
                  window.calculateFIFOGrossProfit
                </span>
              </h3>
              <p className="text-xs text-teal-200/80 mt-0.5">
                Memverifikasi laba tercatat vs laba hasil FIFO per item transaksi serta opsi perbaikan (reconciliation) massal.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              onClose();
            }}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          
          {/* Success Banner if reconciled */}
          {reconcileSuccessMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-start gap-3 animate-fade-in">
              <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-900 flex-1">
                <div className="font-bold text-sm">Rekonsiliasi Berhasil!</div>
                <div className="mt-0.5 text-emerald-800">{reconcileSuccessMsg}</div>
              </div>
            </div>
          )}

          {/* Discrepancy Status & Mass Reconcile Action Banner */}
          {validationSummary.transactionsWithDiscrepancyCount > 0 ? (
            <div className="p-4 sm:p-5 bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 border border-rose-200 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xs">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-bold text-sm text-rose-900">
                    Ditemukan {validationSummary.transactionsWithDiscrepancyCount} Transaksi ({totalDiscrepantItems} Item) dengan Selisih Laba!
                  </div>
                  <div className="text-rose-800 mt-1">
                    Total selisih laba bersih: <strong>{formatRupiah(Math.abs(validationSummary.netDiscrepancyAmount))}</strong>. Tekan tombol rekonsiliasi massal di samping untuk menyinkronkan HPP tersimpan dengan modal batch FIFO riil.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleMassReconciliation}
                disabled={isReconciling}
                className="w-full md:w-auto px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0 disabled:opacity-50"
              >
                {isReconciling ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Wrench className="w-4 h-4 text-rose-200" />
                )}
                <span>Perbaiki (Reconcile) Laba Massal</span>
              </button>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="text-xs text-emerald-900">
                <strong>Semua Laba Transaksi Akurat 100%!</strong> Seluruh perhitungan subtotal dikurangi HPP batch menghasilkan laba kotor yang identik dengan kartu stok FIFO.
              </div>
            </div>
          )}

          {/* 4 Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Item Divalidasi</div>
              <div className="text-lg font-black text-slate-900 font-mono mt-1">
                {formatNumber(validationSummary.totalItemsValidated)} Item
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {validationSummary.totalTransactionsValidated} transaksi diverifikasi
              </div>
            </div>

            <div className="p-3.5 bg-white border border-slate-200 rounded-2xl">
              <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Total Laba Tercatat</div>
              <div className="text-lg font-black text-indigo-900 font-mono mt-1">
                {formatRupiah(validationSummary.totalStoredGrossProfit)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Beban HPP: {formatRupiah(validationSummary.totalStoredCogs)}
              </div>
            </div>

            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
              <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Total Laba Hasil FIFO</div>
              <div className="text-lg font-black text-emerald-700 font-mono mt-1">
                {formatRupiah(validationSummary.totalExactFifoGrossProfit)}
              </div>
              <div className="text-[11px] text-emerald-800 mt-0.5 font-medium">
                Beban HPP: {formatRupiah(validationSummary.totalExactFifoCogs)}
              </div>
            </div>

            <div className={`p-3.5 rounded-2xl border ${
              validationSummary.transactionsWithDiscrepancyCount > 0
                ? 'bg-rose-50/80 border-rose-200'
                : 'bg-teal-50/70 border-teal-200'
            }`}>
              <div className={`text-[11px] font-bold uppercase tracking-wider ${
                validationSummary.transactionsWithDiscrepancyCount > 0 ? 'text-rose-800' : 'text-teal-800'
              }`}>
                Total Selisih Laba
              </div>
              <div className={`text-lg font-black font-mono mt-1 ${
                validationSummary.transactionsWithDiscrepancyCount > 0 ? 'text-rose-700' : 'text-teal-700'
              }`}>
                {validationSummary.netDiscrepancyAmount >= 0 ? '+' : ''}{formatRupiah(validationSummary.netDiscrepancyAmount)}
              </div>
              <div className={`text-[11px] mt-0.5 font-medium ${
                validationSummary.transactionsWithDiscrepancyCount > 0 ? 'text-rose-700' : 'text-teal-700'
              }`}>
                {validationSummary.transactionsWithDiscrepancyCount > 0
                  ? `${validationSummary.transactionsWithDiscrepancyCount} transaksi selisih`
                  : 'Sempurna (Rp 0)'}
              </div>
            </div>
          </div>

          {/* Filter Bar & Search */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setTabFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  tabFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua ({itemizedRows.length})
              </button>

              <button
                type="button"
                onClick={() => setTabFilter('DISCREPANCY_ONLY')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  tabFilter === 'DISCREPANCY_ONLY'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-rose-700 hover:text-rose-900'
                }`}
              >
                <span>Ada Selisih</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  tabFilter === 'DISCREPANCY_ONLY' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
                }`}>
                  {totalDiscrepantItems}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTabFilter('MATCH_ONLY')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  tabFilter === 'MATCH_ONLY'
                    ? 'bg-teal-700 text-white shadow-2xs'
                    : 'text-teal-800 hover:text-teal-950'
                }`}
              >
                <span>Sesuai FIFO</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  tabFilter === 'MATCH_ONLY' ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-800'
                }`}>
                  {itemizedRows.length - totalDiscrepantItems}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari produk, faktur..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-teal-500 focus:bg-white transition-all"
                />
              </div>

              <button
                type="button"
                onClick={handleExportExcel}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer shrink-0"
                title="Ekspor tabel perbandingan ke Excel (.xlsx)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                <span className="hidden sm:inline">Excel</span>
              </button>
            </div>
          </div>

          {/* The Core Comparison Table: Nama Produk, Laba Tercatat, Laba Hasil FIFO, Selisih */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3.5">Nama Produk & Faktur</th>
                    <th className="py-3 px-3 text-center">Qty</th>
                    <th className="py-3 px-3 text-right">Subtotal Omzet</th>
                    <th className="py-3 px-3 text-right text-indigo-800 bg-indigo-50/40">Laba Tercatat</th>
                    <th className="py-3 px-3 text-right text-emerald-800 bg-emerald-50/50">Laba Hasil FIFO</th>
                    <th className="py-3 px-3 text-right">Selisih</th>
                    <th className="py-3 px-3.5">Detail Alokasi Batch FIFO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400 font-medium">
                        Tidak ada data perbandingan produk yang cocok dengan pencarian / filter.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map(({ invoiceNumber, dateStr, item }, idx) => (
                      <tr
                        key={`${invoiceNumber}_${item.productId}_${idx}`}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          item.hasDiscrepancy ? 'bg-rose-50/20' : ''
                        }`}
                      >
                        {/* 1. Nama Produk */}
                        <td className="py-3 px-3.5">
                          <div className="font-bold text-slate-900">{item.productName}</div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-1.5">
                            <span className="font-semibold text-slate-700">{invoiceNumber}</span>
                            <span>•</span>
                            <span>{dateStr}</span>
                          </div>
                        </td>

                        {/* Qty & Unit */}
                        <td className="py-3 px-3 text-center font-mono font-semibold text-slate-700">
                          {item.quantity} {item.unitName}
                        </td>

                        {/* Subtotal Omzet */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          {formatRupiah(item.subtotal)}
                        </td>

                        {/* 2. Laba Tercatat */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-indigo-700 bg-indigo-50/30">
                          <div>{formatRupiah(item.storedGrossProfit)}</div>
                          <div className="text-[10px] text-slate-400 font-normal">
                            HPP: {formatRupiah(item.storedCostPrice)}/u
                          </div>
                        </td>

                        {/* 3. Laba Hasil FIFO */}
                        <td className="py-3 px-3 text-right font-mono font-black text-emerald-700 bg-emerald-50/40">
                          <div>{formatRupiah(item.exactFifoGrossProfit)}</div>
                          <div className="text-[10px] text-emerald-800 font-normal">
                            HPP: {formatRupiah(item.effectiveFifoUnitCost)}/u
                          </div>
                        </td>

                        {/* 4. Selisih */}
                        <td className="py-3 px-3 text-right font-mono font-bold">
                          {item.hasDiscrepancy ? (
                            <span className="inline-block text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                              {item.profitDifference >= 0 ? '+' : ''}{formatRupiah(item.profitDifference)}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">Rp 0 (Cocok)</span>
                          )}
                        </td>

                        {/* Detail Batch */}
                        <td className="py-3 px-3.5">
                          {item.batchDeductions.length > 0 ? (
                            <div className="space-y-1">
                              {item.batchDeductions.map((b, bIdx) => (
                                <div key={bIdx} className="text-[11px] font-mono text-slate-600 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                                  <span>{b.batchNumber || b.batchId}: {b.quantity}u @ {formatRupiah(b.costPrice)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Non-Batch (Fallback)</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-600 hidden sm:block">
            Status: <strong>{validationSummary.validationStatus}</strong> • Transaksi Discrepancy: <strong>{validationSummary.transactionsWithDiscrepancyCount}</strong>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {validationSummary.transactionsWithDiscrepancyCount > 0 && (
              <button
                type="button"
                onClick={handleMassReconciliation}
                disabled={isReconciling}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isReconciling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                <span>Perbaiki (Reconcile) Massal</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onClose();
              }}
              className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
