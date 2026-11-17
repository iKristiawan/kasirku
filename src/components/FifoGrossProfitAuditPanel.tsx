import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Search, 
  RefreshCw, 
  FileSpreadsheet, 
  ChevronDown, 
  ChevronUp, 
  Layers, 
  Receipt, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  Info,
  DollarSign,
  ArrowRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Transaction, Product } from '../types/pos';
import { calculateFIFOGrossProfit, FifoValidationSummary, TransactionFifoValidationResult } from '../utils/fifoUtils';
import { formatRupiah, formatNumber, formatDateTime } from '../utils/formatters';
import { sound } from '../utils/audio';

interface FifoGrossProfitAuditPanelProps {
  transactions: Transaction[];
  products: Product[];
  storeName?: string;
  isModal?: boolean;
  onClose?: () => void;
}

export const FifoGrossProfitAuditPanel: React.FC<FifoGrossProfitAuditPanelProps> = ({
  transactions,
  products,
  storeName = 'KasirKu POS',
  isModal = false,
  onClose,
}) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DISCREPANCY' | 'MATCH' | 'FALLBACK'>('ALL');
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  // Call window.calculateFIFOGrossProfit explicitly to audit all transactions
  const auditSummary: FifoValidationSummary = useMemo(() => {
    // Explicitly check for and call window.calculateFIFOGrossProfit
    if (typeof window !== 'undefined' && typeof (window as any).calculateFIFOGrossProfit === 'function') {
      return (window as any).calculateFIFOGrossProfit(transactions, products) as FifoValidationSummary;
    }
    return calculateFIFOGrossProfit(transactions, products);
  }, [transactions, products, refreshTrigger]);

  const handleRefresh = () => {
    sound.playTap();
    setRefreshTrigger((prev) => prev + 1);
  };

  // Filtered rows for the comparison table
  const filteredResults = useMemo(() => {
    return auditSummary.results.filter((res) => {
      // Status filter
      if (statusFilter === 'DISCREPANCY' && !res.hasDiscrepancy) return false;
      if (statusFilter === 'MATCH' && (!res.hasBatchDeductions || res.hasDiscrepancy)) return false;
      if (statusFilter === 'FALLBACK' && res.hasBatchDeductions) return false;

      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchInvoice = res.invoiceNumber.toLowerCase().includes(q);
        const matchCustomer = (res.customerName || '').toLowerCase().includes(q);
        const matchItem = res.items.some((i) => i.productName.toLowerCase().includes(q));
        return matchInvoice || matchCustomer || matchItem;
      }

      return true;
    });
  }, [auditSummary, statusFilter, searchQuery]);

  // Export audit table to Excel
  const handleExportAuditExcel = () => {
    sound.playTap();
    if (auditSummary.results.length === 0) {
      alert('Tidak ada data audit transaksi untuk diekspor.');
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    // Sheet 1: Komparasi Laba Tercatat vs Laba Hasil FIFO
    const sheetData = auditSummary.results.map((res, idx) => ({
      'No': idx + 1,
      'No. Invoice': res.invoiceNumber,
      'Tanggal Transaksi': res.dateStr,
      'Nama Pelanggan': res.customerName || 'Pelanggan Umum',
      'Metode Bayar': res.paymentMethod.replace(/_/g, ' '),
      'Jumlah Item': res.items.length,
      'Total Omzet (Rp)': res.finalAmount,
      'HPP Tercatat (Rp)': res.totalStoredCogs,
      'HPP Hasil FIFO (Rp)': res.totalExactFifoCogs,
      'Laba Tercatat (Rp)': res.totalStoredGrossProfit,
      'Laba Hasil FIFO (Rp)': res.totalExactFifoGrossProfit,
      'Selisih Laba (Rp)': res.profitDifference,
      'Status Audit': res.hasDiscrepancy 
        ? 'Selisih Terdeteksi' 
        : res.hasBatchDeductions 
          ? '100% Sesuai FIFO' 
          : 'HPP Tersimpan (Fallback)'
    }));

    // Sheet 2: Detail Item & Alokasi Batch Tiap Transaksi
    const detailSheetData: any[] = [];
    auditSummary.results.forEach((res) => {
      res.items.forEach((item) => {
        if (item.batchDeductions && item.batchDeductions.length > 0) {
          item.batchDeductions.forEach((b) => {
            detailSheetData.push({
              'No. Invoice': res.invoiceNumber,
              'Tanggal': res.dateStr,
              'Pelanggan': res.customerName || 'Pelanggan Umum',
              'Nama Produk': item.productName,
              'Qty Terjual': item.quantity,
              'Satuan': item.unitName,
              'Subtotal Omzet Item (Rp)': item.subtotal,
              'HPP Tercatat per Unit (Rp)': item.storedCostPrice,
              'Total HPP Tercatat (Rp)': item.storedTotalCogs,
              'Laba Tercatat (Rp)': item.storedGrossProfit,
              'No. Batch Terpakai': b.batchNumber || b.batchId,
              'Qty Diambil (Base Unit)': b.quantity,
              'HPP Batch (costPrice) (Rp)': b.costPrice,
              'Total Beban HPP Batch (Rp)': b.totalCost,
              'Total HPP Hasil FIFO Item (Rp)': item.exactFifoCogs,
              'Laba Hasil FIFO Item (Rp)': item.exactFifoGrossProfit,
              'Selisih Laba Item (Rp)': item.profitDifference,
              'Status Discrepancy': item.hasDiscrepancy ? 'Ada Selisih' : 'Sesuai'
            });
          });
        } else {
          detailSheetData.push({
            'No. Invoice': res.invoiceNumber,
            'Tanggal': res.dateStr,
            'Pelanggan': res.customerName || 'Pelanggan Umum',
            'Nama Produk': item.productName,
            'Qty Terjual': item.quantity,
            'Satuan': item.unitName,
            'Subtotal Omzet Item (Rp)': item.subtotal,
            'HPP Tercatat per Unit (Rp)': item.storedCostPrice,
            'Total HPP Tercatat (Rp)': item.storedTotalCogs,
            'Laba Tercatat (Rp)': item.storedGrossProfit,
            'No. Batch Terpakai': 'Non-Batch (Fallback)',
            'Qty Diambil (Base Unit)': item.baseUnits,
            'HPP Batch (costPrice) (Rp)': item.storedCostPrice,
            'Total Beban HPP Batch (Rp)': item.storedTotalCogs,
            'Total HPP Hasil FIFO Item (Rp)': item.exactFifoCogs,
            'Laba Hasil FIFO Item (Rp)': item.exactFifoGrossProfit,
            'Selisih Laba Item (Rp)': 0,
            'Status Discrepancy': 'Fallback Tercatat'
          });
        }
      });
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sheetData);
    const ws2 = XLSX.utils.json_to_sheet(detailSheetData);

    XLSX.utils.book_append_sheet(wb, ws1, 'Komparasi Laba Transaksi');
    XLSX.utils.book_append_sheet(wb, ws2, 'Detail Item & Batch FIFO');

    const cleanTitle = storeName.replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `Audit_Laba_Kotor_FIFO_${cleanTitle}_${todayStr}.xlsx`);
  };

  return (
    <div className={`space-y-4 ${isModal ? 'p-4 sm:p-6' : ''}`}>
      {/* Panel Top Header */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white p-4 sm:p-6 rounded-2xl md:rounded-3xl shadow-md border border-teal-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="p-3 bg-teal-500/20 border border-teal-400/30 rounded-2xl text-teal-400 shrink-0">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                Audit Laba Kotor Transaksi (FIFO Engine Verification)
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-400/20 text-teal-300 border border-teal-400/30 font-mono font-bold">
                window.calculateFIFOGrossProfit()
              </span>
            </div>
            <p className="text-xs text-teal-200/80 mt-1 max-w-2xl">
              Membandingkan nilai <strong>Laba Tercatat</strong> (berdasarkan HPP rata-rata transaksi) dengan <strong>Laba Hasil FIFO</strong> (menelusuri batchDeductions alokasi stok masuk) untuk memvalidasi akurasi keuntungan.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-white/10"
            title="Hitung ulang audit transaksi sekarang"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Audit Ulang</span>
          </button>

          <button
            type="button"
            onClick={handleExportAuditExcel}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            title="Unduh Tabel Komparasi Audit ke File Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
            <span>Ekspor Audit Excel</span>
          </button>

          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold cursor-pointer"
            >
              Tutup
            </button>
          )}
        </div>
      </div>

      {/* Audit KPI Cards: Laba Tercatat vs Laba Hasil FIFO */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Transaksi */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5 text-slate-500" />
            Transaksi Divalidasi
          </div>
          <div className="text-xl md:text-2xl font-black text-slate-900 font-mono mt-1">
            {formatNumber(auditSummary.totalTransactionsValidated)} Nota
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {auditSummary.totalItemsValidated} item produk diverifikasi
          </div>
        </div>

        {/* Laba Tercatat */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-indigo-500" />
            Laba Tercatat (HPP Stored)
          </div>
          <div className="text-xl md:text-2xl font-black text-indigo-700 font-mono mt-1">
            {formatRupiah(auditSummary.totalStoredGrossProfit)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Total HPP: {formatRupiah(auditSummary.totalStoredCogs)}
          </div>
        </div>

        {/* Laba Hasil FIFO */}
        <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 shadow-2xs">
          <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Laba Hasil FIFO (Batch)
          </div>
          <div className="text-xl md:text-2xl font-black text-emerald-700 font-mono mt-1">
            {formatRupiah(auditSummary.totalExactFifoGrossProfit)}
          </div>
          <div className="text-[11px] text-emerald-800 mt-0.5 font-medium">
            Total HPP: {formatRupiah(auditSummary.totalExactFifoCogs)}
          </div>
        </div>

        {/* Selisih Laba Bersih */}
        <div className={`p-4 rounded-2xl border shadow-2xs ${
          auditSummary.transactionsWithDiscrepancyCount > 0
            ? 'bg-rose-50/70 border-rose-200'
            : 'bg-teal-50/60 border-teal-200'
        }`}>
          <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
            auditSummary.transactionsWithDiscrepancyCount > 0 ? 'text-rose-800' : 'text-teal-800'
          }`}>
            {auditSummary.transactionsWithDiscrepancyCount > 0 ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
            )}
            Selisih Laba (FIFO - Tercatat)
          </div>
          <div className={`text-xl md:text-2xl font-black font-mono mt-1 ${
            auditSummary.transactionsWithDiscrepancyCount > 0 ? 'text-rose-700' : 'text-teal-700'
          }`}>
            {auditSummary.netDiscrepancyAmount >= 0 ? '+' : ''}{formatRupiah(auditSummary.netDiscrepancyAmount)}
          </div>
          <div className={`text-[11px] mt-0.5 font-medium ${
            auditSummary.transactionsWithDiscrepancyCount > 0 ? 'text-rose-700' : 'text-teal-700'
          }`}>
            {auditSummary.transactionsWithDiscrepancyCount > 0
              ? `${auditSummary.transactionsWithDiscrepancyCount} transaksi berselisih`
              : 'Semua transaksi 100% akurat'}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-full md:w-auto overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'ALL'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua ({auditSummary.results.length})
          </button>
          
          <button
            type="button"
            onClick={() => setStatusFilter('DISCREPANCY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              statusFilter === 'DISCREPANCY'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'text-rose-700 hover:text-rose-900'
            }`}
          >
            <span>Ada Selisih</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              statusFilter === 'DISCREPANCY' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
            }`}>
              {auditSummary.transactionsWithDiscrepancyCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('MATCH')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              statusFilter === 'MATCH'
                ? 'bg-emerald-700 text-white shadow-2xs'
                : 'text-emerald-800 hover:text-emerald-950'
            }`}
          >
            <span>Sesuai FIFO (100%)</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              statusFilter === 'MATCH' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {auditSummary.transactionsWithBatchDeductionsCount - auditSummary.transactionsWithDiscrepancyCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('FALLBACK')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'FALLBACK'
                ? 'bg-slate-700 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tanpa Batch ({auditSummary.historicalFallbackCount})
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari faktur, pelanggan, atau produk..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-teal-500 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Main Comparison Table: Laba Tercatat vs Laba Hasil FIFO */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3.5">No. Invoice & Tanggal</th>
                <th className="py-3 px-3">Pelanggan & Kasir</th>
                <th className="py-3 px-3 text-right">Omzet (Rp)</th>
                <th className="py-3 px-3 text-right text-indigo-700">Laba Tercatat</th>
                <th className="py-3 px-3 text-right text-emerald-700 bg-emerald-50/50">Laba Hasil FIFO</th>
                <th className="py-3 px-3 text-right">Selisih Laba</th>
                <th className="py-3 px-3 text-center">Status Verifikasi</th>
                <th className="py-3 px-3.5 text-center">Detail Batch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 font-medium">
                    Tidak ditemukan data audit transaksi yang cocok dengan filter atau kata kunci.
                  </td>
                </tr>
              ) : (
                filteredResults.map((res) => {
                  const isExpanded = expandedTxId === res.transactionId;
                  const diff = res.profitDifference;
                  const hasDiscrepancy = res.hasDiscrepancy;

                  return (
                    <React.Fragment key={res.transactionId}>
                      <tr 
                        className={`hover:bg-slate-50/80 transition-colors ${
                          hasDiscrepancy ? 'bg-rose-50/20' : ''
                        }`}
                      >
                        {/* Invoice & Date */}
                        <td className="py-3 px-3.5">
                          <div className="font-mono font-bold text-slate-900">{res.invoiceNumber}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{res.dateStr}</div>
                        </td>

                        {/* Customer & Cashier */}
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800">
                            {res.customerName || 'Pelanggan Umum'}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Kasir: {res.paymentMethod.replace(/_/g, ' ')}
                          </div>
                        </td>

                        {/* Omzet */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          {formatRupiah(res.finalAmount)}
                        </td>

                        {/* Laba Tercatat */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-indigo-700">
                          <div>{formatRupiah(res.totalStoredGrossProfit)}</div>
                          <div className="text-[10px] text-slate-400 font-normal">
                            HPP: {formatRupiah(res.totalStoredCogs)}
                          </div>
                        </td>

                        {/* Laba Hasil FIFO */}
                        <td className="py-3 px-3 text-right font-mono font-black text-emerald-700 bg-emerald-50/40">
                          <div>{formatRupiah(res.totalExactFifoGrossProfit)}</div>
                          <div className="text-[10px] text-emerald-800 font-normal">
                            HPP: {formatRupiah(res.totalExactFifoCogs)}
                          </div>
                        </td>

                        {/* Selisih Laba */}
                        <td className="py-3 px-3 text-right font-mono font-bold">
                          {hasDiscrepancy ? (
                            <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                              {diff >= 0 ? '+' : ''}{formatRupiah(diff)}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">Rp 0 (Cocok)</span>
                          )}
                        </td>

                        {/* Status Verifikasi */}
                        <td className="py-3 px-3 text-center">
                          {hasDiscrepancy ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              <AlertCircle className="w-3 h-3" />
                              Selisih
                            </span>
                          ) : res.hasBatchDeductions ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              100% Sesuai
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              Fallback
                            </span>
                          )}
                        </td>

                        {/* Action Toggle */}
                        <td className="py-3 px-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setExpandedTxId(isExpanded ? null : res.transactionId);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <span>{isExpanded ? 'Tutup' : 'Rincian'}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Breakdown Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-b border-slate-200">
                          <td colSpan={8} className="p-4 sm:p-5">
                            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                                  <Layers className="w-4 h-4 text-teal-600" />
                                  <span>Rincian Item & Penelusuran Batch FIFO: Faktur {res.invoiceNumber}</span>
                                </div>
                                <div className="text-[11px] font-mono text-slate-500">
                                  {res.items.length} item • Formula: Laba Kotor = Subtotal - Total HPP Batch
                                </div>
                              </div>

                              <div className="space-y-2.5">
                                {res.items.map((item, itemIdx) => (
                                  <div
                                    key={itemIdx}
                                    className="p-3 rounded-xl border border-slate-100 bg-slate-50/40 space-y-2"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <div className="font-bold text-slate-900 text-xs">{item.productName}</div>
                                        <div className="text-[11px] text-slate-500">
                                          Terjual: {item.quantity} {item.unitName} (Total {item.baseUnits} unit dasar) @ {formatRupiah(item.unitPrice)} = <strong>{formatRupiah(item.subtotal)}</strong>
                                        </div>
                                      </div>

                                      {/* Item Comparison */}
                                      <div className="text-right flex items-center gap-3">
                                        <div>
                                          <div className="text-[10px] text-slate-400 font-semibold uppercase">Laba Tercatat</div>
                                          <div className="text-xs font-mono font-bold text-indigo-700">
                                            {formatRupiah(item.storedGrossProfit)}
                                          </div>
                                        </div>
                                        <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                                        <div>
                                          <div className="text-[10px] text-emerald-700 font-bold uppercase">Laba Hasil FIFO</div>
                                          <div className="text-xs font-mono font-black text-emerald-700">
                                            {formatRupiah(item.exactFifoGrossProfit)}
                                          </div>
                                        </div>
                                        {item.hasDiscrepancy && (
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200">
                                            Selisih {formatRupiah(Math.abs(item.profitDifference))}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Batch Trace Breakdown */}
                                    <div className="bg-white rounded-lg p-2.5 border border-slate-200">
                                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                        Riwayat Alokasi Kartu Stok (FIFO Batches):
                                      </div>

                                      {item.batchDeductions && item.batchDeductions.length > 0 ? (
                                        <div className="space-y-1">
                                          {item.batchDeductions.map((b, bIdx) => (
                                            <div
                                              key={bIdx}
                                              className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-700 bg-slate-50 px-2 py-1.5 rounded-md border border-slate-100"
                                            >
                                              <div className="flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                                                <span>Nomor Batch: <strong>{b.batchNumber || b.batchId}</strong></span>
                                                {b.expiryDate && (
                                                  <span className="text-[10px] text-slate-400">(Exp: {b.expiryDate})</span>
                                                )}
                                              </div>
                                              <div>
                                                {b.quantity} unit x {formatRupiah(b.costPrice)} = <strong className="text-rose-700">{formatRupiah(b.totalCost)}</strong>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="text-[11px] text-slate-500 italic">
                                          Tidak ada rekaman alokasi batch kartu stok. Menggunakan HPP rata-rata tersimpan ({formatRupiah(item.storedCostPrice)} per unit).
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
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
      </div>
    </div>
  );
};
