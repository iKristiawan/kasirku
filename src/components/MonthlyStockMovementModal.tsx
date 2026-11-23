import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileDown,
  Filter,
  Package,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  Product,
  RestockOrder,
  StockOpnameRecord,
  StoreSettings,
  Transaction,
} from '../types/pos';
import {
  computeMonthlyStockMovementData,
  generateMonthlyStockMovementPdf,
  getCurrentMonthKey,
  shiftMonthKey,
} from '../utils/monthlyStockMovementPdf';
import { formatNumber, formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';

interface MonthlyStockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  purchases: RestockOrder[];
  transactions: Transaction[];
  stockOpnames: StockOpnameRecord[];
  storeSettings?: StoreSettings;
  auditorName?: string;
  initialMonthKey?: string;
  onStartOpnameSession?: () => void;
}

export const MonthlyStockMovementModal: React.FC<MonthlyStockMovementModalProps> = ({
  isOpen,
  onClose,
  products,
  purchases,
  transactions,
  stockOpnames,
  storeSettings,
  auditorName = 'Admin Gudang',
  initialMonthKey,
  onStartOpnameSession,
}) => {
  const [monthKey, setMonthKey] = useState<string>(initialMonthKey || getCurrentMonthKey());
  const [categoryFilter, setCategoryFilter] = useState<string>('SEMUA');
  const [onlyWithMovement, setOnlyWithMovement] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({});

  const categories = useMemo(() => {
    const physical = products.filter((p) => p.productType !== 'JASA');
    return ['SEMUA', ...Array.from(new Set(physical.map((p) => p.category || 'Umum'))).sort()];
  }, [products]);

  const movementData = useMemo(() => {
    return computeMonthlyStockMovementData({
      monthKey,
      products,
      purchases,
      transactions,
      stockOpnames,
      categoryFilter,
    });
  }, [monthKey, products, purchases, transactions, stockOpnames, categoryFilter]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return movementData.rows.filter((row) => {
      if (onlyWithMovement && !row.hasMovement) return false;
      if (!q) return true;
      return (
        row.productName.toLowerCase().includes(q) ||
        row.barcode.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q)
      );
    });
  }, [movementData.rows, onlyWithMovement, searchQuery]);

  const checkedPhysicalSummary = useMemo(() => {
    let checkedCount = 0;
    let discrepancyCount = 0;
    filteredRows.forEach((row) => {
      const raw = physicalCounts[row.productId];
      if (raw !== undefined && raw !== '') {
        const parsed = parseFloat(raw);
        if (!Number.isNaN(parsed)) {
          checkedCount += 1;
          if (Math.abs(parsed - row.currentEndingStock) > 0.0001) {
            discrepancyCount += 1;
          }
        }
      }
    });
    return { checkedCount, discrepancyCount };
  }, [filteredRows, physicalCounts]);

  if (!isOpen) return null;

  const handleExportExcel = () => {
    sound.playTap();
    const sheetRows = filteredRows.map((row, idx) => {
      const rawPhysical = physicalCounts[row.productId];
      const physicalVal =
        rawPhysical !== undefined && rawPhysical !== '' && !Number.isNaN(parseFloat(rawPhysical))
          ? parseFloat(rawPhysical)
          : null;
      return {
        No: idx + 1,
        'SKU / Barcode': row.barcode,
        'Nama Produk': row.productName,
        Kategori: row.category,
        Satuan: row.baseUnit,
        'Est. Stok Awal Bulan': row.estimatedOpeningStock,
        'Stok Masuk (+)': row.stockInUnits,
        'Jumlah PO Masuk': row.poCount,
        'Stok Keluar (-)': row.stockOutUnits,
        'Transaksi Keluar': row.salesTxCount,
        'Penyesuaian Opname (+/-)': row.opnameAdjustmentUnits,
        'Netto Pergerakan': row.netMovementUnits,
        'Stok Sistem Kini': row.currentEndingStock,
        'Hitung Fisik Audit': physicalVal ?? '',
        'Selisih Audit (Fisik - Sistem)':
          physicalVal !== null ? physicalVal - row.currentEndingStock : '',
        'Valuasi Stok Akhir (Rp)': row.endingStockValuation,
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Pergerakan Stok Bulanan');
    const safeCat =
      categoryFilter === 'SEMUA' ? 'Semua' : categoryFilter.replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `Ringkasan-Stok-InOut-${movementData.monthKey}-${safeCat}.xlsx`);
    sound.playSuccessChime();
  };

  const handleExportPdf = async () => {
    sound.playTap();
    await generateMonthlyStockMovementPdf({
      data: movementData,
      storeSettings,
      auditorName,
      categoryFilter,
      onlyWithMovement,
    });
    sound.playSuccessChime();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 select-none overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="monthly-stock-movement-title"
    >
      <div className="bg-white rounded-3xl max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 shadow-2xl my-auto">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 border border-white/15 shrink-0">
              <Package className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h3
                id="monthly-stock-movement-title"
                className="text-base sm:text-lg font-black tracking-tight text-white"
              >
                Ringkasan Pergerakan Stok Bulanan (In / Out)
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Audit mutasi stok masuk PO, penjualan keluar, dan penyesuaian opname periode{' '}
                <strong className="text-white">{movementData.monthLabel}</strong> untuk verifikasi
                fisik gudang.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Ekspor PDF</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onClose();
              }}
              aria-label="Tutup modal ringkasan pergerakan stok"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
          {/* Month Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center bg-white border border-slate-200 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setMonthKey((prev) => shiftMonthKey(prev, -1));
                }}
                title="Bulan Sebelumnya"
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5 px-1.5">
                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                <input
                  type="month"
                  aria-label="Pilih Bulan Audit Stok"
                  value={monthKey}
                  onChange={(e) => {
                    if (e.target.value) setMonthKey(e.target.value);
                  }}
                  className="text-xs font-mono font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setMonthKey((prev) => shiftMonthKey(prev, 1));
                }}
                title="Bulan Berikutnya"
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setMonthKey(getCurrentMonthKey());
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer whitespace-nowrap ${
                monthKey === getCurrentMonthKey()
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Bulan Ini
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setMonthKey(shiftMonthKey(getCurrentMonthKey(), -1));
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer whitespace-nowrap ${
                monthKey === shiftMonthKey(getCurrentMonthKey(), -1)
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Bulan Lalu
            </button>
          </div>

          {/* Search, Category & Movement Filter */}
          <div className="flex flex-wrap items-center gap-2 flex-1 lg:justify-end">
            <div className="relative flex-1 min-w-[190px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari produk atau SKU..."
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                aria-label="Filter Kategori Pergerakan Stok"
                value={categoryFilter}
                onChange={(e) => {
                  sound.playTap();
                  setCategoryFilter(e.target.value);
                }}
                className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'SEMUA' ? 'Semua Kategori' : cat}
                  </option>
                ))}
              </select>
            </div>

            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={onlyWithMovement}
                onChange={(e) => {
                  sound.playTap();
                  setOnlyWithMovement(e.target.checked);
                }}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>Hanya yang bergerak ({movementData.activeMovedSkuCount})</span>
            </label>
          </div>
        </div>

        {/* Modal Body: KPI Cards + Audit Table */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* 4 Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-3.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                <span>Stok Masuk (PO)</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-lg sm:text-xl font-black text-emerald-800 font-mono tabular-nums mt-1">
                +{formatNumber(movementData.totalStockInUnits)} Unit
              </div>
              <div className="text-[11px] text-emerald-700 mt-0.5 tabular-nums">
                {formatNumber(movementData.totalCompletedPoCount)} PO selesai ·{' '}
                {formatRupiah(movementData.totalStockInValue)}
              </div>
            </div>

            <div className="bg-sky-50/60 border border-sky-200 rounded-2xl p-3.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-sky-800 uppercase tracking-wider">
                <span>Stok Keluar (Terjual)</span>
                <TrendingDown className="w-4 h-4 text-sky-600" />
              </div>
              <div className="text-lg sm:text-xl font-black text-sky-800 font-mono tabular-nums mt-1">
                -{formatNumber(movementData.totalStockOutUnits)} Unit
              </div>
              <div className="text-[11px] text-sky-700 mt-0.5 tabular-nums">
                {formatNumber(movementData.totalSalesTxCount)} nota · HPP{' '}
                {formatRupiah(movementData.totalStockOutCogs)}
              </div>
            </div>

            <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-3.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                <span>Penyesuaian Opname</span>
                <ClipboardCheck className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-lg sm:text-xl font-black text-amber-900 font-mono tabular-nums mt-1">
                {movementData.totalOpnameNetUnits > 0 ? '+' : ''}
                {formatNumber(movementData.totalOpnameNetUnits)} Unit
              </div>
              <div className="text-[11px] text-amber-800 mt-0.5 tabular-nums">
                {formatNumber(movementData.totalOpnameSessionCount)} sesi ·{' '}
                {formatRupiah(movementData.totalOpnameNetValue)}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
              <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                Netto &amp; Valuasi Kini
              </div>
              <div
                className={`text-lg sm:text-xl font-black font-mono tabular-nums mt-1 ${
                  movementData.totalNetMovementUnits >= 0 ? 'text-slate-900' : 'text-rose-700'
                }`}
              >
                {movementData.totalNetMovementUnits > 0 ? '+' : ''}
                {formatNumber(movementData.totalNetMovementUnits)} Unit
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                Nilai Stok: {formatRupiah(movementData.totalEndingValuation)}
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10.5px] border-b border-slate-200 tracking-wider">
                  <tr>
                    <th className="py-3 px-3 text-center w-10">No</th>
                    <th className="py-3 px-3">Produk &amp; SKU</th>
                    <th className="py-3 px-3 text-right">Est. Awal</th>
                    <th className="py-3 px-3 text-right text-emerald-700">Masuk (+)</th>
                    <th className="py-3 px-3 text-right text-sky-700">Keluar (−)</th>
                    <th className="py-3 px-3 text-right text-amber-700">Opname (±)</th>
                    <th className="py-3 px-3 text-right">Netto Bln</th>
                    <th className="py-3 px-3 text-right">Stok Sistem</th>
                    <th className="py-3 px-3 text-right">Cek Fisik (Opsional)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400">
                        Tidak ada produk dengan filter yang dipilih pada periode {movementData.monthLabel}.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, idx) => {
                      const rawInput = physicalCounts[row.productId] ?? '';
                      const parsedPhysical =
                        rawInput !== '' && !Number.isNaN(parseFloat(rawInput))
                          ? parseFloat(rawInput)
                          : null;
                      const physicalDiff =
                        parsedPhysical !== null ? parsedPhysical - row.currentEndingStock : null;

                      return (
                        <tr
                          key={row.productId}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            physicalDiff !== null && Math.abs(physicalDiff) > 0.0001
                              ? 'bg-amber-50/50'
                              : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{row.productName}</div>
                            <div className="text-[10.5px] text-slate-500 font-mono">
                              {row.barcode} · {row.category}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                            {formatNumber(row.estimatedOpeningStock)} {row.baseUnit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            <div
                              className={`font-bold ${
                                row.stockInUnits > 0 ? 'text-emerald-700' : 'text-slate-400'
                              }`}
                            >
                              {row.stockInUnits > 0 ? `+${formatNumber(row.stockInUnits)}` : '0'}
                            </div>
                            {row.poCount > 0 && (
                              <div className="text-[10px] text-slate-400">{row.poCount} PO</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            <div
                              className={`font-bold ${
                                row.stockOutUnits > 0 ? 'text-sky-700' : 'text-slate-400'
                              }`}
                            >
                              {row.stockOutUnits > 0 ? `-${formatNumber(row.stockOutUnits)}` : '0'}
                            </div>
                            {row.salesTxCount > 0 && (
                              <div className="text-[10px] text-slate-400">{row.salesTxCount} nota</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            <div
                              className={`font-bold ${
                                row.opnameAdjustmentUnits > 0
                                  ? 'text-emerald-700'
                                  : row.opnameAdjustmentUnits < 0
                                  ? 'text-rose-700'
                                  : 'text-slate-400'
                              }`}
                            >
                              {row.opnameAdjustmentUnits > 0 ? '+' : ''}
                              {formatNumber(row.opnameAdjustmentUnits)}
                            </div>
                            {row.opnameCount > 0 && (
                              <div className="text-[10px] text-slate-400">{row.opnameCount} sesi</div>
                            )}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono font-bold tabular-nums ${
                              row.netMovementUnits > 0
                                ? 'text-emerald-700'
                                : row.netMovementUnits < 0
                                ? 'text-rose-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {row.netMovementUnits > 0 ? '+' : ''}
                            {formatNumber(row.netMovementUnits)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            <div className="font-bold text-slate-900">
                              {formatNumber(row.currentEndingStock)} {row.baseUnit}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {formatRupiah(row.endingStockValuation)}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="inline-flex flex-col items-end gap-0.5">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={rawInput}
                                onChange={(e) =>
                                  setPhysicalCounts((prev) => ({
                                    ...prev,
                                    [row.productId]: e.target.value,
                                  }))
                                }
                                placeholder={String(row.currentEndingStock)}
                                aria-label={`Hitung fisik ${row.productName}`}
                                className="w-20 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-sky-500 text-right font-mono font-bold text-xs text-slate-900 focus:outline-none"
                              />
                              {physicalDiff !== null && (
                                <span
                                  className={`text-[10px] font-mono font-bold ${
                                    Math.abs(physicalDiff) <= 0.0001
                                      ? 'text-emerald-700'
                                      : physicalDiff > 0
                                      ? 'text-sky-700'
                                      : 'text-rose-700'
                                  }`}
                                >
                                  {Math.abs(physicalDiff) <= 0.0001
                                    ? 'Cocok'
                                    : `Selisih ${physicalDiff > 0 ? '+' : ''}${formatNumber(
                                        physicalDiff
                                      )}`}
                                </span>
                              )}
                            </div>
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

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 text-xs">
          <div className="text-slate-600 tabular-nums">
            Menampilkan <strong>{formatNumber(filteredRows.length)}</strong> SKU untuk periode{' '}
            <strong>{movementData.monthLabel}</strong>
            {checkedPhysicalSummary.checkedCount > 0 && (
              <span className="ml-2 text-slate-800">
                · Dicek fisik: <strong>{checkedPhysicalSummary.checkedCount}</strong> SKU (
                <span
                  className={
                    checkedPhysicalSummary.discrepancyCount > 0
                      ? 'text-rose-700 font-bold'
                      : 'text-emerald-700 font-bold'
                  }
                >
                  {checkedPhysicalSummary.discrepancyCount} selisih
                </span>
                )
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {onStartOpnameSession && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  onClose();
                  onStartOpnameSession();
                }}
                className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>Buka Sesi Stock Opname</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onClose();
              }}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
